import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

const API_BASE = import.meta.env.VITE_API_URL || "";

export interface MonitoringHealthResponse {
  status: string;
  uptimeMs: number;
  uptimeHours: number;
  database: { status: string; latencyMs?: number; error?: string };
  memory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number; rssMb: number; heapUsedMb: number };
  timestamp: string;
}

export interface MonitoringStatsResponse {
  users: { total: number; activeLastWeek: number };
  projects: { total: number };
  builds: { total: number; completed: number; failed: number; successRate: number; last24h: number };
  tokens: { totalTokens: number; totalCostUsd: number; last24hTokens: number; last24hCostUsd: number; last30dTokens: number; last30dCostUsd: number };
  qa: { totalReports: number; passRate: number };
  sandboxes: { active: number };
  timestamp: string;
}

export interface MonitoringPerformanceResponse {
  period: string;
  overview: { avgDurationMs: number; minDurationMs: number; maxDurationMs: number };
  slowestTasks: Array<{ id: string; agentType: string; status: string; durationMs: number; projectId: string; createdAt: string }>;
  commonErrors: Array<{ agentType: string; error: string; count: number }>;
  agentPerformance: Array<{ agentType: string; avgDurationMs: number; totalTasks: number; failedTasks: number; failureRate: number }>;
  timestamp: string;
}

export interface MonitoringAlertsResponse {
  alerts: Array<{ level: string; service: string; message: string; messageAr: string; timestamp: string }>;
  overallStatus: string;
  timestamp: string;
}

export function useMonitoringHealth(refetchInterval = 30000) {
  return useQuery<MonitoringHealthResponse>({
    queryKey: ["monitoring", "health"],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/monitoring/health`);
      if (!res.ok) throw new Error("Failed to fetch health");
      return res.json();
    },
    refetchInterval,
  });
}

export function useMonitoringStats(refetchInterval = 30000) {
  return useQuery<MonitoringStatsResponse>({
    queryKey: ["monitoring", "stats"],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/monitoring/stats`);
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval,
  });
}

export function useMonitoringPerformance(refetchInterval = 60000) {
  return useQuery<MonitoringPerformanceResponse>({
    queryKey: ["monitoring", "performance"],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/monitoring/performance`);
      if (!res.ok) throw new Error("Failed to fetch performance");
      return res.json();
    },
    refetchInterval,
  });
}

export function useMonitoringAlerts(refetchInterval = 15000) {
  return useQuery<MonitoringAlertsResponse>({
    queryKey: ["monitoring", "alerts"],
    queryFn: async () => {
      const res = await customFetch(`${API_BASE}/api/monitoring/alerts`);
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    refetchInterval,
  });
}
