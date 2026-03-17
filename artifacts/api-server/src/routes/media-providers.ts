import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { mediaProvidersTable, mediaUsageLogsTable, agentConfigsTable, aiProvidersTable } from "@workspace/db/schema";
import { eq, desc, sql, gte } from "drizzle-orm";

const router = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || (req.user as any).role !== "admin") {
    return res.status(403).json({ error: "Admin access required", errorAr: "يجب أن تكون مديراً للوصول" });
  }
  next();
}

const DEFAULT_IMAGE_PROVIDERS = [
  {
    providerKey: "openai_dalle",
    type: "image",
    parentProvider: "openai",
    displayName: "DALL·E (OpenAI)",
    displayNameAr: "دال-إي (أوبن إيه آي)",
    website: "https://openai.com",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    maxFileSizeMb: 20,
    models: [
      { id: "dall-e-3", name: "DALL·E 3", maxResolution: "1024x1024", costPerRequest: 0.04, costPerToken: 0.00008, maxFileSizeMb: 4, description: "أحدث نموذج لتوليد الصور عالية الجودة" },
      { id: "dall-e-3-hd", name: "DALL·E 3 HD", maxResolution: "1792x1024", costPerRequest: 0.08, costPerToken: 0.00012, maxFileSizeMb: 8, description: "نسخة عالية الدقة من DALL·E 3" },
      { id: "dall-e-2", name: "DALL·E 2", maxResolution: "1024x1024", costPerRequest: 0.02, costPerToken: 0.00004, maxFileSizeMb: 3, description: "نموذج سريع وأقل تكلفة" },
    ],
    priority: 1,
  },
  {
    providerKey: "stability_ai",
    type: "image",
    parentProvider: "stability",
    displayName: "Stability AI",
    displayNameAr: "ستابيليتي إيه آي",
    website: "https://stability.ai",
    apiKeyUrl: "https://platform.stability.ai/account/keys",
    maxFileSizeMb: 15,
    models: [
      { id: "stable-diffusion-xl", name: "Stable Diffusion XL", maxResolution: "1024x1024", costPerRequest: 0.002, costPerToken: 0.000003, maxFileSizeMb: 3, description: "نموذج مفتوح المصدر لتوليد صور عالية الدقة" },
      { id: "sd3-medium", name: "SD3 Medium", maxResolution: "1024x1024", costPerRequest: 0.003, costPerToken: 0.000005, maxFileSizeMb: 4, description: "الجيل الثالث من Stable Diffusion" },
      { id: "sd3-large", name: "SD3 Large", maxResolution: "2048x2048", costPerRequest: 0.006, costPerToken: 0.00001, maxFileSizeMb: 8, description: "النسخة الكبيرة بدقة عالية جداً" },
    ],
    priority: 2,
  },
  {
    providerKey: "midjourney_api",
    type: "image",
    parentProvider: "",
    displayName: "Midjourney",
    displayNameAr: "ميدجورني",
    website: "https://midjourney.com",
    apiKeyUrl: "https://midjourney.com",
    maxFileSizeMb: 25,
    models: [
      { id: "midjourney-v6", name: "Midjourney v6", maxResolution: "2048x2048", costPerRequest: 0.05, costPerToken: 0.0001, maxFileSizeMb: 10, description: "أفضل نموذج للصور الفنية والإبداعية" },
      { id: "midjourney-v6-turbo", name: "Midjourney v6 Turbo", maxResolution: "1024x1024", costPerRequest: 0.03, costPerToken: 0.00006, maxFileSizeMb: 5, description: "نسخة سريعة بجودة ممتازة" },
    ],
    priority: 3,
  },
  {
    providerKey: "google_imagen",
    type: "image",
    parentProvider: "google",
    displayName: "Google Imagen",
    displayNameAr: "جوجل إيماجن",
    website: "https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview",
    apiKeyUrl: "https://console.cloud.google.com/apis/credentials",
    maxFileSizeMb: 20,
    models: [
      { id: "imagen-3", name: "Imagen 3", maxResolution: "1024x1024", costPerRequest: 0.03, costPerToken: 0.00006, maxFileSizeMb: 5, description: "نموذج جوجل لتوليد الصور بجودة فائقة" },
      { id: "imagen-3-fast", name: "Imagen 3 Fast", maxResolution: "1024x1024", costPerRequest: 0.02, costPerToken: 0.00004, maxFileSizeMb: 3, description: "نسخة سريعة من Imagen 3" },
    ],
    priority: 4,
  },
];

const DEFAULT_VIDEO_PROVIDERS = [
  {
    providerKey: "runway_ml",
    type: "video",
    parentProvider: "",
    displayName: "Runway ML",
    displayNameAr: "رانواي إم إل",
    website: "https://runwayml.com",
    apiKeyUrl: "https://app.runwayml.com/settings/api-keys",
    maxFileSizeMb: 500,
    models: [
      { id: "gen-3-alpha", name: "Gen-3 Alpha", maxResolution: "1280x768", costPerRequest: 0.50, costPerToken: 0.001, maxFileSizeMb: 100, description: "أحدث نموذج لتوليد فيديو عالي الجودة — 10 ثوانٍ" },
      { id: "gen-3-alpha-turbo", name: "Gen-3 Alpha Turbo", maxResolution: "1280x768", costPerRequest: 0.25, costPerToken: 0.0005, maxFileSizeMb: 50, description: "نسخة سريعة — 5 ثوانٍ" },
      { id: "gen-2", name: "Gen-2", maxResolution: "768x512", costPerRequest: 0.15, costPerToken: 0.0003, maxFileSizeMb: 30, description: "نموذج اقتصادي لتوليد الفيديو" },
    ],
    priority: 1,
  },
  {
    providerKey: "pika_labs",
    type: "video",
    parentProvider: "",
    displayName: "Pika Labs",
    displayNameAr: "بيكا لابز",
    website: "https://pika.art",
    apiKeyUrl: "https://pika.art",
    maxFileSizeMb: 200,
    models: [
      { id: "pika-2.0", name: "Pika 2.0", maxResolution: "1080x1920", costPerRequest: 0.40, costPerToken: 0.0008, maxFileSizeMb: 80, description: "أحدث إصدار مع تأثيرات متقدمة" },
      { id: "pika-1.0", name: "Pika 1.0", maxResolution: "1024x576", costPerRequest: 0.30, costPerToken: 0.0006, maxFileSizeMb: 50, description: "نموذج متقدم لتحويل النص والصور إلى فيديو" },
    ],
    priority: 2,
  },
  {
    providerKey: "openai_sora",
    type: "video",
    parentProvider: "openai",
    displayName: "Sora (OpenAI)",
    displayNameAr: "سورا (أوبن إيه آي)",
    website: "https://openai.com/sora",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    maxFileSizeMb: 1000,
    models: [
      { id: "sora-1.0", name: "Sora 1.0", maxResolution: "1920x1080", costPerRequest: 1.00, costPerToken: 0.002, maxFileSizeMb: 200, description: "نموذج أوبن إيه آي لتوليد فيديو واقعي — حتى 60 ثانية" },
      { id: "sora-turbo", name: "Sora Turbo", maxResolution: "1280x720", costPerRequest: 0.50, costPerToken: 0.001, maxFileSizeMb: 100, description: "نسخة سريعة — حتى 20 ثانية" },
    ],
    priority: 3,
  },
  {
    providerKey: "kling_ai",
    type: "video",
    parentProvider: "",
    displayName: "Kling AI",
    displayNameAr: "كلينج إيه آي",
    website: "https://kling.ai",
    apiKeyUrl: "https://kling.ai",
    maxFileSizeMb: 300,
    models: [
      { id: "kling-v1.5", name: "Kling v1.5", maxResolution: "1920x1080", costPerRequest: 0.45, costPerToken: 0.0009, maxFileSizeMb: 120, description: "أحدث إصدار مع حركة طبيعية ودقة عالية" },
      { id: "kling-v1", name: "Kling v1", maxResolution: "1280x720", costPerRequest: 0.30, costPerToken: 0.0006, maxFileSizeMb: 60, description: "نموذج متقدم لتوليد الفيديو" },
    ],
    priority: 4,
  },
  {
    providerKey: "luma_ai",
    type: "video",
    parentProvider: "",
    displayName: "Luma AI (Dream Machine)",
    displayNameAr: "لوما إيه آي",
    website: "https://lumalabs.ai",
    apiKeyUrl: "https://lumalabs.ai",
    maxFileSizeMb: 250,
    models: [
      { id: "dream-machine-2.0", name: "Dream Machine 2.0", maxResolution: "1920x1080", costPerRequest: 0.40, costPerToken: 0.0008, maxFileSizeMb: 100, description: "أحدث إصدار مع واقعية محسّنة" },
      { id: "dream-machine-1.5", name: "Dream Machine 1.5", maxResolution: "1360x752", costPerRequest: 0.25, costPerToken: 0.0005, maxFileSizeMb: 60, description: "نموذج سريع لتوليد فيديو إبداعي" },
    ],
    priority: 5,
  },
];

async function seedMediaProviders() {
  const existing = await db.select().from(mediaProvidersTable);
  if (existing.length > 0) return;
  const allDefaults = [...DEFAULT_IMAGE_PROVIDERS, ...DEFAULT_VIDEO_PROVIDERS];
  for (const p of allDefaults) {
    await db.insert(mediaProvidersTable).values(p as any).onConflictDoNothing();
  }
}

function maskApiKey(key: string | null): string {
  if (!key || key.length < 10) return key || "";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

function maskProvider(p: any) {
  return { ...p, apiKey: maskApiKey(p.apiKey) };
}

router.get("/media-providers", async (_req, res) => {
  try {
    await seedMediaProviders();
    const providers = await db.select().from(mediaProvidersTable).orderBy(mediaProvidersTable.type, mediaProvidersTable.priority);
    res.json(providers.map(maskProvider));
  } catch (e) {
    res.status(500).json({ error: "Failed to load media providers" });
  }
});

router.get("/media-providers/:key", async (req, res) => {
  try {
    const [p] = await db.select().from(mediaProvidersTable).where(eq(mediaProvidersTable.providerKey, req.params.key));
    if (!p) return res.status(404).json({ error: "Not found" });
    res.json(maskProvider(p));
  } catch (e) {
    res.status(500).json({ error: "Failed" });
  }
});

router.get("/media-providers/:key/usage", async (req, res) => {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const aggregate = async (since: Date) => {
      const [result] = await db.select({
        cost: sql<number>`COALESCE(SUM(CAST(${mediaUsageLogsTable.costUsd} AS FLOAT)), 0)`,
        tokens: sql<number>`COALESCE(SUM(${mediaUsageLogsTable.tokensUsed}), 0)`,
        requests: sql<number>`COUNT(*)`,
        totalSizeMb: sql<number>`COALESCE(SUM(CAST(${mediaUsageLogsTable.fileSizeMb} AS FLOAT)), 0)`,
      }).from(mediaUsageLogsTable)
        .where(sql`${mediaUsageLogsTable.providerKey} = ${req.params.key} AND ${mediaUsageLogsTable.createdAt} >= ${since}`);
      return result;
    };

    const [daily, weekly, monthly] = await Promise.all([aggregate(dayAgo), aggregate(weekAgo), aggregate(monthAgo)]);

    const recentLogs = await db.select().from(mediaUsageLogsTable)
      .where(eq(mediaUsageLogsTable.providerKey, req.params.key))
      .orderBy(desc(mediaUsageLogsTable.createdAt))
      .limit(50);

    res.json({ daily, weekly, monthly, recentLogs });
  } catch (e) {
    res.status(500).json({ error: "Failed to get usage" });
  }
});

router.get("/media-providers/:key/agents", async (req, res) => {
  try {
    const allAgents = await db.select().from(agentConfigsTable);
    const linked = allAgents.filter(a => {
      const img = a.imageModel as any;
      const vid = a.videoModel as any;
      return (img?.provider === req.params.key) || (vid?.provider === req.params.key);
    }).map(a => {
      const slots: { slot: string; model: string }[] = [];
      const img = a.imageModel as any;
      const vid = a.videoModel as any;
      if (img?.provider === req.params.key) slots.push({ slot: "صور (Image)", model: img.model });
      if (vid?.provider === req.params.key) slots.push({ slot: "فيديو (Video)", model: vid.model });
      return {
        agentKey: a.agentKey,
        displayNameEn: a.displayNameEn,
        displayNameAr: a.displayNameAr,
        slots,
      };
    });
    res.json(linked);
  } catch (e) {
    res.json([]);
  }
});

router.put("/media-providers/:key", requireAdmin, async (req, res) => {
  try {
    const { providerKey, id, createdAt, isCustom, ...data } = req.body;
    if (data.apiKey && data.apiKey.includes("••••")) {
      delete data.apiKey;
    }
    const [updated] = await db.update(mediaProvidersTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(mediaProvidersTable.providerKey, req.params.key))
      .returning();

    if (data.apiKey !== undefined && updated.parentProvider) {
      await db.update(aiProvidersTable)
        .set({ apiKey: data.apiKey, keyStatus: data.apiKey ? "active" : "inactive", updatedAt: new Date() })
        .where(eq(aiProvidersTable.providerKey, updated.parentProvider));

      const allMedia = await db.select().from(mediaProvidersTable);
      const siblings = allMedia.filter((m: any) => m.parentProvider === updated.parentProvider && m.providerKey !== req.params.key);
      for (const sibling of siblings) {
        await db.update(mediaProvidersTable)
          .set({ apiKey: data.apiKey, keyStatus: data.apiKey ? "active" : "inactive", updatedAt: new Date() })
          .where(eq(mediaProvidersTable.providerKey, sibling.providerKey));
      }
    }

    res.json(maskProvider(updated));
  } catch (e) {
    res.status(500).json({ error: "Failed to update" });
  }
});

router.post("/media-providers", requireAdmin, async (req, res) => {
  try {
    const [created] = await db.insert(mediaProvidersTable).values({ ...req.body, isCustom: true }).returning();
    res.json(maskProvider(created));
  } catch (e) {
    res.status(500).json({ error: "Failed to create" });
  }
});

router.delete("/media-providers/:key", requireAdmin, async (req, res) => {
  try {
    const [p] = await db.select().from(mediaProvidersTable).where(eq(mediaProvidersTable.providerKey, req.params.key));
    if (!p) return res.status(404).json({ error: "Not found" });
    if (!p.isCustom) return res.status(403).json({ error: "Cannot delete built-in provider" });
    await db.delete(mediaProvidersTable).where(eq(mediaProvidersTable.providerKey, req.params.key));
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

export default router;
