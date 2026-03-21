import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  BarChart3,
  Users,
  FolderOpen,
  Cpu,
  DollarSign,
  Activity,
  TrendingUp,
  LogOut,
  Shield,
  Loader2,
  Zap,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  Bot,
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

const BASE = import.meta.env.BASE_URL;

interface OverviewStats {
  users: number;
  projects: number;
  totalBuilds: number;
  totalTokens: number;
  totalCost: number;
  todayTokens: number;
  todayCost: number;
  todayBuilds: number;
  monthTokens: number;
  monthCost: number;
}

interface AgentStat {
  agentType: string;
  runs: number;
  tokens: number;
  cost: number;
  avgDuration: number;
  successCount: number;
  failCount: number;
}

interface ProjectStat {
  projectId: string;
  projectName: string;
  status: string;
  totalTokens: number;
  totalCost: number;
  createdAt: string;
  userName: string;
  userEmail: string;
}

interface UserStat {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  creditBalance: number;
  dailyLimit: string;
  monthlyLimit: string;
  createdAt: string;
  projectCount: number;
  totalTokens: number;
  totalCost: number;
}

interface DailyStat {
  date: string;
  builds: number;
  tokens: number;
  cost: number;
}

const AGENT_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  codegen: { ar: "توليد الكود", en: "Code Generator", color: "#58a6ff" },
  fixer: { ar: "إصلاح الأخطاء", en: "Error Fixer", color: "#f0883e" },
  reviewer: { ar: "مراجعة الكود", en: "Code Reviewer", color: "#3fb950" },
  surgical_edit: { ar: "التعديل الجراحي", en: "Surgical Edit", color: "#d2a8ff" },
  filemanager: { ar: "مدير الملفات", en: "File Manager", color: "#79c0ff" },
  package_runner: { ar: "مشغل الحزم", en: "Package Runner", color: "#f778ba" },
  qa: { ar: "فحص الجودة", en: "QA Check", color: "#7ee787" },
  translator: { ar: "المترجم", en: "Translator", color: "#ffd700" },
};

const COLORS = ["#58a6ff", "#3fb950", "#d2a8ff", "#f0883e", "#f778ba", "#79c0ff", "#7ee787", "#ffd700"];

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatCost(n: number): string {
  return "$" + n.toFixed(4);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return ms + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "agents" | "projects" | "users">("overview");

  const [overview, setOverview] = useState<OverviewStats | null>(null);
  const [agents, setAgents] = useState<AgentStat[]>([]);
  const [projects, setProjects] = useState<ProjectStat[]>([]);
  const [users, setUsers] = useState<UserStat[]>([]);
  const [daily, setDaily] = useState<DailyStat[]>([]);

  const isRtl = lang === "ar";

  const t = lang === "ar" ? {
    title: "لوحة تحكم المدير",
    overview: "نظرة عامة",
    agents: "الوكلاء",
    projects: "المشاريع",
    users: "المستخدمون",
    totalUsers: "إجمالي المستخدمين",
    totalProjects: "إجمالي المشاريع",
    totalBuilds: "إجمالي عمليات البناء",
    totalTokens: "إجمالي التوكنات",
    totalCost: "إجمالي التكلفة",
    todayCost: "تكلفة اليوم",
    monthCost: "تكلفة الشهر",
    todayBuilds: "بناء اليوم",
    agentType: "نوع الوكيل",
    runs: "عدد التشغيلات",
    tokens: "التوكنات",
    cost: "التكلفة",
    avgDuration: "متوسط المدة",
    successRate: "نسبة النجاح",
    projectName: "اسم المشروع",
    owner: "المالك",
    status: "الحالة",
    createdAt: "تاريخ الإنشاء",
    displayName: "الاسم",
    email: "البريد",
    role: "الدور",
    balance: "الرصيد",
    limits: "الحدود",
    dailyCost: "التكلفة اليومية",
    logout: "تسجيل الخروج",
    loading: "جاري التحميل...",
    errorLoading: "خطأ في تحميل البيانات",
    noAccess: "ليس لديك صلاحية الوصول",
    costBreakdown: "توزيع التكلفة",
    dailyUsage: "الاستخدام اليومي (آخر 30 يوم)",
    admin: "مدير",
    user: "مستخدم",
  } : {
    title: "Admin Dashboard",
    overview: "Overview",
    agents: "Agents",
    projects: "Projects",
    users: "Users",
    totalUsers: "Total Users",
    totalProjects: "Total Projects",
    totalBuilds: "Total Builds",
    totalTokens: "Total Tokens",
    totalCost: "Total Cost",
    todayCost: "Today's Cost",
    monthCost: "This Month's Cost",
    todayBuilds: "Today's Builds",
    agentType: "Agent Type",
    runs: "Runs",
    tokens: "Tokens",
    cost: "Cost",
    avgDuration: "Avg Duration",
    successRate: "Success Rate",
    projectName: "Project Name",
    owner: "Owner",
    status: "Status",
    createdAt: "Created At",
    displayName: "Name",
    email: "Email",
    role: "Role",
    balance: "Balance",
    limits: "Limits",
    dailyCost: "Daily Cost",
    logout: "Logout",
    loading: "Loading...",
    errorLoading: "Error loading data",
    noAccess: "Access denied",
    costBreakdown: "Cost Breakdown",
    dailyUsage: "Daily Usage (Last 30 Days)",
    admin: "Admin",
    user: "User",
  };

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, agentsRes, projectsRes, usersRes, dailyRes] = await Promise.all([
        fetch(`${BASE}api/admin/stats/overview`),
        fetch(`${BASE}api/admin/stats/agents`),
        fetch(`${BASE}api/admin/stats/projects`),
        fetch(`${BASE}api/admin/stats/users`),
        fetch(`${BASE}api/admin/stats/daily`),
      ]);

      if (overviewRes.status === 401 || overviewRes.status === 403) {
        setError(t.noAccess);
        setLoading(false);
        return;
      }

      setOverview(await overviewRes.json());
      setAgents(await agentsRes.json());
      setProjects(await projectsRes.json());
      setUsers(await usersRes.json());
      setDaily(await dailyRes.json());
    } catch {
      setError(t.errorLoading);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await fetch(`${BASE}api/auth/logout`, { method: "POST" });
    navigate("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#58a6ff] mx-auto mb-4" />
          <p className="text-[#b0bac5]">{t.loading}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-400 text-lg">{error}</p>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview" as const, label: t.overview, icon: BarChart3 },
    { id: "agents" as const, label: t.agents, icon: Bot },
    { id: "projects" as const, label: t.projects, icon: FolderOpen },
    { id: "users" as const, label: t.users, icon: Users },
  ];

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#c9d1d9]" dir={isRtl ? "rtl" : "ltr"}>
      <header className="border-b border-[#30363d] bg-[#161b22] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#58a6ff] to-[#3fb950] rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white">{t.title}</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setLang(lang === "ar" ? "en" : "ar")}
              className="px-3 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-sm hover:bg-[#30363d] transition-colors"
            >
              {lang === "ar" ? "English" : "العربية"}
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] text-sm hover:bg-[#30363d] transition-colors text-red-400"
            >
              <LogOut className="w-4 h-4" />
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                tab === id
                  ? "bg-[#58a6ff]/10 text-[#58a6ff] border border-[#58a6ff]/30"
                  : "bg-[#21262d] text-[#b0bac5] border border-[#30363d] hover:bg-[#30363d]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {tab === "overview" && overview && <OverviewTab overview={overview} daily={daily} agents={agents} t={t} lang={lang} />}
        {tab === "agents" && <AgentsTab agents={agents} t={t} lang={lang} />}
        {tab === "projects" && <ProjectsTab projects={projects} t={t} lang={lang} />}
        {tab === "users" && <UsersTab users={users} t={t} lang={lang} />}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, subtitle, color }: {
  icon: any; label: string; value: string; subtitle?: string; color: string;
}) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "15" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <span className="text-[#b0bac5] text-sm">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-[#b0bac5] mt-1">{subtitle}</p>}
    </div>
  );
}

function OverviewTab({ overview, daily, agents, t, lang }: {
  overview: OverviewStats; daily: DailyStat[]; agents: AgentStat[]; t: any; lang: string;
}) {
  const pieData = agents.filter(a => a.cost > 0).map(a => ({
    name: AGENT_LABELS[a.agentType]?.[lang === "ar" ? "ar" : "en"] || a.agentType,
    value: a.cost,
    color: AGENT_LABELS[a.agentType]?.color || "#b0bac5",
  }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label={t.totalUsers} value={overview.users.toString()} color="#58a6ff" />
        <StatCard icon={FolderOpen} label={t.totalProjects} value={overview.projects.toString()} color="#3fb950" />
        <StatCard icon={Cpu} label={t.totalBuilds} value={overview.totalBuilds.toString()} color="#d2a8ff" />
        <StatCard icon={Zap} label={t.totalTokens} value={formatNumber(overview.totalTokens)} color="#f0883e" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={DollarSign} label={t.totalCost} value={formatCost(overview.totalCost)} color="#f778ba" />
        <StatCard icon={Calendar} label={t.todayCost} value={formatCost(overview.todayCost)} subtitle={`${overview.todayBuilds} ${lang === "ar" ? "عملية" : "builds"}`} color="#79c0ff" />
        <StatCard icon={TrendingUp} label={t.monthCost} value={formatCost(overview.monthCost)} color="#7ee787" />
        <StatCard icon={Activity} label={t.todayBuilds} value={overview.todayBuilds.toString()} subtitle={formatNumber(overview.todayTokens) + " tokens"} color="#ffd700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">{t.dailyUsage}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={daily}>
              <defs>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
              <XAxis dataKey="date" stroke="#b0bac5" tick={{ fontSize: 11 }} tickFormatter={(v) => v.split("-").slice(1).join("/")} />
              <YAxis stroke="#b0bac5" tick={{ fontSize: 11 }} tickFormatter={(v) => "$" + v} />
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, color: "#c9d1d9" }}
                formatter={(v: number) => ["$" + v.toFixed(4), lang === "ar" ? "التكلفة" : "Cost"]}
              />
              <Area type="monotone" dataKey="cost" stroke="#58a6ff" fill="url(#colorCost)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-4">{t.costBreakdown}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} dataKey="value" paddingAngle={2}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, color: "#c9d1d9" }}
                formatter={(v: number) => formatCost(v)}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {pieData.map((d, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-[#b0bac5]">{d.name}</span>
                </div>
                <span className="text-white font-mono">{formatCost(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentsTab({ agents, t, lang }: { agents: AgentStat[]; t: any; lang: string }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const info = AGENT_LABELS[agent.agentType] || { ar: agent.agentType, en: agent.agentType, color: "#b0bac5" };
          const successRate = agent.runs > 0 ? Math.round(((agent.successCount || 0) / agent.runs) * 100) : 0;
          return (
            <div key={agent.agentType} className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: info.color + "15" }}>
                  <Bot className="w-5 h-5" style={{ color: info.color }} />
                </div>
                <div>
                  <h3 className="text-white font-semibold">{lang === "ar" ? info.ar : info.en}</h3>
                  <span className="text-xs text-[#b0bac5]">{agent.agentType}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#0d1117] rounded-xl p-3">
                  <p className="text-xs text-[#b0bac5] mb-1">{t.runs}</p>
                  <p className="text-lg font-bold text-white">{agent.runs}</p>
                </div>
                <div className="bg-[#0d1117] rounded-xl p-3">
                  <p className="text-xs text-[#b0bac5] mb-1">{t.tokens}</p>
                  <p className="text-lg font-bold text-white">{formatNumber(agent.tokens)}</p>
                </div>
                <div className="bg-[#0d1117] rounded-xl p-3">
                  <p className="text-xs text-[#b0bac5] mb-1">{t.cost}</p>
                  <p className="text-lg font-bold text-[#f0883e]">{formatCost(agent.cost)}</p>
                </div>
                <div className="bg-[#0d1117] rounded-xl p-3">
                  <p className="text-xs text-[#b0bac5] mb-1">{t.avgDuration}</p>
                  <p className="text-lg font-bold text-white">{formatDuration(agent.avgDuration)}</p>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-[#b0bac5]">{t.successRate}</span>
                  <span className="text-white font-mono">{successRate}%</span>
                </div>
                <div className="h-2 bg-[#0d1117] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${successRate}%`, backgroundColor: successRate > 80 ? "#3fb950" : successRate > 50 ? "#f0883e" : "#f85149" }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4">{lang === "ar" ? "مقارنة التكلفة" : "Cost Comparison"}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={agents.map(a => ({
            name: AGENT_LABELS[a.agentType]?.[lang === "ar" ? "ar" : "en"] || a.agentType,
            cost: a.cost,
            tokens: a.tokens,
            color: AGENT_LABELS[a.agentType]?.color || "#b0bac5",
          }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#30363d" />
            <XAxis dataKey="name" stroke="#b0bac5" tick={{ fontSize: 11 }} />
            <YAxis stroke="#b0bac5" tick={{ fontSize: 11 }} tickFormatter={(v) => "$" + v} />
            <Tooltip
              contentStyle={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 12, color: "#c9d1d9" }}
              formatter={(v: number) => formatCost(v)}
            />
            <Bar dataKey="cost" radius={[8, 8, 0, 0]}>
              {agents.map((a, i) => (
                <Cell key={i} fill={AGENT_LABELS[a.agentType]?.color || COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ProjectsTab({ projects, t, lang }: { projects: ProjectStat[]; t: any; lang: string }) {
  const statusColors: Record<string, string> = {
    draft: "#b0bac5",
    building: "#58a6ff",
    completed: "#3fb950",
    failed: "#f85149",
    published: "#d2a8ff",
  };

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#30363d]">
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.projectName}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.owner}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.status}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.tokens}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.cost}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.createdAt}</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.projectId} className="border-b border-[#30363d]/50 hover:bg-[#21262d]/50 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <FolderOpen className="w-4 h-4 text-[#58a6ff]" />
                    <span className="text-white font-medium">{p.projectName}</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div>
                    <p className="text-white text-sm">{p.userName}</p>
                    <p className="text-[#b0bac5] text-xs">{p.userEmail}</p>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span
                    className="px-2.5 py-1 rounded-full text-xs font-medium"
                    style={{
                      color: statusColors[p.status] || "#b0bac5",
                      backgroundColor: (statusColors[p.status] || "#b0bac5") + "15",
                    }}
                  >
                    {p.status}
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-sm text-white">{formatNumber(p.totalTokens)}</td>
                <td className="px-5 py-4 font-mono text-sm text-[#f0883e]">{formatCost(p.totalCost)}</td>
                <td className="px-5 py-4 text-sm text-[#b0bac5]">{new Date(p.createdAt).toLocaleDateString(lang === "ar" ? "ar-SA" : "en-US")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UsersTab({ users, t, lang }: { users: UserStat[]; t: any; lang: string }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#30363d]">
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.displayName}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.email}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.role}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.projects}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.tokens}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.cost}</th>
              <th className="px-5 py-4 text-start text-sm font-medium text-[#b0bac5]">{t.balance}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.userId} className="border-b border-[#30363d]/50 hover:bg-[#21262d]/50 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[#58a6ff]/10 flex items-center justify-center">
                      <Users className="w-4 h-4 text-[#58a6ff]" />
                    </div>
                    <span className="text-white font-medium">{u.displayName}</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-[#b0bac5]">{u.email}</td>
                <td className="px-5 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    u.role === "admin" ? "bg-[#d2a8ff]/10 text-[#d2a8ff]" : "bg-[#b0bac5]/10 text-[#b0bac5]"
                  }`}>
                    {u.role === "admin" ? t.admin : t.user}
                  </span>
                </td>
                <td className="px-5 py-4 font-mono text-sm text-white">{u.projectCount}</td>
                <td className="px-5 py-4 font-mono text-sm text-white">{formatNumber(u.totalTokens)}</td>
                <td className="px-5 py-4 font-mono text-sm text-[#f0883e]">{formatCost(u.totalCost)}</td>
                <td className="px-5 py-4 font-mono text-sm text-[#3fb950]">${u.creditBalance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
