import { useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

const API_BASE = import.meta.env.VITE_API_URL || "";

export interface SeoCheckItem {
  category: "title" | "description" | "keywords" | "headings" | "images" | "links" | "mobile" | "performance" | "structured_data" | "social" | "accessibility";
  name: string;
  nameAr: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  messageAr: string;
  suggestion?: string;
  suggestionAr?: string;
  currentValue?: string;
  suggestedValue?: string;
}

export interface SeoMetaSuggestions {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
}

export interface SeoAnalysisResponse {
  success: boolean;
  analysis: {
    score: number;
    checks: SeoCheckItem[];
    summary: string;
    summaryAr: string;
    metaSuggestions: SeoMetaSuggestions;
  };
  tokensUsed: number;
  durationMs: number;
}

export interface SeoApplyResponse {
  success: boolean;
  fileId: string;
  filePath: string;
  tokensUsed: number;
}

export function useRunSeoAnalysis() {
  return useMutation<SeoAnalysisResponse, Error, { projectId: string }>({
    mutationFn: ({ projectId }) =>
      customFetch(`${API_BASE}/projects/${projectId}/seo/analyze`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
  });
}

export function useApplySeoFixes() {
  const queryClient = useQueryClient();
  return useMutation<SeoApplyResponse, Error, { projectId: string; metaSuggestions: SeoMetaSuggestions }>({
    mutationFn: ({ projectId, metaSuggestions }) =>
      customFetch(`${API_BASE}/projects/${projectId}/seo/apply`, {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ metaSuggestions }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["listProjectFiles", variables.projectId] });
    },
  });
}
