import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import {
  ArrowLeft,
  Send,
  X,
  Copy,
  Check,
  Download,
  Trash2,
  Server,
  Shield,
  Crosshair,
  Palette,
  Database,
  Lock,
  Rocket,
  Activity,
  Bot,
  Crown,
  Settings,
  Save,
  RotateCcw,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelSlot {
  provider: string;
  model: string;
  enabled: boolean;
  creativity: number;
  timeoutSeconds: number;
  maxTokens: number;
}

interface FullAgentConfig {
  id: string;
  agentKey: string;
  displayNameEn: string;
  displayNameAr: string;
  description: string;
  enabled: boolean;
  agentLayer: string;
  governorEnabled: boolean;
  autoGovernor: boolean;
  governorModel: { provider: string; model: string; creativity: number; timeoutSeconds: number; maxTokens: number } | null;
  primaryModel: ModelSlot;
  secondaryModel: ModelSlot | null;
  tertiaryModel: ModelSlot | null;
  systemPrompt: string;
  instructions: string;
  permissions: string[];
  creativity: string;
  tokenLimit: number;
  batchSize: number;
  sourceFiles: string[];
  shortTermMemory: any[];
  longTermMemory: any[];
  receivesFrom: string | null;
  sendsTo: string | null;
  roleOnReceive: string | null;
  roleOnSend: string | null;
  pipelineOrder: number;
  totalTokensUsed: number;
  totalTasksCompleted: number;
  totalErrors: number;
  avgExecutionMs: number;
  totalCostUsd: string;
}

interface InfraAgent {
  id: string;
  agentKey: string;
  displayNameEn: string;
  displayNameAr: string;
  description: string;
  enabled: boolean;
  primaryModel: { provider: string; model: string };
}

interface ToolLogEntry {
  step: number;
  tool: string;
  status: "running" | "success" | "failed" | "blocked";
  detail?: string;
  file?: string;
}

interface FileRef {
  name: string;
  path: string;
  type: string;
}

interface SummaryData {
  actionsDone: string[];
  filesChanged: string[];
  dbChanges: string[];
  status: "success" | "failed" | "incomplete";
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "status" | "approval" | "tool_log" | "file_ref" | "summary";
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  cost?: number;
  model?: string;
  models?: string[];
  toolLogs?: ToolLogEntry[];
  fileRefs?: FileRef[];
  summaryData?: SummaryData;
}

const FILE_ICONS: Record<string, string> = {
  ".tsx": "🧩",
  ".jsx": "🧩",
  ".js": "📜",
  ".ts": "📘",
  ".css": "🎨",
  ".json": "🧾",
  ".sql": "🗄️",
  ".html": "🌐",
  ".md": "📝",
  ".py": "🐍",
  ".sh": "⚙️",
  ".yml": "📋",
  ".yaml": "📋",
  ".env": "🔒",
};

function getFileIcon(filename: string): string {
  const ext = filename.includes(".") ? "." + filename.split(".").pop()!.toLowerCase() : "";
  return FILE_ICONS[ext] || "📄";
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  infra_sysadmin: <Crown className="w-5 h-5" />,
  infra_monitor: <Activity className="w-5 h-5" />,
  infra_bugfixer: <Crosshair className="w-5 h-5" />,
  infra_builder: <Server className="w-5 h-5" />,
  infra_ui: <Palette className="w-5 h-5" />,
  infra_db: <Database className="w-5 h-5" />,
  infra_security: <Lock className="w-5 h-5" />,
  infra_deploy: <Rocket className="w-5 h-5" />,
  infra_qa: <FlaskConical className="w-5 h-5" />,
};

const AGENT_COLORS: Record<string, string> = {
  infra_sysadmin: "text-yellow-400",
  infra_monitor: "text-green-400",
  infra_bugfixer: "text-red-400",
  infra_builder: "text-blue-400",
  infra_ui: "text-purple-400",
  infra_db: "text-amber-400",
  infra_security: "text-emerald-400",
  infra_deploy: "text-cyan-400",
  infra_qa: "text-pink-400",
};

function MessageContent({ content }: { content: string }) {
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);

  const handleCopy = (code: string, idx: number) => {
    navigator.clipboard.writeText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const parseContent = (text: string) => {
    const segments: Array<{ type: "text" | "code"; lang?: string; value: string }> = [];
    let remaining = text;
    while (remaining.length > 0) {
      const openIdx = remaining.indexOf("```");
      if (openIdx === -1) { segments.push({ type: "text", value: remaining }); break; }
      if (openIdx > 0) segments.push({ type: "text", value: remaining.slice(0, openIdx) });
      const afterOpen = remaining.slice(openIdx + 3);
      const langMatch = afterOpen.match(/^(\w*)\n?/);
      const lang = langMatch ? langMatch[1] : "";
      const codeStart = langMatch ? langMatch[0].length : 0;
      const closeIdx = afterOpen.indexOf("```", codeStart);
      if (closeIdx === -1) { segments.push({ type: "code", lang, value: afterOpen.slice(codeStart) }); break; }
      segments.push({ type: "code", lang, value: afterOpen.slice(codeStart, closeIdx) });
      remaining = afterOpen.slice(closeIdx + 3);
    }
    return segments;
  };

  const renderText = (text: string, keyPrefix: number) => {
    if (!text.trim()) return null;
    const lines = text.split("\n");
    return lines.map((line, li) => {
      const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
      const rendered = boldParts.map((seg, si) => {
        const boldMatch = seg.match(/^\*\*([^*]+)\*\*$/);
        if (boldMatch) return <strong key={si} className="font-bold text-[#e1e4e8]">{boldMatch[1]}</strong>;
        const inlineParts = seg.split(/(`[^`]+`)/g);
        return inlineParts.map((ip, ii) => {
          const inlineMatch = ip.match(/^`([^`]+)`$/);
          if (inlineMatch) return <code key={`${si}-${ii}`} className="px-1.5 py-0.5 bg-[#1c2333] rounded text-[13px] text-cyan-300 border border-[#30363d]" dir="ltr">{inlineMatch[1]}</code>;
          return <React.Fragment key={`${si}-${ii}`}>{ip}</React.Fragment>;
        });
      });
      return <React.Fragment key={`${keyPrefix}-${li}`}>{li > 0 && <br />}{rendered}</React.Fragment>;
    });
  };

  const segments = parseContent(content);
  const extMap: Record<string, string> = {
    html: "html", css: "css", javascript: "js", js: "js", typescript: "ts", ts: "ts",
    tsx: "tsx", jsx: "jsx", python: "py", json: "json", bash: "sh", shell: "sh",
    sql: "sql", xml: "xml", yaml: "yml", php: "php",
  };

  return (
    <div style={{ fontSize: "14px", lineHeight: 1.7, wordBreak: "break-word", overflowWrap: "break-word" }}>
      {segments.map((seg, i) => {
        if (seg.type === "code") {
          const code = seg.value.trim();
          const langLabel = seg.lang || "code";
          const fileExt = extMap[langLabel.toLowerCase()] || "txt";
          const handleDownload = () => {
            const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = `code.${fileExt}`; a.click();
            URL.revokeObjectURL(url);
          };
          return (
            <div key={i} className="my-3 rounded-lg border border-[#30363d]">
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#1c2333] rounded-t-lg">
                <span className="text-[10px] text-[#d4dae3] uppercase tracking-wide">{langLabel}</span>
              </div>
              <pre className="p-3 bg-[#0d1117] text-[13px] leading-relaxed text-[#e1e4e8] overflow-x-auto" dir="ltr">
                <code>{code}</code>
              </pre>
              {code.length > 0 && (
                <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 px-2 py-1.5">
                  <button onClick={() => handleCopy(code, i)} className="flex items-center gap-1 px-2 py-1 rounded border border-[#30363d] bg-[#1c2333] text-[10px] text-[#d4dae3] hover:text-[#e1e4e8] transition-colors">
                    {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedIdx === i ? "Copied" : "Copy"}</span>
                  </button>
                  <button onClick={handleDownload} className="flex items-center gap-1 px-2 py-1 rounded border border-[#30363d] bg-[#1c2333] text-[10px] text-[#d4dae3] hover:text-[#e1e4e8] transition-colors">
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        }
        return <div key={i} className="whitespace-pre-wrap">{renderText(seg.value, i)}</div>;
      })}
    </div>
  );
}

const INFRA_MODEL_OPTIONS = [
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
];

function getInfraModelLabel(provider: string, model: string) {
  const found = INFRA_MODEL_OPTIONS.find(m => m.provider === provider && m.model === model);
  return found?.label || `${provider}/${model}`;
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

function ModelSlotEditor({ slot, label, onChange, lang, showCustomInput }: { slot: ModelSlot | null; label: string; onChange: (s: ModelSlot) => void; lang: string; showCustomInput?: boolean }) {
  const current = slot || { provider: "anthropic", model: "claude-sonnet-4-6", enabled: false, creativity: 0.7, timeoutSeconds: 240, maxTokens: 16000 };
  const creativity = current.creativity ?? 0.7;
  const timeoutSeconds = current.timeoutSeconds ?? 240;
  const maxTokens = current.maxTokens ?? 16000;
  const isRTL = lang === "ar";
  const creativityInfo = getCreativityLabel(creativity, isRTL);
  const [customModel, setCustomModel] = useState(false);

  return (
    <div className="bg-[#0d1117] border border-white/10 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium text-[#e1e4e8]">{label}</span>
        <button
          onClick={() => onChange({ ...current, enabled: !current.enabled })}
          className={cn("text-[11px] px-2 py-0.5 rounded-full", current.enabled ? "bg-green-500/15 text-green-400" : "bg-white/5 text-[#d4dae3]")}
        >
          {current.enabled ? (isRTL ? "مفعّل" : "Active") : (isRTL ? "معطّل" : "Off")}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <select
          value={customModel ? "__custom__" : `${current.provider}::${current.model}`}
          onChange={e => {
            if (e.target.value === "__custom__") {
              setCustomModel(true);
            } else {
              setCustomModel(false);
              const [provider, model] = e.target.value.split("::");
              onChange({ ...current, provider, model });
            }
          }}
          className="flex-1 bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-[#e2e8f0]"
        >
          {INFRA_MODEL_OPTIONS.map(m => (
            <option key={`${m.provider}::${m.model}`} value={`${m.provider}::${m.model}`}>{m.label}</option>
          ))}
          <option value="__custom__">{isRTL ? "✏️ نموذج مخصص..." : "✏️ Custom model..."}</option>
        </select>
      </div>

      {customModel && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div>
            <label className="text-[10px] text-[#484f58] mb-1 block">{isRTL ? "المزوّد" : "Provider"}</label>
            <input
              value={current.provider}
              onChange={e => onChange({ ...current, provider: e.target.value })}
              placeholder="anthropic, openai, google..."
              className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-[#e2e8f0]"
            />
          </div>
          <div>
            <label className="text-[10px] text-[#484f58] mb-1 block">{isRTL ? "اسم النموذج" : "Model name"}</label>
            <input
              value={current.model}
              onChange={e => onChange({ ...current, model: e.target.value })}
              placeholder="claude-sonnet-4-6..."
              className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-1.5 text-[12px] text-[#e2e8f0]"
              dir="ltr"
            />
          </div>
        </div>
      )}

      <div className="space-y-2.5">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-[#d4dae3]">{isRTL ? "الإبداع" : "Creativity"}</label>
            <span className={cn("text-[10px] font-medium", creativityInfo.color)}>{creativityInfo.label} ({creativity.toFixed(2)})</span>
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
            <span>{isRTL ? "مبدع جداً" : "V.Creative"}</span>
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
            max="200000"
            step="1000"
            value={maxTokens}
            onChange={e => onChange({ ...current, maxTokens: parseInt(e.target.value) })}
            className="w-full accent-[#3b82f6] h-1.5"
          />
          <div className="flex justify-between text-[9px] text-[#d4dae3]/50 mt-0.5">
            <span>1K</span>
            <span>50K</span>
            <span>100K</span>
            <span>150K</span>
            <span>200K</span>
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

function AgentSettingsPanel({ config, onClose, onSave, lang }: { config: FullAgentConfig; onClose: () => void; onSave: (updated: FullAgentConfig) => void; lang: string }) {
  const [data, setData] = useState<FullAgentConfig>(config);
  const [activeTab, setActiveTab] = useState("models");
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [newPerm, setNewPerm] = useState("");
  const [newSourceFile, setNewSourceFile] = useState("");

  const tabs = [
    { key: "models", label: lang === "ar" ? "النماذج" : "Models" },
    { key: "prompt", label: lang === "ar" ? "البرومبت" : "Prompt" },
    { key: "instructions", label: lang === "ar" ? "التعليمات" : "Instructions" },
    { key: "permissions", label: lang === "ar" ? "الصلاحيات" : "Permissions" },
    { key: "memory", label: lang === "ar" ? "الذاكرة" : "Memory" },
    { key: "pipeline", label: lang === "ar" ? "الأنبوب" : "Pipeline" },
    { key: "stats", label: lang === "ar" ? "الإحصائيات" : "Stats" },
  ];

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/configs/${data.agentKey}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (res.ok) {
        onSave(data);
      }
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const handleReset = async () => {
    if (!confirm(lang === "ar" ? "هل أنت متأكد؟ سيتم إعادة جميع إعدادات هذا الوكيل للوضع الافتراضي." : "Are you sure? All settings for this agent will be reset to defaults.")) return;
    setResetting(true);
    try {
      const res = await fetch(`/api/infra/reset/${data.agentKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (res.ok) {
        const updated = await res.json();
        setData(updated);
        onSave(updated);
      }
    } catch (err) {
      console.error(err);
    }
    setResetting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ms-auto w-full max-w-2xl h-full bg-[#0d1117] border-s border-[#1c2333] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1c2333] bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-[#0d1117]", AGENT_COLORS[data.agentKey] || "text-[#d4dae3]")}>
              {AGENT_ICONS[data.agentKey] || <Bot className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#e1e4e8]">{lang === "ar" ? data.displayNameAr : data.displayNameEn}</h2>
              <p className="text-[10px] text-[#484f58]">{data.agentKey}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setData({ ...data, enabled: !data.enabled })} className={cn("px-2 py-1 rounded text-[10px] font-medium border", data.enabled ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : "border-red-500/30 text-red-400 bg-red-500/10")}>
              {data.enabled ? (lang === "ar" ? "مفعّل" : "Enabled") : (lang === "ar" ? "معطّل" : "Disabled")}
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-[#1c2333] rounded text-[#d4dae3] hover:text-[#e1e4e8]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-[#1c2333] bg-[#161b22] overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn("px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2", activeTab === tab.key ? "text-cyan-400 border-cyan-400" : "text-[#d4dae3] border-transparent hover:text-[#e1e4e8]")}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "models" && (
            <div className="max-w-2xl space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#484f58] mb-1 block">{lang === "ar" ? "الاسم (EN)" : "Name (EN)"}</label>
                  <input value={data.displayNameEn} onChange={e => setData({ ...data, displayNameEn: e.target.value })} className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#e1e4e8]" />
                </div>
                <div>
                  <label className="text-[10px] text-[#484f58] mb-1 block">{lang === "ar" ? "الاسم (AR)" : "Name (AR)"}</label>
                  <input value={data.displayNameAr} onChange={e => setData({ ...data, displayNameAr: e.target.value })} className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#e1e4e8]" dir="rtl" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#484f58] mb-1 block">{lang === "ar" ? "الوصف" : "Description"}</label>
                <textarea value={data.description || ""} onChange={e => setData({ ...data, description: e.target.value })} rows={2} className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-sm text-[#e1e4e8]" />
              </div>

              <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-yellow-400" />
                    <span className="font-medium text-sm text-[#e1e4e8]">{lang === "ar" ? "نظام الحاكم (Governor)" : "Governor System"}</span>
                  </div>
                  <button
                    onClick={() => {
                      const updates: Partial<FullAgentConfig> = { governorEnabled: !data.governorEnabled };
                      if (!data.governorEnabled) updates.autoGovernor = false;
                      setData({ ...data, ...updates });
                    }}
                    className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors", data.governorEnabled ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30" : "bg-white/5 text-[#d4dae3] border border-white/10")}
                  >
                    {data.governorEnabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {data.governorEnabled ? (lang === "ar" ? "دمج مفعّل" : "Merge Active") : (lang === "ar" ? "بدون دمج" : "No Merge")}
                  </button>
                </div>
                <p className="text-[11px] text-[#d4dae3] leading-relaxed mb-3">
                  {lang === "ar"
                    ? "عند تفعيل الحاكم: النماذج الثلاثة تفكّر بنفس المشكلة بشكل مستقل، ثم الحاكم يأخذ أفضل الأفكار من كل نموذج ويدمجها في حل نهائي متفوّق."
                    : "When enabled: All 3 models think independently, then the Governor extracts the best ideas and merges them into a superior final solution."
                  }
                </p>

                <div className="bg-[#0d1117] border border-white/7 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[12px] font-medium text-emerald-400">{lang === "ar" ? "الحاكم التلقائي (Auto-Governor)" : "Auto-Governor"}</span>
                    </div>
                    <button
                      onClick={() => {
                        const updates: Partial<FullAgentConfig> = { autoGovernor: !data.autoGovernor };
                        if (!data.autoGovernor) updates.governorEnabled = false;
                        setData({ ...data, ...updates });
                      }}
                      className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] transition-colors", data.autoGovernor ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" : "bg-white/5 text-[#d4dae3] border border-white/10")}
                    >
                      {data.autoGovernor ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      {data.autoGovernor ? (lang === "ar" ? "مفعّل" : "Active") : (lang === "ar" ? "معطّل" : "Off")}
                    </button>
                  </div>
                  <p className="text-[10px] text-[#d4dae3] mt-2 leading-relaxed">
                    {lang === "ar"
                      ? "يقدّر تعقيد الرسالة تلقائياً (0-100) ويختار الوضع المناسب: بسيط → عادي → متقدم (3 نماذج + حاكم)."
                      : "Auto-scores complexity (0-100) and picks the right mode: Simple → Standard → Advanced (3 models + judge)."
                    }
                  </p>
                  {data.autoGovernor && (
                    <div className="mt-2 grid grid-cols-3 gap-1.5">
                      <div className="bg-[#161b22] rounded px-2 py-1.5 text-center">
                        <div className="text-[10px] text-emerald-400 font-medium">{lang === "ar" ? "بسيط" : "Simple"}</div>
                        <div className="text-[9px] text-[#d4dae3]">{lang === "ar" ? "0-20 نقطة" : "0-20 pts"}</div>
                      </div>
                      <div className="bg-[#161b22] rounded px-2 py-1.5 text-center">
                        <div className="text-[10px] text-blue-400 font-medium">{lang === "ar" ? "عادي" : "Standard"}</div>
                        <div className="text-[9px] text-[#d4dae3]">{lang === "ar" ? "21-55 نقطة" : "21-55 pts"}</div>
                      </div>
                      <div className="bg-[#161b22] rounded px-2 py-1.5 text-center">
                        <div className="text-[10px] text-orange-400 font-medium">{lang === "ar" ? "متقدم" : "Advanced"}</div>
                        <div className="text-[9px] text-[#d4dae3]">{lang === "ar" ? "56-100 نقطة" : "56-100 pts"}</div>
                      </div>
                    </div>
                  )}
                </div>

                {data.governorEnabled && (() => {
                  const gov = data.governorModel || { provider: "anthropic", model: "claude-sonnet-4-6", creativity: 0.5, timeoutSeconds: 300, maxTokens: 16000 };
                  const govCreativityInfo = getCreativityLabel(gov.creativity ?? 0.5, lang === "ar");
                  return (
                    <div className="bg-[#0d1117] border border-yellow-500/20 rounded-lg p-3 mt-2">
                      <div className="flex items-center gap-2 mb-2">
                        <Activity className="w-3.5 h-3.5 text-yellow-400" />
                        <span className="text-[12px] font-medium text-yellow-400">{lang === "ar" ? "نموذج الحاكم (من يدمج النتائج)" : "Governor Model (who merges results)"}</span>
                      </div>
                      <select
                        value={gov.provider && gov.model ? `${gov.provider}::${gov.model}` : ""}
                        onChange={e => {
                          if (e.target.value === "") {
                            setData({ ...data, governorModel: null });
                          } else {
                            const [provider, model] = e.target.value.split("::");
                            setData({ ...data, governorModel: { provider, model, creativity: gov.creativity ?? 0.5, timeoutSeconds: gov.timeoutSeconds ?? 300, maxTokens: gov.maxTokens ?? 16000 } });
                          }
                        }}
                        className="w-full bg-[#161b22] border border-yellow-500/20 rounded-lg px-3 py-2 text-[12px] text-[#e2e8f0] mb-3"
                      >
                        <option value="">{lang === "ar" ? "تلقائي (يستخدم النموذج الأساسي)" : "Auto (uses primary model)"}</option>
                        {INFRA_MODEL_OPTIONS.map(m => (
                          <option key={`${m.provider}::${m.model}`} value={`${m.provider}::${m.model}`}>{m.label}</option>
                        ))}
                      </select>

                      {gov.provider && gov.model && (
                        <div className="space-y-2.5">
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] text-yellow-400/70">{lang === "ar" ? "إبداع الحاكم" : "Governor Creativity"}</label>
                              <span className={cn("text-[10px] font-medium", govCreativityInfo.color)}>{govCreativityInfo.label} ({(gov.creativity ?? 0.5).toFixed(2)})</span>
                            </div>
                            <input type="range" min="0" max="2" step="0.05" value={gov.creativity ?? 0.5} onChange={e => setData({ ...data, governorModel: { ...gov, creativity: parseFloat(e.target.value) } })} className="w-full accent-yellow-400 h-1.5" />
                            <div className="flex justify-between text-[9px] text-yellow-400/30 mt-0.5">
                              <span>{lang === "ar" ? "متزن" : "Balanced"}</span>
                              <span>{lang === "ar" ? "متوسط" : "Moderate"}</span>
                              <span>{lang === "ar" ? "ذكي" : "Smart"}</span>
                              <span>{lang === "ar" ? "مبدع" : "Creative"}</span>
                              <span>{lang === "ar" ? "مبدع جداً" : "V.Creative"}</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] text-yellow-400/70">{lang === "ar" ? "توكن الحاكم" : "Governor Tokens"}</label>
                              <span className="text-[10px] font-mono text-yellow-400">{formatTokens(gov.maxTokens ?? 16000)}</span>
                            </div>
                            <input type="range" min="1000" max="200000" step="1000" value={gov.maxTokens ?? 16000} onChange={e => setData({ ...data, governorModel: { ...gov, maxTokens: parseInt(e.target.value) } })} className="w-full accent-yellow-500 h-1.5" />
                            <div className="flex justify-between text-[9px] text-yellow-400/30 mt-0.5">
                              <span>1K</span>
                              <span>50K</span>
                              <span>100K</span>
                              <span>150K</span>
                              <span>200K</span>
                            </div>
                          </div>
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="text-[10px] text-yellow-400/70">{lang === "ar" ? "مهلة الحاكم (ثانية)" : "Governor Timeout (s)"}</label>
                              <span className="text-[10px] font-mono text-yellow-400">{gov.timeoutSeconds ?? 300}s</span>
                            </div>
                            <input type="number" min="30" max="600" step="10" value={gov.timeoutSeconds ?? 300} onChange={e => setData({ ...data, governorModel: { ...gov, timeoutSeconds: parseInt(e.target.value) || 300 } })} className="w-full bg-[#161b22] border border-yellow-500/20 rounded px-2 py-1 text-[11px] text-yellow-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="grid gap-3">
                <ModelSlotEditor slot={data.primaryModel} label={lang === "ar" ? "النموذج الأساسي" : "Primary Model"} onChange={s => setData({ ...data, primaryModel: s })} lang={lang} />
                <ModelSlotEditor slot={data.secondaryModel} label={lang === "ar" ? "النموذج الثانوي" : "Secondary Model"} onChange={s => setData({ ...data, secondaryModel: s })} lang={lang} />
                <ModelSlotEditor slot={data.tertiaryModel} label={lang === "ar" ? "النموذج الثالث" : "Tertiary Model"} onChange={s => setData({ ...data, tertiaryModel: s })} lang={lang} />
              </div>

              <div className="bg-[#161b22] border border-white/7 rounded-xl p-4">
                <p className="text-[10px] text-[#d4dae3]/60">
                  {lang === "ar"
                    ? "كل نموذج يمكن ضبط إبداعه وتوكنه ومهلته بشكل مستقل — غيّر القيم مباشرة في كل خانة نموذج. يمكنك أيضاً كتابة اسم نموذج مخصص عبر خيار \"نموذج مخصص\"."
                    : "Each model has its own creativity, tokens, and timeout. You can also type any custom model name via the \"Custom model\" option."
                  }
                </p>
              </div>
            </div>
          )}

          {activeTab === "prompt" && (
            <div>
              <label className="text-xs text-[#d4dae3] mb-2 block">{lang === "ar" ? "البرومبت الأساسي" : "System Prompt"}</label>
              <textarea value={data.systemPrompt} onChange={e => setData({ ...data, systemPrompt: e.target.value })} rows={20} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8] font-mono leading-relaxed" dir="ltr" />
            </div>
          )}

          {activeTab === "instructions" && (
            <div>
              <label className="text-xs text-[#d4dae3] mb-2 block">{lang === "ar" ? "تعليمات إضافية" : "Additional Instructions"}</label>
              <textarea value={data.instructions || ""} onChange={e => setData({ ...data, instructions: e.target.value })} rows={12} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8] font-mono leading-relaxed" dir="ltr" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "حد التوكن" : "Token Limit"}</label>
                  <input type="number" value={data.tokenLimit} onChange={e => setData({ ...data, tokenLimit: parseInt(e.target.value) || 100000 })} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" />
                </div>
                <div>
                  <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "حجم الدفعة" : "Batch Size"}</label>
                  <input type="number" value={data.batchSize} onChange={e => setData({ ...data, batchSize: parseInt(e.target.value) || 10 })} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" />
                </div>
              </div>
              <div className="mt-4">
                <label className="text-xs text-[#d4dae3] mb-2 block">{lang === "ar" ? "ملفات المصدر" : "Source Files"}</label>
                <div className="space-y-1">
                  {(data.sourceFiles || []).map((sf, i) => (
                    <div key={i} className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded px-2 py-1">
                      <span className="text-xs text-[#e1e4e8] flex-1 font-mono">{sf}</span>
                      <button onClick={() => setData({ ...data, sourceFiles: data.sourceFiles.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-300">
                        <Minus className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <input value={newSourceFile} onChange={e => setNewSourceFile(e.target.value)} placeholder="src/..." className="flex-1 bg-[#161b22] border border-[#30363d] rounded px-2 py-1 text-xs text-[#e1e4e8]" dir="ltr" />
                  <button onClick={() => { if (newSourceFile.trim()) { setData({ ...data, sourceFiles: [...(data.sourceFiles || []), newSourceFile.trim()] }); setNewSourceFile(""); } }} className="p-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "permissions" && (
            <div>
              <label className="text-xs text-[#d4dae3] mb-2 block">{lang === "ar" ? "الصلاحيات" : "Permissions"}</label>
              <div className="space-y-1">
                {(data.permissions || []).map((perm, i) => (
                  <div key={i} className="flex items-center gap-2 bg-[#161b22] border border-[#30363d] rounded px-3 py-1.5">
                    <span className="text-xs text-[#e1e4e8] flex-1">{perm}</span>
                    <button onClick={() => setData({ ...data, permissions: data.permissions.filter((_, j) => j !== i) })} className="text-red-400 hover:text-red-300">
                      <Minus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <input value={newPerm} onChange={e => setNewPerm(e.target.value)} placeholder={lang === "ar" ? "صلاحية جديدة..." : "New permission..."} className="flex-1 bg-[#161b22] border border-[#30363d] rounded px-3 py-1.5 text-xs text-[#e1e4e8]" onKeyDown={e => {
                  if (e.key === "Enter" && newPerm.trim()) { setData({ ...data, permissions: [...(data.permissions || []), newPerm.trim()] }); setNewPerm(""); }
                }} />
                <button onClick={() => { if (newPerm.trim()) { setData({ ...data, permissions: [...(data.permissions || []), newPerm.trim()] }); setNewPerm(""); } }} className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30">
                  <Plus className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {activeTab === "memory" && (
            <>
              <div>
                <label className="text-xs text-[#d4dae3] mb-2 block">{lang === "ar" ? "ذاكرة قصيرة المدى" : "Short-Term Memory"} ({(data.shortTermMemory || []).length})</label>
                <textarea value={JSON.stringify(data.shortTermMemory || [], null, 2)} onChange={e => { try { setData({ ...data, shortTermMemory: JSON.parse(e.target.value) }); } catch {} }} rows={6} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8] font-mono" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-[#d4dae3] mb-2 block">{lang === "ar" ? "ذاكرة طويلة المدى" : "Long-Term Memory"} ({(data.longTermMemory || []).length})</label>
                <textarea value={JSON.stringify(data.longTermMemory || [], null, 2)} onChange={e => { try { setData({ ...data, longTermMemory: JSON.parse(e.target.value) }); } catch {} }} rows={6} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8] font-mono" dir="ltr" />
              </div>
            </>
          )}

          {activeTab === "pipeline" && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "ترتيب الأنبوب" : "Pipeline Order"}</label>
                  <input type="number" value={data.pipelineOrder} onChange={e => setData({ ...data, pipelineOrder: parseInt(e.target.value) || 0 })} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" />
                </div>
                <div>
                  <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "يستقبل من" : "Receives From"}</label>
                  <input value={data.receivesFrom || ""} onChange={e => setData({ ...data, receivesFrom: e.target.value || null })} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" />
                </div>
                <div>
                  <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "يرسل إلى" : "Sends To"}</label>
                  <input value={data.sendsTo || ""} onChange={e => setData({ ...data, sendsTo: e.target.value || null })} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "دور عند الاستقبال" : "Role on Receive"}</label>
                <textarea value={data.roleOnReceive || ""} onChange={e => setData({ ...data, roleOnReceive: e.target.value || null })} rows={2} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8]" />
              </div>
              <div>
                <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "دور عند الإرسال" : "Role on Send"}</label>
                <textarea value={data.roleOnSend || ""} onChange={e => setData({ ...data, roleOnSend: e.target.value || null })} rows={2} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8]" />
              </div>
            </div>
          )}

          {activeTab === "stats" && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: lang === "ar" ? "المهام المكتملة" : "Tasks Completed", value: data.totalTasksCompleted.toLocaleString() },
                { label: lang === "ar" ? "التوكنات المستخدمة" : "Tokens Used", value: data.totalTokensUsed.toLocaleString() },
                { label: lang === "ar" ? "الأخطاء" : "Errors", value: data.totalErrors.toLocaleString() },
                { label: lang === "ar" ? "متوسط التنفيذ" : "Avg Execution", value: `${data.avgExecutionMs.toLocaleString()}ms` },
                { label: lang === "ar" ? "التكلفة الإجمالية" : "Total Cost", value: `$${parseFloat(data.totalCostUsd).toFixed(4)}` },
              ].map(stat => (
                <div key={stat.label} className="bg-[#161b22] border border-[#1c2333] rounded-lg p-3">
                  <div className="text-[10px] text-[#484f58]">{stat.label}</div>
                  <div className="text-lg font-semibold text-[#e1e4e8] mt-1">{stat.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#1c2333] bg-[#161b22] px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2 text-xs text-[#d4dae3] hover:text-[#e1e4e8] border border-[#30363d] rounded-lg hover:bg-[#1c2333] transition-colors">
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </button>
            <button onClick={handleReset} disabled={resetting} className="px-4 py-2 text-xs text-orange-400 hover:text-orange-300 border border-orange-500/30 rounded-lg hover:bg-orange-500/10 transition-colors flex items-center gap-2 disabled:opacity-50">
              {resetting ? <RotateCcw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              {lang === "ar" ? "إعادة للافتراضي" : "Reset to Default"}
            </button>
          </div>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-xs font-medium text-black bg-cyan-500 hover:bg-cyan-400 rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2">
            {saving ? <RotateCcw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            {lang === "ar" ? "حفظ التغييرات" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InfraPanel() {
  const { lang } = useI18n();
  const [agents, setAgents] = useState<InfraAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<InfraAgent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [settingsAgent, setSettingsAgent] = useState<string | null>(null);
  const [fullConfig, setFullConfig] = useState<FullAgentConfig | null>(null);
  const toolLogRef = useRef<ToolLogEntry[]>([]);
  const toolStepRef = useRef(0);
  const filesChangedRef = useRef<Set<string>>(new Set());
  const actionsRef = useRef<string[]>([]);
  const dbChangesRef = useRef<string[]>([]);
  const toolLogMsgIdRef = useRef<string | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const activeStreamMsgIdRef = useRef<string | null>(null);

  const openSettings = async (agentKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/agents/configs", { credentials: "include" });
      if (!res.ok) return;
      const body = await res.json();
      const configs: FullAgentConfig[] = Array.isArray(body) ? body : (body.agents || []);
      const cfg = configs.find(c => c.agentKey === agentKey);
      if (cfg) {
        setFullConfig(cfg);
        setSettingsAgent(agentKey);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetch("/api/infra/agents", { credentials: "include" })
      .then(r => {
        if (!r.ok) throw new Error(r.status === 403 ? "Admin access required" : "Failed to load agents");
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          setAgents(data);
          const lastAgentKey = localStorage.getItem("infra_last_agent");
          if (lastAgentKey && !selectedAgent) {
            const found = data.find((a: InfraAgent) => a.agentKey === lastAgentKey);
            if (found) setSelectedAgent(found);
          }
        }
      })
      .catch(console.error);
  }, []);

  const scrollToBottomIfNeeded = useCallback(() => {
    if (userScrolledUpRef.current) return;
    const el = chatContainerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
  }, []);

  useEffect(() => {
    if (!selectedAgent) return;
    const key = `infra_chat_${selectedAgent.agentKey}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restored: ChatMessage[] = parsed.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        setMessages(restored);
        setTimeout(() => scrollToBottomIfNeeded(), 100);
      } catch { setMessages([]); }
    } else {
      setMessages([]);
    }
  }, [selectedAgent]);

  useEffect(() => {
    if (!selectedAgent || messages.length === 0) return;
    const key = `infra_chat_${selectedAgent.agentKey}`;
    const toSave = messages.filter(m => m.role !== "status").slice(-50);
    try {
      localStorage.setItem(key, JSON.stringify(toSave));
    } catch {}
  }, [messages, selectedAgent]);

  const selectAgent = (agent: InfraAgent) => {
    setSelectedAgent(agent);
    setPrompt("");
    localStorage.setItem("infra_last_agent", agent.agentKey);
  };

  const handleStop = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setLoading(false);
  };

  const handleSend = async () => {
    if (!prompt.trim() || !selectedAgent || loading) return;
    const currentPrompt = prompt;
    setPrompt("");
    setLoading(true);
    userScrolledUpRef.current = false;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: currentPrompt,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const streamMsgId = crypto.randomUUID();
      let streamedContent = "";
      let displayedContent = "";
      let streamMeta: { tokensUsed?: number; cost?: number; model?: string; models?: string[] } = {};
      let typewriterRunning = false;
      let typewriterStopped = false;

      const typewriterFlush = () => {
        if (typewriterRunning || typewriterStopped) return;
        typewriterRunning = true;
        const tick = () => {
          if (typewriterStopped) { typewriterRunning = false; return; }
          if (displayedContent.length < streamedContent.length) {
            const remaining = streamedContent.slice(displayedContent.length);
            const alreadyInCode = (displayedContent.match(/```/g) || []).length % 2 === 1;
            const openTick = remaining.indexOf("```");

            if (alreadyInCode) {
              const closeIdx = remaining.indexOf("```");
              displayedContent = closeIdx !== -1
                ? streamedContent.slice(0, displayedContent.length + closeIdx + 3)
                : streamedContent;
            } else if (openTick === 0) {
              const afterOpen = remaining.slice(3);
              const closeIdx = afterOpen.indexOf("```");
              displayedContent = closeIdx !== -1
                ? streamedContent.slice(0, displayedContent.length + 3 + closeIdx + 3)
                : streamedContent;
            } else {
              displayedContent = streamedContent.slice(0, displayedContent.length + 1);
            }

            setMessages(prev => prev.map(m =>
              m.id === streamMsgId ? { ...m, content: displayedContent } : m
            ));
            scrollToBottomIfNeeded();
            setTimeout(tick, alreadyInCode ? 0 : 18);
          } else {
            typewriterRunning = false;
          }
        };
        tick();
      };

      controller.signal.addEventListener("abort", () => { typewriterStopped = true; });

      toolLogRef.current = [];
      toolStepRef.current = 0;
      filesChangedRef.current = new Set();
      actionsRef.current = [];
      dbChangesRef.current = [];
      toolLogMsgIdRef.current = null;

      activeStreamMsgIdRef.current = streamMsgId;
      setMessages(prev => [...prev, { id: streamMsgId, role: "assistant", content: "", timestamp: new Date() }]);

      const endpoint = "/api/infra/chat-stream";
      const pageContext = {
        currentPage: window.location.pathname,
        projectId: window.location.pathname.match(/\/project\/([^/]+)/)?.[1] || null,
        mode: "infra" as const,
      };
      const body = { agentKey: selectedAgent.agentKey, message: currentPrompt, context: pageContext };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let errMsg = `Error ${res.status}`;
        try { const errData = await res.json(); errMsg = errData?.error?.message || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "chunk") { streamedContent += event.text; typewriterFlush(); }
            else if (event.type === "status") {
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: event.message || event.messageEn, timestamp: new Date() }]);
              scrollToBottomIfNeeded();
            }
            else if (event.type === "approval_request") {
              setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: "approval",
                content: JSON.stringify(event),
                timestamp: new Date(),
              } as any]);
              scrollToBottomIfNeeded();
            }
            else if (event.type === "tool_result") {
              toolStepRef.current++;
              const toolName = event.name || "unknown";
              const resultStr = typeof event.result === "string" ? event.result : JSON.stringify(event.result || "");
              const isSuccess = resultStr.includes("EDIT_SUCCESS") || resultStr.includes("WRITE_SUCCESS") || resultStr.includes("✅");
              const isFailed = resultStr.includes("EDIT_FAILED") || resultStr.includes("WRITE_FAILED") || resultStr.includes("⚠️") || resultStr.includes("BLOCKED");
              const status: ToolLogEntry["status"] = isFailed ? "failed" : isSuccess ? "success" : "running";

              const entry: ToolLogEntry = {
                step: toolStepRef.current,
                tool: toolName,
                status,
                detail: resultStr.slice(0, 120),
              };

              if (toolName === "edit_component" || toolName === "write_file" || toolName === "read_file" || toolName === "search_text") {
                let filePath = "";
                try {
                  const parsed = JSON.parse(resultStr);
                  filePath = parsed.path || "";
                } catch {
                  const pathMatch = resultStr.match(/(?:الملف|path|📁)[:\s]*([^\s\n,]+\.\w+)/);
                  if (pathMatch) filePath = pathMatch[1];
                }
                if (filePath) {
                  entry.file = filePath;
                  const fileName = filePath.split("/").pop() || filePath;
                  filesChangedRef.current.add(filePath);

                  if (toolName === "edit_component" || toolName === "write_file") {
                    actionsRef.current.push(`${isSuccess ? "✅" : "❌"} ${toolName}: ${fileName}`);
                  }
                }
              }

              if (toolName === "run_sql" || toolName === "db_query") {
                const snippet = resultStr.slice(0, 80);
                dbChangesRef.current.push(snippet);
              }

              toolLogRef.current = [...toolLogRef.current, entry];

              if (!toolLogMsgIdRef.current) {
                const logMsgId = crypto.randomUUID();
                toolLogMsgIdRef.current = logMsgId;
                setMessages(prev => [...prev, {
                  id: logMsgId,
                  role: "tool_log" as any,
                  content: "",
                  timestamp: new Date(),
                  toolLogs: [...toolLogRef.current],
                }]);
              } else {
                setMessages(prev => prev.map(m =>
                  m.id === toolLogMsgIdRef.current
                    ? { ...m, toolLogs: [...toolLogRef.current] }
                    : m
                ));
              }
              scrollToBottomIfNeeded();
            }
            else if (event.type === "done") { streamMeta = { tokensUsed: event.tokensUsed, cost: event.cost, model: event.model, models: event.models }; }
            else if (event.type === "error") { streamedContent += event.message; typewriterFlush(); }
          } catch {}
        }
      }

      await new Promise<void>(resolve => {
        const wait = () => {
          if (displayedContent.length >= streamedContent.length) resolve();
          else setTimeout(wait, 30);
        };
        wait();
      });

      setMessages(prev => prev.map(m =>
        m.id === streamMsgId ? { ...m, content: streamedContent, ...streamMeta } : m
      ));

      if (toolLogRef.current.length > 0) {
        const hasEdit = actionsRef.current.length > 0;
        const hasFail = toolLogRef.current.some(l => l.status === "failed");
        const summaryData: SummaryData = {
          actionsDone: actionsRef.current.length > 0 ? actionsRef.current : [`${toolLogRef.current.length} أداة`],
          filesChanged: Array.from(filesChangedRef.current),
          dbChanges: dbChangesRef.current,
          status: hasFail && !hasEdit ? "failed" : hasEdit ? "success" : "incomplete",
        };
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "summary" as any,
          content: "",
          timestamp: new Date(),
          summaryData,
        }]);
        scrollToBottomIfNeeded();
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(), role: "assistant",
          content: `خطأ: ${err.message}`, timestamp: new Date(),
        }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
      activeStreamMsgIdRef.current = null;
    }
  };

  const clearSession = async () => {
    if (!selectedAgent) return;
    await fetch("/api/infra/clear-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ agentKey: selectedAgent.agentKey }),
    });
    setMessages([]);
  };

  return (
    <div className="min-h-screen bg-[#0a0e14] flex" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="w-72 bg-[#0d1117] border-e border-[#1c2333] flex flex-col">
        <div className="p-4 border-b border-[#1c2333]">
          <Link href="/">
            <button className="flex items-center gap-2 text-[#d4dae3] hover:text-[#e1e4e8] transition-colors mb-3">
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{lang === "ar" ? "الرئيسية" : "Home"}</span>
            </button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <h1 className="text-lg font-bold text-[#e1e4e8]">
              {lang === "ar" ? "البنية التحتية" : "Infrastructure"}
            </h1>
          </div>
          <p className="text-[11px] text-[#484f58] mt-1">
            {lang === "ar" ? "إدارة وتطوير المنصة" : "Platform management & development"}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {agents.filter(a => a.agentKey === "infra_sysadmin").map(agent => (
            <div
              key={agent.agentKey}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-3 rounded-lg text-start transition-all mb-2",
                selectedAgent?.agentKey === agent.agentKey
                  ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/40"
                  : "bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 hover:border-yellow-500/40"
              )}
            >
              <div className="flex-shrink-0 text-yellow-400 cursor-pointer" onClick={() => selectAgent(agent)}>
                <Crown className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => selectAgent(agent)}>
                <div className="text-sm font-bold text-yellow-300 truncate">
                  {lang === "ar" ? agent.displayNameAr : agent.displayNameEn}
                </div>
                <div className="text-[10px] text-yellow-500/70 truncate">
                  3 models + governor
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); openSettings(agent.agentKey, e); }} className="flex-shrink-0 p-1.5 rounded hover:bg-yellow-500/20 text-yellow-500/40 hover:text-yellow-400 transition-colors" title={lang === "ar" ? "إعدادات الوكيل" : "Agent Settings"}>
                <Settings className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="border-t border-[#1c2333] my-2" />
          {agents.filter(a => a.agentKey !== "infra_sysadmin").map(agent => (
            <div
              key={agent.agentKey}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-start transition-all",
                selectedAgent?.agentKey === agent.agentKey
                  ? "bg-[#1c2333] border border-cyan-500/30"
                  : "hover:bg-[#161b22] border border-transparent"
              )}
            >
              <div className={cn("flex-shrink-0 cursor-pointer", AGENT_COLORS[agent.agentKey] || "text-[#d4dae3]")} onClick={() => selectAgent(agent)}>
                {AGENT_ICONS[agent.agentKey] || <Bot className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => selectAgent(agent)}>
                <div className="text-sm font-medium text-[#e1e4e8] truncate">
                  {lang === "ar" ? agent.displayNameAr : agent.displayNameEn}
                </div>
                <div className="text-[10px] text-[#484f58] truncate">
                  {agent.primaryModel?.model?.split("-").slice(0, 2).join("-") || ""}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); openSettings(agent.agentKey, e); }} className="flex-shrink-0 p-1.5 rounded hover:bg-[#1c2333] text-[#484f58] hover:text-cyan-400 transition-colors" title={lang === "ar" ? "إعدادات الوكيل" : "Agent Settings"}>
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-[#1c2333]">
          <button
            onClick={async () => {
              if (!confirm(lang === "ar" ? "هل أنت متأكد؟ سيتم إعادة جميع الوكلاء للإعدادات الافتراضية." : "Reset ALL agents to their default settings?")) return;
              try {
                const res = await fetch("/api/infra/reset-all", { method: "POST", credentials: "include" });
                if (res.ok) {
                  const r2 = await fetch("/api/infra/agents", { credentials: "include" });
                  if (r2.ok) { const data = await r2.json(); if (Array.isArray(data)) setAgents(data); }
                  setSettingsAgent(null);
                  setFullConfig(null);
                }
              } catch (err) { console.error(err); }
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs text-orange-400 hover:text-orange-300 border border-orange-500/20 rounded-lg hover:bg-orange-500/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {lang === "ar" ? "إعادة الكل للافتراضي" : "Reset All to Defaults"}
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedAgent ? (
          <>
            <header className="bg-[#0d1117] border-b border-[#1c2333] px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg bg-[#161b22]", AGENT_COLORS[selectedAgent.agentKey] || "text-[#d4dae3]")}>
                  {AGENT_ICONS[selectedAgent.agentKey] || <Bot className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#e1e4e8]">
                    {lang === "ar" ? selectedAgent.displayNameAr : selectedAgent.displayNameEn}
                  </h2>
                  <p className="text-[11px] text-[#484f58]">{selectedAgent.description}</p>
                </div>
              </div>
              <button
                onClick={clearSession}
                className="p-2 text-[#d4dae3] hover:text-red-400 hover:bg-[#161b22] rounded-lg transition-colors"
                title={lang === "ar" ? "مسح المحادثة" : "Clear chat"}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </header>

            <div
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-5 space-y-4"
              onWheel={(e) => {
                if (e.deltaY < 0) userScrolledUpRef.current = true;
                else {
                  const el = chatContainerRef.current;
                  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) userScrolledUpRef.current = false;
                }
              }}
              onScroll={() => {
                if (programmaticScrollRef.current) return;
                const el = chatContainerRef.current;
                if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) userScrolledUpRef.current = false;
              }}
            >
              {messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className={cn("w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 bg-[#161b22]", AGENT_COLORS[selectedAgent.agentKey])}>
                      {AGENT_ICONS[selectedAgent.agentKey] || <Bot className="w-8 h-8" />}
                    </div>
                    <h3 className="text-lg font-semibold text-[#e1e4e8] mb-2">
                      {lang === "ar" ? selectedAgent.displayNameAr : selectedAgent.displayNameEn}
                    </h3>
                    <p className="text-sm text-[#484f58] max-w-md">
                      {lang === "ar"
                        ? "اكتب أمرك وسيتم تنفيذه على البنية التحتية للمنصة"
                        : "Type your command and it will be executed on the platform infrastructure"}
                    </p>
                  </div>
                </div>
              )}

              {messages.map(msg => {
                if (msg.role === "status") {
                  return (
                    <div key={msg.id} className="flex items-center justify-center py-1">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#161b22] border border-[#30363d]">
                        <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                        <span className="text-[11px] text-[#d4dae3]">{msg.content}</span>
                      </div>
                    </div>
                  );
                }
                if (msg.role === "approval") {
                  let data: any = {};
                  try { data = JSON.parse(msg.content); } catch {}
                  const riskAr: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", critical: "حرجة" };
                  const catAr: Record<string, string> = { files: "ملفات", database: "قاعدة بيانات", system: "نظام", deploy: "نشر", security: "أمان" };
                  const handleApproval = async (approve: boolean) => {
                    try {
                      await fetch(`/api/ai/${approve ? "approve" : "reject"}/${data.id}`, { method: "POST" });
                      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, content: JSON.stringify({ ...data, decided: approve ? "approved" : "rejected" }) } : m));
                    } catch {}
                  };
                  return (
                    <div key={msg.id} className="py-2">
                      <div className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-4 max-w-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                          <span className="text-[13px] font-bold text-red-400">طلب موافقة</span>
                        </div>
                        <div className="space-y-1.5 text-[12px]">
                          <div><span className="text-[#d4dae3]">العملية:</span> <span className="text-white font-mono">{data.tool}</span></div>
                          <div><span className="text-[#d4dae3]">النوع:</span> <span className="text-white">{catAr[data.category] || data.category}</span></div>
                          <div><span className="text-[#d4dae3]">الخطورة:</span> <span className={`font-bold ${data.risk === "critical" ? "text-red-400" : data.risk === "high" ? "text-orange-400" : "text-amber-400"}`}>{riskAr[data.risk] || data.risk}</span></div>
                          {data.inputSummary && <div className="mt-2 text-[11px] text-[#d4dae3]"><span className="text-[#d4dae3]">التفاصيل:</span> {data.inputSummary.slice(0, 200)}</div>}
                          {!data.inputSummary && data.input && <div className="mt-2 font-mono text-[10px] text-[#d4dae3] bg-[#0d1117] rounded-lg px-3 py-2 max-h-16 overflow-auto">{JSON.stringify(data.input).slice(0, 200)}</div>}
                          <div><span className="text-[#d4dae3]">إمكانية التراجع:</span> <span className={data.reversible ? "text-emerald-400" : "text-red-400"}>{data.reversible ? "نعم" : "لا"}</span></div>
                        </div>
                        {data.decided ? (
                          <div className={`mt-3 text-[12px] font-bold ${data.decided === "approved" ? "text-emerald-400" : "text-red-400"}`}>
                            {data.decided === "approved" ? "تمت الموافقة ✅" : "تم الرفض ❌"}
                          </div>
                        ) : (
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => handleApproval(true)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500/15 text-emerald-400 rounded-lg text-[12px] hover:bg-emerald-500/25 transition-colors border border-emerald-500/20 font-medium">موافق</button>
                            <button onClick={() => handleApproval(false)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-red-500/15 text-red-400 rounded-lg text-[12px] hover:bg-red-500/25 transition-colors border border-red-500/20 font-medium">رفض</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                if (msg.role === "tool_log" && msg.toolLogs && msg.toolLogs.length > 0) {
                  return (
                    <div key={msg.id} className="py-1">
                      <div className="rounded-lg bg-[#161b22] border border-[#30363d] p-2.5 max-w-md">
                        <div className="text-[10px] text-[#484f58] mb-1.5 font-medium">
                          {lang === "ar" ? "سجل الأدوات" : "Tool Log"}
                        </div>
                        <div className="space-y-1">
                          {msg.toolLogs.map((log, i) => (
                            <div key={i}>
                              <div
                                className={cn(
                                  "flex items-center gap-2 text-[11px]",
                                  log.file ? "cursor-pointer hover:bg-[#1c2128] rounded px-1 -mx-1 transition-colors" : ""
                                )}
                                onClick={() => log.file && setExpandedFile(expandedFile === `${msg.id}-${i}` ? null : `${msg.id}-${i}`)}
                              >
                                <span className={cn(
                                  "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                  log.status === "success" ? "bg-emerald-400" :
                                  log.status === "failed" ? "bg-red-400" :
                                  log.status === "blocked" ? "bg-orange-400" :
                                  "bg-cyan-400 animate-pulse"
                                )} />
                                <span className="text-[#d4dae3] font-mono">{log.tool}</span>
                                {log.file && (
                                  <span className="flex items-center gap-1 text-cyan-400/70 truncate max-w-[180px]">
                                    <span>{getFileIcon(log.file.split("/").pop() || "")}</span>
                                    <span className="underline decoration-dotted">{log.file.split("/").pop()}</span>
                                  </span>
                                )}
                              </div>
                              {log.file && expandedFile === `${msg.id}-${i}` && (
                                <div className="mt-1 mb-1 mx-1 p-2 rounded bg-[#0d1117] border border-[#21262d] text-[10px]">
                                  <div className="text-[#484f58] mb-1">{lang === "ar" ? "المسار:" : "Path:"}</div>
                                  <div className="text-cyan-400 font-mono break-all">{log.file}</div>
                                  <div className="text-[#484f58] mt-1">{lang === "ar" ? "النوع:" : "Type:"} <span className="text-[#d4dae3]">{log.file.split(".").pop()?.toUpperCase()}</span></div>
                                  <div className="text-[#484f58] mt-1">{lang === "ar" ? "الحالة:" : "Status:"} <span className={log.status === "success" ? "text-emerald-400" : log.status === "failed" ? "text-red-400" : "text-cyan-400"}>{log.status}</span></div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
                if (msg.role === "summary" && msg.summaryData) {
                  const sd = msg.summaryData;
                  return (
                    <div key={msg.id} className="py-1">
                      <div className={cn(
                        "rounded-lg border p-3 max-w-md",
                        sd.status === "success" ? "bg-emerald-500/5 border-emerald-500/20" :
                        sd.status === "failed" ? "bg-red-500/5 border-red-500/20" :
                        "bg-yellow-500/5 border-yellow-500/20"
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[12px] font-bold text-[#e1e4e8]">
                            {sd.status === "success" ? "✅" : sd.status === "failed" ? "❌" : "⚠️"}
                            {" "}
                            {lang === "ar" ? "ملخص التنفيذ" : "Execution Summary"}
                          </span>
                        </div>
                        {sd.filesChanged.length > 0 && (
                          <div className="text-[11px] text-[#d4dae3] mb-1">
                            <span className="text-[#484f58]">{lang === "ar" ? "الملفات:" : "Files:"}</span>{" "}
                            {sd.filesChanged.map(f => f.split("/").pop()).join(", ")}
                          </div>
                        )}
                        {sd.actionsDone.length > 0 && (
                          <div className="text-[11px] text-[#d4dae3]">
                            {sd.actionsDone.map((a, i) => <div key={i}>{a}</div>)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
                if (msg.role === "tool_log" || msg.role === "file_ref" || msg.role === "summary") {
                  return null;
                }
                const isActiveStream = loading && msg.id === activeStreamMsgIdRef.current;
                return (
                <div key={msg.id} className={cn("py-1", msg.role === "user" ? "text-end" : "")}>
                  <div className={cn(
                    "inline-block text-start text-sm leading-relaxed max-w-full",
                    msg.role === "user" ? "text-cyan-400" : "text-[#c9d1d9]"
                  )}>
                    {msg.role === "assistant" && !msg.content && isActiveStream ? (
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-[12px] text-[#d4dae3]">
                          {lang === "ar" ? "يحلل النظام..." : "Analyzing system..."}
                        </span>
                      </div>
                    ) : msg.role === "assistant" && !msg.content ? null : (
                      <MessageContent content={msg.content} />
                    )}
                    {msg.tokensUsed && (
                      <div className="text-[10px] text-[#484f58] mt-1">
                        {msg.models ? msg.models.join(" + ") : msg.model} · {msg.tokensUsed.toLocaleString()} tokens{msg.cost ? ` · $${msg.cost.toFixed(4)}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              );
              })}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-[#1c2333] bg-[#0d1117] p-4">
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={lang === "ar" ? "اكتب أمرك للوكيل..." : "Type your command..."}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-3 pe-12 text-sm text-[#e1e4e8] placeholder-[#484f58] resize-none focus:outline-none focus:border-cyan-500/50 transition-colors"
                  rows={2}
                  onKeyDown={e => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                />
                {loading ? (
                  <button onClick={handleStop} className="absolute end-2 bottom-2 p-2 bg-red-500 hover:bg-red-400 text-white rounded-lg transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!prompt.trim()}
                    className="absolute end-2 bottom-2 p-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg disabled:opacity-40 transition-colors"
                  >
                    <Send className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Shield className="w-16 h-16 text-cyan-400/30 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-[#e1e4e8] mb-2">
                {lang === "ar" ? "لوحة البنية التحتية" : "Infrastructure Panel"}
              </h2>
              <p className="text-sm text-[#484f58] max-w-md">
                {lang === "ar"
                  ? "اختر وكيلاً من القائمة لبدء إدارة وتطوير المنصة"
                  : "Select an agent from the list to start managing the platform"}
              </p>
            </div>
          </div>
        )}
      </div>
      {settingsAgent && fullConfig && (
        <AgentSettingsPanel
          config={fullConfig}
          lang={lang}
          onClose={() => { setSettingsAgent(null); setFullConfig(null); }}
          onSave={(updated) => {
            setSettingsAgent(null);
            setFullConfig(null);
            setAgents(prev => prev.map(a => a.agentKey === updated.agentKey ? { ...a, displayNameEn: updated.displayNameEn, displayNameAr: updated.displayNameAr, description: updated.description, enabled: updated.enabled } : a));
          }}
        />
      )}
    </div>
  );
}
