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
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  tokensUsed?: number;
  cost?: number;
  model?: string;
}

const AGENT_ICONS: Record<string, React.ReactNode> = {
  infra_monitor: <Activity className="w-5 h-5" />,
  infra_bugfixer: <Crosshair className="w-5 h-5" />,
  infra_builder: <Server className="w-5 h-5" />,
  infra_ui: <Palette className="w-5 h-5" />,
  infra_db: <Database className="w-5 h-5" />,
  infra_security: <Lock className="w-5 h-5" />,
  infra_deploy: <Rocket className="w-5 h-5" />,
};

const AGENT_COLORS: Record<string, string> = {
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
      let streamMeta: { tokensUsed?: number; cost?: number; model?: string } = {};
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

      const res = await fetch("/api/infra/chat-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        signal: controller.signal,
        body: JSON.stringify({ agentKey: selectedAgent.agentKey, message: currentPrompt }),
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
            else if (event.type === "done") { streamMeta = { tokensUsed: event.tokensUsed, cost: event.cost, model: event.model }; }
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
          {agents.map(agent => (
            <button
              key={agent.agentKey}
              onClick={() => selectAgent(agent)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-start transition-all",
                selectedAgent?.agentKey === agent.agentKey
                  ? "bg-[#1c2333] border border-cyan-500/30"
                  : "hover:bg-[#161b22] border border-transparent"
              )}
            >
              <div className={cn("flex-shrink-0", AGENT_COLORS[agent.agentKey] || "text-[#8b949e]")}>
                {AGENT_ICONS[agent.agentKey] || <Bot className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#e1e4e8] truncate">
                  {lang === "ar" ? agent.displayNameAr : agent.displayNameEn}
                </div>
                <div className="text-[10px] text-[#484f58] truncate">
                  {agent.primaryModel?.model?.split("-").slice(0, 2).join("-") || ""}
                </div>
              </div>
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

              {messages.map(msg => (
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
                        {msg.model} · {msg.tokensUsed.toLocaleString()} tokens{msg.cost ? ` · $${msg.cost.toFixed(4)}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
    </div>
  );
}
