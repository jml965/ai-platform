import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { projectsTable, usersTable, projectFilesTable, buildTasksTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserId } from "../middlewares/permissions";
import { startBuild, checkBuildLimits, startSurgicalFix } from "../lib/agents/execution-engine";

const router: IRouter = Router();

interface ChatRequest {
  projectId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const AGENT_SYSTEM_PROMPT = `You are a professional AI website builder assistant. Be human, concise, confident.

You have 3 actions available:
- "build" = create/rebuild entire website from scratch (EXPENSIVE, use only for new sites or major changes)
- "fix" = surgically edit specific files to fix bugs or make small changes (FAST, CHEAP)
- "chat" = just reply with text, no code changes

ABSOLUTE RULES (NEVER BREAK):
1. Reply MUST be a JSON object with "reply", "action", and optionally "fix_files" (for action="fix")
2. Reply text MUST be 1-2 sentences MAX.
3. FORBIDDEN words: "حبيبي", "غالي", "صديقي", "habib", "buddy", "bro"
4. Match reply length to user's message length.
5. NEVER say you will fix/change something without using action="fix" or action="build". Empty promises = LYING.
6. Be HONEST. If you can't fix something, say so.

WHEN TO USE action="build":
- User asks to CREATE a brand new website
- User wants a COMPLETE redesign of the entire site
- User wants to ADD many new pages/features at once

WHEN TO USE action="fix":
- User reports a specific error (e.g. "e.get is not a function")
- User wants a small change (color, text, spacing, one component fix)
- User says something is broken and you can identify which file needs fixing
- Preview shows an error → use "fix" to patch the broken file
- Format: {"reply":"...", "action":"fix", "fix_files":[{"path":"src/pages/Products.tsx", "description":"Fix useSearchParams usage that causes e.get error"}]}
- You MUST include "fix_files" array with the file path and description of what to fix
- You can fix multiple files at once: include multiple objects in fix_files array

WHEN TO USE action="chat":
- Greetings, questions, status checks
- Project already built + no change requested
- You genuinely cannot determine what file is broken
- User asks a question, not a change request

EXAMPLES:
User: "ابني موقع سوبرماركت" → {"reply":"سأبني متجر سوبرماركت.","action":"build"}
User: "تفضل" → {"reply":"جاري البناء.","action":"build"}
User: "Preview Error: e.get is not a function" → {"reply":"سأصلح الخطأ في ملف المنتجات.","action":"fix","fix_files":[{"path":"src/pages/Products.tsx","description":"Fix useSearchParams causing e.get is not a function error"}]}
User: "غير اللون الأخضر إلى أزرق" → {"reply":"جاري تعديل اللون.","action":"fix","fix_files":[{"path":"src/App.css","description":"Change green color to blue"}]}
User: "أضف صفحة تواصل" → {"reply":"سأضيف صفحة تواصل.","action":"build"}
User: "الموقع ما يشتغل" → {"reply":"ما هو الخطأ الذي تراه؟ أرسل لي نص الخطأ لأصلحه.","action":"chat"}
User: "ردك طويل" → {"reply":"فهمت.","action":"chat"}`;

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
        const fileList = files.map(f => f.filePath).join(', ');
        contextInfo += `\n- Has ${files.length} files: ${fileList}`;
        contextInfo += `\n- The project is already built. For errors or small changes, use action="fix" with the specific file path. Use action="build" ONLY for creating new sites or major redesigns.`;
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
      max_tokens: 300,
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
    let shouldFix = false;
    let fixFiles: { path: string; description: string }[] = [];

    try {
      const cleaned = rawReply
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();

      let parsed: any = null;

      try {
        parsed = JSON.parse(cleaned);
      } catch {
        const braceStart = cleaned.indexOf('{');
        const braceEnd = cleaned.lastIndexOf('}');
        if (braceStart !== -1 && braceEnd > braceStart) {
          try {
            parsed = JSON.parse(cleaned.substring(braceStart, braceEnd + 1));
          } catch {
            parsed = null;
          }
        }
      }

      if (parsed && parsed.action) {
        reply = parsed.reply || "";
        if (parsed.action === "build") {
          shouldBuild = true;
        } else if (parsed.action === "fix") {
          shouldFix = true;
          if (parsed.fix_files && Array.isArray(parsed.fix_files)) {
            fixFiles = parsed.fix_files;
          }
        }
      } else {
        reply = cleaned.replace(/[{}"\n]/g, " ").trim() || rawReply;
      }

      console.log("[CHAT] AI decided action:", shouldBuild ? "build" : shouldFix ? "fix" : "chat", fixFiles.length ? `(${fixFiles.length} files)` : "");
    } catch {
      reply = rawReply;
      shouldBuild = false;
      shouldFix = false;
    }

    if (!reply) reply = shouldBuild ? "سأبدأ البناء الآن..." : shouldFix ? "جاري إصلاح المشكلة..." : rawReply;

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    const costUsd = tokensUsed * 0.000015;

    await db
      .update(usersTable)
      .set({
        creditBalanceUsd: String(Math.max(0, credits - costUsd)),
      })
      .where(eq(usersTable.id, userId));

    let buildId: string | undefined;
    let fixResult: { success: boolean; fixedFiles: string[] } | undefined;

    if ((shouldBuild || shouldFix) && isCurrentlyBuilding) {
      shouldBuild = false;
      shouldFix = false;
      console.log("[CHAT] Blocked action: project is currently building");
    }

    if (shouldFix && projectId && project && !isCurrentlyBuilding) {
      try {
        const limitCheck = await checkBuildLimits(userId, projectId);
        if (limitCheck.allowed) {
          console.log("[CHAT] Starting SURGICAL FIX for project:", projectId, "files:", fixFiles);
          const fixPromise = startSurgicalFix(projectId, userId, message, fixFiles.length > 0 ? fixFiles : undefined);
          buildId = `fix-${Date.now()}`;
          fixPromise.then(result => {
            console.log("[CHAT] Surgical fix completed:", result.success ? "SUCCESS" : "FAILED", "files:", result.fixedFiles);
            buildId = result.buildId;
          }).catch(err => {
            console.error("[CHAT] Surgical fix failed in background:", err);
          });
          await new Promise(resolve => setTimeout(resolve, 500));
          const earlyResult = await Promise.race([
            fixPromise.then(r => r),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 2000))
          ]);
          if (earlyResult) {
            buildId = earlyResult.buildId;
            fixResult = { success: earlyResult.success, fixedFiles: earlyResult.fixedFiles };
            if (!earlyResult.success) {
              reply += "\n⚠️ " + (earlyResult.error || "فشل الإصلاح");
            }
          } else {
            fixResult = { success: true, fixedFiles: fixFiles.map(f => f.path) };
          }
        } else {
          console.log("[CHAT] Fix limit reached:", limitCheck.reason);
          reply += "\n⚠️ " + (limitCheck.reasonAr || limitCheck.reason || "تم الوصول للحد الأقصى");
          shouldFix = false;
        }
      } catch (fixErr: any) {
        console.error("[CHAT] Failed surgical fix:", fixErr);
        reply += "\n⚠️ " + (fixErr?.message || "فشل الإصلاح");
        shouldFix = false;
      }
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

    const actionType = shouldBuild ? "build" : shouldFix ? "fix" : "chat";
    console.log("[CHAT] Final result - action:", actionType, "buildId:", buildId, "reply:", reply.substring(0, 80));

    res.json({
      reply,
      shouldBuild: shouldBuild || shouldFix,
      buildId,
      buildPrompt: shouldBuild ? message : undefined,
      actionType,
      fixResult,
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
