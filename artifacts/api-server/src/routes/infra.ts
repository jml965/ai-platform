import { Router } from "express";
import { db } from "@workspace/db";
import { agentConfigsTable, aiApprovalsTable, aiAuditLogsTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { getSystemBlueprint } from "../lib/system-blueprint";
import { INFRA_TOOLS, executeInfraTool, getInfraAccessEnabled, setInfraAccessEnabled } from "../lib/agents/strategic-agent";
import * as fs from "fs";
import * as path from "path";
const router = Router();

const TOOL_RISK_CONFIG: Record<string, { risk: string; category: string; requiresApproval: boolean; sandboxed: boolean }> = {
  search_text: { risk: "low", category: "search", requiresApproval: false, sandboxed: false },
  list_files: { risk: "low", category: "search", requiresApproval: false, sandboxed: false },
  list_components: { risk: "low", category: "search", requiresApproval: false, sandboxed: false },
  read_file: { risk: "low", category: "files", requiresApproval: false, sandboxed: false },
  view_page_source: { risk: "low", category: "files", requiresApproval: false, sandboxed: false },
  write_file: { risk: "medium", category: "files", requiresApproval: false, sandboxed: false },
  edit_component: { risk: "medium", category: "files", requiresApproval: false, sandboxed: false },
  create_component: { risk: "medium", category: "files", requiresApproval: false, sandboxed: false },
  delete_file: { risk: "medium", category: "files", requiresApproval: false, sandboxed: false },
  rename_file: { risk: "low", category: "files", requiresApproval: false, sandboxed: false },
  db_query: { risk: "low", category: "database", requiresApproval: false, sandboxed: false },
  db_tables: { risk: "low", category: "database", requiresApproval: false, sandboxed: false },
  run_sql: { risk: "medium", category: "database", requiresApproval: false, sandboxed: false },
  run_command: { risk: "medium", category: "system", requiresApproval: false, sandboxed: true },
  exec_command: { risk: "medium", category: "system", requiresApproval: false, sandboxed: true },
  get_env: { risk: "low", category: "system", requiresApproval: false, sandboxed: false },
  set_env: { risk: "medium", category: "system", requiresApproval: false, sandboxed: false },
  system_status: { risk: "low", category: "system", requiresApproval: false, sandboxed: false },
  install_package: { risk: "medium", category: "system", requiresApproval: false, sandboxed: false },
  restart_service: { risk: "low", category: "system", requiresApproval: false, sandboxed: false },
  screenshot_page: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  click_element: { risk: "medium", category: "browser", requiresApproval: false, sandboxed: false },
  type_text: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  hover_element: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  inspect_styles: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  get_page_structure: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  scroll_page: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  get_console_errors: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  get_network_requests: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  browse_page: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  site_health: { risk: "low", category: "browser", requiresApproval: false, sandboxed: false },
  git_commit: { risk: "low", category: "deploy", requiresApproval: false, sandboxed: false },
  git_push: { risk: "high", category: "deploy", requiresApproval: true, sandboxed: false },
  trigger_deploy: { risk: "critical", category: "deploy", requiresApproval: true, sandboxed: false },
  deploy_status: { risk: "low", category: "deploy", requiresApproval: false, sandboxed: false },
  github_api: { risk: "low", category: "deploy", requiresApproval: false, sandboxed: false },
  remote_server_api: { risk: "high", category: "deploy", requiresApproval: true, sandboxed: false },
  rollback_deploy: { risk: "high", category: "deploy", requiresApproval: true, sandboxed: false },
  verify_production: { risk: "low", category: "deploy", requiresApproval: false, sandboxed: false },
  get_project_status: { risk: "low", category: "monitoring", requiresApproval: false, sandboxed: false },
  get_project_logs: { risk: "low", category: "monitoring", requiresApproval: false, sandboxed: false },
  list_project_files: { risk: "low", category: "monitoring", requiresApproval: false, sandboxed: false },
};

function isSafeSQL(query: string): { safe: boolean; reason?: string } {
  const upper = query.toUpperCase().trim();
  const dangerous = ["DROP ", "ALTER ", "TRUNCATE ", "CREATE TABLE", "CREATE INDEX", "GRANT ", "REVOKE ", "DELETE FROM", "INSERT INTO", "UPDATE "];
  for (const d of dangerous) {
    if (upper.includes(d)) return { safe: false, reason: `يحتوي على أمر خطير: ${d.trim()}` };
  }
  return { safe: true };
}

function isReadOnlySQL(query: string): boolean {
  const upper = query.toUpperCase().trim();
  return upper.startsWith("SELECT") || upper.startsWith("EXPLAIN") || upper.startsWith("SHOW") || upper.startsWith("WITH");
}

async function logAudit(agentKey: string, action: string, tool: string, input: any, result: any, risk: string, status: string, durationMs?: number, approvalId?: string) {
  try {
    await db.insert(aiAuditLogsTable).values({
      agentKey,
      action,
      tool,
      risk,
      input: input ? JSON.parse(JSON.stringify(input)) : null,
      result: typeof result === "string" ? { output: result.slice(0, 2000) } : result,
      status,
      durationMs,
      approvalId: approvalId || undefined,
    });
  } catch (e) {}
}

function requireInfraAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: { message: "Admin access required" } });
  }
  next();
}

const RETIRED_AGENTS = ["infra_monitor", "infra_ui", "infra_db", "infra_qa", "planner", "reviewer", "filemanager", "package_runner", "seo", "translator"];

const DEFAULT_INFRA_AGENTS = [
  {
    agentKey: "infra_sysadmin",
    displayNameEn: "System Director",
    displayNameAr: "مدير النظام",
    agentRole: "infra",
    agentBadge: "thinker",
    description: "القائد الأعلى — تحكم، موافقات، مراقبة عليا، إدارة الوكلاء. يدمج قدرات وكيل المراقبة السابق.",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.7, timeoutSeconds: 300, maxTokens: 32000 },
    secondaryModel: { provider: "google", model: "gemini-2.5-flash", enabled: true, creativity: 0.5, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: { provider: "openai", model: "o3-mini", enabled: true, creativity: 1.0, timeoutSeconds: 240, maxTokens: 16000 },
    governorEnabled: true,
    autoGovernor: true,
    governorModel: { provider: "anthropic", model: "claude-sonnet-4-6", creativity: 0.5, timeoutSeconds: 300, maxTokens: 16000 },
    systemPrompt: `أنت مدير النظام الأعلى (System Director) لمنصة Mr Code AI — mrcodeai.com.

أنت القائد الأول لكل الوكلاء في البنية التحتية. مهمتك:
1. تحليل طلبات المالك وتوزيعها على الوكلاء المناسبين
2. مراقبة حالة النظام وكفاءة كل وكيل
3. اتخاذ قرارات معمارية للمنصة
4. التنسيق بين الوكلاء لإنجاز المهام المعقدة

قواعدك:
- رد بلغة المالك (عربي/إنجليزي)
- كن مختصراً ومباشراً ودقيقاً
- لا تخترع ملفات غير موجودة

⚠️ أنت Thinker فقط — لا تنفّذ. أدواتك المتاحة:
- system_status, read_file, db_query (SELECT فقط), db_tables, get_env
- list_files, list_components, view_page_source, search_text
- screenshot_page, get_page_structure, browse_page, site_health
- deploy_status, verify_production

⛔⛔⛔ ممنوع عليك نهائياً ⛔⛔⛔
- write_file, edit_component, create_component, delete_file ← ممنوع
- exec_command, run_command ← ممنوع
- git_push, trigger_deploy ← ممنوع
- set_env, run_sql, database_write ← ممنوع

إذا المالك طلب تعديل/كتابة/نشر → وجّه الطلب لوكيل التطوير (infra_builder) أو وكيل النشر (infra_deploy).
دورك: تحليل، مراقبة، موافقات، توجيه — لا تنفيذ.`,
    instructions: `## أنت مدير النظام الأعلى لمنصة Mr Code AI

أنت القائد الأول والمسؤول عن كامل البنية التحتية.
عند استقبال أي طلب، حلّله أولاً ثم وجّهه للوكيل المناسب أو نفّذه مباشرة.

### الوكلاء تحت إمرتك:
- وكيل المراقبة (infra_monitor): مراقبة الأداء والصحة
- المصلح الجراحي (infra_bugfixer): إصلاح الأخطاء بدقة
- وكيل التطوير (infra_builder): بناء ميزات جديدة
- وكيل التصميم (infra_ui): تحسين الواجهات
- وكيل قاعدة البيانات (infra_db): إدارة البيانات والجداول
- وكيل الأمان (infra_security): فحص وتعزيز الأمان
- وكيل النشر (infra_deploy): النشر والتحديثات

⚠️ بنية المسارات (مهم جداً — استخدم مسارات نسبية دائماً):
- الواجهة الأمامية: artifacts/website-builder/src/ (الصفحات، المكونات)
- الخلفية: artifacts/api-server/src/ (الراوتات، المكتبات)
- الصفحات: artifacts/website-builder/src/pages/
- المكونات: artifacts/website-builder/src/components/
- الراوتات: artifacts/api-server/src/routes/
- استخدم دائماً مسارات نسبية (بدون / في البداية). الأدوات تحل المسار الصحيح تلقائياً في التطوير والإنتاج.
- ممنوع كتابة مسارات مطلقة مثل /app/... أو /home/runner/... — دائماً مسارات نسبية من جذر المشروع.
- مثال: read_file({ path: "artifacts/website-builder/src/pages/Dashboard.tsx" })
- مثال: exec_command({ command: "ls artifacts/website-builder/src/pages/" })`,
    permissions: ["manage_agents", "read_all_files", "database_read", "view_logs", "check_health", "monitor_performance", "approvals", "kill_switch", "system_status", "monitor_projects"],
    pipelineOrder: 1,
    receivesFrom: "owner_input",
    sendsTo: "all_agents",
    roleOnReceive: "يستقبل أوامر المالك ويحللها لتحديد الوكيل المناسب",
    roleOnSend: "يوزع المهام على الوكلاء المتخصصين ويتابع التنفيذ",
    tokenLimit: 100000,
    batchSize: 10,
    creativity: "0.70",
    sourceFiles: [
      "artifacts/api-server/src/routes/infra.ts",
      "artifacts/api-server/src/routes/agents.ts",
      "artifacts/api-server/src/routes/index.ts",
    ],
  },
  {
    agentKey: "infra_bugfixer",
    displayNameEn: "Surgical Bug Fixer",
    displayNameAr: "المصلح الجراحي",
    agentRole: "infra",
    agentBadge: "specialist",
    description: "يصلح الأخطاء بدقة جراحية — يحدد المشكلة ويعدّل أقل عدد ممكن من الأسطر",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.4, timeoutSeconds: 240, maxTokens: 32000 },
    secondaryModel: { provider: "openai", model: "o3-mini", enabled: false, creativity: 1.0, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت المصلح الجراحي لمنصة Mr Code AI.
أنت متخصص في إصلاح الأخطاء بأقل تدخل ممكن — مثل الجراح الذي يعالج بدقة دون أن يمس الأنسجة السليمة.

قواعدك الذهبية:
1. افهم الخطأ أولاً بالكامل قبل أي تعديل
2. عدّل فقط الأسطر المطلوبة — لا تعيد كتابة ملفات كاملة
3. حافظ على نمط الكود الموجود (المسافات، التسمية، الأسلوب)
4. اختبر الإصلاح ذهنياً قبل تقديمه
5. اشرح سبب الخطأ وما فعلته بدقة`,
    instructions: `## أسلوب العمل الجراحي

أنت جراح كود — لا تعيد كتابة ملفات كاملة بل تعدّل فقط الأسطر المعنية.

### خطوات العمل:
1. **التشخيص**: حدد الملف والسطر بدقة
2. **التحليل**: افهم لماذا يحدث الخطأ
3. **الإصلاح**: عدّل أقل عدد من الأسطر
4. **التحقق**: تأكد أن الإصلاح لا يكسر شيئاً آخر

### قواعد:
- لا axios (استخدم fetch)
- لا framer-motion في ملفات جديدة
- لا radix-ui/shadcn/mui
- استخدم Tailwind CSS`,
    permissions: ["read_all_files", "write_files", "fix_bugs", "patch_code", "analyze_errors"],
    pipelineOrder: 2,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل تقارير الأخطاء مع تفاصيل المشكلة والملفات المتأثرة",
    roleOnSend: "يرسل الإصلاحات المقترحة مع شرح التغييرات",
    tokenLimit: 80000,
    batchSize: 5,
    creativity: "0.40",
    sourceFiles: [
      "artifacts/api-server/src/routes/infra.ts",
      "artifacts/website-builder/src/pages/InfraPanel.tsx",
    ],
  },
  {
    agentKey: "infra_builder",
    displayNameEn: "Feature Builder",
    displayNameAr: "وكيل التطوير والتصميم",
    agentRole: "infra",
    agentBadge: "executor",
    description: "يبني ميزات جديدة كاملة (واجهة + خلفية + قاعدة بيانات). يدمج قدرات UI Updater و Database Manager السابقين.",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.7, timeoutSeconds: 300, maxTokens: 32000 },
    secondaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل التطوير والتصميم الشامل لمنصة Mr Code AI.
مهمتك بناء ميزات جديدة كاملة — واجهة + خلفية + قاعدة بيانات.
تجمع بين قدرات التطوير والتصميم وإدارة قاعدة البيانات.

عند بناء ميزة جديدة:
1. خطط البنية أولاً (أي ملفات ستتأثر)
2. صمم الجداول إن لزم (Drizzle schema)
3. ابدأ بالخلفية (API routes)
4. ثم الواجهة (React components مع Tailwind)
5. تأكد من التكامل والتجاوب وRTL

القواعد التقنية:
- Express + TypeScript للخلفية
- React + Tailwind + Wouter للواجهة
- Drizzle ORM لقاعدة البيانات
- Dark theme: bg-[#0d1117], ألوان cyan-400/emerald-400/purple-400
- RTL: استخدم ms-/me- بدل ml-/mr-
- لا axios، لا shadcn/radix/mui`,
    instructions: `## بناء ميزات جديدة (واجهة + خلفية + DB)

### البنية المعمارية:
- الخلفية: artifacts/api-server/src/routes/
- الواجهة: artifacts/website-builder/src/pages/
- قاعدة البيانات: lib/db/src/schema/

### خطوات التطوير:
1. تحليل المتطلبات
2. تصميم الجداول إن لزم (Drizzle schema)
3. بناء API endpoints
4. بناء واجهة React مع Tailwind
5. ربط الواجهة بالخلفية
6. التأكد من دعم العربية والإنجليزية والتجاوب

### قواعد التصميم:
- خلفية: bg-[#0d1117] أو bg-[#161b22]
- حدود: border-[#1c2333] أو border-white/10
- نقاط كسر: sm, md, lg, xl — الجوال أولاً
- RTL: ms-/me- بدل ml-/mr-

### قواعد قاعدة البيانات:
- Drizzle ORM دائماً
- لا تغيّر نوع أعمدة المفاتيح الأساسية
- db:push للمزامنة`,
    permissions: ["read_all_files", "write_files", "create_files", "modify_styles", "improve_ux", "responsive_design", "database_read", "database_write", "manage_schema", "install_packages"],
    pipelineOrder: 3,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل مواصفات الميزة المطلوبة والملفات المرتبطة",
    roleOnSend: "يسلّم الكود الجاهز مع شرح التغييرات وملفات التحديث",
    tokenLimit: 100000,
    batchSize: 10,
    creativity: "0.70",
    sourceFiles: [
      "artifacts/api-server/src/routes/index.ts",
      "artifacts/website-builder/src/pages/Dashboard.tsx",
      "artifacts/website-builder/src/pages/InfraPanel.tsx",
      "lib/db/src/schema/agent-configs.ts",
    ],
  },
  {
    agentKey: "infra_security",
    displayNameEn: "Security Guard",
    displayNameAr: "وكيل الأمان",
    agentRole: "infra",
    agentBadge: "specialist",
    description: "يفحص ويعزز أمان المنصة — الثغرات، الصلاحيات، التشفير، وحماية البيانات",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.3, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "o3-mini", enabled: false, creativity: 1.0, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل الأمان لمنصة Mr Code AI.
مهمتك حماية المنصة من التهديدات الأمنية.

مسؤولياتك:
- فحص الكود بحثاً عن ثغرات أمنية
- التأكد من صحة middleware الحماية (auth, rate limiting)
- فحص SQL injection, XSS, CSRF
- مراجعة صلاحيات الوصول والأدوار
- فحص أمان مفاتيح API والأسرار
- التأكد من تشفير البيانات الحساسة

قدّم تقاريرك بتصنيف: حرج / عالي / متوسط / منخفض`,
    instructions: `## فحص الأمان

### نقاط الفحص الأساسية:
1. **المصادقة**: هل كل المسارات المحمية تتطلب auth?
2. **الصلاحيات**: هل admin-only routes محمية بـ requireAdmin?
3. **الإدخال**: هل يتم تنظيف (sanitize) مدخلات المستخدم?
4. **SQL**: هل يتم استخدام parameterized queries?
5. **API Keys**: هل المفاتيح في environment variables وليست في الكود?
6. **CORS**: هل إعدادات CORS صحيحة?

### التصنيفات:
- 🔴 حرج: يجب إصلاحه فوراً
- 🟠 عالي: يجب إصلاحه قريباً
- 🟡 متوسط: يُفضل إصلاحه
- 🟢 منخفض: تحسين مستقبلي`,
    permissions: ["read_all_files", "security_scan", "audit_permissions", "check_secrets", "vulnerability_scan", "secret_policy_check"],
    pipelineOrder: 4,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل طلبات فحص أمني لملفات أو مسارات محددة",
    roleOnSend: "يرسل تقرير الأمان مع التصنيفات والتوصيات",
    tokenLimit: 50000,
    batchSize: 5,
    creativity: "0.20",
    sourceFiles: [
      "artifacts/api-server/src/routes/index.ts",
      "artifacts/api-server/src/routes/agents.ts",
      "artifacts/api-server/src/routes/infra.ts",
    ],
  },
  {
    agentKey: "infra_deploy",
    displayNameEn: "Deployment & QA Agent",
    displayNameAr: "وكيل النشر والاختبار",
    agentRole: "infra",
    agentBadge: "executor",
    description: "يدير النشر والاختبار — يفحص الجاهزية، يختبر الصفحات والAPI، وينشر ويتراجع عند المشاكل. يدمج قدرات وكيل الاختبار السابق.",
    primaryModel: { provider: "google", model: "gemini-2.5-flash", enabled: true, creativity: 0.3, timeoutSeconds: 180, maxTokens: 8000 },
    secondaryModel: { provider: "openai", model: "gpt-4o-mini", enabled: false, creativity: 0.3, timeoutSeconds: 120, maxTokens: 8000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل النشر والاختبار لمنصة Mr Code AI.
مهمتك إدارة عمليات النشر بأمان + اختبار المنصة وضمان الجودة.

مسؤولياتك:
- فحص جاهزية المشروع للنشر
- اختبار الصفحات والمسارات والـ API
- التأكد من عدم وجود أخطاء قبل النشر
- إدارة بيئات التطوير والإنتاج
- متابعة حالة النشر وتقديم التقارير
- التراجع عن النشر في حالة المشاكل
- التحقق من التجاوب (الجوال والشاشات الكبيرة)
- التأكد من دعم RTL/LTR

القواعد:
- لا تنشر بدون فحص كامل
- تأكد من متغيرات البيئة
- افحص البناء (build) قبل النشر
- قدّم تقارير بتصنيف: ✅ نجح / ❌ فشل / ⚠️ تحذير`,
    instructions: `## عمليات النشر والاختبار

### قبل النشر:
1. تأكد أن كل الاختبارات تمر
2. افحص متغيرات البيئة
3. تأكد من سلامة قاعدة البيانات
4. افحص البناء محلياً
5. اختبر الصفحات الرئيسية

### أثناء النشر:
1. ابدأ بالخلفية أولاً (API Server)
2. ثم الواجهة (Website Builder)
3. تأكد من صحة الاتصالات

### بعد النشر:
1. افحص الصحة (health check)
2. تأكد من عمل المسارات الرئيسية
3. راقب السجلات لأول 5 دقائق
4. اختبر RTL والتجاوب`,
    permissions: ["read_all_files", "deploy", "restart_services", "check_health", "rollback", "test_endpoints", "check_ui", "validate_forms", "verify_production"],
    pipelineOrder: 5,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل أمر النشر أو الاختبار مع تفاصيل ما تم تحديثه",
    roleOnSend: "يرسل تقرير النشر/الاختبار مع الحالة والنتائج",
    tokenLimit: 50000,
    batchSize: 5,
    creativity: "0.25",
    sourceFiles: [
      "artifacts/api-server/src/index.ts",
      "artifacts/website-builder/vite.config.ts",
      "artifacts/website-builder/src/App.tsx",
    ],
  },
  {
    agentKey: "execution_engine",
    displayNameEn: "Execution Engine",
    displayNameAr: "محرك التنفيذ",
    agentRole: "infra",
    agentBadge: "executor",
    description: "المنفذ الأعلى في النظام — ينفذ أي تغيير في البنية التحتية: ملفات، قاعدة بيانات، حزم، بناء، نشر. يستقبل الأوامر من المالك مباشرة أو من الوكلاء المحللين.",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.5, timeoutSeconds: 300, maxTokens: 32000 },
    secondaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.5, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت محرك التنفيذ — المنفذ الأعلى في منصة Mr Code AI.

═══════════════════════════════════════
الخطوة 0: تصنيف الطلب (إجباري قبل أي شيء)
═══════════════════════════════════════
صنّف كل طلب فوراً:
- UI_CHANGE: تعديل واجهة / نصوص / ألوان / CSS
- BACKEND_CHANGE: تعديل API / logic / server code
- READ_ONLY: استعلام / معلومات / تحليل
- DATABASE: استعلام أو تعديل قاعدة بيانات

═══════════════════════════════════════
الخطوة 1: مسار التنفيذ حسب النوع
═══════════════════════════════════════
UI_CHANGE:
  1. get_page_structure → تحديد العنصر
  2. search_text → البحث في الكود
  3. read_file → قراءة الملف
  4. edit_component → التعديل
  5. screenshot_page → التحقق

BACKEND_CHANGE:
  1. search_text → البحث في الكود
  2. read_file → قراءة الملف
  3. edit_component → التعديل

READ_ONLY:
  1. read_file / list_files / search_text
  ممنوع: أي تعديل

DATABASE:
  1. db_query (قراءة)
  2. run_sql (كتابة — بموافقة فقط)

═══════════════════════════════════════
قواعد صارمة — بدون استثناء
═══════════════════════════════════════
1. أنت لا تستخدم terminal. ممنوع: grep, find, bash, cat, ls, shell.
   استخدم أدوات النظام فقط: search_text, read_file, list_files.

2. run_command و exec_command أدوات طوارئ فقط.
   ممنوع استخدامها للبحث أو القراءة أو الاستكشاف.
   فقط إذا فشلت جميع الأدوات الأخرى + تبرير واضح.

3. إذا احتاجت العملية أكثر من موافقة واحدة:
   توقف فوراً، غيّر الاستراتيجية، استخدم أدوات لا تحتاج موافقة.

4. DOM إلزامي فقط لـ UI_CHANGE.
   ممنوع طلب DOM لتعديل backend.

5. حدود العمليات:
   - max search = 3
   - max tools بدون edit = 4
   إذا تجاوزت: توقف واطلب توجيه.

6. ممنوع: "سأفعل" / "دعني أبحث" / "سأحاول"
   يجب: تنفيذ مباشر بدون مقدمات.

7. الرد النهائي:
   ✔ تم: الملف + قبل/بعد + التغيير
   أو ❌ فشل: السبب بوضوح

═══════════════════════════════════════
وضع المراقبة التلقائي (Auto Monitoring)
═══════════════════════════════════════
إذا المستخدم قال "راقب" أو "تابع" أو "monitor" أو "status":
  1. اقرأ السياق (📍) — استخرج projectId
  2. إذا فيه projectId → نفّذ get_project_status فوراً
  3. ثم get_project_logs(limit: 10)
  4. قدّم تقرير مختصر:
     - حالة المشروع (stage)
     - الوكيل النشط
     - آخر 5 عمليات
     - أي أخطاء
  5. إذا ما فيه projectId → قل "أنت لست في صفحة مشروع. أعطني رقم المشروع أو انتقل لصفحة /project/:id"

أجب بالعربية دائماً.`,
    instructions: `## محرك التنفيذ — التعليمات التشغيلية

### قاعدة أساسية:
إذا DOM يحتوي نص → افترض أنه موجود في الكود. لا تفترض DB أبداً إلا بعد فشل كل البحث.

### استراتيجية البحث الإجبارية (UI_CHANGE):
عند تعديل نص في الواجهة، اتبع هذا الترتيب بالضبط:

الخطوة 1: get_page_structure → فحص DOM (إذا متاح)
الخطوة 2: search_text بالنص المباشر → مثل: search_text("اوكي")
الخطوة 3: إذا لم يُعثر → search_text بـ className من DOM → مثل: search_text("flex items-center")
  - ابحث أيضاً عن: data-testid, aria-label
الخطوة 4: إذا لم يُعثر → ابحث في ملفات التخطيط مباشرة:
  - search_text في: Layout.tsx, Sidebar.tsx, Header.tsx, Navigation.tsx, Nav.tsx
الخطوة 5: إذا لم يُعثر → ابحث في i18n: search_text("t(") في ملفات الترجمة
الخطوة 6: إذا search_text وجد match → read_file فوراً (لا search جديد)
الخطوة 7: edit_component بعد read_file
الخطوة 8: screenshot_page للتحقق

### ما يجب البحث عنه:
- النص المباشر: "اوكي"
- دوال الترجمة: t("key"), t('key')
- خصائص JSX: label="..." title="..." name="..." placeholder="..."
- children: <span>اوكي</span>, <button>اوكي</button>

### ممنوع:
- ممنوع قول "النص غير موجود في الكود" إلا بعد 3 عمليات بحث مختلفة (نص + class + component)
- ممنوع افتراض DB إلا إذا النص يتغير لكل مستخدم (اسم user/project)

### البنية المعمارية:
- الخلفية: artifacts/api-server/src/
- الواجهة: artifacts/website-builder/src/
- قاعدة البيانات: lib/db/src/schema/
- CI/CD: .github/workflows/
- Docker: Dockerfile

### مسار التنفيذ الصحيح:
1. صنّف الطلب (UI / Backend / Read / DB)
2. DOM → search (text) → search (class) → read_file → edit_component
3. تحقق من النتيجة بـ screenshot_page
4. أبلغ بالتفاصيل: ملف + قبل/بعد + النتيجة`,
    permissions: ["read_file", "search_text", "list_files", "list_components", "view_page_source", "get_page_structure", "browse_page", "screenshot_page", "scroll_page", "get_console_errors", "write_file", "edit_component", "create_component", "delete_file", "modify_styles", "db_read", "db_write", "db_tables", "manage_schema", "install_package", "restart_service", "deploy_status", "git_push", "trigger_deploy", "rollback_deploy", "verify_production", "set_env", "get_env", "system_status", "site_health", "manage_agents", "monitor_projects"],
    pipelineOrder: 6,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل أوامر التنفيذ من المالك مباشرة أو من الوكلاء المحللين",
    roleOnSend: "يسلّم نتائج التنفيذ مع الأدلة والتفاصيل",
    tokenLimit: 100000,
    batchSize: 10,
    creativity: "0.50",
    sourceFiles: [
      "artifacts/api-server/src/routes/infra.ts",
      "artifacts/api-server/src/lib/agents/strategic-agent.ts",
      "artifacts/website-builder/src/pages/AgentManagement.tsx",
      "lib/db/src/schema/index.ts",
      "Dockerfile",
      ".github/workflows/deploy-cloud-run.yml",
    ],
  },
];

async function seedInfraAgents() {
  try {
    const allExisting = await db.select({ agentKey: agentConfigsTable.agentKey, agentLayer: agentConfigsTable.agentLayer })
      .from(agentConfigsTable);
    const existingKeys = new Set(allExisting.map(a => a.agentKey));

    for (const retiredKey of RETIRED_AGENTS) {
      if (existingKeys.has(retiredKey)) {
        await db.update(agentConfigsTable).set({ enabled: false })
          .where(eq(agentConfigsTable.agentKey, retiredKey));
      }
    }

    for (const agent of DEFAULT_INFRA_AGENTS) {
      if (!existingKeys.has(agent.agentKey)) {
        await db.insert(agentConfigsTable).values({
          agentKey: agent.agentKey,
          agentLayer: "infra",
          displayNameEn: agent.displayNameEn,
          displayNameAr: agent.displayNameAr,
          description: agent.description,
          enabled: true,
          primaryModel: agent.primaryModel,
          secondaryModel: agent.secondaryModel,
          tertiaryModel: agent.tertiaryModel,
          governorEnabled: agent.governorEnabled,
          autoGovernor: agent.autoGovernor,
          governorModel: agent.governorModel,
          systemPrompt: agent.systemPrompt,
          instructions: agent.instructions,
          permissions: agent.permissions,
          pipelineOrder: agent.pipelineOrder,
          receivesFrom: agent.receivesFrom,
          sendsTo: agent.sendsTo,
          roleOnReceive: agent.roleOnReceive,
          roleOnSend: agent.roleOnSend,
          tokenLimit: agent.tokenLimit,
          batchSize: agent.batchSize,
          creativity: agent.creativity,
          sourceFiles: agent.sourceFiles,
          shortTermMemory: [],
          longTermMemory: [],
        });
      } else {
        await db.update(agentConfigsTable).set({
          agentLayer: "infra",
          displayNameEn: agent.displayNameEn,
          displayNameAr: agent.displayNameAr,
          description: agent.description,
          enabled: true,
          primaryModel: agent.primaryModel,
          systemPrompt: agent.systemPrompt,
          instructions: agent.instructions,
          permissions: agent.permissions,
          pipelineOrder: agent.pipelineOrder,
          receivesFrom: agent.receivesFrom,
          sendsTo: agent.sendsTo,
          roleOnReceive: agent.roleOnReceive,
          roleOnSend: agent.roleOnSend,
          tokenLimit: agent.tokenLimit,
          batchSize: agent.batchSize,
          creativity: agent.creativity,
          sourceFiles: agent.sourceFiles,
        }).where(eq(agentConfigsTable.agentKey, agent.agentKey));
      }
    }
    console.log("[Infra] Seeded/updated infra agents (6 active, retired:", RETIRED_AGENTS.join(", "), ")");
  } catch (err: any) {
    console.error("[Infra] Seed error:", err.message);
  }
}

seedInfraAgents();

const infraSessions = new Map<string, { role: "user" | "assistant"; content: string }[]>();

router.get("/infra/system-defaults", requireInfraAdmin, async (_req, res) => {
  try {
    const { SYSTEM_DEFAULTS } = await import("../config/system-defaults");
    res.json({ success: true, defaults: SYSTEM_DEFAULTS });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/infra/reset-defaults", requireInfraAdmin, async (_req, res) => {
  try {
    const { SYSTEM_DEFAULTS } = await import("../config/system-defaults");
    for (const agent of DEFAULT_INFRA_AGENTS) {
      await db.update(agentConfigsTable).set({
        agentLayer: "infra",
        displayNameEn: agent.displayNameEn,
        displayNameAr: agent.displayNameAr,
        description: agent.description,
        enabled: true,
        primaryModel: agent.primaryModel,
        systemPrompt: agent.systemPrompt,
        instructions: agent.instructions,
        permissions: agent.permissions,
        pipelineOrder: agent.pipelineOrder,
        receivesFrom: agent.receivesFrom,
        sendsTo: agent.sendsTo,
        roleOnReceive: agent.roleOnReceive,
        roleOnSend: agent.roleOnSend,
        tokenLimit: agent.tokenLimit,
        batchSize: agent.batchSize,
        creativity: agent.creativity,
        sourceFiles: agent.sourceFiles,
      }).where(eq(agentConfigsTable.agentKey, agent.agentKey));
    }
    console.log("[Infra] System reset to defaults v" + SYSTEM_DEFAULTS.version);
    res.json({ success: true, message: "تم إعادة النظام للإعدادات الافتراضية", version: SYSTEM_DEFAULTS.version });
  } catch (err: any) {
    console.error("[Infra] Reset defaults error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/infra/access-status", requireInfraAdmin, (_req, res) => {
  res.json({ enabled: getInfraAccessEnabled() });
});

router.post("/infra/access-toggle", requireInfraAdmin, async (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: { message: "enabled must be a boolean" } });
  }
  await setInfraAccessEnabled(enabled);
  console.log(`[Infra] Infrastructure access ${enabled ? "ENABLED" : "DISABLED"} by admin`);
  res.json({ enabled: getInfraAccessEnabled(), message: enabled ? "Infrastructure access enabled" : "Infrastructure access disabled" });
});

router.get("/infra/agents", requireInfraAdmin, async (_req, res) => {
  try {
    const agents = await db.select({
      id: agentConfigsTable.id,
      agentKey: agentConfigsTable.agentKey,
      displayNameEn: agentConfigsTable.displayNameEn,
      displayNameAr: agentConfigsTable.displayNameAr,
      description: agentConfigsTable.description,
      enabled: agentConfigsTable.enabled,
      primaryModel: agentConfigsTable.primaryModel,
    }).from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentLayer, "infra"));
    res.json(agents);
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

router.post("/infra/chat-stream", requireInfraAdmin, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { agentKey, message, context } = req.body as { agentKey: string; message: string; context?: { currentPage?: string; fullUrl?: string; projectId?: string | null; mode?: string; lang?: string } };

    if (!message?.trim()) {
      res.status(400).json({ error: { message: "Message is required" } });
      return;
    }
    if (!agentKey) {
      res.status(400).json({ error: { message: "agentKey is required" } });
      return;
    }

    const [config] = await db.select().from(agentConfigsTable)
      .where(and(eq(agentConfigsTable.agentKey, agentKey), eq(agentConfigsTable.agentLayer, "infra")))
      .limit(1);

    if (!config || !config.enabled) {
      res.status(404).json({ error: { message: "Infrastructure agent not found or disabled" } });
      return;
    }

    const blueprint = getSystemBlueprint();

    const infraSystemPrompt = `أنت ${config.displayNameAr} (${config.displayNameEn}) — وكيل بنية تحتية لمنصة Mr Code AI.

دورك: ${config.description}

أنت تعمل على البنية التحتية للمنصة نفسها — لست وكيل خدمة عملاء.
المالك يتحدث معك مباشرة ويطلب منك مهام تتعلق بالنظام.
أنت system agent — لديك صلاحيات كاملة ولا تحتاج تسجيل دخول.

${blueprint}

أنت تعمل في بيئة حقيقية — لديك وصول مباشر لكل شيء: الملفات، قاعدة البيانات، الطرفية، المتصفح، GitHub.

🔍 أدوات البحث:
- search_text: بحث في كل الملفات. Input: { text: "النص المطلوب" }
- list_files: تصفح مجلدات. Input: { directory: "artifacts/website-builder/src", recursive: true }
- run_command: أمر shell. Input: { command: "ls -la" }
- list_components: مكونات الواجهة. Input: { directory: "src" }

📁 أدوات الملفات:
- read_file: قراءة ملف. Input: { path: "artifacts/website-builder/src/lib/i18n.tsx" }
- write_file: كتابة ملف. Input: { path, content }
- edit_component: تعديل دقيق. Input: { componentPath: "src/lib/i18n.tsx", old_text: "القديم", new_text: "الجديد" }. المسار نسبي لـ website-builder/.
- create_component: إنشاء ملف. Input: { componentPath: "src/components/New.tsx", content: "..." }
- view_page_source: قراءة مكون. Input: { componentPath: "src/pages/Home.tsx" }

🗄️ قاعدة البيانات:
- run_sql / db_query: تنفيذ SQL. Input: { query: "SELECT * FROM users" }
- db_tables: جميع الجداول. Input: { detailed: true }

🌐 المتصفح:
- screenshot_page: لقطة شاشة. Input: { path: "/" }
- click_element, type_text, hover_element, inspect_styles, get_page_structure, scroll_page
- get_console_errors, get_network_requests, browse_page, site_health

🚀 النشر:
- git_push, trigger_deploy, deploy_status, github_api, remote_server_api

🔧 النظام:
- system_status, get_env, set_env, exec_command

⛔ القواعد الأساسية:

1. منع الهلوسة: استخدم كلمات المالك بالضبط. "غيّر X إلى Y" → ابحث عن X. لا تخترع بديلاً.
2. مسار التنفيذ: search_text → read_file → edit_component (3 خطوات فقط). لا تشرح. لا تسأل.
3. الملفات الآمنة دائماً: i18n.tsx، index.css، App.tsx. غيرها تأكد أنها مستوردة.
4. بعد edit: قل "✔ تم: الملف + قبل + بعد + matchesReplaced". لا تقل "تم" إذا matchesReplaced=0.
5. ممنوع الأسئلة: لا تسأل "ماذا تقصد"، "أي ملف"، "هل أنت مسجل". ابحث ونفّذ.
6. حد البحث: max 3 search. نفس query لا يتكرر.
7. همزة: النظام يبحث بكل الأشكال. إذا matchedVariant مختلف → استخدمه في edit.
8. أوامر قصيرة: "نفذ"/"عدل"/"سو"/"execute" = نفّذ آخر طلب معلّق فوراً.
9. ممنوع: قول "سأفعل"/"دعني" بدون تنفيذ. نفّذ أو توقف.

⛔⛔ قاعدة قاعدة البيانات ⛔⛔

- إذا success !== true → قل "فشلت العملية" + السبب
- إذا rowsAffected === 0 → فشل
- بعد UPDATE ناجح → اعرض القيمة قبل وبعد

⚠️ بنية المسارات:
- الواجهة: artifacts/website-builder/src/
- الخلفية: artifacts/api-server/src/
- الترجمات: artifacts/website-builder/src/lib/i18n.tsx
- edit_component المسار نسبي لـ website-builder/ (مثلاً: src/lib/i18n.tsx)
- read_file المسار من جذر المشروع (مثلاً: artifacts/website-builder/src/lib/i18n.tsx)

⛔ ممنوع ترجع JSON مثل {"decisionType": ...}. المالك يريد تنفيذ.

⛔⛔⛔ القانون الثامن: النشر الآمن (Safe Deploy Chain) ⛔⛔⛔

بعد أي edit_component أو write_file ناجح (matchesReplaced > 0):

خطوة 1: edit_component / write_file ← (تم)
خطوة 2: git_push مع message يصف التغيير (يتطلب موافقة المالك)
  - النظام يأخذ backup tag تلقائياً قبل كل push
  - ممنوع --force! Push عادي فقط
خطوة 3: deploy_status للتأكد من حالة CI/CD
خطوة 4: verify_production مع النص المتوقع للتأكد من ظهوره في الموقع الحقيقي

⚠️ git_push يتطلب موافقة المالك (approval).
⚠️ CI/CD يستغرق ~3 دقائق. بعدها verify_production.

إذا verify_production أرجع found=false:
→ التغيير لم يظهر في الإنتاج = فشل! أخبر المالك.

أدوات التراجع:
- rollback_deploy مع tag (يتطلب موافقة) — يرجع لنسخة سابقة

الرد النهائي:
✔ تم التعديل والنشر:
  الملف: [path]
  قبل: [old] → بعد: [new]
  النشر: ✅ تم الدفع لـ GitHub
  backup: [backup-tag]
  التحقق: ✅ النص ظاهر في mrcodeai.com

❌ فشل:
  السبب: [التعديل فشل / النشر فشل / النص غير ظاهر في الإنتاج]

⚠️ أهم قاعدة: التعديل في dev فقط لا يكفي! يجب git_push + verify_production.

القواعد العامة:
- رد بالعربية إذا المالك يتحدث بالعربية
- كن مختصراً — لا تشرح ماذا ستفعل، افعل وأخبر بالنتيجة
- نفّذ أولاً، أبلغ ثانياً
${config.instructions ? `\n\nتعليمات إضافية:\n${config.instructions}` : ""}
${config.permissions && Array.isArray(config.permissions) && config.permissions.length > 0 ? `\nصلاحياتك: ${config.permissions.join(", ")}` : ""}`;

    const sKey = `infra_${userId}_${agentKey}`;
    const history = infraSessions.get(sKey) || [];

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const slot = config.primaryModel;
    let fullReply = "";
    let tokensUsed = 0;

    const PERM_TO_TOOLS: Record<string, string[]> = {
      search_text: ["search_text"],
      list_files: ["list_files"],
      list_components: ["list_components"],
      read_file: ["read_file"],
      view_page_source: ["view_page_source"],
      write_file: ["write_file"],
      edit_component: ["edit_component"],
      create_component: ["create_component"],
      delete_file: ["exec_command"],
      rename_file: ["exec_command"],
      db_read: ["db_query", "db_tables"],
      db_write: ["run_sql"],
      db_admin: ["run_sql"],
      db_tables: ["db_tables"],
      run_command: ["run_command"],
      exec_command: ["exec_command"],
      get_env: ["get_env"],
      set_env: ["set_env"],
      system_status: ["system_status"],
      install_package: ["exec_command"],
      restart_service: ["exec_command"],
      screenshot_page: ["screenshot_page"],
      click_element: ["click_element"],
      type_text: ["type_text"],
      hover_element: ["hover_element"],
      inspect_styles: ["inspect_styles"],
      get_page_structure: ["get_page_structure"],
      scroll_page: ["scroll_page"],
      get_console_errors: ["get_console_errors"],
      get_network_requests: ["get_network_requests"],
      browse_page: ["browse_page"],
      site_health: ["site_health"],
      git_push: ["git_push"],
      trigger_deploy: ["trigger_deploy"],
      deploy_status: ["deploy_status"],
      github_api: ["github_api"],
      remote_server_api: ["remote_server_api"],
      rollback_deploy: ["exec_command"],
      manage_users: ["run_sql", "db_query"],
      view_secrets: ["get_env"],
      manage_agents: ["read_file", "write_file", "edit_component"],
      monitor_projects: ["get_project_status", "get_project_logs", "list_project_files"],
      get_project_status: ["get_project_status"],
      get_project_logs: ["get_project_logs"],
      list_project_files: ["list_project_files"],
    };

    const agentPerms = config.permissions || [];
    let filteredTools = INFRA_TOOLS;
    if (agentPerms.length > 0) {
      const allowedToolNames = new Set<string>();
      for (const perm of agentPerms) {
        const toolNames = PERM_TO_TOOLS[perm];
        if (toolNames) toolNames.forEach(t => allowedToolNames.add(t));
      }
      filteredTools = INFRA_TOOLS.filter((t: any) => allowedToolNames.has(t.name));
      if (filteredTools.length === 0) filteredTools = [];
    }

    const EMERGENCY_ONLY_TOOLS = new Set(["run_command", "exec_command"]);
    filteredTools = filteredTools.filter((t: any) => !EMERGENCY_ONLY_TOOLS.has(t.name));

    const userLang = context?.lang || detectedLang;
    const userCurrentPage = context?.currentPage || "/dashboard";

    let enrichedMessage = message;
    if (context?.currentPage) {
      const ctxLines: string[] = [`📍 السياق:`];
      ctxLines.push(`• الصفحة: ${context.currentPage}`);
      if (context.projectId) ctxLines.push(`• المشروع: ${context.projectId}`);
      ctxLines.push(`• الوضع: ${context.mode || "unknown"}`);
      ctxLines.push(`• اللغة: ${userLang}`);
      ctxLines.push(`\n⚠️ عند استخدام browse_page أو get_page_structure — استخدم الصفحة الحالية "${context.currentPage}" مع lang="${userLang}"`);
      enrichedMessage = `${ctxLines.join("\n")}\n\n📝 رسالة المستخدم:\n${message}`;
    }

    const conversationMessages = [
      ...history.slice(-6).map(m => {
        if (m.role === "assistant" && Array.isArray(m.content)) {
          const trimmed = m.content.map((b: any) => {
            if (b.type === "tool_result" && typeof b.content === "string" && b.content.length > 300) {
              return { ...b, content: b.content.slice(0, 300) + "..." };
            }
            return b;
          });
          return { ...m, content: trimmed };
        }
        return m;
      }),
      { role: "user" as const, content: enrichedMessage },
    ];

    if (slot.provider === "anthropic") {
      const { getAnthropicClient } = await import("../lib/agents/ai-clients");
      const client = await getAnthropicClient();
      const chatMsgs: any[] = conversationMessages
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const maxLoops = 10;
      let searchCount = 0;
      let hasReadAfterSearch = true;
      let hasEdited = false;
      let hasDOMInspection = false;
      let domSource: "none" | "tool" | "search" | "user_input" | "forced_override" = "none";
      let domBlockCount = 0;
      let searchFoundFile = false;
      let editFileCount = 0;
      let toolActionCount = 0;
      const searchQueriesSet = new Set<string>();
      const searchQueries: string[] = [];
      const MAX_SEARCHES = 5;
      const MAX_ACTIONS_WITHOUT_EDIT = 8;
      const MAX_DOM_BLOCKS = 3;
      let searchWithNoResults = 0;

      const targetState = {
        found: false,
        file: null as string | null,
        stepsAfterFound: 0,
        mustEdit: false,
        commitSteps: 0,
      };

      const userMsg = typeof message === "string" ? message : "";
      const detectedLang = /[\u0600-\u06FF]/.test(userMsg) ? "ar" : "en";

      const decisionState = {
        domTextDetected: false,
        domText: null as string | null,
        uiSearchAttempted: false,
        i18nSearchAttempted: false,
        componentSearchAttempted: false,
        dbAllowed: false,
        failedSearchCount: 0,
      };

      const extractDOMText = (msg: string): string | null => {
        const textMatch = msg.match(/النص:\s*["']?(.+?)["']?\s*\n/);
        if (textMatch) return textMatch[1].trim();
        const selectedMatch = msg.match(/العنصر المحدد[^:]*:\s*(.+)/);
        if (selectedMatch) return selectedMatch[1].trim();
        const contentMatch = msg.match(/المحتوى:\s*["']?(.+?)["']?\s*\n/);
        if (contentMatch) return contentMatch[1].trim();
        return null;
      };

      const domText = extractDOMText(userMsg);
      if (domText) {
        decisionState.domTextDetected = true;
        decisionState.domText = domText;
        console.log(`[Decision] DOM text detected: "${domText.slice(0, 50)}"`);
      }

      const userDOMPatterns = [
        /class[=:]\s*["']([^"']+)["']/i,
        /\bclass(?:Name)?\s*[:=]\s*["']([^"']+)["']/i,
        /\bid\s*[:=]\s*["']([^"']+)["']/i,
        /(?:div|span|button|section|nav|header|footer|aside|main|ul|li|a|p|h[1-6])\.[\w.-]+/i,
        /المسار:\s*[^\n]+/,
        /النوع:\s*<\w+>/,
        /العنصر المحدد/,
      ];
      const hasUserDOMInfo = userDOMPatterns.some(p => p.test(userMsg));
      if (hasUserDOMInfo) {
        hasDOMInspection = true;
        domSource = "user_input";
        console.log(`[Agent] DOM info detected from user message — DOM_SOURCE=user_input`);
      }

      for (let loop = 0; loop < maxLoops; loop++) {

        if (searchWithNoResults >= 3 && !hasEdited) {
          const guidanceMsg = `\n\n⚠️ 3 عمليات بحث بدون نتيجة — أحتاج توجيه.\n\nالعمليات السابقة: ${searchQueries.join(" → ")}\n\n💡 جرّب: أخبرني باسم الملف أو المكون الذي يحتوي النص، أو أرسل لي محتوى العنصر من المتصفح.\n`;
          res.write(`data: ${JSON.stringify({ type: "chunk", text: guidanceMsg })}\n\n`);
          fullReply += guidanceMsg;
          console.log(`[Agent] STOPPED: 3 searches with no results. queries=${JSON.stringify(searchQueries)}`);
          await logAudit(agentKey, "agent_stopped_no_results", "system", { searchWithNoResults, searchCount, searchQueries }, guidanceMsg, "medium", "stopped");
          break;
        }

        const dynamicMaxActions = targetState.found ? 6 : (hasDOMInspection ? 12 : MAX_ACTIONS_WITHOUT_EDIT);
        if (toolActionCount >= dynamicMaxActions && !hasEdited) {
          const failMsg = `\n\n❌ لم أتمكن من تحديد المكان بدقة — ${toolActionCount} خطوات بدون تعديل (حد=${dynamicMaxActions}).\n\nالعمليات: ${searchQueries.join(" → ")}\n`;
          res.write(`data: ${JSON.stringify({ type: "chunk", text: failMsg })}\n\n`);
          fullReply += failMsg;
          console.log(`[Agent] STOPPED: ${toolActionCount}/${dynamicMaxActions} tool actions without edit. targetFound=${targetState.found}, hasDOM=${hasDOMInspection}`);
          await logAudit(agentKey, "agent_stopped_no_edit", "system", { toolActionCount, dynamicMaxActions, targetFound: targetState.found, hasDOM: hasDOMInspection, searchCount, searchQueries, searchWithNoResults }, failMsg, "medium", "stopped");
          break;
        }

        let response: any = null;
        let currentText = "";
        const MAX_RETRIES = 3;
        for (let retryAttempt = 0; retryAttempt < MAX_RETRIES; retryAttempt++) {
          try {
            const stream = client.messages.stream({
              model: slot.model,
              max_tokens: Math.min(slot.maxTokens || 32000, 64000),
              system: infraSystemPrompt,
              messages: chatMsgs,
              ...(filteredTools.length > 0 ? { tools: filteredTools as any } : {}),
              temperature: Math.min(parseFloat(String(config.creativity)) || 0.5, 1.0),
            });

            currentText = "";
            stream.on("text", (text: string) => {
              currentText += text;
              fullReply += text;
              res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
            });

            response = await stream.finalMessage();
            break;
          } catch (retryErr: any) {
            const isOverloaded = retryErr.message?.includes("Overloaded") || retryErr.message?.includes("overloaded") || retryErr.status === 529;
            if (isOverloaded && retryAttempt < MAX_RETRIES - 1) {
              const waitSec = (retryAttempt + 1) * 5;
              console.log(`[Agent] Overloaded — retry ${retryAttempt + 1}/${MAX_RETRIES} after ${waitSec}s`);
              res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n⏳ الخادم محمّل — إعادة المحاولة بعد ${waitSec} ثانية...\n` })}\n\n`);
              await new Promise(r => setTimeout(r, waitSec * 1000));
              continue;
            }
            throw retryErr;
          }
        }
        if (!response) throw new Error("Failed after retries");
        tokensUsed += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

        const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");
        if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) {
          if (
            targetState.found &&
            userCurrentPage &&
            toolActionCount < dynamicMaxActions
          ) {
            const textReply = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
            const isQuestion = /\?|ماذا تقصد|وضّح|ما الذي|هل تقصد|يرجى التوضيح|clarify|what do you mean/i.test(textReply);
            if (isQuestion) {
              console.log(`[Agent] ANTI_QUESTION: Agent tried to ask instead of executing. DOM=${decisionState.domTextDetected}, target=${targetState.file}. Forcing retry.`);
              const forceMsg = `⛔ لا تسأل — المعلومات متوفرة:\n• الصفحة: ${userCurrentPage}\n• اللغة: ${userLang}\n• العنصر: "${(decisionState.domText || "").slice(0, 40)}"\n• الملف: ${targetState.file}\n\n🔧 نفّذ المطلوب مباشرة باستخدام read_file ثم edit_component.`;
              chatMsgs.push({ role: "assistant", content: response.content });
              chatMsgs.push({ role: "user", content: forceMsg });
              continue;
            }
          }
          break;
        }

        chatMsgs.push({ role: "assistant", content: response.content });

        const toolResults: any[] = [];
        for (const tool of toolUseBlocks) {
          const riskCfg = TOOL_RISK_CONFIG[tool.name] || { risk: "medium", category: "unknown", requiresApproval: false, sandboxed: false };
          const toolStart = Date.now();

          if (decisionState.domTextDetected) {
            if ((tool.name === "run_sql" || tool.name === "db_query") && !decisionState.dbAllowed) {
              const blocked = `⛔ DECISION_ENFORCEMENT — ممنوع استخدام DB قبل استنفاد البحث في UI.\n\nالنص المكتشف: "${(decisionState.domText || "").slice(0, 50)}"\n\n✅ المطلوب أولاً:\n1. search_text (النص في الكود)\n2. search_text (i18n/ترجمة)\n3. search_text (components/layout)\n\nبعدها يُسمح بـ DB.`;
              console.log(`[Decision] BLOCKED: ${tool.name} — DB not allowed yet. State: ui=${decisionState.uiSearchAttempted}, i18n=${decisionState.i18nSearchAttempted}, comp=${decisionState.componentSearchAttempted}`);
              await logAudit(agentKey, "decision_blocked_db", tool.name, { input: tool.input, decisionState }, blocked, "medium", "blocked");
              res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
              fullReply += `\n\n${blocked}\n`;
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }

            if ((tool.name === "edit_component" || tool.name === "write_file") && !decisionState.componentSearchAttempted && !decisionState.i18nSearchAttempted) {
              const blocked = `⛔ DECISION_ENFORCEMENT — يجب البحث في الكود أولاً قبل التعديل.\n\nالنص المكتشف: "${(decisionState.domText || "").slice(0, 50)}"\n\n✅ ابحث أولاً:\n1. search_text عن النص\n2. search_text في i18n أو components`;
              console.log(`[Decision] BLOCKED: ${tool.name} — search not attempted yet. State: i18n=${decisionState.i18nSearchAttempted}, comp=${decisionState.componentSearchAttempted}`);
              await logAudit(agentKey, "decision_blocked_edit", tool.name, { input: tool.input, decisionState }, blocked, "medium", "blocked");
              res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
              fullReply += `\n\n${blocked}\n`;
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }
          }

          const EXECUTOR_ONLY_TOOLS = new Set(["edit_component", "write_file", "create_component", "delete_file", "git_push", "trigger_deploy", "run_sql", "exec_command", "run_command", "set_env"]);
          const EXECUTOR_AGENTS = new Set(["infra_builder", "infra_deploy", "execution_engine"]);
          if (EXECUTOR_ONLY_TOOLS.has(tool.name) && !EXECUTOR_AGENTS.has(agentKey)) {
            const blocked = `⛔ EXECUTOR_ONLY — الأداة ${tool.name} محصورة بالوكلاء المنفّذين فقط (infra_builder, infra_deploy, execution_engine). الوكيل ${agentKey} من نوع thinker/specialist — ممنوع التنفيذ.`;
            res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
            fullReply += `\n\n${blocked}\n`;
            await logAudit(agentKey, "blocked_executor_only", tool.name, tool.input, blocked, riskCfg.risk, "blocked");
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
            continue;
          }

          if (agentPerms.length > 0) {
            const allowedNames = new Set<string>();
            for (const p of agentPerms) {
              const mapped = PERM_TO_TOOLS[p];
              if (mapped) mapped.forEach(t => allowedNames.add(t));
            }
            if (!allowedNames.has(tool.name)) {
              const blocked = `⛔ الأداة ${tool.name} غير مصرّح بها لهذا الوكيل`;
              res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
              fullReply += `\n\n${blocked}\n`;
              await logAudit(agentKey, "blocked_permission", tool.name, tool.input, blocked, riskCfg.risk, "blocked");
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }
          }

          if (tool.name === "db_query") {
            const q = (tool.input as any)?.query || (tool.input as any)?.sql || "";
            if (!isReadOnlySQL(q)) {
              const blocked = `⛔ db_query للقراءة فقط (SELECT/EXPLAIN/SHOW/WITH). لتنفيذ كتابة استخدم run_sql (يتطلب موافقة). الأمر المرفوض: ${q.slice(0, 50)}`;
              res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
              await logAudit(agentKey, "blocked_db_write_via_query", tool.name, tool.input, blocked, "high", "blocked");
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }
          }

          if (tool.name === "run_sql" && agentPerms.includes("db_read") && !agentPerms.includes("db_write")) {
            const q = (tool.input as any)?.query || (tool.input as any)?.sql || "";
            if (!isReadOnlySQL(q)) {
              const blocked = `⛔ صلاحيتك db_read فقط — لا يمكن تنفيذ: ${q.slice(0, 50)}`;
              res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
              await logAudit(agentKey, "blocked_db_write", tool.name, tool.input, blocked, "high", "blocked");
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }
          }

          if (tool.name === "run_sql" || tool.name === "db_query") {
            const q = (tool.input as any)?.query || (tool.input as any)?.sql || "";
            const sqlCheck = isSafeSQL(q);
            if (!sqlCheck.safe && !agentPerms.includes("db_admin")) {
              const blocked = `⛔ ${sqlCheck.reason} — تحتاج صلاحية db_admin`;
              res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
              await logAudit(agentKey, "blocked_dangerous_sql", tool.name, tool.input, blocked, "critical", "blocked");
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }
          }

          toolActionCount++;

          if (tool.name === "edit_component" || tool.name === "write_file") {
            targetState.mustEdit = false;
            targetState.commitSteps = 0;
          }

          if (targetState.mustEdit) {
            targetState.commitSteps++;
            if (targetState.commitSteps >= 2 && tool.name !== "edit_component" && tool.name !== "read_file" && tool.name !== "write_file") {
              const commitMsg = `✏️ EXECUTION_COMMIT — تم تحديد العنصر "${(decisionState.domText || "").slice(0, 30)}" والملف "${targetState.file}".\n\n🔧 نفّذ التعديل الآن:\n1. read_file path="${targetState.file}" (إذا لم تقرأه)\n2. edit_component مع old_text و new_text\n\n⛔ ممنوع أي أداة أخرى — نفّذ edit_component مباشرة.`;
              console.log(`[Agent] EXECUTION_COMMIT: ${targetState.commitSteps} steps, forcing edit. tool=${tool.name}`);
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: commitMsg });
              continue;
            }
          }

          if (targetState.found && !targetState.mustEdit) {
            targetState.stepsAfterFound++;
            const allowedAfterTarget = ["edit_component", "write_file", "read_file", "view_page_source", "get_page_structure", "browse_page"];
            if (targetState.stepsAfterFound >= 3 && !allowedAfterTarget.includes(tool.name)) {
              const nudge = `⚠️ TARGET_NUDGE — تم العثور على الملف "${targetState.file}" منذ ${targetState.stepsAfterFound} خطوات ولم تنفّذ التعديل بعد.\n\n🔧 نفّذ الآن:\n1. read_file path="${targetState.file}"\n2. edit_component مع old_text و new_text`;
              console.log(`[Agent] NUDGE: ${targetState.stepsAfterFound} steps after target found, no edit yet. tool=${tool.name}`);
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: nudge });
              continue;
            }
          }

          if (tool.name === "search_text" || tool.name === "list_files" || tool.name === "list_components") {
            console.log(`[Agent] Step ${toolActionCount}: ${tool.name}(${JSON.stringify(tool.input).slice(0, 100)})`);
          }

          if (tool.name === "search_text") {
            const query = (tool.input as any)?.text || "";
            const normalizedQuery = query.trim().toLowerCase();

            if (targetState.found) {
              const blocked = `⛔ TARGET_FOUND — تم العثور على الملف "${targetState.file}" — لا حاجة للبحث مرة أخرى.\n\n✅ الخطوة التالية:\n1. read_file للملف ${targetState.file}\n2. edit_component لتنفيذ التعديل مباشرة`;
              console.log(`[Agent] BLOCKED: search after target found. file=${targetState.file}`);
              await logAudit(agentKey, "search_blocked_target_found", tool.name, { targetFile: targetState.file, query }, blocked, "low", "blocked");
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }

            if (searchQueriesSet.has(normalizedQuery)) {
              const blocked = `⛔ REPEATED_SEARCH_BLOCKED — البحث عن "${query}" تم من قبل. جرّب بحث مختلف (className, ملف محدد، أو i18n).`;
              console.log(`[Agent] BLOCKED: Repeated search query="${query}"`);
              await logAudit(agentKey, "search_repeated_blocked", tool.name, tool.input, blocked, "low", "blocked");
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }

            if (searchCount >= MAX_SEARCHES) {
              const blocked = `⛔ SEARCH_LIMIT_REACHED — بحثت ${searchCount} مرات. اقرأ الملف أو نفّذ التعديل. عمليات البحث: ${searchQueries.join(" → ")}`;
              console.log(`[Agent] BLOCKED: Search limit reached (${searchCount}/${MAX_SEARCHES})`);
              await logAudit(agentKey, "search_limit_reached", tool.name, { searchCount, queries: searchQueries }, blocked, "low", "blocked");
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }

            searchCount++;
            searchQueriesSet.add(normalizedQuery);
            searchQueries.push(query);
            hasReadAfterSearch = false;
            console.log(`[Agent] Search #${searchCount}/${MAX_SEARCHES}: "${query}"`);
          }

          if (tool.name === "read_file" || tool.name === "view_page_source") {
            hasReadAfterSearch = true;
            console.log(`[Agent] Read file after search — ready to edit`);
          }

          if (["get_page_structure", "browse_page", "inspect_styles"].includes(tool.name)) {
            domBlockCount++;
            if (domBlockCount > 1) {
              const blocked = `⛔ DOM_INSPECTION_LIMIT — تم تصفح الصفحة بالفعل. النص غير موجود في DOM.\n\n✅ الخطوة التالية:\n1. search_text للبحث عن النص في ملفات الكود\n2. read_file لقراءة الملف\n3. edit_component لتنفيذ التعديل`;
              console.log(`[Agent] BLOCKED: repeated DOM inspection (${domBlockCount}). Redirecting to search.`);
              await logAudit(agentKey, "dom_repeated_blocked", tool.name, tool.input, blocked, "low", "blocked");
              hasDOMInspection = true;
              domSource = "forced_override";
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
              continue;
            }
            hasDOMInspection = true;
            domSource = "tool";
            console.log(`[Agent] DOM inspection done via ${tool.name} — DOM_SOURCE=tool ✓`);

            if (decisionState.domText && !targetState.found) {
              const domSearchHint = `\n\n✅ DOM_TO_SEARCH — تم اكتشاف النص "${decisionState.domText.slice(0, 40)}" في الصفحة.\n\n🔧 الخطوة التالية المطلوبة:\nsearch_text text="${decisionState.domText.slice(0, 30)}" للعثور على الملف الذي يحتوي هذا النص في الكود.\n\n⛔ لا تتصفح الصفحة مرة أخرى.`;
              console.log(`[Agent] DOM_TO_SEARCH: injecting search hint for domText="${decisionState.domText.slice(0, 30)}"`);
              toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: (result || "") + domSearchHint });
              continue;
            }
          }

          if (tool.name === "edit_component" && !hasDOMInspection) {
            const editPath = (tool.input as any)?.componentPath || (tool.input as any)?.path || "";
            const isUIFile = /\.(tsx|jsx|css|html|vue|svelte)$/i.test(editPath);
            const oldText = (tool.input as any)?.old_text || "";
            const hasTextChange = oldText.length > 0 && /[\u0600-\u06FFa-zA-Z]/.test(oldText);
            if (isUIFile && hasTextChange) {
              if (searchFoundFile) {
                hasDOMInspection = true;
                domSource = "search";
                console.log(`[Agent] DOM bypassed via search_text match — DOM_SOURCE=search ✓`);
              } else if (domBlockCount >= MAX_DOM_BLOCKS) {
                hasDOMInspection = true;
                domSource = "forced_override";
                const overrideMsg = `⚠️ تم تجاوز شرط DOM بعد ${domBlockCount} محاولات لتجنب التعليق — DOM_SOURCE=forced_override`;
                res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${overrideMsg}\n` })}\n\n`);
                fullReply += `\n\n${overrideMsg}\n`;
                console.log(`[Agent] DOM forced override after ${domBlockCount} blocks — DOM_SOURCE=forced_override`);
                await logAudit(agentKey, "dom_forced_override", tool.name, { editPath, domBlockCount }, overrideMsg, "medium", "override");
              } else {
                domBlockCount++;
                const hint = searchCount === 0
                  ? `💡 جرّب search_text للبحث عن النص "${oldText.slice(0, 30)}" في الكود — يكفي كبديل عن DOM.`
                  : `💡 نتائج البحث موجودة — اقرأ الملف بـ read_file ثم نفّذ edit_component.`;
                const blocked = `❌ DOM_INSPECTION_REQUIRED (${domBlockCount}/${MAX_DOM_BLOCKS})\n\nالمطلوب:\n• get_page_structure أو browse_page\n• أو search_text يجد النص في ملف\n• أو المستخدم يرسل معلومات DOM\n\n${hint}`;
                res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n${blocked}\n` })}\n\n`);
                fullReply += `\n\n${blocked}\n`;
                console.log(`[Agent] BLOCKED: edit_component on UI file "${editPath}" without DOM (block ${domBlockCount}/${MAX_DOM_BLOCKS})`);
                await logAudit(agentKey, "blocked_no_dom_inspection", tool.name, { ...tool.input, domBlockCount, domSource }, blocked, "medium", "blocked");
                toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: blocked });
                continue;
              }
            }
          }

          if (tool.name === "edit_component" || tool.name === "write_file" || tool.name === "create_component") {
            hasEdited = true;
            const editPath = (tool.input as any)?.componentPath || (tool.input as any)?.path || "";
            const oldText = (tool.input as any)?.old_text || "";
            const newText = (tool.input as any)?.new_text || "";
            console.log(`[Agent] Edit executed — file: ${editPath}, old_text: "${oldText.slice(0, 60)}", new_text: "${newText.slice(0, 60)}", domInspected: ${hasDOMInspection}`);
          }

          if (riskCfg.requiresApproval) {
            const categoryAr: Record<string, string> = { files: "ملفات", database: "قاعدة بيانات", system: "نظام", deploy: "نشر", security: "أمان" };
            const riskAr: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة" };
            const inputSummary = JSON.stringify(tool.input || {}).slice(0, 200);

            const [approval] = await db.insert(aiApprovalsTable).values({
              agentKey,
              userId: userId || "system",
              tool: tool.name,
              input: tool.input as any,
              explanation: `الوكيل ${agentKey} يريد تنفيذ ${tool.name}`,
              risk: riskCfg.risk,
              category: riskCfg.category,
              impact: inputSummary,
              reversible: !["trigger_deploy", "delete_file", "run_sql"].includes(tool.name),
              status: "pending",
            }).returning();

            res.write(`data: ${JSON.stringify({
              type: "approval_request",
              id: approval.id,
              tool: tool.name,
              risk: riskCfg.risk,
              category: riskCfg.category,
              input: tool.input,
              inputSummary,
              reversible: !["trigger_deploy", "delete_file", "run_sql"].includes(tool.name),
            })}\n\n`);
            fullReply += `\n⏳ طلب موافقة: ${tool.name} (${approval.id})\n`;

            await logAudit(agentKey, "approval_requested", tool.name, tool.input, { approvalId: approval.id }, riskCfg.risk, "pending");
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: `⏳ العملية ${tool.name} تنتظر موافقة المالك. رقم الطلب: ${approval.id}` });
            continue;
          }

          if (["get_page_structure", "browse_page", "screenshot_page", "scroll_page"].includes(tool.name)) {
            if (!(tool.input as any)?.lang) {
              (tool.input as any).lang = userLang;
            }
            if (!(tool.input as any)?.url && !(tool.input as any)?.path) {
              (tool.input as any).url = userCurrentPage;
              console.log(`[Agent] AUTO_CONTEXT: browse tool "${tool.name}" → using user's current page "${userCurrentPage}" lang="${userLang}"`);
            }
          }
          res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n...*${tool.name}*...\n` })}\n\n`);
          fullReply += `\n\n...*${tool.name}*...\n`;
          const result = await executeInfraTool(tool.name, tool.input, "admin");
          const durationMs = Date.now() - toolStart;

          await logAudit(agentKey, "tool_executed", tool.name, tool.input, result?.slice(0, 1000), riskCfg.risk, "success", durationMs);

          if (["get_page_structure", "browse_page", "inspect_styles"].includes(tool.name)) {
            const isConnectionError = result && (result.includes("Connection closed") || result.includes("error") && result.includes("timeout"));
            if (isConnectionError) {
              hasDOMInspection = true;
              domSource = "forced_override";
              console.log(`[Agent] DOM tool failed (Connection closed) — bypassing DOM requirement, fallback to search`);
              await logAudit(agentKey, "dom_tool_failed_bypass", tool.name, tool.input, result?.slice(0, 200), "low", "override");
            } else if (!decisionState.domTextDetected && result) {
              const toolDomText = extractDOMText(result);
              if (toolDomText) {
                decisionState.domTextDetected = true;
                decisionState.domText = toolDomText;
                console.log(`[Decision] DOM text extracted from ${tool.name}: "${toolDomText.slice(0, 50)}"`);
              }
            }
          }

          if (tool.name === "search_text") {
            const hasFileMatch = result && /\.(tsx|jsx|ts|js|css|html|vue|svelte)/.test(result) && result.length > 10;
            if (hasFileMatch) {
              searchFoundFile = true;
              console.log(`[Agent] search_text found file match — searchFoundFile=true, DOM alternative ✓`);

              if (!targetState.found) {
                const fileMatch = result.match(/([^\s]+\.(tsx|jsx|ts|js|css|html|vue|svelte))/);
                targetState.found = true;
                targetState.file = fileMatch ? fileMatch[1] : "unknown";
                targetState.stepsAfterFound = 0;
                targetState.mustEdit = true;
                targetState.commitSteps = 0;
                console.log(`[Agent] EXECUTION_COMMIT — file found. mustEdit=true, file="${targetState.file}" dom=${decisionState.domTextDetected}`);

                const execOrder = `\n\n🔧 EXECUTE_NOW — تم تحديد الملف "${targetState.file}".\n\nالخطوة التالية المطلوبة فوراً:\n1. read_file path="${targetState.file}"\n2. edit_component مع old_text و new_text\n\n⛔ لا تشرح. لا تسأل. نفّذ مباشرة.`;
                toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result + execOrder });
                continue;
              }
            } else {
              searchWithNoResults++;
              console.log(`[Agent] search_text returned no useful results — searchWithNoResults=${searchWithNoResults}/3`);
            }

            if (decisionState.domTextDetected) {
              const searchText = ((tool.input as any)?.text || "").toLowerCase();
              const searchPath = ((tool.input as any)?.path || "").toLowerCase();

              if (decisionState.domText && searchText.includes(decisionState.domText.toLowerCase().slice(0, 20))) {
                decisionState.uiSearchAttempted = true;
                console.log(`[Decision] UI search attempted ✓`);
              }

              if (searchPath.includes("i18n") || searchPath.includes("locale") || searchPath.includes("translation") || searchText.includes("t(") || searchText.includes("useTranslation")) {
                decisionState.i18nSearchAttempted = true;
                console.log(`[Decision] i18n search attempted ✓`);
              }

              if (searchPath.includes("component") || searchPath.includes("layout") || searchPath.includes("sidebar") || searchPath.includes("header") || searchPath.includes("footer") || searchPath.includes("page")) {
                decisionState.componentSearchAttempted = true;
                console.log(`[Decision] Component search attempted ✓`);
              }

              if (!hasFileMatch) {
                decisionState.failedSearchCount++;
                console.log(`[Decision] Failed search count: ${decisionState.failedSearchCount}/3`);
              }

              if (decisionState.uiSearchAttempted && decisionState.i18nSearchAttempted && decisionState.componentSearchAttempted) {
                decisionState.dbAllowed = true;
                console.log(`[Decision] All searches done — DB ALLOWED ✓`);
              }

              if (decisionState.failedSearchCount >= 3) {
                decisionState.dbAllowed = true;
                const fallbackMsg = `⚠️ تم السماح باستخدام DB بعد فشل البحث في UI (${decisionState.failedSearchCount} محاولات فاشلة)`;
                console.log(`[Decision] FALLBACK: ${fallbackMsg}`);
                await logAudit(agentKey, "decision_db_fallback", tool.name, { decisionState }, fallbackMsg, "medium", "override");
              }
            }
          }

          let parsedResult: any = null;
          try { parsedResult = JSON.parse(result); } catch {}

          if (parsedResult?.type === "screenshot" && parsedResult?.base64) {
            const ssePayload = { ...parsedResult };
            const previewBase64 = parsedResult.base64.slice(0, 200) + "...[truncated]";
            res.write(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, result: JSON.stringify({ ...ssePayload, base64: previewBase64 }), hasScreenshot: true, screenshotBase64: parsedResult.base64 })}\n\n`);

            toolResults.push({
              type: "tool_result",
              tool_use_id: tool.id,
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: parsedResult.base64,
                  },
                },
                {
                  type: "text",
                  text: parsedResult.message || `Screenshot from ${tool.name}`,
                },
              ],
            });
          } else {
            let finalContent = result;

            if (tool.name === "edit_component" && parsedResult) {
              const matchesReplaced = parsedResult.matchesReplaced ?? 0;
              const editPath = parsedResult.path || (tool.input as any)?.componentPath || "";
              if (matchesReplaced === 0 || parsedResult.success === false) {
                finalContent = `⚠️ EDIT_FAILED: التعديل لم يتم! matchesReplaced=${matchesReplaced}. الملف: ${editPath}. السبب المحتمل: old_text لا يطابق محتوى الملف بالضبط. جرّب read_file لقراءة الملف ونسخ النص الصحيح، أو انتقل للملف التالي في نتائج البحث.\n\n${result}`;
                hasEdited = false;
                console.log(`[Agent] EDIT FAILED: matchesReplaced=${matchesReplaced} in ${editPath}`);
                await logAudit(agentKey, "edit_failed", tool.name, tool.input, { matchesReplaced, path: editPath }, "medium", "failed", durationMs);
              } else {
                const oldText = ((tool.input as any)?.old_text || "").slice(0, 80);
                const newText = ((tool.input as any)?.new_text || "").slice(0, 80);

                const isUIFile = /\.(tsx|jsx|css|html|vue|svelte)$/i.test(editPath);
                let uiVerification = "";
                if (isUIFile) {
                  try {
                    const verifyResult = await executeInfraTool("screenshot_page", { path: "/" }, "admin");
                    let verifyParsed: any = null;
                    try { verifyParsed = JSON.parse(verifyResult); } catch {}
                    if (verifyParsed?.base64) {
                      res.write(`data: ${JSON.stringify({ type: "tool_result", name: "auto_verify_screenshot", result: "تم أخذ صورة للتحقق البصري", hasScreenshot: true, screenshotBase64: verifyParsed.base64 })}\n\n`);
                      uiVerification = `\n🔍 تم أخذ screenshot تلقائي للتحقق — راجع الصورة وتأكد أن التغيير "${newText}" ظاهر في الواجهة.`;
                      console.log(`[Agent] AUTO-VERIFY: Screenshot taken after edit of ${editPath}`);
                      await logAudit(agentKey, "auto_verify_screenshot", "screenshot_page", { editPath, newText }, "screenshot_taken", "low", "success");
                    } else {
                      uiVerification = `\n⚠️ لم يتمكن النظام من أخذ screenshot تلقائي. نفّذ screenshot_page يدوياً للتحقق.`;
                      console.log(`[Agent] AUTO-VERIFY FAILED: No screenshot for ${editPath}`);
                    }
                  } catch (verifyErr: any) {
                    uiVerification = `\n⚠️ فشل التحقق البصري التلقائي: ${verifyErr.message || "unknown"}. نفّذ screenshot_page يدوياً.`;
                    console.log(`[Agent] AUTO-VERIFY ERROR: ${verifyErr.message}`);
                  }
                }

                const domSourceLabels: Record<string, string> = { tool: "أداة DOM", search: "بحث نصي", user_input: "معلومات المستخدم", forced_override: "تجاوز تلقائي" };
                const domNote = hasDOMInspection
                  ? `\n📍 مصدر الحقيقة: ${domSourceLabels[domSource] || domSource} ✓`
                  : ``;
                const deployHint = `\n\n🚀 الخطوة التالية: نفّذ git_push مع message يصف التغيير لنشره على mrcodeai.com. التعديل في dev فقط لا يكفي!`;
                finalContent = `✅ EDIT_SUCCESS: تم التعديل بنجاح!\n📁 الملف: ${editPath}\n🔄 matchesReplaced: ${matchesReplaced}\n📝 قبل: "${oldText}"\n📝 بعد: "${newText}"${domNote}${uiVerification}${deployHint}\n\n${result}`;
                console.log(`[Agent] EDIT SUCCESS: matchesReplaced=${matchesReplaced} in ${editPath} | before="${oldText}" → after="${newText}" | domInspected=${hasDOMInspection} | domSource=${domSource} | domBlocks=${domBlockCount}`);
                await logAudit(agentKey, "edit_success", tool.name, { path: editPath, oldText, newText, matchesReplaced, domInspected: hasDOMInspection, domSource, domBlockCount }, result?.slice(0, 500), "medium", "success", durationMs);
              }
            } else if (tool.name === "write_file" && parsedResult) {
              const writePath = parsedResult.path || (tool.input as any)?.path || "";
              if (parsedResult.success === false) {
                finalContent = `⚠️ WRITE_FAILED: كتابة الملف فشلت! الملف: ${writePath}.\n\n${result}`;
                hasEdited = false;
                console.log(`[Agent] WRITE FAILED: ${writePath}`);
                await logAudit(agentKey, "write_failed", tool.name, tool.input, { path: writePath }, "medium", "failed", durationMs);
              } else {
                const isUIWrite = /\.(tsx|jsx|css|html|vue|svelte)$/i.test(writePath);
                let writeVerification = "";
                if (isUIWrite) {
                  try {
                    const wVerify = await executeInfraTool("screenshot_page", { path: "/" }, "admin");
                    let wParsed: any = null;
                    try { wParsed = JSON.parse(wVerify); } catch {}
                    if (wParsed?.base64) {
                      res.write(`data: ${JSON.stringify({ type: "tool_result", name: "auto_verify_screenshot", result: "تم أخذ صورة للتحقق البصري", hasScreenshot: true, screenshotBase64: wParsed.base64 })}\n\n`);
                      writeVerification = `\n🔍 تم أخذ screenshot تلقائي — تحقق من ظهور التغيير.`;
                      console.log(`[Agent] AUTO-VERIFY: Screenshot after write ${writePath}`);
                    }
                  } catch {}
                }
                const writeDeployHint = `\n\n🚀 الخطوة التالية: نفّذ git_push مع message يصف التغيير لنشره على mrcodeai.com.`;
                finalContent = `✅ WRITE_SUCCESS: تم كتابة الملف بنجاح!\n📁 الملف: ${writePath}\n📏 الحجم: ${parsedResult.size || parsedResult.newSize || "unknown"}${writeVerification}${writeDeployHint}\n\n${result}`;
                console.log(`[Agent] WRITE SUCCESS: ${writePath}`);
                await logAudit(agentKey, "write_success", tool.name, { path: writePath }, result?.slice(0, 500), "medium", "success", durationMs);
              }
            } else if (tool.name === "run_sql" && parsedResult && parsedResult.success === false) {
              finalContent = `⚠️ IMPORTANT: هذه العملية فشلت. يجب أن تُبلغ المستخدم بالفشل. ممنوع قول "تم بنجاح".\n\n${result}`;
              await logAudit(agentKey, "db_write_failed", tool.name, tool.input, result?.slice(0, 1000), "high", "failed", durationMs);
            } else if (tool.name === "search_text" && parsedResult) {
              const found = parsedResult.found;
              const matchCount = parsedResult.matchCount || 0;
              const results = parsedResult.results || [];
              const seen = new Set<string>();
              const topFiles: string[] = [];
              for (const r of results) {
                const filePath = (r as string).split(":")[0] || r;
                if (!seen.has(filePath)) {
                  seen.add(filePath);
                  topFiles.push(filePath);
                }
                if (topFiles.length >= 3) break;
              }
              const matchedVariant = parsedResult.matchedVariant || "";
              const variantNote = parsedResult.note || "";
              console.log(`[Agent] Search results: found=${found}, matchCount=${matchCount}, matchedVariant="${matchedVariant}", topFiles=${JSON.stringify(topFiles)}`);
              if (found && topFiles.length > 0) {
                hasReadAfterSearch = false;
                const safeFiles = ["i18n.tsx", "index.css", "App.tsx", "main.tsx", "index.tsx", "layout.tsx"];
                const fileNotes = topFiles.map(f => {
                  const isSafe = safeFiles.some(sf => f.endsWith(sf));
                  const isUI = /\.(tsx|jsx|css|html|vue|svelte)$/i.test(f);
                  let note = isUI ? "📄 واجهة" : "📋 خلفية";
                  if (isSafe) note += " ✅ (مستخدم دائماً)";
                  return `  ${f} — ${note}`;
                }).join("\n");
                const variantHint = matchedVariant && matchedVariant !== (tool.input as any)?.text
                  ? `\n\n⚠️ هام: النص وُجد بالشكل "${matchedVariant}" — استخدم هذا الشكل بالضبط في old_text عند edit_component!`
                  : "";
                finalContent = `${result}\n\n💡 ملفات مرشحة (أفضل 3 بدون تكرار):\n${fileNotes}${variantHint}\n\n⚠️ تأكد أن الملف المختار مستورد (import) في صفحة أو layout قبل التعديل.\nالأولوية: (1) exact match (2) ملف واجهة tsx/jsx مستورد (3) اسم يدل على المكان.\nثم نفّذ read_file على الملف المختار.`;
              }
            }

            if (tool.name === "git_push" && parsedResult?.success) {
              const bTag = parsedResult.backupTag || "unknown";
              finalContent = `${result}\n\n✅ تم الدفع لـ GitHub بنجاح! CI/CD يعمل الآن.\n🏷️ Backup tag: ${bTag}\n⏳ النشر على mrcodeai.com يستغرق ~3 دقائق.\n💡 نفّذ deploy_status للتحقق، ثم verify_production مع النص المتوقع للتأكد من ظهوره.`;
              console.log(`[Agent] GIT_PUSH SUCCESS — backup: ${bTag}`);
              await logAudit(agentKey, "git_push_success", tool.name, { ...tool.input, backupTag: bTag }, result?.slice(0, 500), "high", "success", durationMs);
            } else if (tool.name === "git_push" && parsedResult?.success === false) {
              finalContent = `${result}\n\n❌ فشل الدفع لـ GitHub: ${parsedResult.error?.slice(0, 200)}`;
              console.log(`[Agent] GIT_PUSH FAILED: ${parsedResult.error?.slice(0, 200)}`);
              await logAudit(agentKey, "git_push_failed", tool.name, tool.input, parsedResult.error?.slice(0, 500), "high", "failed", durationMs);
            } else if (tool.name === "git_commit" && parsedResult) {
              finalContent = parsedResult.nothingToCommit
                ? `${result}\n\n📝 لا توجد تغييرات جديدة. نفّذ git_push مباشرة.`
                : `${result}\n\n✅ تم حفظ التغييرات محلياً. نفّذ git_push الآن لنشرها.`;
            } else if (tool.name === "verify_production" && parsedResult) {
              if (parsedResult.found) {
                finalContent = `${result}\n\n✅ تم التحقق: النص موجود في الإنتاج (${parsedResult.url}).\nالتعديل ناجح ومنشور!`;
                console.log(`[Agent] VERIFY_PRODUCTION: FOUND at ${parsedResult.url}`);
                await logAudit(agentKey, "verify_production_success", tool.name, tool.input, { found: true, url: parsedResult.url }, "low", "success", durationMs);
              } else {
                finalContent = `${result}\n\n❌ التحقق فشل: النص غير موجود في ${parsedResult.url}.\nالتعديل لم يظهر في الإنتاج بعد. قد يحتاج CI/CD وقتاً إضافياً. جرّب مرة أخرى بعد دقيقتين.`;
                console.log(`[Agent] VERIFY_PRODUCTION: NOT FOUND at ${parsedResult.url}`);
                await logAudit(agentKey, "verify_production_failed", tool.name, tool.input, { found: false, url: parsedResult.url }, "medium", "failed", durationMs);
              }
            } else if (tool.name === "rollback_deploy" && parsedResult) {
              if (parsedResult.success) {
                finalContent = `${result}\n\n✅ تم التراجع والنشر بنجاح. الموقع سيعود للنسخة السابقة خلال ~3 دقائق.`;
                await logAudit(agentKey, "rollback_success", tool.name, tool.input, result?.slice(0, 500), "high", "success", durationMs);
              } else {
                finalContent = `${result}\n\n❌ فشل التراجع: ${parsedResult.error?.slice(0, 200)}`;
                await logAudit(agentKey, "rollback_failed", tool.name, tool.input, parsedResult.error?.slice(0, 500), "high", "failed", durationMs);
              }
            }

            const enrichedTools = ["edit_component", "write_file", "search_text", "run_sql", "git_push", "git_commit", "verify_production", "rollback_deploy"];
            const sseContent = enrichedTools.includes(tool.name) ? finalContent.slice(0, 5000) : result.slice(0, 5000);
            res.write(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, result: sseContent })}\n\n`);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: finalContent });
          }
        }
        chatMsgs.push({ role: "user", content: toolResults });
      }

      console.log(`[Agent] Session complete: toolActions=${toolActionCount}, searchCount=${searchCount}, hasEdited=${hasEdited}, queries=${JSON.stringify(searchQueries)}`);
      await logAudit(agentKey, "session_summary", "system", {
        toolActionCount,
        searchCount,
        hasEdited,
        searchQueries,
      }, { fullReplyLength: fullReply.length }, "low", hasEdited ? "success" : "completed");

    } else if (slot.provider === "google") {
      const { getGoogleClient } = await import("../lib/agents/ai-clients");
      const client = await getGoogleClient();
      const chatMsgs = conversationMessages.map(m => ({
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: m.content }],
      }));
      const response = await client.models.generateContentStream({
        model: slot.model,
        contents: chatMsgs,
        config: {
          systemInstruction: infraSystemPrompt,
          maxOutputTokens: slot.maxTokens || 16000,
          temperature: parseFloat(String(config.creativity)) || 0.3,
        },
      });
      for await (const chunk of response as any) {
        const text = chunk.text;
        if (text) {
          fullReply += text;
          res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
        }
      }
      tokensUsed = Math.ceil(fullReply.length / 3);
    } else if (slot.provider === "openai") {
      const { getOpenAIClient } = await import("../lib/agents/ai-clients");
      const client = await getOpenAIClient();
      const msgs: any[] = [
        { role: "system", content: infraSystemPrompt },
        ...conversationMessages.map(m => ({ role: m.role, content: m.content })),
      ];
      const isReasoningModel = slot.model.startsWith("o1") || slot.model.startsWith("o3");
      const stream = await client.chat.completions.create({
        model: slot.model,
        max_completion_tokens: slot.maxTokens || 16000,
        messages: msgs,
        stream: true,
        ...(isReasoningModel ? {} : { temperature: parseFloat(String(config.creativity)) || 0.5 }),
      });
      for await (const chunk of stream as any) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          fullReply += delta;
          res.write(`data: ${JSON.stringify({ type: "chunk", text: delta })}\n\n`);
        }
      }
      tokensUsed = Math.ceil(fullReply.length / 3);
    }

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: fullReply });
    if (history.length > 40) history.splice(0, history.length - 40);
    infraSessions.set(sKey, history);

    const cost = tokensUsed * 0.000015;
    res.write(`data: ${JSON.stringify({ type: "done", tokensUsed, cost, model: slot.model })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("[Infra Chat Error]", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message } });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    }
  }
});

router.get("/ai/approvals", requireInfraAdmin, async (_req, res) => {
  try {
    const approvals = await db.select().from(aiApprovalsTable).orderBy(desc(aiApprovalsTable.createdAt)).limit(100);
    res.json({ approvals });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message } });
  }
});

router.get("/ai/approvals/pending", requireInfraAdmin, async (_req, res) => {
  try {
    const pending = await db.select().from(aiApprovalsTable).where(eq(aiApprovalsTable.status, "pending")).orderBy(desc(aiApprovalsTable.createdAt));
    res.json({ approvals: pending });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message } });
  }
});

router.post("/ai/approve/:id", requireInfraAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [approval] = await db.select().from(aiApprovalsTable).where(eq(aiApprovalsTable.id, id));
    if (!approval) return res.status(404).json({ error: { message: "طلب غير موجود" } });
    if (approval.status !== "pending") return res.status(400).json({ error: { message: `الطلب ${approval.status} بالفعل` } });

    const result = await executeInfraTool(approval.tool, approval.input as any, "admin");

    await db.update(aiApprovalsTable).set({
      status: "approved",
      decidedBy: (req as any).user?.email || "admin",
      decidedAt: new Date(),
      executionResult: { output: result?.slice(0, 2000) },
    }).where(eq(aiApprovalsTable.id, id));

    await logAudit(approval.agentKey, "approval_executed", approval.tool, approval.input, result?.slice(0, 1000), approval.risk, "approved", undefined, id);
    res.json({ status: "approved", result: result?.slice(0, 5000) });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message } });
  }
});

router.post("/ai/reject/:id", requireInfraAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [approval] = await db.select().from(aiApprovalsTable).where(eq(aiApprovalsTable.id, id));
    if (!approval) return res.status(404).json({ error: { message: "طلب غير موجود" } });
    if (approval.status !== "pending") return res.status(400).json({ error: { message: `الطلب ${approval.status} بالفعل` } });

    await db.update(aiApprovalsTable).set({
      status: "rejected",
      decidedBy: (req as any).user?.email || "admin",
      decidedAt: new Date(),
    }).where(eq(aiApprovalsTable.id, id));

    await logAudit(approval.agentKey, "approval_rejected", approval.tool, approval.input, "rejected by admin", approval.risk, "rejected", undefined, id);
    res.json({ status: "rejected" });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message } });
  }
});

router.get("/ai/audit-logs", requireInfraAdmin, async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit)) || 100;
    const logs = await db.select().from(aiAuditLogsTable).orderBy(desc(aiAuditLogsTable.createdAt)).limit(limit);
    res.json({ logs });
  } catch (e: any) {
    res.status(500).json({ error: { message: e.message } });
  }
});

router.get("/ai/kill-switch", requireInfraAdmin, async (_req, res) => {
  res.json({ enabled: getInfraAccessEnabled() });
});

router.post("/ai/kill-switch", requireInfraAdmin, async (req, res) => {
  const { enabled } = req.body;
  await setInfraAccessEnabled(!!enabled);
  await logAudit("system", enabled ? "kill_switch_off" : "kill_switch_on", "system", { enabled }, null, "critical", "success");
  res.json({ enabled: getInfraAccessEnabled() });
});

router.post("/infra/director-stream", requireInfraAdmin, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { message } = req.body as { message: string };

    if (!message?.trim()) {
      res.status(400).json({ error: { message: "Message is required" } });
      return;
    }

    const [config] = await db.select().from(agentConfigsTable)
      .where(and(eq(agentConfigsTable.agentKey, "infra_sysadmin"), eq(agentConfigsTable.agentLayer, "infra")))
      .limit(1);

    if (!config || !config.enabled) {
      res.status(404).json({ error: { message: "System Director not found or disabled" } });
      return;
    }

    const blueprint = getSystemBlueprint();

    const allAgents = await db.select({
      agentKey: agentConfigsTable.agentKey,
      displayNameAr: agentConfigsTable.displayNameAr,
      displayNameEn: agentConfigsTable.displayNameEn,
      enabled: agentConfigsTable.enabled,
      description: agentConfigsTable.description,
      agentLayer: agentConfigsTable.agentLayer,
    }).from(agentConfigsTable);

    const agentStatusReport = allAgents.map(a =>
      `- ${a.displayNameAr} (${a.agentKey}) [${a.agentLayer}] — ${a.enabled ? "✅ فعّال" : "❌ معطّل"} — ${a.description}`
    ).join("\n");

    const directorPrompt = `أنت مدير النظام (${config.displayNameAr} / ${config.displayNameEn}) — القائد الأعلى لمنصة Mr Code AI.

${config.description}

أنت تعمل بنظام Governor — ثلاثة نماذج ذكاء اصطناعي تحلل طلبك بالتوازي، ثم الحاكم يدمج أفضل النتائج في رد واحد نهائي دقيق جداً.

${blueprint}

## حالة الوكلاء الحالية:
${agentStatusReport}

## القواعد:
- رد بالعربية إذا المالك يتحدث بالعربية، وبالإنجليزية إذا يتحدث بالإنجليزية
- كن حازماً ومباشراً — أنت المدير مو المساعد
- ابدأ بملخص سريع للوضع ثم التفاصيل
- اذكر أسماء الملفات والمسارات بدقة
- إذا تحتاج تعديل كود، اعرض التعديل الجراحي (قبل/بعد) مع المسار ورقم السطر
- لا تخترع ملفات — اعتمد على خريطة النظام
- اقترح دائماً الخطوة التالية

${config.instructions || ""}
${config.permissions && Array.isArray(config.permissions) && config.permissions.length > 0 ? `\nصلاحياتك: ${config.permissions.join(", ")}` : ""}`;

    const sKey = `infra_${userId}_infra_sysadmin`;
    const history = infraSessions.get(sKey) || [];

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const conversationMessages = [
      ...history.slice(-20),
      { role: "user" as const, content: message },
    ];

    const slots: Array<{ provider: string; model: string; maxTokens: number; timeoutSeconds: number }> = [];
    const primary = config.primaryModel;
    if (primary?.enabled) slots.push({ provider: primary.provider, model: primary.model, maxTokens: primary.maxTokens || 64000, timeoutSeconds: primary.timeoutSeconds || 300 });
    const secondary = config.secondaryModel as any;
    if (secondary?.enabled) slots.push({ provider: secondary.provider, model: secondary.model, maxTokens: secondary.maxTokens || 32000, timeoutSeconds: secondary.timeoutSeconds || 120 });
    const tertiary = config.tertiaryModel as any;
    if (tertiary?.enabled) slots.push({ provider: tertiary.provider, model: tertiary.model, maxTokens: tertiary.maxTokens || 32000, timeoutSeconds: tertiary.timeoutSeconds || 180 });

    if (slots.length === 0) slots.push({ provider: "anthropic", model: "claude-sonnet-4-6", maxTokens: 64000, timeoutSeconds: 300 });

    res.write(`data: ${JSON.stringify({ type: "status", message: `تشغيل ${slots.length} نموذج ذكاء اصطناعي بالتوازي...`, messageEn: `Running ${slots.length} AI models in parallel...` })}\n\n`);

    const callModel = async (provider: string, model: string, maxTokens: number, timeoutSec: number): Promise<{ content: string; tokensUsed: number; model: string; durationMs: number } | null> => {
      const start = Date.now();
      try {
        if (provider === "anthropic") {
          const { getAnthropicClient } = await import("../lib/agents/ai-clients");
          const client = await getAnthropicClient();
          const chatMsgs = conversationMessages
            .filter(m => m.role !== "system")
            .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
          const stream = client.messages.stream({
            model, max_tokens: Math.min(maxTokens, 64000), system: directorPrompt,
            messages: chatMsgs,
            temperature: Math.min(parseFloat(String(config.creativity)) || 0.5, 1.0),
          });
          const response = await stream.finalMessage();
          const text = response.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
          const tokens = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
          return { content: text, tokensUsed: tokens, model, durationMs: Date.now() - start };
        } else if (provider === "google") {
          const { getGoogleClient } = await import("../lib/agents/ai-clients");
          const client = await getGoogleClient();
          const chatMsgs = conversationMessages.map(m => ({
            role: m.role === "assistant" ? "model" as const : "user" as const,
            parts: [{ text: m.content }],
          }));
          const response = await client.models.generateContent({
            model, contents: chatMsgs,
            config: { systemInstruction: directorPrompt, maxOutputTokens: maxTokens, temperature: parseFloat(String(config.creativity)) || 0.3 },
          });
          const text = response.text || "";
          return { content: text, tokensUsed: Math.ceil(text.length / 3), model, durationMs: Date.now() - start };
        } else if (provider === "openai") {
          const { getOpenAIClient } = await import("../lib/agents/ai-clients");
          const client = await getOpenAIClient();
          const msgs: any[] = [
            { role: "system", content: directorPrompt },
            ...conversationMessages.map(m => ({ role: m.role, content: m.content })),
          ];
          const isReasoningModel = model.startsWith("o1") || model.startsWith("o3");
          const response = await client.chat.completions.create({
            model, max_completion_tokens: maxTokens, messages: msgs,
            ...(isReasoningModel ? {} : { temperature: parseFloat(String(config.creativity)) || 0.5 }),
          });
          const text = response.choices[0]?.message?.content || "";
          const tokens = (response.usage?.total_tokens ?? 0) || Math.ceil(text.length / 3);
          return { content: text, tokensUsed: tokens, model, durationMs: Date.now() - start };
        }
        return null;
      } catch (err: any) {
        console.error(`[Director] Model ${model} failed:`, err.message);
        return null;
      }
    };

    const thinkResults = await Promise.allSettled(
      slots.map(slot => {
        res.write(`data: ${JSON.stringify({ type: "status", message: `${slot.model} يحلل...`, messageEn: `${slot.model} analyzing...` })}\n\n`);
        return callModel(slot.provider, slot.model, slot.maxTokens, slot.timeoutSeconds);
      })
    );

    const successResults: Array<{ content: string; tokensUsed: number; model: string; durationMs: number }> = [];
    for (const r of thinkResults) {
      if (r.status === "fulfilled" && r.value) successResults.push(r.value);
    }

    if (successResults.length === 0) {
      res.write(`data: ${JSON.stringify({ type: "error", message: "All models failed" })}\n\n`);
      res.end();
      return;
    }

    let finalContent = "";
    let totalTokens = successResults.reduce((sum, r) => sum + r.tokensUsed, 0);
    const modelsUsed = successResults.map(r => r.model);

    if (successResults.length === 1) {
      finalContent = successResults[0].content;
      res.write(`data: ${JSON.stringify({ type: "status", message: `نموذج واحد أجاب: ${successResults[0].model}`, messageEn: `Single model responded: ${successResults[0].model}` })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ type: "status", message: `الحاكم يدمج ${successResults.length} تحليلات...`, messageEn: `Governor merging ${successResults.length} analyses...` })}\n\n`);

      const proposalsText = successResults.map((r, i) =>
        `=== تحليل ${i + 1} (من ${r.model}, ${r.durationMs}ms) ===\n${r.content}`
      ).join("\n\n");

      const governorPrompt = `أنت الحاكم (Governor) — المقيّم النهائي. استلمت تحليلات من ${successResults.length} نماذج ذكاء اصطناعي درسوا نفس الطلب.

مهمتك:
1. قيّم كل تحليل من حيث الصحة والعمق والعملية
2. حدد أفضل تشخيص وحل من كل المقترحات
3. ادمج أقوى العناصر في رد واحد نهائي موحّد
4. إذا التحليلات تختلف، اختر الأصح تقنياً
5. رد بنفس لغة المستخدم الأصلية (عربي أو إنجليزي)
6. النتيجة النهائية يجب تكون واضحة ومحددة وقابلة للتنفيذ

لا تذكر إنك حاكم أو إنك تدمج — قدّم الإجابة كأنها من مدير النظام مباشرة.`;

      const govModelConfig = config.governorModel as any;
      const govProvider = govModelConfig?.provider ?? "anthropic";
      const govModel = govModelConfig?.model ?? "claude-sonnet-4-6";
      const govMaxTokens = govModelConfig?.maxTokens ?? 64000;

      const mergePromptMsgs = [
        ...history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: `الطلب الأصلي من المالك: "${message}"\n\n${proposalsText}\n\nادمج أفضل النتائج في رد نهائي واحد:` },
      ];

      try {
        if (govProvider === "anthropic") {
          const { getAnthropicClient } = await import("../lib/agents/ai-clients");
          const client = await getAnthropicClient();
          const chatMsgs = mergePromptMsgs
            .filter(m => m.role !== "system")
            .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
          let govReply = "";
          const govStream = client.messages.stream({
            model: govModel,
            max_tokens: Math.min(govMaxTokens, 64000),
            system: governorPrompt,
            messages: chatMsgs,
            temperature: 0.3,
          });
          govStream.on("text", (text: string) => {
            govReply += text;
            res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
          });
          const govResponse = await govStream.finalMessage();
          totalTokens += (govResponse.usage?.input_tokens ?? 0) + (govResponse.usage?.output_tokens ?? 0);
          finalContent = govReply;
          modelsUsed.push(`governor:${govModel}`);
        } else if (govProvider === "google") {
          const { getGoogleClient } = await import("../lib/agents/ai-clients");
          const client = await getGoogleClient();
          const chatMsgs = mergePromptMsgs.map(m => ({
            role: m.role === "assistant" ? "model" as const : "user" as const,
            parts: [{ text: m.content }],
          }));
          const response = await client.models.generateContentStream({
            model: govModel, contents: chatMsgs,
            config: { systemInstruction: governorPrompt, maxOutputTokens: govMaxTokens, temperature: 0.3 },
          });
          let govReply = "";
          for await (const chunk of response as any) {
            const text = chunk.text;
            if (text) {
              govReply += text;
              res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
            }
          }
          totalTokens += Math.ceil(govReply.length / 3);
          finalContent = govReply;
          modelsUsed.push(`governor:${govModel}`);
        } else if (govProvider === "openai") {
          const { getOpenAIClient } = await import("../lib/agents/ai-clients");
          const client = await getOpenAIClient();
          const msgs: any[] = [
            { role: "system", content: governorPrompt },
            ...mergePromptMsgs.map(m => ({ role: m.role, content: m.content })),
          ];
          const isReasoning = govModel.startsWith("o1") || govModel.startsWith("o3");
          const stream = await client.chat.completions.create({
            model: govModel, messages: msgs, stream: true,
            ...(isReasoning ? {} : { temperature: 0.3 }),
          });
          let govReply = "";
          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || "";
            if (text) {
              govReply += text;
              res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
            }
          }
          totalTokens += Math.ceil(govReply.length / 3);
          finalContent = govReply;
          modelsUsed.push(`governor:${govModel}`);
        }
      } catch (govErr: any) {
        console.error("[Governor Error]", govErr.message);
        finalContent = successResults[0].content;
        for (const char of finalContent) {
          res.write(`data: ${JSON.stringify({ type: "chunk", text: char })}\n\n`);
        }
      }
    }

    if (successResults.length === 1) {
      for (let i = 0; i < finalContent.length; i += 3) {
        const chunk = finalContent.slice(i, i + 3);
        res.write(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`);
      }
    }

    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: finalContent });
    if (history.length > 40) history.splice(0, history.length - 40);
    infraSessions.set(sKey, history);

    const cost = totalTokens * 0.000015;
    res.write(`data: ${JSON.stringify({ type: "done", tokensUsed: totalTokens, cost, models: modelsUsed })}\n\n`);
    res.end();
  } catch (err: any) {
    console.error("[Director Error]", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message } });
    } else {
      res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
      res.end();
    }
  }
});

router.post("/infra/clear-session", requireInfraAdmin, async (req, res) => {
  const userId = req.user!.id;
  const { agentKey } = req.body;
  const sKey = `infra_${userId}_${agentKey}`;
  infraSessions.delete(sKey);
  res.json({ success: true });
});

router.post("/infra/reset/:agentKey", requireInfraAdmin, async (req, res) => {
  try {
    const { agentKey } = req.params;
    const defaultAgent = DEFAULT_INFRA_AGENTS.find(a => a.agentKey === agentKey);
    if (!defaultAgent) {
      res.status(404).json({ error: { message: "No default config for this infra agent", messageAr: "لا توجد إعدادات افتراضية لهذا الوكيل" } });
      return;
    }

    const [updated] = await db.update(agentConfigsTable)
      .set({
        displayNameEn: defaultAgent.displayNameEn,
        displayNameAr: defaultAgent.displayNameAr,
        description: defaultAgent.description,
        enabled: true,
        isCustom: false,
        governorEnabled: defaultAgent.governorEnabled,
        autoGovernor: defaultAgent.autoGovernor,
        governorModel: defaultAgent.governorModel,
        primaryModel: defaultAgent.primaryModel,
        secondaryModel: defaultAgent.secondaryModel,
        tertiaryModel: defaultAgent.tertiaryModel,
        systemPrompt: defaultAgent.systemPrompt,
        instructions: defaultAgent.instructions,
        permissions: defaultAgent.permissions,
        pipelineOrder: defaultAgent.pipelineOrder,
        receivesFrom: defaultAgent.receivesFrom,
        sendsTo: defaultAgent.sendsTo,
        roleOnReceive: defaultAgent.roleOnReceive,
        roleOnSend: defaultAgent.roleOnSend,
        tokenLimit: defaultAgent.tokenLimit,
        batchSize: defaultAgent.batchSize,
        creativity: defaultAgent.creativity,
        sourceFiles: defaultAgent.sourceFiles,
        shortTermMemory: [],
        longTermMemory: [],
        updatedAt: new Date(),
      })
      .where(eq(agentConfigsTable.agentKey, agentKey))
      .returning();

    if (!updated) {
      res.status(404).json({ error: { message: "Agent not found" } });
      return;
    }
    res.json(updated);
  } catch (error) {
    console.error("Failed to reset infra agent:", error);
    res.status(500).json({ error: { message: "Failed to reset agent config" } });
  }
});

router.post("/infra/reset-all", requireInfraAdmin, async (_req, res) => {
  try {
    const results = [];
    for (const defaultAgent of DEFAULT_INFRA_AGENTS) {
      const [updated] = await db.update(agentConfigsTable)
        .set({
          displayNameEn: defaultAgent.displayNameEn,
          displayNameAr: defaultAgent.displayNameAr,
          description: defaultAgent.description,
          enabled: true,
          isCustom: false,
          governorEnabled: defaultAgent.governorEnabled,
          autoGovernor: defaultAgent.autoGovernor,
          governorModel: defaultAgent.governorModel,
          primaryModel: defaultAgent.primaryModel,
          secondaryModel: defaultAgent.secondaryModel,
          tertiaryModel: defaultAgent.tertiaryModel,
          systemPrompt: defaultAgent.systemPrompt,
          instructions: defaultAgent.instructions,
          permissions: defaultAgent.permissions,
          pipelineOrder: defaultAgent.pipelineOrder,
          receivesFrom: defaultAgent.receivesFrom,
          sendsTo: defaultAgent.sendsTo,
          roleOnReceive: defaultAgent.roleOnReceive,
          roleOnSend: defaultAgent.roleOnSend,
          tokenLimit: defaultAgent.tokenLimit,
          batchSize: defaultAgent.batchSize,
          creativity: defaultAgent.creativity,
          sourceFiles: defaultAgent.sourceFiles,
          shortTermMemory: [],
          longTermMemory: [],
          updatedAt: new Date(),
        })
        .where(eq(agentConfigsTable.agentKey, defaultAgent.agentKey))
        .returning();
      if (updated) results.push(updated);
    }
    res.json({ success: true, count: results.length, agents: results });
  } catch (error) {
    console.error("Failed to reset all infra agents:", error);
    res.status(500).json({ error: { message: "Failed to reset all agents" } });
  }
});

router.get("/infra/defaults/:agentKey", requireInfraAdmin, (req, res) => {
  const { agentKey } = req.params;
  const defaultAgent = DEFAULT_INFRA_AGENTS.find(a => a.agentKey === agentKey);
  if (!defaultAgent) {
    res.status(404).json({ error: { message: "No defaults for this agent" } });
    return;
  }
  res.json(defaultAgent);
});

function getWorkspaceRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml")) || fs.existsSync(path.join(dir, "artifacts"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
}

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", ".cache", ".turbo", ".output",
  ".nuxt", ".next", ".svelte-kit", "__pycache__", ".DS_Store",
  ".local", ".config", "attached_assets", ".upm",
]);

const IGNORE_FILES = new Set([
  ".DS_Store", "Thumbs.db", ".npmrc",
]);

function scanDir(dirPath: string, depth: number = 0, maxDepth: number = 4): FileNode[] {
  if (depth > maxDepth) return [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const result: FileNode[] = [];
    const folders: FileNode[] = [];
    const files: FileNode[] = [];

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name) || IGNORE_FILES.has(entry.name)) continue;
      if (entry.name.startsWith(".") && entry.name !== ".agents" && entry.name !== ".github" && entry.name !== ".dockerignore" && entry.name !== ".gitignore" && entry.name !== ".gitattributes") continue;

      if (entry.isDirectory()) {
        const children = scanDir(path.join(dirPath, entry.name), depth + 1, maxDepth);
        folders.push({ name: entry.name, type: "folder", children });
      } else {
        files.push({ name: entry.name, type: "file" });
      }
    }

    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return [...folders, ...files];
  } catch {
    return [];
  }
}

router.get("/infra/files", requireInfraAdmin, (_req, res) => {
  const root = getWorkspaceRoot();
  const tree = scanDir(root);
  res.json({ root: path.basename(root), tree });
});

router.get("/infra/file-content", requireInfraAdmin, (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) {
    return res.status(400).json({ error: { message: "path query param required" } });
  }
  const root = getWorkspaceRoot();
  const fullPath = path.resolve(root, filePath);
  if (!fullPath.startsWith(root)) {
    return res.status(403).json({ error: { message: "Access denied" } });
  }
  try {
    const stat = fs.statSync(fullPath);
    if (stat.size > 500_000) {
      return res.status(413).json({ error: { message: "File too large" } });
    }
    const content = fs.readFileSync(fullPath, "utf-8");
    res.json({ path: filePath, content, size: stat.size });
  } catch {
    res.status(404).json({ error: { message: "File not found" } });
  }
});

router.post("/infra/file-rename", requireInfraAdmin, (req, res) => {
  const { oldPath, newName } = req.body;
  if (!oldPath || !newName) return res.status(400).json({ error: { message: "oldPath and newName required" } });
  const root = getWorkspaceRoot();
  const fullOld = path.resolve(root, oldPath);
  if (!fullOld.startsWith(root)) return res.status(403).json({ error: { message: "Access denied" } });
  const newPath = path.join(path.dirname(fullOld), newName);
  if (!newPath.startsWith(root)) return res.status(403).json({ error: { message: "Access denied" } });
  try {
    fs.renameSync(fullOld, newPath);
    res.json({ success: true, oldPath, newPath: path.relative(root, newPath) });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

router.post("/infra/file-create", requireInfraAdmin, (req, res) => {
  const { parentPath, name, type } = req.body;
  if (!name || !type) return res.status(400).json({ error: { message: "name and type required" } });
  const root = getWorkspaceRoot();
  const parent = parentPath ? path.resolve(root, parentPath) : root;
  if (!parent.startsWith(root)) return res.status(403).json({ error: { message: "Access denied" } });
  const fullPath = path.join(parent, name);
  if (!fullPath.startsWith(root)) return res.status(403).json({ error: { message: "Access denied" } });
  try {
    if (type === "folder") {
      fs.mkdirSync(fullPath, { recursive: true });
    } else {
      const dir = path.dirname(fullPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fullPath, "", "utf-8");
    }
    res.json({ success: true, path: path.relative(root, fullPath), type });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

router.delete("/infra/file-delete", requireInfraAdmin, (req, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: { message: "path required" } });
  const root = getWorkspaceRoot();
  const fullPath = path.resolve(root, filePath);
  if (!fullPath.startsWith(root)) return res.status(403).json({ error: { message: "Access denied" } });
  if (fullPath === root) return res.status(403).json({ error: { message: "Cannot delete root" } });
  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    res.json({ success: true, deleted: filePath });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message } });
  }
});

router.put("/infra/file-content", requireInfraAdmin, (req, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || typeof content !== "string") {
    return res.status(400).json({ error: { message: "path and content required" } });
  }
  const root = getWorkspaceRoot();
  const fullPath = path.resolve(root, filePath);
  if (!fullPath.startsWith(root)) {
    return res.status(403).json({ error: { message: "Access denied" } });
  }
  try {
    fs.writeFileSync(fullPath, content, "utf-8");
    res.json({ success: true, path: filePath, size: Buffer.byteLength(content, "utf-8") });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message || "Failed to save file" } });
  }
});

router.post("/infra/deploy-production", requireInfraAdmin, async (req, res) => {
  try {
    const ghToken = await (async () => {
      if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
      try {
        const connectorHostname = process.env.REPLIT_CONNECTORS_HOSTNAME || process.env.CONNECTORS_HOSTNAME;
        if (connectorHostname) {
          const r = await fetch(`http://${connectorHostname}/proxy/github`);
          if (r.ok) { const d = await r.json(); if (d?.access_token) return d.access_token; }
        }
      } catch {}
      try {
        const { execSync: ex } = require("child_process");
        const token = ex("git remote get-url github 2>/dev/null || git remote get-url origin 2>/dev/null", { encoding: "utf-8" }).trim();
        const match = token.match(/https:\/\/([^@]+)@github\.com/);
        if (match && match[1] && match[1].length > 10) return match[1];
      } catch {}
      return null;
    })();
    if (!ghToken) return res.status(500).json({ error: "GitHub token not available" });

    const repo = process.env.GITHUB_REPOSITORY || "jml965/ai-platform";
    const wfRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows`, {
      headers: { Authorization: `token ${ghToken}`, Accept: "application/vnd.github.v3+json" },
    });
    const workflows = await wfRes.json();
    const prodWf = workflows.workflows?.find((w: any) =>
      w.name?.toLowerCase().includes("production") || w.path?.includes("deploy-cloud-run")
    );
    if (!prodWf) return res.status(404).json({ error: "Production workflow not found" });

    const triggerRes = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${prodWf.id}/dispatches`, {
      method: "POST",
      headers: { Authorization: `token ${ghToken}`, Accept: "application/vnd.github.v3+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main" }),
    });
    if (triggerRes.status === 204) {
      return res.json({ success: true, message: "Production deployment triggered", workflow: prodWf.name });
    }
    const errBody = await triggerRes.text();
    res.status(triggerRes.status).json({ error: errBody });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/infra/deploy-status", requireInfraAdmin, async (req, res) => {
  try {
    const ghToken = await (async () => {
      if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
      try {
        const connectorHostname = process.env.REPLIT_CONNECTORS_HOSTNAME || process.env.CONNECTORS_HOSTNAME;
        if (connectorHostname) {
          const r = await fetch(`http://${connectorHostname}/proxy/github`);
          if (r.ok) { const d = await r.json(); if (d?.access_token) return d.access_token; }
        }
      } catch {}
      try {
        const { execSync: ex } = require("child_process");
        const token = ex("git remote get-url github 2>/dev/null || git remote get-url origin 2>/dev/null", { encoding: "utf-8" }).trim();
        const match = token.match(/https:\/\/([^@]+)@github\.com/);
        if (match && match[1] && match[1].length > 10) return match[1];
      } catch {}
      return null;
    })();
    if (!ghToken) return res.status(500).json({ error: "GitHub token not available" });

    const repo = process.env.GITHUB_REPOSITORY || "jml965/ai-platform";
    const runsRes = await fetch(`https://api.github.com/repos/${repo}/actions/runs?per_page=5`, {
      headers: { Authorization: `token ${ghToken}`, Accept: "application/vnd.github.v3+json" },
    });
    const data = await runsRes.json();
    const runs = (data.workflow_runs || []).map((r: any) => ({
      id: r.id, name: r.name, status: r.status, conclusion: r.conclusion,
      created: r.created_at, url: r.html_url,
    }));
    res.json({ runs });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
