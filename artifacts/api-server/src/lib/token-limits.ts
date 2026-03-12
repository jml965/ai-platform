import { db } from "@workspace/db";
import { tokenUsageTable, usersTable, projectsTable, notificationsTable } from "@workspace/db/schema";
import { eq, sql, and, gte } from "drizzle-orm";

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  reasonAr?: string;
  dailyUsedUsd: number;
  monthlyUsedUsd: number;
  projectUsedUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  perProjectLimitUsd: number | null;
}

function todayDateStr(): string {
  return new Date().toISOString().split("T")[0];
}

function monthStartDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export async function checkSpendingLimits(
  userId: string,
  projectId: string
): Promise<LimitCheckResult> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    return {
      allowed: false,
      reason: "User not found",
      reasonAr: "المستخدم غير موجود",
      dailyUsedUsd: 0,
      monthlyUsedUsd: 0,
      projectUsedUsd: 0,
      dailyLimitUsd: 0,
      monthlyLimitUsd: 0,
      perProjectLimitUsd: null,
    };
  }

  const dailyLimit = parseFloat(user.dailyLimitUsd ?? "5.0");
  const monthlyLimit = parseFloat(user.monthlyLimitUsd ?? "50.0");
  const perProjectLimit = user.perProjectLimitUsd ? parseFloat(user.perProjectLimitUsd) : null;

  const today = todayDateStr();
  const monthStart = monthStartDateStr();

  const [dailyRow] = await db
    .select({
      totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
    })
    .from(tokenUsageTable)
    .where(
      and(
        eq(tokenUsageTable.userId, userId),
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
        eq(tokenUsageTable.userId, userId),
        gte(tokenUsageTable.usageDate, monthStart)
      )
    );

  const [projectRow] = await db
    .select({
      totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')`,
    })
    .from(tokenUsageTable)
    .where(
      and(
        eq(tokenUsageTable.userId, userId),
        eq(tokenUsageTable.projectId, projectId)
      )
    );

  const dailyUsed = parseFloat(dailyRow?.totalCost ?? "0");
  const monthlyUsed = parseFloat(monthlyRow?.totalCost ?? "0");
  const projectUsed = parseFloat(projectRow?.totalCost ?? "0");

  const result: LimitCheckResult = {
    allowed: true,
    dailyUsedUsd: dailyUsed,
    monthlyUsedUsd: monthlyUsed,
    projectUsedUsd: projectUsed,
    dailyLimitUsd: dailyLimit,
    monthlyLimitUsd: monthlyLimit,
    perProjectLimitUsd: perProjectLimit,
  };

  if (dailyUsed >= dailyLimit) {
    result.allowed = false;
    result.reason = `Daily spending limit reached ($${dailyLimit.toFixed(2)})`;
    result.reasonAr = `تم الوصول إلى الحد اليومي للإنفاق ($${dailyLimit.toFixed(2)})`;
  } else if (monthlyUsed >= monthlyLimit) {
    result.allowed = false;
    result.reason = `Monthly spending limit reached ($${monthlyLimit.toFixed(2)})`;
    result.reasonAr = `تم الوصول إلى الحد الشهري للإنفاق ($${monthlyLimit.toFixed(2)})`;
  } else if (perProjectLimit !== null && projectUsed >= perProjectLimit) {
    result.allowed = false;
    result.reason = `Project spending limit reached ($${perProjectLimit.toFixed(2)})`;
    result.reasonAr = `تم الوصول إلى حد إنفاق المشروع ($${perProjectLimit.toFixed(2)})`;
  }

  return result;
}

export async function checkAndNotifyLimits(
  userId: string,
  projectId: string,
  costJustAdded: number
): Promise<void> {
  const [user] = await db
    .select({
      dailyLimitUsd: usersTable.dailyLimitUsd,
      monthlyLimitUsd: usersTable.monthlyLimitUsd,
      perProjectLimitUsd: usersTable.perProjectLimitUsd,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return;

  const dailyLimit = parseFloat(user.dailyLimitUsd ?? "5.0");
  const monthlyLimit = parseFloat(user.monthlyLimitUsd ?? "50.0");
  const perProjectLimit = user.perProjectLimitUsd ? parseFloat(user.perProjectLimitUsd) : null;

  const today = todayDateStr();
  const monthStart = monthStartDateStr();

  const [[dailyRow], [monthlyRow], [projectRow]] = await Promise.all([
    db
      .select({ totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')` })
      .from(tokenUsageTable)
      .where(and(eq(tokenUsageTable.userId, userId), eq(tokenUsageTable.usageDate, today))),
    db
      .select({ totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')` })
      .from(tokenUsageTable)
      .where(and(eq(tokenUsageTable.userId, userId), gte(tokenUsageTable.usageDate, monthStart))),
    db
      .select({ totalCost: sql<string>`coalesce(sum(${tokenUsageTable.costUsd})::numeric(10,6), '0')` })
      .from(tokenUsageTable)
      .where(and(eq(tokenUsageTable.userId, userId), eq(tokenUsageTable.projectId, projectId))),
  ]);

  const dailyUsed = parseFloat(dailyRow?.totalCost ?? "0");
  const monthlyUsed = parseFloat(monthlyRow?.totalCost ?? "0");
  const projectUsed = parseFloat(projectRow?.totalCost ?? "0");

  const dailyPct = (dailyUsed / dailyLimit) * 100;
  const monthlyPct = (monthlyUsed / monthlyLimit) * 100;
  const dailyPctBefore = ((dailyUsed - costJustAdded) / dailyLimit) * 100;
  const monthlyPctBefore = ((monthlyUsed - costJustAdded) / monthlyLimit) * 100;

  if (dailyPct >= 100 && dailyPctBefore < 100) {
    await createNotification(userId, "limit_reached", {
      title: "Daily spending limit reached",
      titleAr: "تم الوصول إلى الحد اليومي",
      message: `You have reached your daily spending limit of $${dailyLimit.toFixed(2)}. No more builds can be started today.`,
      messageAr: `لقد وصلت إلى حد الإنفاق اليومي البالغ $${dailyLimit.toFixed(2)}. لا يمكن بدء المزيد من عمليات البناء اليوم.`,
    });
  } else if (dailyPct >= 80 && dailyPctBefore < 80) {
    await createNotification(userId, "limit_warning", {
      title: "Approaching daily spending limit",
      titleAr: "اقتراب من الحد اليومي",
      message: `You have used ${dailyPct.toFixed(0)}% of your daily spending limit ($${dailyUsed.toFixed(2)} of $${dailyLimit.toFixed(2)}).`,
      messageAr: `لقد استخدمت ${dailyPct.toFixed(0)}% من حد الإنفاق اليومي ($${dailyUsed.toFixed(2)} من $${dailyLimit.toFixed(2)}).`,
    });
  }

  if (monthlyPct >= 100 && monthlyPctBefore < 100) {
    await createNotification(userId, "limit_reached", {
      title: "Monthly spending limit reached",
      titleAr: "تم الوصول إلى الحد الشهري",
      message: `You have reached your monthly spending limit of $${monthlyLimit.toFixed(2)}. No more builds can be started this month.`,
      messageAr: `لقد وصلت إلى حد الإنفاق الشهري البالغ $${monthlyLimit.toFixed(2)}. لا يمكن بدء المزيد من عمليات البناء هذا الشهر.`,
    });
  } else if (monthlyPct >= 80 && monthlyPctBefore < 80) {
    await createNotification(userId, "limit_warning", {
      title: "Approaching monthly spending limit",
      titleAr: "اقتراب من الحد الشهري",
      message: `You have used ${monthlyPct.toFixed(0)}% of your monthly spending limit ($${monthlyUsed.toFixed(2)} of $${monthlyLimit.toFixed(2)}).`,
      messageAr: `لقد استخدمت ${monthlyPct.toFixed(0)}% من حد الإنفاق الشهري ($${monthlyUsed.toFixed(2)} من $${monthlyLimit.toFixed(2)}).`,
    });
  }

  if (perProjectLimit !== null) {
    const projectPct = (projectUsed / perProjectLimit) * 100;
    const projectPctBefore = ((projectUsed - costJustAdded) / perProjectLimit) * 100;

    if (projectPct >= 100 && projectPctBefore < 100) {
      await createNotification(userId, "limit_reached", {
        title: "Project spending limit reached",
        titleAr: "تم الوصول إلى حد إنفاق المشروع",
        message: `You have reached the per-project spending limit of $${perProjectLimit.toFixed(2)} for this project. No more builds can be started.`,
        messageAr: `لقد وصلت إلى حد إنفاق المشروع البالغ $${perProjectLimit.toFixed(2)}. لا يمكن بدء المزيد من عمليات البناء لهذا المشروع.`,
      });
    } else if (projectPct >= 80 && projectPctBefore < 80) {
      await createNotification(userId, "limit_warning", {
        title: "Approaching project spending limit",
        titleAr: "اقتراب من حد إنفاق المشروع",
        message: `You have used ${projectPct.toFixed(0)}% of the per-project spending limit ($${projectUsed.toFixed(2)} of $${perProjectLimit.toFixed(2)}).`,
        messageAr: `لقد استخدمت ${projectPct.toFixed(0)}% من حد إنفاق المشروع ($${projectUsed.toFixed(2)} من $${perProjectLimit.toFixed(2)}).`,
      });
    }
  }
}

async function getUserDailyLimit(userId: string): Promise<number> {
  const [user] = await db
    .select({ dailyLimitUsd: usersTable.dailyLimitUsd })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return parseFloat(user?.dailyLimitUsd ?? "5.0");
}

async function getUserMonthlyLimit(userId: string): Promise<number> {
  const [user] = await db
    .select({ monthlyLimitUsd: usersTable.monthlyLimitUsd })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return parseFloat(user?.monthlyLimitUsd ?? "50.0");
}

async function createNotification(
  userId: string,
  type: string,
  content: { title: string; titleAr: string; message: string; messageAr: string }
): Promise<void> {
  await db.insert(notificationsTable).values({
    userId,
    type,
    title: content.title,
    titleAr: content.titleAr,
    message: content.message,
    messageAr: content.messageAr,
  });
}
