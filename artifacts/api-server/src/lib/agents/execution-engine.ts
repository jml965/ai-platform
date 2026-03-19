import { db } from "@workspace/db";
import {
  buildTasksTable,
  executionLogsTable,
  projectsTable,
  tokenUsageTable,
  creditsLedgerTable,
  usersTable,
  notificationsTable,
  agentLogsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getConstitution } from "./constitution";
import { CodeGenAgent } from "./codegen-agent";
import { ReviewerAgent } from "./reviewer-agent";
import { FixerAgent } from "./fixer-agent";
import { FileManagerAgent } from "./filemanager-agent";
import { SurgicalEditAgent, isModificationRequest } from "./surgical-edit-agent";
import { PackageRunnerAgent, setRunner, removeRunner, getRunner } from "./package-runner-agent";
import { PlannerAgent, classifyComplexity } from "./planner-agent";
import { getAgentConfig } from "./governor";
import { checkSpendingLimits, checkAndNotifyLimits } from "../token-limits";
import { runQaWithRetry } from "./qa-pipeline";
import { emitBuildComplete, emitBuildError } from "../notificationEvents";
import type {
  BuildContext,
  BuildStatus,
  GeneratedFile,
  CodeIssue,
  ProjectPlan,
} from "./types";

interface ActiveBuild {
  buildId: string;
  projectId: string;
  userId: string;
  status: BuildStatus;
  cancelRequested: boolean;
}

const activeBuilds = new Map<string, ActiveBuild>();

(async function cleanupStuckProjects() {
  try {
    const stuck = await db.execute(
      sql`UPDATE projects SET status = 'ready'
          WHERE status = 'building'
          AND id IN (SELECT DISTINCT project_id FROM project_files)
          RETURNING id, name`
    );
    const stuckDraft = await db.execute(
      sql`UPDATE projects SET status = 'draft'
          WHERE status = 'building'
          AND id NOT IN (SELECT DISTINCT project_id FROM project_files)
          RETURNING id, name`
    );
    await db.execute(
      sql`UPDATE build_tasks SET status = 'failed', completed_at = NOW()
          WHERE status = 'in_progress'
          AND created_at < NOW() - INTERVAL '5 minutes'`
    );
    const total = (stuck.rows?.length || 0) + (stuckDraft.rows?.length || 0);
    if (total > 0) {
      console.log(`[STARTUP] Fixed ${total} stuck project(s) from previous session`);
    }
  } catch (e) {
    console.error("[STARTUP] Failed to cleanup stuck projects:", e);
  }
})();

export function getActiveBuild(buildId: string): ActiveBuild | undefined {
  return activeBuilds.get(buildId);
}

export function getAllActiveBuilds(): ActiveBuild[] {
  return Array.from(activeBuilds.values());
}

export function cancelBuild(buildId: string): boolean {
  const build = activeBuilds.get(buildId);
  if (!build || build.status !== "in_progress") return false;
  build.cancelRequested = true;
  return true;
}

function logExecution(
  buildId: string,
  projectId: string,
  taskId: string | null,
  agentType: string,
  action: string,
  status: string,
  details?: Record<string, unknown>,
  tokensUsed?: number,
  durationMs?: number
) {
  db.insert(executionLogsTable).values({
    buildId,
    projectId,
    taskId,
    agentType,
    action,
    status,
    details: details ?? null,
    tokensUsed: tokensUsed ?? 0,
    durationMs: durationMs ?? null,
  }).catch(e => console.error("[logExecution] write failed:", e));

  const msg = (details?.message as string) || `${action} — ${status}`;
  const msgAr = (details?.message as string) || `${action} — ${status}`;
  db.insert(agentLogsTable).values({
    agentKey: agentType,
    level: status === "failed" ? "error" : (status === "in_progress" ? "info" : "success"),
    action,
    message: msg,
    messageAr: msgAr,
    details: details ?? null,
    tokensUsed: tokensUsed ?? 0,
    durationMs: durationMs ?? null,
    status,
    buildId,
    projectId,
  }).catch(() => {});
}

function recordTokenUsage(
  userId: string,
  projectId: string,
  buildId: string,
  agentType: string,
  model: string,
  tokensUsed: number,
  costUsd: number
) {
  const INPUT_RATIO = 0.3;
  const tokensInput = Math.floor(tokensUsed * INPUT_RATIO);
  const tokensOutput = tokensUsed - tokensInput;

  db.insert(tokenUsageTable).values({
    userId,
    projectId,
    buildId,
    agentType,
    model,
    tokensInput,
    tokensOutput,
    costUsd: costUsd.toFixed(6),
    usageDate: new Date().toISOString().split("T")[0],
  }).catch(e => console.error("[recordTokenUsage] write failed:", e));

  checkAndNotifyLimits(userId, projectId, costUsd).catch((err) =>
    console.error("Failed to check/notify limits:", err)
  );
}

function estimateCost(tokensUsed: number, model: string): number {
  if (model.startsWith("claude-sonnet")) {
    return tokensUsed * 0.000015;
  }
  if (model === "o1") {
    return tokensUsed * 0.00006;
  }
  return tokensUsed * 0.00003;
}

async function createTask(
  buildId: string,
  projectId: string,
  agentType: string,
  prompt?: string
): Promise<string> {
  const [task] = await db
    .insert(buildTasksTable)
    .values({ buildId, projectId, agentType, status: "in_progress", prompt })
    .returning({ id: buildTasksTable.id });
  return task.id;
}

async function completeTask(
  taskId: string,
  tokensUsed: number,
  costUsd: number,
  durationMs: number
) {
  await db
    .update(buildTasksTable)
    .set({
      status: "completed",
      tokensUsed,
      costUsd: costUsd.toFixed(6),
      durationMs,
      completedAt: new Date(),
    })
    .where(eq(buildTasksTable.id, taskId));
}

async function failTask(taskId: string, errorMessage: string, durationMs: number) {
  await db
    .update(buildTasksTable)
    .set({
      status: "failed",
      errorMessage,
      durationMs,
      completedAt: new Date(),
    })
    .where(eq(buildTasksTable.id, taskId));
}

export async function checkBuildLimits(
  userId: string,
  projectId: string
): Promise<{ allowed: boolean; reason?: string; reasonAr?: string }> {
  const limits = await checkSpendingLimits(userId, projectId);
  return { allowed: limits.allowed, reason: limits.reason, reasonAr: limits.reasonAr };
}

export async function startBuild(
  projectId: string,
  userId: string,
  prompt: string
): Promise<string> {
  const buildId = uuidv4();
  const constitution = getConstitution();

  const activeBuild: ActiveBuild = {
    buildId,
    projectId,
    userId,
    status: "pending",
    cancelRequested: false,
  };
  activeBuilds.set(buildId, activeBuild);

  await db
    .update(projectsTable)
    .set({ status: "building", prompt, updatedAt: new Date() })
    .where(eq(projectsTable.id, projectId));

  executeBuildPipeline(buildId, projectId, userId, prompt, constitution).catch(
    (err) => {
      console.error(`Build ${buildId} pipeline error:`, err);
    }
  );

  return buildId;
}

export async function startBuildWithPlan(
  projectId: string,
  userId: string,
  prompt: string,
  plan: ProjectPlan
): Promise<string> {
  const buildId = uuidv4();
  const constitution = getConstitution();

  const activeBuild: ActiveBuild = {
    buildId,
    projectId,
    userId,
    status: "pending",
    cancelRequested: false,
  };
  activeBuilds.set(buildId, activeBuild);

  await db
    .update(projectsTable)
    .set({ status: "building", prompt, updatedAt: new Date() })
    .where(eq(projectsTable.id, projectId));

  executeBuildPipelineWithPlan(buildId, projectId, userId, prompt, plan, constitution).catch(
    (err) => {
      console.error(`Build ${buildId} (with plan) pipeline error:`, err);
    }
  );

  return buildId;
}

export async function generatePlan(
  projectId: string,
  userId: string,
  prompt: string
): Promise<{ buildId: string; plan: ProjectPlan; tokensUsed: number }> {
  const buildId = uuidv4();
  const constitution = getConstitution();

  const plannerAgent = new PlannerAgent(constitution);
  const context: BuildContext = {
    buildId,
    projectId,
    userId,
    prompt,
    existingFiles: [],
    tokensUsedSoFar: 0,
  };

  const result = await plannerAgent.execute(context);
  if (!result.success) {
    throw new Error(result.error || "Planning failed");
  }

  const plan = result.data?.plan as ProjectPlan;
  if (!plan) {
    throw new Error("Planner produced no plan");
  }

  logExecution(buildId, projectId, null, "planner", "generate_plan", "completed", {
    plan,
    tokensUsed: result.tokensUsed,
  }, result.tokensUsed, result.durationMs);

  recordTokenUsage(userId, projectId, buildId, "planner", plannerAgent.modelConfig.model, result.tokensUsed, estimateCost(result.tokensUsed, plannerAgent.modelConfig.model));

  return { buildId, plan, tokensUsed: result.tokensUsed };
}

function detectLang(text: string): "ar" | "en" {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
}

async function executeBuildPipeline(
  buildId: string,
  projectId: string,
  userId: string,
  prompt: string,
  constitution: ReturnType<typeof getConstitution>
) {
  const build = activeBuilds.get(buildId)!;
  build.status = "in_progress";
  const lang = detectLang(prompt);

  if (!prompt.includes("[FORCE_SINGLE_SHOT]") && shouldUseBatchedBuild(prompt, 0)) {
    console.log(`Build ${buildId}: detected large project, switching to batched build mode`);
    await executeBatchedBuildPipeline(buildId, projectId, userId, prompt, constitution);
    return;
  }
  const cleanPrompt = prompt.replace("[FORCE_SINGLE_SHOT]", "").trim();

  const codegenAgent = new CodeGenAgent(constitution);
  const reviewerAgent = new ReviewerAgent(constitution);
  const fixerAgent = new FixerAgent(constitution);
  const fileManager = new FileManagerAgent(constitution);
  const surgicalEditAgent = new SurgicalEditAgent(constitution);

  await Promise.allSettled([
    codegenAgent.loadConfigFromDB(),
    reviewerAgent.loadConfigFromDB(),
    fixerAgent.loadConfigFromDB(),
    surgicalEditAgent.loadConfigFromDB(),
  ]);

  let totalTokens = 0;
  let totalCost = 0;

  try {
    logExecution(buildId, projectId, null, "system", "build_started", "in_progress", {
      prompt,
      message: lang === "ar" ? `بدأ بناء المشروع — "${prompt.slice(0, 80)}"` : `Build started — "${prompt.slice(0, 80)}"`,
    });

    logExecution(buildId, projectId, null, "system", "analyzing_request", "in_progress", {
      message: lang === "ar" ? "أحلل طلبك وأحدد نوع المشروع والتقنيات المطلوبة..." : "Analyzing your request and determining project type and required technologies...",
    });

    const limitCheck = await checkSpendingLimits(userId, projectId);
    if (!limitCheck.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded", "failed", {
        reason: limitCheck.reason,
        message: lang === "ar" ? "تجاوز حد الاستخدام — لا يمكن المتابعة" : "Usage limit exceeded — cannot proceed",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    if (build.cancelRequested) {
      logExecution(buildId, projectId, null, "system", "build_cancelled", "failed", {
        message: lang === "ar" ? "تم إلغاء البناء بناءً على طلبك" : "Build cancelled by user request",
      });
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    let existingFiles = await fileManager.getProjectFiles(projectId);

    const codegenSourceFiles = codegenAgent.getSourceFiles();
    if (codegenSourceFiles.length > 0) {
      const projectScopeFiles = codegenSourceFiles.filter(sf => !sf.startsWith("artifacts/") && !sf.includes("node_modules"));
      if (projectScopeFiles.length > 0) {
        const filtered = existingFiles.filter(f =>
          projectScopeFiles.some(sf => f.filePath === sf || f.filePath.startsWith(sf + "/") || f.filePath.startsWith(sf))
        );
        if (filtered.length > 0) {
          existingFiles = filtered;
          console.log(`[Pipeline] codegen sourceFiles filter: ${existingFiles.length} files match ${projectScopeFiles.length} patterns`);
        }
      }
    }

    const context: BuildContext = {
      buildId,
      projectId,
      userId,
      prompt,
      existingFiles,
      tokensUsedSoFar: 0,
    };

    const isSurgicalEdit = isModificationRequest(prompt, existingFiles.length > 0);

    if (isSurgicalEdit) {
      if (!surgicalEditAgent.hasAnyPermission(["modify_code", "patch_files"])) {
        console.log(`[Pipeline] surgical_edit lacks permissions, falling back to full codegen`);
        logExecution(buildId, projectId, null, "system", "permission_denied_surgical", "in_progress", {
          message: lang === "ar"
            ? "المحرر الجراحي لا يملك الصلاحيات — أتحول للبناء الكامل"
            : "Surgical editor lacks permissions — falling back to full codegen",
        });
      } else {
      const surgicalTaskId = await createTask(buildId, projectId, "surgical_edit", prompt);
      logExecution(buildId, projectId, surgicalTaskId, "surgical_edit", "analyzing_changes", "in_progress", {
        existingFileCount: existingFiles.length,
        message: lang === "ar" ? `أحلل ${existingFiles.length} ملف موجود وأحدد التعديلات المطلوبة...` : `Analyzing ${existingFiles.length} existing files to determine required changes...`,
      });

      const surgicalResult = await surgicalEditAgent.execute(context);
      totalTokens += surgicalResult.tokensUsed;
      const surgicalCost = estimateCost(surgicalResult.tokensUsed, surgicalEditAgent.modelConfig.model);
      totalCost += surgicalCost;

      recordTokenUsage(userId, projectId, buildId, "surgical_edit", surgicalEditAgent.modelConfig.model, surgicalResult.tokensUsed, surgicalCost);

      if (surgicalResult.success) {
        await completeTask(surgicalTaskId, surgicalResult.tokensUsed, surgicalCost, surgicalResult.durationMs);
        logExecution(
          buildId, projectId, surgicalTaskId, "surgical_edit", "surgical_edit", "completed",
          { tokensUsed: surgicalResult.tokensUsed, summary: surgicalResult.data?.summary },
          surgicalResult.tokensUsed, surgicalResult.durationMs
        );

        const patchedFiles = surgicalResult.data?.files as GeneratedFile[];
        const allFiles = mergeFiles(existingFiles, patchedFiles);

        await savePatchedFilesAndRun(
          buildId, projectId, userId, allFiles, fileManager, constitution,
          totalTokens, totalCost, build
        );
        return;
      }

      await failTask(surgicalTaskId, surgicalResult.error ?? "Unknown error", surgicalResult.durationMs);
      logExecution(
        buildId, projectId, surgicalTaskId, "surgical_edit", "surgical_edit", "failed",
        {
          tokensUsed: surgicalResult.tokensUsed,
          error: surgicalResult.error,
          requiresFullRegeneration: surgicalResult.data?.requiresFullRegeneration,
        },
        surgicalResult.tokensUsed, surgicalResult.durationMs
      );

      console.log(`Build ${buildId}: surgical edit failed, falling back to full codegen. Reason: ${surgicalResult.error}`);
      logExecution(buildId, projectId, null, "system", "surgical_fallback_to_codegen", "in_progress", {
        reason: surgicalResult.error,
      });

      context.tokensUsedSoFar = totalTokens;
      }
    }

    if (!codegenAgent.hasAnyPermission(["generate_code", "create_files"])) {
      logExecution(buildId, projectId, null, "system", "permission_denied", "failed", {
        agent: "codegen",
        message: lang === "ar"
          ? "وكيل البرمجة لا يملك صلاحية توليد الكود — تحقق من إعدادات الصلاحيات"
          : "Codegen agent lacks generate_code permission — check permission settings",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const codegenTaskId = await createTask(buildId, projectId, "codegen", prompt);
    logExecution(buildId, projectId, codegenTaskId, "codegen", "generate_code", "in_progress", {
      message: lang === "ar"
        ? "أبدأ الآن بكتابة الكود... أحلل البنية المطلوبة وأحدد الملفات والمكونات"
        : "Starting code generation... analyzing required structure, files, and components",
    });

    codegenAgent.logActivity("generate_code", "Starting code generation", "بدأ توليد الكود", { status: "in_progress", buildId, projectId, details: { model: codegenAgent.modelConfig.model, promptLength: prompt.length } });

    const codegenResult = await codegenAgent.execute(context);
    totalTokens += codegenResult.tokensUsed;
    const codegenCost = estimateCost(codegenResult.tokensUsed, codegenAgent.modelConfig.model);
    totalCost += codegenCost;

    recordTokenUsage(userId, projectId, buildId, "codegen", codegenAgent.modelConfig.model, codegenResult.tokensUsed, codegenCost);

    if (codegenResult.success) {
      await completeTask(codegenTaskId, codegenResult.tokensUsed, codegenCost, codegenResult.durationMs);
    } else {
      await failTask(codegenTaskId, codegenResult.error ?? "Unknown error", codegenResult.durationMs);
    }

    {
      const _genFiles = (codegenResult.data?.files as GeneratedFile[]) || [];
      const _genNames = _genFiles.map(f => f.filePath);
      const _genDur = Math.round((codegenResult.durationMs || 0) / 1000);
      logExecution(
        buildId, projectId, codegenTaskId, "codegen", "generate_code",
        codegenResult.success ? "completed" : "failed",
        {
          tokensUsed: codegenResult.tokensUsed, error: codegenResult.error,
          fileCount: _genNames.length, files: _genNames.slice(0, 25),
          message: codegenResult.success
            ? (lang === "ar" ? `تم توليد ${_genNames.length} ملف في ${_genDur} ثانية:\n${_genNames.map(f => `  📄 ${f}`).join("\n")}` : `Generated ${_genNames.length} files in ${_genDur}s:\n${_genNames.map(f => `  📄 ${f}`).join("\n")}`)
            : (lang === "ar" ? `فشل توليد الكود: ${codegenResult.error}` : `Code generation failed: ${codegenResult.error}`),
        },
        codegenResult.tokensUsed, codegenResult.durationMs
      );
    }

    if (!codegenResult.success) {
      console.error(`Build ${buildId} codegen failed:`, codegenResult.error);
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const postCodegenLimit = await checkSpendingLimits(userId, projectId);
    if (!postCodegenLimit.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
        reason: postCodegenLimit.reason,
        after_agent: "codegen",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    let generatedFiles = codegenResult.data?.files as GeneratedFile[];
    context.tokensUsedSoFar = totalTokens;
    context.existingFiles = generatedFiles.map((f) => ({
      filePath: f.filePath,
      content: f.content,
    }));

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const codegenSendsTo = codegenAgent.getSendsTo();
    const reviewerHasPermission = reviewerAgent.hasAnyPermission(["read_code", "report_issues", "score_quality"]);
    const fixerHasPermission = fixerAgent.hasAnyPermission(["fix_issues", "modify_code"]);
    const skipReview = codegenSendsTo === "output" || !reviewerHasPermission;
    const skipFixer = skipReview || !fixerHasPermission;

    if (skipReview) {
      const skipReason = !reviewerHasPermission ? "no_permission" : "sendsTo_output";
      console.log(`[Pipeline] skipping reviewer (${skipReason}) and fixer`);
      logExecution(buildId, projectId, null, "system", "pipeline_skip_review", "completed", {
        reason: skipReason,
        message: lang === "ar"
          ? (!reviewerHasPermission ? "تم تخطي المراجعة — المراجع لا يملك الصلاحيات المطلوبة" : "تم تخطي المراجعة — الوكيل مُعدّ للتسليم المباشر")
          : (!reviewerHasPermission ? "Review skipped — reviewer lacks required permissions" : "Review skipped — agent configured for direct output"),
      });
    }

    let reviewApproved = skipReview;
    let errorIssues: CodeIssue[] = [];

    if (!skipReview) {
    const reviewerReceivesFrom = reviewerAgent.getReceivesFrom();
    const reviewContext = { ...context };
    if (reviewerReceivesFrom === "user_input") {
      reviewContext.existingFiles = existingFiles.map(f => ({ filePath: f.filePath, content: f.content }));
      console.log(`[Pipeline] reviewer receivesFrom=user_input — reviewing original files instead of codegen output`);
    }

    const reviewTaskId = await createTask(buildId, projectId, "reviewer");
    logExecution(buildId, projectId, reviewTaskId, "reviewer", "review_code", "in_progress", {
      source: reviewerReceivesFrom || "codegen",
      message: lang === "ar"
        ? "أراجع الكود المُولَّد... أبحث عن أخطاء، مشاكل أمنية، وأفضل الممارسات"
        : "Reviewing generated code... checking for errors, security issues, and best practices",
    });

    const reviewResult = await reviewerAgent.execute(reviewContext);
    totalTokens += reviewResult.tokensUsed;
    const reviewCost = estimateCost(reviewResult.tokensUsed, reviewerAgent.modelConfig.model);
    totalCost += reviewCost;

    recordTokenUsage(userId, projectId, buildId, "reviewer", reviewerAgent.modelConfig.model, reviewResult.tokensUsed, reviewCost);

    if (reviewResult.success) {
      await completeTask(reviewTaskId, reviewResult.tokensUsed, reviewCost, reviewResult.durationMs);
    } else {
      await failTask(reviewTaskId, reviewResult.error ?? "Unknown error", reviewResult.durationMs);
    }

    logExecution(
      buildId, projectId, reviewTaskId, "reviewer", "review_code",
      reviewResult.success ? "completed" : "failed",
      reviewResult.data,
      reviewResult.tokensUsed,
      reviewResult.durationMs
    );

    if (!reviewResult.success) {
      console.error(`Build ${buildId} review failed:`, reviewResult.error);
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const postReviewLimit = await checkSpendingLimits(userId, projectId);
    if (!postReviewLimit.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
        reason: postReviewLimit.reason,
        after_agent: "reviewer",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const review = reviewResult.data?.review as
      | { approved: boolean; issues: CodeIssue[] }
      | undefined;

    reviewApproved = !review || review.approved || review.issues.length === 0;
    if (review && !review.approved && review.issues.length > 0) {
      errorIssues = review.issues.filter((i) => i.severity === "error");
    }
    }

    if (!reviewApproved && errorIssues.length > 0) {
      if (build.cancelRequested) {
        await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
        return;
      }

      const fixerReceivesFrom = fixerAgent.getReceivesFrom();
      const fixerSkipReviewIssues = fixerReceivesFrom === "codegen";
      if (fixerSkipReviewIssues) {
        console.log(`[Pipeline] fixer receivesFrom=codegen — ignoring review issues, applying own analysis`);
      }

      if (errorIssues.length === 0 || skipFixer || fixerSkipReviewIssues) {
        console.log(`Build ${buildId}: review had warnings/info only or fixer skipped/overridden, proceeding`);
      } else {
        const fixTaskId = await createTask(buildId, projectId, "fixer");
        logExecution(buildId, projectId, fixTaskId, "fixer", "fix_code", "in_progress", {
          issueCount: errorIssues.length,
          message: lang === "ar"
            ? `وجدت ${errorIssues.length} خطأ — أصلحها الآن:\n${errorIssues.slice(0, 5).map(i => `  🔧 ${i.file || ''}: ${i.message}`).join("\n")}`
            : `Found ${errorIssues.length} error(s) — fixing now:\n${errorIssues.slice(0, 5).map(i => `  🔧 ${i.file || ''}: ${i.message}`).join("\n")}`,
        });

        context.tokensUsedSoFar = totalTokens;
        const fixResult = await fixerAgent.executeWithIssues(context, errorIssues);
        totalTokens += fixResult.tokensUsed;
        const fixCost = estimateCost(fixResult.tokensUsed, fixerAgent.modelConfig.model);
        totalCost += fixCost;

        recordTokenUsage(userId, projectId, buildId, "fixer", fixerAgent.modelConfig.model, fixResult.tokensUsed, fixCost);

        if (fixResult.success) {
          await completeTask(fixTaskId, fixResult.tokensUsed, fixCost, fixResult.durationMs);
        } else {
          await failTask(fixTaskId, fixResult.error ?? "Unknown error", fixResult.durationMs);
        }

        logExecution(
          buildId, projectId, fixTaskId, "fixer", "fix_code",
          fixResult.success ? "completed" : "failed",
          { tokensUsed: fixResult.tokensUsed },
          fixResult.tokensUsed,
          fixResult.durationMs
        );

        if (!fixResult.success) {
          console.error(`Build ${buildId} fixer failed:`, fixResult.error);
          await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
          return;
        }

        const postFixerLimit = await checkSpendingLimits(userId, projectId);
        if (!postFixerLimit.allowed) {
          logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
            reason: postFixerLimit.reason,
            after_agent: "fixer",
          });
          await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
          return;
        }

        if (fixResult.data?.files) {
          const fixedFiles = fixResult.data.files as GeneratedFile[];
          const fixedMap = new Map(fixedFiles.map(f => [f.filePath, f]));
          generatedFiles = generatedFiles.map(f => fixedMap.get(f.filePath) || f);
          for (const ff of fixedFiles) {
            if (!generatedFiles.some(g => g.filePath === ff.filePath)) {
              generatedFiles.push(ff);
            }
          }
        }
      }
    }

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const generatedDirectories = codegenResult.data?.directories as string[] | undefined;

    const saveTaskId = await createTask(buildId, projectId, "filemanager");
    const _fileNames = generatedFiles.map(f => f.filePath);
    logExecution(buildId, projectId, saveTaskId, "filemanager", "save_files", "in_progress", {
      fileCount: generatedFiles.length,
      directoryCount: generatedDirectories?.length ?? 0,
      message: lang === "ar"
        ? `أحفظ ${generatedFiles.length} ملف في المشروع:\n${_fileNames.slice(0, 10).map(f => `  💾 ${f}`).join("\n")}${_fileNames.length > 10 ? `\n  ... و ${_fileNames.length - 10} ملف آخر` : ""}`
        : `Saving ${generatedFiles.length} files to project:\n${_fileNames.slice(0, 10).map(f => `  💾 ${f}`).join("\n")}${_fileNames.length > 10 ? `\n  ... and ${_fileNames.length - 10} more` : ""}`,
    });

    const saveResult = await fileManager.saveFiles(projectId, generatedFiles, generatedDirectories);

    if (saveResult.success) {
      await completeTask(saveTaskId, 0, 0, saveResult.durationMs);
    } else {
      await failTask(saveTaskId, "Failed to save some files", saveResult.durationMs);
    }

    logExecution(
      buildId, projectId, saveTaskId, "filemanager", "save_files",
      saveResult.success ? "completed" : "failed",
      {
        ...saveResult.data as Record<string, unknown>,
        message: saveResult.success
          ? (lang === "ar" ? `تم حفظ ${generatedFiles.length} ملف بنجاح` : `Successfully saved ${generatedFiles.length} files`)
          : (lang === "ar" ? "فشل حفظ بعض الملفات" : "Failed to save some files"),
      },
      0,
      saveResult.durationMs
    );

    if (saveResult.success) {
      if (build.cancelRequested) {
        await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
        return;
      }

      const runnerTaskId = await createTask(buildId, projectId, "package_runner");
      logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "in_progress", {
        fileCount: generatedFiles.length,
      });

      const runnerStartTime = Date.now();
      const packageRunner = new PackageRunnerAgent(constitution);
      setRunner(buildId, packageRunner);

      const outputLogs: { type: string; message: string; timestamp: string }[] = [];
      packageRunner.onOutput((output) => {
        outputLogs.push(output);
      });

      try {
        const runnerResult = await packageRunner.executeWithFiles(projectId, generatedFiles);
        const runnerDuration = Date.now() - runnerStartTime;

        if (runnerResult.success) {
          await completeTask(runnerTaskId, 0, 0, runnerDuration);
        } else {
          await failTask(runnerTaskId, runnerResult.error ?? "Package runner failed", runnerDuration);
        }

        logExecution(
          buildId, projectId, runnerTaskId, "package_runner", "install_and_run",
          runnerResult.success ? "completed" : "failed",
          {
            ...runnerResult.data,
            outputLogCount: outputLogs.length,
            lastOutput: outputLogs.slice(-5).map((l) => l.message).join("\n"),
          },
          0,
          runnerDuration
        );

        if (!runnerResult.success) {
          console.error(`Build ${buildId} package runner failed:`, runnerResult.error);
        }
      } catch (runnerError) {
        const runnerDuration = Date.now() - runnerStartTime;
        const errMsg = runnerError instanceof Error ? runnerError.message : String(runnerError);
        await failTask(runnerTaskId, errMsg, runnerDuration);
        logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "failed", {
          error: errMsg,
        }, 0, runnerDuration);
        console.error(`Build ${buildId} package runner error:`, runnerError);
      }

      try {
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "in_progress");
        const qaReportId = await runQaWithRetry(buildId, projectId, userId);
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "completed", { qaReportId });
      } catch (qaError) {
        console.error(`Build ${buildId} QA pipeline error:`, qaError);
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "failed", {
          error: qaError instanceof Error ? qaError.message : String(qaError),
        });
      }
    }

    const finalStatus = !saveResult.success ? "failed" : "completed";
    await finalizeBuild(buildId, projectId, finalStatus, totalTokens, totalCost);
  } catch (error) {
    console.error(`Build ${buildId} error:`, error);
    logExecution(buildId, projectId, null, "system", "build_error", "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
  }
}

const MODULE_CONCURRENCY = 15;
const BATCHED_BUILD_THRESHOLD = 15;
const MAX_FILES_PER_MODULE = 12;

const BUILD_TIMEOUT_MS: Record<string, number> = {
  small: 10 * 60 * 1000,
  medium: 15 * 60 * 1000,
  large: 20 * 60 * 1000,
};

function getBuildTimeoutMs(totalFiles: number): number {
  if (totalFiles < 250) return BUILD_TIMEOUT_MS.small;
  if (totalFiles < 400) return BUILD_TIMEOUT_MS.medium;
  return BUILD_TIMEOUT_MS.large;
}

function shouldUseBatchedBuild(prompt: string, existingFileCount: number): boolean {
  if (existingFileCount > 0) return false;
  const lower = prompt.toLowerCase();
  const bigProjectKeywords = [
    "مزاد", "منصة", "platform", "marketplace", "سوق",
    "dashboard", "لوحة", "نظام", "system", "crm", "erp",
    "e-commerce", "ecommerce", "متجر", "shop",
    "social", "اجتماعي", "chat", "دردشة",
    "booking", "حجز", "real-time",
    "500", "كبير", "large", "complex", "معقد",
    "عديد", "many pages", "multi",
  ];
  const score = bigProjectKeywords.filter(k => lower.includes(k)).length;
  const wordCount = prompt.split(/\s+/).length;
  return score >= 2 || wordCount > 100;
}

interface PlannedModule {
  name: string;
  nameAr: string;
  description: string;
  files: string[];
}

async function planModulesForBuild(
  prompt: string,
  constitution: ReturnType<typeof getConstitution>
): Promise<{ framework: string; files: string[]; packages: string[]; directories: string[]; modules: PlannedModule[] }> {
  const plannerAgent = new PlannerAgent(constitution);
  const context: BuildContext = {
    buildId: "plan-only",
    projectId: "plan-only",
    userId: "plan-only",
    prompt,
    existingFiles: [],
    tokensUsedSoFar: 0,
  };

  const result = await plannerAgent.execute(context);
  if (!result.success || !result.data?.plan) {
    throw new Error(result.error || "Planning failed");
  }

  const plan = result.data.plan as ProjectPlan;

  const modules: PlannedModule[] = plan.phases.map(p => ({
    name: p.name,
    nameAr: p.nameAr,
    description: p.description,
    files: p.files,
  }));

  if (modules.length === 0) {
    modules.push({ name: "all", nameAr: "الكل", description: "All files", files: plan.files });
  }

  return {
    framework: plan.framework,
    files: plan.files,
    packages: plan.packages,
    directories: plan.directoryStructure,
    modules,
  };
}

async function executeBatchedBuildPipeline(
  buildId: string,
  projectId: string,
  userId: string,
  prompt: string,
  constitution: ReturnType<typeof getConstitution>
) {
  const build = activeBuilds.get(buildId)!;
  build.status = "in_progress";
  const lang = detectLang(prompt);

  const codegenAgent = new CodeGenAgent(constitution);
  const fileManager = new FileManagerAgent(constitution);
  await codegenAgent.loadConfigFromDB();

  let totalTokens = 0;
  let totalCost = 0;

  try {
    if (!codegenAgent.hasAnyPermission(["generate_code", "create_files"])) {
      logExecution(buildId, projectId, null, "system", "permission_denied", "failed", {
        agent: "codegen",
        message: lang === "ar"
          ? "وكيل البرمجة لا يملك صلاحية توليد الكود — تحقق من إعدادات الصلاحيات"
          : "Codegen agent lacks generate_code permission — check permission settings",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    logExecution(buildId, projectId, null, "system", "build_started", "in_progress", {
      prompt, mode: "module-parallel",
      message: lang === "ar"
        ? `بدأ بناء المشروع بنظام الأقسام المتوازية — "${prompt.slice(0, 80)}"`
        : `Build started (module-parallel mode) — "${prompt.slice(0, 80)}"`,
    });

    const limitCheck = await checkSpendingLimits(userId, projectId);
    if (!limitCheck.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded", "failed", { reason: limitCheck.reason });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    logExecution(buildId, projectId, null, "planner", "planning_modules", "in_progress", {
      message: lang === "ar"
        ? "أخطط بنية المشروع وأقسّمه لأقسام مستقلة..."
        : "Planning project structure and splitting into modules...",
    });

    let modulePlan: { framework: string; files: string[]; packages: string[]; directories: string[]; modules: PlannedModule[] };
    try {
      modulePlan = await planModulesForBuild(prompt, constitution);
    } catch (planErr) {
      console.error(`Build ${buildId} planning failed, falling back to single-shot:`, planErr);
      logExecution(buildId, projectId, null, "planner", "planning_modules", "failed", {
        error: planErr instanceof Error ? planErr.message : String(planErr),
        message: lang === "ar" ? "فشل التخطيط — أرجع للتوليد العادي" : "Planning failed — falling back to normal generation",
      });
      activeBuilds.delete(buildId);
      const newBuild: ActiveBuild = { buildId, projectId, userId, status: "in_progress", cancelRequested: false };
      activeBuilds.set(buildId, newBuild);
      await executeBuildPipeline(buildId, projectId, userId, prompt + "\n[FORCE_SINGLE_SHOT]", constitution);
      return;
    }

    const rawModules = modulePlan.modules;
    const modules: PlannedModule[] = [];
    for (const mod of rawModules) {
      if (mod.files.length > MAX_FILES_PER_MODULE) {
        const chunks: string[][] = [];
        for (let i = 0; i < mod.files.length; i += MAX_FILES_PER_MODULE) {
          chunks.push(mod.files.slice(i, i + MAX_FILES_PER_MODULE));
        }
        chunks.forEach((chunk, ci) => {
          modules.push({
            name: `${mod.name}-part${ci + 1}`,
            nameAr: mod.nameAr ? `${mod.nameAr}-${ci + 1}` : "",
            description: `${mod.description} (part ${ci + 1})`,
            files: chunk,
          });
        });
      } else {
        modules.push(mod);
      }
    }
    const totalModules = modules.length;
    const totalPlannedFiles = modulePlan.files.length;
    const allModuleNames = modules.map(m => m.name);

    const buildTimeout = getBuildTimeoutMs(totalPlannedFiles);
    const buildDeadline = Date.now() + buildTimeout;

    logExecution(buildId, projectId, null, "planner", "planning_modules", "completed", {
      framework: modulePlan.framework,
      totalFiles: totalPlannedFiles,
      totalModules,
      timeoutMinutes: Math.round(buildTimeout / 60000),
      modules: modules.map(m => ({ name: m.name, nameAr: m.nameAr, files: m.files.length })),
      message: lang === "ar"
        ? `خطة المشروع: ${totalPlannedFiles} ملف في ${totalModules} حزمة (${modulePlan.framework}) — الحد الزمني: ${Math.round(buildTimeout / 60000)} دقيقة`
        : `Project plan: ${totalPlannedFiles} files in ${totalModules} chunks (${modulePlan.framework}) — timeout: ${Math.round(buildTimeout / 60000)} min`,
    });

    const { getProjectTemplate } = await import("./project-templates");
    const rawFw = (modulePlan.framework || "react-vite").toLowerCase();
    const frameworkMap: Record<string, string> = { "react": "react-vite", "vite": "react-vite", "react-vite": "react-vite", "next": "nextjs", "nextjs": "nextjs", "express": "express", "fastapi": "fastapi", "static": "static", "html": "static" };
    const framework = (frameworkMap[rawFw] || "react-vite") as any;

    const allGeneratedFiles: GeneratedFile[] = [];
    let allDeps: Record<string, string> = {};
    let allDevDeps: Record<string, string> = {};
    let allScripts: Record<string, string> = {};

    const spendCheckOnce = await checkSpendingLimits(userId, projectId);
    if (!spendCheckOnce.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded", "failed", { reason: spendCheckOnce.reason });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const coreModuleIdx = modules.findIndex(m => m.name.toLowerCase() === "core" || m.name.toLowerCase() === "setup" || m.name.toLowerCase() === "base");
    let coreFiles: GeneratedFile[] = [];

    if (coreModuleIdx >= 0) {
      const coreModule = modules[coreModuleIdx];
      const coreTaskId = await createTask(buildId, projectId, "codegen", `Module: ${coreModule.name}`);

      logExecution(buildId, projectId, coreTaskId, "codegen", "generate_module", "in_progress", {
        moduleName: coreModule.name, moduleNameAr: coreModule.nameAr, totalModules, files: coreModule.files,
        message: lang === "ar"
          ? `🔧 أبني القسم الأساسي "${coreModule.nameAr}" (${coreModule.files.length} ملف)...`
          : `🔧 Building core module "${coreModule.name}" (${coreModule.files.length} files)...`,
      });

      const coreAgent = new CodeGenAgent(constitution);
      const ctx: BuildContext = {
        buildId, projectId, userId, prompt,
        existingFiles: [],
        tokensUsedSoFar: totalTokens,
        framework: framework,
      };

      const coreResult = await coreAgent.executeModule(ctx, coreModule.name, coreModule.description, coreModule.files, 0, totalModules, allModuleNames, []);
      
      if (coreResult.success) {
        coreFiles = (coreResult.data?.files as GeneratedFile[]) || [];
        const coreCost = estimateCost(coreResult.tokensUsed, codegenAgent.modelConfig.model);
        totalTokens += coreResult.tokensUsed;
        totalCost += coreCost;
        recordTokenUsage(userId, projectId, buildId, "codegen", codegenAgent.modelConfig.model, coreResult.tokensUsed, coreCost);
        await completeTask(coreTaskId, coreResult.tokensUsed, coreCost, coreResult.durationMs);

        for (const f of coreFiles) allGeneratedFiles.push(f);
        if (coreResult.data?.dependencies) Object.assign(allDeps, coreResult.data.dependencies as Record<string, string>);
        if (coreResult.data?.devDependencies) Object.assign(allDevDeps, coreResult.data.devDependencies as Record<string, string>);
        if (coreResult.data?.scripts) Object.assign(allScripts, coreResult.data.scripts as Record<string, string>);

        const earlyTemplate = getProjectTemplate(framework) || { dependencies: {}, devDependencies: {}, scripts: {}, baseFiles: [], directories: [] };
        const earlyDeps = { ...(earlyTemplate.dependencies || {}), ...allDeps };
        const earlyDevDeps = { ...(earlyTemplate.devDependencies || {}), ...allDevDeps };
        const earlyScripts = { ...(earlyTemplate.scripts || {}), ...allScripts };
        const earlyFiles: GeneratedFile[] = [...allGeneratedFiles];

        if (framework !== "fastapi") {
          const earlyPkg: GeneratedFile = {
            filePath: "package.json",
            content: JSON.stringify({
              name: "generated-project", version: "1.0.0", private: true,
              scripts: earlyScripts, dependencies: earlyDeps, devDependencies: earlyDevDeps,
            }, null, 2),
            fileType: "json",
          };
          const pkgIdx = earlyFiles.findIndex(f => f.filePath === "package.json");
          if (pkgIdx >= 0) earlyFiles[pkgIdx] = earlyPkg;
          else earlyFiles.push(earlyPkg);
        }
        for (const tf of (earlyTemplate.baseFiles || [])) {
          if (!earlyFiles.some(f => f.filePath === tf.filePath)) {
            earlyFiles.push(tf);
          }
        }

        await fileManager.saveFiles(projectId, [...earlyFiles]);

        logExecution(buildId, projectId, coreTaskId, "codegen", "generate_module", "completed", {
          moduleName: coreModule.name, fileCount: coreFiles.length,
          message: lang === "ar"
            ? `✅ القسم الأساسي "${coreModule.nameAr}": ${coreFiles.length} ملف — جاهز، أبدأ باقي الأقسام بالتوازي`
            : `✅ Core module "${coreModule.name}": ${coreFiles.length} files — ready, starting parallel modules`,
        }, coreResult.tokensUsed, coreResult.durationMs);

        const earlyRunner = new PackageRunnerAgent(constitution);
        setRunner(buildId, earlyRunner);
        const earlyInitResult = await earlyRunner.initSandboxEarly(projectId, earlyFiles);
        if (earlyInitResult) {
          logExecution(buildId, projectId, null, "package_runner", "early_sandbox", "completed", {
            sandboxId: earlyInitResult.sandboxId,
            port: earlyInitResult.port,
            serverStarted: true,
            message: lang === "ar"
              ? `🖥️ المعاينة الحية جاهزة — الموقع يتبنى أمامك الآن`
              : `🖥️ Live preview ready — site building in real-time`,
          });
        }
      } else {
        logExecution(buildId, projectId, coreTaskId, "codegen", "generate_module", "failed", {
          moduleName: coreModule.name, error: coreResult.error,
        }, coreResult.tokensUsed, coreResult.durationMs);
      }

      modules.splice(coreModuleIdx, 1);
    }

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const remainingModules = modules;
    if (remainingModules.length > 0) {
      const codegenConfig = await getAgentConfig("codegen");
      const rawBatchSize = codegenConfig?.batchSize || 10;
      const concurrencyLimit = Math.max(1, Math.min(rawBatchSize, 50));

      logExecution(buildId, projectId, null, "system", "parallel_modules_started", "in_progress", {
        moduleCount: remainingModules.length,
        concurrencyLimit,
        message: lang === "ar"
          ? `🚀 أطلق ${remainingModules.length} وكيل مبرمج (${concurrencyLimit} بالتوازي): ${remainingModules.map(m => m.nameAr || m.name).join(", ")}`
          : `🚀 Launching ${remainingModules.length} parallel agents (${concurrencyLimit} concurrent): ${remainingModules.map(m => m.name).join(", ")}`,
      });

      let earlySandboxInitiated = !!getRunner(buildId);

      const processModule = async (mod: PlannedModule, idx: number) => {
        const moduleTaskId = await createTask(buildId, projectId, "codegen", `Module: ${mod.name}`);

        logExecution(buildId, projectId, moduleTaskId, "codegen", "generate_module", "in_progress", {
          moduleName: mod.name, moduleNameAr: mod.nameAr, files: mod.files,
          message: lang === "ar"
            ? `👨‍💻 الوكيل "${mod.nameAr || mod.name}": يبني ${mod.files.length} ملف...`
            : `👨‍💻 Agent "${mod.name}": building ${mod.files.length} files...`,
        });

        const agent = new CodeGenAgent(constitution);
        const ctx: BuildContext = {
          buildId, projectId, userId, prompt,
          existingFiles: [],
          tokensUsedSoFar: totalTokens,
          framework: framework,
        };

        const result = await agent.executeModule(
          ctx, mod.name, mod.description, mod.files, idx + 1, totalModules, allModuleNames, coreFiles
        );

        if (result.success) {
          const moduleFiles = (result.data?.files as GeneratedFile[]) || [];
          const modCost = estimateCost(result.tokensUsed, codegenAgent.modelConfig.model);
          totalTokens += result.tokensUsed;
          totalCost += modCost;
          recordTokenUsage(userId, projectId, buildId, "codegen", codegenAgent.modelConfig.model, result.tokensUsed, modCost);
          await completeTask(moduleTaskId, result.tokensUsed, modCost, result.durationMs);

          for (const f of moduleFiles) {
            const existIdx = allGeneratedFiles.findIndex(g => g.filePath === f.filePath);
            if (existIdx >= 0) allGeneratedFiles[existIdx] = f;
            else allGeneratedFiles.push(f);
          }
          if (result.data?.dependencies) Object.assign(allDeps, result.data.dependencies as Record<string, string>);
          if (result.data?.devDependencies) Object.assign(allDevDeps, result.data.devDependencies as Record<string, string>);
          if (result.data?.scripts) Object.assign(allScripts, result.data.scripts as Record<string, string>);

          await fileManager.saveFiles(projectId, [...allGeneratedFiles]);

          if (!earlySandboxInitiated) {
            earlySandboxInitiated = true;
            try {
              const template = getProjectTemplate(framework) || { dependencies: {}, devDependencies: {}, scripts: {}, baseFiles: [], directories: [] };
              const initFiles: GeneratedFile[] = [...allGeneratedFiles];
              const initDeps = { ...(template.dependencies || {}), ...allDeps };
              const initDevDeps = { ...(template.devDependencies || {}), ...allDevDeps };
              const initScripts = { ...(template.scripts || {}), ...allScripts };
              if (framework !== "fastapi") {
                const initPkg: GeneratedFile = {
                  filePath: "package.json",
                  content: JSON.stringify({ name: "generated-project", version: "1.0.0", private: true, scripts: initScripts, dependencies: initDeps, devDependencies: initDevDeps }, null, 2),
                  fileType: "json",
                };
                const pkgIdx = initFiles.findIndex(f => f.filePath === "package.json");
                if (pkgIdx >= 0) initFiles[pkgIdx] = initPkg;
                else initFiles.push(initPkg);
              }
              for (const tf of (template.baseFiles || [])) {
                if (!initFiles.some(f => f.filePath === tf.filePath)) initFiles.push(tf);
              }

              const firstRunner = new PackageRunnerAgent(constitution);
              setRunner(buildId, firstRunner);
              const initResult = await firstRunner.initSandboxEarly(projectId, initFiles);
              if (initResult) {
                logExecution(buildId, projectId, null, "package_runner", "early_sandbox", "completed", {
                  sandboxId: initResult.sandboxId, port: initResult.port, serverStarted: true,
                  message: lang === "ar"
                    ? `🖥️ المعاينة الحية جاهزة — الموقع يتبنى أمامك الآن`
                    : `🖥️ Live preview ready — site building in real-time`,
                });
              }
            } catch (earlyErr) {
              console.error(`Build ${buildId}: early sandbox init failed:`, earlyErr);
            }
          } else {
            try {
              const runner = getRunner(buildId);
              if (runner) {
                const written = runner.updateSandboxFiles(moduleFiles);
                logExecution(buildId, projectId, moduleTaskId, "package_runner", "live_file_sync", "completed", {
                  moduleName: mod.name, filesWritten: written,
                  message: lang === "ar"
                    ? `🔄 تحديث مباشر: ${written} ملف من "${mod.nameAr || mod.name}"`
                    : `🔄 Live sync: ${written} files from "${mod.name}"`,
                });
              }
            } catch (syncErr) {
              console.warn(`Build ${buildId}: live sync for module ${mod.name} failed:`, syncErr);
            }
          }

          logExecution(buildId, projectId, moduleTaskId, "codegen", "generate_module", "completed", {
            moduleName: mod.name, fileCount: moduleFiles.length,
            files: moduleFiles.map(f => f.filePath),
            message: lang === "ar"
              ? `✅ الوكيل "${mod.nameAr || mod.name}": أنهى ${moduleFiles.length} ملف ودمجها`
              : `✅ Agent "${mod.name}": completed ${moduleFiles.length} files and merged`,
          }, result.tokensUsed, result.durationMs);
        } else {
          const modCost = estimateCost(result.tokensUsed, codegenAgent.modelConfig.model);
          totalTokens += result.tokensUsed;
          totalCost += modCost;
          recordTokenUsage(userId, projectId, buildId, "codegen", codegenAgent.modelConfig.model, result.tokensUsed, modCost);
          await failTask(moduleTaskId, result.error ?? "Module failed", result.durationMs);
          logExecution(buildId, projectId, moduleTaskId, "codegen", "generate_module", "failed", {
            moduleName: mod.name, error: result.error,
            message: lang === "ar"
              ? `❌ فشل الوكيل "${mod.nameAr || mod.name}": ${result.error}`
              : `❌ Agent "${mod.name}" failed: ${result.error}`,
          }, result.tokensUsed, result.durationMs);
        }

        return { result, moduleTaskId, mod };
      };

      const effectiveConcurrency = Math.max(concurrencyLimit, Math.min(remainingModules.length, MODULE_CONCURRENCY));
      const batches: PlannedModule[][] = [];
      for (let i = 0; i < remainingModules.length; i += effectiveConcurrency) {
        batches.push(remainingModules.slice(i, i + effectiveConcurrency));
      }

      let globalIdx = 0;
      for (const batch of batches) {
        if (Date.now() > buildDeadline) {
          logExecution(buildId, projectId, null, "system", "build_timeout", "completed", {
            message: lang === "ar"
              ? `⏱️ انتهى الوقت المحدد — سأكمل بالملفات المتوفرة (${allGeneratedFiles.length} ملف)`
              : `⏱️ Build timeout reached — finalizing with ${allGeneratedFiles.length} files generated so far`,
          });
          break;
        }
        if (build.cancelRequested) break;

        const batchPromises = batch.map((mod, localIdx) => processModule(mod, globalIdx + localIdx));
        await Promise.allSettled(batchPromises);
        globalIdx += batch.length;
      }
    }

    if (allGeneratedFiles.length === 0) {
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const template = getProjectTemplate(framework) || { dependencies: {}, devDependencies: {}, scripts: {}, baseFiles: [], directories: [] };

    const mergedDeps = { ...(template.dependencies || {}), ...allDeps };
    const mergedDevDeps = { ...(template.devDependencies || {}), ...allDevDeps };
    const mergedScripts = { ...(template.scripts || {}), ...allScripts };

    if (framework !== "fastapi") {
      const packageJson: GeneratedFile = {
        filePath: "package.json",
        content: JSON.stringify({
          name: "generated-project",
          version: "1.0.0",
          private: true,
          scripts: mergedScripts,
          dependencies: mergedDeps,
          devDependencies: mergedDevDeps,
        }, null, 2),
        fileType: "json",
      };
      const pkgIdx = allGeneratedFiles.findIndex(f => f.filePath === "package.json");
      if (pkgIdx >= 0) allGeneratedFiles[pkgIdx] = packageJson;
      else allGeneratedFiles.push(packageJson);
    }

    for (const tf of (template.baseFiles || [])) {
      if (!allGeneratedFiles.some(f => f.filePath === tf.filePath)) {
        allGeneratedFiles.push(tf);
      }
    }

    fixBrokenImports(allGeneratedFiles);

    logExecution(buildId, projectId, null, "filemanager", "save_files", "in_progress", {
      fileCount: allGeneratedFiles.length,
      message: lang === "ar"
        ? `أحفظ جميع الملفات النهائية (${allGeneratedFiles.length} ملف)...`
        : `Saving all final files (${allGeneratedFiles.length} files)...`,
    });

    const finalSave = await fileManager.saveFiles(projectId, allGeneratedFiles);
    logExecution(buildId, projectId, null, "filemanager", "save_files",
      finalSave.success ? "completed" : "failed", {
        fileCount: allGeneratedFiles.length,
        message: finalSave.success
          ? (lang === "ar" ? `تم حفظ ${allGeneratedFiles.length} ملف بنجاح` : `Successfully saved ${allGeneratedFiles.length} files`)
          : (lang === "ar" ? "فشل حفظ الملفات" : "Failed to save files"),
      }, 0, finalSave.durationMs
    );

    if (finalSave.success && !build.cancelRequested) {
      const runnerTaskId = await createTask(buildId, projectId, "package_runner");
      logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "in_progress", {
        fileCount: allGeneratedFiles.length,
        message: lang === "ar"
          ? `أثبّت الحزم وأشغّل المشروع (${allGeneratedFiles.length} ملف)...`
          : `Installing packages and running project (${allGeneratedFiles.length} files)...`,
      });

      const runnerStartTime = Date.now();
      const existingRunner = getRunner(buildId);
      const packageRunner = existingRunner || new PackageRunnerAgent(constitution);
      if (!existingRunner) setRunner(buildId, packageRunner);

      try {
        const runnerResult = await packageRunner.executeWithFiles(projectId, allGeneratedFiles);
        const runnerDuration = Date.now() - runnerStartTime;

        if (runnerResult.success) {
          await completeTask(runnerTaskId, 0, 0, runnerDuration);
        } else {
          await failTask(runnerTaskId, runnerResult.error ?? "Package runner failed", runnerDuration);
        }

        logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run",
          runnerResult.success ? "completed" : "failed", runnerResult.data, 0, runnerDuration);
      } catch (runnerError) {
        const runnerDuration = Date.now() - runnerStartTime;
        const errMsg = runnerError instanceof Error ? runnerError.message : String(runnerError);
        await failTask(runnerTaskId, errMsg, runnerDuration);
        logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "failed", { error: errMsg }, 0, runnerDuration);
      }

      try {
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "in_progress");
        const qaReportId = await runQaWithRetry(buildId, projectId, userId);
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "completed", { qaReportId });
      } catch (qaError) {
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "failed", {
          error: qaError instanceof Error ? qaError.message : String(qaError),
        });
      }
    }

    const finalStatus = build.cancelRequested ? "cancelled" : (finalSave.success ? "completed" : "failed");
    await finalizeBuild(buildId, projectId, finalStatus, totalTokens, totalCost);
  } catch (error) {
    console.error(`Build ${buildId} (module-parallel) error:`, error);
    logExecution(buildId, projectId, null, "system", "build_error", "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
  }
}

function mergeFiles(
  existingFiles: { filePath: string; content: string }[],
  patchedFiles: GeneratedFile[]
): GeneratedFile[] {
  const fileMap = new Map<string, GeneratedFile>();

  for (const f of existingFiles) {
    fileMap.set(f.filePath, {
      filePath: f.filePath,
      content: f.content,
      fileType: f.filePath.split(".").pop() || "txt",
    });
  }

  for (const f of patchedFiles) {
    fileMap.set(f.filePath, f);
  }

  return Array.from(fileMap.values());
}

async function savePatchedFilesAndRun(
  buildId: string,
  projectId: string,
  userId: string,
  allFiles: GeneratedFile[],
  fileManager: FileManagerAgent,
  constitution: ReturnType<typeof getConstitution>,
  totalTokens: number,
  totalCost: number,
  build: ActiveBuild
) {
  if (build.cancelRequested) {
    await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
    return;
  }

  const saveTaskId = await createTask(buildId, projectId, "filemanager");
  logExecution(buildId, projectId, saveTaskId, "filemanager", "save_files", "in_progress", {
    fileCount: allFiles.length,
  });

  const saveResult = await fileManager.saveFiles(projectId, allFiles);

  if (saveResult.success) {
    await completeTask(saveTaskId, 0, 0, saveResult.durationMs);
  } else {
    await failTask(saveTaskId, "Failed to save some files", saveResult.durationMs);
  }

  logExecution(
    buildId, projectId, saveTaskId, "filemanager", "save_files",
    saveResult.success ? "completed" : "failed",
    saveResult.data, 0, saveResult.durationMs
  );

  if (saveResult.success) {
    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const runnerTaskId = await createTask(buildId, projectId, "package_runner");
    logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "in_progress", {
      fileCount: allFiles.length,
    });

    const runnerStartTime = Date.now();
    const packageRunner = new PackageRunnerAgent(constitution);
    setRunner(buildId, packageRunner);

    const outputLogs: { type: string; message: string; timestamp: string }[] = [];
    packageRunner.onOutput((output) => {
      outputLogs.push(output);
    });

    try {
      const runnerResult = await packageRunner.executeWithFiles(projectId, allFiles);
      const runnerDuration = Date.now() - runnerStartTime;

      if (runnerResult.success) {
        await completeTask(runnerTaskId, 0, 0, runnerDuration);
      } else {
        await failTask(runnerTaskId, runnerResult.error ?? "Package runner failed", runnerDuration);
      }

      logExecution(
        buildId, projectId, runnerTaskId, "package_runner", "install_and_run",
        runnerResult.success ? "completed" : "failed",
        {
          ...runnerResult.data,
          outputLogCount: outputLogs.length,
          lastOutput: outputLogs.slice(-5).map((l) => l.message).join("\n"),
        },
        0, runnerDuration
      );

      if (!runnerResult.success) {
        console.error(`Build ${buildId} package runner failed:`, runnerResult.error);
      }
    } catch (runnerError) {
      const runnerDuration = Date.now() - runnerStartTime;
      const errMsg = runnerError instanceof Error ? runnerError.message : String(runnerError);
      await failTask(runnerTaskId, errMsg, runnerDuration);
      logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "failed", {
        error: errMsg,
      }, 0, runnerDuration);
      console.error(`Build ${buildId} package runner error:`, runnerError);
    }

    try {
      logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "in_progress");
      const qaReportId = await runQaWithRetry(buildId, projectId, userId);
      logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "completed", { qaReportId });
    } catch (qaError) {
      console.error(`Build ${buildId} QA pipeline error:`, qaError);
      logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "failed", {
        error: qaError instanceof Error ? qaError.message : String(qaError),
      });
    }
  }

  const finalStatus = !saveResult.success ? "failed" : "completed";
  await finalizeBuild(buildId, projectId, finalStatus, totalTokens, totalCost);
}

async function executeBuildPipelineWithPlan(
  buildId: string,
  projectId: string,
  userId: string,
  prompt: string,
  plan: ProjectPlan,
  constitution: ReturnType<typeof getConstitution>
) {
  const build = activeBuilds.get(buildId)!;
  build.status = "in_progress";
  const lang = detectLang(prompt);

  const codegenAgent = new CodeGenAgent(constitution);
  const reviewerAgent = new ReviewerAgent(constitution);
  const fixerAgent = new FixerAgent(constitution);
  const fileManager = new FileManagerAgent(constitution);

  await Promise.allSettled([
    codegenAgent.loadConfigFromDB(),
    reviewerAgent.loadConfigFromDB(),
    fixerAgent.loadConfigFromDB(),
  ]);

  let totalTokens = 0;
  let totalCost = 0;

  try {
    logExecution(buildId, projectId, null, "system", "build_started_with_plan", "in_progress", {
      prompt, plan,
      message: lang === "ar"
        ? `بدأ البناء بخطة من ${plan.steps?.length || 0} خطوات — "${prompt.slice(0, 80)}"`
        : `Build started with ${plan.steps?.length || 0}-step plan — "${prompt.slice(0, 80)}"`,
    });

    const limitCheck = await checkSpendingLimits(userId, projectId);
    if (!limitCheck.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded", "failed", { reason: limitCheck.reason });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    let existingFiles = await fileManager.getProjectFiles(projectId);

    const planSourceFiles = codegenAgent.getSourceFiles();
    if (planSourceFiles.length > 0) {
      const projectScopeFiles = planSourceFiles.filter(sf => !sf.startsWith("artifacts/") && !sf.includes("node_modules"));
      if (projectScopeFiles.length > 0) {
        const filtered = existingFiles.filter(f =>
          projectScopeFiles.some(sf => f.filePath === sf || f.filePath.startsWith(sf + "/") || f.filePath.startsWith(sf))
        );
        if (filtered.length > 0) {
          existingFiles = filtered;
        }
      }
    }

    const planContext = `
Approved Project Plan:
- Framework: ${plan.framework}
- Files to create: ${plan.files.join(", ")}
- Packages: ${plan.packages.join(", ")}
- Directory structure: ${plan.directoryStructure.join(", ")}
- Phases:
${plan.phases.map((p, i) => `  ${i + 1}. ${p.name}: ${p.description}`).join("\n")}

User's original request:
${prompt}`;

    const context: BuildContext = {
      buildId,
      projectId,
      userId,
      prompt: planContext,
      existingFiles,
      tokensUsedSoFar: 0,
      approvedPlan: plan,
    };

    const codegenTaskId = await createTask(buildId, projectId, "codegen", planContext);
    logExecution(buildId, projectId, codegenTaskId, "codegen", "generate_code", "in_progress");

    const codegenResult = await codegenAgent.execute(context);
    totalTokens += codegenResult.tokensUsed;
    const codegenCost = estimateCost(codegenResult.tokensUsed, codegenAgent.modelConfig.model);
    totalCost += codegenCost;

    recordTokenUsage(userId, projectId, buildId, "codegen", codegenAgent.modelConfig.model, codegenResult.tokensUsed, codegenCost);

    if (codegenResult.success) {
      await completeTask(codegenTaskId, codegenResult.tokensUsed, codegenCost, codegenResult.durationMs);
    } else {
      await failTask(codegenTaskId, codegenResult.error ?? "Unknown error", codegenResult.durationMs);
    }

    {
      const _genFiles = (codegenResult.data?.files as GeneratedFile[]) || [];
      const _genNames = _genFiles.map(f => f.filePath);
      const _genDur = Math.round((codegenResult.durationMs || 0) / 1000);
      logExecution(
        buildId, projectId, codegenTaskId, "codegen", "generate_code",
        codegenResult.success ? "completed" : "failed",
        {
          tokensUsed: codegenResult.tokensUsed, error: codegenResult.error,
          fileCount: _genNames.length, files: _genNames.slice(0, 25),
          message: codegenResult.success
            ? (lang === "ar" ? `تم توليد ${_genNames.length} ملف في ${_genDur} ثانية:\n${_genNames.map(f => `  📄 ${f}`).join("\n")}` : `Generated ${_genNames.length} files in ${_genDur}s:\n${_genNames.map(f => `  📄 ${f}`).join("\n")}`)
            : (lang === "ar" ? `فشل توليد الكود: ${codegenResult.error}` : `Code generation failed: ${codegenResult.error}`),
        },
        codegenResult.tokensUsed, codegenResult.durationMs
      );
    }

    if (!codegenResult.success) {
      console.error(`Build ${buildId} codegen failed:`, codegenResult.error);
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const postCodegenLimit = await checkSpendingLimits(userId, projectId);
    if (!postCodegenLimit.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
        reason: postCodegenLimit.reason,
        after_agent: "codegen",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    let generatedFiles = codegenResult.data?.files as GeneratedFile[];
    context.tokensUsedSoFar = totalTokens;
    context.existingFiles = generatedFiles.map((f) => ({
      filePath: f.filePath,
      content: f.content,
    }));

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const planCodegenSendsTo = codegenAgent.getSendsTo();
    const planReviewerHasPermission = reviewerAgent.hasAnyPermission(["read_code", "report_issues", "score_quality"]);
    const planFixerHasPermission = fixerAgent.hasAnyPermission(["fix_issues", "modify_code"]);
    const planSkipReview = planCodegenSendsTo === "output" || !planReviewerHasPermission;
    const planSkipFixer = planSkipReview || !planFixerHasPermission;

    if (planSkipReview) {
      const skipReason = !planReviewerHasPermission ? "no_permission" : "sendsTo_output";
      console.log(`[Pipeline-Plan] skipping reviewer (${skipReason}) and fixer`);
      logExecution(buildId, projectId, null, "system", "pipeline_skip_review", "completed", {
        reason: skipReason,
        message: lang === "ar"
          ? "تم تخطي المراجعة — الوكيل مُعدّ للتسليم المباشر"
          : "Review skipped — agent configured for direct output",
      });

      await fileManager.saveProjectFiles(
        projectId,
        generatedFiles,
        plan.packages,
        buildId,
        prompt,
        "ai-planner",
        totalTokens,
        totalCost
      );

      logExecution(buildId, projectId, null, "system", "build_completed", "completed", {
        totalTokens,
        totalCost: totalCost.toFixed(4),
        filesGenerated: generatedFiles.length,
        message: lang === "ar"
          ? `اكتمل البناء! ${generatedFiles.length} ملف`
          : `Build completed! ${generatedFiles.length} files`,
      });

      await finalizeBuild(buildId, projectId, "completed", totalTokens, totalCost);
      return;
    }

    const reviewTaskId = await createTask(buildId, projectId, "reviewer");
    logExecution(buildId, projectId, reviewTaskId, "reviewer", "review_code", "in_progress", {
      message: lang === "ar"
        ? "أراجع الكود المُولَّد... أبحث عن أخطاء، مشاكل أمنية، وأفضل الممارسات"
        : "Reviewing generated code... checking for errors, security issues, and best practices",
    });

    const reviewResult = await reviewerAgent.execute(context);
    totalTokens += reviewResult.tokensUsed;
    const reviewCost = estimateCost(reviewResult.tokensUsed, reviewerAgent.modelConfig.model);
    totalCost += reviewCost;

    recordTokenUsage(userId, projectId, buildId, "reviewer", reviewerAgent.modelConfig.model, reviewResult.tokensUsed, reviewCost);

    if (reviewResult.success) {
      await completeTask(reviewTaskId, reviewResult.tokensUsed, reviewCost, reviewResult.durationMs);
    } else {
      await failTask(reviewTaskId, reviewResult.error ?? "Unknown error", reviewResult.durationMs);
    }

    logExecution(
      buildId, projectId, reviewTaskId, "reviewer", "review_code",
      reviewResult.success ? "completed" : "failed",
      reviewResult.data,
      reviewResult.tokensUsed,
      reviewResult.durationMs
    );

    if (!reviewResult.success) {
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const postReviewLimit = await checkSpendingLimits(userId, projectId);
    if (!postReviewLimit.allowed) {
      logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
        reason: postReviewLimit.reason,
        after_agent: "reviewer",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const review = reviewResult.data?.review as
      | { approved: boolean; issues: CodeIssue[] }
      | undefined;

    if (review && !review.approved && review.issues.length > 0 && !planSkipFixer) {
      if (build.cancelRequested) {
        await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
        return;
      }

      const errorIssues = review.issues.filter((i) => i.severity === "error");
      if (errorIssues.length > 0) {
        const fixTaskId = await createTask(buildId, projectId, "fixer");
        logExecution(buildId, projectId, fixTaskId, "fixer", "fix_code", "in_progress", { issueCount: errorIssues.length });

        context.tokensUsedSoFar = totalTokens;
        const fixResult = await fixerAgent.executeWithIssues(context, errorIssues);
        totalTokens += fixResult.tokensUsed;
        const fixCost = estimateCost(fixResult.tokensUsed, fixerAgent.modelConfig.model);
        totalCost += fixCost;

        recordTokenUsage(userId, projectId, buildId, "fixer", fixerAgent.modelConfig.model, fixResult.tokensUsed, fixCost);

        if (fixResult.success) {
          await completeTask(fixTaskId, fixResult.tokensUsed, fixCost, fixResult.durationMs);
        } else {
          await failTask(fixTaskId, fixResult.error ?? "Unknown error", fixResult.durationMs);
        }

        logExecution(
          buildId, projectId, fixTaskId, "fixer", "fix_code",
          fixResult.success ? "completed" : "failed",
          { tokensUsed: fixResult.tokensUsed },
          fixResult.tokensUsed,
          fixResult.durationMs
        );

        if (!fixResult.success) {
          await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
          return;
        }

        const postFixerLimit = await checkSpendingLimits(userId, projectId);
        if (!postFixerLimit.allowed) {
          logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
            reason: postFixerLimit.reason,
            after_agent: "fixer",
          });
          await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
          return;
        }

        if (fixResult.data?.files) {
          const fixedFiles = fixResult.data.files as GeneratedFile[];
          const fixedMap = new Map(fixedFiles.map(f => [f.filePath, f]));
          generatedFiles = generatedFiles.map(f => fixedMap.get(f.filePath) || f);
          for (const ff of fixedFiles) {
            if (!generatedFiles.some(g => g.filePath === ff.filePath)) {
              generatedFiles.push(ff);
            }
          }
        }
      }
    }

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const saveTaskId = await createTask(buildId, projectId, "filemanager");
    logExecution(buildId, projectId, saveTaskId, "filemanager", "save_files", "in_progress", { fileCount: generatedFiles.length });

    const saveResult = await fileManager.saveFiles(projectId, generatedFiles);

    if (saveResult.success) {
      await completeTask(saveTaskId, 0, 0, saveResult.durationMs);
    } else {
      await failTask(saveTaskId, "Failed to save some files", saveResult.durationMs);
    }

    logExecution(
      buildId, projectId, saveTaskId, "filemanager", "save_files",
      saveResult.success ? "completed" : "failed",
      saveResult.data,
      0,
      saveResult.durationMs
    );

    if (saveResult.success) {
      if (build.cancelRequested) {
        await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
        return;
      }

      const runnerTaskId = await createTask(buildId, projectId, "package_runner");
      logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "in_progress", { fileCount: generatedFiles.length });

      const runnerStartTime = Date.now();
      const packageRunner = new PackageRunnerAgent(constitution);
      setRunner(buildId, packageRunner);

      try {
        const runnerResult = await packageRunner.executeWithFiles(projectId, generatedFiles);
        const runnerDuration = Date.now() - runnerStartTime;

        if (runnerResult.success) {
          await completeTask(runnerTaskId, 0, 0, runnerDuration);
        } else {
          await failTask(runnerTaskId, runnerResult.error ?? "Package runner failed", runnerDuration);
        }

        logExecution(
          buildId, projectId, runnerTaskId, "package_runner", "install_and_run",
          runnerResult.success ? "completed" : "failed",
          runnerResult.data,
          0,
          runnerDuration
        );
      } catch (runnerError) {
        const runnerDuration = Date.now() - runnerStartTime;
        const errMsg = runnerError instanceof Error ? runnerError.message : String(runnerError);
        await failTask(runnerTaskId, errMsg, runnerDuration);
        logExecution(buildId, projectId, runnerTaskId, "package_runner", "install_and_run", "failed", { error: errMsg }, 0, runnerDuration);
      }

      try {
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "in_progress");
        const qaReportId = await runQaWithRetry(buildId, projectId, userId);
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "completed", { qaReportId });
      } catch (qaError) {
        console.error(`Build ${buildId} QA pipeline error:`, qaError);
        logExecution(buildId, projectId, null, "qa_pipeline", "qa_validation", "failed", {
          error: qaError instanceof Error ? qaError.message : String(qaError),
        });
      }
    }

    const finalStatus = !saveResult.success ? "failed" : "completed";
    await finalizeBuild(buildId, projectId, finalStatus, totalTokens, totalCost);
  } catch (error) {
    console.error(`Build ${buildId} (with plan) error:`, error);
    logExecution(buildId, projectId, null, "system", "build_error", "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
  }
}

export async function startSurgicalFix(
  projectId: string,
  userId: string,
  errorMessage: string,
  targetFiles?: { path: string; description: string }[]
): Promise<{ success: boolean; buildId: string; fixedFiles: string[]; error?: string }> {
  const constitution = getConstitution();
  const buildId = uuidv4();
  const fileManager = new FileManagerAgent(constitution);
  const fixerAgent = new FixerAgent(constitution);
  const reviewerAgent = new ReviewerAgent(constitution);

  const fixedFilesList: string[] = [];
  let totalTokens = 0;
  let totalCost = 0;

  try {
    activeBuilds.set(buildId, {
      buildId,
      projectId,
      userId,
      status: "in_progress",
      cancelRequested: false,
    });

    await db.update(projectsTable).set({ status: "building" }).where(eq(projectsTable.id, projectId));

    await db.insert(buildTasksTable).values({
      buildId,
      projectId,
      agentType: "surgical_fix",
      status: "in_progress",
      prompt: `Fix: ${errorMessage}`,
    });

    logExecution(buildId, projectId, null, "system", "surgical_fix_started", "in_progress", {
      errorMessage,
      targetFiles: targetFiles?.map(f => f.path),
    });

    const existingFiles = await fileManager.getProjectFiles(projectId);
    if (existingFiles.length === 0) {
      logExecution(buildId, projectId, null, "system", "surgical_fix_no_files", "failed", {});
      await finalizeBuild(buildId, projectId, "failed", 0, 0);
      return { success: false, buildId, fixedFiles: [], error: "No files to fix" };
    }

    const filesToAnalyze = targetFiles?.length
      ? existingFiles.filter(f => targetFiles.some(t => f.filePath.includes(t.path) || t.path.includes(f.filePath)))
      : existingFiles;

    const analysisFiles = filesToAnalyze.length > 0 ? filesToAnalyze : existingFiles;

    logExecution(buildId, projectId, null, "analyzer", "analyze_error", "in_progress", {
      errorMessage,
      analyzingFiles: analysisFiles.map(f => f.filePath),
    });

    const issues = [{
      severity: "error" as const,
      file: analysisFiles[0]?.filePath || "unknown",
      message: errorMessage + (targetFiles?.length ? ` | Context: ${targetFiles.map(t => t.description).join('; ')}` : ''),
      suggestion: "Fix the code to resolve this error",
    }];

    const context: BuildContext = {
      buildId,
      projectId,
      userId,
      prompt: `Fix error: ${errorMessage}`,
      existingFiles: analysisFiles,
      tokensUsedSoFar: 0,
    };

    logExecution(buildId, projectId, null, "fixer", "fix_code", "in_progress", {
      issueCount: issues.length,
      filesBeingFixed: analysisFiles.map(f => f.filePath),
    });

    const fixResult = await fixerAgent.executeWithIssues(context, issues);
    totalTokens += fixResult.tokensUsed;
    const fixCost = estimateCost(fixResult.tokensUsed, fixerAgent.modelConfig.model);
    totalCost += fixCost;

    recordTokenUsage(userId, projectId, buildId, "fixer", fixerAgent.modelConfig.model, fixResult.tokensUsed, fixCost);

    if (!fixResult.success) {
      logExecution(buildId, projectId, null, "fixer", "fix_code", "failed", {
        error: fixResult.error,
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return { success: false, buildId, fixedFiles: [], error: fixResult.error };
    }

    const patchedFiles = fixResult.data?.files as GeneratedFile[];
    if (!patchedFiles?.length) {
      logExecution(buildId, projectId, null, "fixer", "fix_code", "failed", {
        error: "No files returned from fixer",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return { success: false, buildId, fixedFiles: [], error: "Fixer returned no files" };
    }

    for (const pf of patchedFiles) fixedFilesList.push(pf.filePath);

    logExecution(buildId, projectId, null, "fixer", "fix_code", "completed", {
      fixedFiles: fixedFilesList,
      tokensUsed: fixResult.tokensUsed,
    });

    logExecution(buildId, projectId, null, "reviewer", "review_fix", "in_progress", {
      reviewingFiles: fixedFilesList,
    });

    const reviewContext: BuildContext = {
      ...context,
      existingFiles: patchedFiles.map(f => ({ filePath: f.filePath, content: f.content })),
      tokensUsedSoFar: totalTokens,
    };

    const reviewResult = await reviewerAgent.execute(reviewContext);
    totalTokens += reviewResult.tokensUsed;
    const reviewCost = estimateCost(reviewResult.tokensUsed, reviewerAgent.modelConfig.model);
    totalCost += reviewCost;

    recordTokenUsage(userId, projectId, buildId, "reviewer", reviewerAgent.modelConfig.model, reviewResult.tokensUsed, reviewCost);

    const reviewIssues = (reviewResult.data?.issues as { severity: string }[]) || [];
    const hasErrors = reviewIssues.some(i => i.severity === "error");

    logExecution(buildId, projectId, null, "reviewer", "review_fix", "completed", {
      issueCount: reviewIssues.length,
      hasErrors,
    });

    const allFiles = mergeFiles(existingFiles, patchedFiles);

    const saveResult = await fileManager.saveFiles(projectId, allFiles);

    logExecution(buildId, projectId, null, "filemanager", "save_fixed_files", saveResult.success ? "completed" : "failed", {
      savedCount: allFiles.length,
      fixedCount: patchedFiles.length,
    });

    await finalizeBuild(buildId, projectId, "completed", totalTokens, totalCost);

    return { success: true, buildId, fixedFiles: fixedFilesList };

  } catch (error) {
    console.error(`[SURGICAL FIX] Error:`, error);
    logExecution(buildId, projectId, null, "system", "surgical_fix_error", "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
    return { success: false, buildId, fixedFiles: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function finalizeBuild(
  buildId: string,
  projectId: string,
  status: BuildStatus,
  totalTokens: number,
  totalCost: number
) {
  const build = activeBuilds.get(buildId);
  if (build) {
    build.status = status;
  }

  const projectStatus = status === "completed" ? "ready" : status === "cancelled" ? "draft" : "failed";

  await db
    .update(projectsTable)
    .set({
      status: projectStatus,
      totalTokensUsed: sql`COALESCE(${projectsTable.totalTokensUsed}, 0) + ${totalTokens}`,
      totalCostUsd: sql`COALESCE(${projectsTable.totalCostUsd}::numeric, 0) + ${totalCost}`,
      updatedAt: new Date(),
    })
    .where(eq(projectsTable.id, projectId));

  const hasInProgressTasks = status === "cancelled" || status === "failed";
  if (hasInProgressTasks) {
    await db
      .update(buildTasksTable)
      .set({ status: "failed", completedAt: new Date() })
      .where(
        and(
          eq(buildTasksTable.buildId, buildId),
          eq(buildTasksTable.status, "in_progress")
        )
      );
  }

  logExecution(buildId, projectId, null, "system", "build_finished", status, {
    totalTokens,
    totalCost,
  });

  if (build?.userId) {
    try {
      const [proj] = await db
        .select({ name: projectsTable.name })
        .from(projectsTable)
        .where(eq(projectsTable.id, projectId))
        .limit(1);
      const projectName = proj?.name || "Untitled Project";

      if (projectStatus === "ready") {
        await emitBuildComplete({ userId: build.userId, projectName, projectId });
      } else if (projectStatus === "failed") {
        await emitBuildError({ userId: build.userId, projectName, projectId });
      }
    } catch (err) {
      console.error(`Failed to emit build notification for ${buildId}:`, err);
    }
  }

  if (totalCost > 0 && build?.userId) {
    try {
      const [user] = await db
        .select({ creditBalanceUsd: usersTable.creditBalanceUsd })
        .from(usersTable)
        .where(eq(usersTable.id, build.userId))
        .limit(1);

      const currentBalance = parseFloat(user?.creditBalanceUsd ?? "0");
      const actualDeducted = Math.min(currentBalance, totalCost);
      const newBalance = currentBalance - actualDeducted;

      if (actualDeducted > 0) {
        await db
          .update(usersTable)
          .set({ creditBalanceUsd: newBalance.toFixed(6) })
          .where(eq(usersTable.id, build.userId));

        await db.insert(creditsLedgerTable).values({
          userId: build.userId,
          type: "deduction",
          amountUsd: (-actualDeducted).toFixed(6),
          balanceAfter: newBalance.toFixed(6),
          description: `Build cost: ${buildId.slice(0, 8)}`,
          referenceId: buildId,
          referenceType: "build",
        });

        if (newBalance <= 0) {
          await db.insert(notificationsTable).values({
            userId: build.userId,
            type: "credits_depleted",
            title: "Credits Depleted",
            titleAr: "نفاد الرصيد",
            message:
              "Your credit balance has reached zero. Top up your credits to continue building projects.",
            messageAr:
              "وصل رصيدك إلى الصفر. أعد تعبئة رصيدك لمتابعة بناء المشاريع.",
            metadata: JSON.stringify({ topupUrl: "/billing" }),
          });
        } else if (newBalance < 1) {
          await db.insert(notificationsTable).values({
            userId: build.userId,
            type: "credits_low",
            title: "Credits Running Low",
            titleAr: "رصيدك منخفض",
            message: `Your credit balance is low ($${newBalance.toFixed(2)} remaining). Top up to avoid interruptions.`,
            messageAr: `رصيدك منخفض ($${newBalance.toFixed(2)} متبقي). أعد التعبئة لتجنب الانقطاع.`,
            metadata: JSON.stringify({ topupUrl: "/billing", balanceUsd: newBalance }),
          });
        }
      }
    } catch (err) {
      console.error(`Failed to deduct credits for build ${buildId}:`, err);
    }
  }

  setTimeout(() => {
    activeBuilds.delete(buildId);
    removeRunner(buildId);
  }, 5 * 60 * 1000);
}

function fixBrokenImports(files: GeneratedFile[]): void {
  const filePaths = new Set(files.map(f => f.filePath));

  const stripExt = (p: string) => p.replace(/\.(tsx?|jsx?|css)$/, "");
  const barePathSet = new Map<string, string>();
  for (const fp of filePaths) {
    barePathSet.set(stripExt(fp), fp);
  }

  const importRe = /^(import\s+(?:[\s\S]*?\s+from\s+|)['"])([^'"]+)(['"];?\s*)$/gm;

  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/.test(file.filePath)) continue;

    let changed = false;
    const dir = file.filePath.includes("/")
      ? file.filePath.substring(0, file.filePath.lastIndexOf("/"))
      : "";

    const newContent = file.content.replace(importRe, (match, pre, importPath, post) => {
      if (!importPath.startsWith(".")) return match;

      let resolved = "";
      if (dir && importPath.startsWith("./")) {
        resolved = dir + "/" + importPath.substring(2);
      } else if (dir && importPath.startsWith("../")) {
        const parts = dir.split("/");
        let rel = importPath;
        while (rel.startsWith("../") && parts.length > 0) {
          parts.pop();
          rel = rel.substring(3);
        }
        resolved = parts.length > 0 ? parts.join("/") + "/" + rel : rel;
      } else if (importPath.startsWith("./")) {
        resolved = importPath.substring(2);
      } else {
        resolved = importPath;
      }

      const barePath = stripExt(resolved);

      if (barePathSet.has(barePath) || filePaths.has(resolved)) {
        return match;
      }

      const importBase = barePath.split("/").pop()!;
      let bestMatch: string | null = null;
      let bestScore = 0;

      for (const [bp, fp] of barePathSet) {
        const bpBase = bp.split("/").pop()!;
        if (!bpBase) continue;

        const bpDir = bp.includes("/") ? bp.substring(0, bp.lastIndexOf("/")) : "";
        const bareDir = barePath.includes("/") ? barePath.substring(0, barePath.lastIndexOf("/")) : "";

        if (bpDir !== bareDir) continue;

        const baseLC = importBase.toLowerCase();
        const candLC = bpBase.toLowerCase();

        if (baseLC === candLC) {
          bestMatch = fp;
          bestScore = 100;
          break;
        }

        if (baseLC.includes(candLC) || candLC.includes(baseLC)) {
          const score = 80;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = fp;
          }
        }

        const stripped1 = baseLC.replace(/page$/, "").replace(/component$/, "").replace(/view$/, "");
        const stripped2 = candLC.replace(/page$/, "").replace(/component$/, "").replace(/view$/, "");
        if (stripped1 === stripped2 && stripped1.length > 0) {
          const score = 90;
          if (score > bestScore) {
            bestScore = score;
            bestMatch = fp;
          }
        }
      }

      if (bestMatch && bestScore >= 80) {
        const matchBare = stripExt(bestMatch);
        let newImportPath = "";
        if (dir) {
          const fromParts = dir.split("/");
          const toParts = matchBare.split("/");
          let common = 0;
          while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) {
            common++;
          }
          const ups = fromParts.length - common;
          const prefix = ups > 0 ? "../".repeat(ups) : "./";
          newImportPath = prefix + toParts.slice(common).join("/");
        } else {
          newImportPath = "./" + matchBare;
        }
        console.log(`[ImportFixer] ${file.filePath}: "${importPath}" → "${newImportPath}"`);
        changed = true;
        return pre + newImportPath + post;
      }

      if (importPath.includes("/pages/") || importPath.includes("/components/") || importPath.includes("/hooks/") || importPath.includes("/contexts/")) {
        console.warn(`[ImportFixer] UNRESOLVED: ${file.filePath} imports "${importPath}" — no matching file found, removing line`);
        changed = true;
        return "";
      }

      return match;
    });

    if (changed) {
      file.content = newContent.replace(/\n{3,}/g, "\n\n");
    }
  }
}
