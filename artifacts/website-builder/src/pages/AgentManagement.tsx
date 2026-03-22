import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import {
  Bot, ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Settings, FileText, Brain, Shield,
  MessageSquare, BarChart2, Zap, GripVertical, ArrowUpDown,
  Activity, Clock, Coins, AlertTriangle, CheckCircle, XCircle,
  Cpu, RefreshCw, Eye, Code, ScrollText, Search, FolderOpen,
  Terminal, Database, Camera, MousePointer, Type, Move,
  Palette, LayoutList, ArrowDown, Bug, Wifi, Globe, Lock,
  Key, GitBranch, Rocket, Server, Upload, Users, Info,
  ShieldAlert, ShieldCheck, Package, RotateCcw, Pencil,
  FilePlus, FileX, FileEdit
} from "lucide-react";

const API = "/api";

interface ModelSlot {
  provider: string;
  model: string;
  enabled: boolean;
  creativity?: number;
  timeoutSeconds?: number;
  maxTokens?: number;
}

interface AgentConfig {
  id: string;
  agentKey: string;
  displayNameEn: string;
  displayNameAr: string;
  description: string;
  enabled: boolean;
  isCustom: boolean;
  governorEnabled: boolean;
  autoGovernor: boolean;
  governorModel: { provider: string; model: string; creativity: number; timeoutSeconds: number; maxTokens: number } | null;
  primaryModel: ModelSlot;
  secondaryModel: ModelSlot | null;
  tertiaryModel: ModelSlot | null;
  systemPrompt: string;
  instructions: string;
  permissions: string[];
  pipelineOrder: number;
  receivesFrom: string;
  sendsTo: string;
  roleOnReceive: string;
  roleOnSend: string;
  tokenLimit: number;
  batchSize: number;
  creativity: string;
  shortTermMemory: any[];
  longTermMemory: any[];
  sourceFiles: string[];
  totalTokensUsed: number;
  totalTasksCompleted: number;
  totalErrors: number;
  avgExecutionMs: number;
  totalCostUsd: string;
}

interface AgentStats {
  agentKey: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  totalTokens: number;
  totalCost: string;
  avgDurationMs: number;
  successRate: number;
  recentTasks: any[];
}

const MODEL_OPTIONS = [
  { provider: "openai", model: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
  { provider: "openai", model: "gpt-5.4", label: "GPT-5.4" },
  { provider: "openai", model: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { provider: "openai", model: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { provider: "openai", model: "gpt-5.3-chat-latest", label: "GPT-5.3" },
  { provider: "openai", model: "gpt-5.2-pro", label: "GPT-5.2 Pro" },
  { provider: "openai", model: "gpt-5.2", label: "GPT-5.2" },
  { provider: "openai", model: "gpt-5.1", label: "GPT-5.1" },
  { provider: "openai", model: "gpt-5-pro", label: "GPT-5 Pro" },
  { provider: "openai", model: "gpt-5", label: "GPT-5" },
  { provider: "openai", model: "gpt-5-mini", label: "GPT-5 Mini" },
  { provider: "openai", model: "gpt-5-nano", label: "GPT-5 Nano" },
  { provider: "openai", model: "o3-pro", label: "OpenAI o3 Pro" },
  { provider: "openai", model: "o3", label: "OpenAI o3" },
  { provider: "openai", model: "o3-mini", label: "OpenAI o3 Mini" },
  { provider: "openai", model: "o4-mini", label: "OpenAI o4-mini" },
  { provider: "openai", model: "o1-pro", label: "OpenAI o1 Pro" },
  { provider: "openai", model: "o1", label: "OpenAI o1" },
  { provider: "openai", model: "gpt-4.1", label: "GPT-4.1" },
  { provider: "openai", model: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { provider: "openai", model: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o" },
  { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o Mini" },
  { provider: "anthropic", model: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { provider: "anthropic", model: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { provider: "anthropic", model: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
  { provider: "anthropic", model: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { provider: "anthropic", model: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { provider: "anthropic", model: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { provider: "anthropic", model: "claude-haiku-3-5-20241022", label: "Claude Haiku 3.5" },
  { provider: "google", model: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { provider: "google", model: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { provider: "google", model: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { provider: "google", model: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite" },
  { provider: "local", model: "none", label: "Local (No AI)" },
];

function getModelLabel(provider: string, model: string) {
  const found = MODEL_OPTIONS.find(m => m.provider === provider && m.model === model);
  return found?.label || `${provider}/${model}`;
}

export default function AgentManagement() {
  const { t, lang } = useI18n();
  const isRTL = lang === "ar";
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("models");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [stats, setStats] = useState<Record<string, AgentStats>>({});
  const [showNewAgent, setShowNewAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ key: "", nameEn: "", nameAr: "", description: "" });

  useEffect(() => {
    fetchAgents();
  }, []);

  async function fetchAgents() {
    try {
      const res = await fetch(`${API}/agents/configs`, { credentials: "include" });
      const data = await res.json();
      const allAgents = (data.agents || []) as AgentConfig[];
      const enabledAgents = allAgents.filter((a: AgentConfig) => a.enabled);
      setAgents(enabledAgents);
      if (enabledAgents.length > 0 && !selectedAgent) {
        setSelectedAgent(enabledAgents[0].agentKey);
      }
    } catch (e) {
      console.error("Failed to load agents:", e);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats(agentKey: string) {
    try {
      const res = await fetch(`${API}/agents/stats/${agentKey}`, { credentials: "include" });
      const data = await res.json();
      setStats(prev => ({ ...prev, [agentKey]: data }));
    } catch (e) {
      console.error("Failed to load stats:", e);
    }
  }

  useEffect(() => {
    if (selectedAgent && activeTab === "stats") {
      fetchStats(selectedAgent);
    }
  }, [selectedAgent, activeTab]);

  const currentAgent = agents.find(a => a.agentKey === selectedAgent);

  function updateAgent(agentKey: string, updates: Partial<AgentConfig>) {
    setAgents(prev => prev.map(a => a.agentKey === agentKey ? { ...a, ...updates } : a));
  }

  async function saveAgent(agent: AgentConfig) {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`${API}/agents/configs/${agent.agentKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(agent),
      });
      if (res.ok) {
        setSaveMsg(isRTL ? "تم الحفظ بنجاح ✓" : "Saved successfully ✓");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        setSaveMsg(isRTL ? "فشل الحفظ" : "Save failed");
      }
    } catch (e) {
      setSaveMsg(isRTL ? "خطأ في الاتصال" : "Connection error");
    } finally {
      setSaving(false);
    }
  }

  async function createAgent() {
    if (!newAgent.key || !newAgent.nameEn || !newAgent.nameAr) return;
    try {
      const res = await fetch(`${API}/agents/configs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          agentKey: newAgent.key,
          displayNameEn: newAgent.nameEn,
          displayNameAr: newAgent.nameAr,
          description: newAgent.description,
          primaryModel: { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: true },
        }),
      });
      if (res.ok) {
        setShowNewAgent(false);
        setNewAgent({ key: "", nameEn: "", nameAr: "", description: "" });
        await fetchAgents();
      }
    } catch (e) {
      console.error("Failed to create agent:", e);
    }
  }

  async function deleteAgent(agentKey: string) {
    if (!confirm(isRTL ? "هل أنت متأكد من حذف هذا الوكيل؟" : "Are you sure you want to delete this agent?")) return;
    try {
      await fetch(`${API}/agents/configs/${agentKey}`, { method: "DELETE", credentials: "include" });
      setAgents(prev => prev.filter(a => a.agentKey !== agentKey));
      if (selectedAgent === agentKey) {
        setSelectedAgent(agents.find(a => a.agentKey !== agentKey)?.agentKey || null);
      }
    } catch (e) {
      console.error("Failed to delete agent:", e);
    }
  }

  async function resetAgent(agentKey: string) {
    if (!confirm(isRTL ? "هل أنت متأكد من إعادة هذا الوكيل للإعدادات الافتراضية؟" : "Reset this agent to factory defaults?")) return;
    try {
      const res = await fetch(`${API}/agents/reset/${agentKey}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        setAgents(prev => prev.map(a => a.agentKey === agentKey ? updated : a));
        setSaveMsg(isRTL ? "تمت إعادة الوكيل للافتراضي ✓" : "Agent reset to defaults ✓");
        setTimeout(() => setSaveMsg(""), 3000);
      } else {
        setSaveMsg(isRTL ? "فشل الإعادة — قد يكون وكيل مخصص" : "Reset failed — may be a custom agent");
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (e) {
      console.error("Failed to reset agent:", e);
    }
  }

  async function resetAllAgents() {
    if (!confirm(isRTL
      ? "هل أنت متأكد من إعادة جميع الوكلاء للإعدادات الافتراضية؟ سيتم حذف الوكلاء المخصصين."
      : "Reset ALL agents to factory defaults? Custom agents will be removed.")) return;
    try {
      const res = await fetch(`${API}/agents/reset-all`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
        setSaveMsg(isRTL ? `تمت إعادة ${data.resetCount} وكيل للافتراضي ✓` : `${data.resetCount} agents reset to defaults ✓`);
        setTimeout(() => setSaveMsg(""), 3000);
      }
    } catch (e) {
      console.error("Failed to reset all agents:", e);
    }
  }

  async function savePipelineOrder() {
    const pipelineAgents = agents.filter(a => a.pipelineOrder > 0).sort((a, b) => a.pipelineOrder - b.pipelineOrder);
    const order = pipelineAgents.map(a => ({
      agentKey: a.agentKey,
      pipelineOrder: a.pipelineOrder,
      receivesFrom: a.receivesFrom,
      sendsTo: a.sendsTo,
    }));
    try {
      await fetch(`${API}/agents/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ order }),
      });
      setSaveMsg(isRTL ? "تم حفظ الترتيب ✓" : "Order saved ✓");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e) {
      console.error("Failed to save order:", e);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0e1117] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-[#7c3aed]" />
      </div>
    );
  }

  const tabs = [
    { key: "models", icon: Cpu, label: isRTL ? "النماذج والحاكم" : "Models & Governor" },
    { key: "prompt", icon: MessageSquare, label: isRTL ? "التوجيهات" : "Directives" },
    { key: "memory", icon: Brain, label: isRTL ? "الذاكرة" : "Memory" },
    { key: "permissions", icon: Shield, label: isRTL ? "الصلاحيات" : "Permissions" },
    { key: "instructions", icon: FileText, label: isRTL ? "التعليمات" : "Instructions" },
    { key: "pipeline", icon: ArrowUpDown, label: isRTL ? "خط الأنابيب" : "Pipeline" },
    { key: "tokens", icon: Coins, label: isRTL ? "التوكن والدفعات" : "Tokens & Batches" },
    { key: "code", icon: Code, label: isRTL ? "الكود المصدري" : "Source Code" },
    { key: "logs", icon: ScrollText, label: isRTL ? "السجلات" : "Logs" },
    { key: "stats", icon: BarChart2, label: isRTL ? "الإحصائيات" : "Statistics" },
    { key: "approvals", icon: ShieldCheck, label: isRTL ? "الموافقات" : "Approvals" },
    { key: "audit", icon: ScrollText, label: isRTL ? "سجل التدقيق" : "Audit Log" },
    { key: "deploy", icon: Rocket, label: isRTL ? "النشر للإنتاجية" : "Deploy" },
  ];

  return (
    <div className={`min-h-screen bg-[#0e1117] text-[#e2e8f0] flex ${isRTL ? "flex-row-reverse" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="w-[260px] min-w-[260px] bg-[#161b22] border-r border-white/7 flex flex-col h-screen overflow-hidden">
        <div className="p-3 border-b border-white/7 flex items-center gap-2">
          <Link href="/dashboard" className="text-[#d4dae3] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Bot className="w-5 h-5 text-[#7c3aed]" />
          <span className="font-semibold text-sm">{isRTL ? "إدارة الوكلاء" : "Agent Management"}</span>
        </div>

        <div className="p-2 border-b border-white/7">
          <button
            onClick={resetAllAgents}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[12px] text-orange-400 bg-orange-400/10 hover:bg-orange-400/20 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {isRTL ? "إعادة النظام للافتراضي" : "Reset System Defaults"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] uppercase tracking-wider text-[#d4dae3] px-2 py-1 mb-1">
            {isRTL ? "وكلاء البنية التحتية" : "Infrastructure Agents"}
          </div>
          {agents.filter(a => a.agentKey.startsWith("infra_")).sort((a, b) => a.pipelineOrder - b.pipelineOrder).map(agent => (
            <AgentListItem
              key={agent.agentKey}
              agent={agent}
              selected={selectedAgent === agent.agentKey}
              onClick={() => setSelectedAgent(agent.agentKey)}
              isRTL={isRTL}
            />
          ))}

          <div className="text-[10px] uppercase tracking-wider text-[#d4dae3] px-2 py-1 mt-3 mb-1">
            {isRTL ? "وكلاء الخدمة" : "Service Agents"}
          </div>
          {agents.filter(a => !a.agentKey.startsWith("infra_")).sort((a, b) => a.pipelineOrder - b.pipelineOrder).map(agent => (
            <AgentListItem
              key={agent.agentKey}
              agent={agent}
              selected={selectedAgent === agent.agentKey}
              onClick={() => setSelectedAgent(agent.agentKey)}
              isRTL={isRTL}
            />
          ))}
        </div>

        <div className="p-2 border-t border-white/7">
          <button
            onClick={() => setShowNewAgent(true)}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[12px] text-[#7c3aed] bg-[#7c3aed]/10 hover:bg-[#7c3aed]/20 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {isRTL ? "إنشاء وكيل جديد" : "Create New Agent"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {saveMsg && (
          <div className="bg-green-500/10 border-b border-green-500/20 px-4 py-2 text-green-400 text-sm text-center">
            {saveMsg}
          </div>
        )}

        {currentAgent && getAgentBadge(currentAgent) === "thinker" && currentAgent.permissions?.some(p => DANGEROUS_PERMISSIONS.includes(p)) && (
          <div className="bg-red-500/10 border-b border-red-500/20 px-4 py-2 text-red-400 text-[12px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {isRTL
              ? `تحذير: وكيل "${currentAgent.displayNameAr}" من نوع "مفكر" لكنه يملك صلاحيات تنفيذية خطيرة. يُفضل إزالة: ${currentAgent.permissions.filter(p => DANGEROUS_PERMISSIONS.includes(p)).join(", ")}`
              : `Warning: "${currentAgent.displayNameEn}" is a Thinker but has dangerous execution permissions. Consider removing: ${currentAgent.permissions.filter(p => DANGEROUS_PERMISSIONS.includes(p)).join(", ")}`
            }
          </div>
        )}

        {currentAgent ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/7 bg-[#161b22]/50">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${currentAgent.enabled ? "bg-[#7c3aed]/20" : "bg-red-500/20"}`}>
                  <Bot className={`w-4 h-4 ${currentAgent.enabled ? "text-[#7c3aed]" : "text-red-400"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-sm">{isRTL ? currentAgent.displayNameAr : currentAgent.displayNameEn}</h2>
                    {(() => {
                      const b = getAgentBadge(currentAgent);
                      const bi = BADGE_CONFIG[b];
                      return bi ? <span className={`text-[9px] px-2 py-0.5 rounded-full ${bi.color}`}>{isRTL ? bi.labelAr : bi.label}</span> : null;
                    })()}
                  </div>
                  <p className="text-[11px] text-[#d4dae3]">{currentAgent.agentKey} • {isRTL ? "ترتيب" : "Order"}: {currentAgent.pipelineOrder}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateAgent(currentAgent.agentKey, { enabled: !currentAgent.enabled })}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors border border-white/10 hover:border-white/20"
                >
                  {currentAgent.enabled ? (
                    <><ToggleRight className="w-4 h-4 text-green-400" /><span className="text-green-400">{isRTL ? "مفعّل" : "Enabled"}</span></>
                  ) : (
                    <><ToggleLeft className="w-4 h-4 text-red-400" /><span className="text-red-400">{isRTL ? "معطّل" : "Disabled"}</span></>
                  )}
                </button>
                {!currentAgent.isCustom && (
                  <button
                    onClick={() => resetAgent(currentAgent.agentKey)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-orange-400 border border-orange-400/30 hover:bg-orange-400/10 transition-colors"
                    title={isRTL ? "إعادة للافتراضي" : "Reset to defaults"}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    {isRTL ? "افتراضي" : "Reset"}
                  </button>
                )}
                {currentAgent.isCustom && (
                  <button onClick={() => deleteAgent(currentAgent.agentKey)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => saveAgent(currentAgent)}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[12px] bg-[#7c3aed] hover:bg-[#6d28d9] text-white transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? (isRTL ? "جاري الحفظ..." : "Saving...") : (isRTL ? "حفظ" : "Save")}
                </button>
              </div>
            </div>

            <div className="flex border-b border-white/7 overflow-x-auto bg-[#161b22]/30">
              {tabs.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[11.5px] whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? "border-[#7c3aed] text-[#e2e8f0]"
                      : "border-transparent text-[#d4dae3] hover:text-[#c9d1d9]"
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {activeTab === "models" && <ModelsTab agent={currentAgent} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} isRTL={isRTL} />}
              {activeTab === "prompt" && <PromptTab agent={currentAgent} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} isRTL={isRTL} />}
              {activeTab === "memory" && <MemoryTab agent={currentAgent} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} isRTL={isRTL} />}
              {activeTab === "permissions" && <PermissionsTab agent={currentAgent} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} isRTL={isRTL} />}
              {activeTab === "instructions" && <InstructionsTab agent={currentAgent} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} isRTL={isRTL} />}
              {activeTab === "pipeline" && <PipelineTab agent={currentAgent} agents={agents} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} onSaveOrder={savePipelineOrder} isRTL={isRTL} />}
              {activeTab === "tokens" && <TokensTab agent={currentAgent} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} isRTL={isRTL} />}
              {activeTab === "code" && <CodeTab agent={currentAgent} onUpdate={(u) => updateAgent(currentAgent.agentKey, u)} isRTL={isRTL} />}
              {activeTab === "logs" && <LogsTab agent={currentAgent} isRTL={isRTL} />}
              {activeTab === "stats" && <StatsTab agent={currentAgent} stats={stats[currentAgent.agentKey]} isRTL={isRTL} />}
              {activeTab === "approvals" && <ApprovalsTab isRTL={isRTL} />}
              {activeTab === "audit" && <AuditLogTab isRTL={isRTL} />}
              {activeTab === "deploy" && <DeployTab isRTL={isRTL} />}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#d4dae3]">
            {isRTL ? "اختر وكيلاً من القائمة" : "Select an agent from the list"}
          </div>
        )}
      </div>

      {showNewAgent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={() => setShowNewAgent(false)}>
          <div className="bg-[#161b22] border border-white/10 rounded-xl w-[420px] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-4">{isRTL ? "إنشاء وكيل جديد" : "Create New Agent"}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "المفتاح (بالإنجليزية)" : "Agent Key (English)"}</label>
                <input value={newAgent.key} onChange={e => setNewAgent(p => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="my_custom_agent" />
              </div>
              <div>
                <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "الاسم بالإنجليزية" : "Name (English)"}</label>
                <input value={newAgent.nameEn} onChange={e => setNewAgent(p => ({ ...p, nameEn: e.target.value }))} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="My Custom Agent" />
              </div>
              <div>
                <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "الاسم بالعربية" : "Name (Arabic)"}</label>
                <input value={newAgent.nameAr} onChange={e => setNewAgent(p => ({ ...p, nameAr: e.target.value }))} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="وكيلي المخصص" dir="rtl" />
              </div>
              <div>
                <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "الوصف" : "Description"}</label>
                <textarea value={newAgent.description} onChange={e => setNewAgent(p => ({ ...p, description: e.target.value }))} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm h-20 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowNewAgent(false)} className="px-4 py-2 rounded-lg text-sm border border-white/10 hover:bg-white/5">{isRTL ? "إلغاء" : "Cancel"}</button>
              <button onClick={createAgent} className="px-4 py-2 rounded-lg text-sm bg-[#7c3aed] hover:bg-[#6d28d9] text-white">{isRTL ? "إنشاء" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const BADGE_CONFIG: Record<string, { label: string; labelAr: string; color: string; icon: typeof Brain }> = {
  thinker: { label: "Thinker", labelAr: "مفكر", color: "text-blue-400 bg-blue-400/10", icon: Brain },
  executor: { label: "Executor", labelAr: "منفذ", color: "text-emerald-400 bg-emerald-400/10", icon: Zap },
  specialist: { label: "Specialist", labelAr: "متخصص", color: "text-purple-400 bg-purple-400/10", icon: Settings },
  infra: { label: "Infra", labelAr: "بنية", color: "text-orange-400 bg-orange-400/10", icon: Server },
};

const DANGEROUS_PERMISSIONS = ["modify_code", "write_files", "database_write", "git_push", "deploy", "db_admin", "exec_command"];

function getAgentBadge(agent: AgentConfig): string {
  const key = agent.agentKey;
  if (key === "strategic") return "thinker";
  if (key === "execution_engine" || key === "infra_builder" || key === "infra_deploy") return "executor";
  if (key === "infra_sysadmin") return "thinker";
  return "specialist";
}

function AgentListItem({ agent, selected, onClick, isRTL }: { agent: AgentConfig; selected: boolean; onClick: () => void; isRTL: boolean }) {
  const badge = getAgentBadge(agent);
  const badgeInfo = BADGE_CONFIG[badge];
  const hasDangerousPerms = agent.agentKey === "strategic" && agent.permissions?.some(p => DANGEROUS_PERMISSIONS.includes(p));

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2 py-2 rounded-md text-[12px] text-start transition-colors ${
        selected ? "bg-[#7c3aed]/15 text-[#e2e8f0]" : "text-[#d4dae3] hover:bg-white/5"
      }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${agent.enabled ? "bg-green-400" : "bg-red-400"}`} />
      <span className="truncate flex-1">{isRTL ? agent.displayNameAr : agent.displayNameEn}</span>
      {badgeInfo && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${badgeInfo.color}`}>
          {isRTL ? badgeInfo.labelAr : badgeInfo.label}
        </span>
      )}
      {hasDangerousPerms && <AlertTriangle className="w-3 h-3 text-red-400 flex-shrink-0" />}
      {agent.governorEnabled && <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
    </button>
  );
}

function getCreativityLabel(value: number, isRTL: boolean): { label: string; color: string } {
  if (value <= 0.3) return { label: isRTL ? "متزن" : "Balanced", color: "text-blue-400" };
  if (value <= 0.6) return { label: isRTL ? "متوسط" : "Moderate", color: "text-cyan-400" };
  if (value <= 1.0) return { label: isRTL ? "ذكي" : "Smart", color: "text-green-400" };
  if (value <= 1.4) return { label: isRTL ? "مبدع" : "Creative", color: "text-yellow-400" };
  return { label: isRTL ? "مبدع جداً" : "Very Creative", color: "text-orange-400" };
}

function formatTokens(val: number): string {
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`;
  return String(val);
}

function ModelSlotEditor({ slot, index, onChange, isRTL }: { slot: ModelSlot | null; index: number; onChange: (s: ModelSlot) => void; isRTL: boolean }) {
  const labels = [isRTL ? "النموذج الأساسي" : "Primary Model", isRTL ? "النموذج الثانوي" : "Secondary Model", isRTL ? "النموذج الثالث" : "Tertiary Model"];
  const current = slot || { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 };
  const creativity = current.creativity ?? 0.7;
  const timeoutSeconds = current.timeoutSeconds ?? 240;
  const maxTokens = current.maxTokens ?? 16000;
  const creativityInfo = getCreativityLabel(creativity, isRTL);

  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium">{labels[index]}</span>
        <button
          onClick={() => onChange({ ...current, enabled: !current.enabled })}
          className={`text-[11px] px-2 py-0.5 rounded-full ${current.enabled ? "bg-green-500/15 text-green-400" : "bg-white/5 text-[#d4dae3]"}`}
        >
          {current.enabled ? (isRTL ? "مفعّل" : "Active") : (isRTL ? "معطّل" : "Off")}
        </button>
      </div>
      <select
        value={`${current.provider}::${current.model}`}
        onChange={e => {
          const [provider, model] = e.target.value.split("::");
          onChange({ ...current, provider, model });
        }}
        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#e2e8f0] mb-3"
      >
        {MODEL_OPTIONS.map(m => (
          <option key={`${m.provider}::${m.model}`} value={`${m.provider}::${m.model}`}>{m.label}</option>
        ))}
      </select>

      <div className="space-y-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-[#d4dae3]">{isRTL ? "الإبداع" : "Creativity"}</label>
            <span className={`text-[10px] font-medium ${creativityInfo.color}`}>{creativityInfo.label} ({creativity.toFixed(2)})</span>
          </div>
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={creativity}
            onChange={e => onChange({ ...current, creativity: parseFloat(e.target.value) })}
            className="w-full accent-[#7c3aed] h-1.5"
          />
          <div className="flex justify-between text-[9px] text-[#d4dae3]/50 mt-0.5">
            <span>{isRTL ? "متزن" : "Balanced"}</span>
            <span>{isRTL ? "متوسط" : "Moderate"}</span>
            <span>{isRTL ? "ذكي" : "Smart"}</span>
            <span>{isRTL ? "مبدع" : "Creative"}</span>
            <span>{isRTL ? "مبدع جداً" : "Very Creative"}</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-[#d4dae3]">{isRTL ? "التوكن" : "Tokens"}</label>
            <span className="text-[10px] font-mono text-[#e2e8f0]">{formatTokens(maxTokens)}</span>
          </div>
          <input
            type="range"
            min="1000"
            max="120000"
            step="1000"
            value={maxTokens}
            onChange={e => onChange({ ...current, maxTokens: parseInt(e.target.value) })}
            className="w-full accent-[#3b82f6] h-1.5"
          />
          <div className="flex justify-between text-[9px] text-[#d4dae3]/50 mt-0.5">
            <span>1K</span>
            <span>30K</span>
            <span>60K</span>
            <span>90K</span>
            <span>120K</span>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-[#d4dae3]">{isRTL ? "المهلة (ثانية)" : "Timeout (s)"}</label>
            <span className="text-[10px] font-mono text-[#e2e8f0]">{timeoutSeconds}s</span>
          </div>
          <input
            type="number"
            min="10"
            max="600"
            step="10"
            value={timeoutSeconds}
            onChange={e => onChange({ ...current, timeoutSeconds: parseInt(e.target.value) || 240 })}
            className="w-full bg-[#161b22] border border-white/10 rounded px-2 py-1 text-[11px] text-[#e2e8f0]"
          />
        </div>
      </div>
    </div>
  );
}

function ModelsTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="font-medium text-sm">{isRTL ? "نظام الحاكم (Governor)" : "Governor System"}</span>
          </div>
          <button
            onClick={() => {
              const updates: Partial<AgentConfig> = { governorEnabled: !agent.governorEnabled };
              if (!agent.governorEnabled) updates.autoGovernor = false;
              onUpdate(updates);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors ${
              agent.governorEnabled ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" : "bg-white/5 text-[#d4dae3] border border-white/10"
            }`}
          >
            {agent.governorEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {agent.governorEnabled ? (isRTL ? "دمج مفعّل" : "Merge Active") : (isRTL ? "بدون دمج" : "No Merge")}
          </button>
        </div>
        <p className="text-[11px] text-[#d4dae3] leading-relaxed mb-3">
          {isRTL
            ? "عند تفعيل الحاكم: النماذج الثلاثة تفكّر بنفس المشكلة بشكل مستقل، ثم الحاكم يأخذ أفضل الأفكار من كل نموذج ويدمجها في حل نهائي متفوّق. عند التعطيل: يعمل النموذج الأساسي فقط."
            : "When enabled: All 3 models think independently about the same problem, then the Governor extracts the best ideas from each and merges them into a superior final solution. When disabled: Only the primary model is used."
          }
        </p>

        <div className="bg-[#0d1117] border border-white/7 rounded-lg p-3 mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[12px] font-medium text-emerald-400">{isRTL ? "الحاكم التلقائي (Auto-Governor)" : "Auto-Governor"}</span>
            </div>
            <button
              onClick={() => {
                const updates: Partial<AgentConfig> = { autoGovernor: !agent.autoGovernor };
                if (!agent.autoGovernor) updates.governorEnabled = false;
                onUpdate(updates);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors ${
                agent.autoGovernor ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-[#d4dae3] border border-white/10"
              }`}
            >
              {agent.autoGovernor ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              {agent.autoGovernor ? (isRTL ? "مفعّل" : "Active") : (isRTL ? "معطّل" : "Off")}
            </button>
          </div>
          <p className="text-[10px] text-[#d4dae3] mt-2 leading-relaxed">
            {isRTL
              ? "يقدّر تعقيد الرسالة تلقائياً (0-100) ويختار الوضع المناسب: بسيط (نموذج خفيف) → عادي (النموذج الأساسي) → متقدم (3 نماذج + حاكم). يصعّد تلقائياً لو الرد ضعيف. يوفّر التوكنات والوقت."
              : "Automatically scores message complexity (0-100) and picks the right mode: Simple (lightweight model) → Standard (main model) → Advanced (3 models + judge). Auto-escalates if response quality is low. Saves tokens and time."
            }
          </p>
          {agent.autoGovernor && (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              <div className="bg-[#161b22] rounded px-2 py-1.5 text-center">
                <div className="text-[10px] text-emerald-400 font-medium">{isRTL ? "بسيط" : "Simple"}</div>
                <div className="text-[9px] text-[#d4dae3]">{isRTL ? "0-20 نقطة" : "0-20 pts"}</div>
                <div className="text-[9px] text-[#6e7681]">{isRTL ? "نموذج خفيف" : "Lightweight"}</div>
              </div>
              <div className="bg-[#161b22] rounded px-2 py-1.5 text-center">
                <div className="text-[10px] text-blue-400 font-medium">{isRTL ? "عادي" : "Standard"}</div>
                <div className="text-[9px] text-[#d4dae3]">{isRTL ? "21-55 نقطة" : "21-55 pts"}</div>
                <div className="text-[9px] text-[#6e7681]">{isRTL ? "النموذج الأساسي" : "Main model"}</div>
              </div>
              <div className="bg-[#161b22] rounded px-2 py-1.5 text-center">
                <div className="text-[10px] text-orange-400 font-medium">{isRTL ? "متقدم" : "Advanced"}</div>
                <div className="text-[9px] text-[#d4dae3]">{isRTL ? "56-100 نقطة" : "56-100 pts"}</div>
                <div className="text-[9px] text-[#6e7681]">{isRTL ? "3 نماذج + حاكم" : "3 models + judge"}</div>
              </div>
            </div>
          )}
        </div>

        {agent.governorEnabled && (() => {
          const gov = agent.governorModel || { provider: "", model: "", creativity: 0.5, timeoutSeconds: 300, maxTokens: 16000 };
          return (
          <div className="bg-[#0d1117] border border-yellow-500/20 rounded-lg p-3 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[12px] font-medium text-yellow-400">{isRTL ? "نموذج الحاكم (من يدمج النتائج)" : "Governor Model (who merges results)"}</span>
            </div>
            <p className="text-[10px] text-[#d4dae3] mb-2">
              {isRTL
                ? "أنت تعيّن أي نموذج يكون الحاكم — هو الذي يستلم اقتراحات النماذج الثلاثة ويستخرج أفضل حل نهائي."
                : "You choose which model serves as the Governor — it receives all proposals and produces the final merged solution."
              }
            </p>
            <select
              value={gov.provider && gov.model ? `${gov.provider}::${gov.model}` : ""}
              onChange={e => {
                if (e.target.value === "") {
                  onUpdate({ governorModel: null } as any);
                } else {
                  const [provider, model] = e.target.value.split("::");
                  onUpdate({ governorModel: { provider, model, creativity: gov.creativity ?? 0.5, timeoutSeconds: gov.timeoutSeconds ?? 300, maxTokens: gov.maxTokens ?? 16000 } } as any);
                }
              }}
              className="w-full bg-[#161b22] border border-yellow-500/20 rounded-lg px-3 py-2 text-[12px] text-[#e2e8f0]"
            >
              <option value="">{isRTL ? "تلقائي (يستخدم النموذج الأساسي)" : "Auto (uses primary model)"}</option>
              {MODEL_OPTIONS.filter(m => m.provider !== "local").map(m => (
                <option key={`${m.provider}::${m.model}`} value={`${m.provider}::${m.model}`}>{m.label}</option>
              ))}
            </select>

            {gov.provider && gov.model && (() => {
              const govCreativityInfo = getCreativityLabel(gov.creativity ?? 0.5, isRTL);
              return (
              <div className="space-y-2.5 mt-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-yellow-400/70">{isRTL ? "إبداع الحاكم" : "Governor Creativity"}</label>
                    <span className={`text-[10px] font-medium ${govCreativityInfo.color}`}>{govCreativityInfo.label} ({(gov.creativity ?? 0.5).toFixed(2)})</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.05"
                    value={gov.creativity ?? 0.5}
                    onChange={e => onUpdate({ governorModel: { ...gov, creativity: parseFloat(e.target.value) } } as any)}
                    className="w-full accent-yellow-400 h-1.5"
                  />
                  <div className="flex justify-between text-[9px] text-yellow-400/30 mt-0.5">
                    <span>{isRTL ? "متزن" : "Balanced"}</span>
                    <span>{isRTL ? "متوسط" : "Moderate"}</span>
                    <span>{isRTL ? "ذكي" : "Smart"}</span>
                    <span>{isRTL ? "مبدع" : "Creative"}</span>
                    <span>{isRTL ? "مبدع جداً" : "Very Creative"}</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-yellow-400/70">{isRTL ? "توكن الحاكم" : "Governor Tokens"}</label>
                    <span className="text-[10px] font-mono text-yellow-400">{formatTokens(gov.maxTokens ?? 16000)}</span>
                  </div>
                  <input
                    type="range"
                    min="1000"
                    max="120000"
                    step="1000"
                    value={gov.maxTokens ?? 16000}
                    onChange={e => onUpdate({ governorModel: { ...gov, maxTokens: parseInt(e.target.value) } } as any)}
                    className="w-full accent-yellow-500 h-1.5"
                  />
                  <div className="flex justify-between text-[9px] text-yellow-400/30 mt-0.5">
                    <span>1K</span>
                    <span>30K</span>
                    <span>60K</span>
                    <span>90K</span>
                    <span>120K</span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-yellow-400/70">{isRTL ? "مهلة الحاكم (ثانية)" : "Governor Timeout (s)"}</label>
                    <span className="text-[10px] font-mono text-yellow-400">{gov.timeoutSeconds ?? 300}s</span>
                  </div>
                  <input
                    type="number"
                    min="30"
                    max="600"
                    step="10"
                    value={gov.timeoutSeconds ?? 300}
                    onChange={e => onUpdate({ governorModel: { ...gov, timeoutSeconds: parseInt(e.target.value) || 300 } } as any)}
                    className="w-full bg-[#161b22] border border-yellow-500/20 rounded px-2 py-1 text-[11px] text-yellow-400"
                  />
                </div>
              </div>
              );
            })()}
          </div>
          );
        })()}
      </div>

      <div className="grid gap-3">
        <ModelSlotEditor slot={agent.primaryModel} index={0} onChange={s => onUpdate({ primaryModel: s })} isRTL={isRTL} />
        <ModelSlotEditor slot={agent.secondaryModel} index={1} onChange={s => onUpdate({ secondaryModel: s })} isRTL={isRTL} />
        <ModelSlotEditor slot={agent.tertiaryModel} index={2} onChange={s => onUpdate({ tertiaryModel: s })} isRTL={isRTL} />
      </div>

      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12px] text-[#d4dae3]">{isRTL ? "الإعدادات لكل نموذج أعلاه" : "Settings configured per-model above"}</span>
        </div>
        <p className="text-[10px] text-[#d4dae3]/60">
          {isRTL
            ? "كل نموذج يمكن ضبط إبداعه وتوكنه ومهلته بشكل مستقل — غيّر القيم مباشرة في كل خانة نموذج."
            : "Each model has its own creativity, tokens, and timeout — adjust values directly in each model slot."
          }
        </p>
      </div>
    </div>
  );
}

function PromptTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <label className="text-[12px] text-[#d4dae3] mb-2 block">{isRTL ? "التوجيه الرئيسي (System Prompt)" : "System Prompt (Main Directive)"}</label>
        <textarea
          value={agent.systemPrompt}
          onChange={e => onUpdate({ systemPrompt: e.target.value })}
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-4 py-3 text-[13px] font-mono leading-relaxed resize-none min-h-[300px]"
          dir="ltr"
        />
        <p className="text-[10px] text-[#d4dae3] mt-1">{isRTL ? "هذا التوجيه يُرسل كرسالة نظام في كل طلب يتلقاه الوكيل" : "This prompt is sent as the system message in every request the agent receives"}</p>
      </div>
      <div>
        <label className="text-[12px] text-[#d4dae3] mb-2 block">{isRTL ? "الوصف" : "Description"}</label>
        <textarea
          value={agent.description || ""}
          onChange={e => onUpdate({ description: e.target.value } as any)}
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-4 py-3 text-[13px] resize-none h-24"
        />
      </div>
    </div>
  );
}

function MemoryTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  const [newShortMem, setNewShortMem] = useState("");
  const [newLongMem, setNewLongMem] = useState("");

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          {isRTL ? "الذاكرة قصيرة المدى" : "Short-Term Memory"}
        </h3>
        <p className="text-[11px] text-[#d4dae3] mb-3">{isRTL ? "سياقات مؤقتة تُمسح بعد كل بناء" : "Temporary context, cleared after each build"}</p>
        <div className="space-y-2 mb-3">
          {(agent.shortTermMemory || []).map((item: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-[#0d1117] rounded-lg p-2 text-[12px]">
              <span className="flex-1">{typeof item === "string" ? item : JSON.stringify(item)}</span>
              <button onClick={() => {
                const updated = [...(agent.shortTermMemory || [])];
                updated.splice(i, 1);
                onUpdate({ shortTermMemory: updated });
              }} className="text-red-400 hover:text-red-300 flex-shrink-0"><XCircle className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newShortMem} onChange={e => setNewShortMem(e.target.value)} className="flex-1 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]" placeholder={isRTL ? "أضف ذاكرة..." : "Add memory..."} />
          <button onClick={() => { if (newShortMem.trim()) { onUpdate({ shortTermMemory: [...(agent.shortTermMemory || []), newShortMem.trim()] }); setNewShortMem(""); } }} className="px-3 py-2 bg-blue-500/15 text-blue-400 rounded-lg text-[12px]">+</button>
        </div>
      </div>

      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          {isRTL ? "الذاكرة بعيدة المدى" : "Long-Term Memory"}
        </h3>
        <p className="text-[11px] text-[#d4dae3] mb-3">{isRTL ? "تعلّمات دائمة تُحفظ عبر الجلسات" : "Persistent learnings saved across sessions"}</p>
        <div className="space-y-2 mb-3">
          {(agent.longTermMemory || []).map((item: any, i: number) => (
            <div key={i} className="flex items-start gap-2 bg-[#0d1117] rounded-lg p-2 text-[12px]">
              <span className="flex-1">{typeof item === "string" ? item : JSON.stringify(item)}</span>
              <button onClick={() => {
                const updated = [...(agent.longTermMemory || [])];
                updated.splice(i, 1);
                onUpdate({ longTermMemory: updated });
              }} className="text-red-400 hover:text-red-300 flex-shrink-0"><XCircle className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={newLongMem} onChange={e => setNewLongMem(e.target.value)} className="flex-1 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]" placeholder={isRTL ? "أضف تعلّم دائم..." : "Add learning..."} />
          <button onClick={() => { if (newLongMem.trim()) { onUpdate({ longTermMemory: [...(agent.longTermMemory || []), newLongMem.trim()] }); setNewLongMem(""); } }} className="px-3 py-2 bg-purple-500/15 text-purple-400 rounded-lg text-[12px]">+</button>
        </div>
      </div>
    </div>
  );
}

function PermissionsTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  type RiskLevel = "low" | "medium" | "high" | "critical";
  interface PermDef { key: string; nameAr: string; nameEn: string; descAr: string; descEn: string; risk: RiskLevel; icon: any; category: string; }

  const cats = [
    { key: "search", nameAr: "البحث والاستكشاف", nameEn: "Search & Discovery", icon: Search },
    { key: "files", nameAr: "إدارة الملفات", nameEn: "File Management", icon: FileText },
    { key: "database", nameAr: "قاعدة البيانات", nameEn: "Database", icon: Database },
    { key: "system", nameAr: "النظام والأوامر", nameEn: "System & Commands", icon: Terminal },
    { key: "browser", nameAr: "المتصفح والفحص", nameEn: "Browser & Inspection", icon: Globe },
    { key: "deploy", nameAr: "النشر و Git", nameEn: "Deployment & Git", icon: Rocket },
    { key: "security", nameAr: "الأمان والتحكم", nameEn: "Security & Control", icon: Lock },
  ];

  const PERMS: PermDef[] = [
    { key: "search_text", nameAr: "البحث في الملفات", nameEn: "Search Files", descAr: "البحث عن أي نص في كل ملفات المشروع — عربي، إنجليزي، كود. مثل grep. أهم أداة للوكيل لإيجاد الكود المطلوب تعديله.", descEn: "Search for any text across all project files. Like grep. Most important tool.", risk: "low", icon: Search, category: "search" },
    { key: "list_files", nameAr: "تصفح المجلدات", nameEn: "List Files", descAr: "عرض محتويات أي مجلد في المشروع لمعرفة الملفات والمجلدات الموجودة.", descEn: "Browse directory contents to see files and folders.", risk: "low", icon: FolderOpen, category: "search" },
    { key: "list_components", nameAr: "عرض شجرة المكونات", nameEn: "List Components", descAr: "عرض شجرة مكونات React في مجلد website-builder مع أحجام الملفات.", descEn: "Show React component tree with file sizes.", risk: "low", icon: LayoutList, category: "search" },
    { key: "read_file", nameAr: "قراءة الملفات", nameEn: "Read File", descAr: "قراءة محتوى أي ملف في المشروع. ضروري لفهم الكود قبل تعديله.", descEn: "Read content of any file. Required before editing.", risk: "low", icon: Eye, category: "files" },
    { key: "view_page_source", nameAr: "عرض كود المكون", nameEn: "View Page Source", descAr: "قراءة كود مكون React محدد من مجلد website-builder.", descEn: "Read a specific React component source code.", risk: "low", icon: Code, category: "files" },
    { key: "write_file", nameAr: "كتابة الملفات", nameEn: "Write File", descAr: "إنشاء ملف جديد أو الكتابة فوق ملف موجود بالكامل. ⚠️ يمكن أن يمسح محتوى ملف كامل!", descEn: "Create new file or overwrite existing. Can erase entire file!", risk: "medium", icon: FilePlus, category: "files" },
    { key: "edit_component", nameAr: "تعديل المكونات", nameEn: "Edit Component", descAr: "تعديل جزء محدد من ملف (find & replace). أكثر أماناً من write_file لأنه يغير فقط الجزء المطلوب.", descEn: "Surgical edit — find & replace specific text. Safer than write_file.", risk: "medium", icon: FileEdit, category: "files" },
    { key: "create_component", nameAr: "إنشاء مكون جديد", nameEn: "Create Component", descAr: "إنشاء ملف مكون React جديد في مشروع website-builder.", descEn: "Create a new React component file.", risk: "medium", icon: FilePlus, category: "files" },
    { key: "delete_file", nameAr: "حذف الملفات", nameEn: "Delete File", descAr: "حذف ملف نهائياً من المشروع. ⚠️ لا يمكن التراجع بدون Git!", descEn: "Permanently delete a file. Cannot be undone without Git!", risk: "high", icon: FileX, category: "files" },
    { key: "rename_file", nameAr: "إعادة تسمية ملف", nameEn: "Rename File", descAr: "تغيير اسم أو نقل ملف من مكان لآخر.", descEn: "Rename or move a file.", risk: "medium", icon: Pencil, category: "files" },
    { key: "db_read", nameAr: "قراءة قاعدة البيانات", nameEn: "DB Read (SELECT)", descAr: "تنفيذ استعلامات SELECT فقط — قراءة البيانات بدون تعديل. آمن تماماً.", descEn: "Execute SELECT queries only — read without modification.", risk: "low", icon: Database, category: "database" },
    { key: "db_write", nameAr: "كتابة قاعدة البيانات", nameEn: "DB Write (INSERT/UPDATE/DELETE)", descAr: "إضافة وتعديل وحذف سجلات من الجداول. ⚠️ يمكن تعديل أو حذف بيانات المستخدمين!", descEn: "Insert, update, delete records. Can modify user data!", risk: "high", icon: Database, category: "database" },
    { key: "db_admin", nameAr: "إدارة هيكل القاعدة", nameEn: "DB Admin (DROP/ALTER/CREATE)", descAr: "إنشاء/حذف/تعديل الجداول نفسها. 🔴 خطير جداً — يمكن حذف جدول كامل!", descEn: "Create/drop/alter tables. DANGEROUS — can drop entire tables!", risk: "critical", icon: Database, category: "database" },
    { key: "db_tables", nameAr: "عرض الجداول", nameEn: "Show Tables", descAr: "عرض قائمة جداول قاعدة البيانات وأعمدتها. للاطلاع فقط.", descEn: "List database tables and columns. Read-only.", risk: "low", icon: Database, category: "database" },
    { key: "run_command", nameAr: "تنفيذ أوامر Shell", nameEn: "Run Shell Command", descAr: "تنفيذ أي أمر في الطرفية (terminal). 🔴 خطير — يمكن تنفيذ أي شيء على السيرفر!", descEn: "Execute any shell command. DANGEROUS — can run anything!", risk: "critical", icon: Terminal, category: "system" },
    { key: "exec_command", nameAr: "تنفيذ أوامر (بديل)", nameEn: "Exec Command (Alt)", descAr: "نفس run_command — تنفيذ أوامر shell على السيرفر.", descEn: "Same as run_command — execute shell commands.", risk: "critical", icon: Terminal, category: "system" },
    { key: "get_env", nameAr: "قراءة متغيرات البيئة", nameEn: "Read Env Vars", descAr: "عرض متغيرات البيئة (NODE_ENV, PORT, إلخ). يمكن كشف معلومات حساسة.", descEn: "View environment variables. May reveal sensitive info.", risk: "medium", icon: Key, category: "system" },
    { key: "set_env", nameAr: "تعيين متغيرات البيئة", nameEn: "Set Env Vars", descAr: "تعديل متغيرات البيئة. ⚠️ يمكن تغيير إعدادات حساسة مثل DATABASE_URL!", descEn: "Modify env vars. Can change sensitive settings!", risk: "high", icon: Key, category: "system" },
    { key: "system_status", nameAr: "حالة النظام", nameEn: "System Status", descAr: "عرض حالة النظام — اتصال قاعدة البيانات، الذاكرة، وقت التشغيل، عدد المستخدمين.", descEn: "Show system status — DB, memory, uptime, users.", risk: "low", icon: Activity, category: "system" },
    { key: "install_package", nameAr: "تثبيت حزم", nameEn: "Install Package", descAr: "تثبيت حزم npm/pnpm جديدة. ⚠️ يمكن تثبيت حزم ضارة!", descEn: "Install npm packages. Could install malicious packages!", risk: "high", icon: Package, category: "system" },
    { key: "restart_service", nameAr: "إعادة تشغيل الخدمة", nameEn: "Restart Service", descAr: "إعادة تشغيل خدمات السيرفر. قد يسبب توقف مؤقت للموقع.", descEn: "Restart server services. May cause brief downtime.", risk: "medium", icon: RefreshCw, category: "system" },
    { key: "screenshot_page", nameAr: "لقطة شاشة", nameEn: "Screenshot Page", descAr: "التقاط لقطة شاشة حقيقية لأي صفحة من الموقع باستخدام متصفح Chromium.", descEn: "Take a real screenshot of any page using Chromium.", risk: "low", icon: Camera, category: "browser" },
    { key: "click_element", nameAr: "النقر على عنصر", nameEn: "Click Element", descAr: "النقر على زر أو رابط في الصفحة. يمكنه تنفيذ إجراءات مثل الحذف!", descEn: "Click a button/link. Can trigger actions like delete!", risk: "medium", icon: MousePointer, category: "browser" },
    { key: "type_text", nameAr: "كتابة في حقل", nameEn: "Type Text", descAr: "كتابة نص في حقل إدخال في الصفحة.", descEn: "Type text into an input field.", risk: "medium", icon: Type, category: "browser" },
    { key: "hover_element", nameAr: "تمرير الماوس", nameEn: "Hover Element", descAr: "تمرير الماوس فوق عنصر لإظهار القوائم المنسدلة أو التلميحات.", descEn: "Hover to reveal dropdowns or tooltips.", risk: "low", icon: Move, category: "browser" },
    { key: "inspect_styles", nameAr: "فحص التصميم", nameEn: "Inspect Styles", descAr: "عرض CSS وتصميم أي عنصر — الألوان، الخطوط، الأبعاد.", descEn: "View CSS styles — colors, fonts, dimensions.", risk: "low", icon: Palette, category: "browser" },
    { key: "get_page_structure", nameAr: "بنية الصفحة", nameEn: "Page Structure", descAr: "عرض هيكل HTML للصفحة — العناوين، الروابط، الأزرار.", descEn: "View page HTML structure.", risk: "low", icon: LayoutList, category: "browser" },
    { key: "scroll_page", nameAr: "تمرير الصفحة", nameEn: "Scroll Page", descAr: "تمرير الصفحة لأعلى أو لأسفل والتقاط لقطة شاشة.", descEn: "Scroll page and take screenshot.", risk: "low", icon: ArrowDown, category: "browser" },
    { key: "get_console_errors", nameAr: "أخطاء المتصفح", nameEn: "Console Errors", descAr: "عرض أخطاء JavaScript في console الصفحة.", descEn: "View JavaScript console errors.", risk: "low", icon: Bug, category: "browser" },
    { key: "get_network_requests", nameAr: "طلبات الشبكة", nameEn: "Network Requests", descAr: "مراقبة طلبات HTTP — مفيد لتتبع الأخطاء.", descEn: "Monitor HTTP requests — useful for debugging.", risk: "low", icon: Wifi, category: "browser" },
    { key: "browse_page", nameAr: "تصفح نصي", nameEn: "Browse Page", descAr: "عرض محتوى الصفحة كنص بدون صور.", descEn: "View page content as text.", risk: "low", icon: Globe, category: "browser" },
    { key: "site_health", nameAr: "صحة الموقع", nameEn: "Site Health", descAr: "فحص سريع لمعرفة هل الموقع يعمل.", descEn: "Quick check if site is up.", risk: "low", icon: Activity, category: "browser" },
    { key: "git_push", nameAr: "رفع GitHub", nameEn: "Git Push", descAr: "حفظ التغييرات ورفعها لـ GitHub. يبدأ عملية CI/CD للنشر التلقائي.", descEn: "Commit and push to GitHub. Triggers CI/CD.", risk: "high", icon: Upload, category: "deploy" },
    { key: "trigger_deploy", nameAr: "نشر التطبيق", nameEn: "Trigger Deploy", descAr: "بدء عملية نشر جديدة على Google Cloud Run.", descEn: "Start new deployment to Cloud Run.", risk: "high", icon: Rocket, category: "deploy" },
    { key: "deploy_status", nameAr: "حالة النشر", nameEn: "Deploy Status", descAr: "عرض حالة آخر عملية نشر — نجحت أو فشلت.", descEn: "View latest deployment status.", risk: "low", icon: Activity, category: "deploy" },
    { key: "github_api", nameAr: "GitHub API", nameEn: "GitHub API", descAr: "تنفيذ أي طلب على GitHub API — issues, commits, branches.", descEn: "Execute any GitHub API request.", risk: "medium", icon: GitBranch, category: "deploy" },
    { key: "remote_server_api", nameAr: "API الإنتاج", nameEn: "Production API", descAr: "إرسال طلبات HTTP لسيرفر الإنتاج. ⚠️ يمكن تعديل بيانات الإنتاج!", descEn: "Send HTTP requests to production. Can modify prod data!", risk: "high", icon: Server, category: "deploy" },
    { key: "rollback_deploy", nameAr: "التراجع عن نشر", nameEn: "Rollback Deploy", descAr: "الرجوع لنسخة سابقة بعد نشر فاشل.", descEn: "Revert to previous version after failed deploy.", risk: "medium", icon: RotateCcw, category: "deploy" },
    { key: "manage_users", nameAr: "إدارة المستخدمين", nameEn: "Manage Users", descAr: "إضافة/تعديل/حذف مستخدمين. 🔴 يتحكم بصلاحيات الآخرين!", descEn: "Add/edit/delete users. Controls others' access!", risk: "critical", icon: Users, category: "security" },
    { key: "view_secrets", nameAr: "عرض المفاتيح السرية", nameEn: "View Secrets", descAr: "عرض القيم الحقيقية للمفاتيح السرية (API keys, passwords). 🔴 خطير جداً!", descEn: "Reveal actual secret values. VERY DANGEROUS!", risk: "critical", icon: ShieldAlert, category: "security" },
    { key: "manage_agents", nameAr: "إدارة الوكلاء", nameEn: "Manage Agents", descAr: "تعديل إعدادات وصلاحيات الوكلاء الآخرين. ⚠️ يمكنه منح نفسه صلاحيات!", descEn: "Modify other agents' settings. Can self-escalate!", risk: "critical", icon: Bot, category: "security" },
  ];

  const rc: Record<RiskLevel, { bg: string; text: string; border: string; labelAr: string; labelEn: string }> = {
    low: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", labelAr: "آمن", labelEn: "Safe" },
    medium: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20", labelAr: "متوسط", labelEn: "Medium" },
    high: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20", labelAr: "عالي", labelEn: "High" },
    critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20", labelAr: "خطير", labelEn: "Critical" },
  };

  const currentPerms = agent.permissions || [];
  const [expandedInfo, setExpandedInfo] = useState<string | null>(null);
  const critCount = PERMS.filter(p => p.risk === "critical" && currentPerms.includes(p.key)).length;

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[12px] text-[#d4dae3]">{isRTL ? "كل صلاحية مرتبطة بأداة حقيقية — فعّلها أو عطّلها" : "Each permission controls a real tool"}</p>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-[#d4dae3]">{currentPerms.filter(p => PERMS.some(d => d.key === p)).length}/{PERMS.length}</span>
          {critCount > 0 && <span className="text-red-400 flex items-center gap-1"><ShieldAlert className="w-3 h-3" />{critCount} {isRTL ? "خطير" : "critical"}</span>}
        </div>
      </div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => onUpdate({ permissions: PERMS.map(p => p.key) })} className="px-3 py-1.5 rounded-lg text-[11px] bg-[#7c3aed]/10 text-[#7c3aed] border border-[#7c3aed]/20 hover:bg-[#7c3aed]/20 transition-colors">{isRTL ? "تفعيل الكل" : "Enable All"}</button>
        <button onClick={() => onUpdate({ permissions: PERMS.filter(p => p.risk !== "critical").map(p => p.key) })} className="px-3 py-1.5 rounded-lg text-[11px] bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors">{isRTL ? "الكل ماعدا الخطير" : "All except critical"}</button>
        <button onClick={() => onUpdate({ permissions: PERMS.filter(p => p.risk === "low").map(p => p.key) })} className="px-3 py-1.5 rounded-lg text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">{isRTL ? "الآمنة فقط" : "Safe only"}</button>
        <button onClick={() => onUpdate({ permissions: [] })} className="px-3 py-1.5 rounded-lg text-[11px] bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors">{isRTL ? "تعطيل الكل" : "Disable All"}</button>
      </div>
      {cats.map(cat => {
        const catPerms = PERMS.filter(p => p.category === cat.key);
        const enabledInCat = catPerms.filter(p => currentPerms.includes(p.key)).length;
        return (
          <div key={cat.key} className="mb-5">
            <div className="flex items-center gap-2 mb-2 px-1">
              <cat.icon className="w-4 h-4 text-[#7c3aed]" />
              <span className="text-[12px] font-medium text-[#e2e8f0]">{isRTL ? cat.nameAr : cat.nameEn}</span>
              <span className="text-[10px] text-[#d4dae3]">({enabledInCat}/{catPerms.length})</span>
              <button onClick={() => { const keys = catPerms.map(p => p.key); const allOn = keys.every(k => currentPerms.includes(k)); onUpdate({ permissions: allOn ? currentPerms.filter(p => !keys.includes(p)) : [...new Set([...currentPerms, ...keys])] }); }} className={`text-[10px] hover:text-[#7c3aed] transition-colors ${isRTL ? "mr-auto" : "ml-auto"}`} style={{ color: "#d4dae3" }}>
                {enabledInCat === catPerms.length ? (isRTL ? "تعطيل الفئة" : "Disable all") : (isRTL ? "تفعيل الفئة" : "Enable all")}
              </button>
            </div>
            <div className="space-y-1.5">
              {catPerms.map(perm => {
                const active = currentPerms.includes(perm.key);
                const r = rc[perm.risk];
                const expanded = expandedInfo === perm.key;
                return (
                  <div key={perm.key} className="rounded-lg border transition-all" style={{ borderColor: active ? (perm.risk === "critical" ? "rgba(239,68,68,0.3)" : "rgba(124,58,237,0.3)") : "rgba(255,255,255,0.07)" }}>
                    <div className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] transition-colors rounded-lg ${active ? (perm.risk === "critical" ? "bg-red-500/5" : "bg-[#7c3aed]/5") : "bg-[#0d1117]"}`}
                      onClick={() => { const upd = active ? currentPerms.filter(p => p !== perm.key) : [...currentPerms, perm.key]; onUpdate({ permissions: upd }); }}>
                      {active ? <CheckCircle className={`w-4 h-4 flex-shrink-0 ${perm.risk === "critical" ? "text-red-400" : "text-[#7c3aed]"}`} /> : <div className="w-4 h-4 rounded-full border border-white/20 flex-shrink-0" />}
                      <perm.icon className={`w-4 h-4 flex-shrink-0 ${active ? r.text : "text-[#d4dae3]"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[12px] font-medium ${active ? "text-[#e2e8f0]" : "text-[#d4dae3]"}`}>{isRTL ? perm.nameAr : perm.nameEn}</span>
                          <span className="text-[9px] font-mono text-[#d4dae3]/50">{perm.key}</span>
                        </div>
                      </div>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${r.bg} ${r.text} border ${r.border}`}>{isRTL ? r.labelAr : r.labelEn}</span>
                      <button onClick={(e) => { e.stopPropagation(); setExpandedInfo(expanded ? null : perm.key); }} className="p-1 hover:bg-white/5 rounded transition-colors"><Info className="w-3.5 h-3.5 text-[#d4dae3]" /></button>
                    </div>
                    {expanded && <div className={`px-3 py-2.5 text-[11px] leading-relaxed border-t ${r.bg} ${r.text}`} style={{ borderColor: "rgba(255,255,255,0.05)", direction: isRTL ? "rtl" : "ltr" }}>{isRTL ? perm.descAr : perm.descEn}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function InstructionsTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  return (
    <div className="max-w-3xl">
      <label className="text-[12px] text-[#d4dae3] mb-2 block">{isRTL ? "تعليمات وملاحظات إضافية" : "Additional Instructions & Notes"}</label>
      <textarea
        value={agent.instructions || ""}
        onChange={e => onUpdate({ instructions: e.target.value })}
        className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-4 py-3 text-[13px] leading-relaxed resize-none min-h-[400px]"
        placeholder={isRTL ? "أضف تعليمات خاصة لهذا الوكيل..." : "Add special instructions for this agent..."}
      />
      <p className="text-[10px] text-[#d4dae3] mt-1">{isRTL ? "هذه التعليمات تُضاف كسياق إضافي عند كل استدعاء" : "These instructions are appended as additional context on every invocation"}</p>
    </div>
  );
}

function PipelineTab({ agent, agents, onUpdate, onSaveOrder, isRTL }: { agent: AgentConfig; agents: AgentConfig[]; onUpdate: (u: Partial<AgentConfig>) => void; onSaveOrder: () => void; isRTL: boolean }) {
  const pipelineAgents = agents.filter(a => a.pipelineOrder > 0).sort((a, b) => a.pipelineOrder - b.pipelineOrder);
  const allKeys = agents.map(a => a.agentKey);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-3">{isRTL ? "ترتيب خط الأنابيب" : "Pipeline Order"}</h3>
        <div className="space-y-1">
          {pipelineAgents.map((a, i) => (
            <div key={a.agentKey} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] ${a.agentKey === agent.agentKey ? "bg-[#7c3aed]/15 border border-[#7c3aed]/30" : "bg-[#0d1117] border border-white/7"}`}>
              <GripVertical className="w-3.5 h-3.5 text-[#d4dae3]" />
              <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-mono">{a.pipelineOrder}</span>
              <span className="flex-1">{isRTL ? a.displayNameAr : a.displayNameEn}</span>
              {i < pipelineAgents.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-[#d4dae3]" />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-medium mb-2">{isRTL ? "إعدادات هذا الوكيل في خط الأنابيب" : "This Agent's Pipeline Settings"}</h3>

        <div>
          <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "رقم الترتيب" : "Pipeline Order"}</label>
          <input type="number" value={agent.pipelineOrder} onChange={e => onUpdate({ pipelineOrder: parseInt(e.target.value) || 0 })} className="w-24 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "يستلم من" : "Receives From"}</label>
            <select value={agent.receivesFrom || ""} onChange={e => onUpdate({ receivesFrom: e.target.value })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]">
              <option value="user_input">{isRTL ? "مدخلات المستخدم" : "User Input"}</option>
              {allKeys.filter(k => k !== agent.agentKey).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "يسلّم إلى" : "Sends To"}</label>
            <select value={agent.sendsTo || ""} onChange={e => onUpdate({ sendsTo: e.target.value })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]">
              <option value="output">{isRTL ? "المخرجات النهائية" : "Final Output"}</option>
              {allKeys.filter(k => k !== agent.agentKey).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "الدور عند الاستلام" : "Role on Receive"}</label>
          <input value={agent.roleOnReceive || ""} onChange={e => onUpdate({ roleOnReceive: e.target.value })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "الدور عند التسليم" : "Role on Send"}</label>
          <input value={agent.roleOnSend || ""} onChange={e => onUpdate({ roleOnSend: e.target.value })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]" />
        </div>

        <button onClick={onSaveOrder} className="mt-2 px-4 py-2 bg-[#7c3aed] hover:bg-[#6d28d9] text-white rounded-lg text-[12px] flex items-center gap-2">
          <Save className="w-3.5 h-3.5" />
          {isRTL ? "حفظ الترتيب" : "Save Order"}
        </button>
      </div>
    </div>
  );
}

function TokensTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-medium">{isRTL ? "حدود التوكن" : "Token Limits"}</h3>
        <div>
          <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "الحد الأقصى للتوكن لكل استدعاء" : "Max Tokens Per Call"}</label>
          <input type="number" value={agent.tokenLimit} onChange={e => onUpdate({ tokenLimit: parseInt(e.target.value) || 0 })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" />
          <div className="flex justify-between text-[10px] text-[#d4dae3] mt-1">
            <span>{isRTL ? "المستخدم حالياً" : "Currently used"}: {agent.totalTokensUsed?.toLocaleString() || 0}</span>
            <span>{isRTL ? "الحد" : "Limit"}: {agent.tokenLimit?.toLocaleString()}</span>
          </div>
          <div className="w-full bg-[#0d1117] rounded-full h-2 mt-1">
            <div className="bg-[#7c3aed] h-2 rounded-full transition-all" style={{ width: `${Math.min(100, ((agent.totalTokensUsed || 0) / (agent.tokenLimit || 1)) * 100)}%` }} />
          </div>
        </div>
      </div>

      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4 space-y-4">
        <h3 className="text-sm font-medium">{isRTL ? "إعدادات الدفعات" : "Batch Settings"}</h3>
        <div>
          <label className="text-[11px] text-[#d4dae3] mb-1 block">{isRTL ? "حجم الدفعة (عدد الملفات)" : "Batch Size (files per batch)"}</label>
          <input type="number" value={agent.batchSize} onChange={e => onUpdate({ batchSize: parseInt(e.target.value) || 1 })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" min={1} max={50} />
        </div>
        <p className="text-[11px] text-[#d4dae3] leading-relaxed">
          {isRTL
            ? "للمشاريع الكبيرة: الوكيل يعالج الملفات على دفعات. كل دفعة تُولَّد → تُحفَظ → تظهر في المعاينة. هذا يمنع تجاوز حدود التوكن ويسمح برؤية التقدم تدريجياً."
            : "For large projects: the agent processes files in batches. Each batch is generated → saved → shown in preview. This prevents token limit overflows and allows seeing progress incrementally."
          }
        </p>
      </div>

      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-2">{isRTL ? "التكلفة الإجمالية" : "Total Cost"}</h3>
        <div className="text-2xl font-bold text-[#7c3aed]">${parseFloat(agent.totalCostUsd || "0").toFixed(4)}</div>
        <p className="text-[11px] text-[#d4dae3] mt-1">{isRTL ? "إجمالي التكلفة منذ إنشاء الوكيل" : "Total cost since agent creation"}</p>
      </div>
    </div>
  );
}

function CodeTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  const [newFile, setNewFile] = useState("");

  const addFile = () => {
    const trimmed = newFile.trim();
    if (!trimmed) return;
    const current = agent.sourceFiles || [];
    if (current.includes(trimmed)) return;
    onUpdate({ sourceFiles: [...current, trimmed] });
    setNewFile("");
  };

  const removeFile = (index: number) => {
    const current = [...(agent.sourceFiles || [])];
    current.splice(index, 1);
    onUpdate({ sourceFiles: current });
  };

  return (
    <div className="max-w-2xl">
      <h3 className="text-sm font-medium mb-3">{isRTL ? "ملفات الكود المصدري" : "Source Code Files"}</h3>
      <p className="text-[11px] text-[#d4dae3] mb-3">
        {isRTL
          ? "حدد المسارات التي يعمل عليها الوكيل — يُستخدم لتصفية الملفات أثناء التنفيذ"
          : "Specify file paths this agent operates on — used to scope files during execution"}
      </p>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={newFile}
          onChange={(e) => setNewFile(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addFile()}
          placeholder={isRTL ? "مسار الملف مثل src/components/" : "File path e.g. src/components/"}
          className="flex-1 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px] font-mono text-[#c9d1d9] placeholder:text-[#484f58] focus:outline-none focus:border-[#58a6ff]/50"
          dir="ltr"
        />
        <button
          onClick={addFile}
          disabled={!newFile.trim()}
          className="px-3 py-2 bg-[#238636] hover:bg-[#2ea043] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[12px] rounded-lg transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          {isRTL ? "أضف" : "Add"}
        </button>
      </div>

      <div className="space-y-2">
        {(agent.sourceFiles || []).map((file, i) => (
          <div key={i} className="flex items-center gap-2 bg-[#0d1117] border border-white/7 rounded-lg px-3 py-2.5 group">
            <Code className="w-4 h-4 text-[#d4dae3] flex-shrink-0" />
            <span className="text-[12px] font-mono text-[#58a6ff] flex-1">{file}</span>
            <button
              onClick={() => removeFile(i)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
              title={isRTL ? "حذف" : "Remove"}
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        ))}
        {(!agent.sourceFiles || agent.sourceFiles.length === 0) && (
          <p className="text-[12px] text-[#d4dae3]">{isRTL ? "لا توجد ملفات مصدرية — الوكيل يعمل على جميع الملفات" : "No source files — agent operates on all files"}</p>
        )}
      </div>
    </div>
  );
}

interface AgentLog {
  id: string;
  agentKey: string;
  level: string;
  action: string;
  message: string;
  messageAr: string;
  details: Record<string, unknown> | null;
  tokensUsed: number;
  durationMs: number | null;
  status: string;
  buildId: string | null;
  projectId: string | null;
  createdAt: string;
}

function LogsTab({ agent, isRTL }: { agent: AgentConfig; isRTL: boolean }) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`${API}/agents/logs/${agent.agentKey}?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error("Failed to fetch logs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setLogs([]);
    fetchLogs();
  }, [agent.agentKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, agent.agentKey]);

  const clearLogs = async () => {
    if (!confirm(isRTL ? "هل أنت متأكد من حذف جميع السجلات؟" : "Clear all logs for this agent?")) return;
    try {
      await fetch(`${API}/agents/logs/${agent.agentKey}`, { method: "DELETE" });
      setLogs([]);
    } catch (e) {
      console.error("Failed to clear logs:", e);
    }
  };

  const levelIcon = (level: string) => {
    if (level === "error") return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    if (level === "success") return <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />;
    if (level === "warn") return <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
    return <Activity className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  };

  const levelBg = (level: string) => {
    if (level === "error") return "border-red-500/20 bg-red-500/5";
    if (level === "success") return "border-green-500/20 bg-green-500/5";
    if (level === "warn") return "border-yellow-500/20 bg-yellow-500/5";
    return "border-white/7 bg-white/2";
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString(isRTL ? "ar-SA" : "en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit"
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#d4dae3]">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        {isRTL ? "جاري تحميل السجلات..." : "Loading logs..."}
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={fetchLogs} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[#161b22] border border-white/7 hover:bg-white/5 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            {isRTL ? "تحديث" : "Refresh"}
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${autoRefresh ? "bg-[#7c3aed]/20 border-[#7c3aed]/40 text-[#7c3aed]" : "bg-[#161b22] border-white/7 hover:bg-white/5"}`}
          >
            <Activity className="w-3.5 h-3.5" />
            {isRTL ? "تحديث تلقائي" : "Auto-refresh"}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#d4dae3]">
            {logs.length} {isRTL ? "سجل" : "entries"}
          </span>
          <button onClick={clearLogs} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
            {isRTL ? "مسح الكل" : "Clear"}
          </button>
        </div>
      </div>

      {logs.length === 0 ? (
        <div className="text-center py-16 text-[#d4dae3]">
          <ScrollText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>{isRTL ? "لا توجد سجلات بعد" : "No logs yet"}</p>
          <p className="text-xs mt-1">{isRTL ? "ستظهر السجلات عند تنفيذ الوكيل" : "Logs will appear when the agent executes"}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {logs.map((log) => (
            <div
              key={log.id}
              className={`border rounded-lg transition-colors cursor-pointer ${levelBg(log.level)} ${expandedLog === log.id ? "ring-1 ring-[#7c3aed]/30" : ""}`}
              onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
            >
              <div className="flex items-center gap-2.5 px-3 py-2">
                {levelIcon(log.level)}
                <span className="flex-1 text-[13px] leading-snug">
                  {isRTL ? (log.messageAr || log.message) : log.message}
                </span>
                <div className="flex items-center gap-3 text-[11px] text-[#d4dae3] shrink-0">
                  {log.tokensUsed > 0 && (
                    <span className="flex items-center gap-1">
                      <Coins className="w-3 h-3" />
                      {log.tokensUsed.toLocaleString()}
                    </span>
                  )}
                  {log.durationMs && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(log.durationMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  <span>{formatTime(log.createdAt)}</span>
                  <ChevronRight className={`w-3.5 h-3.5 transition-transform ${expandedLog === log.id ? "rotate-90" : ""}`} />
                </div>
              </div>

              {expandedLog === log.id && (
                <div className="px-3 pb-3 border-t border-white/5 mt-0 pt-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-[#d4dae3]">{isRTL ? "الإجراء: " : "Action: "}</span>
                      <span className="text-[#7c3aed] font-mono">{log.action}</span>
                    </div>
                    <div>
                      <span className="text-[#d4dae3]">{isRTL ? "الحالة: " : "Status: "}</span>
                      <span className={log.status === "failed" ? "text-red-400" : log.status === "completed" ? "text-green-400" : "text-blue-400"}>{log.status}</span>
                    </div>
                    {log.buildId && (
                      <div>
                        <span className="text-[#d4dae3]">{isRTL ? "معرف البناء: " : "Build ID: "}</span>
                        <span className="font-mono text-[10px]">{log.buildId.substring(0, 8)}...</span>
                      </div>
                    )}
                    {log.projectId && (
                      <div>
                        <span className="text-[#d4dae3]">{isRTL ? "معرف المشروع: " : "Project ID: "}</span>
                        <span className="font-mono text-[10px]">{log.projectId.substring(0, 8)}...</span>
                      </div>
                    )}
                  </div>
                  {log.details && Object.keys(log.details).length > 0 && (
                    <div className="bg-black/30 rounded-lg p-2">
                      <pre className="text-[11px] text-[#d4dae3] overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsTab({ agent, stats, isRTL }: { agent: AgentConfig; stats?: AgentStats; isRTL: boolean }) {
  const statCards = [
    { label: isRTL ? "إجمالي المهام" : "Total Tasks", value: stats?.totalTasks || agent.totalTasksCompleted || 0, icon: Activity, color: "text-blue-400" },
    { label: isRTL ? "ناجحة" : "Completed", value: stats?.completedTasks || 0, icon: CheckCircle, color: "text-green-400" },
    { label: isRTL ? "فاشلة" : "Failed", value: stats?.failedTasks || agent.totalErrors || 0, icon: XCircle, color: "text-red-400" },
    { label: isRTL ? "نسبة النجاح" : "Success Rate", value: `${stats?.successRate || 0}%`, icon: BarChart2, color: "text-[#7c3aed]" },
    { label: isRTL ? "إجمالي التوكن" : "Total Tokens", value: (stats?.totalTokens || agent.totalTokensUsed || 0).toLocaleString(), icon: Coins, color: "text-yellow-400" },
    { label: isRTL ? "متوسط الوقت" : "Avg Duration", value: `${((stats?.avgDurationMs || agent.avgExecutionMs || 0) / 1000).toFixed(1)}s`, icon: Clock, color: "text-cyan-400" },
  ];

  return (
    <div className="max-w-3xl space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {statCards.map((card, i) => (
          <div key={i} className="bg-[#161b22] border border-white/7 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-[11px] text-[#d4dae3]">{card.label}</span>
            </div>
            <div className="text-lg font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      {stats?.recentTasks && stats.recentTasks.length > 0 && (
        <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
          <h3 className="text-sm font-medium mb-3">{isRTL ? "آخر المهام" : "Recent Tasks"}</h3>
          <div className="space-y-1">
            {stats.recentTasks.slice(0, 10).map((task: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[12px] py-1.5 border-b border-white/5 last:border-0">
                {task.status === "completed" ? <CheckCircle className="w-3.5 h-3.5 text-green-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                <span className="flex-1 text-[#d4dae3]">{new Date(task.createdAt).toLocaleString()}</span>
                <span>{(task.tokensUsed || 0).toLocaleString()} tok</span>
                <span className="text-[#d4dae3]">{task.durationMs ? `${(task.durationMs / 1000).toFixed(1)}s` : "-"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalsTab({ isRTL }: { isRTL: boolean }) {
  const [approvals, setApprovals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [killSwitch, setKillSwitch] = useState(true);

  const fetchApprovals = async () => {
    try {
      const r = await fetch(`${API}/ai/approvals`);
      const d = await r.json();
      setApprovals(d.approvals || []);
    } catch {} finally { setLoading(false); }
  };

  const fetchKillSwitch = async () => {
    try {
      const r = await fetch(`${API}/ai/kill-switch`);
      const d = await r.json();
      setKillSwitch(d.enabled);
    } catch {}
  };

  useEffect(() => { fetchApprovals(); fetchKillSwitch(); }, []);

  const handleApprove = async (id: string) => {
    await fetch(`${API}/ai/approve/${id}`, { method: "POST" });
    fetchApprovals();
  };

  const handleReject = async (id: string) => {
    await fetch(`${API}/ai/reject/${id}`, { method: "POST" });
    fetchApprovals();
  };

  const toggleKillSwitch = async () => {
    const next = !killSwitch;
    await fetch(`${API}/ai/kill-switch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
    setKillSwitch(next);
  };

  const filtered = filter === "all" ? approvals : approvals.filter(a => a.status === filter);
  const pendingCount = approvals.filter(a => a.status === "pending").length;

  const riskBadge = (risk: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      low: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: isRTL ? "آمن" : "Safe" },
      medium: { bg: "bg-amber-500/10", text: "text-amber-400", label: isRTL ? "متوسط" : "Medium" },
      high: { bg: "bg-orange-500/10", text: "text-orange-400", label: isRTL ? "عالي" : "High" },
      critical: { bg: "bg-red-500/10", text: "text-red-400", label: isRTL ? "حرج" : "Critical" },
    };
    const s = map[risk] || map.medium;
    return <span className={`text-[9px] px-1.5 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      pending: { bg: "bg-yellow-500/10", text: "text-yellow-400", label: isRTL ? "في الانتظار" : "Pending" },
      approved: { bg: "bg-emerald-500/10", text: "text-emerald-400", label: isRTL ? "تمت الموافقة" : "Approved" },
      rejected: { bg: "bg-red-500/10", text: "text-red-400", label: isRTL ? "مرفوض" : "Rejected" },
    };
    const s = map[status] || map.pending;
    return <span className={`text-[10px] px-2 py-0.5 rounded ${s.bg} ${s.text}`}>{s.label}</span>;
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium">{isRTL ? "طلبات الموافقة" : "Approval Requests"}</h3>
          {pendingCount > 0 && <span className="bg-red-500/20 text-red-400 text-[10px] px-2 py-0.5 rounded-full">{pendingCount} {isRTL ? "في الانتظار" : "pending"}</span>}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={toggleKillSwitch} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${killSwitch ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
            {killSwitch ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
            {killSwitch ? (isRTL ? "النظام مفعّل" : "System ON") : (isRTL ? "النظام متوقف" : "System OFF")}
          </button>
          <button onClick={fetchApprovals} className="p-1.5 hover:bg-white/5 rounded transition-colors"><RefreshCw className="w-4 h-4 text-[#d4dae3]" /></button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {(["all", "pending", "approved", "rejected"] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-[11px] transition-colors ${filter === f ? "bg-[#7c3aed]/15 text-[#7c3aed] border border-[#7c3aed]/30" : "bg-[#0d1117] text-[#d4dae3] border border-white/7"}`}>
            {f === "all" ? (isRTL ? "الكل" : "All") : f === "pending" ? (isRTL ? "في الانتظار" : "Pending") : f === "approved" ? (isRTL ? "موافق عليها" : "Approved") : (isRTL ? "مرفوضة" : "Rejected")}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-[#7c3aed]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-[#d4dae3] text-sm">{isRTL ? "لا توجد طلبات" : "No requests"}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a: any) => (
            <div key={a.id} className={`rounded-xl border p-4 transition-colors ${a.status === "pending" ? "bg-yellow-500/5 border-yellow-500/20" : "bg-[#161b22] border-white/7"}`}>
              <div className="flex items-center gap-2 mb-2">
                <Terminal className="w-4 h-4 text-[#7c3aed]" />
                <span className="text-[12px] font-mono font-medium">{a.tool}</span>
                {riskBadge(a.risk)}
                {statusBadge(a.status)}
                <span className="text-[10px] text-[#d4dae3] ml-auto">{new Date(a.createdAt).toLocaleString("ar-SA")}</span>
              </div>
              <div className="text-[11px] text-[#d4dae3] mb-2 font-mono bg-[#0d1117] rounded-lg px-3 py-2 max-h-20 overflow-auto">
                {JSON.stringify(a.input, null, 1)?.slice(0, 300)}
              </div>
              {a.explanation && <p className="text-[11px] text-[#d4dae3] mb-2">{a.explanation}</p>}
              {a.status === "pending" && (
                <div className="flex gap-2 mt-2">
                  <button onClick={() => handleApprove(a.id)} className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500/15 text-emerald-400 rounded-lg text-[11px] hover:bg-emerald-500/25 transition-colors border border-emerald-500/20">
                    <CheckCircle className="w-3.5 h-3.5" />{isRTL ? "موافق" : "Approve"}
                  </button>
                  <button onClick={() => handleReject(a.id)} className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500/15 text-red-400 rounded-lg text-[11px] hover:bg-red-500/25 transition-colors border border-red-500/20">
                    <XCircle className="w-3.5 h-3.5" />{isRTL ? "رفض" : "Reject"}
                  </button>
                </div>
              )}
              {a.status === "approved" && a.executionResult && (
                <div className="mt-2 text-[10px] text-emerald-400 bg-emerald-500/5 rounded-lg px-3 py-2 font-mono max-h-20 overflow-auto">
                  {JSON.stringify(a.executionResult)?.slice(0, 300)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditLogTab({ isRTL }: { isRTL: boolean }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/ai/audit-logs?limit=200`);
        const d = await r.json();
        setLogs(d.logs || []);
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const actionColor = (action: string) => {
    if (action.includes("blocked")) return "text-red-400";
    if (action.includes("rejected")) return "text-orange-400";
    if (action.includes("approved") || action === "tool_executed") return "text-emerald-400";
    if (action.includes("pending")) return "text-yellow-400";
    return "text-[#d4dae3]";
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">{isRTL ? "سجل التدقيق الأمني" : "Security Audit Log"}</h3>
        <span className="text-[10px] text-[#d4dae3]">{logs.length} {isRTL ? "سجل" : "entries"}</span>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-[#7c3aed]" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-[#d4dae3] text-sm">{isRTL ? "لا توجد سجلات" : "No audit logs"}</div>
      ) : (
        <div className="space-y-1">
          {logs.map((log: any) => (
            <div key={log.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#161b22] border border-white/5 text-[11px]">
              <span className="text-[9px] text-[#d4dae3] w-[140px] flex-shrink-0">{new Date(log.createdAt).toLocaleString("ar-SA")}</span>
              <span className="font-mono text-[#7c3aed] w-[100px] flex-shrink-0">{log.agentKey}</span>
              <span className={`font-medium w-[140px] flex-shrink-0 ${actionColor(log.action)}`}>{log.action}</span>
              <span className="font-mono text-[#d4dae3] w-[120px] flex-shrink-0">{log.tool || "-"}</span>
              <span className="text-[9px] text-[#d4dae3] flex-1 truncate">{log.input ? JSON.stringify(log.input).slice(0, 80) : ""}</span>
              {log.durationMs && <span className="text-[9px] text-[#d4dae3]">{log.durationMs}ms</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeployTab({ isRTL }: { isRTL: boolean }) {
  const [deploying, setDeploying] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API}/infra/deploy-status`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchStatus(); }, []);

  const deployProduction = async () => {
    if (!confirm(isRTL ? "هل أنت متأكد من النشر على mrcodeai.com؟" : "Deploy to production mrcodeai.com?")) return;
    setDeploying(true);
    setStatus(isRTL ? "جاري النشر..." : "Deploying...");
    try {
      const res = await fetch(`${API}/infra/deploy-production`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setStatus(isRTL ? "تم بدء النشر بنجاح!" : "Deployment triggered!");
        setTimeout(fetchStatus, 5000);
      } else {
        setStatus(isRTL ? `خطأ: ${data.error}` : `Error: ${data.error}`);
      }
    } catch (err: any) {
      setStatus(isRTL ? `خطأ: ${err.message}` : `Error: ${err.message}`);
    }
    setDeploying(false);
  };

  const statusIcon = (conclusion: string, s: string) => {
    if (conclusion === "success") return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (conclusion === "failure") return <XCircle className="w-4 h-4 text-red-400" />;
    if (s === "in_progress" || s === "queued") return <RefreshCw className="w-4 h-4 text-yellow-400 animate-spin" />;
    return <Clock className="w-4 h-4 text-gray-400" />;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="bg-gradient-to-r from-[#7c3aed]/20 to-[#2563eb]/20 border border-[#7c3aed]/30 rounded-lg p-6 text-center">
        <Rocket className="w-10 h-10 text-[#7c3aed] mx-auto mb-3" />
        <h2 className="text-lg font-bold mb-2">{isRTL ? "النشر للإنتاجية" : "Deploy to Production"}</h2>
        <p className="text-[#d4dae3] text-sm mb-4">{isRTL ? "نشر على mrcodeai.com" : "Deploy to mrcodeai.com"}</p>
        <button
          onClick={deployProduction}
          disabled={deploying}
          className="px-8 py-3 bg-gradient-to-r from-[#7c3aed] to-[#2563eb] text-white font-bold rounded-lg hover:opacity-90 disabled:opacity-50 transition-all text-base"
        >
          {deploying ? (
            <span className="flex items-center gap-2 justify-center"><RefreshCw className="w-4 h-4 animate-spin" />{isRTL ? "جاري النشر..." : "Deploying..."}</span>
          ) : (
            <span className="flex items-center gap-2 justify-center"><Rocket className="w-4 h-4" />{isRTL ? "نشر للإنتاجية" : "Deploy to Production"}</span>
          )}
        </button>
        {status && <p className="mt-3 text-sm font-medium">{status}</p>}
      </div>

      <div className="bg-[#161b22] border border-white/10 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">{isRTL ? "آخر عمليات النشر" : "Recent Deployments"}</h3>
          <button onClick={fetchStatus} className="text-[10px] text-[#7c3aed] hover:underline">{isRTL ? "تحديث" : "Refresh"}</button>
        </div>
        {loading ? (
          <p className="text-[#d4dae3] text-sm">{isRTL ? "جاري التحميل..." : "Loading..."}</p>
        ) : runs.length === 0 ? (
          <p className="text-[#d4dae3] text-sm">{isRTL ? "لا توجد عمليات نشر" : "No deployments found"}</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run: any) => (
              <div key={run.id} className="flex items-center gap-3 p-2 bg-[#0e1117] rounded text-xs">
                {statusIcon(run.conclusion, run.status)}
                <span className="flex-1 font-medium">{run.name}</span>
                <span className="text-[#d4dae3]">{run.status === "completed" ? run.conclusion : run.status}</span>
                <span className="text-[#d4dae3]">{new Date(run.created).toLocaleString("ar-SA")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
