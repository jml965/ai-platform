import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { buildTasksTable, agentConfigsTable, tokenUsageTable } from "@workspace/db/schema";
import { eq, sql, desc } from "drizzle-orm";

const router: IRouter = Router();

const DEFAULT_AGENTS = [
  {
    agentKey: "planner",
    displayNameEn: "Planner Agent",
    displayNameAr: "وكيل التخطيط",
    description: "Analyzes project requests and creates structured file plans for large projects",
    primaryModel: { provider: "openai", model: "o3", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: `You are a senior software architect AI. Your job is to analyze a project request and produce a structured project plan BEFORE any code is generated.`,
    permissions: ["read_prompt", "plan_files", "estimate_complexity"],
    pipelineOrder: 1,
    receivesFrom: "user_input",
    sendsTo: "codegen",
    roleOnReceive: "Receives user prompt and analyzes project requirements",
    roleOnSend: "Sends structured file plan to code generator",
    tokenLimit: 50000,
    batchSize: 10,
    creativity: "0.70",
    sourceFiles: ["artifacts/api-server/src/lib/agents/planner-agent.ts"],
  },
  {
    agentKey: "codegen",
    displayNameEn: "Code Generator",
    displayNameAr: "مولّد الأكواد",
    description: "Generates complete, production-ready project code from natural language descriptions",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: `You are a senior full-stack developer AI agent. Your job is to generate complete, production-ready project code based on user descriptions.`,
    permissions: ["read_prompt", "generate_code", "create_files", "define_dependencies"],
    pipelineOrder: 2,
    receivesFrom: "planner",
    sendsTo: "reviewer",
    roleOnReceive: "Receives file plan or direct prompt and generates code",
    roleOnSend: "Sends generated code files to reviewer for quality check",
    tokenLimit: 100000,
    batchSize: 10,
    creativity: "0.70",
    sourceFiles: ["artifacts/api-server/src/lib/agents/codegen-agent.ts"],
  },
  {
    agentKey: "reviewer",
    displayNameEn: "Code Reviewer",
    displayNameAr: "مراجع الأكواد",
    description: "Reviews generated code for quality, security, accessibility, and best practices",
    primaryModel: { provider: "openai", model: "o3", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: `You are a senior code reviewer AI agent. Your job is to review generated website code for quality, security, accessibility, and best practices.`,
    permissions: ["read_code", "report_issues", "score_quality"],
    pipelineOrder: 3,
    receivesFrom: "codegen",
    sendsTo: "fixer",
    roleOnReceive: "Receives generated code and performs quality review",
    roleOnSend: "Sends issue list to fixer if errors found, or passes to file manager",
    tokenLimit: 50000,
    batchSize: 10,
    creativity: "0.30",
    sourceFiles: ["artifacts/api-server/src/lib/agents/reviewer-agent.ts"],
  },
  {
    agentKey: "fixer",
    displayNameEn: "Code Fixer",
    displayNameAr: "مصلح الأكواد",
    description: "Automatically fixes issues found during code review",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: `You are a code fixer AI agent. Your job is to fix issues found during code review. You receive the original code and a list of issues, and you return the corrected files.`,
    permissions: ["read_code", "modify_code", "fix_issues"],
    pipelineOrder: 4,
    receivesFrom: "reviewer",
    sendsTo: "filemanager",
    roleOnReceive: "Receives code with issue list and applies fixes",
    roleOnSend: "Sends fixed code to file manager for persistence",
    tokenLimit: 80000,
    batchSize: 10,
    creativity: "0.50",
    sourceFiles: ["artifacts/api-server/src/lib/agents/fixer-agent.ts"],
  },
  {
    agentKey: "filemanager",
    displayNameEn: "File Manager",
    displayNameAr: "مدير الملفات",
    description: "Manages file persistence in the database — saves, updates, and organizes project files",
    primaryModel: { provider: "local", model: "none", enabled: true, creativity: 0, timeoutSeconds: 0, maxTokens: 0 },
    secondaryModel: null,
    tertiaryModel: null,
    systemPrompt: "Local agent — no AI model used. Handles file save/update/delete operations in the database.",
    permissions: ["read_files", "write_files", "delete_files", "organize_structure"],
    pipelineOrder: 5,
    receivesFrom: "fixer",
    sendsTo: "package_runner",
    roleOnReceive: "Receives final code files and saves them to database",
    roleOnSend: "Notifies package runner that files are ready for installation",
    tokenLimit: 0,
    batchSize: 10,
    creativity: "0.00",
    sourceFiles: ["artifacts/api-server/src/lib/agents/filemanager-agent.ts"],
  },
  {
    agentKey: "package_runner",
    displayNameEn: "Package Runner",
    displayNameAr: "مشغّل الحزم",
    description: "Detects project type and runs install/start commands in sandbox environment",
    primaryModel: { provider: "openai", model: "o3", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    systemPrompt: `You are a build and deployment assistant. You analyze error logs from package installation and server startup, then suggest fixes.`,
    permissions: ["read_files", "execute_commands", "manage_sandbox", "install_packages"],
    pipelineOrder: 6,
    receivesFrom: "filemanager",
    sendsTo: "qa_pipeline",
    roleOnReceive: "Receives notification that files are saved, starts installation",
    roleOnSend: "Sends running sandbox URL to QA pipeline for validation",
    tokenLimit: 20000,
    batchSize: 1,
    creativity: "0.20",
    sourceFiles: ["artifacts/api-server/src/lib/agents/package-runner-agent.ts"],
  },
  {
    agentKey: "qa_pipeline",
    displayNameEn: "QA Pipeline",
    displayNameAr: "خط ضمان الجودة",
    description: "Validates the running application by re-reviewing and re-fixing code issues",
    primaryModel: { provider: "local", model: "orchestrator", enabled: true, creativity: 0, timeoutSeconds: 0, maxTokens: 0 },
    secondaryModel: null,
    tertiaryModel: null,
    systemPrompt: "Orchestrator — runs reviewer + fixer in a retry loop until quality passes or max retries reached.",
    permissions: ["trigger_review", "trigger_fix", "validate_output"],
    pipelineOrder: 7,
    receivesFrom: "package_runner",
    sendsTo: "output",
    roleOnReceive: "Receives running project and validates quality",
    roleOnSend: "Delivers final validated project to user",
    tokenLimit: 50000,
    batchSize: 1,
    creativity: "0.00",
    sourceFiles: ["artifacts/api-server/src/lib/agents/qa-pipeline.ts"],
  },
  {
    agentKey: "surgical_edit",
    displayNameEn: "Surgical Editor",
    displayNameAr: "المحرر الجراحي",
    description: "Makes precise, minimal edits to existing code files based on modification requests",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    systemPrompt: `You are a surgical code editor AI agent. Your job is to make precise, minimal edits to existing code files based on user modification requests.`,
    permissions: ["read_code", "modify_code", "patch_files"],
    pipelineOrder: 0,
    receivesFrom: "user_input",
    sendsTo: "filemanager",
    roleOnReceive: "Receives edit request with existing files context",
    roleOnSend: "Sends patched files to file manager",
    tokenLimit: 60000,
    batchSize: 5,
    creativity: "0.40",
    sourceFiles: ["artifacts/api-server/src/lib/agents/surgical-edit-agent.ts"],
  },
  {
    agentKey: "translator",
    displayNameEn: "Translation Agent",
    displayNameAr: "وكيل الترجمة",
    description: "Translates website content between languages while preserving HTML structure",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    systemPrompt: `You are a professional website content translator AI. Your job is to translate website content from one language to another while preserving HTML tags and structure.`,
    permissions: ["read_content", "translate_content", "preserve_structure"],
    pipelineOrder: 0,
    receivesFrom: "user_input",
    sendsTo: "output",
    roleOnReceive: "Receives content and target language",
    roleOnSend: "Delivers translated content",
    tokenLimit: 40000,
    batchSize: 5,
    creativity: "0.50",
    sourceFiles: ["artifacts/api-server/src/lib/agents/translation-agent.ts"],
  },
  {
    agentKey: "seo",
    displayNameEn: "SEO Analyst",
    displayNameAr: "محلل السيو",
    description: "Analyzes HTML websites and provides comprehensive SEO audits with scores and suggestions",
    primaryModel: { provider: "openai", model: "gpt-4o", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    systemPrompt: `You are an expert SEO analyst. You analyze HTML websites and provide comprehensive SEO audits.`,
    permissions: ["read_html", "analyze_seo", "suggest_fixes"],
    pipelineOrder: 0,
    receivesFrom: "user_input",
    sendsTo: "output",
    roleOnReceive: "Receives HTML content for SEO analysis",
    roleOnSend: "Delivers SEO report with scores and suggestions",
    tokenLimit: 30000,
    batchSize: 1,
    creativity: "0.30",
    sourceFiles: ["artifacts/api-server/src/lib/agents/seo-agent.ts"],
  },
  {
    agentKey: "execution_engine",
    displayNameEn: "Execution Engine",
    displayNameAr: "محرك التنفيذ",
    description: "Main orchestrator — routes builds to the correct pipeline and coordinates all agents",
    primaryModel: { provider: "local", model: "orchestrator", enabled: true, creativity: 0, timeoutSeconds: 0, maxTokens: 0 },
    secondaryModel: null,
    tertiaryModel: null,
    systemPrompt: "Orchestrator — manages the build pipeline, decides single-shot vs batched mode, and coordinates agent handoffs.",
    permissions: ["orchestrate", "route_builds", "manage_pipeline", "track_progress"],
    pipelineOrder: 0,
    receivesFrom: "user_input",
    sendsTo: "planner",
    roleOnReceive: "Receives build request from user",
    roleOnSend: "Routes to appropriate pipeline (single/batched)",
    tokenLimit: 0,
    batchSize: 10,
    creativity: "0.00",
    sourceFiles: ["artifacts/api-server/src/lib/agents/execution-engine.ts"],
  },
];

async function seedDefaultAgents() {
  const existing = await db.select({ agentKey: agentConfigsTable.agentKey }).from(agentConfigsTable);
  const existingKeys = new Set(existing.map(e => e.agentKey));

  for (const agent of DEFAULT_AGENTS) {
    if (!existingKeys.has(agent.agentKey)) {
      await db.insert(agentConfigsTable).values({
        agentKey: agent.agentKey,
        displayNameEn: agent.displayNameEn,
        displayNameAr: agent.displayNameAr,
        description: agent.description,
        enabled: true,
        isCustom: false,
        governorEnabled: false,
        primaryModel: agent.primaryModel,
        secondaryModel: agent.secondaryModel,
        tertiaryModel: agent.tertiaryModel,
        systemPrompt: agent.systemPrompt,
        instructions: "",
        permissions: agent.permissions,
        pipelineOrder: agent.pipelineOrder,
        receivesFrom: agent.receivesFrom,
        sendsTo: agent.sendsTo,
        roleOnReceive: agent.roleOnReceive,
        roleOnSend: agent.roleOnSend,
        tokenLimit: agent.tokenLimit,
        batchSize: agent.batchSize,
        creativity: agent.creativity,
        sourceFiles: agent.sourceFiles,
      });
    }
  }
}

router.get("/agents/configs", async (_req, res) => {
  try {
    await seedDefaultAgents();
    const configs = await db.select().from(agentConfigsTable).orderBy(agentConfigsTable.pipelineOrder);
    res.json({ agents: configs });
  } catch (error) {
    console.error("Failed to get agent configs:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get agent configs" } });
  }
});

router.get("/agents/configs/:agentKey", async (req, res) => {
  try {
    const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.agentKey, req.params.agentKey)).limit(1);
    if (!config) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Agent not found" } });
      return;
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get agent config" } });
  }
});

router.put("/agents/configs/:agentKey", async (req, res) => {
  try {
    const { agentKey } = req.params;
    const updates = req.body;
    delete updates.id;
    delete updates.createdAt;
    updates.updatedAt = new Date();

    const [updated] = await db.update(agentConfigsTable)
      .set(updates)
      .where(eq(agentConfigsTable.agentKey, agentKey))
      .returning();

    if (!updated) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Agent not found" } });
      return;
    }

    res.json(updated);
  } catch (error) {
    console.error("Failed to update agent config:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to update agent config" } });
  }
});

router.post("/agents/configs", async (req, res) => {
  try {
    const body = req.body;
    const [created] = await db.insert(agentConfigsTable).values({
      agentKey: body.agentKey,
      displayNameEn: body.displayNameEn,
      displayNameAr: body.displayNameAr,
      description: body.description || "",
      enabled: body.enabled ?? true,
      isCustom: true,
      governorEnabled: body.governorEnabled ?? false,
      primaryModel: body.primaryModel || { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
      secondaryModel: body.secondaryModel || null,
      tertiaryModel: body.tertiaryModel || null,
      systemPrompt: body.systemPrompt || "",
      instructions: body.instructions || "",
      permissions: body.permissions || [],
      pipelineOrder: body.pipelineOrder || 99,
      receivesFrom: body.receivesFrom || "",
      sendsTo: body.sendsTo || "",
      roleOnReceive: body.roleOnReceive || "",
      roleOnSend: body.roleOnSend || "",
      tokenLimit: body.tokenLimit || 50000,
      batchSize: body.batchSize || 10,
      creativity: body.creativity || "0.70",
      sourceFiles: body.sourceFiles || [],
    }).returning();
    res.json(created);
  } catch (error: any) {
    if (error?.code === "23505") {
      res.status(409).json({ error: { code: "CONFLICT", message: "Agent key already exists" } });
      return;
    }
    console.error("Failed to create agent:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to create agent" } });
  }
});

router.delete("/agents/configs/:agentKey", async (req, res) => {
  try {
    const [deleted] = await db.delete(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, req.params.agentKey))
      .returning();

    if (!deleted) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Agent not found" } });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to delete agent" } });
  }
});

router.put("/agents/reorder", async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      res.status(400).json({ error: { code: "BAD_REQUEST", message: "order must be an array of {agentKey, pipelineOrder}" } });
      return;
    }

    for (const item of order) {
      await db.update(agentConfigsTable)
        .set({
          pipelineOrder: item.pipelineOrder,
          receivesFrom: item.receivesFrom,
          sendsTo: item.sendsTo,
          updatedAt: new Date(),
        })
        .where(eq(agentConfigsTable.agentKey, item.agentKey));
    }

    const configs = await db.select().from(agentConfigsTable).orderBy(agentConfigsTable.pipelineOrder);
    res.json({ agents: configs });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to reorder agents" } });
  }
});

router.get("/agents/stats/:agentKey", async (req, res) => {
  try {
    const { agentKey } = req.params;

    const [taskStats] = await db
      .select({
        totalTasks: sql<number>`count(*)::int`,
        completedTasks: sql<number>`count(*) filter (where ${buildTasksTable.status} = 'completed')::int`,
        failedTasks: sql<number>`count(*) filter (where ${buildTasksTable.status} = 'failed')::int`,
        totalTokens: sql<number>`coalesce(sum(${buildTasksTable.tokensUsed}), 0)::int`,
        totalCost: sql<string>`coalesce(sum(${buildTasksTable.costUsd}::numeric), 0)::text`,
        avgDuration: sql<number>`coalesce(avg(${buildTasksTable.durationMs}), 0)::int`,
      })
      .from(buildTasksTable)
      .where(eq(buildTasksTable.agentType, agentKey));

    const recentTasks = await db
      .select({
        id: buildTasksTable.id,
        status: buildTasksTable.status,
        tokensUsed: buildTasksTable.tokensUsed,
        costUsd: buildTasksTable.costUsd,
        durationMs: buildTasksTable.durationMs,
        createdAt: buildTasksTable.createdAt,
        errorMessage: buildTasksTable.errorMessage,
      })
      .from(buildTasksTable)
      .where(eq(buildTasksTable.agentType, agentKey))
      .orderBy(desc(buildTasksTable.createdAt))
      .limit(20);

    res.json({
      agentKey,
      totalTasks: taskStats?.totalTasks || 0,
      completedTasks: taskStats?.completedTasks || 0,
      failedTasks: taskStats?.failedTasks || 0,
      totalTokens: taskStats?.totalTokens || 0,
      totalCost: taskStats?.totalCost || "0",
      avgDurationMs: taskStats?.avgDuration || 0,
      successRate: taskStats?.totalTasks ? Math.round(((taskStats?.completedTasks || 0) / taskStats.totalTasks) * 100) : 0,
      recentTasks,
    });
  } catch (error) {
    console.error("Failed to get agent stats:", error);
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get agent stats" } });
  }
});

router.get("/agents/status", async (_req, res) => {
  try {
    const agentTypes = ["codegen", "reviewer", "fixer", "filemanager"] as const;
    const agentCounts = await db
      .select({
        agentType: buildTasksTable.agentType,
        active: sql<number>`count(*) filter (where ${buildTasksTable.status} = 'in_progress')::int`,
        completed: sql<number>`count(*) filter (where ${buildTasksTable.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${buildTasksTable.status} = 'failed')::int`,
      })
      .from(buildTasksTable)
      .groupBy(buildTasksTable.agentType);

    const countsMap = new Map(agentCounts.map((c) => [c.agentType, c]));
    const agents = agentTypes.map((agentType) => {
      const counts = countsMap.get(agentType);
      return {
        agentType,
        activeTasks: counts?.active ?? 0,
        totalCompleted: counts?.completed ?? 0,
        totalFailed: counts?.failed ?? 0,
      };
    });
    res.json({ agents });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get agents status" } });
  }
});

router.get("/agents/tasks/:taskId", async (req, res) => {
  try {
    const [task] = await db
      .select()
      .from(buildTasksTable)
      .where(eq(buildTasksTable.id, req.params.taskId))
      .limit(1);

    if (!task) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Task not found" } });
      return;
    }

    res.json({
      id: task.id,
      projectId: task.projectId,
      agentType: task.agentType,
      status: task.status,
      targetFile: task.targetFile,
      tokensUsed: task.tokensUsed ?? 0,
      costUsd: Number(task.costUsd) || 0,
      retryCount: task.retryCount ?? 0,
      durationMs: task.durationMs,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt.toISOString(),
      completedAt: task.completedAt?.toISOString(),
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get task" } });
  }
});

export default router;
