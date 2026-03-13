import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { projectsTable, usersTable, projectFilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "../middlewares/permissions";

const router: IRouter = Router();

interface ChatRequest {
  projectId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const AGENT_SYSTEM_PROMPT = `أنت وكيل برمجة ذكي ومحترف لمنصة بناء مواقع. أنت لست شات بوت عادي — أنت مهندس برمجيات حقيقي يناقش وينفذ ويقترح وينصح.

دورك:
- تفهم ما يريد المستخدم بدقة
- تناقشه وتسأله أسئلة توضيحية إذا الطلب غير واضح
- تقترح أفكار وتحسينات
- عندما يطلب بناء أو تعديل، أجب بأنك ستبدأ التنفيذ وأضف في نهاية ردك بالضبط: [ACTION:BUILD] — هذا يفعّل سلسلة البناء تلقائياً
- عندما المستخدم يتحدث معك عادي (سؤال، نقاش، استشارة) — أجب بشكل طبيعي بدون [ACTION:BUILD]

أسلوبك:
- مختصر ومفيد — لا تطيل بدون داعي
- تحدث بلغة المستخدم (عربي أو إنجليزي)
- لا تولّد كود في الرد — التنفيذ يتم عبر سلسلة البناء الخاصة
- كن واثقاً ومباشراً — لا تعتذر ولا تقول "لا أستطيع"
- تصرف كمهندس خبير يعمل مع العميل

أمثلة:
- المستخدم: "اعمل لي موقع بيع سيارات" → أجب باختصار أنك فهمت وستبدأ، واختم بـ [ACTION:BUILD]
- المستخدم: "ما رأيك بالتصميم؟" → أجب برأيك بدون [ACTION:BUILD]
- المستخدم: "غير اللون للأزرق" → أجب أنك ستعدّل واختم بـ [ACTION:BUILD]
- المستخدم: "نفذ" أو "ابدأ" → أجب أنك ستبدأ واختم بـ [ACTION:BUILD]`;

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
      contextInfo = `\n\nسياق المشروع:
- اسم المشروع: ${project.name}
- الحالة: ${project.status}
- الوصف: ${project.description || "بدون وصف"}
- آخر طلب: ${project.prompt || "لا يوجد"}`;

      const files = await db
        .select({ filePath: projectFilesTable.filePath })
        .from(projectFilesTable)
        .where(eq(projectFilesTable.projectId, projectId));
      if (files.length > 0) {
        contextInfo += `\n- ملفات المشروع الحالية: ${files.map(f => f.filePath).join(", ")}`;
      }
    }

    const messages: { role: "user" | "assistant"; content: string }[] = [];

    if (history && Array.isArray(history)) {
      const recentHistory = history.slice(-10);
      for (const msg of recentHistory) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content.replace(/\[ACTION:BUILD\]/g, "").trim() });
        }
      }
    }

    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      system: AGENT_SYSTEM_PROMPT + contextInfo,
      messages,
    });

    let reply = response.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { type: string; text: string }) => block.text)
      .join("");

    const shouldBuild = reply.includes("[ACTION:BUILD]");
    reply = reply.replace(/\[ACTION:BUILD\]/g, "").trim();

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    const costUsd = tokensUsed * 0.000015;

    await db
      .update(usersTable)
      .set({
        creditBalanceUsd: String(Math.max(0, credits - costUsd)),
      })
      .where(eq(usersTable.id, userId));

    res.json({
      reply,
      shouldBuild,
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
