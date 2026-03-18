import { Router, type IRouter } from "express";
import { getUserId } from "../middlewares/permissions";
import { runStrategicAgent, addToMemory, clearMemory } from "../lib/agents/strategic-agent";
import { db } from "@workspace/db";
import { agentConfigsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { startSurgicalFix, checkBuildLimits } from "../lib/agents/execution-engine";

const router: IRouter = Router();

const strategicSessions = new Map<string, { role: "user" | "assistant"; content: string }[]>();

router.post("/strategic/chat", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { projectId, message, sessionId } = req.body as {
      projectId: string;
      message: string;
      sessionId?: string;
    };

    if (!message?.trim()) {
      res.status(400).json({ error: { code: "VALIDATION", message: "Message is required" } });
      return;
    }

    if (!projectId) {
      res.status(400).json({ error: { code: "VALIDATION", message: "Project ID is required" } });
      return;
    }

    const [user] = await db.select({ creditBalanceUsd: usersTable.creditBalanceUsd })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const credits = parseFloat(user?.creditBalanceUsd ?? "0");
    if (credits <= 0) {
      res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: "Insufficient credits.", message_ar: "رصيد غير كافٍ." } });
      return;
    }

    const [config] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, "strategic")).limit(1);

    if (!config || !config.enabled) {
      res.status(503).json({ error: { code: "AGENT_DISABLED", message: "Strategic agent is disabled", message_ar: "الوكيل الاستراتيجي معطل" } });
      return;
    }

    const sKey = sessionId || `${userId}_${projectId}`;
    const history = strategicSessions.get(sKey) || [];

    const result = await runStrategicAgent(
      projectId,
      message,
      history,
      config.shortTermMemory || [],
      config.longTermMemory || []
    );

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: result.reply });
    if (history.length > 40) history.splice(0, history.length - 40);
    strategicSessions.set(sKey, history);

    const costUsd = result.cost;
    await db.update(usersTable).set({
      creditBalanceUsd: String(Math.max(0, credits - costUsd)),
    }).where(eq(usersTable.id, userId));

    await addToMemory("strategic", "short", {
      content: `Q: ${message.slice(0, 200)} | A: ${result.reply.slice(0, 300)}`,
      timestamp: new Date().toISOString(),
      context: projectId,
    });

    let fixResult: { success: boolean; fixedFiles: string[]; buildId?: string } | undefined;
    if (result.actions?.type === "fix" && result.actions.files.length > 0) {
      try {
        const limitCheck = await checkBuildLimits(userId, projectId);
        if (limitCheck.allowed) {
          console.log("[Strategic] Applying fixes:", result.actions.files);
          const fix = await startSurgicalFix(projectId, userId, message, result.actions.files);
          fixResult = { success: fix.success, fixedFiles: fix.fixedFiles, buildId: fix.buildId };
        }
      } catch (err) {
        console.error("[Strategic] Fix failed:", err);
      }
    }

    res.json({
      reply: result.reply,
      thinking: result.thinking,
      tokensUsed: result.tokensUsed,
      modelsUsed: result.modelsUsed,
      cost: costUsd,
      fixApplied: fixResult ? fixResult.success : false,
      fixedFiles: fixResult?.fixedFiles || [],
      fixBuildId: fixResult?.buildId,
    });
  } catch (error: any) {
    console.error("[Strategic] Chat error:", error);
    res.status(500).json({
      error: { code: "INTERNAL", message: error?.message || "Strategic agent failed", message_ar: "فشل الوكيل الاستراتيجي" },
    });
  }
});

router.get("/strategic/config", async (_req, res) => {
  try {
    const [config] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, "strategic")).limit(1);
    if (!config) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Strategic agent not configured" } });
      return;
    }
    res.json({
      enabled: config.enabled,
      governorEnabled: config.governorEnabled,
      tokenLimit: config.tokenLimit,
      modelsActive: [
        config.primaryModel,
        config.secondaryModel,
        config.tertiaryModel,
      ].filter(m => m && (m as any).enabled).length,
      totalTokensUsed: config.totalTokensUsed,
      totalTasks: config.totalTasksCompleted,
      totalCost: config.totalCostUsd,
      shortTermMemoryCount: (config.shortTermMemory || []).length,
      longTermMemoryCount: (config.longTermMemory || []).length,
    });
  } catch (error) {
    console.error("[Strategic] Config fetch error:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to fetch config" } });
  }
});

router.post("/strategic/memory/clear", async (req, res) => {
  try {
    const { type } = req.body as { type: "short" | "long" | "all" };
    await clearMemory("strategic", type || "all");
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to clear memory" } });
  }
});

router.delete("/strategic/session/:sessionId", (req, res) => {
  strategicSessions.delete(req.params.sessionId);
  res.json({ success: true });
});

export default router;
