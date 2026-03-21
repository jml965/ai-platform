import { Router } from "express";
import { db } from "@workspace/db";
import { agentConfigsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { getSystemBlueprint } from "../lib/system-blueprint";
import { INFRA_TOOLS, executeInfraTool, getInfraAccessEnabled, setInfraAccessEnabled } from "../lib/agents/strategic-agent";
const router = Router();

function requireInfraAdmin(req: any, res: any, next: any) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: { message: "Admin access required" } });
  }
  next();
}

const DEFAULT_INFRA_AGENTS = [
  {
    agentKey: "infra_sysadmin",
    displayNameEn: "System Director",
    displayNameAr: "مدير النظام",
    description: "القائد الأعلى للمنصة — يدير كل الوكلاء ويوزع المهام ويشرف على كامل البنية التحتية",
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

⚠️ قاعدة حاسمة — أنت تملك أدوات حقيقية (tools):
- system_status, read_file, write_file, db_query, db_tables, exec_command, get_env, set_env
- list_components, view_page_source, edit_component, create_component
- screenshot_page, click_element, type_text, hover_element, inspect_styles
- get_page_structure, scroll_page, get_console_errors, get_network_requests
- trigger_deploy, deploy_status, github_api, browse_page, site_health
- remote_server_api: استدعاء أي API على سيرفر الإنتاج (Cloud Run)
- git_push: رفع التغييرات على GitHub (فقط عند طلب المالك صراحة)

⛔ قواعد مطلقة:
1. يجب استخدام tool_use لتنفيذ أي عملية. ممنوع كتابة أوامر bash أو "code.sh" في النص.
2. لا تتظاهر بالتنفيذ أبداً — استخدم أدواتك الحقيقية أو قل لا أستطيع.
3. لا تكتب مخرجات وهمية — كل نتيجة يجب أن تأتي من أداة حقيقية.
4. عند سؤالك عن ملفات → استخدم read_file. عن قاعدة البيانات → db_query. عن الموقع → screenshot_page.
5. أنت منفّذ حقيقي بصلاحيات كاملة على: الملفات، قاعدة البيانات، البيئة، المتصفح، السيرفر، والنشر.`,
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
- وكيل النشر (infra_deploy): النشر والتحديثات`,
    permissions: ["manage_agents", "read_all_files", "write_files", "restart_services", "database_read", "database_write", "deploy", "security_scan", "full_system_access"],
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
    agentKey: "infra_monitor",
    displayNameEn: "System Monitor",
    displayNameAr: "وكيل مراقبة النظام",
    description: "يراقب أداء المنصة — الذاكرة، المعالج، الأخطاء، أوقات الاستجابة، وصحة الخدمات",
    primaryModel: { provider: "google", model: "gemini-2.5-flash", enabled: true, creativity: 0.3, timeoutSeconds: 120, maxTokens: 8000 },
    secondaryModel: { provider: "openai", model: "gpt-4o-mini", enabled: false, creativity: 0.3, timeoutSeconds: 120, maxTokens: 8000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل مراقبة النظام لمنصة Mr Code AI.
مهمتك مراقبة صحة المنصة وتقديم تقارير فورية عن:
- استخدام الذاكرة والمعالج
- أوقات استجابة API
- الأخطاء والتحذيرات في السجلات
- حالة قاعدة البيانات والاتصالات
- أداء الوكلاء الآخرين

قدّم التقارير بشكل مختصر ومنظم باستخدام جداول وأرقام.`,
    instructions: `## مهام المراقبة الأساسية

1. **صحة الخدمات**: تأكد أن API Server و Website Builder يعملان
2. **قاعدة البيانات**: راقب عدد الاتصالات والاستعلامات البطيئة
3. **الأخطاء**: افحص سجلات الأخطاء وصنّفها حسب الخطورة
4. **الأداء**: قِس أوقات الاستجابة للمسارات الرئيسية
5. **التنبيهات**: أبلغ فوراً عن أي شيء غير طبيعي`,
    permissions: ["read_all_files", "database_read", "view_logs", "check_health", "monitor_performance"],
    pipelineOrder: 2,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل طلبات فحص الأداء وتقارير الحالة من مدير النظام",
    roleOnSend: "يرسل تقارير المراقبة والتنبيهات لمدير النظام",
    tokenLimit: 30000,
    batchSize: 5,
    creativity: "0.20",
    sourceFiles: [
      "artifacts/api-server/src/index.ts",
      "artifacts/api-server/src/routes/index.ts",
    ],
  },
  {
    agentKey: "infra_bugfixer",
    displayNameEn: "Surgical Bug Fixer",
    displayNameAr: "المصلح الجراحي",
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
    pipelineOrder: 3,
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
    displayNameAr: "وكيل التطوير",
    description: "يبني ميزات جديدة للمنصة — من الفكرة إلى الكود الكامل (واجهة + خلفية)",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.7, timeoutSeconds: 300, maxTokens: 32000 },
    secondaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل تطوير الميزات لمنصة Mr Code AI.
مهمتك بناء ميزات جديدة كاملة — من التصميم المعماري إلى الكود النهائي.

عند بناء ميزة جديدة:
1. خطط البنية أولاً (أي ملفات ستتأثر)
2. ابدأ بالخلفية (API routes, DB schema)
3. ثم الواجهة (React components)
4. تأكد من التكامل بين الأجزاء

القواعد التقنية:
- Express + TypeScript للخلفية
- React + Tailwind + Wouter للواجهة
- Drizzle ORM لقاعدة البيانات
- لا axios، لا shadcn/radix/mui`,
    instructions: `## بناء ميزات جديدة

### البنية المعمارية:
- الخلفية: artifacts/api-server/src/routes/
- الواجهة: artifacts/website-builder/src/pages/
- قاعدة البيانات: lib/db/src/schema/

### خطوات التطوير:
1. تحليل المتطلبات
2. تصميم الجداول إن لزم (Drizzle schema)
3. بناء API endpoints
4. بناء واجهة React
5. ربط الواجهة بالخلفية
6. التأكد من دعم العربية والإنجليزية`,
    permissions: ["read_all_files", "write_files", "create_files", "database_read", "database_write", "install_packages"],
    pipelineOrder: 4,
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
    ],
  },
  {
    agentKey: "infra_ui",
    displayNameEn: "UI Updater",
    displayNameAr: "وكيل التصميم",
    description: "يحسّن واجهات المستخدم — الألوان، التخطيط، التجاوب، وتجربة المستخدم",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.8, timeoutSeconds: 240, maxTokens: 32000 },
    secondaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.8, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل تصميم الواجهات لمنصة Mr Code AI.
متخصص في:
- تحسين تصميم صفحات React مع Tailwind CSS
- إضافة تأثيرات حركية جميلة
- ضمان التجاوب مع الجوال والشاشات الكبيرة
- دعم RTL للعربية و LTR للإنجليزية
- تحسين تجربة المستخدم (UX)

القواعد:
- استخدم Tailwind فقط (لا CSS modules أو styled-components)
- Dark theme أساسي (خلفية #0d1117)
- ألوان أساسية: cyan-400, emerald-400, purple-400
- أيقونات من lucide-react فقط`,
    instructions: `## قواعد التصميم

### الثيم:
- خلفية: bg-[#0d1117] أو bg-[#161b22]
- حدود: border-[#1c2333] أو border-white/10
- نصوص: text-[#e1e4e8] (رئيسي) / text-[#8b949e] (ثانوي)
- تأثيرات: hover:bg-[#1c2333], transition-colors

### التجاوب:
- استخدم grid و flex
- نقاط كسر: sm, md, lg, xl
- الجوال أولاً (mobile-first)

### RTL:
- استخدم ms-/me- بدل ml-/mr-
- استخدم start/end بدل left/right`,
    permissions: ["read_all_files", "write_files", "modify_styles", "improve_ux", "responsive_design"],
    pipelineOrder: 5,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل طلبات تحسين الواجهات مع لقطات أو وصف المشكلة",
    roleOnSend: "يسلّم كود React/Tailwind المحدّث مع معاينة التغييرات",
    tokenLimit: 60000,
    batchSize: 5,
    creativity: "0.80",
    sourceFiles: [
      "artifacts/website-builder/src/pages/InfraPanel.tsx",
      "artifacts/website-builder/src/pages/Dashboard.tsx",
      "artifacts/website-builder/src/pages/AgentManagement.tsx",
    ],
  },
  {
    agentKey: "infra_db",
    displayNameEn: "Database Manager",
    displayNameAr: "وكيل قاعدة البيانات",
    description: "يدير قاعدة البيانات — الجداول، الاستعلامات، الأداء، والنسخ الاحتياطي",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.3, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "google", model: "gemini-2.5-flash", enabled: false, creativity: 0.3, timeoutSeconds: 120, maxTokens: 8000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت مدير قاعدة البيانات لمنصة Mr Code AI.
المنصة تستخدم PostgreSQL مع Drizzle ORM.

مسؤولياتك:
- تصميم وتعديل الجداول (schema)
- كتابة استعلامات SQL مُحسّنة
- تحليل أداء قاعدة البيانات
- إدارة العلاقات بين الجداول
- النسخ الاحتياطي واستعادة البيانات

القواعد:
- استخدم Drizzle ORM دائماً لتعريف الجداول
- لا تغيّر نوع أعمدة المفاتيح الأساسية (serial/varchar)
- استخدم db:push للمزامنة — لا تكتب migrations يدوية
- حافظ على الأداء مع indexes مناسبة`,
    instructions: `## بنية قاعدة البيانات

### الملفات:
- Schema: lib/db/src/schema/
- Connection: lib/db/src/index.ts

### الجداول الرئيسية:
- users: المستخدمين والأدوار
- projects: المشاريع
- project_files: ملفات المشاريع
- agent_configs: إعدادات الوكلاء
- ai_providers: مزودي الذكاء الاصطناعي

### قواعد السلامة:
- لا تحذف جداول بدون تأكيد
- لا تغيّر أنواع الأعمدة الأساسية
- استخدم transactions للعمليات المعقدة`,
    permissions: ["database_read", "database_write", "manage_schema", "optimize_queries", "backup_restore"],
    pipelineOrder: 6,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل طلبات تعديل قاعدة البيانات أو استعلامات تحليلية",
    roleOnSend: "يسلّم نتائج الاستعلامات أو تأكيد التعديلات مع شرح التغييرات",
    tokenLimit: 50000,
    batchSize: 5,
    creativity: "0.20",
    sourceFiles: [
      "lib/db/src/schema/agent-configs.ts",
      "lib/db/src/schema/projects.ts",
      "lib/db/src/index.ts",
    ],
  },
  {
    agentKey: "infra_security",
    displayNameEn: "Security Guard",
    displayNameAr: "وكيل الأمان",
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
    permissions: ["read_all_files", "security_scan", "audit_permissions", "check_secrets", "vulnerability_scan"],
    pipelineOrder: 7,
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
    displayNameEn: "Deployment Agent",
    displayNameAr: "وكيل النشر",
    description: "يدير عمليات النشر والتحديث — بناء المشروع، فحص الجاهزية، والنشر للإنتاج",
    primaryModel: { provider: "google", model: "gemini-2.5-flash", enabled: true, creativity: 0.3, timeoutSeconds: 180, maxTokens: 8000 },
    secondaryModel: { provider: "openai", model: "gpt-4o-mini", enabled: false, creativity: 0.3, timeoutSeconds: 120, maxTokens: 8000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل النشر والتحديث لمنصة Mr Code AI.
مهمتك إدارة عمليات النشر بأمان.

مسؤولياتك:
- فحص جاهزية المشروع للنشر
- التأكد من عدم وجود أخطاء قبل النشر
- إدارة بيئات التطوير والإنتاج
- متابعة حالة النشر وتقديم التقارير
- التراجع عن النشر في حالة المشاكل

القواعد:
- لا تنشر بدون فحص كامل
- تأكد من متغيرات البيئة (env variables)
- افحص البناء (build) قبل النشر
- وثّق كل عملية نشر`,
    instructions: `## عمليات النشر

### قبل النشر:
1. تأكد أن كل الاختبارات تمر
2. افحص متغيرات البيئة
3. تأكد من سلامة قاعدة البيانات
4. افحص البناء محلياً

### أثناء النشر:
1. ابدأ بالخلفية أولاً (API Server)
2. ثم الواجهة (Website Builder)
3. تأكد من صحة الاتصالات

### بعد النشر:
1. افحص الصحة (health check)
2. تأكد من عمل المسارات الرئيسية
3. راقب السجلات لأول 5 دقائق`,
    permissions: ["read_all_files", "deploy", "restart_services", "check_health", "rollback"],
    pipelineOrder: 8,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل أمر النشر مع تفاصيل ما تم تحديثه",
    roleOnSend: "يرسل تقرير النشر مع الحالة والتفاصيل",
    tokenLimit: 30000,
    batchSize: 3,
    creativity: "0.20",
    sourceFiles: [
      "artifacts/api-server/src/index.ts",
      "artifacts/website-builder/vite.config.ts",
    ],
  },
  {
    agentKey: "infra_qa",
    displayNameEn: "QA & Testing Agent",
    displayNameAr: "وكيل الاختبار والجودة",
    description: "يختبر الميزات والصفحات — يكتشف الأخطاء، يتحقق من التجاوب، ويضمن جودة تجربة المستخدم",
    primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6", enabled: true, creativity: 0.4, timeoutSeconds: 240, maxTokens: 16000 },
    secondaryModel: { provider: "openai", model: "gpt-4o", enabled: false, creativity: 0.4, timeoutSeconds: 240, maxTokens: 16000 },
    tertiaryModel: null,
    governorEnabled: false,
    autoGovernor: false,
    governorModel: null,
    systemPrompt: `أنت وكيل الاختبار وضمان الجودة لمنصة Mr Code AI.
مهمتك اختبار كل شيء في المنصة والتأكد من أنه يعمل بشكل صحيح.

مسؤولياتك:
- اختبار الصفحات والمسارات (هل تفتح؟ هل تعرض البيانات؟)
- اختبار النماذج (forms) والأزرار والتفاعلات
- التحقق من التجاوب (الجوال والشاشات الكبيرة)
- اختبار API endpoints (هل ترد بالشكل الصحيح؟)
- فحص حالات الخطأ (ماذا يحدث عند إدخال بيانات خاطئة؟)
- التأكد من دعم العربية والإنجليزية (RTL/LTR)
- اختبار الأداء وسرعة التحميل

قدّم تقاريرك بتصنيف: ✅ نجح / ❌ فشل / ⚠️ تحذير
مع وصف واضح لخطوات إعادة الإنتاج لكل مشكلة.`,
    instructions: `## خطة الاختبار

### 1. اختبار الصفحات:
- الصفحة الرئيسية (/)
- لوحة التحكم (/dashboard)
- منشئ المشاريع (/project/:id)
- إدارة الوكلاء (/agents)
- البنية التحتية (/infra)
- الفوترة (/billing)
- الفرق (/teams)

### 2. اختبار API:
- GET /api/projects — قائمة المشاريع
- POST /api/projects — إنشاء مشروع
- GET /api/agents/configs — إعدادات الوكلاء
- POST /api/infra/chat-stream — محادثة الوكلاء

### 3. قائمة التحقق:
- [ ] هل كل الصفحات تفتح بدون أخطاء؟
- [ ] هل النماذج ترسل البيانات صحيحياً؟
- [ ] هل RTL يعمل في العربية؟
- [ ] هل التصميم متجاوب مع الجوال؟
- [ ] هل رسائل الخطأ واضحة ومفيدة؟`,
    permissions: ["read_all_files", "test_endpoints", "check_ui", "validate_forms", "test_responsive", "check_accessibility"],
    pipelineOrder: 9,
    receivesFrom: "infra_sysadmin",
    sendsTo: "infra_sysadmin",
    roleOnReceive: "يستقبل طلبات اختبار ميزات أو صفحات محددة",
    roleOnSend: "يرسل تقرير الاختبار مع النتائج والمشاكل المكتشفة",
    tokenLimit: 50000,
    batchSize: 5,
    creativity: "0.30",
    sourceFiles: [
      "artifacts/website-builder/src/App.tsx",
      "artifacts/website-builder/src/pages/Dashboard.tsx",
      "artifacts/api-server/src/routes/index.ts",
    ],
  },
];

async function seedInfraAgents() {
  try {
    const existing = await db.select({ agentKey: agentConfigsTable.agentKey })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.agentLayer, "infra"));
    const existingKeys = new Set(existing.map(a => a.agentKey));

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
        const [current] = await db.select({ receivesFrom: agentConfigsTable.receivesFrom, sourceFiles: agentConfigsTable.sourceFiles })
          .from(agentConfigsTable).where(eq(agentConfigsTable.agentKey, agent.agentKey)).limit(1);
        if (current && !current.receivesFrom && (!current.sourceFiles || (Array.isArray(current.sourceFiles) && current.sourceFiles.length === 0))) {
          await db.update(agentConfigsTable).set({
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
            description: agent.description,
            systemPrompt: agent.systemPrompt,
          }).where(eq(agentConfigsTable.agentKey, agent.agentKey));
        }
      }
    }
    console.log("[Infra] Seeded/updated infra agent defaults");
  } catch (err: any) {
    console.error("[Infra] Seed error:", err.message);
  }
}

seedInfraAgents();

const infraSessions = new Map<string, { role: "user" | "assistant"; content: string }[]>();

router.get("/infra/access-status", requireInfraAdmin, (_req, res) => {
  res.json({ enabled: getInfraAccessEnabled() });
});

router.post("/infra/access-toggle", requireInfraAdmin, (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: { message: "enabled must be a boolean" } });
  }
  setInfraAccessEnabled(enabled);
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
    const { agentKey, message } = req.body as { agentKey: string; message: string };

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

${blueprint}

أنت تعمل في بيئة حقيقية — لديك وصول مباشر لقاعدة البيانات، الملفات، الطرفية، والبنية التحتية.
لديك الأدوات التالية التي تعمل فعلياً على السيرفر الحقيقي:
- db_query: تنفيذ أي استعلام SQL حقيقي على قاعدة البيانات
- db_tables: عرض جداول قاعدة البيانات الحقيقية
- read_file: قراءة ملفات المشروع الحقيقية
- write_file: كتابة وتعديل الملفات
- exec_command: تنفيذ أوامر shell حقيقية
- system_status: حالة النظام الفعلية
- list_components: عرض مكونات الواجهة
- get_env / set_env: إدارة متغيرات البيئة
- trigger_deploy / deploy_status: إدارة النشر
- github_api: التعامل مع GitHub API

استخدم أدواتك دائماً للحصول على بيانات حقيقية. لا تتخيل أو تفترض — نفّذ واعرض النتائج الفعلية.

القواعد:
- رد بالعربية إذا المالك يتحدث بالعربية، وبالإنجليزية إذا يتحدث بالإنجليزية
- كن مختصراً ومباشراً
- اذكر أسماء الملفات والمسارات بدقة
- إذا تحتاج تعديل كود، اكتب الكود الكامل مع المسار
- استخدم markdown code blocks لأي كود
- عند كتابة خطة أو وثيقة، اكتبها داخل code block واحد بصيغة markdown حتى يحفظها المالك كملف
- اكتب الخطة بأسلوب احترافي: عنوان رئيسي، أقسام مرقمة، مخططات ASCII للبنية والتدفقات، تفاصيل كل مرحلة (الوكيل، النموذج، المدخل، المخرج)، أمثلة عملية، شجرة ملفات
- لا تكتب خطة مختصرة — اجعلها شاملة ومفصلة وجاهزة للتنفيذ
- لا تخترع ملفات غير موجودة — استخدم أدواتك للتحقق
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

    const conversationMessages = [
      ...history.slice(-20),
      { role: "user" as const, content: message },
    ];

    if (slot.provider === "anthropic") {
      const { getAnthropicClient } = await import("../lib/agents/ai-clients");
      const client = await getAnthropicClient();
      const chatMsgs: any[] = conversationMessages
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

      const maxLoops = 15;
      for (let loop = 0; loop < maxLoops; loop++) {
        const stream = client.messages.stream({
          model: slot.model,
          max_tokens: Math.min(slot.maxTokens || 32000, 64000),
          system: infraSystemPrompt,
          messages: chatMsgs,
          tools: INFRA_TOOLS as any,
          temperature: Math.min(parseFloat(String(config.creativity)) || 0.5, 1.0),
        });

        let currentText = "";
        stream.on("text", (text: string) => {
          currentText += text;
          fullReply += text;
          res.write(`data: ${JSON.stringify({ type: "chunk", text })}\n\n`);
        });

        const response = await stream.finalMessage();
        tokensUsed += (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

        const toolUseBlocks = response.content.filter((b: any) => b.type === "tool_use");
        if (response.stop_reason !== "tool_use" || toolUseBlocks.length === 0) break;

        chatMsgs.push({ role: "assistant", content: response.content });

        const toolResults: any[] = [];
        for (const tool of toolUseBlocks) {
          res.write(`data: ${JSON.stringify({ type: "chunk", text: `\n\n...*${tool.name}*...\n` })}\n\n`);
          fullReply += `\n\n...*${tool.name}*...\n`;
          const result = await executeInfraTool(tool.name, tool.input, "admin");

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
            res.write(`data: ${JSON.stringify({ type: "tool_result", name: tool.name, result: result.slice(0, 5000) })}\n\n`);
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
          }
        }
        chatMsgs.push({ role: "user", content: toolResults });
      }
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

export default router;
