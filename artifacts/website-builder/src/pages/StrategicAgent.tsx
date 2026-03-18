import React, { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import {
  ArrowLeft,
  Send,
  Loader2,
  Paperclip,
  Image as ImageIcon,
  X,
  Download,
  Maximize2,
  Trash2,
  RefreshCw,
  ChevronDown,
  FileCode,
  File,
  Check,
  User,
  Eye,
  Settings,
  RotateCcw,
  Bot,
  Shield,
  Zap,
  ToggleLeft,
  ToggleRight,
  Minus,
  Plus,
} from "lucide-react";
import { useListProjects } from "@workspace/api-client-react";

interface Attachment {
  id: string;
  name: string;
  type: string;
  content: string;
  preview?: string;
}

interface ThinkingInfo {
  model: string;
  summary: string;
  durationMs: number;
}

interface AgentInfo {
  agentKey: string;
  displayNameEn: string;
  displayNameAr: string;
  description: string;
  enabled: boolean;
  governorEnabled: boolean;
  tokenLimit: number;
  permissions: string[];
  creativity: string;
  systemPrompt: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  attachments?: Attachment[];
  thinking?: ThinkingInfo[];
  tokensUsed?: number;
  cost?: number;
  fixApplied?: boolean;
  fixedFiles?: string[];
  images?: string[];
  changesApplied?: boolean;
  appliedChanges?: string[];
}

function cn(...classes: (string | false | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

function LightbulbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z"/>
      <line x1="9" y1="22" x2="15" y2="22"/>
    </svg>
  );
}

function ImagePreviewModal({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-10 end-0 text-white hover:text-gray-300 p-1">
          <X className="w-6 h-6" />
        </button>
        <img src={src} alt="" className="max-w-full max-h-[85vh] rounded-lg" />
        <a href={src} download className="absolute bottom-3 end-3 bg-white/20 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 hover:bg-white/30 transition-colors">
          <Download className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

export default function StrategicAgent() {
  const { t, lang } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedMsgIds, setExpandedMsgIds] = useState<Set<string>>(new Set());
  const [fontSize, setFontSize] = useState(16);
  const [lineSpacing, setLineSpacing] = useState(1.75);
  const [fontWeight, setFontWeight] = useState(400);
  const [showTextSettings, setShowTextSettings] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgentKey, setSelectedAgentKey] = useState<string>("");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [resettingAgent, setResettingAgent] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const agentDropdownRef = useRef<HTMLDivElement>(null);

  const { data: projectsData } = useListProjects();
  const projects: any[] = Array.isArray(projectsData) ? projectsData : (projectsData as any)?.projects ? (projectsData as any).projects : [];

  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(e.target as Node)) {
        setShowAgentDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/strategic/agents", { credentials: "include" });
      const data = await res.json();
      if (data.agents) setAgents(data.agents);
    } catch {}
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const selectedAgent = agents.find(a => a.agentKey === selectedAgentKey);

  const handleResetAgent = async () => {
    if (!selectedAgentKey || resettingAgent) return;
    if (!confirm(t.strategic_reset_confirm)) return;
    setResettingAgent(true);
    try {
      const res = await fetch("/api/strategic/reset-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ agentKey: selectedAgentKey }),
      });
      const data = await res.json();
      if (data.success) {
        await fetchAgents();
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `✓ ${t.strategic_reset_success}: ${selectedAgent?.displayNameEn || selectedAgentKey}`,
          timestamp: new Date(),
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: err.message || "Reset failed",
        timestamp: new Date(),
      }]);
    } finally {
      setResettingAgent(false);
    }
  };

  const readFileAsDataUrl = (file: globalThis.File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = useCallback(async (files: FileList | globalThis.File[]) => {
    const fileArray = Array.from(files);
    const maxSize = 10 * 1024 * 1024;

    for (const file of fileArray) {
      if (file.size > maxSize) continue;

      const dataUrl = await readFileAsDataUrl(file);
      const isImage = file.type.startsWith("image/");

      const attachment: Attachment = {
        id: crypto.randomUUID(),
        name: file.name,
        type: file.type || "application/octet-stream",
        content: dataUrl,
        preview: isImage ? dataUrl : undefined,
      };

      setAttachments(prev => [...prev, attachment]);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSend = async () => {
    if (!prompt.trim() && attachments.length === 0) return;
    if (loading) return;
    if (agentMode && !selectedAgentKey) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt.trim(),
      timestamp: new Date(),
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    };

    setMessages(prev => [...prev, userMsg]);
    const currentPrompt = prompt;
    const currentAttachments = [...attachments];
    setPrompt("");
    setAttachments([]);
    setLoading(true);

    try {
      if (agentMode && selectedAgentKey) {
        const res = await fetch("/api/strategic/agent-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            targetAgentKey: selectedAgentKey,
            message: currentPrompt,
            projectId: selectedProjectId || undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Request failed");

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply || "",
          timestamp: new Date(),
          thinking: data.thinking,
          tokensUsed: data.tokensUsed,
          cost: data.cost,
          changesApplied: data.changesApplied,
          appliedChanges: data.appliedChanges,
        };

        setMessages(prev => [...prev, assistantMsg]);
        if (data.changesApplied) {
          await fetchAgents();
        }
      } else {
        const apiAttachments = currentAttachments.map(a => ({
          name: a.name,
          type: a.type,
          content: a.content,
        }));

        const res = await fetch("/api/strategic/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            projectId: selectedProjectId,
            message: currentPrompt || `Analyze the attached ${currentAttachments.length > 1 ? "files" : "file"}: ${currentAttachments.map(a => a.name).join(", ")}`,
            attachments: apiAttachments.length > 0 ? apiAttachments : undefined,
          }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data?.error?.message || "Request failed");

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply || "",
          timestamp: new Date(),
          thinking: data.thinking,
          tokensUsed: data.tokensUsed,
          cost: data.cost,
          fixApplied: data.fixApplied,
          fixedFiles: data.fixedFiles,
        };

        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: err.message || "Error",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setAttachments([]);
  };

  const selectedProject = projects.find((p: any) => p.id === selectedProjectId);

  const imageAttachmentCount = attachments.filter(a => a.type.startsWith("image/")).length;
  const fileAttachmentCount = attachments.filter(a => !a.type.startsWith("image/")).length;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e1e4e8] flex flex-col" dir={lang === "ar" ? "rtl" : "ltr"}>
      {previewImage && <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".js,.jsx,.ts,.tsx,.py,.html,.css,.scss,.json,.xml,.yaml,.yml,.md,.txt,.sql,.sh,.bash,.go,.rs,.java,.c,.cpp,.h,.hpp,.swift,.kt,.rb,.php,.vue,.svelte,.astro,.toml,.env,.csv,.log,.gitignore,.dockerfile,.prisma,.graphql"
        onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={imageInputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/*"
        onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = ""; }}
      />

      <header className="h-14 border-b border-[#1c2333] bg-[#161b22] flex items-center px-4 gap-3 flex-shrink-0">
        <Link href="/dashboard" className="p-1.5 text-[#8b949e] hover:text-[#e1e4e8] transition-colors rounded hover:bg-[#1c2333]">
          <ArrowLeft className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />
        </Link>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", agentMode ? "bg-purple-500/20" : "bg-amber-500/20")}>
          {agentMode ? <Settings className="w-4 h-4 text-purple-400" /> : <LightbulbIcon className="w-4 h-4 text-amber-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-[#e1e4e8] truncate">
            {agentMode ? t.strategic_agent_mode : t.strategic_page_title}
          </h1>
          <p className="text-[10px] text-[#8b949e] truncate">
            {agentMode ? t.strategic_agent_config_subtitle : t.strategic_page_subtitle}
          </p>
        </div>

        <button
          onClick={() => { setAgentMode(!agentMode); setMessages([]); }}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border",
            agentMode
              ? "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20"
              : "bg-[#1c2333] border-[#30363d] text-[#8b949e] hover:text-purple-400 hover:border-purple-500/30"
          )}
        >
          <Bot className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{t.strategic_agent_mode}</span>
        </button>

        {agentMode ? (
          <div className="relative" ref={agentDropdownRef}>
            <button
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1c2333] border border-purple-500/30 rounded-lg text-xs text-purple-300 hover:border-purple-400 transition-colors max-w-[200px]"
            >
              <span className="truncate">
                {selectedAgent ? (lang === "ar" ? selectedAgent.displayNameAr : selectedAgent.displayNameEn) : t.strategic_select_agent}
              </span>
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            </button>
            {showAgentDropdown && (
              <div className="absolute top-full mt-1 end-0 w-72 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
                <div className="p-2 border-b border-[#1c2333] text-[10px] text-[#8b949e] font-medium uppercase tracking-wider px-3">
                  {t.strategic_all_agents}
                </div>
                {agents.filter(a => a.agentKey !== "strategic").map(agent => (
                  <button
                    key={agent.agentKey}
                    onClick={() => { setSelectedAgentKey(agent.agentKey); setShowAgentDropdown(false); setMessages([]); }}
                    className={cn(
                      "w-full text-start px-3 py-2.5 text-xs hover:bg-[#1c2333] transition-colors flex items-center gap-2 border-b border-[#1c2333]/50 last:border-0",
                      agent.agentKey === selectedAgentKey ? "text-purple-400 bg-purple-500/5" : "text-[#c9d1d9]"
                    )}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full flex-shrink-0",
                      agent.enabled ? "bg-emerald-400" : "bg-red-400"
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="truncate font-medium">{lang === "ar" ? agent.displayNameAr : agent.displayNameEn}</div>
                      <div className="text-[10px] text-[#484f58] truncate">{agent.description}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#1c2333] border border-[#30363d] rounded-lg text-xs text-[#c9d1d9] hover:border-[#58a6ff] transition-colors max-w-[200px]"
            >
              <span className="truncate">{selectedProject?.name || t.strategic_select_project}</span>
              <ChevronDown className="w-3 h-3 flex-shrink-0" />
            </button>
            {showProjectDropdown && (
              <div className="absolute top-full mt-1 end-0 w-64 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 max-h-64 overflow-y-auto">
                <div className="p-2 border-b border-[#1c2333] text-[10px] text-[#8b949e] font-medium uppercase tracking-wider px-3">
                  {t.strategic_all_projects}
                </div>
                {projects.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProjectId(p.id); setShowProjectDropdown(false); }}
                    className={cn(
                      "w-full text-start px-3 py-2 text-xs hover:bg-[#1c2333] transition-colors flex items-center gap-2",
                      p.id === selectedProjectId ? "text-amber-400 bg-amber-500/5" : "text-[#c9d1d9]"
                    )}
                  >
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" style={{ opacity: p.id === selectedProjectId ? 1 : 0 }} />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {agentMode && selectedAgentKey && (
            <button
              onClick={handleResetAgent}
              disabled={resettingAgent}
              className="p-1.5 text-[#8b949e] hover:text-orange-400 transition-colors rounded hover:bg-[#1c2333] disabled:opacity-40"
              title={t.strategic_reset_agent}
            >
              {resettingAgent ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowTextSettings(p => !p)}
              className={cn("p-1.5 rounded transition-colors", showTextSettings ? "bg-amber-500/20 text-amber-400" : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]")}
              title={lang === "ar" ? "إعدادات النص" : "Text settings"}
            >
              <Settings className="w-4 h-4" />
            </button>
            {showTextSettings && (
              <div className="absolute top-full mt-1 end-0 w-52 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 p-3 space-y-3">
                <div>
                  <div className="text-[10px] text-[#8b949e] mb-1.5">{lang === "ar" ? "حجم الخط" : "Font Size"}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setFontSize(s => Math.max(12, s - 1))} className="p-1 text-[#8b949e] hover:text-[#e1e4e8] bg-[#1c2333] rounded transition-colors"><Minus className="w-3 h-3" /></button>
                    <span className="text-xs text-[#c9d1d9] min-w-[28px] text-center">{fontSize}px</span>
                    <button onClick={() => setFontSize(s => Math.min(24, s + 1))} className="p-1 text-[#8b949e] hover:text-[#e1e4e8] bg-[#1c2333] rounded transition-colors"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8b949e] mb-1.5">{lang === "ar" ? "تباعد الأسطر" : "Line Spacing"}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLineSpacing(s => Math.max(1, +(s - 0.25).toFixed(2)))} className="p-1 text-[#8b949e] hover:text-[#e1e4e8] bg-[#1c2333] rounded transition-colors"><Minus className="w-3 h-3" /></button>
                    <span className="text-xs text-[#c9d1d9] min-w-[28px] text-center">{lineSpacing}</span>
                    <button onClick={() => setLineSpacing(s => Math.min(3, +(s + 0.25).toFixed(2)))} className="p-1 text-[#8b949e] hover:text-[#e1e4e8] bg-[#1c2333] rounded transition-colors"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#8b949e] mb-1.5">{lang === "ar" ? "تعريض الخط" : "Font Weight"}</div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setFontWeight(w => Math.max(100, w - 100))} className="p-1 text-[#8b949e] hover:text-[#e1e4e8] bg-[#1c2333] rounded transition-colors"><Minus className="w-3 h-3" /></button>
                    <span className="text-xs text-[#c9d1d9] min-w-[28px] text-center">{fontWeight}</span>
                    <button onClick={() => setFontWeight(w => Math.min(900, w + 100))} className="p-1 text-[#8b949e] hover:text-[#e1e4e8] bg-[#1c2333] rounded transition-colors"><Plus className="w-3 h-3" /></button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={clearChat}
            className="p-1.5 text-[#8b949e] hover:text-red-400 transition-colors rounded hover:bg-[#1c2333]"
            title={t.strategic_clear_chat}
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <LanguageToggle className="!bg-[#1c2333] !text-[#8b949e] hover:!bg-[#30363d] !px-2 !py-1.5 !text-xs !rounded-lg" />
        </div>
      </header>

      <div
        className={cn(
          "flex-1 overflow-y-auto p-4 space-y-4",
          dragOver && "ring-2 ring-amber-500/50 ring-inset bg-amber-500/5"
        )}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="flex items-center justify-center py-12 pointer-events-none">
            <div className="text-center">
              <Paperclip className="w-10 h-10 text-amber-400 mx-auto mb-2 animate-bounce" />
              <p className="text-amber-400 text-sm font-medium">{t.strategic_drop_files}</p>
              <p className="text-[#8b949e] text-xs mt-1">{t.strategic_supported_files}</p>
            </div>
          </div>
        )}

        {messages.length === 0 && !dragOver && !agentMode && (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 mx-auto bg-amber-500/10 rounded-2xl flex items-center justify-center mb-4">
                <LightbulbIcon className="w-8 h-8 text-amber-400" />
              </div>
              <h2 className="text-lg font-semibold text-[#e1e4e8] mb-2">{t.strategic_page_title}</h2>
              <p className="text-sm text-[#8b949e] mb-6">{t.strategic_page_subtitle}</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-amber-500/30 hover:bg-amber-500/5 transition-all"
                >
                  <FileCode className="w-6 h-6 text-[#58a6ff]" />
                  <span className="text-xs text-[#c9d1d9]">{t.strategic_upload_files}</span>
                </button>
                <button
                  onClick={() => imageInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border border-[#30363d] bg-[#161b22] hover:border-amber-500/30 hover:bg-amber-500/5 transition-all"
                >
                  <ImageIcon className="w-6 h-6 text-purple-400" />
                  <span className="text-xs text-[#c9d1d9]">{t.strategic_upload_images}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {agentMode && messages.length === 0 && !dragOver && (
          <div className="flex items-center justify-center min-h-[60vh]">
            {selectedAgent ? (
              <div className="max-w-lg w-full">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 mx-auto bg-purple-500/10 rounded-2xl flex items-center justify-center mb-4">
                    <Bot className="w-8 h-8 text-purple-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-[#e1e4e8] mb-1">
                    {lang === "ar" ? selectedAgent.displayNameAr : selectedAgent.displayNameEn}
                  </h2>
                  <p className="text-xs text-[#8b949e]">{selectedAgent.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d]">
                    <div className="flex items-center gap-2 mb-1.5">
                      {selectedAgent.enabled ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4 text-red-400" />}
                      <span className="text-[11px] text-[#8b949e]">{t.strategic_agent_enabled}</span>
                    </div>
                    <span className={cn("text-sm font-semibold", selectedAgent.enabled ? "text-emerald-400" : "text-red-400")}>
                      {selectedAgent.enabled ? t.strategic_agent_enabled : t.strategic_agent_disabled}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span className="text-[11px] text-[#8b949e]">{t.strategic_agent_tokens}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#e1e4e8]">{selectedAgent.tokenLimit.toLocaleString()}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Shield className="w-4 h-4 text-[#58a6ff]" />
                      <span className="text-[11px] text-[#8b949e]">{t.strategic_agent_permissions}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#e1e4e8]">{selectedAgent.permissions?.length || 0}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Settings className="w-4 h-4 text-purple-400" />
                      <span className="text-[11px] text-[#8b949e]">{t.strategic_agent_creativity}</span>
                    </div>
                    <span className="text-sm font-semibold text-[#e1e4e8]">{selectedAgent.creativity}</span>
                  </div>
                </div>

                {selectedAgent.permissions && selectedAgent.permissions.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#161b22] border border-[#30363d] mb-4">
                    <div className="text-[11px] text-[#8b949e] mb-2 font-medium">{t.strategic_agent_permissions}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedAgent.permissions.map((p: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-[#1c2333] rounded-md text-[10px] text-[#c9d1d9] border border-[#30363d]">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-center text-xs text-[#484f58]">{t.strategic_agent_config_subtitle}</p>
              </div>
            ) : (
              <div className="text-center">
                <div className="w-16 h-16 mx-auto bg-purple-500/10 rounded-2xl flex items-center justify-center mb-4">
                  <Bot className="w-8 h-8 text-purple-400/50" />
                </div>
                <h2 className="text-lg font-semibold text-[#8b949e] mb-2">{t.strategic_select_agent}</h2>
                <p className="text-sm text-[#484f58]">{t.strategic_no_agent}</p>
              </div>
            )}
          </div>
        )}

        {messages.map(msg => {
          const isExpanded = expandedMsgIds.has(msg.id);
          const hasDetails = msg.role === "assistant" && (msg.thinking?.length || msg.tokensUsed || msg.cost || msg.fixApplied !== undefined || (msg.changesApplied && msg.appliedChanges?.length));
          const toggleExpand = () => {
            if (!hasDetails) return;
            setExpandedMsgIds(prev => {
              const next = new Set(prev);
              if (next.has(msg.id)) next.delete(msg.id); else next.add(msg.id);
              return next;
            });
          };
          return (
            <div key={msg.id} className={cn("py-1", msg.role === "user" ? "text-end" : "")}>
              <div
                className={cn(
                  "inline-block text-start text-sm leading-relaxed",
                  msg.role === "user" ? "text-amber-400" : "text-[#c9d1d9]",
                  hasDetails && "cursor-pointer"
                )}
                onClick={toggleExpand}
              >
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.attachments.map(att => (
                      <div key={att.id} className="flex-shrink-0">
                        {att.preview ? (
                          <button onClick={e => { e.stopPropagation(); setPreviewImage(att.preview!); }} className="relative group">
                            <img src={att.preview} alt={att.name} className="w-20 h-20 object-cover rounded-lg border border-[#30363d]" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#8b949e]">[{att.name}]</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p className="whitespace-pre-wrap" style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", fontSize: `${fontSize}px`, lineHeight: lineSpacing, fontWeight }}>{msg.content}</p>

                {msg.images && msg.images.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {msg.images.map((img, i) => (
                      <button key={i} onClick={e => { e.stopPropagation(); setPreviewImage(img); }} className="relative group">
                        <img src={img} alt="" className="w-full rounded-lg border border-[#30363d]" />
                      </button>
                    ))}
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-2 text-[10px] text-[#8b949e] space-y-1">
                    {msg.thinking && msg.thinking.map((th, i) => (
                      <div key={i}>{th.model} · {(th.durationMs / 1000).toFixed(1)}s</div>
                    ))}
                    {msg.tokensUsed && (
                      <div>{msg.tokensUsed.toLocaleString()} {t.strategic_tokens_used}{msg.cost ? ` · $${msg.cost.toFixed(4)}` : ""}</div>
                    )}
                    {msg.fixApplied && (
                      <div className="text-emerald-400">{t.strategic_fix_applied}{msg.fixedFiles?.length ? ` — ${msg.fixedFiles.join(", ")}` : ""}</div>
                    )}
                    {msg.changesApplied && msg.appliedChanges && msg.appliedChanges.length > 0 && (
                      <div className="text-emerald-400">{t.strategic_changes_applied}: {msg.appliedChanges.join(", ")}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {loading && (
          <div className="py-1">
            <div className="flex items-center gap-2">
              <Loader2 className={cn("w-4 h-4 animate-spin", agentMode ? "text-purple-400" : "text-amber-400")} />
              <span className="text-sm text-[#c9d1d9]">{agentMode ? t.strategic_configuring : t.strategic_thinking}</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {attachments.length > 0 && (
        <div className="border-t border-[#1c2333] bg-[#161b22] px-4 py-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Paperclip className="w-3 h-3 text-[#8b949e]" />
            <span className="text-[10px] text-[#8b949e] font-medium">
              {t.strategic_attachments} ({attachments.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {attachments.map(att => (
              <div key={att.id} className="relative group flex items-center gap-1.5 px-2 py-1 bg-[#1c2333] border border-[#30363d] rounded-lg">
                {att.preview ? (
                  <img src={att.preview} alt={att.name} className="w-8 h-8 object-cover rounded" />
                ) : (
                  <FileCode className="w-4 h-4 text-[#58a6ff]" />
                )}
                <span className="text-[11px] text-[#c9d1d9] truncate max-w-[100px]">{att.name}</span>
                <button
                  onClick={() => removeAttachment(att.id)}
                  className="p-0.5 text-[#8b949e] hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-[#1c2333] bg-[#0d1117] p-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end gap-2">
            <div className="flex gap-1">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#1c2333] rounded-lg transition-colors"
                title={t.strategic_upload_files}
              >
                <Paperclip className="w-5 h-5" />
              </button>
              <button
                onClick={() => imageInputRef.current?.click()}
                className="p-2 text-[#8b949e] hover:text-purple-400 hover:bg-[#1c2333] rounded-lg transition-colors"
                title={t.strategic_upload_images}
              >
                <ImageIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={agentMode ? (selectedAgent ? `${lang === "ar" ? "اكتب أوامر الإعداد لـ" : "Write config commands for"} ${lang === "ar" ? selectedAgent.displayNameAr : selectedAgent.displayNameEn}...` : t.strategic_select_agent) : t.strategic_placeholder}
                disabled={loading || (agentMode && !selectedAgentKey)}
                rows={2}
                className={cn(
                  "w-full bg-[#161b22] border border-[#30363d] rounded-xl p-3 pe-12 resize-none focus:outline-none transition-all text-sm text-[#e1e4e8] placeholder-[#484f58]",
                  agentMode ? "focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/30" : "focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30",
                  (loading || (agentMode && !selectedAgentKey)) && "opacity-50"
                )}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || (!prompt.trim() && attachments.length === 0) || (agentMode && !selectedAgentKey)}
                className={cn(
                  "absolute end-2 bottom-2 p-2 text-black rounded-lg disabled:opacity-40 transition-colors",
                  agentMode ? "bg-purple-500 hover:bg-purple-400 disabled:hover:bg-purple-500" : "bg-amber-500 hover:bg-amber-400 disabled:hover:bg-amber-500"
                )}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between mt-2">
            <p className="text-[10px] text-[#484f58]">{t.strategic_supported_files}</p>
            {(imageAttachmentCount > 0 || fileAttachmentCount > 0) && (
              <div className="flex items-center gap-2 text-[10px] text-[#8b949e]">
                {imageAttachmentCount > 0 && (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="w-3 h-3 text-purple-400" />
                    {imageAttachmentCount} {imageAttachmentCount === 1 ? t.strategic_image_attached : t.strategic_images_attached}
                  </span>
                )}
                {fileAttachmentCount > 0 && (
                  <span className="flex items-center gap-1">
                    <FileCode className="w-3 h-3 text-[#58a6ff]" />
                    {fileAttachmentCount} {fileAttachmentCount === 1 ? t.strategic_file_attached : t.strategic_files_attached}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
