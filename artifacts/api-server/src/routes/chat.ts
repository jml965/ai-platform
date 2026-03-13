import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { projectsTable, usersTable, projectFilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "../middlewares/permissions";
import { startBuild, checkBuildLimits } from "../lib/agents/execution-engine";

const router: IRouter = Router();

interface ChatRequest {
  projectId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const AGENT_SYSTEM_PROMPT = `You are an expert AI website builder assistant. You communicate naturally in the user's language.

Your ONLY job is to decide: does the user want to BUILD/MODIFY something, or just CHAT?

CRITICAL: You must respond with ONLY a valid JSON object. No markdown, no code blocks, no extra text.

Format: {"reply":"your short reply","action":"build"} or {"reply":"your short reply","action":"chat"}

Rules:
- action="build" for ANY request to create, modify, build, edit, change, fix, add, remove, update a website or any part of it
- action="build" for commands like "نفذ", "ابدأ", "اعمل", "غير", "عدل", "build", "create", "make", "start", "do it", "كمل"
- action="chat" ONLY for pure questions, greetings, or discussions with NO build intent
- Keep reply to 1-2 sentences max
- Reply in the same language as the user
- Do NOT generate any code or HTML in your reply
- Do NOT wrap your response in code blocks or markdown`;

router.post("/chat/message", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { projectId, message, history } = req.body as ChatRequest;

    if (!message?.trim()) {
      res.status(400).json({ error: { code: "VALIDATION", message: "Message is required" } });
      return;
    }

    const [project] = projectId
      ? await db.select().from(projectsTable).where(eq(projectsTable.id, projectId)).limit(1)
      : [null];

    const [user] = await db
      .select({ creditBalanceUsd: usersTable.creditBalanceUsd })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    const credits = parseFloat(user?.creditBalanceUsd ?? "0");
    if (credits <= 0) {
      res.status(402).json({
        error: {
          code: "INSUFFICIENT_CREDITS",
          message: "Insufficient credits.",
          message_ar: "رصيد غير كافٍ.",
        },
      });
      return;
    }

    let contextInfo = "";
    if (project) {
      contextInfo = `\n\nProject context:
- Name: ${project.name}
- Status: ${project.status}
- Description: ${project.description || "none"}`;

      const files = await db
        .select({ filePath: projectFilesTable.filePath })
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, projectId));
      if (files.length > 0) {
        contextInfo += `\n- Existing files: ${files.map(f => f.filePath).join(", ")}`;
      }
    }

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }

    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 150,
      system: AGENT_SYSTEM_PROMPT + contextInfo,
      messages,
    });

    const rawReply = response.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { type: string; text: string }) => block.text)
      .join("");

    console.log("[CHAT] Raw AI response:", rawReply);

    let reply = "";
    let shouldBuild = false;

    try {
      const cleaned = rawReply
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      const buildKeywords = /\b(build|create|make|start|do it|go|execute)\b|اعمل|ابن[يِ]?|نفذ|ابدأ|أبدأ|غير|عدل|صمم|أنشئ|كمل|سو[يّ]|اسو[يِ]|ابني/i;

      const jsonMatch = cleaned.match(/\{"reply"\s*:\s*"[^"]*"\s*,\s*"action"\s*:\s*"(?:build|chat)"\s*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        reply = parsed.reply || "";
        shouldBuild = parsed.action === "build";
      } else {
        const fallbackMatch = cleaned.match(/\{[\s\S]*?"action"\s*:\s*"(build|chat)"[\s\S]*?\}/);
        if (fallbackMatch) {
          try {
            const parsed = JSON.parse(fallbackMatch[0]);
            reply = parsed.reply || cleaned;
            shouldBuild = parsed.action === "build";
          } catch {
            reply = cleaned.replace(/[{}"\n]/g, " ").trim();
            shouldBuild = buildKeywords.test(reply) || buildKeywords.test(message);
          }
        } else {
          reply = cleaned.replace(/[{}"\n]/g, " ").trim() || rawReply;
          shouldBuild = buildKeywords.test(message);
        }
      }

      if (!shouldBuild && buildKeywords.test(message)) {
        shouldBuild = true;
        console.log("[CHAT] Build keyword override: user message contains build intent");
      }
    } catch {
      reply = rawReply;
      const buildKeywords = /\b(build|create|make|start|do it|go|execute)\b|اعمل|ابن[يِ]?|نفذ|ابدأ|أبدأ|غير|عدل|صمم|أنشئ|كمل|سو[يّ]|اسو[يِ]|ابني/i;
      shouldBuild = buildKeywords.test(message);
    }

    if (!reply) reply = shouldBuild ? "سأبدأ البناء الآن..." : rawReply;

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    const costUsd = tokensUsed * 0.000015;

    await db
      .update(usersTable)
      .set({
        creditBalanceUsd: String(Math.max(0, credits - costUsd)),
      })
      .where(eq(usersTable.id, userId));

    let buildId: string | undefined;

    if (shouldBuild && projectId && project) {
      try {
        if (project.status === "building") {
          console.log("[CHAT] Project already building, skipping build start");
        } else {
          const limitCheck = await checkBuildLimits(userId, projectId);
          if (limitCheck.allowed) {
            console.log("[CHAT] Starting build for project:", projectId);
            buildId = await startBuild(projectId, userId, message);
            console.log("[CHAT] Build started successfully:", buildId);
          } else {
            console.log("[CHAT] Build limit reached:", limitCheck.reason);
            reply += "\n⚠️ " + (limitCheck.reasonAr || limitCheck.reason || "تم الوصول للحد الأقصى");
            shouldBuild = false;
          }
        }
      } catch (buildErr: any) {
        console.error("[CHAT] Failed to start build:", buildErr);
        reply += "\n⚠️ " + (buildErr?.message || "فشل بدء البناء");
        shouldBuild = false;
      }
    }

    console.log("[CHAT] Final result - shouldBuild:", shouldBuild, "buildId:", buildId, "reply:", reply.substring(0, 80));

    res.json({
      reply,
      shouldBuild,
      buildId,
      buildPrompt: shouldBuild ? message : undefined,
      tokensUsed,
      costUsd: parseFloat(costUsd.toFixed(6)),
    });
  } catch (error: unknown) {
    console.error("Chat error:", error);
    const message = error instanceof Error ? error.message : "Chat failed";
    res.status(500).json({ error: { code: "CHAT_ERROR", message } });
  }
});

export default router;
