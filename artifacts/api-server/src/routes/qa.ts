import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { qaReportsTable, buildTasksTable, projectsTable } from "@workspace/db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";
import { getUserId, requireProjectAccess } from "../middlewares/permissions";
import { runQaWithRetry } from "../lib/agents";

const router: IRouter = Router();

router.get("/projects/:projectId/qa", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const { projectId } = req.params;

    const reports = await db
      .select()
      .from(qaReportsTable)
      .where(eq(qaReportsTable.projectId, projectId))
      .orderBy(desc(qaReportsTable.createdAt))
      .limit(10);

    res.json({
      data: reports.map(mapQaReport),
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to list QA reports" } });
  }
});

router.get("/projects/:projectId/qa/latest", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const { projectId } = req.params;

    const [report] = await db
      .select()
      .from(qaReportsTable)
      .where(eq(qaReportsTable.projectId, projectId))
      .orderBy(desc(qaReportsTable.createdAt))
      .limit(1);

    if (!report) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No QA report found" } });
      return;
    }

    res.json(mapQaReport(report));
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get QA report" } });
  }
});

router.get("/qa/:reportId", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { reportId } = req.params;

    const [report] = await db
      .select()
      .from(qaReportsTable)
      .where(eq(qaReportsTable.id, reportId))
      .limit(1);

    if (!report) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "QA report not found" } });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, report.projectId))
      .limit(1);

    if (!project || project.userId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      return;
    }

    res.json(mapQaReport(report));
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get QA report" } });
  }
});

router.post("/projects/:projectId/qa/run", requireProjectAccess("project.edit"), async (req, res) => {
  try {
    const userId = getUserId(req);
    const { projectId } = req.params;
    const { buildId } = req.body;

    if (!buildId) {
      res.status(400).json({ error: { code: "VALIDATION", message: "buildId is required" } });
      return;
    }

    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }

    const reportId = await runQaWithRetry(buildId, projectId, userId);

    res.status(202).json({
      reportId,
      message: "QA pipeline started",
      messageAr: "بدأ خط أنابيب الجودة",
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to start QA pipeline" } });
  }
});

router.get("/qa/stats/summary", async (req, res) => {
  try {
    const userId = getUserId(req);

    const userProjectIds = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.userId, userId));

    const projectIds = userProjectIds.map((p) => p.id);

    if (projectIds.length === 0) {
      res.json({
        totalReports: 0,
        passRate: 0,
        statusBreakdown: { passed: 0, warning: 0, failed: 0 },
        averageScores: { overall: 0, lint: 0, runtime: 0, functional: 0 },
        averageDurationMs: 0,
      });
      return;
    }

    const allReports = await db
      .select({
        status: qaReportsTable.status,
        cnt: count(),
      })
      .from(qaReportsTable)
      .where(sql`${qaReportsTable.projectId} = ANY(${projectIds})`)
      .groupBy(qaReportsTable.status);

    const totalReports = allReports.reduce((sum, r) => sum + r.cnt, 0);
    const passedReports = allReports.find((r) => r.status === "passed")?.cnt ?? 0;
    const warningReports = allReports.find((r) => r.status === "warning")?.cnt ?? 0;
    const failedReports = allReports.find((r) => r.status === "failed")?.cnt ?? 0;

    const avgScoreResult = await db
      .select({
        avgScore: sql<number>`ROUND(AVG(${qaReportsTable.overallScore}))::int`,
        avgLint: sql<number>`ROUND(AVG(${qaReportsTable.lintScore}))::int`,
        avgRuntime: sql<number>`ROUND(AVG(${qaReportsTable.runtimeScore}))::int`,
        avgFunctional: sql<number>`ROUND(AVG(${qaReportsTable.functionalScore}))::int`,
        avgDuration: sql<number>`ROUND(AVG(${qaReportsTable.totalDurationMs}))::int`,
      })
      .from(qaReportsTable)
      .where(sql`${qaReportsTable.overallScore} IS NOT NULL AND ${qaReportsTable.projectId} = ANY(${projectIds})`);

    const avg = avgScoreResult[0];

    const recentReports = await db
      .select({
        lintDetails: qaReportsTable.lintDetails,
        runtimeDetails: qaReportsTable.runtimeDetails,
        functionalDetails: qaReportsTable.functionalDetails,
      })
      .from(qaReportsTable)
      .where(sql`${qaReportsTable.projectId} = ANY(${projectIds}) AND ${qaReportsTable.status} IN ('failed', 'warning')`)
      .orderBy(desc(qaReportsTable.createdAt))
      .limit(20);

    const errorCounts: Record<string, number> = {};
    for (const r of recentReports) {
      const phases = [r.lintDetails, r.runtimeDetails, r.functionalDetails];
      for (const phase of phases) {
        const details = phase as { checks?: Array<{ passed: boolean; severity: string; name: string }> } | null;
        if (details?.checks) {
          for (const check of details.checks) {
            if (!check.passed && (check.severity === "error" || check.severity === "warning")) {
              errorCounts[check.name] = (errorCounts[check.name] || 0) + 1;
            }
          }
        }
      }
    }

    const commonErrors = Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    res.json({
      totalReports,
      passRate: totalReports > 0 ? Math.round(((passedReports + warningReports) / totalReports) * 100) : 0,
      statusBreakdown: {
        passed: passedReports,
        warning: warningReports,
        failed: failedReports,
      },
      averageScores: {
        overall: avg?.avgScore ?? 0,
        lint: avg?.avgLint ?? 0,
        runtime: avg?.avgRuntime ?? 0,
        functional: avg?.avgFunctional ?? 0,
      },
      averageDurationMs: avg?.avgDuration ?? 0,
      commonErrors,
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get QA stats" } });
  }
});

function mapQaReport(r: typeof qaReportsTable.$inferSelect) {
  return {
    id: r.id,
    projectId: r.projectId,
    buildId: r.buildId,
    status: r.status,
    overallScore: r.overallScore,
    lint: {
      status: r.lintStatus,
      score: r.lintScore,
      details: r.lintDetails,
    },
    runtime: {
      status: r.runtimeStatus,
      score: r.runtimeScore,
      details: r.runtimeDetails,
    },
    functional: {
      status: r.functionalStatus,
      score: r.functionalScore,
      details: r.functionalDetails,
    },
    retryCount: r.retryCount,
    maxRetries: r.maxRetries,
    fixAttempts: r.fixAttempts,
    totalDurationMs: r.totalDurationMs,
    totalCostUsd: Number(r.totalCostUsd) || 0,
    createdAt: r.createdAt.toISOString(),
    completedAt: r.completedAt?.toISOString() ?? null,
  };
}

export default router;
