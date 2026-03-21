import React, { useState } from "react";
import { useParams, Link } from "wouter";
import {
  ArrowLeft,
  BarChart3,
  Eye,
  Users,
  TrendingUp,
  Globe,
  Monitor,
  Smartphone,
  Tablet,
  FileText,
  Copy,
  Check,
  Activity,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { cn } from "@/lib/utils";
import { useGetProject } from "@workspace/api-client-react";
import {
  useAnalyticsSummary,
  useAnalyticsDaily,
  useAnalyticsPages,
  useAnalyticsSources,
  useAnalyticsDevices,
} from "@workspace/api-client-react";

const COLORS = ["#58a6ff", "#3fb950", "#d2a8ff", "#f0883e", "#f778ba", "#79c0ff", "#7ee787", "#d4a5ff"];

function StatCard({
  icon,
  label,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
}) {
  return (
    <div className="bg-[#161b22] border border-[#1c2333] rounded-xl p-4 hover:border-[#30363d] transition-colors">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-lg bg-[#1f6feb]/10 text-[#58a6ff]">{icon}</div>
        <span className="text-sm text-[#b0bac5]">{label}</span>
      </div>
      <p className="text-2xl font-bold text-[#e1e4e8]">{value}</p>
      {subtitle && <p className="text-xs text-[#484f58] mt-1">{subtitle}</p>}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-[#b0bac5]">
      <BarChart3 className="w-12 h-12 mb-4 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default function Analytics() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const [period, setPeriod] = useState<"7d" | "30d">("30d");
  const [copied, setCopied] = useState(false);

  const { data: project } = useGetProject(id || "");
  const { data: summary, isLoading: loadingSummary } = useAnalyticsSummary(id || "", period);
  const { data: daily, isLoading: loadingDaily } = useAnalyticsDaily(id || "", period);
  const { data: pages, isLoading: loadingPages } = useAnalyticsPages(id || "", period);
  const { data: sources, isLoading: loadingSources } = useAnalyticsSources(id || "", period);
  const { data: devices, isLoading: loadingDevices } = useAnalyticsDevices(id || "", period);

  const isLoading = loadingSummary || loadingDaily || loadingPages || loadingSources || loadingDevices;
  const hasData = summary && summary.totalViews > 0;

  const apiBase = typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.host}`
    : "";

  const trackingScript = `<script>
(function(){
  var pid="${id}";
  var api="${apiBase}/api/analytics/track";
  var vid=localStorage.getItem("_av")||crypto.randomUUID();
  localStorage.setItem("_av",vid);
  var sid=sessionStorage.getItem("_as")||crypto.randomUUID();
  sessionStorage.setItem("_as",sid);
  fetch(api,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({projectId:pid,path:location.pathname,referrer:document.referrer,visitorId:vid,sessionId:sid})
  }).catch(function(){});
})();
</script>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(trackingScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatNumber = (n: number): string => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 shadow-xl">
        <p className="text-xs text-[#b0bac5] mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
            {p.name}: {p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0e1525] text-[#e1e4e8]">
      <header className="sticky top-0 z-10 bg-[#0d1117]/90 backdrop-blur-md border-b border-[#1c2333]">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link
            href={`/project/${id}`}
            className="p-1.5 text-[#b0bac5] hover:text-[#e1e4e8] transition-colors rounded hover:bg-[#1c2333]"
          >
            <ArrowLeft className={cn("w-5 h-5", lang === "ar" && "rotate-180")} />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold">{t.analytics_title}</h1>
            <p className="text-xs text-[#b0bac5]">{project?.name || t.loading}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-[#161b22] rounded-lg border border-[#1c2333] overflow-hidden">
              <button
                onClick={() => setPeriod("7d")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  period === "7d"
                    ? "bg-[#1f6feb] text-white"
                    : "text-[#b0bac5] hover:text-[#e1e4e8]"
                )}
              >
                {t.analytics_period_7d}
              </button>
              <button
                onClick={() => setPeriod("30d")}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  period === "30d"
                    ? "bg-[#1f6feb] text-white"
                    : "text-[#b0bac5] hover:text-[#e1e4e8]"
                )}
              >
                {t.analytics_period_30d}
              </button>
            </div>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {isLoading && !summary ? (
          <div className="flex items-center justify-center py-20">
            <Activity className="w-8 h-8 animate-pulse text-[#58a6ff]" />
          </div>
        ) : !hasData ? (
          <>
            <EmptyState message={t.analytics_no_data} />
            <div className="max-w-2xl mx-auto">
              <div className="bg-[#161b22] border border-[#1c2333] rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#58a6ff]" />
                    {t.analytics_tracking_script}
                  </h3>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1f6feb]/10 text-[#58a6ff] hover:bg-[#1f6feb]/20 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? t.analytics_copied : t.analytics_copy}
                  </button>
                </div>
                <p className="text-xs text-[#b0bac5] mb-3">{t.analytics_tracking_desc}</p>
                <pre className="bg-[#0d1117] rounded-lg p-4 text-xs text-[#79c0ff] overflow-x-auto font-mono leading-relaxed">
                  {trackingScript}
                </pre>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard
                icon={<Eye className="w-4 h-4" />}
                label={t.analytics_total_views}
                value={formatNumber(summary.totalViews)}
              />
              <StatCard
                icon={<Users className="w-4 h-4" />}
                label={t.analytics_unique_visitors}
                value={formatNumber(summary.uniqueVisitors)}
              />
              <StatCard
                icon={<TrendingUp className="w-4 h-4" />}
                label={t.analytics_today_views}
                value={formatNumber(summary.todayViews)}
              />
              <StatCard
                icon={<Users className="w-4 h-4" />}
                label={t.analytics_today_visitors}
                value={formatNumber(summary.todayVisitors)}
              />
              <StatCard
                icon={<Activity className="w-4 h-4" />}
                label={t.analytics_avg_daily}
                value={formatNumber(summary.avgViewsPerDay)}
              />
              <StatCard
                icon={<BarChart3 className="w-4 h-4" />}
                label={t.analytics_bounce_rate}
                value={`${summary.bounceRate}%`}
              />
            </div>

            <div className="bg-[#161b22] border border-[#1c2333] rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#58a6ff]" />
                {t.analytics_daily_chart}
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={daily || []}>
                    <defs>
                      <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="visitorsGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3fb950" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1c2333" />
                    <XAxis
                      dataKey="date"
                      stroke="#484f58"
                      tick={{ fill: "#b0bac5", fontSize: 11 }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis stroke="#484f58" tick={{ fill: "#b0bac5", fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="views"
                      name={t.analytics_views}
                      stroke="#58a6ff"
                      fill="url(#viewsGradient)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="visitors"
                      name={t.analytics_visitors}
                      stroke="#3fb950"
                      fill="url(#visitorsGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-[#161b22] border border-[#1c2333] rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#58a6ff]" />
                  {t.analytics_top_pages}
                </h3>
                {pages && pages.length > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center text-xs text-[#b0bac5] px-3 py-1">
                      <span className="flex-1">{t.analytics_page}</span>
                      <span className="w-20 text-center">{t.analytics_views}</span>
                      <span className="w-20 text-center">{t.analytics_visitors}</span>
                    </div>
                    {pages.map((page, i) => (
                      <div
                        key={i}
                        className="flex items-center px-3 py-2 rounded-lg hover:bg-[#1c2333] transition-colors"
                      >
                        <span className="flex-1 text-sm truncate font-mono text-[#79c0ff]">
                          {page.path}
                        </span>
                        <span className="w-20 text-center text-sm">{page.views}</span>
                        <span className="w-20 text-center text-sm text-[#b0bac5]">
                          {page.uniqueVisitors}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#b0bac5] text-center py-8">{t.analytics_no_data}</p>
                )}
              </div>

              <div className="bg-[#161b22] border border-[#1c2333] rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-[#58a6ff]" />
                  {t.analytics_traffic_sources}
                </h3>
                {sources && sources.length > 0 ? (
                  <div className="space-y-3">
                    {sources.map((source, i) => (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate">
                            {source.source === "Direct" ? t.analytics_direct : source.source}
                          </span>
                          <span className="text-[#b0bac5] flex-shrink-0 ms-2">
                            {source.views} ({source.percentage}%)
                          </span>
                        </div>
                        <div className="h-1.5 bg-[#1c2333] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${source.percentage}%`,
                              backgroundColor: COLORS[i % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#b0bac5] text-center py-8">{t.analytics_no_data}</p>
                )}
              </div>
            </div>

            <div className="bg-[#161b22] border border-[#1c2333] rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-6 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[#58a6ff]" />
                {t.analytics_devices}
              </h3>
              {devices ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div>
                    <h4 className="text-xs font-medium text-[#b0bac5] mb-3">{t.analytics_browsers}</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={devices.browsers}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={40}
                          >
                            {devices.browsers.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#161b22",
                              border: "1px solid #30363d",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1 mt-2">
                      {devices.browsers.map((b, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: COLORS[i % COLORS.length] }}
                            />
                            <span>{b.name}</span>
                          </div>
                          <span className="text-[#b0bac5]">{b.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-[#b0bac5] mb-3">
                      {t.analytics_device_types}
                    </h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={devices.devices} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#1c2333" />
                          <XAxis type="number" stroke="#484f58" tick={{ fill: "#b0bac5", fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            stroke="#484f58"
                            tick={{ fill: "#b0bac5", fontSize: 11 }}
                            width={60}
                          />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey="count" name={t.analytics_views} fill="#d2a8ff" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-medium text-[#b0bac5] mb-3">
                      {t.analytics_operating_systems}
                    </h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={devices.os}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            innerRadius={40}
                          >
                            {devices.os.map((_, i) => (
                              <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "#161b22",
                              border: "1px solid #30363d",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-1 mt-2">
                      {devices.os.map((o, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: COLORS[(i + 3) % COLORS.length] }}
                            />
                            <span>{o.name}</span>
                          </div>
                          <span className="text-[#b0bac5]">{o.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#b0bac5] text-center py-8">{t.analytics_no_data}</p>
              )}
            </div>

            <div className="bg-[#161b22] border border-[#1c2333] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#58a6ff]" />
                  {t.analytics_tracking_script}
                </h3>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[#1f6feb]/10 text-[#58a6ff] hover:bg-[#1f6feb]/20 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? t.analytics_copied : t.analytics_copy}
                </button>
              </div>
              <p className="text-xs text-[#b0bac5] mb-3">{t.analytics_tracking_desc}</p>
              <pre className="bg-[#0d1117] rounded-lg p-4 text-xs text-[#79c0ff] overflow-x-auto font-mono leading-relaxed">
                {trackingScript}
              </pre>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
