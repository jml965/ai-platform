import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tokenUsageTable, usersTable, notificationsTable, projectsTable } from "@workspace/db/schema";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

const SEED_USER_ID = "00000000-0000-0000-0000-000000000001";

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function monthStartDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

router.get("/tokens/summary", async (_req, res) => {
  try {
    const today = todayDateStr();
    const monthStart = monthStartDateStr();

    const [todayRow] = await db
      .select({
        totalTokens: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput} + ${tokenUsageTable.tokensOutput})::int, 0)`,
        totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(
        and(
          eq(tokenUsageTable.userId, SEED_USER_ID),
          eq(tokenUsageTable.usageDate, today)
        )
      );

    const [monthRow] = await db
      .select({
        totalTokens: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput} + ${tokenUsageTable.tokensOutput})::int, 0)`,
        totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(
        and(
          eq(tokenUsageTable.userId, SEED_USER_ID),
          gte(tokenUsageTable.usageDate, monthStart)
        )
      );

    const [totalRow] = await db
      .select({
        totalTokens: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput} + ${tokenUsageTable.tokensOutput})::int, 0)`,
        totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(eq(tokenUsageTable.userId, SEED_USER_ID));

    const [user] = await db
      .select({ dailyLimitUsd: usersTable.dailyLimitUsd, monthlyLimitUsd: usersTable.monthlyLimitUsd })
      .from(usersTable)
      .where(eq(usersTable.id, SEED_USER_ID))
      .limit(1);

    const dailyLimit = parseFloat(user?.dailyLimitUsd ?? "5.0");
    const monthlyLimit = parseFloat(user?.monthlyLimitUsd ?? "50.0");
    const todayCost = parseFloat(todayRow?.totalCost ?? "0");
    const monthCost = parseFloat(monthRow?.totalCost ?? "0");

    return res.json({
      todayTokens: todayRow?.totalTokens ?? 0,
      todayCostUsd: todayCost,
      monthTokens: monthRow?.totalTokens ?? 0,
      monthCostUsd: monthCost,
      totalTokens: totalRow?.totalTokens ?? 0,
      totalCostUsd: parseFloat(totalRow?.totalCost ?? "0"),
      remainingDailyUsd: Math.max(0, dailyLimit - todayCost),
      remainingMonthlyUsd: Math.max(0, monthlyLimit - monthCost),
    });
  } catch (error) {
    console.error("Token summary error:", error);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get token summary" } });
  }
});

router.get("/tokens/usage", async (req, res) => {
  try {
    const { projectId, startDate, endDate, groupBy } = req.query;

    const conditions = [eq(tokenUsageTable.userId, SEED_USER_ID)];

    if (projectId && typeof projectId === "string") {
      conditions.push(eq(tokenUsageTable.projectId, projectId));
    }
    if (startDate && typeof startDate === "string") {
      conditions.push(gte(tokenUsageTable.usageDate, startDate));
    }
    if (endDate && typeof endDate === "string") {
      conditions.push(lte(tokenUsageTable.usageDate, endDate));
    }

    const whereClause = and(...conditions);

    if (groupBy === "day") {
      const rows = await db
        .select({
          date: tokenUsageTable.usageDate,
          tokensInput: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput})::int, 0)`,
          tokensOutput: sql<number>`coalesce(sum(${tokenUsageTable.tokensOutput})::int, 0)`,
          costUsd: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
        })
        .from(tokenUsageTable)
        .where(whereClause)
        .groupBy(tokenUsageTable.usageDate)
        .orderBy(tokenUsageTable.usageDate);

      const data = rows.map((r) => ({
        date: r.date,
        tokensInput: r.tokensInput,
        tokensOutput: r.tokensOutput,
        costUsd: parseFloat(r.costUsd),
      }));

      const totalTokens = data.reduce((s, d) => s + d.tokensInput + d.tokensOutput, 0);
      const totalCostUsd = data.reduce((s, d) => s + d.costUsd, 0);

      return res.json({ data, totalTokens, totalCostUsd });
    }

    if (groupBy === "project") {
      const rows = await db
        .select({
          projectId: tokenUsageTable.projectId,
          projectName: projectsTable.name,
          tokensInput: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput})::int, 0)`,
          tokensOutput: sql<number>`coalesce(sum(${tokenUsageTable.tokensOutput})::int, 0)`,
          costUsd: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
        })
        .from(tokenUsageTable)
        .leftJoin(projectsTable, eq(tokenUsageTable.projectId, projectsTable.id))
        .where(whereClause)
        .groupBy(tokenUsageTable.projectId, projectsTable.name);

      const data = rows.map((r) => ({
        projectId: r.projectId,
        projectName: r.projectName ?? "Unknown",
        tokensInput: r.tokensInput,
        tokensOutput: r.tokensOutput,
        costUsd: parseFloat(r.costUsd),
      }));

      const totalTokens = data.reduce((s, d) => s + d.tokensInput + d.tokensOutput, 0);
      const totalCostUsd = data.reduce((s, d) => s + d.costUsd, 0);

      return res.json({ data, totalTokens, totalCostUsd });
    }

    if (groupBy === "agent") {
      const rows = await db
        .select({
          agentType: tokenUsageTable.agentType,
          tokensInput: sql<number>`coalesce(sum(${tokenUsageTable.tokensInput})::int, 0)`,
          tokensOutput: sql<number>`coalesce(sum(${tokenUsageTable.tokensOutput})::int, 0)`,
          costUsd: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
        })
        .from(tokenUsageTable)
        .where(whereClause)
        .groupBy(tokenUsageTable.agentType);

      const data = rows.map((r) => ({
        agentType: r.agentType,
        tokensInput: r.tokensInput,
        tokensOutput: r.tokensOutput,
        costUsd: parseFloat(r.costUsd),
      }));

      const totalTokens = data.reduce((s, d) => s + d.tokensInput + d.tokensOutput, 0);
      const totalCostUsd = data.reduce((s, d) => s + d.costUsd, 0);

      return res.json({ data, totalTokens, totalCostUsd });
    }

    const rows = await db
      .select({
        id: tokenUsageTable.id,
        date: tokenUsageTable.usageDate,
        projectId: tokenUsageTable.projectId,
        agentType: tokenUsageTable.agentType,
        model: tokenUsageTable.model,
        tokensInput: tokenUsageTable.tokensInput,
        tokensOutput: tokenUsageTable.tokensOutput,
        costUsd: tokenUsageTable.costUsd,
        createdAt: tokenUsageTable.createdAt,
      })
      .from(tokenUsageTable)
      .where(whereClause)
      .orderBy(desc(tokenUsageTable.createdAt));

    const data = rows.map((r) => ({
      date: r.date,
      projectId: r.projectId,
      agentType: r.agentType,
      tokensInput: r.tokensInput,
      tokensOutput: r.tokensOutput,
      costUsd: parseFloat(r.costUsd),
    }));

    const totalTokens = data.reduce((s, d) => s + d.tokensInput + d.tokensOutput, 0);
    const totalCostUsd = data.reduce((s, d) => s + d.costUsd, 0);

    return res.json({ data, totalTokens, totalCostUsd });
  } catch (error) {
    console.error("Token usage error:", error);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get token usage" } });
  }
});

router.get("/tokens/limits", async (_req, res) => {
  try {
    const [user] = await db
      .select({
        dailyLimitUsd: usersTable.dailyLimitUsd,
        monthlyLimitUsd: usersTable.monthlyLimitUsd,
        perProjectLimitUsd: usersTable.perProjectLimitUsd,
      })
      .from(usersTable)
      .where(eq(usersTable.id, SEED_USER_ID))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    const dailyLimit = parseFloat(user.dailyLimitUsd ?? "5.0");
    const monthlyLimit = parseFloat(user.monthlyLimitUsd ?? "50.0");
    const perProjectLimit = user.perProjectLimitUsd ? parseFloat(user.perProjectLimitUsd) : undefined;

    const today = todayDateStr();
    const monthStart = monthStartDateStr();

    const [dailyRow] = await db
      .select({
        totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(
        and(
          eq(tokenUsageTable.userId, SEED_USER_ID),
          eq(tokenUsageTable.usageDate, today)
        )
      );

    const [monthlyRow] = await db
      .select({
        totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(
        and(
          eq(tokenUsageTable.userId, SEED_USER_ID),
          gte(tokenUsageTable.usageDate, monthStart)
        )
      );

    return res.json({
      dailyLimitUsd: dailyLimit,
      monthlyLimitUsd: monthlyLimit,
      perProjectLimitUsd: perProjectLimit,
      dailyUsedUsd: parseFloat(dailyRow?.totalCost ?? "0"),
      monthlyUsedUsd: parseFloat(monthlyRow?.totalCost ?? "0"),
    });
  } catch (error) {
    console.error("Token limits error:", error);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get token limits" } });
  }
});

router.patch("/tokens/limits", async (req, res) => {
  try {
    const { dailyLimitUsd, monthlyLimitUsd, perProjectLimitUsd } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (dailyLimitUsd !== undefined) {
      if (typeof dailyLimitUsd !== "number" || dailyLimitUsd < 0) {
        return res.status(400).json({ error: { code: "VALIDATION", message: "dailyLimitUsd must be a non-negative number" } });
      }
      updates.dailyLimitUsd = dailyLimitUsd.toFixed(4);
    }

    if (monthlyLimitUsd !== undefined) {
      if (typeof monthlyLimitUsd !== "number" || monthlyLimitUsd < 0) {
        return res.status(400).json({ error: { code: "VALIDATION", message: "monthlyLimitUsd must be a non-negative number" } });
      }
      updates.monthlyLimitUsd = monthlyLimitUsd.toFixed(4);
    }

    if (perProjectLimitUsd !== undefined) {
      if (perProjectLimitUsd !== null && (typeof perProjectLimitUsd !== "number" || perProjectLimitUsd < 0)) {
        return res.status(400).json({ error: { code: "VALIDATION", message: "perProjectLimitUsd must be a non-negative number or null" } });
      }
      updates.perProjectLimitUsd = perProjectLimitUsd === null ? null : perProjectLimitUsd.toFixed(4);
    }

    await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, SEED_USER_ID));

    const [user] = await db
      .select({
        dailyLimitUsd: usersTable.dailyLimitUsd,
        monthlyLimitUsd: usersTable.monthlyLimitUsd,
        perProjectLimitUsd: usersTable.perProjectLimitUsd,
      })
      .from(usersTable)
      .where(eq(usersTable.id, SEED_USER_ID))
      .limit(1);

    const today = todayDateStr();
    const monthStart = monthStartDateStr();

    const [dailyRow] = await db
      .select({
        totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(
        and(
          eq(tokenUsageTable.userId, SEED_USER_ID),
          eq(tokenUsageTable.usageDate, today)
        )
      );

    const [monthlyRow] = await db
      .select({
        totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
      })
      .from(tokenUsageTable)
      .where(
        and(
          eq(tokenUsageTable.userId, SEED_USER_ID),
          gte(tokenUsageTable.usageDate, monthStart)
        )
      );

    return res.json({
      dailyLimitUsd: parseFloat(user?.dailyLimitUsd ?? "5.0"),
      monthlyLimitUsd: parseFloat(user?.monthlyLimitUsd ?? "50.0"),
      perProjectLimitUsd: user?.perProjectLimitUsd ? parseFloat(user.perProjectLimitUsd) : undefined,
      dailyUsedUsd: parseFloat(dailyRow?.totalCost ?? "0"),
      monthlyUsedUsd: parseFloat(monthlyRow?.totalCost ?? "0"),
    });
  } catch (error) {
    console.error("Update token limits error:", error);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to update token limits" } });
  }
});

router.get("/tokens/notifications", async (_req, res) => {
  try {
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, SEED_USER_ID))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(50);

    return res.json({
      data: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        titleAr: n.titleAr,
        message: n.message,
        messageAr: n.messageAr,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Notifications error:", error);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get notifications" } });
  }
});

router.patch("/tokens/notifications/:notificationId/read", async (req, res) => {
  try {
    const { notificationId } = req.params;

    await db
      .update(notificationsTable)
      .set({ isRead: true })
      .where(
        and(
          eq(notificationsTable.id, notificationId),
          eq(notificationsTable.userId, SEED_USER_ID)
        )
      );

    return res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    console.error("Mark notification read error:", error);
    return res.status(500).json({ error: { code: "INTERNAL", message: "Failed to mark notification as read" } });
  }
});

export default router;
