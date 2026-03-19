import React, { useState, useRef, useEffect, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import {
  Send,
  X,
  Copy,
  Check,
  Download,
  Trash2,
  Shield,
  Crosshair,
  Palette,
  Database,
  Lock,
  Rocket,
  Activity,
  Bot,
  Crown,
  Server,
  FlaskConical,
  Minimize2,
  Maximize2,
  ChevronDown,
  MessageSquare,
  FolderPlus,
  ExternalLink,
  Loader2,
  Stethoscope,
  Wrench,
  AlertTriangle,
  RotateCcw,
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
  role: "user" | "assistant" | "status";
  content: string;
  timestamp: Date;
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

function FloatingMessageContent({ content }: { content: string }) {
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
          if (inlineMatch) return <code key={`${si}-${ii}`} className="px-1 py-0.5 bg-[#1c2333] rounded text-[12px] text-cyan-300 border border-[#30363d]" dir="ltr">{inlineMatch[1]}</code>;
          return <React.Fragment key={`${si}-${ii}`}>{ip}</React.Fragment>;
        });
      });
      return <React.Fragment key={`${keyPrefix}-${li}`}>{li > 0 && <br />}{rendered}</React.Fragment>;
    });
  };

  const segments = parseContent(content);
  const extMap: Record<string, string> = {
    html: "html", css: "css", javascript: "js", js: "js", typescript: "ts", ts: "ts",
    tsx: "tsx", jsx: "jsx", json: "json", bash: "sh", sql: "sql",
  };

  return (
    <div style={{ fontSize: "13px", lineHeight: 1.6, wordBreak: "break-word", overflowWrap: "break-word" }}>
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
            <div key={i} className="my-2 rounded-lg border border-[#30363d]">
              <div className="flex items-center justify-between px-2 py-1 bg-[#1c2333] rounded-t-lg">
                <span className="text-[9px] text-[#8b949e] uppercase tracking-wide">{langLabel}</span>
                <div className="flex gap-1">
                  <button onClick={() => handleCopy(code, i)} className="p-0.5 rounded text-[#8b949e] hover:text-[#e1e4e8]">
                    {copiedIdx === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  </button>
                  <button onClick={handleDownload} className="p-0.5 rounded text-[#8b949e] hover:text-[#e1e4e8]">
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <pre className="p-2 bg-[#0d1117] text-[12px] leading-relaxed text-[#e1e4e8] overflow-x-auto" dir="ltr">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        return <div key={i} className="whitespace-pre-wrap">{renderText(seg.value, i)}</div>;
      })}
    </div>
  );
}

export default function FloatingInfraChat() {
  const { t, lang } = useI18n();
  const isRTL = lang === "ar";
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [agents, setAgents] = useState<InfraAgent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<InfraAgent | null>(null);
  const [showAgentList, setShowAgentList] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [creatingProject, setCreatingProject] = useState(false);
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [showDiagForm, setShowDiagForm] = useState(false);
  const [diagProjectId, setDiagProjectId] = useState("");
  const [diagLoading, setDiagLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/infra/agents`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAgents(data);
          const sysadmin = data.find((a: InfraAgent) => a.agentKey === "infra_sysadmin");
          if (sysadmin) setSelectedAgent(sysadmin);
        }
      })
      .catch(() => {});
  }, []);

  const scrollToBottomIfNeeded = useCallback(() => {
    if (userScrolledUpRef.current) return;
    programmaticScrollRef.current = true;
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setTimeout(() => { programmaticScrollRef.current = false; }, 100);
  }, []);

  useEffect(() => {
    if (isOpen) scrollToBottomIfNeeded();
  }, [messages, isOpen, scrollToBottomIfNeeded]);

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleSend = async () => {
    if (!prompt.trim() || loading || !selectedAgent) return;
    const currentPrompt = prompt.trim();
    setPrompt("");
    userScrolledUpRef.current = false;

    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      role: "user",
      content: currentPrompt,
      timestamp: new Date(),
    }]);

    setLoading(true);
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

      if (!isOpen) setUnreadCount(prev => prev + 1);

      const isDirector = selectedAgent.agentKey === "infra_sysadmin";
      const endpoint = `${import.meta.env.BASE_URL}api/${isDirector ? "infra/director-stream" : "infra/chat-stream"}`;
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
        try { const errData = await res.json(); errMsg = errData?.error?.message || errData?.error || errMsg; } catch {}
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
          content: `${isRTL ? "خطأ" : "Error"}: ${err.message}`, timestamp: new Date(),
        }]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const clearSession = async () => {
    if (!selectedAgent) return;
    await fetch(`${import.meta.env.BASE_URL}api/infra/clear-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ agentKey: selectedAgent.agentKey }),
    });
    setMessages([]);
  };

  const extractFilesFromContent = (content: string): { name: string; files: { path: string; content: string }[] } => {
    const files: { path: string; content: string }[] = [];
    let projectName = "";

    const titleMatch = content.match(/(?:المشروع|Project)[:\s]*\**([^\n*]+)\**/i);
    if (titleMatch) projectName = titleMatch[1].trim().replace(/[—–\-]+\s*/, "");
    if (!projectName) {
      const h2Match = content.match(/##\s*[🚀📋]*\s*(?:بدء التنفيذ|المشروع|Project)[:\s]*([^\n]+)/);
      if (h2Match) projectName = h2Match[1].trim().replace(/\*\*/g, "").replace(/[—–\-]+\s*/, "");
    }

    const headerPattern = /###\s+([^\n]+)\n\s*```\w*\n([\s\S]*?)```/g;
    let match;
    while ((match = headerPattern.exec(content)) !== null) {
      let filePath = match[1].trim().replace(/\*\*/g, "");
      const fileContent = match[2].trim();

      if (filePath.match(/\.(jsx?|tsx?|css|html|json|js|ts|config\.\w+)$/i)) {
        files.push({ path: filePath, content: fileContent });
      }
    }

    if (files.length === 0) {
      const codeBlockPattern = /```(\w+)\n([\s\S]*?)```/g;
      const fileExtMap: Record<string, string> = { json: "file.json", html: "index.html", jsx: "App.jsx", tsx: "App.tsx", css: "styles.css", js: "script.js", ts: "script.ts" };
      let blockIdx = 0;
      while ((match = codeBlockPattern.exec(content)) !== null) {
        const lang = match[1];
        const code = match[2].trim();
        if (code.length > 30 && fileExtMap[lang]) {
          files.push({ path: fileExtMap[lang] + (blockIdx > 0 ? `_${blockIdx}` : ""), content: code });
          blockIdx++;
        }
      }
    }

    return { name: projectName || (isRTL ? "مشروع اختبار" : "Test Project"), files };
  };

  const handleCreateFromResponse = async (content: string) => {
    const { name, files } = extractFilesFromContent(content);
    setCreatingProject(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/infra/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          description: isRTL ? `مشروع تم إنشاؤه بواسطة وكيل ${selectedAgent?.displayNameAr || "البنية التحتية"}` : `Project created by ${selectedAgent?.displayNameEn || "infra"} agent`,
          files,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "status",
          content: isRTL
            ? `✅ تم إنشاء مشروع "${data.name}" — ${data.filesCount} ملفات`
            : `✅ Project "${data.name}" created — ${data.filesCount} files`,
          timestamp: new Date(),
        }]);
        window.open(`${import.meta.env.BASE_URL}project/${data.id}`, "_blank");
      } else {
        const err = await res.json();
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `❌ ${err?.error?.message || "Failed"}`, timestamp: new Date() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `❌ ${err.message}`, timestamp: new Date() }]);
    }
    setCreatingProject(false);
  };

  const contentHasProjectFiles = (content: string): boolean => {
    const headerPattern = /###\s+[^\n]*\.(jsx?|tsx?|css|html|json|config\.\w+)\s*\n\s*```/;
    return headerPattern.test(content);
  };

  const handleDiagnoseProject = async () => {
    const pid = diagProjectId.trim();
    if (!pid) return;
    setDiagLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/infra/diagnostics/project/${pid}`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const s = data.summary;
        const issuesList = s.issues.length > 0 ? s.issues.join("\n  - ") : (isRTL ? "لا توجد مشاكل" : "No issues found");
        const failedInfo = data.failedTasks.length > 0
          ? data.failedTasks.map((t: any) => `  ${t.agentType}: ${t.errorMessage || t.status}`).join("\n")
          : "";
        const sandboxInfo = data.sandboxes.length > 0
          ? data.sandboxes.map((s: any) => `  ${s.status} (port: ${s.port || "N/A"})`).join("\n")
          : (isRTL ? "  لا يوجد sandbox" : "  No sandboxes");

        const report = `## ${isRTL ? "تقرير تشخيص" : "Diagnostic Report"}: ${data.project.name}
**${isRTL ? "الحالة" : "Status"}:** ${data.project.status}
**${isRTL ? "الملفات" : "Files"}:** ${s.totalFiles} | **${isRTL ? "مهام البناء" : "Build Tasks"}:** ${s.totalBuildTasks} (${s.failedBuildTasks} ${isRTL ? "فاشلة" : "failed"})

### ${isRTL ? "المشاكل" : "Issues"}:
  - ${issuesList}
${failedInfo ? `\n### ${isRTL ? "تفاصيل الفشل" : "Failure Details"}:\n${failedInfo}` : ""}
### Sandbox:
${sandboxInfo}`;

        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: report,
          timestamp: new Date(),
        }]);
        setShowDiagForm(false);
        setDiagProjectId("");
      } else {
        const err = await res.json();
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `Error: ${err?.error?.message || res.status}`, timestamp: new Date() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
    setDiagLoading(false);
  };

  const handleCheckRecentFailures = async () => {
    setDiagLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/infra/diagnostics/recent-failures`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        let report = `## ${isRTL ? "آخر الأخطاء في المنصة" : "Recent Platform Failures"}\n`;
        report += `**${isRTL ? "إجمالي المشاكل" : "Total Issues"}:** ${data.totalIssues}\n\n`;

        if (data.stuckProjects.length > 0) {
          report += `### ${isRTL ? "مشاريع عالقة" : "Stuck Projects"} (${data.stuckProjects.length}):\n`;
          data.stuckProjects.forEach((p: any) => { report += `- **${p.name}** — ${p.status} (${p.id.slice(0, 8)}...)\n`; });
        }
        if (data.failedBuildTasks.length > 0) {
          report += `\n### ${isRTL ? "مهام بناء فاشلة" : "Failed Build Tasks"} (${data.failedBuildTasks.length}):\n`;
          data.failedBuildTasks.slice(0, 5).forEach((t: any) => { report += `- ${t.agentType}: ${t.errorMessage || t.status}\n`; });
        }
        if (data.totalIssues === 0) {
          report += isRTL ? "✅ لا توجد مشاكل حالياً!" : "✅ No issues found!";
        }

        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "assistant", content: report, timestamp: new Date() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
    setDiagLoading(false);
    setShowDiagForm(false);
  };

  const handleRetryBuild = async () => {
    const pid = diagProjectId.trim();
    if (!pid) return;
    setDiagLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/infra/repair/retry-build/${pid}`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: isRTL ? "✅ تم إعادة تعيين المهام الفاشلة — سيُعاد البناء" : "✅ Failed tasks reset — rebuild queued", timestamp: new Date() }]);
      } else {
        const err = await res.json();
        setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `Error: ${err?.error?.message}`, timestamp: new Date() }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "status", content: `Error: ${err.message}`, timestamp: new Date() }]);
    }
    setDiagLoading(false);
  };

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    setCreatingProject(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/infra/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: projectName.trim(), description: projectDesc.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "status",
          content: isRTL ? `تم إنشاء مشروع "${data.name}" بنجاح` : `Project "${data.name}" created successfully`,
          timestamp: new Date(),
        }]);
        setShowProjectForm(false);
        setProjectName("");
        setProjectDesc("");
        window.open(`${import.meta.env.BASE_URL}project/${data.id}`, "_blank");
      } else {
        const err = await res.json();
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "status",
          content: `${isRTL ? "خطأ" : "Error"}: ${err?.error?.message || "Failed"}`,
          timestamp: new Date(),
        }]);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "status",
        content: `${isRTL ? "خطأ" : "Error"}: ${err.message}`,
        timestamp: new Date(),
      }]);
    }
    setCreatingProject(false);
  };

  const handleOpen = () => {
    setIsOpen(true);
    setUnreadCount(0);
  };

  if (agents.length === 0) return null;

  const panelWidth = isExpanded ? "w-[700px]" : "w-[420px]";
  const panelHeight = isExpanded ? "h-[85vh]" : "h-[550px]";

  return (
    <>
      {!isOpen && (
        <button
          onClick={handleOpen}
          className={cn(
            "fixed z-50 bottom-6 p-3.5 rounded-2xl shadow-2xl transition-all duration-300",
            "bg-gradient-to-br from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500",
            "hover:scale-110 active:scale-95",
            isRTL ? "left-6" : "right-6"
          )}
        >
          <Crown className="w-6 h-6 text-black" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {isOpen && (
        <div
          className={cn(
            "fixed z-50 bottom-6 flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-[#1c2333] bg-[#0a0e14] transition-all duration-300",
            panelWidth, panelHeight,
            isRTL ? "left-6" : "right-6"
          )}
          dir={isRTL ? "rtl" : "ltr"}
        >
          <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-[#161b22] to-[#0d1117] border-b border-[#1c2333]">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <button
                  onClick={() => setShowAgentList(!showAgentList)}
                  className="flex items-center gap-2 hover:bg-[#1c2333] rounded-lg px-2 py-1 transition-colors"
                >
                  <div className={cn("p-1.5 rounded-lg bg-[#0d1117]", AGENT_COLORS[selectedAgent?.agentKey || ""] || "text-cyan-400")}>
                    {selectedAgent ? AGENT_ICONS[selectedAgent.agentKey] || <Bot className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-[#e1e4e8] block leading-tight">
                      {selectedAgent ? (isRTL ? selectedAgent.displayNameAr : selectedAgent.displayNameEn) : (isRTL ? "مدير النظام" : "SysAdmin")}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-[#484f58]" />
                </button>

                {showAgentList && (
                  <div className={cn(
                    "absolute top-full mt-1 w-64 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl overflow-hidden z-50",
                    isRTL ? "right-0" : "left-0"
                  )}>
                    {agents.map(agent => (
                      <button
                        key={agent.agentKey}
                        onClick={() => { setSelectedAgent(agent); setShowAgentList(false); }}
                        className={cn(
                          "w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-[#1c2333] transition-colors text-start",
                          selectedAgent?.agentKey === agent.agentKey && "bg-[#1c2333]"
                        )}
                      >
                        <div className={cn(AGENT_COLORS[agent.agentKey] || "text-[#8b949e]")}>
                          {AGENT_ICONS[agent.agentKey] || <Bot className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-[#e1e4e8] truncate">
                            {isRTL ? agent.displayNameAr : agent.displayNameEn}
                          </div>
                        </div>
                        {agent.agentKey === "infra_sysadmin" && (
                          <span className="text-[9px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">
                            {isRTL ? "المدير" : "Director"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={() => { setShowDiagForm(!showDiagForm); setShowProjectForm(false); }} className="p-1.5 text-[#484f58] hover:text-orange-400 hover:bg-[#1c2333] rounded-lg transition-colors" title={isRTL ? "تشخيص وإصلاح" : "Diagnose & Repair"}>
                <Stethoscope className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowProjectForm(!showProjectForm); setShowDiagForm(false); }} className="p-1.5 text-[#484f58] hover:text-green-400 hover:bg-[#1c2333] rounded-lg transition-colors" title={isRTL ? "إنشاء مشروع" : "Create Project"}>
                <FolderPlus className="w-3.5 h-3.5" />
              </button>
              <button onClick={clearSession} className="p-1.5 text-[#484f58] hover:text-red-400 hover:bg-[#1c2333] rounded-lg transition-colors" title={isRTL ? "مسح المحادثة" : "Clear"}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 text-[#484f58] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded-lg transition-colors" title={isExpanded ? (isRTL ? "تصغير" : "Minimize") : (isRTL ? "تكبير" : "Expand")}>
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => setIsOpen(false)} className="p-1.5 text-[#484f58] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded-lg transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
            onWheel={(e) => {
              if (e.deltaY < 0) userScrolledUpRef.current = true;
              else {
                const el = chatContainerRef.current;
                if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 40) userScrolledUpRef.current = false;
              }
            }}
          >
            {messages.length === 0 && selectedAgent && (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className={cn("w-12 h-12 mx-auto rounded-xl flex items-center justify-center mb-3 bg-[#161b22]", AGENT_COLORS[selectedAgent.agentKey])}>
                    {AGENT_ICONS[selectedAgent.agentKey] || <Bot className="w-6 h-6" />}
                  </div>
                  <h3 className="text-base font-semibold text-[#e1e4e8] mb-1">
                    {isRTL ? selectedAgent.displayNameAr : selectedAgent.displayNameEn}
                  </h3>
                  <p className="text-xs text-[#484f58] max-w-xs">
                    {isRTL
                      ? "اكتب أمرك وسيتم تنفيذه"
                      : "Type your command"}
                  </p>
                </div>
              </div>
            )}

            {messages.map(msg => {
              if (msg.role === "status") {
                return (
                  <div key={msg.id} className="flex items-center justify-center py-0.5">
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#161b22] border border-[#30363d]">
                      <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                      <span className="text-[10px] text-[#8b949e]">{msg.content}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={msg.id} className={cn("py-0.5", msg.role === "user" ? "text-end" : "")}>
                  <div className={cn(
                    "inline-block text-start text-sm leading-relaxed max-w-[90%]",
                    msg.role === "user"
                      ? "bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-3 py-2 text-cyan-300"
                      : "text-[#c9d1d9]"
                  )}>
                    {msg.role === "assistant" && !msg.content && loading && msg.id === messages[messages.length - 1]?.id ? (
                      <div className="flex items-center gap-2 py-1">
                        <div className="flex items-center gap-1">
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                        <span className="text-[11px] text-[#8b949e]">
                          {isRTL ? "يحلل النظام..." : "Analyzing..."}
                        </span>
                      </div>
                    ) : (
                      <FloatingMessageContent content={msg.content} />
                    )}
                    {msg.tokensUsed && (
                      <div className="text-[9px] text-[#484f58] mt-1">
                        {msg.models ? msg.models.join(" + ") : msg.model} · {msg.tokensUsed.toLocaleString()} tokens{msg.cost ? ` · $${msg.cost.toFixed(4)}` : ""}
                      </div>
                    )}
                    {msg.role === "assistant" && msg.content && !loading && contentHasProjectFiles(msg.content) && (
                      <button
                        onClick={() => handleCreateFromResponse(msg.content)}
                        disabled={creatingProject}
                        className="mt-2 flex items-center gap-2 w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-40 transition-all"
                      >
                        {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
                        {isRTL ? "📦 إنشاء هذا المشروع فعلياً" : "📦 Create this project"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {showDiagForm && (
            <div className="border-t border-[#1c2333] bg-[#161b22] p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Stethoscope className="w-4 h-4 text-orange-400" />
                <span className="text-xs font-medium text-[#e1e4e8]">{isRTL ? "تشخيص وإصلاح المشاريع" : "Diagnose & Repair Projects"}</span>
              </div>
              <input
                value={diagProjectId}
                onChange={e => setDiagProjectId(e.target.value)}
                placeholder={isRTL ? "رقم المشروع (Project ID)..." : "Project ID..."}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-orange-500/50 font-mono"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleDiagnoseProject}
                  disabled={!diagProjectId.trim() || diagLoading}
                  className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  {diagLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5" />}
                  {isRTL ? "تشخيص" : "Diagnose"}
                </button>
                <button
                  onClick={handleRetryBuild}
                  disabled={!diagProjectId.trim() || diagLoading}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {isRTL ? "إعادة البناء" : "Retry Build"}
                </button>
                <button
                  onClick={handleCheckRecentFailures}
                  disabled={diagLoading}
                  className="flex items-center gap-1.5 bg-red-600/80 hover:bg-red-500 text-white rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-40 transition-colors"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {isRTL ? "كل الأخطاء" : "All Failures"}
                </button>
              </div>
              <button
                onClick={() => setShowDiagForm(false)}
                className="w-full text-center py-1 text-xs text-[#8b949e] hover:text-[#e1e4e8] transition-colors"
              >
                {isRTL ? "إغلاق" : "Close"}
              </button>
            </div>
          )}

          {showProjectForm && (
            <div className="border-t border-[#1c2333] bg-[#161b22] p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <FolderPlus className="w-4 h-4 text-green-400" />
                <span className="text-xs font-medium text-[#e1e4e8]">{isRTL ? "إنشاء مشروع جديد" : "Create New Project"}</span>
              </div>
              <input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder={isRTL ? "اسم المشروع..." : "Project name..."}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-green-500/50"
              />
              <input
                value={projectDesc}
                onChange={e => setProjectDesc(e.target.value)}
                placeholder={isRTL ? "وصف المشروع (اختياري)..." : "Description (optional)..."}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-sm text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-green-500/50"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreateProject}
                  disabled={!projectName.trim() || creatingProject}
                  className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-40 transition-colors"
                >
                  {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
                  {isRTL ? "إنشاء" : "Create"}
                </button>
                <button
                  onClick={() => setShowProjectForm(false)}
                  className="px-3 py-2 text-sm text-[#8b949e] hover:text-[#e1e4e8] border border-[#30363d] rounded-lg hover:bg-[#1c2333] transition-colors"
                >
                  {isRTL ? "إلغاء" : "Cancel"}
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-[#1c2333] bg-[#0d1117] p-3">
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={isRTL ? "اكتب أمرك للوكيل..." : "Type your command..."}
                className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-3 py-2.5 pe-10 text-sm text-[#e1e4e8] placeholder-[#484f58] resize-none focus:outline-none focus:border-cyan-500/50 transition-colors"
                rows={2}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
              />
              {loading ? (
                <button onClick={handleStop} className="absolute end-2 bottom-2 p-1.5 bg-red-500 hover:bg-red-400 text-white rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={!prompt.trim()}
                  className="absolute end-2 bottom-2 p-1.5 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg disabled:opacity-40 transition-colors"
                >
                  <Send className={cn("w-4 h-4", isRTL && "rotate-180")} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
