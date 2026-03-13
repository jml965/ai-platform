import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, Code2, Eye,
  FileCode2, User, Bot, Search, ChevronRight, ChevronDown,
  FileText, FileJson, FileImage, File, Folder, ArrowLeft, Clock,
  RotateCw, Monitor, Smartphone, Tablet, Laptop, ChevronLeft,
  Terminal as TerminalIcon, Rocket, ExternalLink, Square, RefreshCw, Globe, Archive, BarChart3,
  Smartphone as SmartphoneIcon
} from "lucide-react";
import { format } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { cn } from "@/lib/utils";
import type { ExecutionLog, ProjectFile } from "@workspace/api-client-react";
import {
  useGetProject,
  useStartBuild,
  useGetBuildStatus,
  useGetBuildLogs,
  useListProjectFiles,
  useGetTokenSummary,
  useDeployProject,
  useGetDeploymentStatus,
  useUndeployProject,
  useRedeployProject,
} from "@workspace/api-client-react";
import BuildTerminal from "@/components/builder/Terminal";
import BuildProgress, { inferPhase } from "@/components/builder/BuildProgress";
import CodeEditor from "@/components/builder/CodeEditor";
import ProjectPlan from "@/components/builder/ProjectPlan";
import DomainSettings from "@/components/builder/DomainSettings";
import SnapshotsPanel from "@/components/builder/SnapshotsPanel";
import PwaSettingsPanel from "@/components/builder/PwaSettings";
import { useUpdateFile } from "@/hooks/useUpdateFile";
import "@/components/builder/prism-theme.css";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  buildId?: string;
  timestamp: Date;
  plan?: { title: string; description?: string; status?: "pending" | "done" | "active" }[];
}

export default function Builder() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`chat_${id}`);
    if (saved) {
      try {
        return JSON.parse(saved).map((m: ChatMessage) => ({ ...m, timestamp: new Date(m.timestamp) }));
      } catch { return []; }
    }
    return [];
  });
  const [activeBuildId, setActiveBuildId] = useState<string | null>(() => {
    return localStorage.getItem(`latestBuild_${id}`);
  });
  const [centerTab, setCenterTab] = useState<"canvas" | "code" | "domains">("canvas");
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState("responsive");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showTerminal, setShowTerminal] = useState(true);
  const [planApproved, setPlanApproved] = useState(false);
  const [rightTab, setRightTab] = useState<"library" | "snapshots">("library");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [showDeployPanel, setShowDeployPanel] = useState(false);
  const [showPwaPanel, setShowPwaPanel] = useState(false);

  const { data: project } = useGetProject(id || "");
  const { data: tokenSummary } = useGetTokenSummary();
  const startBuildMut = useStartBuild();
  const updateFileMut = useUpdateFile();
  const deployMut = useDeployProject();
  const undeployMut = useUndeployProject();
  const redeployMut = useRedeployProject();

  const { data: deploymentStatus, refetch: refetchDeployment } = useGetDeploymentStatus(id || "", {
    query: {
      queryKey: ["getDeploymentStatus", id || ""],
      enabled: !!id,
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const status = query.state.data?.status;
        return status === "deploying" ? 2000 : false;
      },
      retry: false,
    }
  });

  const { data: buildStatus } = useGetBuildStatus(activeBuildId || "", {
    query: {
      queryKey: ["getBuildStatus", activeBuildId || ""],
      enabled: !!activeBuildId,
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const status = query.state.data?.status;
        const isTerminal = status === "completed" || status === "failed" || status === "cancelled";
        return isTerminal ? false : 3000;
      }
    }
  });

  const { data: buildLogs } = useGetBuildLogs(activeBuildId || "", {
    query: {
      queryKey: ["getBuildLogs", activeBuildId || ""],
      enabled: !!activeBuildId,
      refetchInterval: () => {
        const isTerminal = buildStatus?.status === "completed" || buildStatus?.status === "failed" || buildStatus?.status === "cancelled";
        return isTerminal ? false : 3000;
      }
    }
  });

  const { data: projectFiles } = useListProjectFiles(id || "", {
    query: {
      queryKey: ["listProjectFiles", id || ""],
      enabled: !!id,
      refetchInterval: buildStatus?.status === "completed" ? false : 5000
    }
  });

  useEffect(() => {
    if (id && messages.length > 0) {
      localStorage.setItem(`chat_${id}`, JSON.stringify(messages));
    }
  }, [messages, id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (buildStatus?.status === "completed" && activeBuildId) {
      const alreadyReplied = messages.some(m => m.buildId === activeBuildId && m.role === "assistant");
      if (!alreadyReplied) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t.preview_ready,
          buildId: activeBuildId,
          timestamp: new Date(),
        }]);
      }
    } else if (buildStatus?.status === "failed" && activeBuildId) {
      const alreadyReplied = messages.some(m => m.buildId === activeBuildId && m.role === "assistant");
      if (!alreadyReplied) {
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: t.status_failed,
          buildId: activeBuildId,
          timestamp: new Date(),
        }]);
      }
    }
  }, [buildStatus?.status, activeBuildId]);

  const handleGenerate = async () => {
    if (!prompt.trim() || !id) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: prompt,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    const currentPrompt = prompt;
    setPrompt("");

    try {
      const res = await startBuildMut.mutateAsync({
        data: { projectId: id, prompt: currentPrompt }
      });
      setActiveBuildId(res.buildId);
      localStorage.setItem(`latestBuild_${id}`, res.buildId);
      setPlanApproved(false);

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: t.agents_working,
        buildId: res.buildId,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: t.unknown_error,
        timestamp: new Date(),
      }]);
    }
  };

  const handleDeploy = async () => {
    if (!id) return;
    try {
      await deployMut.mutateAsync({ data: { projectId: id } });
      refetchDeployment();
    } catch (err) {
      console.error("Deploy failed:", err);
    }
  };

  const handleUndeploy = async () => {
    if (!id || !confirm(t.deploy_confirm_undeploy)) return;
    try {
      await undeployMut.mutateAsync({ projectId: id });
      refetchDeployment();
    } catch (err) {
      console.error("Undeploy failed:", err);
    }
  };

  const handleRedeploy = async () => {
    if (!id) return;
    try {
      await redeployMut.mutateAsync({ projectId: id });
      refetchDeployment();
    } catch (err) {
      console.error("Redeploy failed:", err);
    }
  };

  const isBuilding = buildStatus?.status === "pending" || buildStatus?.status === "in_progress" || startBuildMut.isPending;

  const logs = buildLogs?.data || [];
  const actionCount = logs.length;
  const isDeploying = deployMut.isPending || redeployMut.isPending || deploymentStatus?.status === "deploying";
  const isDeployed = deploymentStatus?.status === "active";
  const canDeploy = project?.status === "ready" && !isBuilding;
  const files = projectFiles?.data || [];

  const htmlFile = files.find((f) => f.filePath?.endsWith('.html'));
  const hasPreview = !!htmlFile?.content;

  const currentPhase = inferPhase(buildStatus?.status, logs);
  const phaseFailed = buildStatus?.status === "failed";

  const serverUrl = useMemo(() => {
    if (!id || !buildStatus) return null;
    if (buildStatus.status === "completed") {
      const serverLog = logs.find(l =>
        l.action.toLowerCase().includes("server") &&
        l.details &&
        typeof l.details === "object" &&
        "url" in l.details
      );
      if (serverLog?.details && "url" in serverLog.details) {
        const url = serverLog.details.url as string;
        try {
          const parsed = new URL(url);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            return url;
          }
        } catch {}
      }
    }
    return null;
  }, [id, buildStatus?.status, logs]);

  const previewUrl = serverUrl || null;

  const buildPreviewHtml = (): string => {
    if (!htmlFile?.content) return "";
    return files.reduce((html: string, f) => {
      if (f.filePath?.endsWith('.css') && f.content) {
        html = html.replace('</head>', `<style>${f.content}</style></head>`);
      }
      if (f.filePath?.endsWith('.js') && f.content) {
        html = html.replace('</body>', `<script>${f.content}<\/script></body>`);
      }
      return html;
    }, htmlFile.content);
  };

  const parseInlineMarkdown = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
    let lastIndex = 0;
    let match;
    let partKey = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }
      const m = match[0];
      if (m.startsWith('**') && m.endsWith('**')) {
        parts.push(<strong key={partKey++} className="text-[#58a6ff] font-semibold">{m.slice(2, -2)}</strong>);
      } else if (m.startsWith('*') && m.endsWith('*')) {
        parts.push(<em key={partKey++} className="text-[#d2a8ff]">{m.slice(1, -1)}</em>);
      } else if (m.startsWith('`') && m.endsWith('`')) {
        parts.push(<code key={partKey++} className="bg-white/10 px-1 py-0.5 rounded text-xs font-mono">{m.slice(1, -1)}</code>);
      }
      lastIndex = match.index + m.length;
    }
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }
    return parts;
  };

  const renderMarkdown = (text: string): React.ReactNode[] => {
    const lines = text.split('\n');
    return lines.map((line, lineIdx) => {
      const bulletMatch = line.match(/^[-•]\s+(.*)$/);
      if (bulletMatch) {
        const bulletContent = bulletMatch[1];
        return <li key={lineIdx} className="ml-4 list-disc text-[13px]">{parseInlineMarkdown(bulletContent)}</li>;
      }
      return (
        <React.Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {parseInlineMarkdown(line)}
        </React.Fragment>
      );
    });
  };

  const DEVICES = [
    { id: "responsive", label: t.device_responsive, Icon: Monitor, width: null, height: null, group: null },
    { id: "iphone17", label: t.device_iphone17, Icon: Smartphone, width: 393, height: 852, group: "phone" },
    { id: "iphone14", label: t.device_iphone14, Icon: Smartphone, width: 390, height: 844, group: "phone" },
    { id: "iphonese", label: t.device_iphonese, Icon: Smartphone, width: 375, height: 667, group: "phone" },
    { id: "samsung_s25", label: t.device_samsung_s25, Icon: Smartphone, width: 412, height: 915, group: "phone" },
    { id: "ipad_pro", label: t.device_ipad_pro, Icon: Tablet, width: 1024, height: 1366, group: "tablet" },
    { id: "ipad_air", label: t.device_ipad_air, Icon: Tablet, width: 820, height: 1180, group: "tablet" },
    { id: "samsung_tab", label: t.device_samsung_tab, Icon: Tablet, width: 800, height: 1280, group: "tablet" },
    { id: "laptop", label: t.device_laptop, Icon: Laptop, width: 1280, height: 800, group: "desktop" },
    { id: "desktop", label: t.device_desktop, Icon: Monitor, width: 1440, height: 900, group: "desktop" },
    { id: "fullhd", label: t.device_fullhd, Icon: Monitor, width: 1920, height: 1080, group: "desktop" },
  ];

  const currentDevice = DEVICES.find(d => d.id === selectedDevice) ?? DEVICES[0];

  const handleRefresh = () => {
    if (!iframeRef.current) return;
    setIsRefreshing(true);
    const iframe = iframeRef.current;
    const src = iframe.src;
    if (src && src !== "about:blank") {
      iframe.src = "";
      setTimeout(() => { iframe.src = src; }, 50);
    } else {
      const content = iframe.srcdoc;
      iframe.srcdoc = "";
      setTimeout(() => { iframe.srcdoc = content; }, 50);
    }
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleNavBack = () => {
    try { iframeRef.current?.contentWindow?.history.back(); } catch {}
  };

  const handleNavForward = () => {
    try { iframeRef.current?.contentWindow?.history.forward(); } catch {}
  };

  return (
    <div className="flex h-screen bg-[#0e1525] text-[#e1e4e8] overflow-hidden">

      <div className="w-[280px] flex flex-col border-e border-[#1c2333] bg-[#0d1117] flex-shrink-0">
        <div className="px-3 py-3 border-b border-[#1c2333] flex items-center gap-2">
          <Link href="/dashboard" className="p-1.5 text-[#8b949e] hover:text-[#e1e4e8] transition-colors rounded hover:bg-[#1c2333]">
            <ArrowLeft className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-[#e1e4e8] truncate">{project?.name || t.loading}</h1>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#1f6feb]/20 text-[#58a6ff] font-medium flex items-center gap-1.5 flex-shrink-0">
            {isBuilding && <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse" />}
            {t.agent_label} • {actionCount}
          </span>
          <Link
            href={`/project/${id}/analytics`}
            className="text-[11px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 flex-shrink-0 transition-all bg-[#d2a8ff]/10 text-[#d2a8ff] hover:bg-[#d2a8ff]/20"
          >
            <BarChart3 className="w-3 h-3" />
            {t.analytics}
          </Link>
          <button
            onClick={() => { setShowPwaPanel(v => !v); setShowDeployPanel(false); }}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 flex-shrink-0 transition-all",
              showPwaPanel
                ? "bg-purple-500/20 text-purple-400"
                : "bg-[#1c2333] text-[#8b949e] hover:bg-[#30363d] hover:text-[#e1e4e8]"
            )}
          >
            <SmartphoneIcon className="w-3 h-3" />
            PWA
          </button>
          <button
            onClick={() => { setShowDeployPanel(v => !v); setShowPwaPanel(false); }}
            disabled={!canDeploy && !isDeployed && !deploymentStatus}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 flex-shrink-0 transition-all",
              isDeployed
                ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                : isDeploying
                  ? "bg-yellow-500/20 text-yellow-400"
                  : deploymentStatus?.status === "stopped"
                    ? "bg-[#484f58]/20 text-[#8b949e] hover:bg-[#484f58]/30"
                    : "bg-[#1f6feb]/20 text-[#58a6ff] hover:bg-[#1f6feb]/30 disabled:opacity-40"
            )}
          >
            {isDeploying ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : isDeployed ? (
              <Globe className="w-3 h-3" />
            ) : (
              <Rocket className="w-3 h-3" />
            )}
            {isDeploying ? t.deploying : isDeployed ? t.deploy_status_active : t.deploy}
          </button>
        </div>

        <AnimatePresence>
          {showDeployPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-[#1c2333]"
            >
              <div className="p-3 bg-[#161b22] space-y-2">
                {!canDeploy && !deploymentStatus && (
                  <p className="text-[11px] text-[#8b949e]">{t.deploy_not_ready}</p>
                )}

                {deploymentStatus && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        deploymentStatus.status === "active" ? "bg-emerald-400" :
                        deploymentStatus.status === "deploying" ? "bg-yellow-400 animate-pulse" :
                        deploymentStatus.status === "stopped" ? "bg-[#484f58]" : "bg-red-400"
                      )} />
                      <span className="text-[11px] font-medium text-[#e1e4e8]">
                        {t[`deploy_status_${deploymentStatus.status}` as keyof typeof t] || deploymentStatus.status}
                      </span>
                      <span className="text-[10px] text-[#484f58]">v{deploymentStatus.version}</span>
                    </div>

                    {deploymentStatus.url && (
                      <a
                        href={deploymentStatus.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-[11px] text-[#58a6ff] hover:underline truncate"
                      >
                        <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        {deploymentStatus.url}
                      </a>
                    )}

                    {deploymentStatus.lastDeployedAt && (
                      <p className="text-[10px] text-[#484f58]">
                        {t.deploy_last_deployed}: {format(new Date(deploymentStatus.lastDeployedAt), 'yyyy-MM-dd HH:mm')}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  {(!deploymentStatus || deploymentStatus.status === "stopped" || deploymentStatus.status === "failed") && canDeploy && (
                    <button
                      onClick={handleDeploy}
                      disabled={isDeploying}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f6feb] text-white text-[11px] font-medium rounded-md hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
                    >
                      {isDeploying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                      {isDeploying ? t.deploying : t.deploy_btn}
                    </button>
                  )}

                  {deploymentStatus?.status === "active" && (
                    <>
                      <button
                        onClick={handleRedeploy}
                        disabled={isDeploying || !canDeploy}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f6feb] text-white text-[11px] font-medium rounded-md hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
                      >
                        {redeployMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {redeployMut.isPending ? t.redeploying : t.redeploy}
                      </button>
                      <button
                        onClick={handleUndeploy}
                        disabled={undeployMut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 text-[11px] font-medium rounded-md hover:bg-red-500/30 disabled:opacity-50 transition-colors"
                      >
                        {undeployMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Square className="w-3 h-3" />}
                        {undeployMut.isPending ? t.undeploying : t.undeploy}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showPwaPanel && id && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-[#1c2333]"
            >
              <PwaSettingsPanel projectId={id} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && !startBuildMut.isPending && (
            <div className="text-center mt-16 text-[#8b949e]">
              <div className="w-12 h-12 mx-auto bg-[#1c2333] rounded-full flex items-center justify-center mb-3">
                <Code2 className="w-6 h-6 opacity-50" />
              </div>
              <p className="text-sm">{t.prompt_placeholder}</p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg, idx) => {
              const completionMsg = msg.role === "assistant" && msg.buildId
                ? messages.find(m => m.role === "assistant" && m.buildId === msg.buildId && m.id !== msg.id && (m.content === t.preview_ready || m.content === t.status_failed))
                : null;
              const isStartMsg = msg.content === t.agents_working;
              const showCheckpoint = isStartMsg && !!completionMsg;
              const elapsed = showCheckpoint && completionMsg ? Math.round((completionMsg.timestamp.getTime() - msg.timestamp.getTime()) / 1000) : null;

              return (
                <React.Fragment key={msg.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-2"
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                      msg.role === "user" ? "bg-[#1f6feb]/20 text-[#58a6ff]" : "bg-emerald-500/20 text-emerald-400"
                    )}>
                      {msg.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={cn(
                        "rounded-lg px-3 py-2 text-[13px] leading-relaxed",
                        msg.role === "user"
                          ? "bg-[#1f6feb]/10 border border-[#1f6feb]/20 text-[#e1e4e8]"
                          : "bg-[#161b22] border border-[#1c2333] text-[#c9d1d9]"
                      )}>
                        {msg.role === "assistant" ? (
                          <div className="whitespace-pre-wrap">
                            {renderMarkdown(msg.content)}
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>

                      {msg.plan && msg.plan.length > 0 && (
                        <div className="mt-2">
                          <ProjectPlan
                            steps={msg.plan}
                            isApproved={planApproved}
                            onApprove={() => setPlanApproved(true)}
                            onModify={() => {
                              setPrompt(t.plan_modify_prompt);
                            }}
                          />
                        </div>
                      )}

                      <span className="text-[10px] text-[#484f58] mt-1 block px-1">
                        {format(msg.timestamp, 'HH:mm')}
                      </span>
                    </div>
                  </motion.div>

                  {showCheckpoint && elapsed !== null && (
                    <div className="flex items-center gap-2 px-2 py-1">
                      <div className="flex-1 h-px bg-[#1c2333]" />
                      <span className="text-[10px] text-[#484f58] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {t.checkpoint} — {elapsed}{t.seconds_short} {t.time_elapsed}
                      </span>
                      <div className="flex-1 h-px bg-[#1c2333]" />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </AnimatePresence>

          {isBuilding && (
            <div className="flex gap-2">
              <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-500/20 text-emerald-400">
                <Bot className="w-3 h-3" />
              </div>
              <div className="bg-[#161b22] border border-[#1c2333] rounded-lg px-3 py-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#8b949e]" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-[#1c2333] bg-[#0d1117]">
          <div className="flex items-center justify-between mb-2">
            <LanguageToggle className="!bg-[#161b22] !text-[#8b949e] hover:!bg-[#1c2333] !px-2 !py-1 !text-xs !rounded-md" />
          </div>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t.prompt_placeholder}
              disabled={isBuilding}
              className="w-full bg-[#161b22] border border-[#30363d] rounded-lg p-3 pe-10 resize-none h-20 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/50 disabled:opacity-50 transition-all text-sm text-[#e1e4e8] placeholder-[#484f58]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
            <button
              onClick={handleGenerate}
              disabled={isBuilding || !prompt.trim()}
              className="absolute end-2 bottom-2 p-1.5 bg-[#1f6feb] text-white rounded-md hover:bg-[#388bfd] disabled:opacity-40 disabled:hover:bg-[#1f6feb] transition-colors"
            >
              {isBuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col border-e border-[#1c2333] min-w-0">
        <BuildProgress currentPhase={currentPhase} failed={phaseFailed} allComplete={buildStatus?.status === "completed"} />

        <div className="h-9 flex items-center border-b border-[#1c2333] bg-[#161b22] px-1 flex-shrink-0">
          <button
            onClick={() => setCenterTab("canvas")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              centerTab === "canvas"
                ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
            )}
          >
            <Eye className="w-3.5 h-3.5" />
            {t.canvas_tab}
          </button>
          <button
            onClick={() => setCenterTab("code")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              centerTab === "code"
                ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
            )}
          >
            <Code2 className="w-3.5 h-3.5" />
            {t.code_tab}
          </button>
          <button
            onClick={() => setCenterTab("domains")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5",
              centerTab === "domains"
                ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
            )}
          >
            <Globe className="w-3.5 h-3.5" />
            {t.domain_settings}
          </button>

          <div className="flex-1" />

          <button
            onClick={() => setShowTerminal(v => !v)}
            className={cn(
              "px-2 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1.5 me-1",
              showTerminal
                ? "bg-[#0d1117] text-[#e1e4e8]"
                : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
            )}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            {t.terminal}
          </button>
        </div>

        {centerTab === "canvas" && (hasPreview || previewUrl) && !isBuilding && (
          <div className="h-8 flex items-center gap-1 px-2 border-b border-[#1c2333] bg-[#161b22] flex-shrink-0">
            <button
              onClick={handleNavBack}
              title={t.nav_back}
              className="p-1 rounded text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleNavForward}
              title={t.nav_forward}
              className="p-1 rounded text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              title={t.nav_refresh}
              className="p-1 rounded text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors"
            >
              <RotateCw className={cn("w-3.5 h-3.5", isRefreshing && "animate-spin")} />
            </button>
            <div className="flex-1 mx-2 bg-[#0d1117] border border-[#30363d] rounded text-[10px] text-[#484f58] font-mono px-2 py-0.5 overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1">
              {previewUrl ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="truncate">{previewUrl}</span>
                </>
              ) : (
                "preview://website"
              )}
            </div>
            {previewUrl && (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 rounded text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors"
                title={t.preview_open_external}
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <div className="relative">
              <button
                onClick={() => setShowDeviceMenu(v => !v)}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors text-[11px]"
                title={t.device_selector}
              >
                <currentDevice.Icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline max-w-[80px] truncate">{currentDevice.label}</span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {showDeviceMenu && (
                <div className="absolute end-0 top-full mt-1 w-52 bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 overflow-hidden py-1">
                  {[
                    { group: null, label: null },
                    { group: "phone", label: "📱" },
                    { group: "tablet", label: "⬛" },
                    { group: "desktop", label: "💻" },
                  ].map(({ group, label }) => {
                    const groupDevices = DEVICES.filter(d => d.group === group);
                    if (groupDevices.length === 0) return null;
                    return (
                      <React.Fragment key={group ?? "responsive"}>
                        {label && (
                          <div className="px-3 py-1 text-[10px] font-semibold text-[#484f58] uppercase tracking-wider border-t border-[#21262d] mt-1 pt-1">
                            {label} {group === "phone" ? "Phones" : group === "tablet" ? "Tablets" : "Desktop"}
                          </div>
                        )}
                        {groupDevices.map(device => (
                          <button
                            key={device.id}
                            onClick={() => { setSelectedDevice(device.id); setShowDeviceMenu(false); }}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] hover:bg-[#1c2333] transition-colors text-start",
                              selectedDevice === device.id ? "text-[#58a6ff]" : "text-[#c9d1d9]"
                            )}
                          >
                            <device.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                            <span className="flex-1 truncate">{device.label}</span>
                            {device.width && (
                              <span className="text-[10px] text-[#484f58] font-mono">{device.width}×{device.height}</span>
                            )}
                          </button>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex-1 relative bg-[#0d1117] overflow-hidden flex flex-col" onClick={() => showDeviceMenu && setShowDeviceMenu(false)}>
          <div className="flex-1 overflow-hidden">
            {centerTab === "domains" ? (
              <div className="h-full overflow-y-auto">
                <DomainSettings projectId={id || ""} />
              </div>
            ) : centerTab === "canvas" ? (
              isBuilding ? (
                <div className="h-full flex items-center justify-center">
                  <div className="flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#58a6ff] mb-3" />
                    <p className="text-[#8b949e] text-sm font-medium">{t.building}</p>
                    <p className="text-xs text-[#484f58] mt-1">{t.agents_working}</p>
                  </div>
                </div>
              ) : (hasPreview || previewUrl) ? (
                <div className="w-full h-full flex items-start justify-center overflow-auto bg-[#0d1117]">
                  <div
                    className="flex-shrink-0 bg-[#161b22] overflow-hidden"
                    style={{
                      width: currentDevice.width ? `${currentDevice.width}px` : "100%",
                      height: currentDevice.width ? `${currentDevice.height}px` : "100%",
                      maxWidth: "100%",
                      transition: "width 300ms ease, height 300ms ease",
                      borderRadius: currentDevice.group === "phone" ? "16px" : currentDevice.group === "tablet" ? "8px" : "0",
                      boxShadow: currentDevice.width ? "0 0 0 1px #30363d, 0 8px 32px rgba(0,0,0,0.5)" : "none",
                      marginTop: currentDevice.width ? "16px" : "0",
                    }}
                  >
                    {previewUrl ? (
                      <iframe
                        ref={iframeRef}
                        src={previewUrl}
                        className="border-0 bg-white"
                        style={{ width: "100%", height: "100%", display: "block" }}
                        title={t.live_preview}
                      />
                    ) : (
                      <iframe
                        ref={iframeRef}
                        srcDoc={buildPreviewHtml()}
                        sandbox="allow-scripts"
                        className="border-0 bg-white"
                        style={{ width: "100%", height: "100%", display: "block" }}
                        title={t.live_preview}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-[#484f58]">
                  <div className="text-center">
                    <Eye className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">{t.preview_unavailable}</p>
                  </div>
                </div>
              )
            ) : (
              <div className="h-full flex">
                <div className="w-[200px] flex flex-col border-e border-[#1c2333] bg-[#0d1117] flex-shrink-0">
                  <div className="h-8 flex items-center px-3 border-b border-[#1c2333] bg-[#161b22]">
                    <span className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">{t.explorer}</span>
                  </div>
                  <InlineFileTree
                    files={files}
                    selectedIndex={selectedFileIndex}
                    onFileSelect={setSelectedFileIndex}
                  />
                </div>
                <div className="flex-1 flex flex-col min-w-0">
                  {files.length > 0 ? (
                    <>
                      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1c2333] bg-[#161b22] overflow-x-auto flex-shrink-0">
                        {files.map((f, i) => (
                          <button
                            key={f.id || i}
                            onClick={() => setSelectedFileIndex(i)}
                            className={cn(
                              "px-2.5 py-1 text-[11px] font-mono rounded transition-colors flex items-center gap-1.5 whitespace-nowrap",
                              selectedFileIndex === i
                                ? "bg-[#0d1117] text-[#e1e4e8] border border-[#30363d]"
                                : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
                            )}
                          >
                            <FileCode2 className="w-3 h-3" />
                            {f.filePath?.split('/').pop() || `file-${i}`}
                            <span className="text-[9px] text-[#484f58] font-sans">{getFileDescription(f.filePath || "", t as unknown as Record<string, string>)}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <CodeEditor
                          content={files[selectedFileIndex]?.content || ""}
                          filePath={files[selectedFileIndex]?.filePath || "file.txt"}
                          readOnly={isBuilding}
                          onSave={!isBuilding && id && files[selectedFileIndex]?.id ? (newContent: string) => {
                            updateFileMut.mutate({
                              projectId: id!,
                              fileId: files[selectedFileIndex].id,
                              content: newContent,
                            });
                          } : undefined}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-[#484f58]">
                      <p className="text-sm">{t.no_files}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {showTerminal && (
            <BuildTerminal
              logs={logs}
              isBuilding={isBuilding}
            />
          )}
        </div>
      </div>

      <div className="w-[240px] flex flex-col bg-[#0d1117] flex-shrink-0">
        <div className="h-9 flex items-center border-b border-[#1c2333] bg-[#161b22] flex-shrink-0 px-1">
          <button
            onClick={() => setRightTab("library")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
              rightTab === "library"
                ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
            )}
          >
            {t.library}
          </button>
          <button
            onClick={() => setRightTab("snapshots")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1",
              rightTab === "snapshots"
                ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
            )}
          >
            <Archive className="w-3 h-3" />
            {t.snapshots}
          </button>
        </div>

        {rightTab === "library" ? (
          <FileLibrary files={files} onFileSelect={(idx) => { setSelectedFileIndex(idx); setCenterTab("code"); }} />
        ) : (
          id ? <SnapshotsPanel projectId={id} /> : null
        )}
      </div>
    </div>
  );
}

function getFileIcon(filePath: string) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'html': return <FileCode2 className="w-3.5 h-3.5 text-orange-400" />;
    case 'css': return <FileCode2 className="w-3.5 h-3.5 text-blue-400" />;
    case 'js': case 'jsx': case 'ts': case 'tsx': return <FileCode2 className="w-3.5 h-3.5 text-yellow-400" />;
    case 'json': return <FileJson className="w-3.5 h-3.5 text-green-400" />;
    case 'md': case 'txt': return <FileText className="w-3.5 h-3.5 text-[#8b949e]" />;
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': return <FileImage className="w-3.5 h-3.5 text-purple-400" />;
    default: return <File className="w-3.5 h-3.5 text-[#8b949e]" />;
  }
}

function getFileDescription(filePath: string, t: { [key: string]: string }): string {
  const fileName = filePath.split('/').pop()?.toLowerCase() || "";
  const ext = fileName.split('.').pop()?.toLowerCase() || "";

  if (fileName === "package.json") return t.file_desc_package_json;
  if (fileName === "package-lock.json" || fileName === "pnpm-lock.yaml" || fileName === "yarn.lock") return t.file_desc_lock;
  if (fileName === "tsconfig.json") return t.file_desc_tsconfig;
  if (fileName === "index.html") return t.file_desc_index_html;
  if (fileName === "readme.md" || fileName === "readme.txt") return t.file_desc_readme;
  if (fileName === ".gitignore") return t.file_desc_gitignore;
  if (fileName === ".env" || fileName.startsWith(".env.")) return t.file_desc_env_file;
  if (fileName === "vite.config.ts" || fileName === "vite.config.js") return t.file_desc_vite_config;
  if (fileName === "requirements.txt") return t.file_desc_requirements;

  const descMap: Record<string, string> = {
    html: t.file_desc_html,
    css: t.file_desc_css,
    js: t.file_desc_js,
    ts: t.file_desc_ts,
    jsx: t.file_desc_jsx,
    tsx: t.file_desc_tsx,
    json: t.file_desc_json,
    md: t.file_desc_md,
    txt: t.file_desc_txt,
    png: t.file_desc_png,
    jpg: t.file_desc_jpg,
    jpeg: t.file_desc_jpg,
    svg: t.file_desc_svg,
    gif: t.file_desc_gif,
    py: t.file_desc_py,
    env: t.file_desc_env,
    yaml: t.file_desc_yaml,
    yml: t.file_desc_yml,
    lock: t.file_desc_lock,
  };

  return descMap[ext] || t.file_desc_unknown;
}

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  fileIndex?: number;
}

function buildFileTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  files.forEach((file, index) => {
    const parts = (file.filePath || `file-${index}`).split('/').filter(Boolean);
    let current = root;

    parts.forEach((part, i) => {
      const isLast = i === parts.length - 1;
      const existing = current.find(n => n.name === part);

      if (existing) {
        current = existing.children;
      } else {
        const node: TreeNode = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isFolder: !isLast,
          children: [],
          fileIndex: isLast ? index : undefined,
        };
        current.push(node);
        current = node.children;
      }
    });
  });

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(root);
  return root;
}

function FileLibrary({ files, onFileSelect }: { files: ProjectFile[]; onFileSelect: (idx: number) => void }) {
  const { t } = useI18n();
  const tRecord = t as unknown as Record<string, string>;
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildFileTree(files), [files]);

  useEffect(() => {
    const allFolders = new Set<string>();
    const collectFolders = (nodes: TreeNode[]) => {
      nodes.forEach(n => {
        if (n.isFolder) {
          allFolders.add(n.path);
          collectFolders(n.children);
        }
      });
    };
    collectFolders(tree);
    setExpandedFolders(allFolders);
  }, [tree]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const filterTree = (nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    return nodes.reduce<TreeNode[]>((acc, node) => {
      if (node.isFolder) {
        const filtered = filterTree(node.children, query);
        if (filtered.length > 0) {
          acc.push({ ...node, children: filtered });
        }
      } else if (node.name.toLowerCase().includes(query.toLowerCase())) {
        acc.push(node);
      }
      return acc;
    }, []);
  };

  const filteredTree = filterTree(tree, searchQuery);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors"
            style={{ paddingInlineStart: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
            <Folder className={cn("w-3.5 h-3.5 flex-shrink-0", isExpanded ? "text-[#58a6ff]" : "text-[#8b949e]")} />
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
        </div>
      );
    }

    return (
      <button
        key={node.path}
        onClick={() => node.fileIndex !== undefined && onFileSelect(node.fileIndex)}
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#c9d1d9] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors group"
        style={{ paddingInlineStart: `${depth * 12 + 20}px` }}
      >
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
        <span className="text-[9px] text-[#484f58] truncate ms-auto opacity-0 group-hover:opacity-100 transition-opacity">{getFileDescription(node.name, tRecord)}</span>
      </button>
    );
  };

  return (
    <>
      <div className="px-2 py-2 border-b border-[#1c2333]">
        <div className="relative">
          <Search className="absolute start-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#484f58]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={t.search_files}
            className="w-full bg-[#161b22] border border-[#30363d] rounded-md ps-7 pe-2 py-1.5 text-[12px] text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {filteredTree.length > 0 ? (
          filteredTree.map(node => renderNode(node))
        ) : (
          <div className="text-center text-[#484f58] text-xs mt-8">
            {t.no_files}
          </div>
        )}
      </div>
    </>
  );
}

function InlineFileTree({ files, selectedIndex, onFileSelect }: { files: ProjectFile[]; selectedIndex: number; onFileSelect: (idx: number) => void }) {
  const { t } = useI18n();
  const tRecord = t as unknown as Record<string, string>;
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildFileTree(files), [files]);

  useEffect(() => {
    const allFolders = new Set<string>();
    const collectFolders = (nodes: TreeNode[]) => {
      nodes.forEach(n => {
        if (n.isFolder) {
          allFolders.add(n.path);
          collectFolders(n.children);
        }
      });
    };
    collectFolders(tree);
    setExpandedFolders(allFolders);
  }, [tree]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    if (node.isFolder) {
      const isExpanded = expandedFolders.has(node.path);
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleFolder(node.path)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors"
            style={{ paddingInlineStart: `${depth * 12 + 8}px` }}
          >
            {isExpanded ? <ChevronDown className="w-3 h-3 flex-shrink-0" /> : <ChevronRight className="w-3 h-3 flex-shrink-0" />}
            <Folder className={cn("w-3.5 h-3.5 flex-shrink-0", isExpanded ? "text-[#58a6ff]" : "text-[#8b949e]")} />
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded && node.children.map(child => renderNode(child, depth + 1))}
        </div>
      );
    }

    const isSelected = node.fileIndex === selectedIndex;
    return (
      <button
        key={node.path}
        onClick={() => node.fileIndex !== undefined && onFileSelect(node.fileIndex)}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1 text-[12px] rounded transition-colors group",
          isSelected
            ? "bg-[#1f6feb]/15 text-[#e1e4e8]"
            : "text-[#c9d1d9] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
        )}
        style={{ paddingInlineStart: `${depth * 12 + 20}px` }}
      >
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
        <span className="text-[9px] text-[#484f58] truncate ms-auto opacity-0 group-hover:opacity-100 transition-opacity">{getFileDescription(node.name, tRecord)}</span>
      </button>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto py-1">
      {tree.length > 0 ? (
        tree.map(node => renderNode(node))
      ) : (
        <div className="text-center text-[#484f58] text-xs mt-8">
          {t.no_files}
        </div>
      )}
    </div>
  );
}
