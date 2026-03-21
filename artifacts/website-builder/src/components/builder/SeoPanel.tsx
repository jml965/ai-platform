import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Loader2, CheckCircle2, XCircle, AlertTriangle, Info,
  ChevronDown, ChevronRight, Sparkles, RefreshCw, Zap,
  Type, FileText, Hash, Heading, ImageIcon, Link2,
  Smartphone, Gauge, Database, Share2, Accessibility
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useRunSeoAnalysis,
  useApplySeoFixes,
  type SeoCheckItem,
  type SeoAnalysisResponse,
} from "@workspace/api-client-react";

interface SeoPanelProps {
  projectId: string;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  title: Type,
  description: FileText,
  keywords: Hash,
  headings: Heading,
  images: ImageIcon,
  links: Link2,
  mobile: Smartphone,
  performance: Gauge,
  structured_data: Database,
  social: Share2,
  accessibility: Accessibility,
};

export default function SeoPanel({ projectId }: SeoPanelProps) {
  const { t, lang } = useI18n();
  const [analysisResult, setAnalysisResult] = useState<SeoAnalysisResponse | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [applySuccess, setApplySuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const analyzeMut = useRunSeoAnalysis();
  const applyMut = useApplySeoFixes();

  const handleAnalyze = async () => {
    setApplySuccess(false);
    setErrorMessage(null);
    try {
      const result = await analyzeMut.mutateAsync({ projectId });
      setAnalysisResult(result);
      const failedCategories = new Set<string>(
        result.analysis.checks
          .filter((c: SeoCheckItem) => !c.passed)
          .map((c: SeoCheckItem) => c.category)
      );
      setExpandedCategories(failedCategories);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Analysis failed";
      setErrorMessage(message);
    }
  };

  const handleApplyFixes = async () => {
    if (!analysisResult?.analysis.metaSuggestions) return;
    setErrorMessage(null);
    try {
      await applyMut.mutateAsync({
        projectId,
        metaSuggestions: analysisResult.analysis.metaSuggestions,
      });
      setApplySuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to apply fixes";
      setErrorMessage(message);
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const analysis = analysisResult?.analysis;
  const isAnalyzing = analyzeMut.isPending;
  const isApplying = applyMut.isPending;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  const getScoreRingColor = (score: number) => {
    if (score >= 80) return "stroke-emerald-400";
    if (score >= 50) return "stroke-yellow-400";
    return "stroke-red-400";
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return "bg-emerald-400/10";
    if (score >= 50) return "bg-yellow-400/10";
    return "bg-red-400/10";
  };

  const groupedChecks: Record<string, SeoCheckItem[]> = analysis
    ? analysis.checks.reduce<Record<string, SeoCheckItem[]>>((acc: Record<string, SeoCheckItem[]>, check: SeoCheckItem) => {
        if (!acc[check.category]) acc[check.category] = [];
        acc[check.category].push(check);
        return acc;
      }, {})
    : {};

  const hasMetaSuggestions = analysis?.metaSuggestions && Object.values(analysis.metaSuggestions).some(Boolean);

  const passedCount = analysis?.checks.filter((c: SeoCheckItem) => c.passed).length ?? 0;
  const failedCount = analysis?.checks.filter((c: SeoCheckItem) => !c.passed).length ?? 0;

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      <div className="p-4 border-b border-[#1c2333]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#58a6ff]" />
            <h2 className="text-sm font-semibold text-[#e1e4e8]">{t.seo_title}</h2>
          </div>
          <button
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f6feb] text-white text-[11px] font-medium rounded-md hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
          >
            {isAnalyzing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : analysis ? (
              <RefreshCw className="w-3 h-3" />
            ) : (
              <Search className="w-3 h-3" />
            )}
            {isAnalyzing ? t.seo_analyzing : analysis ? t.seo_reanalyze : t.seo_analyze}
          </button>
        </div>
        <p className="text-[11px] text-[#b0bac5]">{t.seo_description}</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {errorMessage && (
          <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-2">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-400">{errorMessage}</p>
          </div>
        )}

        {!analysis && !isAnalyzing && !errorMessage && (
          <div className="flex flex-col items-center justify-center h-full text-[#484f58] px-6">
            <Search className="w-10 h-10 mb-3 opacity-40" />
            <p className="text-sm text-center">{t.seo_empty_state}</p>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex flex-col items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-[#58a6ff] mb-3" />
            <p className="text-sm text-[#b0bac5]">{t.seo_analyzing}</p>
            <p className="text-[11px] text-[#484f58] mt-1">{t.seo_analyzing_desc}</p>
          </div>
        )}

        {analysis && !isAnalyzing && (
          <div className="p-4 space-y-4">
            <div className={cn("rounded-lg p-4 flex items-center gap-4", getScoreBgColor(analysis.score))}>
              <div className="relative w-16 h-16 flex-shrink-0">
                <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="28" fill="none" stroke="#1c2333" strokeWidth="4" />
                  <circle
                    cx="32" cy="32" r="28" fill="none"
                    className={getScoreRingColor(analysis.score)}
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={`${(analysis.score / 100) * 175.93} 175.93`}
                  />
                </svg>
                <span className={cn("absolute inset-0 flex items-center justify-center text-lg font-bold", getScoreColor(analysis.score))}>
                  {analysis.score}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={cn("text-sm font-semibold", getScoreColor(analysis.score))}>
                  {analysis.score >= 80 ? t.seo_score_good : analysis.score >= 50 ? t.seo_score_average : t.seo_score_poor}
                </h3>
                <p className="text-[11px] text-[#c9d1d9] mt-1 leading-relaxed">
                  {lang === "ar" ? analysis.summaryAr : analysis.summary}
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1 bg-[#161b22] border border-[#1c2333] rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="text-lg font-bold">{passedCount}</span>
                </div>
                <span className="text-[10px] text-[#b0bac5]">{t.seo_passed}</span>
              </div>
              <div className="flex-1 bg-[#161b22] border border-[#1c2333] rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-1 text-red-400">
                  <XCircle className="w-3.5 h-3.5" />
                  <span className="text-lg font-bold">{failedCount}</span>
                </div>
                <span className="text-[10px] text-[#b0bac5]">{t.seo_failed}</span>
              </div>
            </div>

            {hasMetaSuggestions && (
              <div className="bg-[#1f6feb]/10 border border-[#1f6feb]/20 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#58a6ff]" />
                  <span className="text-[12px] font-medium text-[#58a6ff]">{t.seo_ai_suggestions}</span>
                </div>
                <div className="space-y-1.5 mb-3">
                  {analysis.metaSuggestions.title && (
                    <div className="text-[11px]">
                      <span className="text-[#b0bac5]">{t.seo_meta_title}: </span>
                      <span className="text-[#c9d1d9]">{analysis.metaSuggestions.title}</span>
                    </div>
                  )}
                  {analysis.metaSuggestions.description && (
                    <div className="text-[11px]">
                      <span className="text-[#b0bac5]">{t.seo_meta_desc}: </span>
                      <span className="text-[#c9d1d9]">{analysis.metaSuggestions.description}</span>
                    </div>
                  )}
                  {analysis.metaSuggestions.keywords && (
                    <div className="text-[11px]">
                      <span className="text-[#b0bac5]">{t.seo_meta_keywords}: </span>
                      <span className="text-[#c9d1d9]">{analysis.metaSuggestions.keywords}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleApplyFixes}
                  disabled={isApplying || applySuccess}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors w-full justify-center",
                    applySuccess
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-[#1f6feb] text-white hover:bg-[#388bfd] disabled:opacity-50"
                  )}
                >
                  {isApplying ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : applySuccess ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <Zap className="w-3 h-3" />
                  )}
                  {isApplying ? t.seo_applying : applySuccess ? t.seo_applied : t.seo_apply_fixes}
                </button>
              </div>
            )}

            <div className="space-y-2">
              <h3 className="text-[12px] font-semibold text-[#e1e4e8] uppercase tracking-wider">
                {t.seo_detailed_checks}
              </h3>
              {Object.entries(groupedChecks).map(([category, checks]: [string, SeoCheckItem[]]) => {
                const Icon = CATEGORY_ICONS[category] || Info;
                const isExpanded = expandedCategories.has(category);
                const categoryPassed = checks.filter((c: SeoCheckItem) => c.passed).length;
                const categoryTotal = checks.length;
                const allPassed = categoryPassed === categoryTotal;

                return (
                  <div key={category} className="bg-[#161b22] border border-[#1c2333] rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-start hover:bg-[#1c2333]/50 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-[#484f58]" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-[#484f58]" />
                      )}
                      <Icon className={cn("w-3.5 h-3.5", allPassed ? "text-emerald-400" : "text-yellow-400")} />
                      <span className="flex-1 text-[12px] font-medium text-[#e1e4e8] capitalize">
                        {t[`seo_cat_${category}` as keyof typeof t] || category.replace(/_/g, " ")}
                      </span>
                      <span className={cn(
                        "text-[10px] font-mono px-1.5 py-0.5 rounded",
                        allPassed ? "bg-emerald-400/10 text-emerald-400" : "bg-yellow-400/10 text-yellow-400"
                      )}>
                        {categoryPassed}/{categoryTotal}
                      </span>
                    </button>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-2 border-t border-[#1c2333] pt-2">
                            {checks.map((check: SeoCheckItem, idx: number) => (
                              <div key={idx} className="flex gap-2 items-start">
                                <div className="mt-0.5 flex-shrink-0">
                                  {check.passed ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : check.severity === "error" ? (
                                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                                  ) : check.severity === "warning" ? (
                                    <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                                  ) : (
                                    <Info className="w-3.5 h-3.5 text-blue-400" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-[11px] font-medium text-[#e1e4e8]">
                                    {lang === "ar" ? check.nameAr : check.name}
                                  </p>
                                  <p className="text-[10px] text-[#b0bac5] mt-0.5">
                                    {lang === "ar" ? check.messageAr : check.message}
                                  </p>
                                  {!check.passed && (check.suggestion || check.suggestionAr) && (
                                    <p className="text-[10px] text-[#58a6ff] mt-0.5">
                                      {lang === "ar" ? check.suggestionAr : check.suggestion}
                                    </p>
                                  )}
                                  {check.currentValue && (
                                    <p className="text-[10px] text-[#484f58] mt-0.5 font-mono truncate">
                                      {t.seo_current}: {check.currentValue}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>

            {analysisResult && (
              <div className="text-[10px] text-[#484f58] text-center pt-2">
                {t.seo_tokens_used}: {analysisResult.tokensUsed} &bull; {t.seo_duration}: {(analysisResult.durationMs / 1000).toFixed(1)}s
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
