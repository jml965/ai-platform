import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

const API_BASE = import.meta.env.VITE_API_URL || "";

export interface AnalyticsSummary {
  totalViews: number;
  uniqueVisitors: number;
  todayViews: number;
  todayVisitors: number;
  avgViewsPerDay: number;
  bounceRate: number;
}

export interface DailyStats {
  date: string;
  views: number;
  visitors: number;
}

export interface PageStats {
  path: string;
  views: number;
  uniqueVisitors: number;
}

export interface SourceStats {
  source: string;
  views: number;
  percentage: number;
}

export interface DeviceStats {
  browsers: { name: string; count: number; percentage: number }[];
  devices: { name: string; count: number; percentage: number }[];
  os: { name: string; count: number; percentage: number }[];
}

export function useAnalyticsSummary(projectId: string, period: string = "30d") {
  return useQuery<AnalyticsSummary>({
    queryKey: ["analytics", "summary", projectId, period],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/projects/${projectId}/analytics/summary?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch analytics summary");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 60000,
  });
}

export function useAnalyticsDaily(projectId: string, period: string = "30d") {
  return useQuery<DailyStats[]>({
    queryKey: ["analytics", "daily", projectId, period],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/projects/${projectId}/analytics/daily?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch daily stats");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 60000,
  });
}

export function useAnalyticsPages(projectId: string, period: string = "30d") {
  return useQuery<PageStats[]>({
    queryKey: ["analytics", "pages", projectId, period],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/projects/${projectId}/analytics/pages?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch page stats");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 60000,
  });
}

export function useAnalyticsSources(projectId: string, period: string = "30d") {
  return useQuery<SourceStats[]>({
    queryKey: ["analytics", "sources", projectId, period],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/projects/${projectId}/analytics/sources?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch source stats");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 60000,
  });
}

export function useAnalyticsDevices(projectId: string, period: string = "30d") {
  return useQuery<DeviceStats>({
    queryKey: ["analytics", "devices", projectId, period],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/projects/${projectId}/analytics/devices?period=${period}`);
      if (!res.ok) throw new Error("Failed to fetch device stats");
      return res.json();
    },
    enabled: !!projectId,
    refetchInterval: 60000,
  });
}
