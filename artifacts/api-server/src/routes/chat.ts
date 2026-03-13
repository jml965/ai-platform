import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db } from "@workspace/db";
import { projectsTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getUserId } from "../middlewares/permissions";

const router: IRouter = Router();

interface ChatRequest {
  projectId: string;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const CHAT_SYSTEM_PROMPT = `أنت مساعد ذكي لمنصة بناء مواقع. تتحدث بشكل طبيعي ومختصر كأنك صديق خبير.

قواعد أساسية:
- كن مختصراً ومفيداً — لا تسرد نصوصاً طويلة بدون داعي
- إذا كان الجواب يحتاج جملة واحدة، أجب بجملة واحدة
- إذا سأل المستخدم سؤالاً تقنياً، أجب بوضوح بدون إطالة
- تحدث بلغة المستخدم (عربي أو إنجليزي)
- لا تستخدم bullet points أو قوائم إلا عند الحاجة الفعلية
- لا تكرر معلومات المستخدم عليه
- إذا أراد المستخدم بناء شيء، اسأله ماذا يريد بالتحديد ثم ابدأ البناء فوراً
- لا تشرح كيف تعمل المنصة إلا إذا سُئلت
- كن ودوداً وطبيعياً — تحدث كإنسان وليس كروبوت
- الحد الأقصى: 3 جمل للردود العادية، أكثر فقط إذا طُلب تفصيل`;

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
          message: "Insufficient credits for chat.",
          message_ar: "رصيد غير كافٍ للمحادثة.",
        },
      });
      return;
    }

    let contextInfo = "";
    if (project) {
      contextInfo = `\n\nProject context:
- Name: ${project.name}
- Status: ${project.status}
- Description: ${project.description || "No description"}
- Last prompt: ${project.prompt || "None"}`;
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
      max_tokens: 1024,
      system: CHAT_SYSTEM_PROMPT + contextInfo,
      messages,
    });

    const reply = response.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { type: string; text: string }) => block.text)
      .join("");

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
