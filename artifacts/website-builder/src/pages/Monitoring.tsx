import React from "react";
import { Link } from "wouter";
import {
  Activity,
  ArrowLeft,
  Database,
  Server,
  Users,
  FolderOpen,
  Hammer,
  Coins,
  ShieldCheck,
  Box,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  RefreshCw,
  TrendingUp,
  BarChart3,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  useMonitoringHealth,
  useMonitoringStats,
  useMonitoringPerformance,
  useMonitoringAlerts,
} from "@workspace/api-client-react";

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toString();
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    healthy: { bg: "bg-emerald-500/10", text: "text-emerald-400", icon: <CheckCircle2 className="w-4 h-4" />, label: t.monitoring_status_healthy },
    warning: { bg: "bg-yellow-500/10", text: "text-yellow-400", icon: <AlertTriangle className="w-4 h-4" />, label: t.monitoring_status_warning },
    critical: { bg: "bg-red-500/10", text: "text-red-400", icon: <XCircle className="w-4 h-4" />, label: t.monitoring_status_critical },
  };
  const c = config[status] || config.healthy;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${c.bg} ${c.text}`}>
      {c.icon} {c.label}
    </span>
  );
}

function StatCard({ icon, label, value, subtitle, color = "text-primary" }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="bg-card/50 border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg bg-white/5 ${color}`}>{icon}</div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

export default function Monitoring() {
  const { t, lang } = useI18n();
  const { data: health, isLoading: loadingHealth } = useMonitoringHealth();
  const { data: stats, isLoading: loadingStats } = useMonitoringStats();
  const { data: performance, isLoading: loadingPerf } = useMonitoringPerformance();
  const { data: alerts, isLoading: loadingAlerts } = useMonitoringAlerts();

  const isLoading = loadingHealth || loadingStats || loadingPerf || loadingAlerts;

  const formatCurrency = (usd: number) => {
    if (lang === "ar") return `${(usd * 3.75).toFixed(2)} SAR`;
    return `$${usd.toFixed(2)}`;
  };

  const agentLabel = (type: string) => {
    const map: Record<string, string> = {
      codegen: t.agent_codegen,
      reviewer: t.agent_reviewer,
      fixer: t.agent_fixer,
      filemanager: t.agent_filemanager,
    };
    return map[type] || type;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-white/10 bg-card/50 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" />
          </div>
          <h1 className="font-bold text-lg">{t.monitoring_title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {alerts && <StatusBadge status={alerts.overallStatus} />}
          {isLoading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <RefreshCw className="w-3 h-3 animate-spin" /> {t.monitoring_refreshing}
            </span>
          )}
          <LanguageToggle />
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 lg:p-8 space-y-8">
        {/* Alerts Section */}
        {alerts && alerts.alerts.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              {t.monitoring_alerts}
            </h2>
            <div className="space-y-2">
              {alerts.alerts.map((alert, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    alert.level === "critical"
                      ? "bg-red-500/5 border-red-500/20"
                      : alert.level === "warning"
                        ? "bg-yellow-500/5 border-yellow-500/20"
                        : "bg-emerald-500/5 border-emerald-500/20"
                  }`}
                >
                  {alert.level === "critical" ? (
                    <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                  ) : alert.level === "warning" ? (
                    <AlertTriangle className="w-5 h-5 text-yellow-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{lang === "ar" ? alert.messageAr : alert.message}</p>
                    <p className="text-xs text-muted-foreground">{t.monitoring_service}: {alert.service}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* System Health */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" />
            {t.monitoring_system_health}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Clock className="w-4 h-4" />}
              label={t.monitoring_uptime}
              value={health ? `${health.uptimeHours}` : "--"}
              subtitle={t.monitoring_hours}
              color="text-emerald-400"
            />
            <StatCard
              icon={<Database className="w-4 h-4" />}
              label={t.monitoring_db_latency}
              value={health?.database.latencyMs ? `${health.database.latencyMs}ms` : "--"}
              subtitle={health?.database.status === "connected" ? t.monitoring_connected : t.monitoring_disconnected}
              color="text-blue-400"
            />
            <StatCard
              icon={<Server className="w-4 h-4" />}
              label={t.monitoring_memory}
              value={health ? `${health.memory.heapUsedMb}MB` : "--"}
              subtitle={health ? `${Math.round((health.memory.heapUsedBytes / health.memory.heapTotalBytes) * 100)}%` : ""}
              color="text-violet-400"
            />
            <StatCard
              icon={<Box className="w-4 h-4" />}
              label={t.monitoring_active_sandboxes}
              value={stats?.sandboxes.active ?? "--"}
              color="text-orange-400"
            />
          </div>
        </section>

        {/* Overview Stats */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t.monitoring_overview}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={<Users className="w-4 h-4" />}
              label={t.monitoring_active_users}
              value={stats?.users.activeLastWeek ?? "--"}
              subtitle={`${t.monitoring_total_users}: ${stats?.users.total ?? 0}`}
              color="text-blue-400"
            />
            <StatCard
              icon={<FolderOpen className="w-4 h-4" />}
              label={t.monitoring_total_projects}
              value={stats?.projects.total ?? "--"}
              color="text-green-400"
            />
            <StatCard
              icon={<Hammer className="w-4 h-4" />}
              label={t.monitoring_build_success}
              value={stats ? `${stats.builds.successRate}%` : "--"}
              subtitle={`${t.monitoring_total_builds}: ${stats?.builds.total ?? 0}`}
              color="text-emerald-400"
            />
            <StatCard
              icon={<Hammer className="w-4 h-4" />}
              label={t.monitoring_builds_24h}
              value={stats?.builds.last24h ?? "--"}
              subtitle={`${t.monitoring_completed}: ${stats?.builds.completed ?? 0} | ${t.monitoring_failed_builds}: ${stats?.builds.failed ?? 0}`}
              color="text-yellow-400"
            />
          </div>
        </section>

        {/* Token Consumption */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-400" />
            {t.monitoring_token_consumption}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              icon={<Zap className="w-4 h-4" />}
              label={t.monitoring_tokens_24h}
              value={stats ? formatNumber(stats.tokens.last24hTokens) : "--"}
              subtitle={stats ? `${t.monitoring_cost_24h}: ${formatCurrency(stats.tokens.last24hCostUsd)}` : ""}
              color="text-yellow-400"
            />
            <StatCard
              icon={<TrendingUp className="w-4 h-4" />}
              label={t.monitoring_tokens_30d}
              value={stats ? formatNumber(stats.tokens.last30dTokens) : "--"}
              subtitle={stats ? `${t.monitoring_cost_30d}: ${formatCurrency(stats.tokens.last30dCostUsd)}` : ""}
              color="text-orange-400"
            />
            <StatCard
              icon={<Coins className="w-4 h-4" />}
              label={t.monitoring_cost_total}
              value={stats ? formatCurrency(stats.tokens.totalCostUsd) : "--"}
              subtitle={stats ? `${formatNumber(stats.tokens.totalTokens)} ${t.tokens}` : ""}
              color="text-yellow-400"
            />
          </div>
        </section>

        {/* QA Summary */}
        <section>
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              icon={<ShieldCheck className="w-4 h-4" />}
              label={t.monitoring_qa_pass_rate}
              value={stats ? `${stats.qa.passRate}%` : "--"}
              subtitle={`${t.qa_total_reports}: ${stats?.qa.totalReports ?? 0}`}
              color="text-emerald-400"
            />
          </div>
        </section>

        {/* Performance Report */}
        <section>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {t.monitoring_performance}
          </h2>

          {/* Duration Overview */}
          {performance && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <StatCard
                icon={<Clock className="w-4 h-4" />}
                label={t.monitoring_avg_duration}
                value={formatMs(performance.overview.avgDurationMs)}
                color="text-blue-400"
              />
              <StatCard
                icon={<Clock className="w-4 h-4" />}
                label={t.monitoring_min_duration}
                value={formatMs(performance.overview.minDurationMs)}
                color="text-emerald-400"
              />
              <StatCard
                icon={<Clock className="w-4 h-4" />}
                label={t.monitoring_max_duration}
                value={formatMs(performance.overview.maxDurationMs)}
                color="text-red-400"
              />
            </div>
          )}

          {/* Agent Performance */}
          {performance && performance.agentPerformance.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t.monitoring_agent_performance}</h3>
              <div className="bg-card/50 border border-white/5 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5">
                      <th className="text-start p-3 text-muted-foreground font-medium">{t.monitoring_agent}</th>
                      <th className="text-start p-3 text-muted-foreground font-medium">{t.monitoring_tasks}</th>
                      <th className="text-start p-3 text-muted-foreground font-medium">{t.monitoring_avg_duration}</th>
                      <th className="text-start p-3 text-muted-foreground font-medium">{t.monitoring_failure_rate}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performance.agentPerformance.map((a) => (
                      <tr key={a.agentType} className="border-b border-white/5 last:border-0">
                        <td className="p-3 font-medium">{agentLabel(a.agentType)}</td>
                        <td className="p-3">{a.totalTasks}</td>
                        <td className="p-3">{formatMs(a.avgDurationMs)}</td>
                        <td className="p-3">
                          <span className={a.failureRate > 20 ? "text-red-400" : a.failureRate > 5 ? "text-yellow-400" : "text-emerald-400"}>
                            {a.failureRate}%
                          </span>
                          <span className="text-muted-foreground ms-1">({a.failedTasks})</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Slowest Tasks */}
          {performance && performance.slowestTasks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t.monitoring_slowest_tasks}</h3>
              <div className="bg-card/50 border border-white/5 rounded-xl p-4 space-y-2">
                {performance.slowestTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{agentLabel(task.agentType)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        task.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                      }`}>
                        {task.status}
                      </span>
                    </div>
                    <span className="text-sm font-mono text-yellow-400">{formatMs(task.durationMs)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Common Errors */}
          {performance && performance.commonErrors.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t.monitoring_common_errors}</h3>
              <div className="bg-card/50 border border-white/5 rounded-xl p-4 space-y-2">
                {performance.commonErrors.map((err, i) => (
                  <div key={i} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                    <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{err.error}</p>
                      <p className="text-xs text-muted-foreground">{agentLabel(err.agentType)} — {err.count}x</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {performance && performance.slowestTasks.length === 0 && performance.commonErrors.length === 0 && performance.agentPerformance.length === 0 && (
            <p className="text-muted-foreground text-sm text-center py-8">{t.monitoring_no_alerts}</p>
          )}
        </section>

        {/* Last updated */}
        {health && (
          <p className="text-xs text-muted-foreground text-center pb-4">
            {t.monitoring_last_updated}: {new Date(health.timestamp).toLocaleString(lang === "ar" ? "ar-SA" : "en-US")}
          </p>
        )}
      </main>
    </div>
  );
}
