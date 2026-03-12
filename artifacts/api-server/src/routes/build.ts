import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { buildTasksTable, executionLogsTable, projectsTable, usersTable, teamMembersTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { StartBuildBody } from "@workspace/api-zod";
import { startBuild, cancelBuild, getActiveBuild, checkBuildLimits, getRunner } from "../lib/agents";
import type { RunnerOutput } from "../lib/agents";
import { getUserId, getUserTeamRole, hasPermission } from "../middlewares/permissions";

const router: IRouter = Router();

async function verifyProjectBuildAccess(userId: string, projectId: string, permission: "build.start" | "build.cancel" | "build.view") {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!project) return { allowed: false, project: null, reason: "Project not found" };

  if (project.userId === userId) return { allowed: true, project, reason: null };

  if (project.teamId) {
    const role = await getUserTeamRole(userId, project.teamId);
    if (role && hasPermission(role, permission)) {
      return { allowed: true, project, reason: null };
    }
  }

  return { allowed: false, project: null, reason: "Access denied" };
}

router.post("/build/start", async (req, res) => {
  try {
    const userId = getUserId(req);
    const body = StartBuildBody.parse(req.body);

    const access = await verifyProjectBuildAccess(userId, body.projectId, "build.start");
    if (!access.allowed || !access.project) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: access.reason || "Access denied" } });
      return;
    }

    const project = access.project;

    if (project.status === "building") {
      res.status(409).json({ error: { code: "BUILD_IN_PROGRESS", message: "A build is already in progress for this project" } });
      return;
    }

    const limitResult = await checkBuildLimits(project.userId, body.projectId);
    if (!limitResult.allowed) {
      res.status(429).json({
        error: {
          code: "TOKEN_LIMIT_REACHED",
          message: limitResult.reason || "Spending limit reached",
          message_ar: limitResult.reasonAr,
        },
      });
      return;
    }

    const [userRecord] = await db
      .select({ creditBalanceUsd: usersTable.creditBalanceUsd })
      .from(usersTable)
      .where(eq(usersTable.id, project.userId))
      .limit(1);

    const creditBalance = parseFloat(userRecord?.creditBalanceUsd ?? "0");
    if (creditBalance <= 0) {
      res.status(402).json({
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "Insufficient credits. Please top up your balance to start a build.",
          message_ar: "رصيد غير كافٍ. يرجى تعبئة رصيدك لبدء البناء.",
          topupUrl: "/billing",
        },
      });
      return;
    }

    const buildId = await startBuild(body.projectId, project.userId, body.prompt);

    res.status(202).json({
      buildId,
      projectId: body.projectId,
      status: "pending",
      tasksTotal: 0,
      tasksCompleted: 0,
      totalTokensUsed: 0,
      totalCostUsd: 0,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(400).json({ error: { code: "VALIDATION", message: "Invalid build request" } });
  }
});

router.get("/build/:buildId/status", async (req, res) => {
  try {
    const { buildId } = req.params;
    const activeBuild = getActiveBuild(buildId);

    const tasks = await db
      .select()
      .from(buildTasksTable)
      .where(eq(buildTasksTable.buildId, buildId));

    const tasksTotal = tasks.length;
    const tasksCompleted = tasks.filter((t) => t.status === "completed").length;
    const totalTokensUsed = tasks.reduce((sum, t) => sum + (t.tokensUsed ?? 0), 0);
    const totalCostUsd = tasks.reduce((sum, t) => sum + (Number(t.costUsd) || 0), 0);

    let status: string;
    if (activeBuild) {
      status = activeBuild.status;
    } else if (tasks.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Build not found" } });
      return;
    } else if (tasks.some((t) => t.status === "in_progress")) {
      status = "in_progress";
    } else if (tasks.every((t) => t.status === "completed")) {
      status = "completed";
    } else if (tasks.some((t) => t.status === "failed")) {
      status = "failed";
    } else {
      status = "pending";
    }

    const projectId = tasks[0]?.projectId ?? activeBuild?.projectId ?? "";

    if (projectId) {
      const userId = getUserId(req);
      const access = await verifyProjectBuildAccess(userId, projectId, "build.view");
      if (!access.allowed) {
        res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
        return;
      }
    }

    res.json({
      buildId,
      projectId,
      status,
      tasksTotal,
      tasksCompleted,
      totalTokensUsed,
      totalCostUsd,
      createdAt: tasks[0]?.createdAt?.toISOString() ?? new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get build status" } });
  }
});

router.post("/build/:buildId/cancel", async (req, res) => {
  try {
    const { buildId } = req.params;
    const activeBuild = getActiveBuild(buildId);

    if (activeBuild?.projectId) {
      const userId = getUserId(req);
      const access = await verifyProjectBuildAccess(userId, activeBuild.projectId, "build.cancel");
      if (!access.allowed) {
        res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
        return;
      }
    }

    const cancelled = cancelBuild(buildId);

    if (!cancelled) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No active build found or build already finished" } });
      return;
    }

    res.json({ success: true, message: "Build cancellation requested" });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to cancel build" } });
  }
});

router.get("/build/:buildId/logs", async (req, res) => {
  try {
    const { buildId } = req.params;

    const [firstTask] = await db
      .select({ projectId: buildTasksTable.projectId })
      .from(buildTasksTable)
      .where(eq(buildTasksTable.buildId, buildId))
      .limit(1);

    if (firstTask?.projectId) {
      const userId = getUserId(req);
      const access = await verifyProjectBuildAccess(userId, firstTask.projectId, "build.view");
      if (!access.allowed) {
        res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
        return;
      }
    }

    const logs = await db
      .select()
      .from(executionLogsTable)
      .where(eq(executionLogsTable.buildId, buildId))
      .orderBy(executionLogsTable.createdAt);

    res.json({
      data: logs.map((log) => ({
        id: log.id,
        projectId: log.projectId,
        taskId: log.taskId,
        agentType: log.agentType,
        action: log.action,
        status: log.status,
        details: log.details,
        tokensUsed: log.tokensUsed ?? 0,
        durationMs: log.durationMs,
        createdAt: log.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get build logs" } });
  }
});

router.get("/build/:buildId/runner/stream", async (req, res) => {
  try {
    const { buildId } = req.params;
    const userId = getUserId(req);
    const activeBuild = getActiveBuild(buildId);

    let projectId = activeBuild?.projectId;
    if (!projectId) {
      const [firstTask] = await db
        .select({ projectId: buildTasksTable.projectId })
        .from(buildTasksTable)
        .where(eq(buildTasksTable.buildId, buildId))
        .limit(1);
      projectId = firstTask?.projectId;
    }

    if (projectId) {
      const access = await verifyProjectBuildAccess(userId, projectId, "build.view");
      if (!access.allowed) {
        res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
        return;
      }
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write("data: " + JSON.stringify({ type: "info", message: "Connected to runner stream", timestamp: new Date().toISOString() }) + "\n\n");

    const runner = getRunner(buildId);
    if (!runner) {
      res.write("data: " + JSON.stringify({ type: "info", message: "No active runner for this build. Waiting...", timestamp: new Date().toISOString() }) + "\n\n");
    }

    const onOutput = (output: RunnerOutput) => {
      if (!res.writableEnded) {
        res.write("data: " + JSON.stringify(output) + "\n\n");
      }
    };

    let currentRunner = runner;
    let unsubscribe: (() => void) | null = null;
    if (currentRunner) {
      unsubscribe = currentRunner.onOutput(onOutput);

      const status = currentRunner.getStatus();
      res.write("data: " + JSON.stringify({ type: "info", message: `Runner status: ${status.phase}, project: ${status.projectType}`, timestamp: new Date().toISOString() }) + "\n\n");
    }

    const pollInterval = setInterval(() => {
      if (!currentRunner) {
        const newRunner = getRunner(buildId);
        if (newRunner) {
          currentRunner = newRunner;
          unsubscribe = currentRunner.onOutput(onOutput);
          res.write("data: " + JSON.stringify({ type: "info", message: "Runner attached", timestamp: new Date().toISOString() }) + "\n\n");
        }
      }

      if (currentRunner) {
        const status = currentRunner.getStatus();
        const terminalPhases = ["failed", "stopped", "idle"];
        if (terminalPhases.includes(status.phase)) {
          if (!res.writableEnded) {
            res.write("data: " + JSON.stringify({ type: "info", message: `Runner finished: ${status.phase}`, timestamp: new Date().toISOString() }) + "\n\n");
            res.end();
          }
          clearInterval(pollInterval);
          clearInterval(keepAlive);
        }
      }

      const build = getActiveBuild(buildId);
      if (build && (build.status === "completed" || build.status === "failed" || build.status === "cancelled")) {
        if (!res.writableEnded) {
          res.write("data: " + JSON.stringify({ type: "info", message: `Build finished: ${build.status}`, timestamp: new Date().toISOString() }) + "\n\n");
          res.end();
        }
        clearInterval(pollInterval);
        clearInterval(keepAlive);
      }
    }, 2000);

    const keepAlive = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": keepalive\n\n");
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(pollInterval);
      clearInterval(keepAlive);
      if (unsubscribe) {
        unsubscribe();
      }
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: { code: "INTERNAL", message: "Failed to stream runner output" } });
    }
  }
});

router.get("/build/:buildId/runner/status", async (req, res) => {
  try {
    const { buildId } = req.params;
    const userId = getUserId(req);
    const activeBuild = getActiveBuild(buildId);

    let projectId = activeBuild?.projectId;
    if (!projectId) {
      const [firstTask] = await db
        .select({ projectId: buildTasksTable.projectId })
        .from(buildTasksTable)
        .where(eq(buildTasksTable.buildId, buildId))
        .limit(1);
      projectId = firstTask?.projectId;
    }

    if (projectId) {
      const access = await verifyProjectBuildAccess(userId, projectId, "build.view");
      if (!access.allowed) {
        res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
        return;
      }
    }

    const runner = getRunner(buildId);
    if (!runner) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No active runner for this build" } });
      return;
    }

    res.json({ data: runner.getStatus() });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get runner status" } });
  }
});

export default router;
