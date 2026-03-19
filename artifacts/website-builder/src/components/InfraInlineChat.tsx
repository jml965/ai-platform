import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Send, X, Copy, Check, Download, Trash2, Crosshair, Palette,
  Database, Lock, Rocket, Activity, Bot, Crown, Server, FlaskConical,
  Minimize2, Maximize2, ChevronDown, Wand2, MousePointer2,
} from "lucide-react";

export interface InfraAgentInfo {
  agentKey: string;
  displayNameEn: string;
  displayNameAr: string;
  description: string;
  enabled: boolean;
  primaryModel: { provider: string; model: string };
}

interface InfraChatMsg {
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

export default function InfraInlineChat({ agent, lang, onClose, floating }: { agent: InfraAgentInfo; lang: string; onClose: () => void; floating?: boolean }) {
  const [messages, setMessages] = useState<InfraChatMsg[]>(() => {
    try {
      const m = sessionStorage.getItem(`infra_msgs_${agent.agentKey}`);
      return m ? JSON.parse(m).map((x: any) => ({ ...x, timestamp: new Date(x.timestamp) })) : [];
    } catch { return []; }
  });
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wandMode, setWandMode] = useState(false);
  const [wandHighlight, setWandHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [wandInfo, setWandInfo] = useState<WandTarget | null>(null);
  const [wandInfoExpanded, setWandInfoExpanded] = useState(false);
  const [creatingProjectFromMsg, setCreatingProjectFromMsg] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const isRTL = lang === "ar";

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem("infra_selected_agent", JSON.stringify(agent));
      sessionStorage.setItem(`infra_msgs_${agent.agentKey}`, JSON.stringify(messages.slice(-100)));
    }
  }, [messages, agent]);

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

  const handleWandClick = (e: MouseEvent) => {
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
    if (!target || target.closest("[data-wand-overlay]") || target.closest("[data-infra-chat]")) return;
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
      styles: {
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
      },
      path: getElementPath(target),
    };

    setWandInfo(info);
    setWandInfoExpanded(false);
    setWandMode(false);
    setWandHighlight(null);
    textareaRef.current?.focus();
  };

  const wandRafRef = useRef(0);
  const handleWandMove = (e: MouseEvent) => {
    cancelAnimationFrame(wandRafRef.current);
    wandRafRef.current = requestAnimationFrame(() => {
      const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
      if (!target || target.closest("[data-wand-overlay]") || target.closest("[data-infra-chat]")) {
        setWandHighlight(null);
        return;
      }
      const rect = target.getBoundingClientRect();
      setWandHighlight({ x: rect.x, y: rect.y, w: rect.width, h: rect.height });
    });
  };

  useEffect(() => {
    if (!wandMode) return;
    const onClick = (e: MouseEvent) => handleWandClick(e);
    const onMove = (e: MouseEvent) => handleWandMove(e);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setWandMode(false); setWandHighlight(null); } };
    document.addEventListener("click", onClick, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("keydown", onKey);
    const style = document.createElement("style");
    style.id = "wand-cursor-style";
    style.textContent = "* { cursor: crosshair !important; }";
    document.head.appendChild(style);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(wandRafRef.current);
      style.remove();
    };
  }, [wandMode, isRTL]);

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

  const extractCodeFromMessage = (content: string): { name: string; files: { path: string; content: string }[] } => {
    const files: { path: string; content: string }[] = [];
    const isRealCode = (code: string) => code.length > 200 && (code.includes("<") && code.includes(">") || code.includes("function") || code.includes("const ") || code.includes("{") && code.includes("}"));

    const artifactRegex = /<artifact[^>]*?language="(\w+)"[^>]*?title="([^"]*)"[^>]*?>([\s\S]*?)<\/artifact>/g;
    let match;
    while ((match = artifactRegex.exec(content)) !== null) {
      const lang = match[1] || "html";
      const code = match[3].trim();
      if (isRealCode(code)) {
        const ext = lang === "css" ? "css" : lang === "javascript" || lang === "js" ? "js" : lang === "typescript" || lang === "ts" ? "ts" : lang === "json" ? "json" : "html";
        files.push({ path: `index.${ext}`, content: code });
      }
    }

    if (files.length === 0) {
      const codeBlockRegex = /```(html|css|javascript|js|typescript|ts)\n([\s\S]*?)```/g;
      while ((match = codeBlockRegex.exec(content)) !== null) {
        const lang = match[1];
        const code = match[2].trim();
        if (isRealCode(code)) {
          const ext = lang === "css" ? "css" : lang === "javascript" || lang === "js" ? "js" : lang === "typescript" || lang === "ts" ? "ts" : "html";
          files.push({ path: `index.${ext}`, content: code });
        }
      }
    }

    if (files.length === 0) {
      const htmlMatch = content.match(/(<!DOCTYPE\s+html[\s\S]*<\/html>)/i);
      if (htmlMatch && htmlMatch[1].length > 300) files.push({ path: "index.html", content: htmlMatch[1] });
    }

    const titleMatch = content.match(/title="([^"]*)"/) || content.match(/##?\s+([^\n#*]{3,40})/) || content.match(/(?:المشروع|مشروع|Project)[:\s]+([^\n]{3,40})/i);
    let name = titleMatch ? (titleMatch[1] || "").replace(/[#*`]/g, "").trim() : "";
    if (!name || name.length < 2) name = isRTL ? "مشروع جديد" : "New Project";
    return { name, files };
  };

  const handleCreateProjectFromMsg = async (msgId: string, content: string) => {
    setCreatingProjectFromMsg(msgId);
    try {
      const { name, files } = extractCodeFromMessage(content);
      const res = await fetch(`${import.meta.env.BASE_URL}api/infra/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, description: isRTL ? "مشروع تم إنشاؤه بواسطة وكيل البنية التحتية" : "Project created by infra agent", files }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "status",
          content: isRTL ? `تم إنشاء مشروع "${data.name}" بنجاح (${data.filesCount} ملفات)` : `Project "${data.name}" created (${data.filesCount} files)`,
          timestamp: new Date(),
        }]);
        setTimeout(() => { window.location.href = `${import.meta.env.BASE_URL}project/${data.id}`; }, 1500);
      } else {
        const err = await res.json();
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `Error: ${err?.error?.message}`, timestamp: new Date() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
    setCreatingProjectFromMsg(null);
  };

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    let currentPrompt = prompt;
    if (wandInfo) {
      const wandCtx = `[عنصر محدد بالعصا: <${wandInfo.tag}> | المسار: ${wandInfo.path} | النص: "${wandInfo.text?.slice(0, 60) || ""}" | الحجم: ${wandInfo.rect.width}×${wandInfo.rect.height} | اللون: ${wandInfo.styles.color} | الخلفية: ${wandInfo.styles.backgroundColor} | الخط: ${wandInfo.styles.fontSize} ${wandInfo.styles.fontWeight}]\n\n`;
      currentPrompt = wandCtx + currentPrompt;
      setWandInfo(null);
    }
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

      const isDirector = agent.agentKey === "infra_sysadmin";
      const endpoint = isDirector ? "/api/infra/director-stream" : "/api/infra/chat-stream";
      const body = isDirector ? { message: currentPrompt } : { agentKey: agent.agentKey, message: currentPrompt };

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
            else if (event.type === "agent_activity") {
              const stepIcon = event.step === "thinking" ? "🔄" : event.step === "done" ? "✅" : event.step === "failed" ? "❌" : event.step === "merging" ? "🏛️" : "⚡";
              let actMsg = `${stepIcon} ${event.message}`;
              if (event.preview) actMsg += `\n> "${event.preview.slice(0, 100)}..."`;
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: actMsg, timestamp: new Date() }]);
              scrollToBottom();
            }
            else if (event.type === "agent_proposal") {
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `💡 ${event.agent} اقترح (${(event.durationMs/1000).toFixed(1)}ث):\n> "${event.summary.slice(0, 150)}..."`, timestamp: new Date() }]);
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

      const hasCode = streamedContent.includes("```") || streamedContent.includes("<artifact") || streamedContent.includes("<!DOCTYPE") || streamedContent.includes("<html");
      if (hasCode && streamedContent.length > 200) {
        const { name, files } = extractCodeFromMessage(streamedContent);
        if (files.length > 0) {
          setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: isRTL ? "جاري إنشاء المشروع تلقائياً..." : "Auto-creating project...", timestamp: new Date() }]);
          scrollToBottom();
          try {
            const createRes = await fetch(`${import.meta.env.BASE_URL}api/infra/create-project`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({ name, description: isRTL ? "تم إنشاؤه بواسطة وكيل البنية التحتية" : "Created by infra agent", files }),
            });
            if (createRes.ok) {
              const projData = await createRes.json();
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: isRTL ? `✅ تم إنشاء مشروع "${projData.name}" (${projData.filesCount} ملفات) — جاري الانتقال لمساحة العمل...` : `Project "${projData.name}" created (${projData.filesCount} files) — opening workspace...`, timestamp: new Date() }]);
              scrollToBottom();
              setTimeout(() => { window.location.href = `${import.meta.env.BASE_URL}project/${projData.id}`; }, 1500);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `Error: ${err.message}`, timestamp: new Date() }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const agentColor = AGENT_COLORS[agent.agentKey] || "text-[#8b949e]";
  const agentIcon = AGENT_ICONS[agent.agentKey] || <Bot className="w-4 h-4" />;

  const WandInfoBlock = ({ text }: { text: string }) => {
    const [open, setOpen] = useState(false);
    const tagMatch = text.match(/<(\w+)>/);
    const tag = tagMatch ? tagMatch[1] : "element";
    return (
      <div className="mb-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 overflow-hidden">
        <div className="flex items-center gap-1.5 px-2 py-1 cursor-pointer select-none" onClick={() => setOpen(!open)}>
          <Wand2 className="w-3 h-3 text-amber-400 flex-shrink-0" />
          <span className="text-[10px] text-amber-300 flex-1 truncate">{isRTL ? `عنصر محدد: <${tag}>` : `Selected: <${tag}>`}</span>
          <ChevronDown className={`w-3 h-3 text-amber-400/60 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
        {open && <div className="px-2 pb-1.5 text-[10px] text-[#8b949e] whitespace-pre-wrap border-t border-amber-500/10">{text}</div>}
      </div>
    );
  };

  const renderMessageContent = (content: string) => {
    const wandMatch = content.match(/^\[عنصر محدد بالعصا:([^\]]+)\]\n\n/);
    let wandBlock: string | null = null;
    let rest = content;
    if (wandMatch) {
      wandBlock = wandMatch[1].trim();
      rest = content.slice(wandMatch[0].length);
    }

    const segments: Array<{ type: "text" | "code"; lang?: string; value: string }> = [];
    let remaining = rest;
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
        {wandBlock && <WandInfoBlock text={wandBlock} />}
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

  const containerClass = floating
    ? `fixed z-50 bottom-6 ${isRTL ? "left-6" : "right-6"} bg-[#0d1117] border border-[#1c2333] rounded-2xl shadow-2xl flex flex-col transition-all duration-300 overflow-hidden ${expanded ? "w-[500px] h-[85vh]" : "w-[380px] h-[550px]"}`
    : `bg-[#0d1117] border-s border-[#1c2333] flex flex-col transition-all duration-300 flex-shrink-0 h-full ${expanded ? "w-[500px]" : "w-[340px]"}`;

  return (
    <div
      data-infra-chat="true"
      className={containerClass}
      dir={isRTL ? "rtl" : "ltr"}
    >
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#1c2333] bg-[#161b22] flex-shrink-0">
        <div className={`p-1.5 rounded-md bg-[#0d1117] ${agentColor}`}>
          {agentIcon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#e1e4e8] truncate">
            {isRTL ? agent.displayNameAr : agent.displayNameEn}
          </div>
          <div className="text-[10px] text-[#484f58] truncate">{agent.primaryModel?.model?.split("-").slice(0, 2).join("-")}</div>
        </div>
        <button
          onClick={() => { setWandMode(!wandMode); setWandHighlight(null); }}
          className={`p-1 transition-colors rounded hover:bg-white/5 ${wandMode ? "text-amber-400 bg-amber-500/15" : "text-[#8b949e] hover:text-amber-400"}`}
          title={isRTL ? "عصا سحرية — حدد عنصر لتعديله" : "Magic Wand — select element to edit"}
        >
          <Wand2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => setExpanded(!expanded)} className="p-1 text-[#8b949e] hover:text-[#e1e4e8] transition-colors rounded hover:bg-white/5" title={expanded ? (isRTL ? "تضييق" : "Narrow") : (isRTL ? "توسيع" : "Widen")}>
          {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => { setMessages([]); sessionStorage.removeItem(`infra_msgs_${agent.agentKey}`); }}
          className="p-1 text-[#8b949e] hover:text-red-400 transition-colors rounded hover:bg-white/5"
          title={isRTL ? "مسح" : "Clear"}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={onClose} className="p-1 text-[#8b949e] hover:text-red-400 transition-colors rounded hover:bg-white/5" title={isRTL ? "إغلاق" : "Close"}>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {wandMode && (
        <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 flex-shrink-0">
          <Wand2 className="w-3 h-3 text-amber-400 animate-pulse" />
          <span className="text-[11px] text-amber-300">
            {isRTL ? "اضغط على أي عنصر في الصفحة لتحديده — Esc للإلغاء" : "Click any element on the page to select it — Esc to cancel"}
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
              <div className={`w-10 h-10 mx-auto rounded-lg flex items-center justify-center mb-2 bg-[#161b22] ${agentColor}`}>
                {agentIcon}
              </div>
              <p className="text-[11px] text-[#484f58] max-w-[200px]">
                {isRTL ? "اكتب أمرك وسيتم تنفيذه" : "Type your command"}
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
              <div className={`inline-block text-start max-w-full ${msg.role === "user" ? "text-cyan-400 text-[13px]" : "text-[#c9d1d9]"}`}>
                {msg.role === "assistant" && !msg.content && loading ? (
                  <div className="flex items-center gap-1.5 py-1">
                    <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1 h-1 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
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
        <div ref={chatEndRef} />
      </div>

      {wandInfo && (
        <div className="border-t border-[#1c2333] bg-[#161b22] px-3 py-1.5 flex-shrink-0">
          <div
            className="flex items-center gap-2 cursor-pointer select-none"
            onClick={() => setWandInfoExpanded(!wandInfoExpanded)}
          >
            <Wand2 className="w-3 h-3 text-amber-400 flex-shrink-0" />
            <span className="text-[11px] text-amber-300 truncate flex-1">
              {isRTL ? `عنصر محدد: <${wandInfo.tag}> ${wandInfo.text ? `"${wandInfo.text.slice(0, 30)}..."` : ""}` : `Selected: <${wandInfo.tag}> ${wandInfo.text ? `"${wandInfo.text.slice(0, 30)}..."` : ""}`}
            </span>
            <ChevronDown className={`w-3 h-3 text-[#484f58] transition-transform ${wandInfoExpanded ? "rotate-180" : ""}`} />
            <button
              onClick={e => { e.stopPropagation(); setWandInfo(null); }}
              className="p-0.5 text-[#484f58] hover:text-red-400"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {wandInfoExpanded && (
            <div className="mt-1.5 text-[10px] text-[#8b949e] space-y-0.5 bg-[#0d1117] rounded-lg p-2 border border-[#30363d]">
              <div>{isRTL ? "النوع" : "Tag"}: <span className="text-cyan-400">&lt;{wandInfo.tag}&gt;</span>{wandInfo.id ? ` id="${wandInfo.id}"` : ""}</div>
              <div>{isRTL ? "المسار" : "Path"}: <span className="text-[#7d8590]">{wandInfo.path}</span></div>
              {wandInfo.text && <div>{isRTL ? "النص" : "Text"}: <span className="text-[#e1e4e8]">"{wandInfo.text.slice(0, 80)}"</span></div>}
              <div>{isRTL ? "الحجم" : "Size"}: {wandInfo.rect.width}×{wandInfo.rect.height}px | {isRTL ? "الموقع" : "Pos"}: ({wandInfo.rect.x}, {wandInfo.rect.y})</div>
              <div>{isRTL ? "اللون" : "Color"}: {wandInfo.styles.color} | {isRTL ? "الخلفية" : "BG"}: {wandInfo.styles.backgroundColor}</div>
              <div>{isRTL ? "الخط" : "Font"}: {wandInfo.styles.fontSize} {wandInfo.styles.fontWeight}</div>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-[#1c2333] bg-[#0d1117] p-2 flex-shrink-0">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={wandInfo ? (isRTL ? "ما التعديل المطلوب على هذا العنصر؟" : "What change do you want on this element?") : (isRTL ? "اكتب أمرك..." : "Type command...")}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 pe-10 text-sm text-[#e1e4e8] placeholder-[#484f58] resize-none focus:outline-none focus:border-cyan-500/50 transition-colors"
            rows={2}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
          />
          {loading ? (
            <button onClick={handleStop} className="absolute end-2 bottom-2 p-2 bg-red-500 hover:bg-red-400 text-white rounded-lg transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={handleSend} disabled={!prompt.trim()} className="absolute end-2 bottom-2 p-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg disabled:opacity-40 transition-colors">
              <Send className={`w-3.5 h-3.5 ${isRTL ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
      </div>

      {wandMode && createPortal(
        <div
          data-wand-overlay="true"
          className="fixed inset-0 z-[9999] pointer-events-none"
        >
          {wandHighlight && (
            <div
              className="absolute border-2 border-amber-400 bg-amber-400/10 rounded-sm pointer-events-none transition-all duration-75"
              style={{
                left: wandHighlight.x,
                top: wandHighlight.y,
                width: wandHighlight.w,
                height: wandHighlight.h,
              }}
            >
              <div className="absolute -top-5 start-0 bg-amber-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                {wandHighlight.w}×{wandHighlight.h}
              </div>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
