import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import {
  Bot, ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronRight,
  ToggleLeft, ToggleRight, Settings, FileText, Brain, Shield,
  MessageSquare, BarChart2, Zap, GripVertical, ArrowUpDown,
  Activity, Clock, Coins, AlertTriangle, CheckCircle, XCircle,
  Cpu, RefreshCw, Eye, Code
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
  { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { provider: "anthropic", model: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { provider: "openai", model: "o3", label: "OpenAI o3" },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o" },
  { provider: "openai", model: "gpt-4.1", label: "GPT-4.1" },
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
      setAgents(data.agents || []);
      if (data.agents?.length > 0 && !selectedAgent) {
        setSelectedAgent(data.agents[0].agentKey);
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
    { key: "stats", icon: BarChart2, label: isRTL ? "الإحصائيات" : "Statistics" },
  ];

  return (
    <div className={`min-h-screen bg-[#0e1117] text-[#e2e8f0] flex ${isRTL ? "flex-row-reverse" : ""}`} dir={isRTL ? "rtl" : "ltr"}>
      <div className="w-[260px] min-w-[260px] bg-[#161b22] border-r border-white/7 flex flex-col h-screen overflow-hidden">
        <div className="p-3 border-b border-white/7 flex items-center gap-2">
          <Link href="/dashboard" className="text-[#8b949e] hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Bot className="w-5 h-5 text-[#7c3aed]" />
          <span className="font-semibold text-sm">{isRTL ? "إدارة الوكلاء" : "Agent Management"}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] uppercase tracking-wider text-[#8b949e] px-2 py-1 mb-1">
            {isRTL ? "وكلاء خط الأنابيب" : "Pipeline Agents"}
          </div>
          {agents.filter(a => a.pipelineOrder > 0).sort((a, b) => a.pipelineOrder - b.pipelineOrder).map(agent => (
            <AgentListItem
              key={agent.agentKey}
              agent={agent}
              selected={selectedAgent === agent.agentKey}
              onClick={() => setSelectedAgent(agent.agentKey)}
              isRTL={isRTL}
            />
          ))}

          <div className="text-[10px] uppercase tracking-wider text-[#8b949e] px-2 py-1 mt-3 mb-1">
            {isRTL ? "وكلاء مستقلون" : "Standalone Agents"}
          </div>
          {agents.filter(a => a.pipelineOrder === 0).map(agent => (
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

        {currentAgent ? (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/7 bg-[#161b22]/50">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${currentAgent.enabled ? "bg-[#7c3aed]/20" : "bg-red-500/20"}`}>
                  <Bot className={`w-4 h-4 ${currentAgent.enabled ? "text-[#7c3aed]" : "text-red-400"}`} />
                </div>
                <div>
                  <h2 className="font-semibold text-sm">{isRTL ? currentAgent.displayNameAr : currentAgent.displayNameEn}</h2>
                  <p className="text-[11px] text-[#8b949e]">{currentAgent.agentKey} • {isRTL ? "ترتيب" : "Order"}: {currentAgent.pipelineOrder}</p>
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
                      : "border-transparent text-[#8b949e] hover:text-[#c9d1d9]"
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
              {activeTab === "code" && <CodeTab agent={currentAgent} isRTL={isRTL} />}
              {activeTab === "stats" && <StatsTab agent={currentAgent} stats={stats[currentAgent.agentKey]} isRTL={isRTL} />}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#8b949e]">
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
                <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "المفتاح (بالإنجليزية)" : "Agent Key (English)"}</label>
                <input value={newAgent.key} onChange={e => setNewAgent(p => ({ ...p, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="my_custom_agent" />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "الاسم بالإنجليزية" : "Name (English)"}</label>
                <input value={newAgent.nameEn} onChange={e => setNewAgent(p => ({ ...p, nameEn: e.target.value }))} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="My Custom Agent" />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "الاسم بالعربية" : "Name (Arabic)"}</label>
                <input value={newAgent.nameAr} onChange={e => setNewAgent(p => ({ ...p, nameAr: e.target.value }))} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" placeholder="وكيلي المخصص" dir="rtl" />
              </div>
              <div>
                <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "الوصف" : "Description"}</label>
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

function AgentListItem({ agent, selected, onClick, isRTL }: { agent: AgentConfig; selected: boolean; onClick: () => void; isRTL: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 w-full px-2 py-2 rounded-md text-[12px] text-start transition-colors ${
        selected ? "bg-[#7c3aed]/15 text-[#e2e8f0]" : "text-[#8b949e] hover:bg-white/5"
      }`}
    >
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${agent.enabled ? "bg-green-400" : "bg-red-400"}`} />
      <span className="truncate flex-1">{isRTL ? agent.displayNameAr : agent.displayNameEn}</span>
      {agent.pipelineOrder > 0 && (
        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">{agent.pipelineOrder}</span>
      )}
      {agent.governorEnabled && <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
    </button>
  );
}

function ModelSlotEditor({ slot, index, onChange, isRTL }: { slot: ModelSlot | null; index: number; onChange: (s: ModelSlot) => void; isRTL: boolean }) {
  const labels = [isRTL ? "النموذج الأساسي" : "Primary Model", isRTL ? "النموذج الثانوي" : "Secondary Model", isRTL ? "النموذج الثالث" : "Tertiary Model"];
  const current = slot || { provider: "anthropic", model: "claude-sonnet-4-20250514", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 };
  const creativity = current.creativity ?? 0.7;
  const timeoutSeconds = current.timeoutSeconds ?? 240;
  const maxTokens = current.maxTokens ?? 16000;

  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium">{labels[index]}</span>
        <button
          onClick={() => onChange({ ...current, enabled: !current.enabled })}
          className={`text-[11px] px-2 py-0.5 rounded-full ${current.enabled ? "bg-green-500/15 text-green-400" : "bg-white/5 text-[#8b949e]"}`}
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
        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#e2e8f0] mb-2"
      >
        {MODEL_OPTIONS.map(m => (
          <option key={`${m.provider}::${m.model}`} value={`${m.provider}::${m.model}`}>{m.label}</option>
        ))}
      </select>

      <div className="grid grid-cols-3 gap-2 mt-1">
        <div>
          <label className="text-[10px] text-[#8b949e] mb-1 block">{isRTL ? "الإبداع" : "Creativity"}</label>
          <div className="flex items-center gap-1.5">
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={creativity}
              onChange={e => onChange({ ...current, creativity: parseFloat(e.target.value) })}
              className="flex-1 accent-[#7c3aed] h-1.5"
            />
            <span className="text-[10px] font-mono bg-[#161b22] px-1.5 py-0.5 rounded border border-white/10 w-10 text-center">{creativity.toFixed(2)}</span>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-[#8b949e] mb-1 block">{isRTL ? "المهلة (ثانية)" : "Timeout (s)"}</label>
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
        <div>
          <label className="text-[10px] text-[#8b949e] mb-1 block">{isRTL ? "التوكن" : "Max Tokens"}</label>
          <input
            type="number"
            min="1000"
            max="200000"
            step="1000"
            value={maxTokens}
            onChange={e => onChange({ ...current, maxTokens: parseInt(e.target.value) || 16000 })}
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
            onClick={() => onUpdate({ governorEnabled: !agent.governorEnabled })}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors ${
              agent.governorEnabled ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" : "bg-white/5 text-[#8b949e] border border-white/10"
            }`}
          >
            {agent.governorEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {agent.governorEnabled ? (isRTL ? "دمج مفعّل" : "Merge Active") : (isRTL ? "بدون دمج" : "No Merge")}
          </button>
        </div>
        <p className="text-[11px] text-[#8b949e] leading-relaxed mb-3">
          {isRTL
            ? "عند تفعيل الحاكم: النماذج الثلاثة تفكّر بنفس المشكلة بشكل مستقل، ثم الحاكم يأخذ أفضل الأفكار من كل نموذج ويدمجها في حل نهائي متفوّق. عند التعطيل: يعمل النموذج الأساسي فقط."
            : "When enabled: All 3 models think independently about the same problem, then the Governor extracts the best ideas from each and merges them into a superior final solution. When disabled: Only the primary model is used."
          }
        </p>

        {agent.governorEnabled && (() => {
          const gov = agent.governorModel || { provider: "", model: "", creativity: 0.5, timeoutSeconds: 300, maxTokens: 16000 };
          return (
          <div className="bg-[#0d1117] border border-yellow-500/20 rounded-lg p-3 mt-2">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5 text-yellow-400" />
              <span className="text-[12px] font-medium text-yellow-400">{isRTL ? "نموذج الحاكم (من يدمج النتائج)" : "Governor Model (who merges results)"}</span>
            </div>
            <p className="text-[10px] text-[#8b949e] mb-2">
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

            {gov.provider && gov.model && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div>
                  <label className="text-[10px] text-yellow-400/70 mb-1 block">{isRTL ? "إبداع الحاكم" : "Governor Creativity"}</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={gov.creativity ?? 0.5}
                      onChange={e => onUpdate({ governorModel: { ...gov, creativity: parseFloat(e.target.value) } } as any)}
                      className="flex-1 accent-yellow-400 h-1.5"
                    />
                    <span className="text-[10px] font-mono bg-[#161b22] px-1.5 py-0.5 rounded border border-yellow-500/20 w-10 text-center text-yellow-400">{(gov.creativity ?? 0.5).toFixed(2)}</span>
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-yellow-400/70 mb-1 block">{isRTL ? "مهلة الحاكم (ثانية)" : "Timeout (s)"}</label>
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
                <div>
                  <label className="text-[10px] text-yellow-400/70 mb-1 block">{isRTL ? "توكن الحاكم" : "Governor Tokens"}</label>
                  <input
                    type="number"
                    min="1000"
                    max="200000"
                    step="1000"
                    value={gov.maxTokens ?? 16000}
                    onChange={e => onUpdate({ governorModel: { ...gov, maxTokens: parseInt(e.target.value) || 16000 } } as any)}
                    className="w-full bg-[#161b22] border border-yellow-500/20 rounded px-2 py-1 text-[11px] text-yellow-400"
                  />
                </div>
              </div>
            )}
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
          <span className="text-[12px] text-[#8b949e]">{isRTL ? "درجة الإبداع والمهلة لكل نموذج أعلاه" : "Creativity & timeout set per-model above"}</span>
        </div>
        <p className="text-[10px] text-[#8b949e]/60">
          {isRTL
            ? "كل نموذج يمكن ضبط إبداعه ومهلته بشكل مستقل — غيّر القيم مباشرة في كل خانة نموذج."
            : "Each model can have its own creativity and timeout — adjust values directly in each model slot."
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
        <label className="text-[12px] text-[#8b949e] mb-2 block">{isRTL ? "التوجيه الرئيسي (System Prompt)" : "System Prompt (Main Directive)"}</label>
        <textarea
          value={agent.systemPrompt}
          onChange={e => onUpdate({ systemPrompt: e.target.value })}
          className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-4 py-3 text-[13px] font-mono leading-relaxed resize-none min-h-[300px]"
          dir="ltr"
        />
        <p className="text-[10px] text-[#8b949e] mt-1">{isRTL ? "هذا التوجيه يُرسل كرسالة نظام في كل طلب يتلقاه الوكيل" : "This prompt is sent as the system message in every request the agent receives"}</p>
      </div>
      <div>
        <label className="text-[12px] text-[#8b949e] mb-2 block">{isRTL ? "الوصف" : "Description"}</label>
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
        <p className="text-[11px] text-[#8b949e] mb-3">{isRTL ? "سياقات مؤقتة تُمسح بعد كل بناء" : "Temporary context, cleared after each build"}</p>
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
        <p className="text-[11px] text-[#8b949e] mb-3">{isRTL ? "تعلّمات دائمة تُحفظ عبر الجلسات" : "Persistent learnings saved across sessions"}</p>
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
  const [newPerm, setNewPerm] = useState("");
  const allPerms = [
    "read_prompt", "generate_code", "create_files", "define_dependencies",
    "read_code", "modify_code", "fix_issues", "report_issues", "score_quality",
    "read_files", "write_files", "delete_files", "organize_structure",
    "execute_commands", "manage_sandbox", "install_packages",
    "trigger_review", "trigger_fix", "validate_output",
    "plan_files", "estimate_complexity", "patch_files",
    "read_content", "translate_content", "preserve_structure",
    "read_html", "analyze_seo", "suggest_fixes",
    "orchestrate", "route_builds", "manage_pipeline", "track_progress",
  ];
  const currentPerms = agent.permissions || [];

  return (
    <div className="max-w-2xl">
      <p className="text-[12px] text-[#8b949e] mb-4">{isRTL ? "حدد الصلاحيات التي يمتلكها هذا الوكيل" : "Select the permissions this agent has"}</p>
      <div className="grid grid-cols-2 gap-2">
        {allPerms.map(perm => (
          <button
            key={perm}
            onClick={() => {
              const updated = currentPerms.includes(perm) ? currentPerms.filter(p => p !== perm) : [...currentPerms, perm];
              onUpdate({ permissions: updated });
            }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] text-start transition-colors ${
              currentPerms.includes(perm) ? "bg-[#7c3aed]/15 text-[#7c3aed] border border-[#7c3aed]/30" : "bg-[#0d1117] text-[#8b949e] border border-white/7 hover:border-white/15"
            }`}
          >
            {currentPerms.includes(perm) ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border border-white/20 flex-shrink-0" />}
            <span className="font-mono">{perm}</span>
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        <input value={newPerm} onChange={e => setNewPerm(e.target.value)} className="flex-1 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px] font-mono" placeholder={isRTL ? "صلاحية مخصصة..." : "Custom permission..."} />
        <button onClick={() => { if (newPerm.trim() && !currentPerms.includes(newPerm.trim())) { onUpdate({ permissions: [...currentPerms, newPerm.trim()] }); setNewPerm(""); } }} className="px-3 py-2 bg-[#7c3aed]/15 text-[#7c3aed] rounded-lg text-[12px]">+</button>
      </div>
    </div>
  );
}

function InstructionsTab({ agent, onUpdate, isRTL }: { agent: AgentConfig; onUpdate: (u: Partial<AgentConfig>) => void; isRTL: boolean }) {
  return (
    <div className="max-w-3xl">
      <label className="text-[12px] text-[#8b949e] mb-2 block">{isRTL ? "تعليمات وملاحظات إضافية" : "Additional Instructions & Notes"}</label>
      <textarea
        value={agent.instructions || ""}
        onChange={e => onUpdate({ instructions: e.target.value })}
        className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-4 py-3 text-[13px] leading-relaxed resize-none min-h-[400px]"
        placeholder={isRTL ? "أضف تعليمات خاصة لهذا الوكيل..." : "Add special instructions for this agent..."}
      />
      <p className="text-[10px] text-[#8b949e] mt-1">{isRTL ? "هذه التعليمات تُضاف كسياق إضافي عند كل استدعاء" : "These instructions are appended as additional context on every invocation"}</p>
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
              <GripVertical className="w-3.5 h-3.5 text-[#8b949e]" />
              <span className="bg-white/10 px-2 py-0.5 rounded text-[10px] font-mono">{a.pipelineOrder}</span>
              <span className="flex-1">{isRTL ? a.displayNameAr : a.displayNameEn}</span>
              {i < pipelineAgents.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-[#8b949e]" />}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-medium mb-2">{isRTL ? "إعدادات هذا الوكيل في خط الأنابيب" : "This Agent's Pipeline Settings"}</h3>

        <div>
          <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "رقم الترتيب" : "Pipeline Order"}</label>
          <input type="number" value={agent.pipelineOrder} onChange={e => onUpdate({ pipelineOrder: parseInt(e.target.value) || 0 })} className="w-24 bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "يستلم من" : "Receives From"}</label>
            <select value={agent.receivesFrom || ""} onChange={e => onUpdate({ receivesFrom: e.target.value })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]">
              <option value="user_input">{isRTL ? "مدخلات المستخدم" : "User Input"}</option>
              {allKeys.filter(k => k !== agent.agentKey).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "يسلّم إلى" : "Sends To"}</label>
            <select value={agent.sendsTo || ""} onChange={e => onUpdate({ sendsTo: e.target.value })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]">
              <option value="output">{isRTL ? "المخرجات النهائية" : "Final Output"}</option>
              {allKeys.filter(k => k !== agent.agentKey).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "الدور عند الاستلام" : "Role on Receive"}</label>
          <input value={agent.roleOnReceive || ""} onChange={e => onUpdate({ roleOnReceive: e.target.value })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-[12px]" />
        </div>
        <div>
          <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "الدور عند التسليم" : "Role on Send"}</label>
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
          <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "الحد الأقصى للتوكن لكل استدعاء" : "Max Tokens Per Call"}</label>
          <input type="number" value={agent.tokenLimit} onChange={e => onUpdate({ tokenLimit: parseInt(e.target.value) || 0 })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" />
          <div className="flex justify-between text-[10px] text-[#8b949e] mt-1">
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
          <label className="text-[11px] text-[#8b949e] mb-1 block">{isRTL ? "حجم الدفعة (عدد الملفات)" : "Batch Size (files per batch)"}</label>
          <input type="number" value={agent.batchSize} onChange={e => onUpdate({ batchSize: parseInt(e.target.value) || 1 })} className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-3 py-2 text-sm" min={1} max={50} />
        </div>
        <p className="text-[11px] text-[#8b949e] leading-relaxed">
          {isRTL
            ? "للمشاريع الكبيرة: الوكيل يعالج الملفات على دفعات. كل دفعة تُولَّد → تُحفَظ → تظهر في المعاينة. هذا يمنع تجاوز حدود التوكن ويسمح برؤية التقدم تدريجياً."
            : "For large projects: the agent processes files in batches. Each batch is generated → saved → shown in preview. This prevents token limit overflows and allows seeing progress incrementally."
          }
        </p>
      </div>

      <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
        <h3 className="text-sm font-medium mb-2">{isRTL ? "التكلفة الإجمالية" : "Total Cost"}</h3>
        <div className="text-2xl font-bold text-[#7c3aed]">${parseFloat(agent.totalCostUsd || "0").toFixed(4)}</div>
        <p className="text-[11px] text-[#8b949e] mt-1">{isRTL ? "إجمالي التكلفة منذ إنشاء الوكيل" : "Total cost since agent creation"}</p>
      </div>
    </div>
  );
}

function CodeTab({ agent, isRTL }: { agent: AgentConfig; isRTL: boolean }) {
  return (
    <div className="max-w-2xl">
      <h3 className="text-sm font-medium mb-3">{isRTL ? "ملفات الكود المصدري" : "Source Code Files"}</h3>
      <div className="space-y-2">
        {(agent.sourceFiles || []).map((file, i) => (
          <div key={i} className="flex items-center gap-2 bg-[#0d1117] border border-white/7 rounded-lg px-3 py-2.5">
            <Code className="w-4 h-4 text-[#8b949e] flex-shrink-0" />
            <span className="text-[12px] font-mono text-[#58a6ff]">{file}</span>
          </div>
        ))}
        {(!agent.sourceFiles || agent.sourceFiles.length === 0) && (
          <p className="text-[12px] text-[#8b949e]">{isRTL ? "لا توجد ملفات مصدرية مرتبطة" : "No source files linked"}</p>
        )}
      </div>
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
              <span className="text-[11px] text-[#8b949e]">{card.label}</span>
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
                <span className="flex-1 text-[#8b949e]">{new Date(task.createdAt).toLocaleString()}</span>
                <span>{(task.tokensUsed || 0).toLocaleString()} tok</span>
                <span className="text-[#8b949e]">{task.durationMs ? `${(task.durationMs / 1000).toFixed(1)}s` : "-"}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
