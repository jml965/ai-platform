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

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  cost?: number;
  model?: string;
  models?: string[];
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
                <span className="text-[10px] text-[#8b949e] uppercase tracking-wide">{langLabel}</span>
              </div>
              <pre className="p-3 bg-[#0d1117] text-[13px] leading-relaxed text-[#e1e4e8] overflow-x-auto" dir="ltr">
                <code>{code}</code>
              </pre>
              {code.length > 0 && (
                <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 px-2 py-1.5">
                  <button onClick={() => handleCopy(code, i)} className="flex items-center gap-1 px-2 py-1 rounded border border-[#30363d] bg-[#1c2333] text-[10px] text-[#8b949e] hover:text-[#e1e4e8] transition-colors">
                    {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedIdx === i ? "Copied" : "Copy"}</span>
                  </button>
                  <button onClick={handleDownload} className="flex items-center gap-1 px-2 py-1 rounded border border-[#30363d] bg-[#1c2333] text-[10px] text-[#8b949e] hover:text-[#e1e4e8] transition-colors">
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

const MODEL_OPTIONS = [
  { provider: "anthropic", models: ["claude-sonnet-4-6", "claude-opus-4", "claude-haiku-3-5"] },
  { provider: "google", models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"] },
  { provider: "openai", models: ["gpt-4o", "gpt-4o-mini", "o3-mini", "o1-mini"] },
];

function ModelSlotEditor({ slot, label, onChange, lang }: { slot: ModelSlot | null; label: string; onChange: (s: ModelSlot | null) => void; lang: string }) {
  if (!slot) return null;
  return (
    <div className="border border-[#1c2333] rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#e1e4e8]">{label}</span>
        <button onClick={() => onChange({ ...slot, enabled: !slot.enabled })} className="flex items-center gap-1">
          {slot.enabled ? <ToggleRight className="w-5 h-5 text-cyan-400" /> : <ToggleLeft className="w-5 h-5 text-[#484f58]" />}
        </button>
      </div>
      {slot.enabled && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "المزوّد" : "Provider"}</label>
            <select value={slot.provider} onChange={e => {
              const p = e.target.value;
              const models = MODEL_OPTIONS.find(m => m.provider === p)?.models || [];
              onChange({ ...slot, provider: p, model: models[0] || slot.model });
            }} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8]">
              {MODEL_OPTIONS.map(o => <option key={o.provider} value={o.provider}>{o.provider}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "النموذج" : "Model"}</label>
            <select value={slot.model} onChange={e => onChange({ ...slot, model: e.target.value })} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8]">
              {(MODEL_OPTIONS.find(m => m.provider === slot.provider)?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "الإبداعية" : "Creativity"}</label>
            <input type="number" step="0.1" min="0" max="2" value={slot.creativity} onChange={e => onChange({ ...slot, creativity: parseFloat(e.target.value) || 0 })} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8]" />
          </div>
          <div>
            <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "أقصى توكن" : "Max Tokens"}</label>
            <input type="number" min="1000" max="200000" value={slot.maxTokens} onChange={e => onChange({ ...slot, maxTokens: parseInt(e.target.value) || 8000 })} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8]" />
          </div>
          <div className="col-span-2">
            <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "المهلة (ثانية)" : "Timeout (sec)"}</label>
            <input type="number" min="10" max="600" value={slot.timeoutSeconds} onChange={e => onChange({ ...slot, timeoutSeconds: parseInt(e.target.value) || 120 })} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8]" />
          </div>
        </div>
      )}
    </div>
  );
}

function AgentSettingsPanel({ config, onClose, onSave, lang }: { config: FullAgentConfig; onClose: () => void; onSave: (updated: FullAgentConfig) => void; lang: string }) {
  const [data, setData] = useState<FullAgentConfig>(config);
  const [activeTab, setActiveTab] = useState("models");
  const [saving, setSaving] = useState(false);
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

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative ms-auto w-full max-w-2xl h-full bg-[#0d1117] border-s border-[#1c2333] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#1c2333] bg-[#161b22]">
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg bg-[#0d1117]", AGENT_COLORS[data.agentKey] || "text-[#8b949e]")}>
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
            <button onClick={onClose} className="p-1.5 hover:bg-[#1c2333] rounded text-[#8b949e] hover:text-[#e1e4e8]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex border-b border-[#1c2333] bg-[#161b22] overflow-x-auto">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={cn("px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2", activeTab === tab.key ? "text-cyan-400 border-cyan-400" : "text-[#8b949e] border-transparent hover:text-[#e1e4e8]")}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {activeTab === "models" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "الاسم (EN)" : "Name (EN)"}</label>
                  <input value={data.displayNameEn} onChange={e => setData({ ...data, displayNameEn: e.target.value })} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" />
                </div>
                <div>
                  <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "الاسم (AR)" : "Name (AR)"}</label>
                  <input value={data.displayNameAr} onChange={e => setData({ ...data, displayNameAr: e.target.value })} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" dir="rtl" />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "الوصف" : "Description"}</label>
                <textarea value={data.description || ""} onChange={e => setData({ ...data, description: e.target.value })} rows={2} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-sm text-[#e1e4e8]" />
              </div>
              <div className="flex items-center gap-3 p-3 border border-[#1c2333] rounded-lg">
                <button onClick={() => setData({ ...data, governorEnabled: !data.governorEnabled })} className="flex items-center gap-2">
                  {data.governorEnabled ? <ToggleRight className="w-5 h-5 text-cyan-400" /> : <ToggleLeft className="w-5 h-5 text-[#484f58]" />}
                  <span className="text-xs text-[#e1e4e8]">{lang === "ar" ? "نظام الحاكم" : "Governor System"}</span>
                </button>
                {data.governorEnabled && (
                  <button onClick={() => setData({ ...data, autoGovernor: !data.autoGovernor })} className="flex items-center gap-2 ms-auto">
                    {data.autoGovernor ? <ToggleRight className="w-4 h-4 text-amber-400" /> : <ToggleLeft className="w-4 h-4 text-[#484f58]" />}
                    <span className="text-[10px] text-[#8b949e]">{lang === "ar" ? "تلقائي" : "Auto"}</span>
                  </button>
                )}
              </div>
              <ModelSlotEditor slot={data.primaryModel} label={lang === "ar" ? "النموذج الأساسي" : "Primary Model"} onChange={s => s && setData({ ...data, primaryModel: s })} lang={lang} />
              <ModelSlotEditor slot={data.secondaryModel || { provider: "google", model: "gemini-2.5-flash", enabled: false, creativity: 0.5, maxTokens: 32000, timeoutSeconds: 120 }} label={lang === "ar" ? "النموذج الثانوي" : "Secondary Model"} onChange={s => setData({ ...data, secondaryModel: s })} lang={lang} />
              <ModelSlotEditor slot={data.tertiaryModel || { provider: "openai", model: "o3-mini", enabled: false, creativity: 0.5, maxTokens: 32000, timeoutSeconds: 180 }} label={lang === "ar" ? "النموذج الثالث" : "Tertiary Model"} onChange={s => setData({ ...data, tertiaryModel: s })} lang={lang} />
              {data.governorEnabled && (
                <div className="border border-yellow-500/20 rounded-lg p-3 space-y-3">
                  <span className="text-xs font-medium text-yellow-400">{lang === "ar" ? "نموذج الحاكم" : "Governor Model"}</span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "المزوّد" : "Provider"}</label>
                      <select value={data.governorModel?.provider || "anthropic"} onChange={e => setData({ ...data, governorModel: { ...(data.governorModel || { model: "claude-sonnet-4-6", creativity: 0.3, timeoutSeconds: 300, maxTokens: 64000 }), provider: e.target.value } })} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8]">
                        {MODEL_OPTIONS.map(o => <option key={o.provider} value={o.provider}>{o.provider}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-[#484f58]">{lang === "ar" ? "النموذج" : "Model"}</label>
                      <select value={data.governorModel?.model || "claude-sonnet-4-6"} onChange={e => setData({ ...data, governorModel: { ...(data.governorModel || { provider: "anthropic", creativity: 0.3, timeoutSeconds: 300, maxTokens: 64000 }), model: e.target.value } })} className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8]">
                        {(MODEL_OPTIONS.find(m => m.provider === (data.governorModel?.provider || "anthropic"))?.models || []).map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "prompt" && (
            <div>
              <label className="text-xs text-[#8b949e] mb-2 block">{lang === "ar" ? "البرومبت الأساسي" : "System Prompt"}</label>
              <textarea value={data.systemPrompt} onChange={e => setData({ ...data, systemPrompt: e.target.value })} rows={20} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8] font-mono leading-relaxed" dir="ltr" />
            </div>
          )}

          {activeTab === "instructions" && (
            <div>
              <label className="text-xs text-[#8b949e] mb-2 block">{lang === "ar" ? "تعليمات إضافية" : "Additional Instructions"}</label>
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
                <label className="text-xs text-[#8b949e] mb-2 block">{lang === "ar" ? "ملفات المصدر" : "Source Files"}</label>
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
              <label className="text-xs text-[#8b949e] mb-2 block">{lang === "ar" ? "الصلاحيات" : "Permissions"}</label>
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
                <label className="text-xs text-[#8b949e] mb-2 block">{lang === "ar" ? "ذاكرة قصيرة المدى" : "Short-Term Memory"} ({(data.shortTermMemory || []).length})</label>
                <textarea value={JSON.stringify(data.shortTermMemory || [], null, 2)} onChange={e => { try { setData({ ...data, shortTermMemory: JSON.parse(e.target.value) }); } catch {} }} rows={6} className="w-full bg-[#161b22] border border-[#30363d] rounded px-3 py-2 text-xs text-[#e1e4e8] font-mono" dir="ltr" />
              </div>
              <div>
                <label className="text-xs text-[#8b949e] mb-2 block">{lang === "ar" ? "ذاكرة طويلة المدى" : "Long-Term Memory"} ({(data.longTermMemory || []).length})</label>
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
          <button onClick={onClose} className="px-4 py-2 text-xs text-[#8b949e] hover:text-[#e1e4e8] border border-[#30363d] rounded-lg hover:bg-[#1c2333] transition-colors">
            {lang === "ar" ? "إلغاء" : "Cancel"}
          </button>
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

  const openSettings = async (agentKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/agents/configs", { credentials: "include" });
      if (!res.ok) return;
      const configs: FullAgentConfig[] = await res.json();
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
        if (Array.isArray(data)) setAgents(data);
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

  const selectAgent = (agent: InfraAgent) => {
    setSelectedAgent(agent);
    setMessages([]);
    setPrompt("");
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

      setMessages(prev => [...prev, { id: streamMsgId, role: "assistant", content: "", timestamp: new Date() }]);

      const isDirector = selectedAgent.agentKey === "infra_sysadmin";
      const endpoint = isDirector ? "/api/infra/director-stream" : "/api/infra/chat-stream";
      const body = isDirector
        ? { message: currentPrompt }
        : { agentKey: selectedAgent.agentKey, message: currentPrompt };

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
            <button className="flex items-center gap-2 text-[#8b949e] hover:text-[#e1e4e8] transition-colors mb-3">
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
            <button
              key={agent.agentKey}
              onClick={() => selectAgent(agent)}
              className={cn(
                "group w-full flex items-center gap-3 px-3 py-3 rounded-lg text-start transition-all mb-2",
                selectedAgent?.agentKey === agent.agentKey
                  ? "bg-gradient-to-r from-yellow-500/20 to-amber-500/10 border border-yellow-500/40"
                  : "bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 hover:border-yellow-500/40"
              )}
            >
              <div className="flex-shrink-0 text-yellow-400">
                <Crown className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-yellow-300 truncate">
                  {lang === "ar" ? agent.displayNameAr : agent.displayNameEn}
                </div>
                <div className="text-[10px] text-yellow-500/70 truncate">
                  3 models + governor
                </div>
              </div>
              <span onClick={(e) => openSettings(agent.agentKey, e)} className="flex-shrink-0 p-1 rounded hover:bg-yellow-500/20 text-yellow-500/50 hover:text-yellow-400 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer" title={lang === "ar" ? "إعدادات الوكيل" : "Agent Settings"}>
                <Settings className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
          <div className="border-t border-[#1c2333] my-2" />
          {agents.filter(a => a.agentKey !== "infra_sysadmin").map(agent => (
            <button
              key={agent.agentKey}
              onClick={() => selectAgent(agent)}
              className={cn(
                "group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-start transition-all",
                selectedAgent?.agentKey === agent.agentKey
                  ? "bg-[#1c2333] border border-cyan-500/30"
                  : "hover:bg-[#161b22] border border-transparent"
              )}
            >
              <div className={cn("flex-shrink-0", AGENT_COLORS[agent.agentKey] || "text-[#8b949e]")}>
                {AGENT_ICONS[agent.agentKey] || <Bot className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-[#e1e4e8] truncate">
                  {lang === "ar" ? agent.displayNameAr : agent.displayNameEn}
                </div>
                <div className="text-[10px] text-[#484f58] truncate">
                  {agent.primaryModel?.model?.split("-").slice(0, 2).join("-") || ""}
                </div>
              </div>
              <span onClick={(e) => openSettings(agent.agentKey, e)} className="flex-shrink-0 p-1 rounded hover:bg-[#1c2333] text-[#484f58] hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100" title={lang === "ar" ? "إعدادات الوكيل" : "Agent Settings"}>
                <Settings className="w-3.5 h-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {selectedAgent ? (
          <>
            <header className="bg-[#0d1117] border-b border-[#1c2333] px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg bg-[#161b22]", AGENT_COLORS[selectedAgent.agentKey] || "text-[#8b949e]")}>
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
                className="p-2 text-[#8b949e] hover:text-red-400 hover:bg-[#161b22] rounded-lg transition-colors"
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
                        <span className="text-[11px] text-[#8b949e]">{msg.content}</span>
                      </div>
                    </div>
                  );
                }
                return (
                <div key={msg.id} className={cn("py-1", msg.role === "user" ? "text-end" : "")}>
                  <div className={cn(
                    "inline-block text-start text-sm leading-relaxed max-w-full",
                    msg.role === "user" ? "text-cyan-400" : "text-[#c9d1d9]"
                  )}>
                    {msg.role === "assistant" && !msg.content && loading && msg.id === messages[messages.length - 1]?.id ? (
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-[12px] text-[#8b949e]">
                          {lang === "ar" ? "يحلل النظام..." : "Analyzing system..."}
                        </span>
                      </div>
                    ) : (
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
