import { Router, type IRouter } from "express";
import { getUserId } from "../middlewares/permissions";
import { runStrategicAgent, streamStrategicAgent, addToMemory, clearMemory } from "../lib/agents/strategic-agent";
import { db } from "@workspace/db";
import { agentConfigsTable, usersTable, strategicThreadsTable, strategicMessagesTable } from "@workspace/db/schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";
import { startSurgicalFix, checkBuildLimits } from "../lib/agents/execution-engine";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

function translateErrorReason(reason: string): string {
  if (reason.includes("Timeout after")) {
    const match = reason.match(/Timeout after (\d+)s/);
    const secs = match ? match[1] : "?";
    return `انتهت المهلة الزمنية (${secs} ثانية). حاول تقليل حجم الرسالة أو زيادة المهلة من الإعدادات.`;
  }
  if (reason.includes("overloaded") || reason.includes("529")) {
    return "الخادم مشغول حالياً. يرجى المحاولة بعد قليل.";
  }
  if (reason.includes("rate_limit") || reason.includes("429")) {
    return "تم تجاوز حد الطلبات. يرجى الانتظار قليلاً والمحاولة مجدداً.";
  }
  if (reason.includes("authentication") || reason.includes("401") || reason.includes("invalid.*key")) {
    return "خطأ في مفتاح API. تحقق من صحة المفتاح في الإعدادات.";
  }
  if (reason.includes("No enabled models")) {
    return "لا يوجد نموذج مفعّل. فعّل نموذجاً واحداً على الأقل من إعدادات الوكيل.";
  }
  if (reason.includes("empty response")) {
    return "النموذج أرجع رداً فارغاً. حاول مرة أخرى.";
  }
  if (reason.includes("INSUFFICIENT_CREDITS") || reason.includes("insufficient")) {
    return "رصيد غير كافٍ.";
  }
  return `فشل الوكيل: ${reason}`;
}

const router: IRouter = Router();

const DEFAULT_AGENTS: Record<string, any> = {
  planner: {
    primaryModel: { provider: "openai", model: "o3", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: "You are a senior software architect AI. Your job is to analyze a project request and produce a structured project plan BEFORE any code is generated.",
    permissions: ["read_prompt", "plan_files", "estimate_complexity"],
    tokenLimit: 50000, batchSize: 10, creativity: "0.70",
    governorEnabled: false, enabled: true,
  },
  codegen: {
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: "You are a senior full-stack developer AI agent. Your job is to generate complete, production-ready project code based on user descriptions.",
    permissions: ["read_prompt", "generate_code", "create_files", "define_dependencies"],
    tokenLimit: 100000, batchSize: 10, creativity: "0.70",
    governorEnabled: false, enabled: true,
  },
  reviewer: {
    primaryModel: { provider: "openai", model: "o3", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: "You are a senior code reviewer AI agent. Your job is to review generated website code for quality, security, accessibility, and best practices.",
    permissions: ["read_code", "report_issues", "score_quality"],
    tokenLimit: 50000, batchSize: 10, creativity: "0.30",
    governorEnabled: false, enabled: true,
  },
  fixer: {
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: "You are a code fixer AI agent. Your job is to fix issues found during code review.",
    permissions: ["read_code", "modify_code", "fix_issues"],
    tokenLimit: 80000, batchSize: 10, creativity: "0.50",
    governorEnabled: false, enabled: true,
  },
  filemanager: {
    primaryModel: { provider: "local", model: "none", enabled: true, creativity: 0, timeoutSeconds: 0, maxTokens: 0 },
    secondaryModel: null, tertiaryModel: null,
    systemPrompt: "Local agent — no AI model used. Handles file save/update/delete operations in the database.",
    permissions: ["read_files", "write_files", "delete_files", "organize_structure"],
    tokenLimit: 0, batchSize: 10, creativity: "0.00",
    governorEnabled: false, enabled: true,
  },
  package_runner: {
    primaryModel: { provider: "openai", model: "o3", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    systemPrompt: "You are a build and deployment assistant. You analyze error logs from package installation and server startup, then suggest fixes.",
    permissions: ["read_files", "execute_commands", "manage_sandbox", "install_packages"],
    tokenLimit: 20000, batchSize: 1, creativity: "0.20",
    governorEnabled: false, enabled: true,
  },
  surgical_edit: {
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: "You are a surgical code editor AI agent. Your job is to make precise, minimal edits to existing code files based on user modification requests.",
    permissions: ["read_code", "modify_code", "patch_files"],
    tokenLimit: 60000, batchSize: 5, creativity: "0.40",
    governorEnabled: false, enabled: true,
  },
  translator: {
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    systemPrompt: "You are a professional website content translator AI. Your job is to translate website content from one language to another while preserving HTML tags and structure.",
    permissions: ["read_content", "translate_content", "preserve_structure"],
    tokenLimit: 40000, batchSize: 5, creativity: "0.50",
    governorEnabled: false, enabled: true,
  },
  seo: {
    primaryModel: { provider: "openai", model: "gpt-4o", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    systemPrompt: "You are an expert SEO analyst. You analyze HTML websites and provide comprehensive SEO audits.",
    permissions: ["read_html", "analyze_seo", "suggest_fixes"],
    tokenLimit: 30000, batchSize: 1, creativity: "0.30",
    governorEnabled: false, enabled: true,
  },
  strategic: {
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: `You are the Strategic Execution Agent — the primary reasoning and problem-solving brain of the AI Website Builder system.`,
    permissions: ["read_code", "analyze_bugs", "suggest_fixes", "access_project_files", "debug_runtime", "modify_code"],
    tokenLimit: 64000, batchSize: 1, creativity: "0.70",
    governorEnabled: false, enabled: true,
  },
};

export interface FileAttachment {
  name: string;
  type: string;
  content: string;
}

const strategicSessions = new Map<string, { role: "user" | "assistant"; content: string }[]>();

router.post("/strategic/chat-stream", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { projectId, message, sessionId, attachments } = req.body as {
      projectId: string;
      message: string;
      sessionId?: string;
      attachments?: FileAttachment[];
    };

    if (!message?.trim()) {
      res.status(400).json({ error: { code: "VALIDATION", message: "Message is required" } });
      return;
    }

    const effectiveProjectId = projectId || "general";

    const [user] = await db.select({ creditBalanceUsd: usersTable.creditBalanceUsd, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const credits = parseFloat(user?.creditBalanceUsd ?? "0");
    if (user?.role !== "admin" && credits <= 0) {
      res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: "Insufficient credits." } });
      return;
    }

    const [config] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, "strategic")).limit(1);
    if (!config || !config.enabled) {
      res.status(503).json({ error: { code: "AGENT_DISABLED", message: "Strategic agent is disabled" } });
      return;
    }

    const sKey = sessionId || `${userId}_${effectiveProjectId}`;
    const history = strategicSessions.get(sKey) || [];

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const result = await streamStrategicAgent(
      effectiveProjectId,
      message,
      history,
      config.shortTermMemory || [],
      config.longTermMemory || [],
      (chunk: string) => {
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
      },
      attachments
    );

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: result.fullReply });
    if (history.length > 40) history.splice(0, history.length - 40);
    strategicSessions.set(sKey, history);

    const costUsd = result.cost;
    await db.update(usersTable).set({
      creditBalanceUsd: String(Math.max(0, credits - costUsd)),
    }).where(eq(usersTable.id, userId));

    await addToMemory("strategic", "short", {
      content: `Q: ${message.slice(0, 200)} | A: ${result.fullReply.slice(0, 300)}`,
      timestamp: new Date().toISOString(),
      context: effectiveProjectId,
    });

    res.write(`data: ${JSON.stringify({ type: "done", tokensUsed: result.tokensUsed, cost: costUsd, modelsUsed: result.modelsUsed })}\n\n`);
    res.end();
  } catch (error: any) {
    const reason = error?.reason || error?.message || "Unknown error";
    if (!res.headersSent) {
      res.status(500).json({ error: { code: "INTERNAL", message: reason } });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: reason })}\n\n`);
      res.end();
    }
  }
});

router.post("/strategic/chat", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { projectId, message, sessionId, attachments } = req.body as {
      projectId: string;
      message: string;
      sessionId?: string;
      attachments?: FileAttachment[];
    };

    if (!message?.trim()) {
      res.status(400).json({ error: { code: "VALIDATION", message: "Message is required" } });
      return;
    }

    const effectiveProjectId = projectId || "general";

    const [user] = await db.select({ creditBalanceUsd: usersTable.creditBalanceUsd, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const credits = parseFloat(user?.creditBalanceUsd ?? "0");
    if (user?.role !== "admin" && credits <= 0) {
      res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: "Insufficient credits.", message_ar: "رصيد غير كافٍ." } });
      return;
    }

    const [config] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, "strategic")).limit(1);

    if (!config || !config.enabled) {
      res.status(503).json({ error: { code: "AGENT_DISABLED", message: "Strategic agent is disabled", message_ar: "الوكيل الاستراتيجي معطل" } });
      return;
    }

    const sKey = sessionId || `${userId}_${effectiveProjectId}`;
    const history = strategicSessions.get(sKey) || [];

    const result = await runStrategicAgent(
      effectiveProjectId,
      message,
      history,
      config.shortTermMemory || [],
      config.longTermMemory || [],
      attachments
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
      context: effectiveProjectId,
    });

    let fixResult: { success: boolean; fixedFiles: string[]; buildId?: string } | undefined;
    if (result.actions?.type === "fix" && result.actions.files.length > 0) {
      try {
        const limitCheck = await checkBuildLimits(userId, effectiveProjectId);
        if (limitCheck.allowed) {
          console.log("[Strategic] Applying fixes:", result.actions.files);
          const fix = await startSurgicalFix(effectiveProjectId, userId, message, result.actions.files);
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
    const reason = error?.reason || error?.message || "Unknown error";
    const reasonAr = translateErrorReason(reason);
    res.status(500).json({
      error: {
        code: "INTERNAL",
        message: reason,
        message_ar: reasonAr,
      },
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
      autoGovernor: config.autoGovernor,
      tokenLimit: config.tokenLimit,
      creativity: config.creativity,
      batchSize: config.batchSize,
      primaryModel: config.primaryModel,
      secondaryModel: config.secondaryModel,
      tertiaryModel: config.tertiaryModel,
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

router.get("/strategic/agents", async (_req, res) => {
  try {
    const configs = await db.select({
      agentKey: agentConfigsTable.agentKey,
      displayNameEn: agentConfigsTable.displayNameEn,
      displayNameAr: agentConfigsTable.displayNameAr,
      description: agentConfigsTable.description,
      enabled: agentConfigsTable.enabled,
      governorEnabled: agentConfigsTable.governorEnabled,
      primaryModel: agentConfigsTable.primaryModel,
      secondaryModel: agentConfigsTable.secondaryModel,
      tertiaryModel: agentConfigsTable.tertiaryModel,
      systemPrompt: agentConfigsTable.systemPrompt,
      instructions: agentConfigsTable.instructions,
      permissions: agentConfigsTable.permissions,
      tokenLimit: agentConfigsTable.tokenLimit,
      batchSize: agentConfigsTable.batchSize,
      creativity: agentConfigsTable.creativity,
      pipelineOrder: agentConfigsTable.pipelineOrder,
    }).from(agentConfigsTable).orderBy(agentConfigsTable.pipelineOrder);
    res.json({ agents: configs });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to list agents" } });
  }
});

router.post("/strategic/configure-agent", async (req, res) => {
  try {
    const { agentKey, updates } = req.body as { agentKey: string; updates: Record<string, any> };

    if (!agentKey || !updates) {
      res.status(400).json({ error: { code: "VALIDATION", message: "agentKey and updates required" } });
      return;
    }

    const [existing] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, agentKey)).limit(1);
    if (!existing) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${agentKey}' not found` } });
      return;
    }

    const safeFields = [
      "enabled", "governorEnabled", "autoGovernor", "primaryModel", "secondaryModel", "tertiaryModel",
      "systemPrompt", "instructions", "permissions", "tokenLimit", "batchSize", "creativity",
    ];
    const safeUpdates: Record<string, any> = { updatedAt: new Date() };
    for (const key of safeFields) {
      if (key in updates) {
        safeUpdates[key] = updates[key];
      }
    }

    const [updated] = await db.update(agentConfigsTable)
      .set(safeUpdates)
      .where(eq(agentConfigsTable.agentKey, agentKey))
      .returning();

    const changes: string[] = [];
    for (const key of safeFields) {
      if (key in updates) {
        changes.push(key);
      }
    }

    res.json({
      success: true,
      agentKey,
      changedFields: changes,
      agent: {
        agentKey: updated.agentKey,
        displayNameEn: updated.displayNameEn,
        displayNameAr: updated.displayNameAr,
        enabled: updated.enabled,
        governorEnabled: updated.governorEnabled,
        tokenLimit: updated.tokenLimit,
        permissions: updated.permissions,
        creativity: updated.creativity,
      },
    });
  } catch (error: any) {
    console.error("[Strategic] Configure agent error:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: error?.message || "Failed to configure agent" } });
  }
});

router.post("/strategic/reset-agent", async (req, res) => {
  try {
    const { agentKey } = req.body as { agentKey: string };

    if (!agentKey) {
      res.status(400).json({ error: { code: "VALIDATION", message: "agentKey required" } });
      return;
    }

    const defaults = DEFAULT_AGENTS[agentKey];
    if (!defaults) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `No defaults for agent '${agentKey}'` } });
      return;
    }

    const [updated] = await db.update(agentConfigsTable)
      .set({
        ...defaults,
        updatedAt: new Date(),
      })
      .where(eq(agentConfigsTable.agentKey, agentKey))
      .returning();

    if (!updated) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${agentKey}' not found in database` } });
      return;
    }

    res.json({
      success: true,
      agentKey,
      message: `Agent '${agentKey}' reset to defaults`,
      agent: {
        agentKey: updated.agentKey,
        displayNameEn: updated.displayNameEn,
        displayNameAr: updated.displayNameAr,
        enabled: updated.enabled,
        tokenLimit: updated.tokenLimit,
        permissions: updated.permissions,
      },
    });
  } catch (error: any) {
    console.error("[Strategic] Reset agent error:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: error?.message || "Failed to reset agent" } });
  }
});

router.post("/strategic/agent-chat", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { targetAgentKey, message, projectId } = req.body as {
      targetAgentKey: string;
      message: string;
      projectId?: string;
    };

    if (!targetAgentKey || !message?.trim()) {
      res.status(400).json({ error: { code: "VALIDATION", message: "targetAgentKey and message required" } });
      return;
    }

    const [user] = await db.select({ creditBalanceUsd: usersTable.creditBalanceUsd, role: usersTable.role })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    const credits = parseFloat(user?.creditBalanceUsd ?? "0");
    if (user?.role !== "admin" && credits <= 0) {
      res.status(402).json({ error: { code: "INSUFFICIENT_CREDITS", message: "Insufficient credits." } });
      return;
    }

    const [targetAgent] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, targetAgentKey)).limit(1);
    if (!targetAgent) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: `Agent '${targetAgentKey}' not found` } });
      return;
    }

    const [strategicConfig] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, "strategic")).limit(1);
    if (!strategicConfig || !strategicConfig.enabled) {
      res.status(503).json({ error: { code: "AGENT_DISABLED", message: "Strategic agent is disabled" } });
      return;
    }

    const agentContext = JSON.stringify({
      agentKey: targetAgent.agentKey,
      displayNameEn: targetAgent.displayNameEn,
      displayNameAr: targetAgent.displayNameAr,
      enabled: targetAgent.enabled,
      governorEnabled: targetAgent.governorEnabled,
      primaryModel: targetAgent.primaryModel,
      secondaryModel: targetAgent.secondaryModel,
      tertiaryModel: targetAgent.tertiaryModel,
      systemPrompt: targetAgent.systemPrompt,
      instructions: targetAgent.instructions,
      permissions: targetAgent.permissions,
      tokenLimit: targetAgent.tokenLimit,
      batchSize: targetAgent.batchSize,
      creativity: targetAgent.creativity,
      pipelineOrder: targetAgent.pipelineOrder,
    }, null, 2);

    const configPrompt = `You are the Strategic Agent Manager. You help configure and manage AI agents.
The user wants to modify the agent: "${targetAgent.displayNameEn}" (${targetAgent.displayNameAr}).

Current agent configuration:
${agentContext}

INSTRUCTIONS:
- Analyze the user's request about this agent
- Determine what settings should be changed
- Return your response as JSON with this format:

{
  "analysis": "What you understand the user wants",
  "changes": {
    "field_name": "new_value"
  },
  "explanation": "Explanation of what you changed and why (support Arabic)",
  "summary": "Brief summary of changes made"
}

Valid fields you can change:
- enabled (boolean): Enable/disable the agent
- governorEnabled (boolean): Enable/disable multi-model governor
- systemPrompt (string): The agent's core behavior/personality
- instructions (string): Additional operational guidelines
- permissions (string[]): Agent capabilities like ["read_code", "modify_code", "fix_issues"]
- tokenLimit (number): Maximum tokens per task
- batchSize (number): Batch processing size
- creativity (string): Creativity level "0.00" to "2.00"
- primaryModel (object): {provider, model, enabled, creativity, timeoutSeconds, maxTokens}
- secondaryModel (object or null): Same as primaryModel
- tertiaryModel (object or null): Same as primaryModel

Available providers: "anthropic", "openai", "local"
Available models: "claude-sonnet-4-20250514", "o3", "gpt-4o", "none", "orchestrator"

If the user's request is unclear, set "changes" to {} and ask for clarification in "explanation".
Respond in the same language as the user.`;

    const sKey = `agent_config_${userId}_${targetAgentKey}`;
    const history = strategicSessions.get(sKey) || [];

    const primarySlot = strategicConfig.primaryModel as any;
    const provider = primarySlot?.provider || "anthropic";
    const model = primarySlot?.model || "claude-sonnet-4-20250514";
    const maxTokens = Math.min(primarySlot?.maxTokens || 16000, 64000);
    const timeoutSeconds = primarySlot?.timeoutSeconds || 240;

    const { callModelForConfig } = await import("../lib/agents/strategic-agent");

    const configResult = await callModelForConfig(
      provider, model, configPrompt,
      [...history.slice(-10), { role: "user" as const, content: message }],
      maxTokens, timeoutSeconds
    );

    if (!configResult) throw new Error("Model call failed");

    let configChanges: Record<string, any> = {};
    let explanation = configResult.content;
    let appliedChanges: string[] = [];

    try {
      const cleaned = configResult.content.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      let parsed: any = null;
      try { parsed = JSON.parse(cleaned); } catch {
        const bs = cleaned.indexOf("{");
        const be = cleaned.lastIndexOf("}");
        if (bs !== -1 && be > bs) {
          try { parsed = JSON.parse(cleaned.substring(bs, be + 1)); } catch {}
        }
      }

      if (parsed && parsed.changes && typeof parsed.changes === "object" && Object.keys(parsed.changes).length > 0) {
        configChanges = parsed.changes;
        explanation = parsed.explanation || parsed.analysis || configResult.content;

        const safeFields = ["enabled", "governorEnabled", "autoGovernor", "primaryModel", "secondaryModel", "tertiaryModel",
          "systemPrompt", "instructions", "permissions", "tokenLimit", "batchSize", "creativity"];
        const safeUpdates: Record<string, any> = { updatedAt: new Date() };
        for (const key of safeFields) {
          if (key in configChanges) {
            safeUpdates[key] = configChanges[key];
            appliedChanges.push(key);
          }
        }

        if (appliedChanges.length > 0) {
          await db.update(agentConfigsTable)
            .set(safeUpdates)
            .where(eq(agentConfigsTable.agentKey, targetAgentKey));
        }
      } else if (parsed) {
        explanation = parsed.explanation || parsed.analysis || configResult.content;
      }
    } catch {}

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: explanation });
    if (history.length > 20) history.splice(0, history.length - 20);
    strategicSessions.set(sKey, history);

    const costUsd = configResult.tokensUsed * 0.000015;
    await db.update(usersTable).set({
      creditBalanceUsd: String(Math.max(0, credits - costUsd)),
    }).where(eq(usersTable.id, userId));

    const [updatedAgent] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, targetAgentKey)).limit(1);

    res.json({
      reply: explanation,
      thinking: [{ model, summary: "Agent configuration analysis", durationMs: 0 }],
      tokensUsed: configResult.tokensUsed,
      cost: costUsd,
      changesApplied: appliedChanges.length > 0,
      appliedChanges,
      agentConfig: updatedAgent ? {
        agentKey: updatedAgent.agentKey,
        displayNameEn: updatedAgent.displayNameEn,
        displayNameAr: updatedAgent.displayNameAr,
        enabled: updatedAgent.enabled,
        governorEnabled: updatedAgent.governorEnabled,
        tokenLimit: updatedAgent.tokenLimit,
        permissions: updatedAgent.permissions,
        creativity: updatedAgent.creativity,
        systemPrompt: updatedAgent.systemPrompt?.slice(0, 200),
      } : null,
    });
  } catch (error: any) {
    console.error("[Strategic] Agent chat error:", error);
    const reason = error?.reason || error?.message || "Unknown error";
    const reasonAr = translateErrorReason(reason);
    res.status(500).json({
      error: { code: "INTERNAL", message: reason, message_ar: reasonAr },
    });
  }
});

router.get("/strategic/threads", async (_req, res) => {
  try {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const threads = await db.select().from(strategicThreadsTable)
      .where(gte(strategicThreadsTable.createdAt, oneYearAgo))
      .orderBy(desc(strategicThreadsTable.updatedAt));

    res.json({ threads });
  } catch (error: any) {
    res.status(500).json({ error: { message: error?.message || "Failed to fetch threads" } });
  }
});

router.post("/strategic/threads", async (req, res) => {
  try {
    const { title, projectId } = req.body;
    const [thread] = await db.insert(strategicThreadsTable).values({
      title: title || "New Thread",
      projectId: projectId || null,
    }).returning();
    res.json({ thread });
  } catch (error: any) {
    res.status(500).json({ error: { message: error?.message || "Failed to create thread" } });
  }
});

router.patch("/strategic/threads/:threadId", async (req, res) => {
  try {
    const { threadId } = req.params;
    const { title, archived } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (archived !== undefined) updates.archived = archived;

    const [thread] = await db.update(strategicThreadsTable)
      .set(updates)
      .where(eq(strategicThreadsTable.id, threadId))
      .returning();
    res.json({ thread });
  } catch (error: any) {
    res.status(500).json({ error: { message: error?.message || "Failed to update thread" } });
  }
});

router.delete("/strategic/threads/:threadId", async (req, res) => {
  try {
    const { threadId } = req.params;
    await db.delete(strategicThreadsTable).where(eq(strategicThreadsTable.id, threadId));
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: { message: error?.message || "Failed to delete thread" } });
  }
});

router.get("/strategic/threads/:threadId/messages", async (req, res) => {
  try {
    const { threadId } = req.params;
    const msgs = await db.select().from(strategicMessagesTable)
      .where(eq(strategicMessagesTable.threadId, threadId))
      .orderBy(strategicMessagesTable.createdAt);
    res.json({ messages: msgs });
  } catch (error: any) {
    res.status(500).json({ error: { message: error?.message || "Failed to fetch messages" } });
  }
});

router.post("/strategic/threads/:threadId/messages", async (req, res) => {
  try {
    const { threadId } = req.params;
    const { role, content, thinking, tokensUsed, cost, model, attachments } = req.body;
    const [msg] = await db.insert(strategicMessagesTable).values({
      threadId,
      role,
      content,
      thinking: thinking || null,
      tokensUsed: tokensUsed ? String(tokensUsed) : null,
      cost: cost ? String(cost) : null,
      model: model || null,
      attachments: attachments ? JSON.stringify(attachments) : null,
    }).returning();

    await db.update(strategicThreadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(strategicThreadsTable.id, threadId));

    res.json({ message: msg });
  } catch (error: any) {
    res.status(500).json({ error: { message: error?.message || "Failed to save message" } });
  }
});

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const userId = getUserId(req);
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (user?.role !== "admin") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin access required" } });
    return false;
  }
  return true;
}

const PROJECT_ROOT = process.cwd();

const INFRA_FILES = [
  "Dockerfile",
  ".github/workflows/deploy-cloud-run.yml",
  "docker-compose.yml",
  "package.json",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  ".env",
  ".env.production",
  "artifacts/api-server/package.json",
  "artifacts/api-server/tsconfig.json",
  "artifacts/api-server/src/app.ts",
  "artifacts/api-server/src/routes/index.ts",
  "artifacts/api-server/src/routes/strategic.ts",
  "artifacts/api-server/src/routes/chat.ts",
  "artifacts/api-server/src/routes/infra.ts",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/admin.ts",
  "artifacts/api-server/src/routes/billing.ts",
  "artifacts/api-server/src/routes/projects.ts",
  "artifacts/api-server/src/routes/build.ts",
  "artifacts/api-server/src/routes/sandbox.ts",
  "artifacts/api-server/src/routes/monitoring.ts",
  "artifacts/api-server/src/lib/agents/strategic-agent.ts",
  "artifacts/api-server/src/lib/agents/ai-clients.ts",
  "artifacts/api-server/src/middlewares/authSession.ts",
  "artifacts/api-server/src/middlewares/permissions.ts",
  "artifacts/website-builder/package.json",
  "artifacts/website-builder/src/App.tsx",
  "artifacts/website-builder/vite.config.ts",
  "lib/db/src/schema/index.ts",
  "lib/db/src/schema/users.ts",
  "lib/db/src/schema/projects.ts",
  "lib/db/src/schema/agent-configs.ts",
];

router.get("/strategic/infra/files", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const filePath = req.query.path as string | undefined;

    if (filePath) {
      const resolved = path.resolve(PROJECT_ROOT, filePath);
      if (!resolved.startsWith(PROJECT_ROOT)) {
        res.status(400).json({ error: "Path traversal not allowed" });
        return;
      }
      if (!fs.existsSync(resolved)) {
        res.status(404).json({ error: "File not found", path: filePath });
        return;
      }
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(d => ({
          name: d.name,
          type: d.isDirectory() ? "directory" : "file",
          size: d.isFile() ? fs.statSync(path.join(resolved, d.name)).size : null,
        }));
        res.json({ path: filePath, type: "directory", entries });
        return;
      }
      const content = fs.readFileSync(resolved, "utf-8").slice(0, 200000);
      res.json({ path: filePath, type: "file", size: stat.size, content });
      return;
    }

    const files = INFRA_FILES.map(f => {
      const full = path.resolve(PROJECT_ROOT, f);
      const exists = fs.existsSync(full);
      return { path: f, exists, size: exists ? fs.statSync(full).size : 0 };
    });
    res.json({ root: PROJECT_ROOT, files });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to list files" });
  }
});

router.post("/strategic/infra/file-write", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { filePath, content } = req.body as { filePath: string; content: string };
    if (!filePath || content === undefined) {
      res.status(400).json({ error: "filePath and content required" });
      return;
    }
    const resolved = path.resolve(PROJECT_ROOT, filePath);
    if (!resolved.startsWith(PROJECT_ROOT)) {
      res.status(400).json({ error: "Path traversal not allowed" });
      return;
    }
    const dir = path.dirname(resolved);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolved, content, "utf-8");
    res.json({ success: true, path: filePath, size: Buffer.byteLength(content) });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to write file" });
  }
});

router.get("/strategic/infra/env", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const safeKeys = [
      "NODE_ENV", "PORT", "DATABASE_URL", "AUTH_PROVIDER", "CLOUD_SQL_INSTANCE",
      "GCP_PROJECT_ID", "GCP_REGION", "CLOUD_RUN_SERVICE",
      "GITHUB_REPOSITORY", "npm_package_name", "npm_package_version",
    ];
    const sensitiveKeys = [
      "SESSION_SECRET", "CUSTOM_ANTHROPIC_API_KEY", "CUSTOM_OPENAI_API_KEY",
      "GITHUB_TOKEN", "GCP_SA_KEY",
    ];
    const env: Record<string, string> = {};
    for (const k of safeKeys) {
      if (process.env[k]) env[k] = process.env[k]!;
    }
    const secrets: Record<string, string> = {};
    for (const k of sensitiveKeys) {
      secrets[k] = process.env[k] ? `SET (${process.env[k]!.length} chars)` : "NOT SET";
    }
    const showSecrets = req.query.reveal === "true";
    if (showSecrets) {
      for (const k of sensitiveKeys) {
        if (process.env[k]) secrets[k] = process.env[k]!;
      }
    }
    res.json({ env, secrets, allKeys: Object.keys(process.env).sort() });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to read env" });
  }
});

router.post("/strategic/infra/env", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { key, value } = req.body as { key: string; value: string };
    if (!key) {
      res.status(400).json({ error: "key is required" });
      return;
    }
    if (value === null || value === undefined) {
      delete process.env[key];
      res.json({ success: true, action: "deleted", key });
    } else {
      process.env[key] = value;
      res.json({ success: true, action: "set", key, length: value.length });
    }
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to set env" });
  }
});

router.post("/strategic/infra/db-query", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { query: sqlQuery } = req.body as { query: string };
    if (!sqlQuery?.trim()) {
      res.status(400).json({ error: "query is required" });
      return;
    }
    const result = await db.execute(sql.raw(sqlQuery));
    res.json({ success: true, rows: result.rows || result, rowCount: (result as any).rowCount ?? null });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Query failed" });
  }
});

router.get("/strategic/infra/db-tables", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const tables = await db.execute(sql.raw(`
      SELECT table_name, 
             (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
      FROM information_schema.tables t 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `));
    const detailed = req.query.detailed === "true";
    let columns: any[] = [];
    if (detailed) {
      const cols = await db.execute(sql.raw(`
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        ORDER BY table_name, ordinal_position
      `));
      columns = cols.rows || cols;
    }
    res.json({ tables: tables.rows || tables, columns });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to list tables" });
  }
});

router.post("/strategic/infra/exec", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { command } = req.body as { command: string };
    if (!command?.trim()) {
      res.status(400).json({ error: "command is required" });
      return;
    }
    const blocked = ["rm -rf /", "mkfs", "dd if=", ":(){", "fork bomb"];
    for (const b of blocked) {
      if (command.includes(b)) {
        res.status(400).json({ error: "Dangerous command blocked" });
        return;
      }
    }
    const output = execSync(command, {
      cwd: PROJECT_ROOT,
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: "utf-8",
      env: { ...process.env },
    });
    res.json({ success: true, output: output.slice(0, 100000) });
  } catch (error: any) {
    res.json({
      success: false,
      exitCode: error?.status || 1,
      output: (error?.stdout || "").slice(0, 50000),
      error: (error?.stderr || error?.message || "").slice(0, 50000),
    });
  }
});

router.get("/strategic/infra/status", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    let dbStatus = "unknown";
    try {
      await db.execute(sql.raw("SELECT 1"));
      dbStatus = "connected";
    } catch { dbStatus = "disconnected"; }

    const userCount = await db.execute(sql.raw("SELECT count(*) as cnt FROM users"));
    const projectCount = await db.execute(sql.raw("SELECT count(*) as cnt FROM projects"));
    const agentCount = await db.execute(sql.raw("SELECT count(*) as cnt FROM agent_configs"));

    const memUsage = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      database: dbStatus,
      counts: {
        users: (userCount.rows || userCount)[0]?.cnt,
        projects: (projectCount.rows || projectCount)[0]?.cnt,
        agents: (agentCount.rows || agentCount)[0]?.cnt,
      },
      server: {
        uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
        memoryMB: Math.round(memUsage.heapUsed / 1024 / 1024),
        nodeVersion: process.version,
        pid: process.pid,
      },
      env: process.env.NODE_ENV || "development",
      platform: {
        gcpProject: process.env.GCP_PROJECT_ID || "N/A",
        region: process.env.GCP_REGION || "N/A",
        cloudRunService: process.env.CLOUD_RUN_SERVICE || "N/A",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to get status" });
  }
});

export default router;
