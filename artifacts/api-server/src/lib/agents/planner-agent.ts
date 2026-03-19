import { BaseAgent, type ModelConfig } from "./base-agent";
import type { AgentResult, BuildContext, ProjectPlan, StoredPlan } from "./types";

const pendingPlans = new Map<string, StoredPlan>();

export function getPendingPlan(buildId: string): StoredPlan | undefined {
  return pendingPlans.get(buildId);
}

export function getAllPendingPlans(userId: string): StoredPlan[] {
  return Array.from(pendingPlans.values()).filter(p => p.userId === userId && p.status === "pending_approval");
}

export function approvePlan(buildId: string): StoredPlan | undefined {
  const plan = pendingPlans.get(buildId);
  if (!plan) return undefined;
  plan.status = "approved";
  pendingPlans.delete(buildId);
  return plan;
}

export function rejectPlan(buildId: string): StoredPlan | undefined {
  const plan = pendingPlans.get(buildId);
  if (!plan) return undefined;
  plan.status = "rejected";
  pendingPlans.delete(buildId);
  return plan;
}

export function modifyPlan(buildId: string, updatedPlan: ProjectPlan): StoredPlan | undefined {
  const plan = pendingPlans.get(buildId);
  if (!plan) return undefined;
  plan.plan = updatedPlan;
  plan.status = "modified";
  return plan;
}

export function removePendingPlan(buildId: string): void {
  pendingPlans.delete(buildId);
}

export function storePendingPlan(stored: StoredPlan): void {
  pendingPlans.set(stored.buildId, stored);
}

const COMPLEXITY_KEYWORDS = [
  "متجر", "e-commerce", "ecommerce", "shop", "store",
  "منصة", "platform", "saas", "dashboard", "لوحة",
  "نظام", "system", "cms", "crm", "erp",
  "تطبيق", "application", "app",
  "موقع كامل", "full website", "multi-page", "متعدد الصفحات",
  "blog", "مدونة", "portfolio", "معرض",
  "booking", "حجز", "reservation",
  "social", "اجتماعي", "forum", "منتدى",
  "marketplace", "سوق",
  "authentication", "مصادقة", "login", "تسجيل",
  "database", "قاعدة بيانات",
  "api", "backend", "خلفية",
  "real-time", "chat", "دردشة",
  "payment", "دفع", "checkout",
];

const SIMPLE_KEYWORDS = [
  "صفحة واحدة", "single page", "landing page", "صفحة هبوط",
  "تعديل", "edit", "fix", "إصلاح", "change", "تغيير",
  "button", "زر", "color", "لون", "font", "خط",
  "update", "تحديث", "tweak", "simple", "بسيط",
  "add a", "أضف",
];

export function classifyComplexity(prompt: string): "complex" | "simple" {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.split(/\s+/).length;

  const simpleScore = SIMPLE_KEYWORDS.filter(k => lower.includes(k)).length;
  const complexScore = COMPLEXITY_KEYWORDS.filter(k => lower.includes(k)).length;

  if (simpleScore > 0 && complexScore === 0) return "simple";
  if (complexScore >= 2) return "complex";
  if (wordCount > 50 && complexScore >= 1) return "complex";
  if (wordCount <= 20 && complexScore <= 1 && simpleScore === 0) return "simple";

  return complexScore > simpleScore ? "complex" : "simple";
}

export class PlannerAgent extends BaseAgent {
  readonly agentType = "planner" as const;
  readonly modelConfig: ModelConfig = { provider: "anthropic", model: "claude-sonnet-4-20250514" };

  protected get defaultTimeoutSeconds(): number {
    return 120;
  }

  readonly systemPrompt = `Software architect. Output ONLY valid JSON, no markdown.
EXAMPLE: {"framework":"React","description":"short","descriptionAr":"قصير","directoryStructure":["src/"],"packages":["react"],"modules":[{"name":"core","nameAr":"الأساسي","description":"Core setup files","files":["src/App.tsx","src/main.tsx","src/index.css"]},{"name":"auth","nameAr":"المصادقة","description":"Login and register","files":["src/pages/Login.tsx","src/pages/Register.tsx","src/contexts/AuthContext.tsx"]}]}
Rules:
- NO "files" top-level array — files are ONLY inside modules
- Split into MANY small MODULES by domain (core, auth, products-pages, products-components, cart, dashboard, admin, etc.)
- Each module: 5-12 files MAXIMUM, self-contained (pages + components + hooks + utils)
- "core" module FIRST: App.tsx, main.tsx, layouts, router, shared types, contexts, index.css (max 8 files)
- Keep file paths SHORT (src/pages/X.tsx, src/components/X.tsx)
- Modules are built by independent developers in parallel — no cross-module dependencies except core
- For 250-file projects: create 20-25 modules with 8-12 files each
- For 500-file projects: create 40-50 modules with 8-12 files each
- JSON only, no comments, no descriptions longer than 5 words

QUALITY & ASSETS PLANNING:
- Always plan an src/assets/ directory for images referenced via Unsplash URLs
- Plan dedicated component files for visual sections: Hero, Gallery, Testimonials, Features
- Every module with UI pages MUST include visual components (cards with images, icon sections, hero banners)
- Plan small, focused components (max 150 lines each) for fast rendering and code-splitting
- Include a src/data/ directory for mock data files (products, services, team members) with image URLs
- Ensure each UI module has at least 2-3 reusable visual components (cards, badges, rating stars)

SPEED — CRITICAL MODULE SIZING RULES:
- Each module MUST have 5-12 files MAXIMUM — NEVER exceed 12 files per module
- If a domain needs 20+ files, split it into sub-modules (e.g., "products-pages", "products-components", "products-data")
- Create 12-20 modules for medium projects (100-250 files), 20-30 modules for large projects (250-500 files)
- Smaller modules = faster parallel execution = shorter build time
- Target: build completes in under 10 minutes for <250 files, 15 minutes for <400 files, 20 minutes for 500+ files`;

  async execute(context: BuildContext): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: this.getEffectivePrompt() },
          {
            role: "user",
            content: context.prompt,
          },
        ],
        context
      );

      const plan = this.parseResponse(content);

      const storedPlan: StoredPlan = {
        buildId: context.buildId,
        projectId: context.projectId,
        userId: context.userId,
        prompt: context.prompt,
        plan,
        status: "pending_approval",
        createdAt: new Date().toISOString(),
      };
      storePendingPlan(storedPlan);

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        data: { plan, requiresApproval: true },
      };
    } catch (error) {
      return {
        success: false,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private parseResponse(content: string): ProjectPlan {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Planner did not return valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.framework) {
      throw new Error("Plan missing required field: framework");
    }

    const modules = Array.isArray(parsed.modules) ? parsed.modules : [];
    const phases = Array.isArray(parsed.phases) ? parsed.phases : [];

    const planModules = modules.length > 0
      ? modules.map((m: Record<string, unknown>) => ({
          name: (m.name as string) || "",
          nameAr: (m.nameAr as string) || "",
          description: (m.description as string) || "",
          descriptionAr: (m.descriptionAr as string) || "",
          files: Array.isArray(m.files) ? m.files as string[] : [],
        }))
      : phases.map((p: Record<string, unknown>) => ({
          name: (p.name as string) || "",
          nameAr: (p.nameAr as string) || "",
          description: (p.description as string) || "",
          descriptionAr: (p.descriptionAr as string) || "",
          files: Array.isArray(p.files) ? p.files as string[] : [],
        }));

    const allFiles: string[] = Array.isArray(parsed.files)
      ? parsed.files
      : planModules.flatMap(m => m.files);

    return {
      framework: parsed.framework,
      description: parsed.description || "",
      descriptionAr: parsed.descriptionAr || "",
      directoryStructure: parsed.directoryStructure || [],
      files: allFiles,
      packages: parsed.packages || [],
      phases: planModules,
    };
  }
}
