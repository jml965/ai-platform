import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, LayoutTemplate, Trash2, Loader2, Coins, LogOut, CreditCard, Users, ShieldCheck, Activity, Globe, ExternalLink, Square, RefreshCw, Rocket, Bell, Palette, Home, Smartphone, Play, BarChart2, Gamepad2, FileText, Settings, BookOpen, Gift, Search, ChevronDown, Upload, UploadCloud, Download, Cpu, Wand2, Camera, ArrowRight, Check, X, Bot, FolderGit2, Plug, ChevronRight, Shield, Crown, Lock, Database, Crosshair, FlaskConical, Send, Copy, Server, Maximize2, Minimize2, MousePointer2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import type { Project, ProjectStatus as ProjectStatusType } from "@workspace/api-client-react";
import type { DeploymentResponse } from "@workspace/api-client-react";
import { 
  useListProjects, 
  useCreateProject, 
  useDeleteProject, 
  useGetTokenSummary,
  useAuthLogout,
  useGetMe,
  useListDeployments,
  useUndeployProject,
  useRedeployProject,
} from "@workspace/api-client-react";

function FigmaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 38 57" fill="none">
      <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/>
      <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 0 1-19 0z" fill="#0ACF83"/>
      <path d="M19 0v19h9.5a9.5 9.5 0 0 0 0-19H19z" fill="#FF7262"/>
      <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/>
      <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#A259FF"/>
    </svg>
  );
}

function ReplitLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 4H10V10H4V4Z" fill="#F26207"/>
      <path d="M10 4H16V10H10V4Z" fill="#F26207" fillOpacity="0.6"/>
      <path d="M4 10H10V16H4V10Z" fill="#F26207" fillOpacity="0.6"/>
      <path d="M10 10H16V16H10V10Z" fill="#F26207"/>
    </svg>
  );
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [infraChatAgent, setInfraChatAgent] = useState<SidebarInfraAgent | null>(null);
  
  const { data: projectsData, isLoading: loadingProjects, refetch } = useListProjects();
  const { data: tokenSummary } = useGetTokenSummary();
  const { data: deploymentsData, refetch: refetchDeployments } = useListDeployments();
  const { data: me } = useGetMe({ query: { queryKey: ["getMe"], retry: false } });
  const isAdmin = (me as any)?.role === "admin";
  const logout = useAuthLogout();
  const userName = (me as any)?.name || (me as any)?.displayName || (me as any)?.email?.split("@")[0] || "User";

  const [, navigate] = useLocation();
  const createProjectMut = useCreateProject();

  const handleLogout = async () => {
    await logout.mutateAsync();
    window.location.href = "/";
  };

  const handleStartProject = async (idea: string) => {
    if (!idea.trim()) return;
    try {
      const projName = idea.length > 40 ? idea.substring(0, 40) + "..." : idea;
      const result = await createProjectMut.mutateAsync({ data: { name: projName, description: idea } });
      const newProjectId = (result as any)?.id;
      if (newProjectId) {
        navigate(`/project/${newProjectId}?prompt=${encodeURIComponent(idea)}`);
      }
    } catch (err) {
      console.error("Failed to create project for idea:", err);
    }
  };

  return (
    <div className="h-screen bg-[#0e1117] text-[#e2e8f0] flex flex-col overflow-hidden">
      <header className="h-14 flex-shrink-0 border-b border-white/10 bg-[#161b22]/80 backdrop-blur-md z-40 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <LayoutTemplate className="w-4 h-4 text-primary" />
          </div>
          <h1 className="font-bold text-lg">{t.dashboard}</h1>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {tokenSummary && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-white/5">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-sm font-medium">{tokenSummary.monthTokens.toLocaleString()} {t.tokens}</span>
            </div>
          )}
          <Link href="/teams" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <Users className="w-4 h-4" />
            {t.team_management}
          </Link>
          <Link href="/qa" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <ShieldCheck className="w-4 h-4" />
            {t.qa_title}
          </Link>
          {isAdmin && (
            <Link href="/monitoring" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
              <Activity className="w-4 h-4" />
              {t.monitoring}
            </Link>
          )}
          <Link href="/billing" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <CreditCard className="w-4 h-4" />
            {t.billing}
          </Link>
          <Link href="/notifications" className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-sm text-muted-foreground hover:text-foreground hover:border-white/20 transition-all">
            <Bell className="w-4 h-4" />
            {t.notif_settings}
          </Link>
          <LanguageToggle />
          <button onClick={handleLogout} className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-lg hover:bg-destructive/10" title={t.logout}>
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <HomeSidebar t={t} lang={lang} userName={userName} isAdmin={isAdmin} onSelectInfraAgent={setInfraChatAgent} />

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-y-auto">
          <HomeHeroSection t={t} lang={lang} userName={userName} onStart={handleStartProject} isStarting={createProjectMut.isPending} />

          <main className="max-w-7xl w-full mx-auto p-6 lg:p-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
              <h2 className="text-2xl font-bold">{t.projects}</h2>
              <div className="flex items-center gap-3">
                <Link
                  href="/templates"
                  className="flex items-center gap-2 border border-white/10 hover:border-primary/30 text-foreground px-4 py-2 rounded-xl font-medium transition-all hover:-translate-y-0.5 active:translate-y-0 hover:bg-primary/5"
                >
                  <Palette className="w-4 h-4 text-primary" />
                  {t.browse_templates}
                </Link>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl font-medium shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
                >
                  <Plus className="w-4 h-4" />
                  {t.new_project}
                </button>
              </div>
            </div>

            {loadingProjects ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : projectsData?.data?.length === 0 ? (
              <div className="text-center py-20 bg-[#1c2128]/30 rounded-3xl border border-white/5 border-dashed">
                <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
                  <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-6">{t.no_projects}</p>
                <button
                  onClick={() => setIsModalOpen(true)}
                  className="text-primary font-medium hover:underline"
                >
                  + {t.new_project}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence>
                  {projectsData?.data?.map((project) => (
                    <ProjectCard key={project.id} project={project} refetch={refetch} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </main>

          {deploymentsData?.data && deploymentsData.data.length > 0 && (
            <section className="max-w-7xl w-full mx-auto px-6 lg:px-8 pb-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Globe className="w-5 h-5 text-emerald-400" />
                {t.deploy_section_title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {deploymentsData.data.map((dep) => (
                  <DeploymentCard key={dep.id} deployment={dep} refetch={refetchDeployments} />
                ))}
              </div>
            </section>
          )}
          </div>

          {infraChatAgent && (
            <InfraInlineChat
              agent={infraChatAgent}
              lang={lang}
              onClose={() => setInfraChatAgent(null)}
            />
          )}
        </div>
      </div>

      <CreateProjectModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSuccess={refetch} 
      />
    </div>
  );
}

const SIDEBAR_AGENT_ICONS: Record<string, React.ReactNode> = {
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

const SIDEBAR_AGENT_COLORS: Record<string, string> = {
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

interface SidebarInfraAgent {
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

function InfraInlineChat({ agent, lang, onClose }: { agent: SidebarInfraAgent; lang: string; onClose: () => void }) {
  const [messages, setMessages] = useState<InfraChatMsg[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [wandMode, setWandMode] = useState(false);
  const [wandHighlight, setWandHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const userScrolledUpRef = useRef(false);
  const programmaticScrollRef = useRef(false);
  const isRTL = lang === "ar";

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

    const desc = isRTL
      ? `[عصا سحرية] العنصر المحدد:\n• النوع: <${info.tag}>${info.id ? ` id="${info.id}"` : ""}\n• المسار: ${info.path}\n• النص: "${info.text}"\n• الحجم: ${info.rect.width}×${info.rect.height}px\n• الموقع: (${info.rect.x}, ${info.rect.y})\n• اللون: ${info.styles.color}\n• الخلفية: ${info.styles.backgroundColor}\n• الخط: ${info.styles.fontSize} ${info.styles.fontWeight}\n\nما التعديل المطلوب على هذا العنصر؟`
      : `[Magic Wand] Selected element:\n• Tag: <${info.tag}>${info.id ? ` id="${info.id}"` : ""}\n• Path: ${info.path}\n• Text: "${info.text}"\n• Size: ${info.rect.width}×${info.rect.height}px\n• Position: (${info.rect.x}, ${info.rect.y})\n• Color: ${info.styles.color}\n• Background: ${info.styles.backgroundColor}\n• Font: ${info.styles.fontSize} ${info.styles.fontWeight}\n\nWhat change do you want on this element?`;

    setPrompt(desc);
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

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    const currentPrompt = prompt;
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

  const agentColor = SIDEBAR_AGENT_COLORS[agent.agentKey] || "text-[#8b949e]";
  const agentIcon = SIDEBAR_AGENT_ICONS[agent.agentKey] || <Bot className="w-4 h-4" />;

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

  return (
    <div
      data-infra-chat="true"
      className={`bg-[#0d1117] border-s border-[#1c2333] flex flex-col transition-all duration-300 flex-shrink-0 h-full ${
        expanded ? "w-[500px]" : "w-[340px]"
      }`}
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
          onClick={() => { setMessages([]); }}
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

      <div className="border-t border-[#1c2333] px-3 py-2 flex-shrink-0">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={isRTL ? "اكتب أمرك..." : "Type command..."}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-4 py-2.5 pe-12 text-[13px] text-[#e1e4e8] placeholder-[#484f58] resize-none focus:outline-none focus:border-cyan-500/50 transition-colors"
            rows={prompt.includes("\n") ? 4 : 1}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
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

function InfraAgentsSection({ t, lang, onSelectAgent }: { t: any; lang: string; onSelectAgent: (agent: SidebarInfraAgent) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [agents, setAgents] = useState<SidebarInfraAgent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const isRTL = lang === "ar";

  useEffect(() => {
    if (expanded && !loaded) {
      fetch("/api/infra/agents", { credentials: "include" })
        .then(r => r.ok ? r.json() : [])
        .then(data => { if (Array.isArray(data)) { setAgents(data); setLoaded(true); } })
        .catch(() => {});
    }
  }, [expanded, loaded]);

  const director = agents.find(a => a.agentKey === "infra_sysadmin");
  const others = agents.filter(a => a.agentKey !== "infra_sysadmin");

  return (
    <div className="border-b border-white/7 pb-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-md hover:bg-white/5 transition-colors group"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-[12.5px] font-semibold text-cyan-400">
            {t.home_nav_infrastructure}
          </span>
        </div>
        <ChevronDown className={`w-3 h-3 text-[#8b949e] transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} />
      </button>

      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${expanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="px-1 pb-1 space-y-0.5">
          {!loaded && expanded && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-[#484f58]" />
            </div>
          )}

          {director && (
            <>
              <button
                onClick={() => onSelectAgent(director)}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/20 hover:border-yellow-500/40 transition-all text-start"
              >
                <Crown className="w-4 h-4 text-yellow-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] font-bold text-yellow-300 truncate">
                    {isRTL ? director.displayNameAr : director.displayNameEn}
                  </div>
                  <div className="text-[9px] text-yellow-500/60 truncate">models + governor</div>
                </div>
                <Settings className="w-3 h-3 text-yellow-500/30 flex-shrink-0" />
              </button>
              <div className="border-t border-white/5 my-0.5" />
            </>
          )}

          {others.map(agent => (
            <button
              key={agent.agentKey}
              onClick={() => onSelectAgent(agent)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-[#161b22] transition-all text-start group/agent"
            >
              <div className={`flex-shrink-0 ${SIDEBAR_AGENT_COLORS[agent.agentKey] || "text-[#8b949e]"}`}>
                {SIDEBAR_AGENT_ICONS[agent.agentKey] || <Bot className="w-4 h-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-medium text-[#c9d1d9] truncate">
                  {isRTL ? agent.displayNameAr : agent.displayNameEn}
                </div>
                <div className="text-[9px] text-[#484f58] truncate">
                  {agent.primaryModel?.model?.split("-").slice(0, 2).join("-") || ""}
                </div>
              </div>
              <Settings className="w-3 h-3 text-[#484f58]/0 group-hover/agent:text-[#484f58] flex-shrink-0 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminPanelSection({ t }: { t: any }) {
  const [expanded, setExpanded] = useState(true);
  const adminItems = [
    { icon: Bot, label: t.home_nav_agents, href: "/agents" },
    { icon: Cpu, label: t.home_nav_control_center, href: "/control-center" },
    { icon: Shield, label: t.home_nav_admin_dashboard, href: "/admin" },
    { icon: FolderGit2, label: t.home_nav_repository, href: "#" },
    { icon: Plug, label: t.home_nav_integration, href: "#" },
  ];

  return (
    <div className="mt-3 border-t border-white/7 pt-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
      >
        <span>{t.home_nav_admin_panel}</span>
        <ChevronRight
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      {expanded && (
        <div className="flex flex-col gap-0.5 mt-1">
          {adminItems.map((item: any, i: number) => (
            <Link
              key={i}
              href={item.href}
              className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-[12.5px] text-[#8b949e] hover:bg-white/5 transition-colors"
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function HomeSidebar({ t, lang, userName, isAdmin, onSelectInfraAgent }: { t: any; lang: string; userName: string; isAdmin: boolean; onSelectInfraAgent: (agent: SidebarInfraAgent) => void }) {
  const navItems = [
    { icon: Home, label: t.home_nav_home, active: true },
    { icon: LayoutTemplate, label: t.home_nav_apps },
    { icon: Globe, label: t.home_nav_published },
    { icon: Settings, label: t.home_nav_settings },
  ];

  return (
    <div className="hidden lg:flex flex-col w-[200px] min-w-[200px] bg-[#161b22] border-r border-white/7 rtl:border-r-0 rtl:border-l">
      <div className="flex items-center justify-between p-3 border-b border-white/7">
        <div className="flex items-center gap-2">
          <ReplitLogo />
          <ChevronDown className="w-3 h-3 text-[#8b949e]" />
        </div>
        <button className="text-[#8b949e] hover:text-white transition-colors">
          <Search className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2 mx-2 mt-2 p-2 rounded-md bg-white/5 cursor-pointer hover:bg-white/8 transition-colors">
        <div className="w-5 h-5 rounded-full bg-[#2d7dd2] flex items-center justify-center text-[10px] font-semibold text-white flex-shrink-0">
          {userName.charAt(0).toUpperCase()}
        </div>
        <span className="text-[12.5px] text-[#c9d1d9] font-medium flex-1 truncate">
          {t.home_workspace.replace("{name}", userName)}
        </span>
        <ChevronDown className="w-3 h-3 text-[#8b949e] flex-shrink-0" />
      </div>

      <div className="p-2 flex flex-col gap-1">
        <button className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[12px] font-medium text-[#c9d1d9] bg-white/7 border border-white/10 hover:bg-white/10 transition-colors text-start">
          <Plus className="w-3.5 h-3.5 text-[#8b949e]" />
          {t.home_create_app}
        </button>
        <button className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-[12px] text-[#8b949e] border border-white/7 hover:bg-white/5 transition-colors text-start">
          <Upload className="w-3.5 h-3.5" />
          {t.home_import_code}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5 px-2 py-3 flex-1 overflow-y-auto">
        {isAdmin && <InfraAgentsSection t={t} lang={lang} onSelectAgent={onSelectInfraAgent} />}

        {navItems.map((item, i) => (
          <div
            key={i}
            className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-[12.5px] transition-colors ${
              item.active
                ? "bg-white/8 text-[#e2e8f0]"
                : "text-[#8b949e] hover:bg-white/5"
            }`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </div>
        ))}

        <div className="mt-2 border-t border-white/7 pt-2">
          <Link
            href="/strategic"
            className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-[12.5px] text-amber-400/80 hover:bg-amber-500/10 hover:text-amber-400 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.4V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.6c2.9-1.1 5-4 5-7.4a8 8 0 0 0-8-8z"/><line x1="9" y1="22" x2="15" y2="22"/></svg>
            <span>{t.strategic_agent}</span>
          </Link>
        </div>

        {isAdmin && <AdminPanelSection t={t} />}
      </nav>

      <div className="border-t border-white/7 p-2">
        {[
          { icon: BookOpen, label: t.home_learn },
          { icon: FileText, label: t.home_documentation },
        ].map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer text-[12.5px] text-[#8b949e] hover:bg-white/5 transition-colors"
          >
            <item.icon className="w-3.5 h-3.5" />
            <span>{item.label}</span>
          </div>
        ))}
        <button className="flex items-center justify-center gap-2 w-[calc(100%-8px)] mx-1 mt-1 py-1.5 rounded-md text-[12px] text-[#c9d1d9] bg-white/5 border border-white/10 hover:bg-white/8 transition-colors">
          <Gift className="w-3 h-3" />
          {t.home_refer_earn}
        </button>
      </div>
    </div>
  );
}

function HomeHeroSection({ t, lang, userName, onStart, isStarting }: { t: any; lang: string; userName: string; onStart: (idea: string) => void; isStarting: boolean }) {
  const [activeTab, setActiveTab] = useState("app");
  const [textValue, setTextValue] = useState("");
  const [showWebAppDropdown, setShowWebAppDropdown] = useState(false);
  const [showBuildDropdown, setShowBuildDropdown] = useState(false);
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);
  const [selectedApp, setSelectedApp] = useState(t.home_web_app);
  const [selectedBuildMode, setSelectedBuildMode] = useState(t.home_build);

  const closeAll = () => {
    setShowWebAppDropdown(false);
    setShowBuildDropdown(false);
    setShowPlusDropdown(false);
  };

  const webAppOptions = [
    { label: t.home_web_app, icon: Globe },
    { label: t.home_mobile_app, icon: Smartphone },
    { label: t.home_animation, icon: Play, isNew: true },
    { label: t.home_data_app, icon: BarChart2 },
    { label: t.home_3d_game, icon: Gamepad2 },
    { label: t.home_automation, icon: RefreshCw },
    { label: t.home_from_scratch, icon: FileText },
  ];

  const buildOptions = [
    { label: t.home_build_immediately, mode: t.home_build, icon: Cpu },
    { label: t.home_plan_before, mode: t.home_plan, icon: FileText },
  ];

  const currentAppOption = webAppOptions.find(o => o.label === selectedApp) || webAppOptions[0];

  return (
    <div
      className="relative flex flex-col items-center justify-center py-16 px-4 overflow-hidden"
      onClick={closeAll}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(ellipse 60% 40% at 50% 30%, rgba(45,125,210,0.08) 0%, transparent 70%)"
      }} />

      <div className="flex flex-col items-center w-full max-w-[560px] relative z-10">
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5 mb-5 cursor-pointer bg-white/5 border border-white/10 hover:bg-white/8 transition-colors">
          <div className="w-[18px] h-[18px] rounded-full bg-[#2d7dd2] flex items-center justify-center text-[9px] font-semibold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          <span className="text-[13px] text-[#c9d1d9] font-medium">
            {t.home_workspace.replace("{name}", userName)}
          </span>
          <ChevronDown className="w-3 h-3 text-[#8b949e]" />
        </div>

        <h1 className="text-[28px] font-bold text-white tracking-tight text-center mb-6">
          {t.home_greeting.replace("{name}", userName)}
        </h1>

        <div className="w-full rounded-xl overflow-visible relative bg-[#1c2128] border border-[rgba(88,166,255,0.4)]" style={{
          boxShadow: "0 0 0 1px rgba(88,166,255,0.15), 0 4px 24px rgba(0,0,0,0.4)"
        }}>
          <div className="flex border-b border-white/7">
            {[
              { key: "app", label: t.home_tab_app, icon: Cpu },
              { key: "design", label: t.home_tab_design, icon: Wand2 },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={e => { e.stopPropagation(); setActiveTab(tab.key); }}
                className={`flex items-center gap-2 px-5 py-2.5 text-[13px] border-b-2 -mb-px transition-colors ${
                  activeTab === tab.key
                    ? "border-[#58a6ff] text-[#e2e8f0] font-medium"
                    : "border-transparent text-[#8b949e] hover:text-[#c9d1d9]"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          <textarea
            placeholder={t.home_placeholder}
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            onClick={e => e.stopPropagation()}
            className="w-full h-[110px] resize-none bg-transparent px-4 py-3 text-[13.5px] text-[#c9d1d9] placeholder-[#6e7681] outline-none"
            style={{ caretColor: "#58a6ff" }}
          />

          <div className="flex items-center justify-between px-3 py-1.5 border-t border-white/7">
            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setShowBuildDropdown(v => !v); setShowWebAppDropdown(false); setShowPlusDropdown(false); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] text-[#c9d1d9] bg-white/5 border border-white/10 hover:bg-white/8 transition-colors"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {selectedBuildMode}
                  <ChevronDown className="w-3 h-3 text-[#8b949e]" />
                </button>

                {showBuildDropdown && (
                  <div
                    className="absolute bottom-[calc(100%+8px)] start-0 min-w-[270px] rounded-xl bg-[#1e2228] border border-white/12 z-50"
                    style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.85)" }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-3.5 py-2 border-b border-white/7">
                      <span className="text-[11px] text-[#6e7681]">
                        {t.home_switch_modes}&nbsp;
                        <kbd className="bg-white/8 border border-white/15 rounded px-1.5 py-0.5 text-[11px] text-[#8b949e] font-mono">I</kbd>
                        &nbsp;
                        <kbd className="bg-white/8 border border-white/15 rounded px-1.5 py-0.5 text-[11px] text-[#8b949e] font-mono">&#8984;</kbd>
                      </span>
                    </div>
                    {buildOptions.map(opt => (
                      <div
                        key={opt.mode}
                        onClick={() => { setSelectedBuildMode(opt.mode); setShowBuildDropdown(false); }}
                        className="flex items-center gap-2.5 px-3.5 py-2.5 cursor-pointer text-[13px] text-[#c9d1d9] hover:bg-white/7 transition-colors"
                      >
                        {selectedBuildMode === opt.mode
                          ? <Check className="w-3.5 h-3.5 text-[#58a6ff]" />
                          : <span className="w-3.5" />}
                        <span className="flex-1">{opt.label}</span>
                        <span className="text-[#8b949e] font-semibold text-[12px]">{opt.mode}</span>
                        <opt.icon className="w-3.5 h-3.5 text-[#6e7681]" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setShowPlusDropdown(v => !v); setShowBuildDropdown(false); setShowWebAppDropdown(false); }}
                  className={`flex items-center justify-center w-[30px] h-[30px] rounded-md border border-white/10 text-[#8b949e] transition-colors ${
                    showPlusDropdown ? "bg-white/10" : "bg-white/4 hover:bg-white/8"
                  }`}
                >
                  <Plus className="w-4 h-4" />
                </button>

                {showPlusDropdown && (
                  <div
                    className="absolute bottom-[calc(100%+8px)] start-0 min-w-[240px] rounded-xl bg-[#1e2228] border border-white/12 z-50"
                    style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.85)" }}
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="px-4 pt-2.5 pb-1 text-[11px] text-[#6e7681] font-medium tracking-wide">
                      {t.home_add_attachments}
                    </div>
                    <div className="flex items-center justify-between px-4 py-2 cursor-pointer text-[14px] text-white font-medium hover:bg-white/7 transition-colors">
                      <span>{t.home_upload_file}</span>
                      <div className="w-7 h-7 rounded-md bg-white/7 border border-white/10 flex items-center justify-center">
                        <UploadCloud className="w-3.5 h-3.5 text-[#8b949e]" />
                      </div>
                    </div>

                    <div className="h-px bg-white/7 mx-0 my-1" />

                    <div className="px-4 pt-2 pb-1 text-[11px] text-[#6e7681] font-medium tracking-wide">
                      {t.home_add_starting_point}
                    </div>
                    <div className="flex items-center justify-between px-4 py-2 cursor-pointer text-[14px] text-white font-medium hover:bg-white/7 transition-colors">
                      <span>{t.home_import_figma}</span>
                      <FigmaIcon />
                    </div>
                    <div className="flex items-center justify-between px-4 py-2 pb-3 cursor-pointer text-[14px] text-white font-medium hover:bg-white/7 transition-colors">
                      <div className="flex items-center gap-2">
                        <ExternalLink className="w-3.5 h-3.5 text-[#8b949e]" />
                        <span>{t.home_import_project}</span>
                      </div>
                      <div className="w-7 h-7 rounded-md bg-white/7 border border-white/10 flex items-center justify-center">
                        <Download className="w-3.5 h-3.5 text-[#8b949e]" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-md text-[#8b949e] bg-white/4 border border-white/8 hover:bg-white/8 transition-colors">
                <Camera className="w-3.5 h-3.5" />
                <ChevronDown className="w-3 h-3" />
              </button>
              <button
                onClick={e => { e.stopPropagation(); if (textValue.trim()) onStart(textValue.trim()); }}
                disabled={!textValue.trim() || isStarting}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-[12.5px] font-medium transition-all ${
                  textValue.trim() && !isStarting
                    ? "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/20"
                    : "text-[#8b949e] hover:text-white"
                }`}
              >
                {isStarting ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> {t.creating}</>
                ) : (
                  <>{t.home_start} <ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setShowWebAppDropdown(v => !v); setShowBuildDropdown(false); setShowPlusDropdown(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-[#8b949e] bg-white/5 border border-white/10 hover:bg-white/8 cursor-pointer transition-colors"
            >
              <currentAppOption.icon className="w-3.5 h-3.5" />
              <span>{selectedApp}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showWebAppDropdown && (
              <div
                className="absolute bottom-[calc(100%+8px)] start-0 min-w-[230px] rounded-xl bg-[#1e2228] border border-white/12 py-1.5 z-50"
                style={{ boxShadow: "0 16px 48px rgba(0,0,0,0.85)" }}
                onClick={e => e.stopPropagation()}
              >
                {webAppOptions.map(opt => (
                  <div
                    key={opt.label}
                    onClick={() => { setSelectedApp(opt.label); setShowWebAppDropdown(false); }}
                    className={`flex items-center justify-between px-4 py-2.5 cursor-pointer text-[14px] hover:bg-white/7 transition-colors ${
                      selectedApp === opt.label ? "text-[#e2e8f0]" : "text-[#8b949e]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {selectedApp === opt.label
                        ? <Check className="w-3.5 h-3.5 text-[#58a6ff]" />
                        : <span className="w-3.5" />}
                      {opt.isNew && (
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold bg-[#2d7dd2] text-white">
                          {t.home_new_badge}
                        </span>
                      )}
                      <span className="font-medium">{opt.label}</span>
                    </div>
                    <opt.icon className="w-4 h-4 text-[#6e7681]" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] text-[#8b949e] bg-white/5 border border-white/10 hover:bg-white/8 cursor-pointer transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{t.home_auto}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project, refetch }: { project: Project, refetch: () => void }) {
  const { t } = useI18n();
  const deleteMut = useDeleteProject();

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(t.confirm_delete)) {
      await deleteMut.mutateAsync({ projectId: project.id });
      refetch();
    }
  };

  const statusColors = {
    draft: "bg-secondary text-secondary-foreground",
    building: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    ready: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    failed: "bg-destructive/20 text-destructive-foreground border-destructive/30"
  };

  const statusKey = `status_${project.status}` as keyof typeof t;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -4 }}
      className="group bg-[#1c2128] border border-white/10 rounded-2xl p-5 hover:shadow-xl hover:shadow-black/50 hover:border-primary/30 transition-all duration-300 relative flex flex-col"
    >
      <div className="flex justify-between items-start mb-4">
        <h3 className="font-semibold text-lg line-clamp-1 group-hover:text-primary transition-colors">
          {project.name}
        </h3>
        <button 
          onClick={handleDelete}
          className="p-1.5 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <p className="text-sm text-muted-foreground line-clamp-2 mb-6 flex-1">
        {project.description || "—"}
      </p>

      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
        <div className={`px-2.5 py-1 rounded-md text-xs font-medium border ${statusColors[project.status as keyof typeof statusColors] || statusColors.draft}`}>
          {t[statusKey] || project.status}
        </div>
        <Link 
          href={`/project/${project.id}`}
          className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
        >
          {t.view}
        </Link>
      </div>
    </motion.div>
  );
}

function CreateProjectModal({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const createMut = useCreateProject();

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await createMut.mutateAsync({ data: { name, description } });
      setName("");
      setDescription("");
      onSuccess();
      onClose();
    } catch (error) {
      console.error("Failed to create project", error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[#1c2128] border border-white/10 shadow-2xl rounded-2xl p-6 w-full max-w-md"
      >
        <h2 className="text-xl font-bold mb-4">{t.new_project}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t.project_name}</label>
            <input 
              autoFocus
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0e1117] border border-white/10 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{t.project_desc}</label>
            <textarea 
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#0e1117] border border-white/10 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none h-24"
            />
          </div>
          <div className="flex gap-3 pt-2 justify-end">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
            >
              {t.cancel}
            </button>
            <button 
              type="submit"
              disabled={createMut.isPending || !name.trim()}
              className="bg-primary text-primary-foreground px-6 py-2 rounded-xl font-medium shadow-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {createMut.isPending ? t.creating : t.create}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function DeploymentCard({ deployment, refetch }: { deployment: DeploymentResponse, refetch: () => void }) {
  const { t } = useI18n();
  const undeployMut = useUndeployProject();
  const redeployMut = useRedeployProject();

  const handleUndeploy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(t.deploy_confirm_undeploy)) {
      await undeployMut.mutateAsync({ projectId: deployment.projectId });
      refetch();
    }
  };

  const handleRedeploy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await redeployMut.mutateAsync({ projectId: deployment.projectId });
    refetch();
  };

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    deploying: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    stopped: "bg-secondary text-secondary-foreground border-white/10",
    failed: "bg-destructive/20 text-destructive-foreground border-destructive/30",
  };

  const statusLabel = t[`deploy_status_${deployment.status}` as keyof typeof t] || deployment.status;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#1c2128] border border-white/10 rounded-xl p-4 hover:border-emerald-500/30 transition-all"
    >
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-sm truncate flex-1">
          {deployment.projectName || deployment.subdomain}
        </h3>
        <div className={`px-2 py-0.5 rounded text-[10px] font-medium border ${statusColors[deployment.status] || statusColors.stopped}`}>
          {statusLabel}
        </div>
      </div>

      {deployment.url && (
        <a
          href={deployment.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-primary hover:underline mb-2 truncate"
        >
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
          {deployment.url}
        </a>
      )}

      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-3">
        <span>v{deployment.version}</span>
        {deployment.lastDeployedAt && (
          <span>{format(new Date(deployment.lastDeployedAt), 'yyyy-MM-dd HH:mm')}</span>
        )}
      </div>

      <div className="flex gap-2 pt-2 border-t border-white/5">
        {deployment.status === "active" && (
          <>
            <button
              onClick={handleRedeploy}
              disabled={redeployMut.isPending}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
            >
              {redeployMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {t.redeploy}
            </button>
            <button
              onClick={handleUndeploy}
              disabled={undeployMut.isPending}
              className="flex items-center gap-1 px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 rounded transition-colors disabled:opacity-50"
            >
              {undeployMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
              {t.undeploy}
            </button>
          </>
        )}
        {(deployment.status === "stopped" || deployment.status === "failed") && (
          <button
            onClick={handleRedeploy}
            disabled={redeployMut.isPending}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-primary hover:bg-primary/10 rounded transition-colors disabled:opacity-50"
          >
            {redeployMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
            {t.deploy_btn}
          </button>
        )}
        <Link
          href={`/project/${deployment.projectId}`}
          className="flex items-center gap-1 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground ms-auto"
        >
          {t.view}
        </Link>
      </div>
    </motion.div>
  );
}
