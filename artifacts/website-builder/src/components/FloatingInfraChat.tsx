import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import {
  Send, X, Copy, Check, Download, Trash2, Shield, Crosshair, Palette,
  Database, Lock, Rocket, Activity, Bot, Crown, Server, FlaskConical,
  Minimize2, Maximize2, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InfraAgent {
  agentKey: string;
  displayNameEn: string;
  displayNameAr: string;
  description: string;
  primaryModel?: { provider: string; model: string };
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "status";
  content: string;
  timestamp: string;
  tokensUsed?: number;
  cost?: number;
  model?: string;
  models?: string[];
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

function MessageContent({ content }: { content: string }) {
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);
  const handleCopy = (code: string, idx: number) => { navigator.clipboard.writeText(code); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 2000); };

  const segments: Array<{ type: "text" | "code"; lang?: string; value: string }> = [];
  let rem = content;
  while (rem.length > 0) {
    const oi = rem.indexOf("```");
    if (oi === -1) { segments.push({ type: "text", value: rem }); break; }
    if (oi > 0) segments.push({ type: "text", value: rem.slice(0, oi) });
    const after = rem.slice(oi + 3);
    const lm = after.match(/^(\w*)\n?/);
    const lang = lm ? lm[1] : "";
    const cs = lm ? lm[0].length : 0;
    const ci = after.indexOf("```", cs);
    if (ci === -1) { segments.push({ type: "code", lang, value: after.slice(cs) }); break; }
    segments.push({ type: "code", lang, value: after.slice(cs, ci) });
    rem = after.slice(ci + 3);
  }

  const renderText = (text: string, keyPrefix: number) => {
    if (!text.trim()) return null;
    return text.split("\n").map((line, li) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((seg, si) => {
        const b = seg.match(/^\*\*([^*]+)\*\*$/);
        if (b) return <strong key={si} className="font-bold text-[#e1e4e8]">{b[1]}</strong>;
        return seg.split(/(`[^`]+`)/g).map((ip, ii) => {
          const m = ip.match(/^`([^`]+)`$/);
          return m ? <code key={`${si}-${ii}`} className="px-1 py-0.5 bg-[#1c2333] rounded text-[12px] text-cyan-300 border border-[#30363d]" dir="ltr">{m[1]}</code> : <React.Fragment key={`${si}-${ii}`}>{ip}</React.Fragment>;
        });
      });
      return <React.Fragment key={`${keyPrefix}-${li}`}>{li > 0 && <br />}{parts}</React.Fragment>;
    });
  };

  const extMap: Record<string, string> = { html: "html", css: "css", javascript: "js", js: "js", typescript: "ts", ts: "ts", json: "json", bash: "sh", sql: "sql" };

  return (
    <div style={{ fontSize: "13px", lineHeight: 1.6, wordBreak: "break-word" }}>
      {segments.map((seg, i) => {
        if (seg.type === "code") {
          const code = seg.value.trim();
          const langLabel = seg.lang || "code";
          const fileExt = extMap[langLabel.toLowerCase()] || "txt";
          return (
            <div key={i} className="my-2 rounded-lg border border-[#30363d]">
              <div className="flex items-center justify-between px-2 py-1 bg-[#1c2333] rounded-t-lg">
                <span className="text-[9px] text-[#8b949e] uppercase">{langLabel}</span>
                <div className="flex gap-1">
                  <button onClick={() => handleCopy(code, i)} className="p-0.5 text-[#8b949e] hover:text-white">
                    {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button onClick={() => { const b = new Blob([code], { type: "text/plain" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = `code.${fileExt}`; a.click(); URL.revokeObjectURL(u); }} className="p-0.5 text-[#8b949e] hover:text-white">
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <pre className="p-2 bg-[#0d1117] text-[12px] text-[#e1e4e8] overflow-x-auto" dir="ltr"><code>{code}</code></pre>
            </div>
          );
        }
        return <div key={i} className="whitespace-pre-wrap">{renderText(seg.value, i)}</div>;
      })}
    </div>
  );
}

export default function FloatingInfraChat() {
  const [location] = useLocation();
  const { lang } = useI18n();
  const isRTL = lang === "ar";

  const [agent, setAgent] = useState<InfraAgent | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  useEffect(() => {
    try {
      const s = sessionStorage.getItem("infra_selected_agent");
      if (s) {
        const a = JSON.parse(s);
        setAgent(a);
        const m = sessionStorage.getItem(`infra_msgs_${a.agentKey}`);
        if (m) setMessages(JSON.parse(m));
        else setMessages([]);
      } else {
        setAgent(null);
        setMessages([]);
      }
    } catch {}
  }, [location]);

  useEffect(() => {
    if (agent && messages.length > 0) {
      sessionStorage.setItem(`infra_msgs_${agent.agentKey}`, JSON.stringify(messages.slice(-100)));
    }
  }, [messages, agent]);

  const scrollToBottom = useCallback(() => {
    if (userScrolledUpRef.current) return;
    const el = chatRef.current;
    if (!el) return;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() => { programmaticScrollRef.current = false; });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages.length, scrollToBottom]);

  if (location === "/infra" || !agent || messages.length === 0) return null;

  const handleClose = () => {
    setAgent(null);
    setMessages([]);
    sessionStorage.removeItem("infra_selected_agent");
  };

  const handleSend = async () => {
    if (!prompt.trim() || !agent || loading) return;
    const currentPrompt = prompt;
    setPrompt("");
    setLoading(true);
    userScrolledUpRef.current = false;

    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "user", content: currentPrompt, timestamp: new Date().toISOString() }]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const streamMsgId = crypto.randomUUID();
      let streamedContent = "";
      let displayedContent = "";
      let streamMeta: any = {};
      let typewriterRunning = false;
      let typewriterStopped = false;

      const typewriterFlush = () => {
        if (typewriterRunning || typewriterStopped) return;
        typewriterRunning = true;
        const tick = () => {
          if (typewriterStopped) { typewriterRunning = false; return; }
          if (displayedContent.length < streamedContent.length) {
            const remaining = streamedContent.slice(displayedContent.length);
            const inCode = (displayedContent.match(/```/g) || []).length % 2 === 1;
            if (inCode) {
              const ci = remaining.indexOf("```");
              displayedContent = ci !== -1 ? streamedContent.slice(0, displayedContent.length + ci + 3) : streamedContent;
            } else {
              const oi = remaining.indexOf("```");
              if (oi === 0) {
                const af = remaining.slice(3); const ci = af.indexOf("```");
                displayedContent = ci !== -1 ? streamedContent.slice(0, displayedContent.length + 3 + ci + 3) : streamedContent;
              } else { displayedContent = streamedContent.slice(0, displayedContent.length + 1); }
            }
            setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, content: displayedContent } : m));
            scrollToBottom();
            setTimeout(tick, inCode ? 0 : 18);
          } else { typewriterRunning = false; }
        };
        tick();
      };

      controller.signal.addEventListener("abort", () => { typewriterStopped = true; });
      setMessages(prev => [...prev, { id: streamMsgId, role: "assistant", content: "", timestamp: new Date().toISOString() }]);

      const isDirector = agent.agentKey === "infra_sysadmin";
      const endpoint = isDirector ? "/api/infra/director-stream" : "/api/infra/chat-stream";
      const body = isDirector ? { message: currentPrompt } : { agentKey: agent.agentKey, message: currentPrompt };

      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", signal: controller.signal, body: JSON.stringify(body) });
      if (!res.ok) { let e = `Error ${res.status}`; try { const d = await res.json(); e = d?.error?.message || e; } catch {} throw new Error(e); }

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
            else if (event.type === "status") { setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: event.message || event.messageEn, timestamp: new Date().toISOString() }]); scrollToBottom(); }
            else if (event.type === "agent_activity") {
              const icon = event.step === "thinking" ? "🔄" : event.step === "done" ? "✅" : event.step === "failed" ? "❌" : event.step === "merging" ? "🏛️" : "⚡";
              let m = `${icon} ${event.message}`;
              if (event.preview) m += `\n> "${event.preview.slice(0, 80)}..."`;
              setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: m, timestamp: new Date().toISOString() }]); scrollToBottom();
            }
            else if (event.type === "agent_proposal") { setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `💡 ${event.agent} (${(event.durationMs/1000).toFixed(1)}ث):\n> "${event.summary.slice(0, 120)}..."`, timestamp: new Date().toISOString() }]); scrollToBottom(); }
            else if (event.type === "done") { streamMeta = { tokensUsed: event.tokensUsed, cost: event.cost, model: event.model, models: event.models }; }
            else if (event.type === "error") { streamedContent += event.message; typewriterFlush(); }
          } catch {}
        }
      }

      await new Promise<void>(r => { const w = () => { if (displayedContent.length >= streamedContent.length) r(); else setTimeout(w, 30); }; w(); });
      setMessages(prev => prev.map(m => m.id === streamMsgId ? { ...m, content: streamedContent, ...streamMeta } : m));
    } catch (err: any) {
      if (err.name !== "AbortError") { setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: `خطأ: ${err.message}`, timestamp: new Date().toISOString() }]); }
    } finally { setLoading(false); abortRef.current = null; }
  };

  const clearSession = async () => {
    if (!agent) return;
    await fetch("/api/infra/clear-session", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ agentKey: agent.agentKey }) });
    setMessages([]);
    sessionStorage.removeItem(`infra_msgs_${agent.agentKey}`);
  };

  const agentName = isRTL ? agent.displayNameAr : agent.displayNameEn;
  const icon = AGENT_ICONS[agent.agentKey] || <Bot className="w-4 h-4" />;
  const color = AGENT_COLORS[agent.agentKey] || "text-[#8b949e]";

  if (minimized) {
    return (
      <div onClick={() => setMinimized(false)} className="fixed bottom-4 end-4 z-[9999] flex items-center gap-2 px-4 py-2.5 bg-[#161b22] border border-cyan-500/30 rounded-full cursor-pointer shadow-lg shadow-black/40 hover:border-cyan-400/50 transition-all" dir={isRTL ? "rtl" : "ltr"}>
        <div className={cn("flex-shrink-0", color)}>{icon}</div>
        <span className="text-sm font-medium text-[#e1e4e8]">{agentName}</span>
        {loading && <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />}
        <Maximize2 className="w-3.5 h-3.5 text-[#8b949e]" />
      </div>
    );
  }

  const w = expanded ? "w-[700px]" : "w-[420px]";
  const h = expanded ? "h-[85vh]" : "h-[560px]";

  return (
    <div className={cn("fixed bottom-4 end-4 z-[9999] bg-[#0d1117] border border-[#1c2333] rounded-xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden", w, h)} dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between px-3 py-2 bg-[#161b22] border-b border-[#1c2333]">
        <div className="flex items-center gap-2">
          <div className={cn("flex-shrink-0", color)}>{icon}</div>
          <div>
            <div className="text-sm font-semibold text-[#e1e4e8]">{agentName}</div>
            <div className="text-[10px] text-[#484f58]">{agent.primaryModel?.model?.split("-").slice(0,2).join("-") || ""}</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearSession} className="p-1.5 text-[#8b949e] hover:text-red-400 hover:bg-[#1c2333] rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
          <button onClick={() => setExpanded(!expanded)} className="p-1.5 text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors">{expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}</button>
          <button onClick={() => setMinimized(true)} className="p-1.5 text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors"><ChevronDown className="w-3.5 h-3.5" /></button>
          <button onClick={handleClose} className="p-1.5 text-[#8b949e] hover:text-red-400 hover:bg-[#1c2333] rounded transition-colors"><X className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      <div ref={chatRef} className="flex-1 overflow-y-auto p-3 space-y-3" onWheel={(e) => { if (e.deltaY < 0) userScrolledUpRef.current = true; else { const el = chatRef.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) userScrolledUpRef.current = false; } }}>
        {messages.map(msg => {
          if (msg.role === "status") return (
            <div key={msg.id} className="flex justify-center py-0.5">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#161b22] border border-[#30363d]">
                <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-[#8b949e] whitespace-pre-wrap">{msg.content}</span>
              </div>
            </div>
          );
          return (
            <div key={msg.id} className={cn("py-0.5", msg.role === "user" ? "text-end" : "")}>
              <div className={cn("inline-block text-start max-w-full", msg.role === "user" ? "text-cyan-400 text-sm" : "text-[#c9d1d9]")}>
                {msg.role === "assistant" && !msg.content && loading ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    <span className="text-[11px] text-[#8b949e]">{isRTL ? "يحلل..." : "Analyzing..."}</span>
                  </div>
                ) : <MessageContent content={msg.content} />}
                {msg.tokensUsed && <div className="text-[9px] text-[#484f58] mt-0.5">{msg.models ? msg.models.join(" + ") : msg.model} · {msg.tokensUsed.toLocaleString()} tokens</div>}
              </div>
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </div>

      <div className="border-t border-[#1c2333] bg-[#0d1117] p-2">
        <div className="relative">
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder={isRTL ? "اكتب أمرك..." : "Type command..."} className="w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 pe-10 text-sm text-[#e1e4e8] placeholder-[#484f58] resize-none focus:outline-none focus:border-cyan-500/50" rows={2} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
          {loading ? (
            <button onClick={() => { abortRef.current?.abort(); setLoading(false); }} className="absolute end-1.5 bottom-1.5 p-1.5 bg-red-500 hover:bg-red-400 text-white rounded-lg"><X className="w-3.5 h-3.5" /></button>
          ) : (
            <button onClick={handleSend} disabled={!prompt.trim()} className="absolute end-1.5 bottom-1.5 p-1.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg disabled:opacity-40"><Send className={cn("w-3.5 h-3.5", isRTL && "rotate-180")} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
