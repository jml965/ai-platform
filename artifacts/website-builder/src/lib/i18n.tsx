import React, { createContext, useContext, useEffect, useState } from "react";

const en = {
  login_title: "Build your dream website",
  login_subtitle: "Describe what you want, and our AI agents will build it for you in seconds.",
  sign_in: "Sign in with Replit",
  dashboard: "Dashboard",
  new_project: "New Project",
  projects: "Your Projects",
  no_projects: "No projects yet. Create one to get started!",
  create: "Create",
  cancel: "Cancel",
  project_name: "Project Name",
  project_desc: "Description (optional)",
  prompt_placeholder: "Describe the website you want to build...",
  generate: "Generate",
  live_preview: "Live Preview",
  execution_log: "Execution Log",
  tokens: "Tokens",
  status_draft: "Draft",
  status_building: "Building",
  status_ready: "Ready",
  status_failed: "Failed",
  status_pending: "Pending",
  status_in_progress: "In Progress",
  status_completed: "Completed",
  status_cancelled: "Cancelled",
  view: "Open Workspace",
  logout: "Logout",
  delete: "Delete",
  confirm_delete: "Are you sure you want to delete this project?",
  creating: "Creating...",
  deleting: "Deleting...",
  building: "Building...",
  agents_working: "Agents are working on your prompt...",
  preview_ready: "Website is ready to view!",
  preview_unavailable: "Preview will appear here once the build completes.",
  back: "Back to Dashboard",
  unknown_error: "An unknown error occurred",
  loading: "Loading...",
  not_found_title: "Page Not Found",
  not_found_desc: "The page you're looking for doesn't exist.",
  tokens_label: "tokens",
  agent_codegen: "Code Generation",
  agent_reviewer: "Review",
  agent_fixer: "Fix",
  agent_filemanager: "File Manager",
  agent_unknown: "Agent"
};

const ar = {
  login_title: "ابنِ موقع أحلامك",
  login_subtitle: "صف ما تريده، وسيقوم وكلاء الذكاء الاصطناعي ببنائه لك في ثوانٍ.",
  sign_in: "تسجيل الدخول عبر ريبليت",
  dashboard: "لوحة التحكم",
  new_project: "مشروع جديد",
  projects: "مشاريعك",
  no_projects: "لا توجد مشاريع بعد. أنشئ مشروعاً للبدء!",
  create: "إنشاء",
  cancel: "إلغاء",
  project_name: "اسم المشروع",
  project_desc: "الوصف (اختياري)",
  prompt_placeholder: "صف الموقع الذي تريد بناءه...",
  generate: "توليد",
  live_preview: "المعاينة المباشرة",
  execution_log: "سجل التنفيذ",
  tokens: "التوكنز",
  status_draft: "مسودة",
  status_building: "قيد البناء",
  status_ready: "جاهز",
  status_failed: "فشل",
  status_pending: "قيد الانتظار",
  status_in_progress: "قيد التنفيذ",
  status_completed: "مكتمل",
  status_cancelled: "ملغي",
  view: "فتح مساحة العمل",
  logout: "تسجيل الخروج",
  delete: "حذف",
  confirm_delete: "هل أنت متأكد أنك تريد حذف هذا المشروع؟",
  creating: "جاري الإنشاء...",
  deleting: "جاري الحذف...",
  building: "جاري البناء...",
  agents_working: "الوكلاء يعملون على طلبك...",
  preview_ready: "الموقع جاهز للمعاينة!",
  preview_unavailable: "ستظهر المعاينة هنا بمجرد اكتمال البناء.",
  back: "العودة للوحة التحكم",
  unknown_error: "حدث خطأ غير معروف",
  loading: "جاري التحميل...",
  not_found_title: "الصفحة غير موجودة",
  not_found_desc: "الصفحة التي تبحث عنها غير موجودة.",
  tokens_label: "توكنز",
  agent_codegen: "توليد الكود",
  agent_reviewer: "المراجعة",
  agent_fixer: "الإصلاح",
  agent_filemanager: "إدارة الملفات",
  agent_unknown: "الوكيل"
};

type Language = "en" | "ar";
type Translations = typeof en;

interface I18nContextType {
  lang: Language;
  toggleLang: () => void;
  t: Translations;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem("lang");
    return (saved === "ar" || saved === "en") ? saved : "en";
  });

  useEffect(() => {
    localStorage.setItem("lang", lang);
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  const toggleLang = () => setLang((prev) => (prev === "en" ? "ar" : "en"));
  const t = lang === "en" ? en : ar;

  return (
    <I18nContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
