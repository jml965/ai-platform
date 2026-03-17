import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { agentConfigsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { AgentConfig } from "@workspace/db/schema";

interface ModelSlot {
  provider: string;
  model: string;
  enabled: boolean;
  creativity?: number;
  timeoutSeconds?: number;
}

interface GovernorModelSlot {
  provider: string;
  model: string;
  creativity?: number;
  timeoutSeconds?: number;
}

interface GovernorResult {
  content: string;
  tokensUsed: number;
  modelsUsed: string[];
  mergedFrom: number;
}

async function callModel(
  slot: ModelSlot | GovernorModelSlot,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number,
  fallbackCreativity?: number
): Promise<{ content: string; tokensUsed: number; model: string } | null> {
  const temperature = slot.creativity ?? fallbackCreativity ?? 0.7;
  const timeoutMs = (slot.timeoutSeconds ?? 240) * 1000;

  try {
    if (slot.provider === "anthropic") {
      const stream = anthropic.messages.stream({
        model: slot.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const response = await Promise.race([
        stream.finalMessage(),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            stream.abort();
            reject(new Error(`Model ${slot.model} timed out after ${slot.timeoutSeconds ?? 240}s`));
          }, timeoutMs)
        ),
      ]);

      const content = response.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string; text: string }) => b.text)
        .join("");
      const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      return { content, tokensUsed, model: slot.model };
    } else if (slot.provider === "openai") {
      const response = await openai.chat.completions.create({
        model: slot.model,
        max_completion_tokens: maxTokens,
        temperature,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      });
      const content = response.choices[0]?.message?.content ?? "";
      const usage = response.usage;
      const tokensUsed = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);
      return { content, tokensUsed, model: slot.model };
    }
    return null;
  } catch (error) {
    console.error(`[Governor] Model ${slot.model} failed:`, error);
    return null;
  }
}

export async function runGovernor(
  agentConfig: AgentConfig,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 16000
): Promise<GovernorResult> {
  const slots: ModelSlot[] = [];

  if (agentConfig.primaryModel && (agentConfig.primaryModel as ModelSlot).enabled) {
    slots.push(agentConfig.primaryModel as ModelSlot);
  }
  if (agentConfig.secondaryModel && (agentConfig.secondaryModel as ModelSlot).enabled) {
    slots.push(agentConfig.secondaryModel as ModelSlot);
  }
  if (agentConfig.tertiaryModel && (agentConfig.tertiaryModel as ModelSlot).enabled) {
    slots.push(agentConfig.tertiaryModel as ModelSlot);
  }

  if (slots.length === 0) {
    throw new Error(`No enabled models for agent ${agentConfig.agentKey}`);
  }

  if (!agentConfig.governorEnabled || slots.length === 1) {
    const result = await callModel(slots[0], systemPrompt, userMessage, maxTokens);
    if (!result) throw new Error(`Primary model failed for ${agentConfig.agentKey}`);
    return {
      content: result.content,
      tokensUsed: result.tokensUsed,
      modelsUsed: [result.model],
      mergedFrom: 1,
    };
  }

  console.log(`[Governor] Running ${slots.length} models in parallel for ${agentConfig.agentKey}`);

  const results = await Promise.allSettled(
    slots.map(slot => callModel(slot, systemPrompt, userMessage, maxTokens))
  );

  const successResults: { content: string; tokensUsed: number; model: string }[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value) {
      successResults.push(r.value);
    }
  }

  if (successResults.length === 0) {
    throw new Error(`All governor models failed for ${agentConfig.agentKey}`);
  }

  if (successResults.length === 1) {
    return {
      content: successResults[0].content,
      tokensUsed: successResults[0].tokensUsed,
      modelsUsed: [successResults[0].model],
      mergedFrom: 1,
    };
  }

  const mergePrompt = `You are the Governor AI — a decision-making agent. You received multiple solution proposals from different AI models for the same task. Your job is to:

1. Analyze ALL proposals carefully
2. Extract the BEST ideas, patterns, and approaches from each
3. Produce a SINGLE, unified, superior solution that combines the best elements

IMPORTANT: Output ONLY the final merged solution in the same format as the originals. Do NOT add commentary about the merge process.

Here are the ${successResults.length} proposals:

${successResults.map((r, i) => `=== PROPOSAL ${i + 1} (from ${r.model}) ===\n${r.content}\n`).join("\n")}

Now produce the BEST unified solution:`;

  const govModel = agentConfig.governorModel as GovernorModelSlot | null;
  const mergerSlot: ModelSlot | GovernorModelSlot = govModel
    ? { provider: govModel.provider, model: govModel.model, creativity: govModel.creativity, timeoutSeconds: govModel.timeoutSeconds }
    : slots[0];

  console.log(`[Governor] Merger model: ${mergerSlot.model} (${govModel ? "custom governor" : "fallback to primary"})`);

  const mergeResult = await callModel(
    mergerSlot,
    "You merge multiple AI proposals into a single optimal solution. Output ONLY the merged result.",
    mergePrompt,
    maxTokens
  );

  if (!mergeResult) {
    return {
      content: successResults[0].content,
      tokensUsed: successResults.reduce((s, r) => s + r.tokensUsed, 0),
      modelsUsed: successResults.map(r => r.model),
      mergedFrom: successResults.length,
    };
  }

  const totalTokens = successResults.reduce((s, r) => s + r.tokensUsed, 0) + mergeResult.tokensUsed;

  return {
    content: mergeResult.content,
    tokensUsed: totalTokens,
    modelsUsed: [...successResults.map(r => r.model), `${mergerSlot.model}(governor)`],
    mergedFrom: successResults.length,
  };
}

export async function getAgentConfig(agentKey: string): Promise<AgentConfig | null> {
  const [config] = await db.select().from(agentConfigsTable)
    .where(eq(agentConfigsTable.agentKey, agentKey))
    .limit(1);
  return config || null;
}

export async function getAllAgentConfigs(): Promise<AgentConfig[]> {
  return db.select().from(agentConfigsTable).orderBy(agentConfigsTable.pipelineOrder);
}

export async function updateAgentStats(
  agentKey: string,
  tokensUsed: number,
  success: boolean,
  durationMs: number,
  costUsd: number
) {
  try {
    const [config] = await db.select().from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentKey, agentKey))
      .limit(1);

    if (!config) return;

    const totalTasks = config.totalTasksCompleted + 1;
    const totalErrors = config.totalErrors + (success ? 0 : 1);
    const totalTokens = config.totalTokensUsed + tokensUsed;
    const avgMs = Math.round(((config.avgExecutionMs * config.totalTasksCompleted) + durationMs) / totalTasks);
    const totalCost = (parseFloat(config.totalCostUsd) + costUsd).toFixed(6);

    await db.update(agentConfigsTable)
      .set({
        totalTasksCompleted: totalTasks,
        totalErrors: totalErrors,
        totalTokensUsed: totalTokens,
        avgExecutionMs: avgMs,
        totalCostUsd: totalCost,
        updatedAt: new Date(),
      })
      .where(eq(agentConfigsTable.agentKey, agentKey));
  } catch (err) {
    console.error(`[Governor] Failed to update stats for ${agentKey}:`, err);
  }
}
