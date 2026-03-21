import React, { useState, useCallback } from "react";
import {
  Globe, Loader2, Plus, Trash2, Check, Edit3, X, Sparkles, ChevronDown,
  Languages, ArrowRightLeft
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useProjectLanguages,
  useSupportedLanguages,
  useAddProjectLanguage,
  useRemoveProjectLanguage,
  useProjectTranslations,
  useUpdateTranslation,
  useTranslateContent,
} from "@workspace/api-client-react";

interface TranslationsPanelProps {
  projectId: string;
  onInjectSwitcher?: () => void;
}

export default function TranslationsPanel({ projectId, onInjectSwitcher }: TranslationsPanelProps) {
  const { t, lang } = useI18n();
  const [selectedLang, setSelectedLang] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { data: supportedLangs } = useSupportedLanguages();
  const { data: projectLangs, refetch: refetchLangs } = useProjectLanguages(projectId);
  const { data: translations, refetch: refetchTranslations } = useProjectTranslations(
    projectId,
    selectedLang || undefined
  );

  const addLangMut = useAddProjectLanguage();
  const removeLangMut = useRemoveProjectLanguage();
  const updateTransMut = useUpdateTranslation();
  const translateMut = useTranslateContent();

  const projectLanguages = projectLangs?.data || [];
  const supportedLanguages = supportedLangs?.data || [];
  const translationsList = translations?.data || [];

  const availableLanguages = supportedLanguages.filter(
    (sl) => !projectLanguages.find((pl) => pl.languageCode === sl.code)
  );

  const handleAddLanguage = useCallback(
    async (langInfo: { code: string; name: string; rtl: boolean }) => {
      try {
        await addLangMut.mutateAsync({
          projectId,
          languageCode: langInfo.code,
          languageName: langInfo.name,
          isDefault: projectLanguages.length === 0,
          isRtl: langInfo.rtl,
        });
        setShowAddMenu(false);
        refetchLangs();
      } catch (err) {
        console.error("Failed to add language:", err);
      }
    },
    [projectId, projectLanguages.length, addLangMut, refetchLangs]
  );

  const handleRemoveLanguage = useCallback(
    async (languageCode: string) => {
      try {
        await removeLangMut.mutateAsync({ projectId, languageCode });
        if (selectedLang === languageCode) setSelectedLang(null);
        refetchLangs();
      } catch (err) {
        console.error("Failed to remove language:", err);
      }
    },
    [projectId, selectedLang, removeLangMut, refetchLangs]
  );

  const handleTranslate = useCallback(
    async (languageCode: string) => {
      try {
        await translateMut.mutateAsync({ projectId, languageCode });
        refetchTranslations();
      } catch (err) {
        console.error("Translation failed:", err);
      }
    },
    [projectId, translateMut, refetchTranslations]
  );

  const handleSaveEdit = useCallback(
    async (translationId: string) => {
      try {
        await updateTransMut.mutateAsync({
          projectId,
          translationId,
          translatedText: editText,
        });
        setEditingId(null);
        setEditText("");
        refetchTranslations();
      } catch (err) {
        console.error("Failed to update translation:", err);
      }
    },
    [projectId, editText, updateTransMut, refetchTranslations]
  );

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-[#e1e4e8]">
      <div className="px-4 py-3 border-b border-[#1c2333]">
        <div className="flex items-center gap-2 mb-1">
          <Languages className="w-4 h-4 text-[#58a6ff]" />
          <h2 className="text-sm font-semibold">{t.translations_title}</h2>
        </div>
        <p className="text-xs text-[#b0bac5]">{t.translations_desc}</p>
      </div>

      <div className="px-4 py-3 border-b border-[#1c2333]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[#b0bac5] uppercase tracking-wider">
            {t.translations_panel}
          </span>
          <div className="relative">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              disabled={availableLanguages.length === 0 || projectLanguages.length >= 10}
              className={cn(
                "flex items-center gap-1 text-[11px] px-2 py-1 rounded-md transition-colors",
                "bg-[#1f6feb]/20 text-[#58a6ff] hover:bg-[#1f6feb]/30",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              <Plus className="w-3 h-3" />
              {t.translations_add_language}
            </button>

            {showAddMenu && (
              <div className="absolute top-full mt-1 end-0 z-50 w-56 max-h-64 overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl">
                {availableLanguages.map((sl) => (
                  <button
                    key={sl.code}
                    onClick={() => handleAddLanguage({ code: sl.code, name: sl.name, rtl: sl.rtl })}
                    className="w-full px-3 py-2 text-start text-xs hover:bg-[#1c2333] flex items-center justify-between transition-colors"
                  >
                    <span>{lang === "ar" ? sl.nameAr : sl.name}</span>
                    <span className="text-[#b0bac5]">
                      {sl.rtl ? t.translations_rtl : t.translations_ltr}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {projectLanguages.length === 0 ? (
          <p className="text-xs text-[#b0bac5] py-4 text-center">
            {t.translations_no_languages}
          </p>
        ) : (
          <div className="space-y-1">
            {projectLanguages.map((pl) => (
              <div
                key={pl.id}
                className={cn(
                  "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs cursor-pointer transition-colors",
                  selectedLang === pl.languageCode
                    ? "bg-[#1f6feb]/20 text-[#58a6ff]"
                    : "hover:bg-[#1c2333] text-[#e1e4e8]"
                )}
                onClick={() => setSelectedLang(pl.languageCode)}
              >
                <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1">{pl.languageName}</span>
                {pl.isDefault === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                    {t.translations_default_language}
                  </span>
                )}
                {pl.isRtl === 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400">
                    RTL
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveLanguage(pl.languageCode);
                  }}
                  className="p-0.5 text-[#b0bac5] hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {projectLanguages.length > 0 && (
        <div className="px-4 py-2 border-b border-[#1c2333] flex gap-2">
          {onInjectSwitcher && (
            <button
              onClick={onInjectSwitcher}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
            >
              <ArrowRightLeft className="w-3 h-3" />
              {t.translations_inject_switcher}
            </button>
          )}
        </div>
      )}

      {selectedLang && (
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 border-b border-[#1c2333] flex items-center justify-between sticky top-0 bg-[#0d1117] z-10">
            <span className="text-xs font-medium text-[#b0bac5]">
              {t.translations_content_keys} ({translationsList.length})
            </span>
            <button
              onClick={() => handleTranslate(selectedLang)}
              disabled={translateMut.isPending}
              className={cn(
                "flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md transition-colors",
                "bg-[#1f6feb]/20 text-[#58a6ff] hover:bg-[#1f6feb]/30",
                "disabled:opacity-50"
              )}
            >
              {translateMut.isPending ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t.translations_translating}
                </>
              ) : (
                <>
                  <Sparkles className="w-3 h-3" />
                  {t.translations_translate_all}
                </>
              )}
            </button>
          </div>

          {translationsList.length === 0 ? (
            <p className="text-xs text-[#b0bac5] py-8 text-center px-4">
              {t.translations_no_translations}
            </p>
          ) : (
            <div className="divide-y divide-[#1c2333]">
              {translationsList.map((tr) => (
                <div key={tr.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <span className="text-[10px] text-[#b0bac5] font-mono truncate max-w-[200px]">
                      {tr.contentKey.split("::").pop()}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded flex-shrink-0",
                        tr.status === "manual"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-[#1f6feb]/20 text-[#58a6ff]"
                      )}
                    >
                      {tr.status === "manual"
                        ? t.translations_status_manual
                        : t.translations_status_auto}
                    </span>
                  </div>

                  <div className="mb-1.5">
                    <span className="text-[10px] text-[#b0bac5] block mb-0.5">
                      {t.translations_source}
                    </span>
                    <p className="text-xs text-[#e1e4e8]/70 bg-[#161b22] px-2 py-1.5 rounded">
                      {tr.sourceText}
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#b0bac5] block mb-0.5">
                      {t.translations_translated}
                    </span>
                    {editingId === tr.id ? (
                      <div className="flex gap-1.5">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="flex-1 text-xs bg-[#161b22] border border-[#30363d] px-2 py-1.5 rounded resize-none focus:border-[#58a6ff] focus:outline-none"
                          rows={2}
                          dir="auto"
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleSaveEdit(tr.id)}
                            disabled={updateTransMut.isPending}
                            className="p-1 text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditText("");
                            }}
                            className="p-1 text-[#b0bac5] hover:bg-[#1c2333] rounded transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-1.5">
                        <p
                          className="flex-1 text-xs text-[#e1e4e8] bg-[#161b22] px-2 py-1.5 rounded"
                          dir="auto"
                        >
                          {tr.translatedText}
                        </p>
                        <button
                          onClick={() => {
                            setEditingId(tr.id);
                            setEditText(tr.translatedText);
                          }}
                          className="p-1 text-[#b0bac5] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors flex-shrink-0"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
