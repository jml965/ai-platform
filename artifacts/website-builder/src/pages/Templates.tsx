import React, { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Search, Eye, Loader2, LayoutTemplate, X, ChevronLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { templates, categoryIcons, type Template, type TemplateCategory } from "@/lib/templates";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export default function Templates() {
  const { t, lang } = useI18n();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<TemplateCategory | "all">("all");
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categories: { key: TemplateCategory | "all"; labelEn: string; labelAr: string }[] = [
    { key: "all", labelEn: "All", labelAr: "الكل" },
    { key: "ecommerce", labelEn: "E-commerce", labelAr: "متاجر" },
    { key: "restaurant", labelEn: "Restaurant", labelAr: "مطاعم" },
    { key: "corporate", labelEn: "Corporate", labelAr: "شركات" },
    { key: "portfolio", labelEn: "Portfolio", labelAr: "أعمال" },
    { key: "blog", labelEn: "Blog", labelAr: "مدونات" },
    { key: "medical", labelEn: "Medical", labelAr: "طبي" },
    { key: "legal", labelEn: "Legal", labelAr: "قانوني" },
    { key: "marketing", labelEn: "Marketing", labelAr: "تسويق" },
    { key: "landing", labelEn: "Landing", labelAr: "صفحات هبوط" },
    { key: "personal", labelEn: "Personal", labelAr: "شخصي" },
  ];

  const filteredTemplates = useMemo(() => {
    return templates.filter((tmpl) => {
      const matchesCategory = activeCategory === "all" || tmpl.category === activeCategory;
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        tmpl.nameEn.toLowerCase().includes(searchLower) ||
        tmpl.nameAr.includes(search) ||
        tmpl.descriptionEn.toLowerCase().includes(searchLower) ||
        tmpl.descriptionAr.includes(search);
      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, search]);

  const handleUseTemplate = async (template: Template) => {
    setCreatingId(template.id);
    try {
      const res = await fetch(`${BASE}/api/templates/use`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ templateId: template.id }),
      });
      if (!res.ok) throw new Error("Failed to create project from template");
      const project = await res.json();
      navigate(`/project/${project.id}`);
    } catch (err) {
      console.error(err);
      setError(lang === "ar" ? "فشل إنشاء المشروع من القالب. حاول مرة أخرى." : "Failed to create project from template. Please try again.");
      setCreatingId(null);
      setTimeout(() => setError(null), 5000);
    }
  };

  const getPreviewHtml = (template: Template) => {
    const htmlFile = template.files.find((f) => f.filePath === "index.html");
    const cssFile = template.files.find((f) => f.filePath === "style.css");
    const jsFile = template.files.find((f) => f.filePath === "main.js");
    if (!htmlFile) return "";
    let html = htmlFile.content;
    if (cssFile) {
      html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        `<style>${cssFile.content}</style>`
      );
    }
    if (jsFile) {
      html = html.replace(
        '<script src="main.js"></script>',
        `<script>${jsFile.content}</script>`
      );
    }
    return html;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-white/10 bg-card/50 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <LayoutTemplate className="w-4 h-4 text-primary" />
          </div>
          <h1 className="font-bold text-lg">{t.templates_title}</h1>
        </div>
      </header>

      {error && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 backdrop-blur-sm text-white px-6 py-3 rounded-xl shadow-lg shadow-red-500/20 text-sm font-medium animate-in fade-in slide-in-from-top-2">
          {error}
        </div>
      )}

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold mb-2">{t.templates_browse}</h2>
          <p className="text-muted-foreground">{t.templates_subtitle}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.templates_search}
              className="w-full pl-4 pr-10 py-2.5 bg-card border border-white/10 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2 mb-8 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategory(cat.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.key
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : "bg-card border border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
              }`}
            >
              {cat.key !== "all" && <span>{categoryIcons[cat.key as TemplateCategory]}</span>}
              {lang === "ar" ? cat.labelAr : cat.labelEn}
            </button>
          ))}
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="text-center py-20 bg-card/30 rounded-3xl border border-white/5 border-dashed">
            <p className="text-muted-foreground">{t.templates_no_results}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredTemplates.map((template) => (
                <motion.div
                  key={template.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="group bg-card border border-white/10 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-black/50 hover:border-primary/30 transition-all duration-300"
                >
                  <div className="relative h-48 bg-gradient-to-br from-card to-background overflow-hidden">
                    <iframe
                      srcDoc={getPreviewHtml(template)}
                      className="w-[200%] h-[200%] origin-top-left scale-50 pointer-events-none border-0"
                      sandbox="allow-scripts"
                      title={lang === "ar" ? template.nameAr : template.nameEn}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-4 gap-2">
                      <button
                        onClick={() => setPreviewTemplate(template)}
                        className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-white/20 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        {t.templates_preview}
                      </button>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{categoryIcons[template.category]}</span>
                      <h3 className="font-semibold text-lg">
                        {lang === "ar" ? template.nameAr : template.nameEn}
                      </h3>
                    </div>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {lang === "ar" ? template.descriptionAr : template.descriptionEn}
                    </p>
                    <button
                      onClick={() => handleUseTemplate(template)}
                      disabled={creatingId === template.id}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2.5 rounded-xl font-medium shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                    >
                      {creatingId === template.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t.creating}
                        </>
                      ) : (
                        <>
                          {t.templates_use}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <AnimatePresence>
        {previewTemplate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-background/90 backdrop-blur-sm flex flex-col"
          >
            <div className="h-14 border-b border-white/10 bg-card/50 backdrop-blur-md px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-lg">{categoryIcons[previewTemplate.category]}</span>
                <h2 className="font-semibold">
                  {lang === "ar" ? previewTemplate.nameAr : previewTemplate.nameEn}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    handleUseTemplate(previewTemplate);
                    setPreviewTemplate(null);
                  }}
                  disabled={creatingId === previewTemplate.id}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl font-medium text-sm transition-all disabled:opacity-50"
                >
                  {creatingId === previewTemplate.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {t.templates_use}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setPreviewTemplate(null)}
                  className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 p-4">
              <iframe
                srcDoc={getPreviewHtml(previewTemplate)}
                className="w-full h-full rounded-xl border border-white/10"
                sandbox="allow-scripts"
                title="Preview"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
