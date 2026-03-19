import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Crown, Activity, Crosshair, Server, Palette, Database, Lock, Rocket,
  FlaskConical, Bot, Wand2, Trash2, X, Send, Minimize2, Maximize2,
  ChevronDown, GripHorizontal, MessageSquare, Terminal, FileText, HardDrive,
  Settings, FolderOpen, Shield,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { useGetMe } from "@workspace/api-client-react";

const AGENT_ICONS: Record<string, React.ReactNode> = {
  infra_sysadmin: <Crown className="w-4 h-4" />,
  infra_monitor: <Activity className="w-4 h-4" />,
  infra_bugfixer: <Crosshair className="w-4 h-4" />,
  infra_builder: <Server className="w-4 h-4" />,
  infra_ui: <Palette className="w-4 h-4" />,
  infra_db: <Database className="w-4 h-4" />,
  infra_security: <Lock className="w-4 h-4" />,
  infra_deploy: <Rocket className="w-4 h-4" />,
  infra_qa: <FlaskConical className="w-4 h-4" />,
  strategic: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z"/><line x1="9" y1="22" x2="15" y2="22"/></svg>,
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
  strategic: "text-amber-400",
};

interface AgentInfo {
  agentKey: string;
  displayNameEn: string;
  displayNameAr: string;
  description: string;
  enabled: boolean;
  primaryModel: { provider: string; model: string };
}

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  cost?: number;
  model?: string;
  models?: string[];
}

interface WandTarget {
  tag: string;
  id?: string;
  classes: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: { color: string; backgroundColor: string; fontSize: string; fontWeight: string };
  path: string;
}

export default function FloatingAdminChat() {
  const { data: me } = useGetMe({ query: { queryKey: ["getMe"], retry: false, refetchOnWindowFocus: false } });
  const isAdmin = (me as any)?.role === "admin";

  if (!isAdmin) return null;

  return <FloatingChatInner />;
}

function FloatingChatInner() {
  const { t, lang } = useI18n();
  const isRTL = lang === "ar";

  const STORAGE_KEY = "floating-admin-chat";

  const loadSaved = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  };

  const saved = loadSaved();

  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [wandMode, setWandMode] = useState(false);
  const [wandHighlight, setWandHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [pos, setPos] = useState(saved?.pos || { x: window.innerWidth - 420, y: window.innerHeight - 580 });
  const [size, setSize] = useState(saved?.size || { w: 380, h: 520 });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pos, size, agentKey: selectedAgent?.agentKey }));
    } catch {}
  }, [pos, size, selectedAgent]);

  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number; dir: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const BASE = import.meta.env.BASE_URL || "/";
    fetch(`${BASE}api/infra/agents`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          const strategicAgent: AgentInfo = {
            agentKey: "strategic",
            displayNameEn: "Strategic Agent",
            displayNameAr: "الوكيل الاستراتيجي",
            description: "Strategic execution agent",
            enabled: true,
            primaryModel: { provider: "anthropic", model: "claude-sonnet-4-6" },
          };
          const allAgents = [strategicAgent, ...data];
          setAgents(allAgents);
          if (!selectedAgent) {
            const savedKey = saved?.agentKey;
            const restored = savedKey ? allAgents.find(a => a.agentKey === savedKey) : null;
            const director = data.find((a: AgentInfo) => a.agentKey === "infra_sysadmin");
            setSelectedAgent(restored || director || strategicAgent);
          }
        }
      })
      .catch(() => {});
  }, [open]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, dragRef.current.startPosX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 60, dragRef.current.startPosY + dy)),
      });
    };
    const onUp = () => { dragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleResizeStart = (e: React.MouseEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h, dir };
    const onMove = (ev: MouseEvent) => {
      if (!resizeRef.current) return;
      const dx = ev.clientX - resizeRef.current.startX;
      const dy = ev.clientY - resizeRef.current.startY;
      const d = resizeRef.current.dir;
      let newW = resizeRef.current.startW;
      let newH = resizeRef.current.startH;
      let newX = pos.x;
      let newY = pos.y;

      if (d.includes("e")) newW = Math.max(320, resizeRef.current.startW + dx);
      if (d.includes("w")) { newW = Math.max(320, resizeRef.current.startW - dx); newX = pos.x + (resizeRef.current.startW - newW); }
      if (d.includes("s")) newH = Math.max(300, resizeRef.current.startH + dy);
      if (d.includes("n")) { newH = Math.max(300, resizeRef.current.startH - dy); newY = pos.y + (resizeRef.current.startH - newH); }

      setSize({ w: newW, h: newH });
      if (d.includes("w") || d.includes("n")) setPos({ x: newX, y: newY });
    };
    const onUp = () => { resizeRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const getElementPath = (el: HTMLElement): string => {
    const parts: string[] = [];
    let current: HTMLElement | null = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) selector += `#${current.id}`;
      else if (current.className && typeof current.className === "string") {
        const cls = current.className.split(/\s+/).filter(c => c && !c.startsWith("hover:") && !c.startsWith("transition")).slice(0, 2).join(".");
        if (cls) selector += `.${cls}`;
      }
      parts.unshift(selector);
      current = current.parentElement;
      if (parts.length >= 4) break;
    }
    return parts.join(" > ");
  };

  const handleWandClick = useCallback((e: MouseEvent) => {
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!target || target.closest("[data-floating-chat]") || target.closest("[data-wand-overlay]")) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = target.getBoundingClientRect();
    const computed = window.getComputedStyle(target);
    const textContent = target.innerText?.trim().slice(0, 100) || "";

    const info: WandTarget = {
      tag: target.tagName.toLowerCase(),
      id: target.id || undefined,
      classes: target.className && typeof target.className === "string" ? target.className.split(/\s+/).slice(0, 5).join(" ") : "",
      text: textContent,
      rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      styles: { color: computed.color, backgroundColor: computed.backgroundColor, fontSize: computed.fontSize, fontWeight: computed.fontWeight },
      path: getElementPath(target),
    };

    const desc = isRTL
      ? `[عصا سحرية] العنصر المحدد:\n• النوع: <${info.tag}>${info.id ? ` id="${info.id}"` : ""}\n• المسار: ${info.path}\n• النص: "${info.text}"\n• الحجم: ${info.rect.width}×${info.rect.height}px\n• الموقع: (${info.rect.x}, ${info.rect.y})\n• اللون: ${info.styles.color}\n• الخلفية: ${info.styles.backgroundColor}\n• الخط: ${info.styles.fontSize} ${info.styles.fontWeight}\n\nما التعديل المطلوب على هذا العنصر؟`
      : `[Magic Wand] Selected element:\n• Tag: <${info.tag}>${info.id ? ` id="${info.id}"` : ""}\n• Path: ${info.path}\n• Text: "${info.text}"\n• Size: ${info.rect.width}×${info.rect.height}px\n• Position: (${info.rect.x}, ${info.rect.y})\n• Color: ${info.styles.color}\n• Background: ${info.styles.backgroundColor}\n• Font: ${info.styles.fontSize} ${info.styles.fontWeight}\n\nWhat change do you want on this element?`;

    setPrompt(desc);
    setWandMode(false);
    setWandHighlight(null);
    textareaRef.current?.focus();
  }, [isRTL]);

  const wandRafRef = useRef(0);
  const handleWandMove = useCallback((e: MouseEvent) => {
    cancelAnimationFrame(wandRafRef.current);
    wandRafRef.current = requestAnimationFrame(() => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!target || target.closest("[data-floating-chat]") || target.closest("[data-wand-overlay]")) {
        setWandHighlight(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setWandHighlight({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
    });
  }, []);

  useEffect(() => {
    if (!wandMode) return;
    const onClick = (e: MouseEvent) => handleWandClick(e);
    const onMove = (e: MouseEvent) => handleWandMove(e);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setWandMode(false); setWandHighlight(null); } };
    document.addEventListener("click", onClick, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("keydown", onKey);
    const style = document.createElement("style");
    style.id = "wand-cursor-float";
    style.textContent = `* { cursor: crosshair !important; } [data-floating-chat] * { cursor: default !important; }`;
    document.head.appendChild(style);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(wandRafRef.current);
      style.remove();
    };
  }, [wandMode, handleWandClick, handleWandMove]);

  const scrollToBottom = () => {
    if (userScrolledUpRef.current) return;
    const el = chatContainerRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
  };

  const handleStop = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setLoading(false);
  };

  const doSend = async (directMsg?: string) => {
    const currentPrompt = directMsg || prompt;
    if (!currentPrompt.trim() || loading || !selectedAgent) return;
    setPrompt("");
    setLoading(true);
    userScrolledUpRef.current = false;

    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "user", content: currentPrompt, timestamp: new Date() }]);

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
            if (alreadyInCode) {
              const closeIdx = remaining.indexOf("```");
              displayedContent = closeIdx !== -1 ? streamedContent.slice(0, displayedContent.length + closeIdx + 3) : streamedContent;
            } else {
              const openTick = remaining.indexOf("```");
              if (openTick === 0) {
                const afterOpen = remaining.slice(3);
                const closeIdx = afterOpen.indexOf("```");
                displayedContent = closeIdx !== -1 ? streamedContent.slice(0, displayedContent.length + 3 + closeIdx + 3) : streamedContent;
              } else {
                displayedContent = streamedContent.slice(0, displayedContent.length + 1);
              }
            }
            setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, content: displayedContent } : m));
            scrollToBottom();
            setTimeout(tick, alreadyInCode ? 0 : 18);
          } else {
            typewriterRunning = false;
          }
        };
        tick();
      };

      controller.signal.addEventListener("abort", () => { typewriterStopped = true; });
      setMessages(prev => [...prev, { id: streamMsgId, role: "assistant", content: "", timestamp: new Date() }]);

      const BASE = import.meta.env.BASE_URL || "/";
      let endpoint: string;
      let body: Record<string, unknown>;

      if (selectedAgent.agentKey === "strategic") {
        endpoint = `${BASE}api/strategic/chat-stream`;
        let infraContext = "";
        try {
          const [statusRes, tablesRes, envRes] = await Promise.all([
            fetch(`${BASE}api/strategic/infra/status`, { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`${BASE}api/strategic/infra/db-tables`, { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
            fetch(`${BASE}api/strategic/infra/env`, { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
          ]);
          if (statusRes) infraContext += `\n[LIVE SYSTEM STATUS] DB: ${statusRes.database}, Users: ${statusRes.counts?.users}, Projects: ${statusRes.counts?.projects}, Agents: ${statusRes.counts?.agents}, Uptime: ${statusRes.server?.uptime}, Memory: ${statusRes.server?.memoryMB}MB, Node: ${statusRes.server?.nodeVersion}, ENV: ${statusRes.env}`;
          if (tablesRes?.tables) infraContext += `\n[DB TABLES] ${tablesRes.tables.map((t: any) => `${t.table_name}(${t.column_count} cols)`).join(", ")}`;
          if (envRes) {
            const envKeys = Object.entries(envRes.env || {}).map(([k, v]) => `${k}=${v}`).join(", ");
            const secKeys = Object.entries(envRes.secrets || {}).map(([k, v]) => `${k}: ${v}`).join(", ");
            infraContext += `\n[ENV VARS] ${envKeys}\n[SECRETS] ${secKeys}`;
          }
        } catch {}
        body = { message: infraContext ? `${currentPrompt}\n\n---\n${infraContext}` : currentPrompt, projectId: "general" };
      } else if (selectedAgent.agentKey === "infra_sysadmin") {
        endpoint = `${BASE}api/infra/director-stream`;
        body = { message: currentPrompt };
      } else {
        endpoint = `${BASE}api/infra/chat-stream`;
        body = { agentKey: selectedAgent.agentKey, message: currentPrompt };
      }

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
              scrollToBottom();
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

      setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, ...streamMeta } : m));
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Error: ${err.message}`, timestamp: new Date() }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const renderMessageContent = (content: string) => {
    const segments: Array<{ type: "text" | "code"; lang?: string; value: string }> = [];
    let remaining = content;
    while (remaining.length > 0) {
      const openIdx = remaining.indexOf("```");
      if (openIdx === -1) { segments.push({ type: "text", value: remaining }); break; }
      if (openIdx > 0) segments.push({ type: "text", value: remaining.slice(0, openIdx) });
      const afterOpen = remaining.slice(openIdx + 3);
      const langMatch = afterOpen.match(/^(\w*)\n?/);
      const codeStart = langMatch ? langMatch[0].length : 0;
      const closeIdx = afterOpen.indexOf("```", codeStart);
      if (closeIdx === -1) { segments.push({ type: "code", lang: langMatch?.[1], value: afterOpen.slice(codeStart) }); break; }
      segments.push({ type: "code", lang: langMatch?.[1], value: afterOpen.slice(codeStart, closeIdx) });
      remaining = afterOpen.slice(closeIdx + 3);
    }
    return (
      <div className="text-[13px] leading-relaxed break-words">
        {segments.map((seg, i) => {
          if (seg.type === "code") {
            return (
              <div key={i} className="my-2 rounded border border-[#30363d] overflow-hidden">
                <div className="px-2 py-1 bg-[#1c2333] text-[9px] text-[#8b949e] uppercase">{seg.lang || "code"}</div>
                <pre className="p-2 bg-[#0d1117] text-[12px] text-[#e1e4e8] overflow-x-auto" dir="ltr"><code>{seg.value.trim()}</code></pre>
              </div>
            );
          }
          return (
            <span key={i} className="whitespace-pre-wrap">
              {seg.value.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
                const bold = part.match(/^\*\*([^*]+)\*\*$/);
                if (bold) return <strong key={j} className="font-bold text-[#e1e4e8]">{bold[1]}</strong>;
                return part.split(/(`[^`]+`)/g).map((ip, k) => {
                  const inl = ip.match(/^`([^`]+)`$/);
                  if (inl) return <code key={`${j}-${k}`} className="px-1 py-0.5 bg-[#1c2333] rounded text-[11px] text-cyan-300 border border-[#30363d]" dir="ltr">{inl[1]}</code>;
                  return <React.Fragment key={`${j}-${k}`}>{ip}</React.Fragment>;
                });
              })}
            </span>
          );
        })}
      </div>
    );
  };

  const agentColor = selectedAgent ? (AGENT_COLORS[selectedAgent.agentKey] || "text-[#8b949e]") : "text-cyan-400";
  const agentIcon = selectedAgent ? (AGENT_ICONS[selectedAgent.agentKey] || <Bot className="w-4 h-4" />) : <Bot className="w-4 h-4" />;

  if (!open) {
    return createPortal(
      <button
        onClick={() => setOpen(true)}
        className="fixed z-[9990] bottom-6 end-6 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white shadow-2xl shadow-cyan-500/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
        title={isRTL ? "شات مدير النظام" : "Admin Chat"}
      >
        <MessageSquare className="w-6 h-6" />
      </button>,
      document.body
    );
  }

  if (minimized) {
    return createPortal(
      <div
        data-floating-chat="true"
        className="fixed z-[9990] shadow-2xl rounded-xl overflow-hidden border border-[#30363d] bg-[#161b22] cursor-move select-none"
        style={{ left: pos.x, top: pos.y, width: size.w }}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className={`p-1 rounded-md ${agentColor}`}>{agentIcon}</div>
          <span className="text-[12px] font-medium text-[#e1e4e8] flex-1 truncate">
            {selectedAgent ? (isRTL ? selectedAgent.displayNameAr : selectedAgent.displayNameEn) : "Chat"}
          </span>
          <button onClick={(e) => { e.stopPropagation(); setMinimized(false); }} className="p-1 text-[#8b949e] hover:text-[#e1e4e8]"><Maximize2 className="w-3.5 h-3.5" /></button>
          <button onClick={(e) => { e.stopPropagation(); setOpen(false); setMinimized(false); }} className="p-1 text-[#8b949e] hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <>
      <div
        data-floating-chat="true"
        className="fixed z-[9990] shadow-2xl rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117] flex flex-col select-none"
        style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d] cursor-move flex-shrink-0"
          onMouseDown={handleDragStart}
        >
          <GripHorizontal className="w-3.5 h-3.5 text-[#484f58] flex-shrink-0" />

          <div className="relative flex-1 min-w-0">
            <button
              onClick={() => setShowAgentPicker(!showAgentPicker)}
              className="flex items-center gap-2 w-full hover:bg-white/5 rounded-md px-1.5 py-1 transition-colors"
            >
              <div className={`p-1 rounded-md bg-[#0d1117] ${agentColor}`}>{agentIcon}</div>
              <span className="text-[12px] font-semibold text-[#e1e4e8] truncate">
                {selectedAgent ? (isRTL ? selectedAgent.displayNameAr : selectedAgent.displayNameEn) : (isRTL ? "اختر وكيل" : "Select agent")}
              </span>
              <ChevronDown className={`w-3 h-3 text-[#8b949e] flex-shrink-0 transition-transform ${showAgentPicker ? "rotate-180" : ""}`} />
            </button>

            {showAgentPicker && (
              <div className="absolute top-full start-0 mt-1 w-64 max-h-80 overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl z-50">
                {agents.map(agent => (
                  <button
                    key={agent.agentKey}
                    onClick={() => { setSelectedAgent(agent); setShowAgentPicker(false); setMessages([]); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-start hover:bg-white/5 transition-colors ${
                      selectedAgent?.agentKey === agent.agentKey ? "bg-white/8" : ""
                    }`}
                  >
                    <div className={`flex-shrink-0 ${AGENT_COLORS[agent.agentKey] || "text-[#8b949e]"}`}>
                      {AGENT_ICONS[agent.agentKey] || <Bot className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-medium text-[#c9d1d9] truncate">
                        {isRTL ? agent.displayNameAr : agent.displayNameEn}
                      </div>
                      <div className="text-[9px] text-[#484f58] truncate">
                        {agent.primaryModel?.model?.split("-").slice(0, 2).join("-") || ""}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => { setWandMode(!wandMode); setWandHighlight(null); }}
            className={`p-1.5 transition-colors rounded-md ${wandMode ? "text-amber-400 bg-amber-500/15" : "text-[#8b949e] hover:text-amber-400 hover:bg-white/5"}`}
            title={isRTL ? "عصا سحرية" : "Magic Wand"}
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setMessages([])} className="p-1.5 text-[#8b949e] hover:text-red-400 rounded-md hover:bg-white/5" title={isRTL ? "مسح" : "Clear"}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setMinimized(true)} className="p-1.5 text-[#8b949e] hover:text-[#e1e4e8] rounded-md hover:bg-white/5">
            <Minimize2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { setOpen(false); setWandMode(false); setWandHighlight(null); }} className="p-1.5 text-[#8b949e] hover:text-red-400 rounded-md hover:bg-white/5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {wandMode && (
          <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 flex-shrink-0">
            <Wand2 className="w-3 h-3 text-amber-400 animate-pulse" />
            <span className="text-[11px] text-amber-300">
              {isRTL ? "اضغط على أي عنصر في الصفحة — Esc للإلغاء" : "Click any page element — Esc to cancel"}
            </span>
          </div>
        )}

        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-3 space-y-3"
          onWheel={(e) => {
            if (e.deltaY < 0) userScrolledUpRef.current = true;
            else {
              const el = chatContainerRef.current;
              if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) userScrolledUpRef.current = false;
            }
          }}
        >
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className={`w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3 bg-[#161b22] border border-[#30363d] ${agentColor}`}>
                  {agentIcon}
                </div>
                <p className="text-[12px] text-[#484f58] max-w-[220px]">
                  {isRTL ? "اكتب أمرك أو استخدم العصا السحرية لتحديد عنصر" : "Type a command or use the magic wand to select an element"}
                </p>
              </div>
            </div>
          )}

          {messages.map(msg => {
            if (msg.role === "status") {
              return (
                <div key={msg.id} className="flex items-center justify-center py-0.5">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#161b22] border border-[#30363d]">
                    <div className="w-1 h-1 bg-yellow-400 rounded-full animate-pulse" />
                    <span className="text-[10px] text-[#8b949e]">{msg.content}</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={msg.id} className={msg.role === "user" ? "text-end" : ""}>
                <div className={`inline-block text-start max-w-full ${msg.role === "user" ? "bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-2 text-cyan-300 text-[13px]" : "text-[#c9d1d9]"}`}>
                  {msg.role === "assistant" && !msg.content && loading ? (
                    <div className="flex items-center gap-1.5 py-1">
                      <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      <span className="text-[10px] text-[#8b949e]">{isRTL ? "يحلل..." : "Analyzing..."}</span>
                    </div>
                  ) : renderMessageContent(msg.content)}
                  {msg.tokensUsed && (
                    <div className="text-[9px] text-[#484f58] mt-0.5">
                      {msg.models ? msg.models.join(" + ") : msg.model} · {msg.tokensUsed.toLocaleString()} tokens
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {selectedAgent?.agentKey === "strategic" && (
          <div className="border-t border-[#1c2333] px-2 py-1 flex items-center gap-1 flex-shrink-0 overflow-x-auto">
            {[
              { icon: <HardDrive className="w-3 h-3" />, label: isRTL ? "حالة النظام" : "Status", cmd: isRTL ? "اعرض حالة النظام الكاملة — قاعدة البيانات، السيرفر، الذاكرة" : "Show full system status — database, server, memory" },
              { icon: <Database className="w-3 h-3" />, label: isRTL ? "جداول" : "Tables", cmd: isRTL ? "اعرض جميع جداول قاعدة البيانات مع تفاصيل الأعمدة" : "Show all database tables with column details" },
              { icon: <FolderOpen className="w-3 h-3" />, label: isRTL ? "ملفات" : "Files", cmd: isRTL ? "اعرض قائمة ملفات البنية التحتية ومحتوياتها" : "List infrastructure files and their status" },
              { icon: <Settings className="w-3 h-3" />, label: isRTL ? "متغيرات" : "ENV", cmd: isRTL ? "اعرض جميع المتغيرات البيئية والأسرار" : "Show all environment variables and secrets status" },
              { icon: <Shield className="w-3 h-3" />, label: isRTL ? "أمان" : "Security", cmd: isRTL ? "فحص أمان شامل — الأسرار، الصلاحيات، نقاط الضعف" : "Full security audit — secrets, permissions, vulnerabilities" },
              { icon: <Terminal className="w-3 h-3" />, label: isRTL ? "أمر" : "Exec", cmd: isRTL ? "نفذ أمر: " : "Execute command: " },
            ].map((btn, i) => (
              <button
                key={i}
                onClick={() => {
                  if (btn.cmd.endsWith(": ")) { setPrompt(btn.cmd); textareaRef.current?.focus(); }
                  else { doSend(btn.cmd); }
                }}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-[#161b22] hover:bg-[#1c2333] border border-[#30363d] text-[10px] text-[#8b949e] hover:text-cyan-400 transition-colors whitespace-nowrap"
                title={btn.cmd}
              >
                {btn.icon}
                {btn.label}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-[#1c2333] px-3 py-2 flex-shrink-0">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={isRTL ? "اكتب أمرك..." : "Type command..."}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-2.5 pe-12 text-[13px] text-[#e1e4e8] placeholder-[#484f58] resize-none focus:outline-none focus:border-cyan-500/50 transition-colors"
              rows={prompt.split("\n").length > 3 ? 4 : prompt.includes("\n") ? 3 : 1}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } }}
            />
            {loading ? (
              <button onClick={handleStop} className="absolute end-2 bottom-2 p-2 bg-red-500 hover:bg-red-400 text-white rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={() => doSend()} disabled={!prompt.trim()} className="absolute end-2 bottom-2 p-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg disabled:opacity-40 transition-colors">
                <Send className={`w-3.5 h-3.5 ${isRTL ? "rotate-180" : ""}`} />
              </button>
            )}
          </div>
        </div>

        <div className="absolute top-0 left-0 w-2 h-full cursor-ew-resize" onMouseDown={e => handleResizeStart(e, "w")} />
        <div className="absolute top-0 right-0 w-2 h-full cursor-ew-resize" onMouseDown={e => handleResizeStart(e, "e")} />
        <div className="absolute bottom-0 left-0 h-2 w-full cursor-ns-resize" onMouseDown={e => handleResizeStart(e, "s")} />
        <div className="absolute top-0 left-0 h-2 w-full cursor-ns-resize" onMouseDown={e => handleResizeStart(e, "n")} />
        <div className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize" onMouseDown={e => handleResizeStart(e, "se")} />
        <div className="absolute bottom-0 left-0 w-4 h-4 cursor-nesw-resize" onMouseDown={e => handleResizeStart(e, "sw")} />
        <div className="absolute top-0 right-0 w-4 h-4 cursor-nesw-resize" onMouseDown={e => handleResizeStart(e, "ne")} />
        <div className="absolute top-0 left-0 w-4 h-4 cursor-nwse-resize" onMouseDown={e => handleResizeStart(e, "nw")} />
      </div>

      {wandMode && createPortal(
        <div data-wand-overlay="true" className="fixed inset-0 z-[9989] pointer-events-none">
          {wandHighlight && (
            <div
              className="absolute border-2 border-amber-400 bg-amber-400/10 rounded-sm pointer-events-none transition-all duration-75"
              style={{ left: wandHighlight.x, top: wandHighlight.y, width: wandHighlight.w, height: wandHighlight.h }}
            >
              <div className="absolute -top-5 start-0 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                {wandHighlight.w}×{wandHighlight.h}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}
