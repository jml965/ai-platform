import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { pageViewsTable, projectsTable } from "@workspace/db/schema";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { requireProjectAccess } from "../middlewares/permissions";

const router: IRouter = Router();

function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  let browser = "Unknown";
  let os = "Unknown";
  let device = "Desktop";

  if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  if (ua.includes("iPhone")) os = "iOS";
  else if (ua.includes("iPad")) os = "iPadOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  if (ua.includes("iPad")) device = "Tablet";
  else if (ua.includes("Tablet")) device = "Tablet";
  else if (ua.includes("Mobile") || ua.includes("iPhone") || ua.includes("Android")) device = "Mobile";

  return { browser, os, device };
}

function getPeriodDate(period: string): Date {
  const now = new Date();
  const days = period === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.post("/analytics/track", async (req, res) => {
  try {
    const { projectId, path, referrer, visitorId, sessionId } = req.body;

    if (!projectId || !UUID_RE.test(projectId)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "Valid projectId is required" } });
      return;
    }

    const trackPath = typeof path === "string" ? path.slice(0, 500) : "/";
    const trackReferrer = typeof referrer === "string" ? referrer.slice(0, 1000) : null;

    const [project] = await db
      .select({ id: projectsTable.id })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Project not found" } });
      return;
    }

    const userAgent = req.headers["user-agent"] || "";
    const { browser, os, device } = parseUserAgent(userAgent);

    let refSource = trackReferrer;
    if (refSource) {
      try {
        const url = new URL(refSource);
        refSource = url.hostname;
      } catch {
        refSource = trackReferrer;
      }
    }

    await db.insert(pageViewsTable).values({
      projectId,
      path: trackPath,
      referrer: refSource,
      userAgent,
      browser,
      os,
      device,
      language: req.headers["accept-language"]?.split(",")[0] || null,
      sessionId: sessionId || null,
      visitorId: visitorId || null,
    });

    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to track page view" } });
  }
});

router.get("/projects/:projectId/analytics/summary", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const { projectId } = req.params;
    const period = (req.query.period as string) || "30d";
    const since = getPeriodDate(period);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [totalResult] = await db
      .select({
        totalViews: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct ${pageViewsTable.visitorId})::int`,
      })
      .from(pageViewsTable)
      .where(and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, since)));

    const [todayResult] = await db
      .select({
        todayViews: sql<number>`count(*)::int`,
        todayVisitors: sql<number>`count(distinct ${pageViewsTable.visitorId})::int`,
      })
      .from(pageViewsTable)
      .where(and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, todayStart)));

    const days = period === "7d" ? 7 : 30;
    const totalViews = totalResult?.totalViews || 0;
    const uniqueVisitors = totalResult?.uniqueVisitors || 0;

    const singlePageSessions = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(
        db
          .select({
            sessionId: pageViewsTable.sessionId,
            pageCount: sql<number>`count(*)::int`,
          })
          .from(pageViewsTable)
          .where(and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, since)))
          .groupBy(pageViewsTable.sessionId)
          .having(sql`count(*) = 1`)
          .as("single_sessions")
      );

    const totalSessions = await db
      .select({
        count: sql<number>`count(distinct ${pageViewsTable.sessionId})::int`,
      })
      .from(pageViewsTable)
      .where(and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, since)));

    const totalSessionCount = totalSessions[0]?.count || 1;
    const singleSessionCount = singlePageSessions[0]?.count || 0;
    const bounceRate = totalSessionCount > 0 ? Math.round((singleSessionCount / totalSessionCount) * 100) : 0;

    res.json({
      totalViews,
      uniqueVisitors,
      todayViews: todayResult?.todayViews || 0,
      todayVisitors: todayResult?.todayVisitors || 0,
      avgViewsPerDay: Math.round(totalViews / days),
      bounceRate,
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to fetch analytics summary" } });
  }
});

router.get("/projects/:projectId/analytics/daily", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const { projectId } = req.params;
    const period = (req.query.period as string) || "30d";
    const since = getPeriodDate(period);

    const daily = await db
      .select({
        date: sql<string>`to_char(${pageViewsTable.createdAt}, 'YYYY-MM-DD')`,
        views: sql<number>`count(*)::int`,
        visitors: sql<number>`count(distinct ${pageViewsTable.visitorId})::int`,
      })
      .from(pageViewsTable)
      .where(and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, since)))
      .groupBy(sql`to_char(${pageViewsTable.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${pageViewsTable.createdAt}, 'YYYY-MM-DD')`);

    const days = period === "7d" ? 7 : 30;
    const result: { date: string; views: number; visitors: number }[] = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split("T")[0];
      const found = daily.find((r) => r.date === dateStr);
      result.push({
        date: dateStr,
        views: found?.views || 0,
        visitors: found?.visitors || 0,
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to fetch daily stats" } });
  }
});

router.get("/projects/:projectId/analytics/pages", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const { projectId } = req.params;
    const period = (req.query.period as string) || "30d";
    const since = getPeriodDate(period);

    const pages = await db
      .select({
        path: pageViewsTable.path,
        views: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct ${pageViewsTable.visitorId})::int`,
      })
      .from(pageViewsTable)
      .where(and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, since)))
      .groupBy(pageViewsTable.path)
      .orderBy(desc(sql`count(*)`))
      .limit(20);

    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to fetch page stats" } });
  }
});

router.get("/projects/:projectId/analytics/sources", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const { projectId } = req.params;
    const period = (req.query.period as string) || "30d";
    const since = getPeriodDate(period);

    const sources = await db
      .select({
        source: sql<string>`coalesce(${pageViewsTable.referrer}, 'Direct')`,
        views: sql<number>`count(*)::int`,
      })
      .from(pageViewsTable)
      .where(and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, since)))
      .groupBy(sql`coalesce(${pageViewsTable.referrer}, 'Direct')`)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const totalViews = sources.reduce((sum, s) => sum + s.views, 0);

    res.json(
      sources.map((s) => ({
        source: s.source,
        views: s.views,
        percentage: totalViews > 0 ? Math.round((s.views / totalViews) * 100) : 0,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to fetch source stats" } });
  }
});

router.get("/projects/:projectId/analytics/devices", requireProjectAccess("project.view"), async (req, res) => {
  try {
    const { projectId } = req.params;
    const period = (req.query.period as string) || "30d";
    const since = getPeriodDate(period);

    const condition = and(eq(pageViewsTable.projectId, projectId), gte(pageViewsTable.createdAt, since));

    const [browsers, devices, osStats] = await Promise.all([
      db
        .select({
          name: pageViewsTable.browser,
          count: sql<number>`count(*)::int`,
        })
        .from(pageViewsTable)
        .where(condition)
        .groupBy(pageViewsTable.browser)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      db
        .select({
          name: pageViewsTable.device,
          count: sql<number>`count(*)::int`,
        })
        .from(pageViewsTable)
        .where(condition)
        .groupBy(pageViewsTable.device)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      db
        .select({
          name: pageViewsTable.os,
          count: sql<number>`count(*)::int`,
        })
        .from(pageViewsTable)
        .where(condition)
        .groupBy(pageViewsTable.os)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
    ]);

    const addPercentage = (items: { name: string | null; count: number }[]) => {
      const total = items.reduce((sum, i) => sum + i.count, 0);
      return items.map((i) => ({
        name: i.name || "Unknown",
        count: i.count,
        percentage: total > 0 ? Math.round((i.count / total) * 100) : 0,
      }));
    };

    res.json({
      browsers: addPercentage(browsers),
      devices: addPercentage(devices),
      os: addPercentage(osStats),
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to fetch device stats" } });
  }
});

export default router;
