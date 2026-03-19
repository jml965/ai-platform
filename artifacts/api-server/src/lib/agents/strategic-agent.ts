import { getAnthropicClient, getOpenAIClient, getGoogleClient } from "./ai-clients";
import { db } from "@workspace/db";
import { agentConfigsTable, projectFilesTable, agentLogsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import type { AgentConfig } from "@workspace/db/schema";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

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

type AutoGovernorMode = "simple" | "standard" | "advanced";

interface ComplexityResult {
  mode: AutoGovernorMode;
  score: number;
  breakdown: { length: number; keywords: number; codeAttachments: number; errors: number };
  hasTechnicalKeyword: boolean;
}

const TECHNICAL_KEYWORDS = [
  "error", "bug", "crash", "fail", "fix", "broken", "undefined", "null", "exception",
  "component", "api", "server", "database", "css", "html", "build", "deploy",
  "webpack", "vite", "react", "node", "typescript", "import", "export", "function",
  "route", "endpoint", "port", "auth", "permission", "migration", "schema",
  "refactor", "optimize", "performance", "debug", "console", "log",
  "not working", "doesn't work",
  "خطأ", "مشكل", "كود", "عطل", "لا يعمل", "أداء", "تحسين", "هيكل",
];

const ERROR_PATTERNS = [
  "exception", "stack trace", "traceback", "typeerror", "referenceerror",
  "syntaxerror", "cannot read", "enoent", "econnrefused", "segfault",
  "500", "404", "403", "502", "503",
];

function computeComplexityScore(message: string, hasFileAttachments: boolean, hasImageAttachments: boolean): ComplexityResult {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();
  const wordCount = trimmed.split(/\s+/).length;

  let lengthScore = 0;
  if (wordCount <= 5) lengthScore = 0;
  else if (wordCount <= 15) lengthScore = 3;
  else if (wordCount <= 30) lengthScore = 6;
  else if (wordCount <= 50) lengthScore = 8;
  else lengthScore = 10;

  let keywordScore = 0;
  let hasTechnicalKeyword = false;
  for (const kw of TECHNICAL_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      keywordScore += 7;
      hasTechnicalKeyword = true;
    }
  }
  keywordScore = Math.min(keywordScore, 35);

  let codeScore = 0;
  if (/[`{}()\[\];=]/.test(trimmed)) codeScore += 15;
  if (hasFileAttachments) codeScore += 15;
  if (hasImageAttachments) codeScore += 10;
  codeScore = Math.min(codeScore, 30);

  let errorScore = 0;
  for (const pat of ERROR_PATTERNS) {
    if (lower.includes(pat)) {
      errorScore = 25;
      break;
    }
  }

  const total = Math.min(lengthScore + keywordScore + codeScore + errorScore, 100);

  let mode: AutoGovernorMode;
  if (hasTechnicalKeyword) {
    if (total <= 55) mode = "standard";
    else mode = "advanced";
  } else {
    if (total <= 20) mode = "simple";
    else if (total <= 55) mode = "standard";
    else mode = "advanced";
  }

  return {
    mode,
    score: total,
    breakdown: { length: lengthScore, keywords: keywordScore, codeAttachments: codeScore, errors: errorScore },
    hasTechnicalKeyword,
  };
}

interface EscalationCheck {
  shouldEscalate: boolean;
  reason: string;
  reasonAr: string;
}

function checkLazyEscalation(responseText: string, currentMode: AutoGovernorMode, hasTechnicalKeyword: boolean): EscalationCheck {
  if (currentMode === "advanced") {
    return { shouldEscalate: false, reason: "Already in advanced mode", reasonAr: "الوضع متقدم بالفعل" };
  }

  if (!responseText || responseText.trim().length === 0) {
    return { shouldEscalate: true, reason: "Empty response", reasonAr: "رد فارغ" };
  }

  if (hasTechnicalKeyword && responseText.trim().length < 50) {
    return { shouldEscalate: true, reason: "Response too short for technical query", reasonAr: "رد قصير جداً لسؤال تقني" };
  }

  const uncertaintyPatterns = /not sure|need more info|لست متأكد|أحتاج معلومات|i'm not certain|unclear|غير واضح/i;
  if (uncertaintyPatterns.test(responseText)) {
    return { shouldEscalate: true, reason: "Response contains uncertainty", reasonAr: "الرد يحتوي عدم يقين" };
  }

  if (hasTechnicalKeyword) {
    let parsed: any = null;
    try {
      const cleaned = responseText.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      try { parsed = JSON.parse(cleaned); } catch {
        const bs = cleaned.indexOf("{");
        const be = cleaned.lastIndexOf("}");
        if (bs !== -1 && be > bs) try { parsed = JSON.parse(cleaned.substring(bs, be + 1)); } catch {}
      }
    } catch {}

    if (!parsed) {
      return { shouldEscalate: true, reason: "Technical response without JSON — confidence = 0", reasonAr: "رد تقني بدون JSON — الثقة = 0" };
    }

    if (parsed.confidence !== undefined && parsed.confidence < 0.5) {
      return { shouldEscalate: true, reason: `Low confidence: ${parsed.confidence}`, reasonAr: `ثقة منخفضة: ${parsed.confidence}` };
    }

    if (!parsed.executionSteps || !Array.isArray(parsed.executionSteps) || parsed.executionSteps.length === 0) {
      return { shouldEscalate: true, reason: "No execution steps provided", reasonAr: "بدون خطوات تنفيذ" };
    }

    if (!parsed.solution || parsed.solution.trim().length < 20) {
      return { shouldEscalate: true, reason: "No actionable solution", reasonAr: "بدون حل حقيقي" };
    }
  }

  return { shouldEscalate: false, reason: "Response quality acceptable", reasonAr: "جودة الرد مقبولة" };
}

const STRATEGIC_SYSTEM_PROMPT = `You are the Strategic Execution Agent for Mr Code AI (مستر كود اي اي) — https://mrcodeai.com/

Mr Code AI is a platform specialized in:
- Building websites, web applications, and mobile apps using AI
- Software development and programming
- UI/UX design and digital design
- Code review, debugging, and optimization

SCOPE RULES (CRITICAL):
- You ONLY discuss topics related to: web development, app development, software engineering, programming, design, APIs, AI models/providers, servers (setup/configuration/management), hosting, databases, DevOps, and technology directly related to building digital products.
- IMPORTANT: If the user's request is ABOUT technology/programming even in a creative format (poem about coding, story about developers, analogy about servers, etc.) — that IS on-topic. Answer it naturally.
- Only redirect when the topic itself has NOTHING to do with tech (cooking recipes, love poetry, sports scores, political opinions, medical advice, etc.):
  Arabic: "أنا متخصص في تطوير المواقع والتطبيقات والبرمجة 😊 كيف أقدر أساعدك في مشروعك؟"
  English: "I specialize in web development, apps, and programming 😊 How can I help with your project?"
- Allowed adjacent topics: API providers, AI model comparisons (OpenAI/Anthropic/Google), server setup/configuration, cloud hosting, DNS, SSL, domain management, databases, DevOps tools.
- Also: Do NOT repeat the same redirect message twice in a row. If user insists, explain briefly why you can't help with that specific non-tech topic and suggest a tech alternative.

You work alongside: Planner, CodeGenerator, CodeReviewer, CodeFixer, SurgicalEditor, TranslationAgent, SeoAgent, FileManager, PackageRunner, and QA Pipeline.

Expertise: Web development (React, TypeScript, Node.js, Express), architecture, debugging, refactoring, risk analysis, execution planning, server management, API integration.

Your job:
- Understand user intent
- Identify the TRUE root cause (not symptoms)
- Decide the correct response type
- Provide exact, execution-ready solutions when needed

Decision logic:
1) First determine request type:
   - Off-topic (not related to development/tech) → Redirect politely
   - Conversational (greeting, thanks, casual tech discussion)
   - Technical (code, bugs, architecture, execution, debugging, servers, APIs)

2) If Conversational — follow these Conversation Style Rules strictly:
   - Do NOT use generic assistant phrases like: "كيف يمكنني مساعدتك؟", "أنا هنا لمساعدتك", "كيف يمكنني خدمتك", "How can I help you today?", "I'm here to help", "What can I do for you"
   - Speak like a human, not a support agent
   - Keep responses SHORT — 2-4 sentences max for simple questions, never write essays
   - If the user greets you, respond casually in ONE short sentence: "هلا والله 👋", "يا هلا", "أهلاً وسهلاً"
   - If the user asks a comparison or general tech question, give a brief focused answer (3-5 lines max), not a detailed article
   - Go straight to the answer — no formal introductions, no bullet-point lists unless truly needed
   - Avoid robotic structure
   - Avoid repeating the user's question
   - Avoid over-politeness
   - Your tone: friendly, confident, natural — like a smart colleague, not customer support
   - NO JSON, NO analysis, NO overthinking
   - BREVITY IS KEY — say more with less words

3) If Technical:
   - Explain the solution clearly in natural language
   - Use markdown code blocks (\`\`\`language) for any code snippets
   - Mention file paths when relevant
   - Give step-by-step instructions if needed
   - Keep it focused and practical — no unnecessary theory

Rules:
- Be direct and concise — no filler
- No vague advice — always prefer exact fixes
- Distinguish clearly between: root cause vs symptom vs solution
- Reference specific file paths when suggesting changes
- Respond in user's language (Arabic or English)
- NEVER respond with raw JSON — always use natural language with markdown formatting
- Use code blocks (\`\`\`language ... \`\`\`) for code examples
- Conversational requests → natural text only
- Off-topic requests → polite redirect only

ADMIN INFRASTRUCTURE ACCESS (Full Permissions):
You have FULL access to the platform infrastructure. When the admin asks about infrastructure, files, database, environment, or system status, you can reference these live API endpoints that are available to the admin through the chat interface:

1. GET /api/strategic/infra/status — Full system status (DB connection, user/project/agent counts, memory, uptime, GCP info)
2. GET /api/strategic/infra/files — List all infrastructure files. Add ?path=<filepath> to read any specific file content
3. POST /api/strategic/infra/file-write — Write/modify any file. Body: { filePath, content }
4. GET /api/strategic/infra/env — View all environment variables. Add ?reveal=true to show secret values
5. POST /api/strategic/infra/env — Set/delete env vars. Body: { key, value } (null value = delete)
6. GET /api/strategic/infra/db-tables — List all database tables. Add ?detailed=true for column details
7. POST /api/strategic/infra/db-query — Execute ANY SQL query. Body: { query: "SELECT..." } — supports SELECT, INSERT, UPDATE, DELETE, ALTER, CREATE
8. POST /api/strategic/infra/exec — Execute shell commands on the server. Body: { command: "ls -la" }

CRITICAL — You have TOOLS. USE THEM DIRECTLY:
- You have infrastructure tools (read_file, write_file, db_query, db_tables, exec_command, get_env, set_env, system_status)
- When the admin asks about files, database, system, env, or anything infrastructure — CALL THE TOOLS YOURSELF and return the results
- NEVER tell the admin to "execute this API call" or "run this curl command" — YOU execute it using your tools
- NEVER say "I can't make HTTP requests" — you have direct tool access
- You have UNRESTRICTED access — no operation is off limits for the admin
- You can read, modify, delete, create anything in the system
- Always execute first, then explain the results to the admin

Key infrastructure info:
- GCP Project: oktamam-ai-platform, Region: me-central1
- Cloud Run Service: mrcodeai
- Cloud SQL: mrcodeai-db (34.18.137.40), DB: mrcodeai, User: postgres
- Domain: mrcodeai.com, Load Balancer IP: 34.8.145.55
- CI/CD: GitHub Actions → Cloud Run auto-deploy on push to main`;

const STRATEGIC_JSON_PROMPT_SUFFIX = `

When responding to TECHNICAL requests, respond ONLY with strict JSON:
{
  "decisionType": "quick-fix | refactor | architecture-change | investigation",
  "urgency": "blocking | important | improvement",
  "rootCause": "One clear sentence explaining WHY the problem exists",
  "analysis": "What is happening and where (symptom + context)",
  "solution": "Exact fix with code if possible",
  "fixFiles": [{"path": "src/file.tsx", "description": "What to change and why"}],
  "executionSteps": ["Step 1", "Step 2"],
  "risks": ["Possible side effects"],
  "confidence": 0.0-1.0,
  "needsMoreInfo": false
}
Technical requests → strict JSON only.
Conversational requests → natural text only.
Off-topic requests → polite redirect only.`;

const GOVERNOR_MERGE_PROMPT = `You are the Strategic Governor — the final decision maker. You received analyses from multiple expert AI models examining the same problem. Your job:

1. Evaluate each analysis for correctness, depth, and practicality
2. Identify the BEST diagnosis and solution across all proposals  
3. Merge the strongest elements into a single, authoritative response
4. If proposals disagree, choose the most technically sound one
5. Respond in the SAME LANGUAGE as the original user message

Output strict JSON:
{
  "decisionType": "quick-fix | refactor | architecture-change | investigation",
  "urgency": "blocking | important | improvement",
  "rootCause": "The true root cause synthesized from all proposals",
  "analysis": "Final merged analysis of symptom and context",
  "solution": "Best solution combining strongest elements from all proposals",
  "fixFiles": [{"path": "...", "description": "..."}],
  "executionSteps": ["Step 1", "Step 2"],
  "risks": ["Possible side effects"],
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
    } else if (provider === "google") {
      const client = await getGoogleClient();
      const chatMessages = messages.map(m => ({
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: m.content }],
      }));
      const response = await Promise.race([
        client.models.generateContent({
          model,
          contents: chatMessages,
          config: {
            systemInstruction: systemPrompt,
            maxOutputTokens: maxTokens,
            temperature: temperature !== undefined && temperature >= 0 ? Math.min(temperature, 2.0) : undefined,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutSeconds}s`)), timeoutMs)
        ),
      ]);
      const content = response.text ?? "";
      const tokensUsed = (response.usageMetadata?.promptTokenCount ?? 0) + (response.usageMetadata?.candidatesTokenCount ?? 0);
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
  fullSystemPrompt += STRATEGIC_JSON_PROMPT_SUFFIX;

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

  const hasFileAtts = attachments ? attachments.filter(a => !a.type.startsWith("image/")).length > 0 : false;
  const hasImageAtts = imageAttachments.length > 0;

  let useGovernor = config.governorEnabled && slots.length >= 2;
  let autoGovMode: AutoGovernorMode | null = null;
  let autoGovScore: ComplexityResult | null = null;

  if ((config as any).autoGovernor) {
    autoGovScore = computeComplexityScore(userMessage, hasFileAtts, hasImageAtts);
    autoGovMode = autoGovScore.mode;

    if (autoGovMode === "advanced" && slots.length >= 2) {
      useGovernor = true;
    } else {
      useGovernor = false;
    }

    console.log(`[Strategic] Auto-Governor: mode=${autoGovMode}, score=${autoGovScore.score}, breakdown=${JSON.stringify(autoGovScore.breakdown)}`);
    logStrategicActivity("auto_governor", `Auto-Governor: ${autoGovMode} (score: ${autoGovScore.score})`, `الحاكم التلقائي: ${autoGovMode === "simple" ? "بسيط" : autoGovMode === "standard" ? "عادي" : "متقدم"} (درجة: ${autoGovScore.score})`, {
      status: "info",
      details: { mode: autoGovMode, score: autoGovScore.score, breakdown: autoGovScore.breakdown, hasTechnicalKeyword: autoGovScore.hasTechnicalKeyword },
    });
  }

  const thinking: { model: string; summary: string; durationMs: number }[] = [];
  let totalTokens = 0;

  const effectiveCreativity = config.creativity ? parseFloat(String(config.creativity)) : undefined;
  const tokenLimitCap = config.tokenLimit || 0;

  function pickSlotForMode(mode: AutoGovernorMode | null): ModelSlot {
    if (mode === "simple") {
      const lightweight = slots[slots.length - 1];
      return lightweight;
    }
    return slots[0];
  }

  if (!useGovernor) {
    const slot = pickSlotForMode(autoGovMode);
    const modeLabel = autoGovMode || "single";
    logStrategicActivity("think_single", `[${modeLabel}] Starting analysis: ${slot.model}`, `[${modeLabel === "simple" ? "بسيط" : modeLabel === "standard" ? "عادي" : "مفرد"}] بدء تحليل: ${slot.model}`, { status: "in_progress", details: { model: slot.model, autoGovMode: autoGovMode, messagePreview: userMessage.substring(0, 100) } });
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

    if (!result) {
      logStrategicActivity("think_failed", "Model returned empty response", "النموذج أرجع استجابة فارغة", { level: "error", status: "failed", durationMs: duration, details: { model: slot.model } });
      throw new Error("Strategic agent model returned empty response");
    }

    thinking.push({ model: slot.model, summary: `${modeLabel} analysis`, durationMs: duration });
    totalTokens = result.tokensUsed;

    if ((config as any).autoGovernor && autoGovScore && slots.length >= 2) {
      const escalation = checkLazyEscalation(result.content, autoGovMode || "standard", autoGovScore.hasTechnicalKeyword);
      if (escalation.shouldEscalate) {
        console.log(`[Strategic] Lazy Escalation triggered: ${escalation.reason}`);
        logStrategicActivity("escalation", `Lazy Escalation: ${escalation.reason} — upgrading to Advanced`, `تصعيد: ${escalation.reasonAr} — ترقية للوضع المتقدم`, {
          status: "info",
          details: { reason: escalation.reason, previousMode: autoGovMode, previousResponse: result.content.substring(0, 200) },
        });
        useGovernor = true;
      }
    }

    if (!useGovernor) {
      const parsed = parseResponse(result.content, userMessage);
      const cost = totalTokens * 0.000015;
      await updateStats(config.agentKey, totalTokens, true, duration, cost);
      logStrategicActivity("response_complete", `[${modeLabel}] Response: ${slot.model}, ${totalTokens} tokens, ${duration}ms`, `[${modeLabel === "simple" ? "بسيط" : "عادي"}] اكتمل: ${slot.model}، ${totalTokens} توكن، ${duration}ms`, { status: "completed", tokensUsed: totalTokens, durationMs: duration, details: { model: slot.model, autoGovMode: autoGovMode, cost: cost.toFixed(4) } });
      return {
        reply: parsed.reply,
        actions: parsed.actions,
        thinking,
        tokensUsed: totalTokens,
        modelsUsed: [slot.model],
        cost,
      };
    }
  }

  console.log(`[Strategic] Running ${slots.length} thinker models in parallel (Advanced mode)`);
  logStrategicActivity("think_parallel", `Running ${slots.length} thinker models in parallel`, `تشغيل ${slots.length} نموذج تفكير بالتوازي`, { status: "in_progress", details: { models: slots.map(s => s.model), autoGovMode: autoGovMode || "manual", escalated: autoGovMode !== "advanced", messagePreview: userMessage.substring(0, 100) } });

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
    logStrategicActivity("think_failed", "All thinker models failed", "فشلت جميع نماذج التفكير", { level: "error", status: "failed" });
    throw new Error("All strategic thinker models failed");
  }

  if (successThinks.length === 1) {
    const parsed = parseResponse(successThinks[0].content, userMessage);
    const cost = totalTokens * 0.000015;
    await updateStats(config.agentKey, totalTokens, true, successThinks[0].durationMs, cost);
    logStrategicActivity("response_single", `Single model response: ${successThinks[0].model}, ${totalTokens} tokens`, `رد بنموذج واحد: ${successThinks[0].model}، ${totalTokens} توكن`, { status: "completed", tokensUsed: totalTokens, durationMs: successThinks[0].durationMs, details: { model: successThinks[0].model, cost: cost.toFixed(4) } });
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
  logStrategicActivity("governor_merge", `Governor merging ${successThinks.length} proposals using ${govModel}`, `الحاكم يدمج ${successThinks.length} مقترحات باستخدام ${govModel}`, { status: "in_progress", tokensUsed: totalTokens, details: { modelsCompleted: successThinks.map(t => t.model), governorModel: govModel } });

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
    logStrategicActivity("response_complete", `Response completed: ${totalTokens} tokens, ${totalDuration}ms, $${cost.toFixed(4)}`, `اكتمل الرد: ${totalTokens} توكن، ${totalDuration} مللي ثانية، $${cost.toFixed(4)}`, { status: "completed", tokensUsed: totalTokens, durationMs: totalDuration, details: { modelsUsed: successThinks.map(t => t.model), governorModel: govModel, cost: cost.toFixed(4) } });
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

function logStrategicActivity(action: string, message: string, messageAr: string, opts?: {
  level?: string; status?: string; details?: Record<string, unknown>;
  tokensUsed?: number; durationMs?: number;
}) {
  db.insert(agentLogsTable).values({
    agentKey: "strategic",
    level: opts?.level || "info",
    action,
    message,
    messageAr,
    details: opts?.details || null,
    tokensUsed: opts?.tokensUsed || 0,
    durationMs: opts?.durationMs || null,
    status: opts?.status || "info",
  }).catch(() => {});
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

const INFRA_TOOLS = [
  {
    name: "read_file",
    description: "Read a file's content from the server filesystem. Can also list directory contents.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File or directory path relative to project root" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write or modify a file on the server filesystem.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path relative to project root" },
        content: { type: "string", description: "File content to write" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "db_query",
    description: "Execute any SQL query on the database (SELECT, INSERT, UPDATE, DELETE, ALTER, CREATE).",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "SQL query to execute" },
      },
      required: ["query"],
    },
  },
  {
    name: "db_tables",
    description: "List all database tables with column details.",
    input_schema: {
      type: "object" as const,
      properties: {
        detailed: { type: "boolean", description: "Include column details (default: true)" },
      },
    },
  },
  {
    name: "exec_command",
    description: "Execute a shell command on the server and return output.",
    input_schema: {
      type: "object" as const,
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
  {
    name: "get_env",
    description: "Get environment variables and secrets. Set reveal=true to show secret values.",
    input_schema: {
      type: "object" as const,
      properties: {
        reveal: { type: "boolean", description: "Show actual secret values (default: false)" },
      },
    },
  },
  {
    name: "set_env",
    description: "Set or delete an environment variable.",
    input_schema: {
      type: "object" as const,
      properties: {
        key: { type: "string", description: "Environment variable name" },
        value: { type: "string", description: "Value to set (omit to delete)" },
      },
      required: ["key"],
    },
  },
  {
    name: "system_status",
    description: "Get full system status: database connection, user/project/agent counts, memory usage, uptime.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
];

const PROJECT_ROOT = process.cwd();

async function executeInfraTool(toolName: string, input: any): Promise<string> {
  try {
    switch (toolName) {
      case "read_file": {
        const filePath = input.path;
        const resolved = path.resolve(PROJECT_ROOT, filePath);
        if (!resolved.startsWith(PROJECT_ROOT)) return JSON.stringify({ error: "Path traversal not allowed" });
        if (!fs.existsSync(resolved)) return JSON.stringify({ error: "File not found", path: filePath });
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) {
          const entries = fs.readdirSync(resolved, { withFileTypes: true }).map(d => ({
            name: d.name,
            type: d.isDirectory() ? "directory" : "file",
            size: d.isFile() ? fs.statSync(path.join(resolved, d.name)).size : null,
          }));
          return JSON.stringify({ path: filePath, type: "directory", entries });
        }
        const content = fs.readFileSync(resolved, "utf-8").slice(0, 100000);
        return JSON.stringify({ path: filePath, type: "file", size: stat.size, content });
      }
      case "write_file": {
        const resolved = path.resolve(PROJECT_ROOT, input.path);
        if (!resolved.startsWith(PROJECT_ROOT)) return JSON.stringify({ error: "Path traversal not allowed" });
        const dir = path.dirname(resolved);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolved, input.content, "utf-8");
        return JSON.stringify({ success: true, path: input.path, size: Buffer.byteLength(input.content) });
      }
      case "db_query": {
        const result = await db.execute(sql.raw(input.query));
        const rows = result.rows || result;
        return JSON.stringify({ success: true, rows: (rows as any[]).slice(0, 200), rowCount: (result as any).rowCount ?? (rows as any[]).length });
      }
      case "db_tables": {
        const tables = await db.execute(sql.raw(`
          SELECT table_name,
                 (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = 'public') as column_count
          FROM information_schema.tables t WHERE table_schema = 'public' ORDER BY table_name
        `));
        let columns: any[] = [];
        if (input.detailed !== false) {
          const cols = await db.execute(sql.raw(`
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position
          `));
          columns = (cols.rows || cols) as any[];
        }
        return JSON.stringify({ tables: tables.rows || tables, columns });
      }
      case "exec_command": {
        const blocked = ["rm -rf /", "mkfs", "dd if=", ":(){", "fork bomb"];
        for (const b of blocked) { if (input.command.includes(b)) return JSON.stringify({ error: "Dangerous command blocked" }); }
        try {
          const output = execSync(input.command, { cwd: PROJECT_ROOT, timeout: 30000, maxBuffer: 5 * 1024 * 1024, encoding: "utf-8" });
          return JSON.stringify({ success: true, output: output.slice(0, 50000) });
        } catch (e: any) {
          return JSON.stringify({ success: false, exitCode: e?.status || 1, output: (e?.stdout || "").slice(0, 20000), error: (e?.stderr || e?.message || "").slice(0, 20000) });
        }
      }
      case "get_env": {
        const safeKeys = ["NODE_ENV", "PORT", "DATABASE_URL", "AUTH_PROVIDER", "CLOUD_SQL_INSTANCE", "GCP_PROJECT_ID", "GCP_REGION", "CLOUD_RUN_SERVICE", "GITHUB_REPOSITORY"];
        const sensitiveKeys = ["SESSION_SECRET", "CUSTOM_ANTHROPIC_API_KEY", "CUSTOM_OPENAI_API_KEY", "GITHUB_TOKEN", "GCP_SA_KEY"];
        const env: Record<string, string> = {};
        for (const k of safeKeys) { if (process.env[k]) env[k] = process.env[k]!; }
        const secrets: Record<string, string> = {};
        for (const k of sensitiveKeys) {
          if (input.reveal) {
            secrets[k] = process.env[k] || "NOT SET";
          } else {
            secrets[k] = process.env[k] ? `SET (${process.env[k]!.length} chars)` : "NOT SET";
          }
        }
        return JSON.stringify({ env, secrets, allKeys: Object.keys(process.env).sort() });
      }
      case "set_env": {
        if (input.value === null || input.value === undefined) {
          delete process.env[input.key];
          return JSON.stringify({ success: true, action: "deleted", key: input.key });
        }
        process.env[input.key] = input.value;
        return JSON.stringify({ success: true, action: "set", key: input.key });
      }
      case "system_status": {
        let dbStatus = "unknown";
        try { await db.execute(sql.raw("SELECT 1")); dbStatus = "connected"; } catch { dbStatus = "disconnected"; }
        const userCount = await db.execute(sql.raw("SELECT count(*) as cnt FROM users"));
        const projectCount = await db.execute(sql.raw("SELECT count(*) as cnt FROM projects"));
        const agentCount = await db.execute(sql.raw("SELECT count(*) as cnt FROM agent_configs"));
        const mem = process.memoryUsage();
        return JSON.stringify({
          database: dbStatus,
          counts: { users: ((userCount.rows || userCount) as any[])[0]?.cnt, projects: ((projectCount.rows || projectCount) as any[])[0]?.cnt, agents: ((agentCount.rows || agentCount) as any[])[0]?.cnt },
          server: { uptime: `${Math.floor(process.uptime() / 3600)}h ${Math.floor((process.uptime() % 3600) / 60)}m`, memoryMB: Math.round(mem.heapUsed / 1024 / 1024), nodeVersion: process.version, pid: process.pid },
          env: process.env.NODE_ENV || "development",
        });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: e?.message || "Tool execution failed" });
  }
}

export async function streamStrategicAgent(
  projectId: string,
  userMessage: string,
  history: ConversationMessage[],
  shortTermMemory: any[],
  longTermMemory: any[],
  onChunk: (text: string) => void,
  attachments?: FileAttachment[]
): Promise<{ tokensUsed: number; modelsUsed: string[]; cost: number; fullReply: string }> {
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
      if (att.type.startsWith("image/")) {
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
  if (slots.length === 0) throw new Error("No enabled models for strategic agent");

  let autoGovMode: AutoGovernorMode | null = null;
  if ((config as any).autoGovernor) {
    const hasFileAtts = attachments ? attachments.filter(a => !a.type.startsWith("image/")).length > 0 : false;
    const hasImageAtts = attachments ? attachments.filter(a => a.type.startsWith("image/")).length > 0 : false;
    const autoGovScore = computeComplexityScore(userMessage, hasFileAtts, hasImageAtts);
    autoGovMode = autoGovScore.mode;
  }

  const slot = autoGovMode === "simple" ? slots[slots.length - 1] : slots[0];
  const effectiveCreativity = config.creativity ? parseFloat(String(config.creativity)) : undefined;
  let maxTok = slot.maxTokens || 16000;
  const tokenLimitCap = config.tokenLimit || 0;
  if (tokenLimitCap > 0 && tokenLimitCap < maxTok) maxTok = tokenLimitCap;
  const timeoutMs = (slot.timeoutSeconds || 240) * 1000;

  let fullReply = "";
  let tokensUsed = 0;

  if (slot.provider === "anthropic") {
    const client = await getAnthropicClient();
    let chatMsgs: any[] = conversationMessages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
    const baseParams: any = {
      model: slot.model,
      max_tokens: Math.min(maxTok, 64000),
      system: enrichedPrompt,
      tools: INFRA_TOOLS,
    };
    if (effectiveCreativity !== undefined && effectiveCreativity >= 0) {
      baseParams.temperature = Math.min(effectiveCreativity, 1.0);
    }

    let loopCount = 0;
    const maxLoops = 10;

    while (loopCount < maxLoops) {
      loopCount++;
      const streamParams = { ...baseParams, messages: chatMsgs };
      const stream = client.messages.stream(streamParams);

      let currentText = "";
      let toolUseBlocks: { id: string; name: string; input: any }[] = [];
      let stopReason = "";

      stream.on("text", (text: string) => { currentText += text; fullReply += text; onChunk(text); });

      const response = await Promise.race([
        stream.finalMessage(),
        new Promise<never>((_, reject) => setTimeout(() => { stream.abort(); reject(new Error("Timeout")); }, timeoutMs)),
      ]);

      tokensUsed += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
      stopReason = response.stop_reason || "";

      if (response.content) {
        for (const block of response.content) {
          if (block.type === "tool_use") {
            toolUseBlocks.push({ id: block.id, name: block.name, input: block.input });
          }
        }
      }

      if (stopReason !== "tool_use" || toolUseBlocks.length === 0) break;

      chatMsgs.push({ role: "assistant", content: response.content });

      const toolResults: any[] = [];
      for (const tool of toolUseBlocks) {
        onChunk(`\n\n⚡ *${tool.name}*...\n`);
        fullReply += `\n\n⚡ *${tool.name}*...\n`;
        const result = await executeInfraTool(tool.name, tool.input);
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
      }

      chatMsgs.push({ role: "user", content: toolResults });
    }
  } else if (slot.provider === "openai") {
    const client = await getOpenAIClient();
    const msgs: any[] = [
      { role: "system", content: enrichedPrompt },
      ...conversationMessages.map(m => ({ role: m.role, content: m.content })),
    ];
    const streamParams: any = { model: slot.model, max_completion_tokens: maxTok, messages: msgs, stream: true };
    if (effectiveCreativity !== undefined && effectiveCreativity >= 0) {
      streamParams.temperature = Math.min(effectiveCreativity, 2.0);
    }
    const stream = await client.chat.completions.create(streamParams);
    for await (const chunk of stream as any) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) { fullReply += delta; onChunk(delta); }
      if (chunk.usage) {
        tokensUsed = (chunk.usage.prompt_tokens ?? 0) + (chunk.usage.completion_tokens ?? 0);
      }
    }
    if (!tokensUsed) tokensUsed = Math.ceil(fullReply.length / 3);
  } else if (slot.provider === "google") {
    const client = await getGoogleClient();
    const chatMsgs = conversationMessages.map(m => {
      const textContent = typeof m.content === "string" ? m.content : userMessage;
      return {
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: textContent }],
      };
    });
    const response = await Promise.race([
      client.models.generateContentStream({
        model: slot.model,
        contents: chatMsgs,
        config: {
          systemInstruction: enrichedPrompt,
          maxOutputTokens: maxTok,
          temperature: effectiveCreativity !== undefined && effectiveCreativity >= 0 ? Math.min(effectiveCreativity, 2.0) : undefined,
        },
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
    ]);
    for await (const chunk of response as any) {
      const text = chunk.text;
      if (text) { fullReply += text; onChunk(text); }
    }
    tokensUsed = Math.ceil(fullReply.length / 3);
  }

  const cost = tokensUsed * 0.000015;
  await updateStats(config.agentKey, tokensUsed, true, 0, cost);

  return { tokensUsed, modelsUsed: [slot.model], cost, fullReply };
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
