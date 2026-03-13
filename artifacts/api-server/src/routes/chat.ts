import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { projectsTable, usersTable, projectFilesTable, buildTasksTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserId } from "../middlewares/permissions";
import { startBuild, checkBuildLimits } from "../lib/agents/execution-engine";

const router: IRouter = Router();

interface ChatRequest {
  projectId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const AGENT_SYSTEM_PROMPT = `You are a senior AI architect powering a professional website builder platform. Respond like a professional developer assistant — human, concise, and confident.

CORE BEHAVIOR:
- Respond like a human — natural, direct, no robotic patterns
- Keep answers concise — match the length of the user's message
- Short question = short answer. Never over-explain unless asked
- Never repeat yourself — if you already said what you'll do, don't say it again
- When user confirms (تفضل، يلا، ابدأ، OK, go ahead), immediately trigger the build — do NOT re-explain what you'll do
- Be specific with numbers: mention file count, page count, features ("سأبني 8 صفحات مع نظام سلة مشتريات")
- Mirror the user's language (Arabic/English) naturally

PERSONALITY:
- Professional, calm, direct — like a skilled developer who respects the user's time
- Maximum 1 emoji per message, only when it adds clarity (✓ for completion)
- When speaking Arabic, use modern professional Arabic — not overly formal, not slang
- Never use "يا حبيبي", "يا غالي", "يا صديقي" — stay professional
- Never give vague answers like "تمام سأعمل عليه" — always be specific

RESPONSE FORMAT — CRITICAL:
Respond with ONLY a valid JSON object. No markdown, no code blocks, no wrapping.
{"reply":"your message","action":"build"} or {"reply":"your message","action":"chat"}

ACTION RULES:

action="build" — when user wants something DONE:
- Requests to create, modify, redesign, fix, add, remove, or update website features
- Action commands: "نفذ", "ابدأ", "اعمل", "غير", "عدل", "أضف", "صمم", "build", "create", "add", "fix", "redesign"
- User confirmation after you described what you'll build: "تفضل", "يلا", "ابدأ", "OK", "go ahead", "نعم"
- State what you'll build in 1 sentence max, then trigger the build
- Example: {"reply":"سأبني متجر إلكتروني كامل مع 8 صفحات ونظام سلة مشتريات.","action":"build"}

action="chat" — when user is asking, not requesting:
- Greetings, questions, status inquiries, help requests
- Vague messages on completed projects ("كمل", "continue") without specifying changes
- If project is already built, mention file count and guide: "موقعك جاهز بـ 25 ملف. يمكنك معاينته الآن أو أخبرني بأي تعديل."

PREVIEW PANEL — IMPORTANT:
- This platform has a built-in LIVE PREVIEW panel that renders React websites directly in the browser
- The preview supports React, TypeScript, JSX, Tailwind CSS, and lucide-react icons
- Users see their website immediately after building — no setup needed
- NEVER say the project "needs special setup", "needs Node.js locally", or "needs server configuration"
- NEVER say the preview only supports simple HTML/CSS/JS — it fully supports React
- If user reports a preview error, offer to fix it with action="build"

RULES:
- Maximum 2 sentences per reply — be ruthlessly concise
- Never generate or show code in replies
- Never repeat what you already said in previous messages
- If the user's message is 1-3 words, your reply should be 1 sentence max`;

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
    let isCurrentlyBuilding = false;
    let isAlreadyBuilt = false;
    if (project) {
      const statusMap: Record<string, string> = {
        draft: "New project, not built yet",
        building: "Currently being built by AI agents",
        ready: "Built and ready to preview",
        failed: "Last build failed",
        deployed: "Live and deployed",
      };
      isCurrentlyBuilding = project.status === "building";

      if (isCurrentlyBuilding) {
        const { getAllActiveBuilds } = await import("../lib/agents/execution-engine");
        const activeBuild = getAllActiveBuilds().find(b => b.projectId === projectId);
        const recentInProgress = await db
          .select({ status: buildTasksTable.status })
          .from(buildTasksTable)
          .where(eq(buildTasksTable.projectId, projectId))
          .orderBy(desc(buildTasksTable.createdAt))
          .limit(1);
        const hasActiveTask = recentInProgress.length > 0 && recentInProgress[0].status === "in_progress";

        if (!activeBuild && !hasActiveTask) {
          console.log("[CHAT] Detected stuck project in 'building' state, auto-fixing to 'ready'");
          await db.update(projectsTable).set({ status: "ready" }).where(eq(projectsTable.id, projectId));
          isCurrentlyBuilding = false;
          project.status = "ready";
        }
      }

      contextInfo = `\n\nProject context:
- Project name: "${project.name}"
- Current status: ${statusMap[project.status || ""] || project.status}
- Description: ${project.description || "No description set"}`;

      const files = await db
        .select({ filePath: projectFilesTable.filePath })
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, projectId));
      if (files.length > 0) {
        isAlreadyBuilt = true;
        contextInfo += `\n- Has ${files.length} files already generated`;
        contextInfo += `\n- The project is already built with ${files.length} files. DO NOT rebuild unless user explicitly asks to change/modify something specific.`;
        contextInfo += `\n- If user says "كمل" or "continue" or similar, and project is already built (status=ready), tell them the project is complete and ask what they want to modify.`;
      } else {
        contextInfo += `\n- No files yet. User needs to describe what website they want to build.`;
      }
      if (isCurrentlyBuilding) {
        contextInfo += `\n- IMPORTANT: Project is currently being built. DO NOT trigger another build. Use action="chat" and tell the user to wait.`;
      }
    } else {
      contextInfo = `\n\nNo project selected. Help the user understand they can create a project and describe what they want to build.`;
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
      model: "claude-sonnet-4-20250514",
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
            shouldBuild = false;
          }
        } else {
          reply = cleaned.replace(/[{}"\n]/g, " ").trim() || rawReply;
          shouldBuild = false;
        }
      }

      console.log("[CHAT] AI decided action:", shouldBuild ? "build" : "chat");
    } catch {
      reply = rawReply;
      shouldBuild = false;
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

    if (shouldBuild && isCurrentlyBuilding) {
      shouldBuild = false;
      console.log("[CHAT] Blocked build: project is currently building");
    }

    if (shouldBuild && projectId && project) {
      try {
        if (project.status === "building") {
          console.log("[CHAT] Project already building, looking for active build");
          const { getAllActiveBuilds } = await import("../lib/agents/execution-engine");
          const activeBuild = getAllActiveBuilds().find(b => b.projectId === projectId);
          if (activeBuild) {
            buildId = activeBuild.buildId;
            console.log("[CHAT] Found active build:", buildId);
          } else {
            const [latestBuild] = await db
              .select({ buildId: buildTasksTable.buildId })
              .from(buildTasksTable)
              .where(eq(buildTasksTable.projectId, projectId))
              .orderBy(desc(buildTasksTable.createdAt))
              .limit(1);
            if (latestBuild) {
              buildId = latestBuild.buildId;
              console.log("[CHAT] Found latest build from DB:", buildId);
            }
          }
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
    const errMsg = error instanceof Error ? error.message : String(error);

    let userFriendlyReply = "عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.";

    if (errMsg.includes("credit balance") || errMsg.includes("billing") || errMsg.includes("insufficient")) {
      userFriendlyReply = "عذراً، حدث خطأ مؤقت في الخدمة. يرجى المحاولة مرة أخرى بعد قليل.";
    } else if (errMsg.includes("overloaded") || errMsg.includes("rate_limit")) {
      userFriendlyReply = "الخدمة مشغولة حالياً. يرجى المحاولة مرة أخرى بعد لحظات.";
    } else if (errMsg.includes("authentication") || errMsg.includes("api_key") || errMsg.includes("invalid_api_key")) {
      userFriendlyReply = "حدث خطأ في إعدادات الخدمة. يرجى التواصل مع الدعم الفني.";
    }

    res.json({
      reply: userFriendlyReply,
      shouldBuild: false,
      buildId: undefined,
      tokensUsed: 0,
      costUsd: 0,
    });
  }
});

export default router;
