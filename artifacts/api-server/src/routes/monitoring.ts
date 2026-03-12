import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  projectsTable,
  buildTasksTable,
  tokenUsageTable,
  executionLogsTable,
  qaReportsTable,
  sandboxInstancesTable,
} from "@workspace/db/schema";
import { sql, desc, gte, eq, and, count } from "drizzle-orm";

const router: IRouter = Router();

const SERVER_START_TIME = Date.now();

router.get("/monitoring/health", async (_req, res) => {
  try {
    const dbStart = Date.now();
    await db.execute(sql`SELECT 1`);
    const dbLatencyMs = Date.now() - dbStart;

    const mem = process.memoryUsage();

    res.json({
      status: "healthy",
      uptimeMs: Date.now() - SERVER_START_TIME,
      uptimeHours: Math.round((Date.now() - SERVER_START_TIME) / 3600000 * 10) / 10,
      database: {
        status: "connected",
        latencyMs: dbLatencyMs,
      },
      memory: {
        rssBytes: mem.rss,
        heapUsedBytes: mem.heapUsed,
        heapTotalBytes: mem.heapTotal,
        rssMb: Math.round(mem.rss / 1048576),
        heapUsedMb: Math.round(mem.heapUsed / 1048576),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      uptimeMs: Date.now() - SERVER_START_TIME,
      database: { status: "disconnected", error: String(error) },
      timestamp: new Date().toISOString(),
    });
  }
});

router.get("/monitoring/stats", async (_req, res) => {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [totalUsersRow] = await db.select({ cnt: count() }).from(usersTable);
    const [activeUsersRow] = await db
      .select({ cnt: sql<number>`count(DISTINCT ${projectsTable.userId})::int` })
      .from(projectsTable)
      .where(gte(projectsTable.updatedAt, last7d));

    const [totalProjectsRow] = await db.select({ cnt: count() }).from(projectsTable);

    const buildStatusRows = await db
      .select({ status: buildTasksTable.status, cnt: count() })
      .from(buildTasksTable)
      .groupBy(buildTasksTable.status);
    const totalBuilds = buildStatusRows.reduce((s, r) => s + r.cnt, 0);
    const completedBuilds = buildStatusRows.find((r) => r.status === "completed")?.cnt ?? 0;
    const failedBuilds = buildStatusRows.find((r) => r.status === "failed")?.cnt ?? 0;

    const [recentBuildsRow] = await db
      .select({ cnt: count() })
      .from(buildTasksTable)
      .where(gte(buildTasksTable.createdAt, last24h));

    const [tokenTotalRow] = await db
      .select({
        totalTokens: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput} + ${tokenUsageTable.tokensOutput})::bigint, 0)`,
        totalCostUsd: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable);

    const [token24hRow] = await db
      .select({
        totalTokens: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput} + ${tokenUsageTable.tokensOutput})::bigint, 0)`,
        totalCostUsd: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(gte(tokenUsageTable.createdAt, last24h));

    const [token30dRow] = await db
      .select({
        totalTokens: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput} + ${tokenUsageTable.tokensOutput})::bigint, 0)`,
        totalCostUsd: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(gte(tokenUsageTable.createdAt, last30d));

    const qaStatusRows = await db
      .select({ status: qaReportsTable.status, cnt: count() })
      .from(qaReportsTable)
      .groupBy(qaReportsTable.status);
    const totalQa = qaStatusRows.reduce((s, r) => s + r.cnt, 0);
    const passedQa = (qaStatusRows.find((r) => r.status === "passed")?.cnt ?? 0) +
      (qaStatusRows.find((r) => r.status === "warning")?.cnt ?? 0);

    const [activeSandboxRow] = await db
      .select({ cnt: count() })
      .from(sandboxInstancesTable)
      .where(eq(sandboxInstancesTable.status, "running"));

    res.json({
      users: {
        total: totalUsersRow?.cnt ?? 0,
        activeLastWeek: activeUsersRow?.cnt ?? 0,
      },
      projects: {
        total: totalProjectsRow?.cnt ?? 0,
      },
      builds: {
        total: totalBuilds,
        completed: completedBuilds,
        failed: failedBuilds,
        successRate: totalBuilds > 0 ? Math.round((completedBuilds / totalBuilds) * 100) : 0,
        last24h: recentBuildsRow?.cnt ?? 0,
      },
      tokens: {
        totalTokens: tokenTotalRow?.totalTokens ?? 0,
        totalCostUsd: parseFloat(tokenTotalRow?.totalCostUsd ?? "0"),
        last24hTokens: token24hRow?.totalTokens ?? 0,
        last24hCostUsd: parseFloat(token24hRow?.totalCostUsd ?? "0"),
        last30dTokens: token30dRow?.totalTokens ?? 0,
        last30dCostUsd: parseFloat(token30dRow?.totalCostUsd ?? "0"),
      },
      qa: {
        totalReports: totalQa,
        passRate: totalQa > 0 ? Math.round((passedQa / totalQa) * 100) : 0,
      },
      sandboxes: {
        active: activeSandboxRow?.cnt ?? 0,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Monitoring stats error:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get monitoring stats" } });
  }
});

router.get("/monitoring/performance", async (_req, res) => {
  try {
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const slowestTasks = await db
      .select({
        id: buildTasksTable.id,
        agentType: buildTasksTable.agentType,
        status: buildTasksTable.status,
        durationMs: buildTasksTable.durationMs,
        createdAt: buildTasksTable.createdAt,
        projectId: buildTasksTable.projectId,
      })
      .from(buildTasksTable)
      .where(
        and(
          gte(buildTasksTable.createdAt, last24h),
          sql`${buildTasksTable.durationMs} IS NOT NULL`
        )
      )
      .orderBy(desc(buildTasksTable.durationMs))
      .limit(10);

    const errorCounts = await db
      .select({
        agentType: buildTasksTable.agentType,
        errorMessage: buildTasksTable.errorMessage,
        cnt: count(),
      })
      .from(buildTasksTable)
      .where(
        and(
          eq(buildTasksTable.status, "failed"),
          gte(buildTasksTable.createdAt, last24h),
          sql`${buildTasksTable.errorMessage} IS NOT NULL`
        )
      )
      .groupBy(buildTasksTable.agentType, buildTasksTable.errorMessage)
      .orderBy(desc(count()))
      .limit(10);

    const [avgDurationRow] = await db
      .select({
        avgMs: sql<number>`coalesce(round(avg(${buildTasksTable.durationMs}))::int, 0)`,
        minMs: sql<number>`coalesce(min(${buildTasksTable.durationMs})::int, 0)`,
        maxMs: sql<number>`coalesce(max(${buildTasksTable.durationMs})::int, 0)`,
      })
      .from(buildTasksTable)
      .where(
        and(
          gte(buildTasksTable.createdAt, last24h),
          sql`${buildTasksTable.durationMs} IS NOT NULL`
        )
      );

    const agentPerformance = await db
      .select({
        agentType: buildTasksTable.agentType,
        avgMs: sql<number>`coalesce(round(avg(${buildTasksTable.durationMs}))::int, 0)`,
        totalTasks: count(),
        failedTasks: sql<number>`count(*) FILTER (WHERE ${buildTasksTable.status} = 'failed')::int`,
      })
      .from(buildTasksTable)
      .where(
        and(
          gte(buildTasksTable.createdAt, last24h),
          sql`${buildTasksTable.durationMs} IS NOT NULL`
        )
      )
      .groupBy(buildTasksTable.agentType);

    res.json({
      period: "last_24h",
      overview: {
        avgDurationMs: avgDurationRow?.avgMs ?? 0,
        minDurationMs: avgDurationRow?.minMs ?? 0,
        maxDurationMs: avgDurationRow?.maxMs ?? 0,
      },
      slowestTasks: slowestTasks.map((t) => ({
        id: t.id,
        agentType: t.agentType,
        status: t.status,
        durationMs: t.durationMs,
        projectId: t.projectId,
        createdAt: t.createdAt.toISOString(),
      })),
      commonErrors: errorCounts.map((e) => ({
        agentType: e.agentType,
        error: e.errorMessage,
        count: e.cnt,
      })),
      agentPerformance: agentPerformance.map((a) => ({
        agentType: a.agentType,
        avgDurationMs: a.avgMs,
        totalTasks: a.totalTasks,
        failedTasks: a.failedTasks,
        failureRate: a.totalTasks > 0 ? Math.round((a.failedTasks / a.totalTasks) * 100) : 0,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Monitoring performance error:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get performance data" } });
  }
});

router.get("/monitoring/alerts", async (_req, res) => {
  try {
    const alerts: Array<{ level: string; service: string; message: string; messageAr: string; timestamp: string }> = [];

    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      const dbLatency = Date.now() - dbStart;
      if (dbLatency > 1000) {
        alerts.push({
          level: "warning",
          service: "database",
          message: `Database response slow (${dbLatency}ms)`,
          messageAr: `استجابة قاعدة البيانات بطيئة (${dbLatency}ms)`,
          timestamp: new Date().toISOString(),
        });
      }
    } catch {
      alerts.push({
        level: "critical",
        service: "database",
        message: "Database connection failed",
        messageAr: "فشل الاتصال بقاعدة البيانات",
        timestamp: new Date().toISOString(),
      });
    }

    const mem = process.memoryUsage();
    const heapUsedPct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
    if (heapUsedPct > 90) {
      alerts.push({
        level: "critical",
        service: "api-server",
        message: `Memory usage critical: ${heapUsedPct}% heap used`,
        messageAr: `استخدام الذاكرة حرج: ${heapUsedPct}% من الكومة مستخدمة`,
        timestamp: new Date().toISOString(),
      });
    } else if (heapUsedPct > 75) {
      alerts.push({
        level: "warning",
        service: "api-server",
        message: `Memory usage high: ${heapUsedPct}% heap used`,
        messageAr: `استخدام الذاكرة مرتفع: ${heapUsedPct}% من الكومة مستخدمة`,
        timestamp: new Date().toISOString(),
      });
    }

    const last1h = new Date(Date.now() - 60 * 60 * 1000);
    const [recentFailsRow] = await db
      .select({ cnt: count() })
      .from(buildTasksTable)
      .where(
        and(
          eq(buildTasksTable.status, "failed"),
          gte(buildTasksTable.createdAt, last1h)
        )
      );
    const recentFails = recentFailsRow?.cnt ?? 0;
    if (recentFails > 10) {
      alerts.push({
        level: "critical",
        service: "build-engine",
        message: `High failure rate: ${recentFails} failed builds in the last hour`,
        messageAr: `نسبة فشل عالية: ${recentFails} عملية بناء فاشلة في الساعة الأخيرة`,
        timestamp: new Date().toISOString(),
      });
    } else if (recentFails > 5) {
      alerts.push({
        level: "warning",
        service: "build-engine",
        message: `Elevated failures: ${recentFails} failed builds in the last hour`,
        messageAr: `ارتفاع في الفشل: ${recentFails} عملية بناء فاشلة في الساعة الأخيرة`,
        timestamp: new Date().toISOString(),
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        level: "info",
        service: "system",
        message: "All systems operational",
        messageAr: "جميع الأنظمة تعمل بشكل طبيعي",
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      alerts,
      overallStatus: alerts.some((a) => a.level === "critical")
        ? "critical"
        : alerts.some((a) => a.level === "warning")
          ? "warning"
          : "healthy",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Monitoring alerts error:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get alerts" } });
  }
});

export default router;
