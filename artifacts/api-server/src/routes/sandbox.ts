import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import {
  createSandbox,
  stopSandbox,
  restartSandbox,
  executeCommand,
  startServer,
  getSandboxStatus,
  getSandboxProjectId,
  getProjectSandbox,
  listUserSandboxes,
  subscribeSandboxOutput,
} from "../lib/sandbox/sandbox-manager";
import { getUserId } from "../middlewares/permissions";
import { db } from "@workspace/db";
import { projectsTable, teamMembersTable } from "@workspace/db/schema";
import { eq, or, inArray } from "drizzle-orm";

const router: IRouter = Router();

async function getUserProjectIds(userId: string): Promise<string[]> {
  const teamMemberships = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId));

  const teamIds = teamMemberships.map((m) => m.teamId);

  const accessCondition = teamIds.length > 0
    ? or(eq(projectsTable.userId, userId), inArray(projectsTable.teamId, teamIds))
    : eq(projectsTable.userId, userId);

  const projects = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(accessCondition!);

  return projects.map((p) => p.id);
}

async function requireSandboxAccess(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  const sandboxId = req.params.sandboxId as string;

  const projectId = getSandboxProjectId(sandboxId);
  if (!projectId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
    return;
  }

  const projectIds = await getUserProjectIds(userId);
  if (!projectIds.includes(projectId)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    return;
  }

  next();
}

async function requireProjectOwnership(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  const projectId = (req.body?.projectId || req.params?.projectId) as string;

  if (!projectId) {
    res.status(400).json({ error: { code: "VALIDATION", message: "projectId is required" } });
    return;
  }

  const projectIds = await getUserProjectIds(userId);
  if (!projectIds.includes(projectId)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    return;
  }

  next();
}

router.post("/sandbox", requireProjectOwnership, async (req, res) => {
  try {
    const { projectId, runtime = "node", memoryLimitMb = 256, timeoutSeconds = 300 } = req.body;

    if (!["node", "python"].includes(runtime)) {
      res.status(400).json({ error: { code: "VALIDATION", message: "runtime must be 'node' or 'python'" } });
      return;
    }

    const result = await createSandbox(projectId, runtime, memoryLimitMb, timeoutSeconds);
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create sandbox";
    const status = message.includes("Maximum") || message.includes("already has") ? 409 : 500;
    res.status(status).json({ error: { code: "SANDBOX_ERROR", message } });
  }
});

router.get("/sandbox", async (req, res) => {
  try {
    const userId = getUserId(req);
    const projectIds = await getUserProjectIds(userId);
    const sandboxes = listUserSandboxes(projectIds);
    res.json({ data: sandboxes, meta: { total: sandboxes.length, maxConcurrent: 10 } });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to list sandboxes" } });
  }
});

router.get("/sandbox/project/:projectId", requireProjectOwnership, async (req, res) => {
  try {
    const sandboxId = getProjectSandbox(req.params.projectId as string);
    if (!sandboxId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No active sandbox for this project" } });
      return;
    }

    const status = getSandboxStatus(sandboxId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get sandbox" } });
  }
});

router.get("/sandbox/:sandboxId", requireSandboxAccess, async (req, res) => {
  try {
    const sandboxId = req.params.sandboxId as string;
    const status = getSandboxStatus(sandboxId);
    if (!status) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
      return;
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get sandbox status" } });
  }
});

router.post("/sandbox/:sandboxId/execute", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const { command } = req.body;
    if (!command || typeof command !== "string") {
      res.status(400).json({ error: { code: "VALIDATION", message: "command is required" } });
      return;
    }

    const result = await executeCommand(id, command);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command execution failed";
    res.status(500).json({ error: { code: "EXECUTION_ERROR", message } });
  }
});

router.post("/sandbox/:sandboxId/start-server", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const { command } = req.body;
    if (!command || typeof command !== "string") {
      res.status(400).json({ error: { code: "VALIDATION", message: "command is required" } });
      return;
    }

    const result = await startServer(id, command);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start server";
    res.status(500).json({ error: { code: "SERVER_ERROR", message } });
  }
});

router.post("/sandbox/:sandboxId/stop", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    await stopSandbox(id);
    res.json({ success: true, message: "Sandbox stopped" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stop sandbox";
    res.status(500).json({ error: { code: "SANDBOX_ERROR", message } });
  }
});

router.post("/sandbox/:sandboxId/restart", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const { command } = req.body;
    const result = await restartSandbox(id, command);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restart sandbox";
    res.status(500).json({ error: { code: "SANDBOX_ERROR", message } });
  }
});

router.get("/sandbox/:sandboxId/logs", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const status = getSandboxStatus(id);
    if (!status) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
      return;
    }

    res.json({ sandboxId: id, logs: status.outputTail });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get logs" } });
  }
});

router.get("/sandbox/:sandboxId/stream", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const status = getSandboxStatus(id);
    if (!status) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`data: ${JSON.stringify({ type: "connected", sandboxId: id })}\n\n`);

    for (const line of status.outputTail) {
      res.write(`data: ${JSON.stringify({ type: "output", data: line })}\n\n`);
    }

    const unsubscribe = subscribeSandboxOutput(id, (data) => {
      res.write(`data: ${JSON.stringify({ type: "output", data })}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to stream output" } });
  }
});

export default router;
