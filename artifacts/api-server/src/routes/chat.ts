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

const AGENT_SYSTEM_PROMPT = `You are an expert AI website builder assistant integrated into a website builder platform. You help users create and modify websites.

You communicate naturally in the user's language (Arabic or English). You are aware that you are part of a build system that generates complete websites from user descriptions.

Your job:
1. Decide if the user wants to BUILD/MODIFY something, or just CHAT
2. Give helpful, contextual replies about their project

CRITICAL: Respond with ONLY a valid JSON object. No markdown, no code blocks.

Format: {"reply":"your reply here","action":"build"} or {"reply":"your reply here","action":"chat"}

When action="build":
- Confirm what you'll build in 1-2 sentences
- Be specific about what will be created/changed

When action="chat":
- Answer their question helpfully
- If they seem confused, explain what you can do: build websites, modify designs, add features, fix issues
- If the message is vague or just a greeting, introduce yourself as the website builder assistant and explain capabilities

Build triggers (action="build"):
- ANY request to create, modify, build, edit, change, fix, add, remove, update a website
- Commands: "نفذ", "ابدأ", "اعمل", "غير", "عدل", "build", "create", "make", "start", "كمل", "صمم"

Chat triggers (action="chat"):
- Questions, greetings, discussions with no build intent
- Asking about project status, capabilities, or help

Rules:
- Keep replies to 2-3 sentences max
- Reply in same language as user
- Do NOT generate code in replies
- Be aware of the project context provided below`;

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

      const recentBuilds = await db
        .select({ status: buildTasksTable.status })
        .from(buildTasksTable)
        .where(eq(buildTasksTable.projectId, projectId))
        .orderBy(desc(buildTasksTable.createdAt))
        .limit(1);
      if (recentBuilds.length > 0 && recentBuilds[0].status === "in_progress") {
        isCurrentlyBuilding = true;
        contextInfo += `\n- A build is currently in progress. DO NOT start another build.`;
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
    const message = error instanceof Error ? error.message : "Chat failed";
    res.status(500).json({ error: { code: "CHAT_ERROR", message } });
  }
});

export default router;
