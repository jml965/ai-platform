import { getAnthropicClient, getOpenAIClient } from "./ai-clients";
import { db } from "@workspace/db";
import { agentConfigsTable, projectFilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { AgentConfig } from "@workspace/db/schema";

interface ModelSlot {
  provider: string;
  model: string;
  enabled: boolean;
  creativity?: number;
  timeoutSeconds?: number;
  maxTokens?: number;
}

interface ThinkResult {
  content: string;
  tokensUsed: number;
  model: string;
  durationMs: number;
}

interface StrategicResult {
  reply: string;
  actions?: { type: "fix"; files: { path: string; description: string }[] };
  thinking: { model: string; summary: string; durationMs: number }[];
  tokensUsed: number;
  modelsUsed: string[];
  cost: number;
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

const STRATEGIC_SYSTEM_PROMPT = `You are the Strategic Execution Agent — an elite AI assistant, debugger, and problem solver. You have deep expertise in web development (HTML, CSS, JavaScript, React, TypeScript, Node.js) and general knowledge.

Rules:
- Be direct, concise, and fast
- Respond in the user's language (Arabic or English)
- When showing code, use markdown code blocks with language tags (e.g. \`\`\`typescript)
- Reference specific file paths when suggesting fixes
- For quick questions, give quick answers — no unnecessary structure
- Only provide detailed analysis when the problem requires it

When you identify files that need fixing, end your response with a JSON block:
\`\`\`json
{"fixFiles": [{"path": "src/file.tsx", "description": "What to fix"}]}
\`\`\`
Only include this JSON block when actual file fixes are needed. For general discussion, just respond naturally.`;

const GOVERNOR_MERGE_PROMPT = `You are the Strategic Governor — the final decision maker. You received analyses from multiple expert AI models examining the same problem. Your job:

1. Evaluate each analysis for correctness, depth, and practicality
2. Identify the BEST diagnosis and solution across all proposals  
3. Merge the strongest elements into a single, authoritative response
4. If proposals disagree, choose the most technically sound one
5. Respond in the SAME LANGUAGE as the original user message

Output strict JSON:
{
  "analysis": "Final merged analysis",
  "solution": "Best solution combining strongest elements from all proposals",
  "fixFiles": [{"path": "...", "description": "..."}],
  "confidence": 0.0-1.0,
  "needsMoreInfo": false
}`;

async function callModelDirect(
  provider: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number,
  timeoutSeconds: number,
  temperature?: number
): Promise<{ content: string; tokensUsed: number } | null> {
  const timeoutMs = timeoutSeconds * 1000;

  try {
    if (provider === "anthropic") {
      const client = await getAnthropicClient();
      const createParams: any = {
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      };
      if (temperature !== undefined && temperature >= 0) {
        createParams.temperature = Math.min(temperature, 1.0);
      }
      const response = await Promise.race([
        client.messages.create(createParams),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutSeconds}s`)), timeoutMs)
        ),
      ]);
      const content = response.content
        .filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string; text: string }) => b.text)
        .join("");
      const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      return { content, tokensUsed };
    } else if (provider === "openai") {
      const client = await getOpenAIClient();
      const createParams: any = {
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system" as const, content: systemPrompt },
          ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        ],
      };
      if (temperature !== undefined && temperature >= 0) {
        createParams.temperature = Math.min(temperature, 2.0);
      }
      const response = await Promise.race([
        client.chat.completions.create(createParams),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutSeconds}s`)), timeoutMs)
        ),
      ]);
      const content = response.choices[0]?.message?.content ?? "";
      const tokensUsed = (response.usage?.prompt_tokens ?? 0) + (response.usage?.completion_tokens ?? 0);
      return { content, tokensUsed };
    }
    return null;
  } catch (error: any) {
    const reason = error?.message || String(error);
    console.error(`[Strategic] Model ${model} failed:`, error);
    const err = new Error(`Model ${model} failed: ${reason}`);
    (err as any).reason = reason;
    (err as any).model = model;
    throw err;
  }
}

function getEnabledSlots(config: AgentConfig): ModelSlot[] {
  const slots: ModelSlot[] = [];
  if (config.primaryModel && (config.primaryModel as ModelSlot).enabled) {
    slots.push(config.primaryModel as ModelSlot);
  }
  if (config.secondaryModel && (config.secondaryModel as ModelSlot).enabled) {
    slots.push(config.secondaryModel as ModelSlot);
  }
  if (config.tertiaryModel && (config.tertiaryModel as ModelSlot).enabled) {
    slots.push(config.tertiaryModel as ModelSlot);
  }
  return slots;
}

interface FileAttachment {
  name: string;
  type: string;
  content: string;
}

export async function runStrategicAgent(
  projectId: string,
  userMessage: string,
  history: ConversationMessage[],
  shortTermMemory: any[],
  longTermMemory: any[],
  attachments?: FileAttachment[]
): Promise<StrategicResult> {
  const [config] = await db.select().from(agentConfigsTable)
    .where(eq(agentConfigsTable.agentKey, "strategic"))
    .limit(1);

  if (!config || !config.enabled) {
    throw new Error("Strategic agent is not configured or disabled");
  }

  const files = projectId === "general" ? [] : await db.select({
    filePath: projectFilesTable.filePath,
  }).from(projectFilesTable).where(eq(projectFilesTable.projectId, projectId));

  let contextBlock = "";
  if (files.length > 0) {
    const fileList = files.map(f => f.filePath).join("\n");
    contextBlock = `\n\nProject files (${files.length} files):\n${fileList}`;
  }

  let memoryBlock = "";
  if (shortTermMemory.length > 0) {
    memoryBlock += `\n\nShort-term memory:\n${JSON.stringify(shortTermMemory.slice(-10))}`;
  }
  if (longTermMemory.length > 0) {
    memoryBlock += `\n\nLong-term memory:\n${JSON.stringify(longTermMemory.slice(-20))}`;
  }

  let attachmentBlock = "";
  const imageAttachments: { name: string; data: string; mediaType: string }[] = [];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      const isImage = att.type.startsWith("image/");
      if (isImage) {
        imageAttachments.push({
          name: att.name,
          data: att.content.replace(/^data:[^;]+;base64,/, ""),
          mediaType: att.type,
        });
      } else {
        const decoded = att.content.startsWith("data:")
          ? Buffer.from(att.content.split(",")[1] || "", "base64").toString("utf-8")
          : att.content;
        attachmentBlock += `\n\n--- Attached file: ${att.name} (${att.type}) ---\n${decoded.slice(0, 50000)}`;
      }
    }
  }

  let fullSystemPrompt = config.systemPrompt || STRATEGIC_SYSTEM_PROMPT;

  if (config.description && (config.description as string).trim()) {
    fullSystemPrompt += `\n\nAgent description: ${(config.description as string).trim()}`;
  }

  if (config.instructions && (config.instructions as string).trim()) {
    fullSystemPrompt += `\n\nAdditional instructions:\n${(config.instructions as string).trim()}`;
  }

  if (config.permissions && Array.isArray(config.permissions) && config.permissions.length > 0) {
    fullSystemPrompt += `\n\nYour permissions: ${config.permissions.join(", ")}. Only perform actions within these permissions.`;
  }

  if (config.roleOnReceive && (config.roleOnReceive as string).trim()) {
    fullSystemPrompt += `\n\nWhen receiving input: ${(config.roleOnReceive as string).trim()}`;
  }

  if (config.roleOnSend && (config.roleOnSend as string).trim()) {
    fullSystemPrompt += `\n\nWhen sending output: ${(config.roleOnSend as string).trim()}`;
  }

  const enrichedPrompt = fullSystemPrompt + contextBlock + memoryBlock + attachmentBlock;

  let userContent: any = userMessage;
  if (imageAttachments.length > 0) {
    const parts: any[] = [];
    for (const img of imageAttachments) {
      parts.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.data },
      });
    }
    parts.push({ type: "text", text: userMessage + (attachmentBlock ? `\n\nAdditional attached files:${attachmentBlock}` : "") });
    userContent = parts;
  } else if (attachmentBlock) {
    userContent = userMessage + `\n\nAttached files:${attachmentBlock}`;
  }

  const conversationMessages: ConversationMessage[] = [
    ...history.slice(-20),
    { role: "user", content: userContent },
  ];

  const slots = getEnabledSlots(config);
  if (slots.length === 0) {
    throw new Error("No enabled models for strategic agent");
  }

  const useGovernor = config.governorEnabled && slots.length >= 2;
  const thinking: { model: string; summary: string; durationMs: number }[] = [];
  let totalTokens = 0;

  const effectiveCreativity = config.creativity ? parseFloat(String(config.creativity)) : undefined;
  const tokenLimitCap = config.tokenLimit || 0;

  if (!useGovernor) {
    const slot = slots[0];
    const start = Date.now();
    let maxTok = slot.maxTokens || 16000;
    if (tokenLimitCap > 0 && tokenLimitCap < maxTok) maxTok = tokenLimitCap;
    const result = await callModelDirect(
      slot.provider, slot.model,
      enrichedPrompt, conversationMessages,
      maxTok, slot.timeoutSeconds || 240,
      effectiveCreativity
    );
    const duration = Date.now() - start;

    if (!result) throw new Error("Strategic agent model returned empty response");

    thinking.push({ model: slot.model, summary: "Single model analysis", durationMs: duration });
    totalTokens = result.tokensUsed;

    const parsed = parseResponse(result.content, userMessage);
    const cost = totalTokens * 0.000015;

    await updateStats(config.agentKey, totalTokens, true, duration, cost);

    return {
      reply: parsed.reply,
      actions: parsed.actions,
      thinking,
      tokensUsed: totalTokens,
      modelsUsed: [slot.model],
      cost,
    };
  }

  console.log(`[Strategic] Running ${slots.length} thinker models in parallel`);

  const thinkResults = await Promise.allSettled(
    slots.map(async (slot): Promise<ThinkResult | null> => {
      const start = Date.now();
      let slotMaxTok = slot.maxTokens || 16000;
      if (tokenLimitCap > 0 && tokenLimitCap < slotMaxTok) slotMaxTok = tokenLimitCap;
      const result = await callModelDirect(
        slot.provider, slot.model,
        enrichedPrompt, conversationMessages,
        slotMaxTok, slot.timeoutSeconds || 240,
        effectiveCreativity
      );
      const duration = Date.now() - start;
      if (!result) return null;
      return { content: result.content, tokensUsed: result.tokensUsed, model: slot.model, durationMs: duration };
    })
  );

  const successThinks: ThinkResult[] = [];
  for (const r of thinkResults) {
    if (r.status === "fulfilled" && r.value) {
      successThinks.push(r.value);
      thinking.push({ model: r.value.model, summary: `Analysis completed`, durationMs: r.value.durationMs });
      totalTokens += r.value.tokensUsed;
    }
  }

  if (successThinks.length === 0) {
    throw new Error("All strategic thinker models failed");
  }

  if (successThinks.length === 1) {
    const parsed = parseResponse(successThinks[0].content, userMessage);
    const cost = totalTokens * 0.000015;
    await updateStats(config.agentKey, totalTokens, true, successThinks[0].durationMs, cost);
    return { reply: parsed.reply, actions: parsed.actions, thinking, tokensUsed: totalTokens, modelsUsed: [successThinks[0].model], cost };
  }

  const proposalsText = successThinks.map((r, i) =>
    `=== PROPOSAL ${i + 1} (from ${r.model}) ===\n${r.content}`
  ).join("\n\n");

  const govModelConfig = config.governorModel as { provider: string; model: string; maxTokens?: number; timeoutSeconds?: number } | null;
  const govProvider = govModelConfig?.provider ?? slots[0].provider;
  const govModel = govModelConfig?.model ?? slots[0].model;
  const govMaxTokens = govModelConfig?.maxTokens ?? 16000;
  const govTimeout = govModelConfig?.timeoutSeconds ?? 240;

  console.log(`[Strategic] Governor merging ${successThinks.length} proposals using ${govModel}`);

  const govStart = Date.now();
  const mergeResult = await callModelDirect(
    govProvider, govModel,
    GOVERNOR_MERGE_PROMPT,
    [{ role: "user", content: `User's original message: "${userMessage}"\n\n${proposalsText}\n\nProduce the BEST unified analysis:` }],
    govMaxTokens, govTimeout,
    effectiveCreativity
  );
  const govDuration = Date.now() - govStart;

  if (mergeResult) {
    totalTokens += mergeResult.tokensUsed;
    thinking.push({ model: `${govModel} (governor)`, summary: `Merged ${successThinks.length} proposals`, durationMs: govDuration });
    const parsed = parseResponse(mergeResult.content, userMessage);
    const cost = totalTokens * 0.000015;
    const totalDuration = thinking.reduce((s, t) => s + t.durationMs, 0);
    await updateStats(config.agentKey, totalTokens, true, totalDuration, cost);
    return {
      reply: parsed.reply,
      actions: parsed.actions,
      thinking,
      tokensUsed: totalTokens,
      modelsUsed: [...successThinks.map(r => r.model), `${govModel}(governor)`],
      cost,
    };
  }

  const parsed = parseResponse(successThinks[0].content, userMessage);
  const cost = totalTokens * 0.000015;
  await updateStats(config.agentKey, totalTokens, true, 0, cost);
  return { reply: parsed.reply, actions: parsed.actions, thinking, tokensUsed: totalTokens, modelsUsed: successThinks.map(r => r.model), cost };
}

function parseResponse(raw: string, _userMessage: string): { reply: string; actions?: { type: "fix"; files: { path: string; description: string }[] } } {
  const jsonBlockMatch = raw.match(/```json\s*\n?([\s\S]*?)\n?```\s*$/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      const reply = raw.slice(0, raw.lastIndexOf("```json")).trim();
      if (parsed.fixFiles && Array.isArray(parsed.fixFiles) && parsed.fixFiles.length > 0) {
        return { reply, actions: { type: "fix", files: parsed.fixFiles } };
      }
      return { reply };
    } catch {}
  }

  try {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    let parsed: any = null;
    try { parsed = JSON.parse(cleaned); } catch {
      const braceStart = cleaned.indexOf("{");
      const braceEnd = cleaned.lastIndexOf("}");
      if (braceStart !== -1 && braceEnd > braceStart) {
        try { parsed = JSON.parse(cleaned.substring(braceStart, braceEnd + 1)); } catch { parsed = null; }
      }
    }
    if (parsed) {
      const analysis = parsed.analysis || "";
      const solution = parsed.solution || "";
      const reply = solution ? `${analysis}\n\n${solution}` : analysis || raw;
      if (parsed.fixFiles && Array.isArray(parsed.fixFiles) && parsed.fixFiles.length > 0) {
        return { reply, actions: { type: "fix", files: parsed.fixFiles } };
      }
      return { reply };
    }
  } catch {}

  return { reply: raw };
}

async function updateStats(agentKey: string, tokensUsed: number, success: boolean, durationMs: number, costUsd: number) {
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

    await db.update(agentConfigsTable).set({
      totalTasksCompleted: totalTasks,
      totalErrors: totalErrors,
      totalTokensUsed: totalTokens,
      avgExecutionMs: avgMs,
      totalCostUsd: totalCost,
      updatedAt: new Date(),
    }).where(eq(agentConfigsTable.agentKey, agentKey));
  } catch (err) {
    console.error(`[Strategic] Failed to update stats:`, err);
  }
}

export async function addToMemory(
  agentKey: string,
  type: "short" | "long",
  entry: { content: string; timestamp: string; context?: string }
) {
  const [config] = await db.select().from(agentConfigsTable)
    .where(eq(agentConfigsTable.agentKey, agentKey))
    .limit(1);
  if (!config) return;

  const memory = type === "short"
    ? [...(config.shortTermMemory || []), entry]
    : [...(config.longTermMemory || []), entry];

  const MAX_MEMORY_ENTRIES = type === "short" ? 50 : 200;
  const trimmed = memory.slice(-MAX_MEMORY_ENTRIES);

  const field = type === "short" ? "shortTermMemory" : "longTermMemory";
  await db.update(agentConfigsTable).set({
    [field]: trimmed,
    updatedAt: new Date(),
  }).where(eq(agentConfigsTable.agentKey, agentKey));
}

export async function callModelForConfig(
  provider: string,
  model: string,
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  maxTokens: number,
  timeoutSeconds: number
): Promise<{ content: string; tokensUsed: number } | null> {
  return callModelDirect(provider, model, systemPrompt, messages, maxTokens, timeoutSeconds);
}

export async function clearMemory(agentKey: string, type: "short" | "long" | "all") {
  const updates: any = { updatedAt: new Date() };
  if (type === "short" || type === "all") updates.shortTermMemory = [];
  if (type === "long" || type === "all") updates.longTermMemory = [];

  await db.update(agentConfigsTable).set(updates)
    .where(eq(agentConfigsTable.agentKey, agentKey));
}
