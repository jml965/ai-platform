import { db } from "@workspace/db";
import {
  buildTasksTable,
  executionLogsTable,
  projectsTable,
  tokenUsageTable,
  creditsLedgerTable,
  usersTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getConstitution } from "./constitution";
import { CodeGenAgent } from "./codegen-agent";
import { ReviewerAgent } from "./reviewer-agent";
import { FixerAgent } from "./fixer-agent";
import { FileManagerAgent } from "./filemanager-agent";
import { checkSpendingLimits, checkAndNotifyLimits } from "../token-limits";
import type {
  BuildContext,
  BuildStatus,
  GeneratedFile,
  CodeIssue,
} from "./types";

interface ActiveBuild {
  buildId: string;
  projectId: string;
  userId: string;
  status: BuildStatus;
  cancelRequested: boolean;
}

const activeBuilds = new Map<string, ActiveBuild>();

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

async function logExecution(
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
  await db.insert(executionLogsTable).values({
    buildId,
    projectId,
    taskId,
    agentType,
    action,
    status,
    details: details ?? null,
    tokensUsed: tokensUsed ?? 0,
    durationMs: durationMs ?? null,
  });
}

async function recordTokenUsage(
  userId: string,
  projectId: string,
  buildId: string,
  agentType: string,
  tokensUsed: number,
  costUsd: number
) {
  const INPUT_RATIO = 0.3;
  const tokensInput = Math.floor(tokensUsed * INPUT_RATIO);
  const tokensOutput = tokensUsed - tokensInput;

  await db.insert(tokenUsageTable).values({
    userId,
    projectId,
    buildId,
    agentType,
    model: "gpt-5.2",
    tokensInput,
    tokensOutput,
    costUsd: costUsd.toFixed(6),
    usageDate: new Date().toISOString().split("T")[0],
  });

  await checkAndNotifyLimits(userId, projectId, costUsd).catch((err) =>
    console.error("Failed to check/notify limits:", err)
  );
}

function estimateCost(tokensUsed: number): number {
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

async function executeBuildPipeline(
  buildId: string,
  projectId: string,
  userId: string,
  prompt: string,
  constitution: ReturnType<typeof getConstitution>
) {
  const build = activeBuilds.get(buildId)!;
  build.status = "in_progress";

  const codegenAgent = new CodeGenAgent(constitution);
  const reviewerAgent = new ReviewerAgent(constitution);
  const fixerAgent = new FixerAgent(constitution);
  const fileManager = new FileManagerAgent(constitution);

  let totalTokens = 0;
  let totalCost = 0;

  try {
    await logExecution(buildId, projectId, null, "system", "build_started", "in_progress", { prompt });

    const limitCheck = await checkSpendingLimits(userId, projectId);
    if (!limitCheck.allowed) {
      await logExecution(buildId, projectId, null, "system", "limit_exceeded", "failed", {
        reason: limitCheck.reason,
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const existingFiles = await fileManager.getProjectFiles(projectId);
    const context: BuildContext = {
      buildId,
      projectId,
      userId,
      prompt,
      existingFiles,
      tokensUsedSoFar: 0,
    };

    const codegenTaskId = await createTask(buildId, projectId, "codegen", prompt);
    await logExecution(buildId, projectId, codegenTaskId, "codegen", "generate_code", "in_progress");

    const codegenResult = await codegenAgent.execute(context);
    totalTokens += codegenResult.tokensUsed;
    const codegenCost = estimateCost(codegenResult.tokensUsed);
    totalCost += codegenCost;

    await recordTokenUsage(userId, projectId, buildId, "codegen", codegenResult.tokensUsed, codegenCost);

    if (codegenResult.success) {
      await completeTask(codegenTaskId, codegenResult.tokensUsed, codegenCost, codegenResult.durationMs);
    } else {
      await failTask(codegenTaskId, codegenResult.error ?? "Unknown error", codegenResult.durationMs);
    }

    await logExecution(
      buildId, projectId, codegenTaskId, "codegen", "generate_code",
      codegenResult.success ? "completed" : "failed",
      { tokensUsed: codegenResult.tokensUsed, error: codegenResult.error },
      codegenResult.tokensUsed,
      codegenResult.durationMs
    );

    if (!codegenResult.success) {
      console.error(`Build ${buildId} codegen failed:`, codegenResult.error);
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const postCodegenLimit = await checkSpendingLimits(userId, projectId);
    if (!postCodegenLimit.allowed) {
      await logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
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

    const reviewTaskId = await createTask(buildId, projectId, "reviewer");
    await logExecution(buildId, projectId, reviewTaskId, "reviewer", "review_code", "in_progress");

    const reviewResult = await reviewerAgent.execute(context);
    totalTokens += reviewResult.tokensUsed;
    const reviewCost = estimateCost(reviewResult.tokensUsed);
    totalCost += reviewCost;

    await recordTokenUsage(userId, projectId, buildId, "reviewer", reviewResult.tokensUsed, reviewCost);

    if (reviewResult.success) {
      await completeTask(reviewTaskId, reviewResult.tokensUsed, reviewCost, reviewResult.durationMs);
    } else {
      await failTask(reviewTaskId, reviewResult.error ?? "Unknown error", reviewResult.durationMs);
    }

    await logExecution(
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
      await logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
        reason: postReviewLimit.reason,
        after_agent: "reviewer",
      });
      await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
      return;
    }

    const review = reviewResult.data?.review as
      | { approved: boolean; issues: CodeIssue[] }
      | undefined;

    if (review && !review.approved && review.issues.length > 0) {
      if (build.cancelRequested) {
        await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
        return;
      }

      const errorIssues = review.issues.filter((i) => i.severity === "error");
      if (errorIssues.length === 0) {
        console.log(`Build ${buildId}: review had warnings/info only, proceeding without fix`);
      } else {
        const fixTaskId = await createTask(buildId, projectId, "fixer");
        await logExecution(buildId, projectId, fixTaskId, "fixer", "fix_code", "in_progress", {
          issueCount: errorIssues.length,
        });

        context.tokensUsedSoFar = totalTokens;
        const fixResult = await fixerAgent.executeWithIssues(context, errorIssues);
        totalTokens += fixResult.tokensUsed;
        const fixCost = estimateCost(fixResult.tokensUsed);
        totalCost += fixCost;

        await recordTokenUsage(userId, projectId, buildId, "fixer", fixResult.tokensUsed, fixCost);

        if (fixResult.success) {
          await completeTask(fixTaskId, fixResult.tokensUsed, fixCost, fixResult.durationMs);
        } else {
          await failTask(fixTaskId, fixResult.error ?? "Unknown error", fixResult.durationMs);
        }

        await logExecution(
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
          await logExecution(buildId, projectId, null, "system", "limit_exceeded_mid_build", "failed", {
            reason: postFixerLimit.reason,
            after_agent: "fixer",
          });
          await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
          return;
        }

        if (fixResult.data?.files) {
          generatedFiles = fixResult.data.files as GeneratedFile[];
        }
      }
    }

    if (build.cancelRequested) {
      await finalizeBuild(buildId, projectId, "cancelled", totalTokens, totalCost);
      return;
    }

    const saveTaskId = await createTask(buildId, projectId, "filemanager");
    await logExecution(buildId, projectId, saveTaskId, "filemanager", "save_files", "in_progress", {
      fileCount: generatedFiles.length,
    });

    const saveResult = await fileManager.saveFiles(projectId, generatedFiles);

    if (saveResult.success) {
      await completeTask(saveTaskId, 0, 0, saveResult.durationMs);
    } else {
      await failTask(saveTaskId, "Failed to save some files", saveResult.durationMs);
    }

    await logExecution(
      buildId, projectId, saveTaskId, "filemanager", "save_files",
      saveResult.success ? "completed" : "failed",
      saveResult.data,
      0,
      saveResult.durationMs
    );

    const finalStatus = saveResult.success ? "completed" : "failed";
    await finalizeBuild(buildId, projectId, finalStatus, totalTokens, totalCost);
  } catch (error) {
    console.error(`Build ${buildId} error:`, error);
    await logExecution(buildId, projectId, null, "system", "build_error", "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    await finalizeBuild(buildId, projectId, "failed", totalTokens, totalCost);
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

  await logExecution(buildId, projectId, null, "system", "build_finished", status, {
    totalTokens,
    totalCost,
  });

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
      }
    } catch (err) {
      console.error(`Failed to deduct credits for build ${buildId}:`, err);
    }
  }

  setTimeout(() => {
    activeBuilds.delete(buildId);
  }, 5 * 60 * 1000);
}
