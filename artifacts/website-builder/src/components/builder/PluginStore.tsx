import React, { useState, useMemo } from "react";
import { Search, Plus, Check, Loader2, Eye, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useListPlugins,
  useAddPluginToProject,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface PluginItem {
  id?: string;
  nameEn?: string;
  nameAr?: string;
  descriptionEn?: string;
  descriptionAr?: string;
  category?: string;
  icon?: string;
  previewHtml?: string;
}

interface PluginStoreProps {
  projectId: string;
}

const CATEGORY_KEYS: Record<string, string> = {
  all: "plugin_category_all",
  forms: "plugin_category_forms",
  media: "plugin_category_media",
  social: "plugin_category_social",
  marketing: "plugin_category_marketing",
  content: "plugin_category_content",
  utility: "plugin_category_utility",
};

export default function PluginStore({ projectId }: PluginStoreProps) {
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [previewPlugin, setPreviewPlugin] = useState<PluginItem | null>(null);
  const [addedPlugins, setAddedPlugins] = useState<Set<string>>(new Set());
  const [addingPlugin, setAddingPlugin] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const { data: pluginsData } = useListPlugins({
    query: {
      queryKey: ["listPlugins"],
      staleTime: 60000,
    },
  });

  const addPluginMut = useAddPluginToProject();

  const plugins = pluginsData?.data || [];

  const filteredPlugins = useMemo(() => {
    return plugins.filter((p: PluginItem) => {
      const matchesCategory = selectedCategory === "all" || p.category === selectedCategory;
      const name = lang === "ar" ? p.nameAr : p.nameEn;
      const desc = lang === "ar" ? p.descriptionAr : p.descriptionEn;
      const matchesSearch = !search || name?.toLowerCase().includes(search.toLowerCase()) || desc?.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [plugins, selectedCategory, search, lang]);

  const handleAddPlugin = async (pluginId: string) => {
    if (addedPlugins.has(pluginId) || addingPlugin) return;
    setAddingPlugin(pluginId);
    try {
      await addPluginMut.mutateAsync({
        projectId,
        data: { pluginId },
      });
      setAddedPlugins((prev) => new Set(prev).add(pluginId));
      queryClient.invalidateQueries({ queryKey: ["listProjectFiles", projectId] });
      setToast({ msg: t.plugin_add_success, type: "success" });
    } catch (err: unknown) {
      const error = err as { response?: { status?: number } };
      if (error?.response?.status === 409) {
        setAddedPlugins((prev) => new Set(prev).add(pluginId));
        setToast({ msg: t.plugin_already_added, type: "error" });
      } else {
        setToast({ msg: t.plugin_add_error, type: "error" });
      }
    } finally {
      setAddingPlugin(null);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const categories = ["all", "forms", "media", "social", "marketing", "content", "utility"];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-3 pb-2 space-y-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#484f58]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.plugin_search}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-lg ps-8 pe-3 py-1.5 text-[12px] text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "px-2 py-0.5 text-[10px] font-medium rounded-full whitespace-nowrap transition-colors",
                selectedCategory === cat
                  ? "bg-[#1f6feb] text-white"
                  : "bg-[#161b22] text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
              )}
            >
              {(t as Record<string, string>)[CATEGORY_KEYS[cat]] || cat}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
        {filteredPlugins.map((plugin: PluginItem) => {
          const name = lang === "ar" ? plugin.nameAr : plugin.nameEn;
          const desc = lang === "ar" ? plugin.descriptionAr : plugin.descriptionEn;
          const isAdded = addedPlugins.has(plugin.id!);
          const isAdding = addingPlugin === plugin.id;

          return (
            <div
              key={plugin.id}
              className="bg-[#161b22] border border-[#1c2333] rounded-lg p-2.5 hover:border-[#30363d] transition-colors group"
            >
              <div className="flex items-start gap-2">
                <span className="text-lg flex-shrink-0 mt-0.5">{plugin.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-[12px] font-semibold text-[#e1e4e8] truncate">{name}</h4>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#1c2333] text-[#8b949e] flex-shrink-0">
                      {(t as Record<string, string>)[`plugin_category_${plugin.category}`] || plugin.category}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8b949e] mt-0.5 line-clamp-2 leading-relaxed">{desc}</p>
                </div>
              </div>

              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={() => setPreviewPlugin(previewPlugin?.id === plugin.id ? null : plugin)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[#0d1117] text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  {t.plugin_preview}
                </button>
                <button
                  onClick={() => handleAddPlugin(plugin.id!)}
                  disabled={isAdded || isAdding}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md transition-colors",
                    isAdded
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-[#1f6feb]/20 text-[#58a6ff] hover:bg-[#1f6feb]/30 disabled:opacity-50"
                  )}
                >
                  {isAdding ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isAdded ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <Plus className="w-3 h-3" />
                  )}
                  {isAdding ? t.plugin_adding : isAdded ? t.plugin_added : t.plugin_add}
                </button>
              </div>

              {previewPlugin?.id === plugin.id && (
                <div className="mt-2 bg-white rounded-lg overflow-hidden border border-[#30363d]">
                  <div
                    className="w-full"
                    style={{ minHeight: 120 }}
                    dangerouslySetInnerHTML={{ __html: plugin.previewHtml || "" }}
                  />
                </div>
              )}
            </div>
          );
        })}

        {filteredPlugins.length === 0 && (
          <div className="text-center py-8 text-[#484f58]">
            <p className="text-[12px]">{t.no_files}</p>
          </div>
        )}
      </div>

      {toast && (
        <div
          className={cn(
            "mx-3 mb-3 px-3 py-2 rounded-lg text-[11px] font-medium flex items-center justify-between",
            toast.type === "success"
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-red-500/20 text-red-400"
          )}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
}
