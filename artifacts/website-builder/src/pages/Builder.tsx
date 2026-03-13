import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, Code2, Eye, Check, AlertTriangle, XCircle,
  FileCode2, User, Bot, Search, ChevronRight, ChevronDown,
  FileText, FileJson, FileImage, File, Folder, ArrowLeft, Clock,
  RotateCw, Monitor, Smartphone, Tablet, Laptop, ChevronLeft,
  Rocket, ExternalLink, Square, RefreshCw, Globe, Archive, BarChart3,
  Smartphone as SmartphoneIcon, Users, Lock, Unlock, Paintbrush, Puzzle, Languages,
  Upload
} from "lucide-react";
import { format } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "@/components/LanguageToggle";
import { cn } from "@/lib/utils";
import type { ExecutionLog, ProjectFile } from "@workspace/api-client-react";
import {
  useGetProject,
  useGetMe,
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
import BuildProgress, { inferPhase } from "@/components/builder/BuildProgress";
import CodeEditor from "@/components/builder/CodeEditor";
import ProjectPlan from "@/components/builder/ProjectPlan";
import DomainSettings from "@/components/builder/DomainSettings";
import SeoPanel from "@/components/builder/SeoPanel";
import SnapshotsPanel from "@/components/builder/SnapshotsPanel";
import PwaSettingsPanel from "@/components/builder/PwaSettings";
import CollaborationPanel, { CollaboratorAvatars, FileLockIndicator } from "@/components/builder/CollaborationPanel";
import { useCollaboration } from "@/hooks/useCollaboration";
import PluginStore from "@/components/builder/PluginStore";
import { useUpdateFile } from "@/hooks/useUpdateFile";
import { useCSSEditor } from "@/hooks/useCSSEditor";
import CSSEditorPanel from "@/components/builder/CSSEditorPanel";
import TranslationsPanel from "@/components/builder/TranslationsPanel";
import "@/components/builder/prism-theme.css";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  buildId?: string;
  timestamp: Date;
  plan?: { title: string; description?: string; status?: "pending" | "done" | "active" }[];
  isLog?: boolean;
  logAgent?: string;
  logStatus?: "running" | "done" | "error";
}

export default function Builder() {
  const { id } = useParams<{ id: string }>();
  const { t, lang } = useI18n();
  const queryClient = useQueryClient();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState("");
  const autoPromptProcessed = useRef(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem(`chat_${id}`);
    if (saved) {
      try {
        return JSON.parse(saved).map((m: ChatMessage) => ({ ...m, timestamp: new Date(m.timestamp) }));
      } catch { return []; }
    }
    return [{
      id: "welcome",
      role: "assistant" as const,
      content: lang === "ar"
        ? `مرحباً! أنا مساعدك الذكي 👋\nأخبرني ماذا تريد أن تبني أو اسألني أي سؤال عن مشروعك.`
        : `Hello! I'm your AI assistant 👋\nTell me what you'd like to build, or ask me anything about your project.`,
      timestamp: new Date(),
    }];
  });
  const [activeBuildId, setActiveBuildId] = useState<string | null>(() => {
    return localStorage.getItem(`latestBuild_${id}`);
  });
  const [lastCompletedBuildId, setLastCompletedBuildId] = useState<string | null>(null);
  const [retainedLogs, setRetainedLogs] = useState<ExecutionLog[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [selectedDevice, setSelectedDevice] = useState("responsive");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  
  const [planApproved, setPlanApproved] = useState(false);
  const [rightTab, setRightTab] = useState<"code" | "library" | "snapshots" | "plugins" | "collab" | "domains" | "seo">("code");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [showDeployPanel, setShowDeployPanel] = useState(false);
  const [showPwaPanel, setShowPwaPanel] = useState(false);
  const [showTranslationsPanel, setShowTranslationsPanel] = useState(false);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [cssEditorActive, setCssEditorActive] = useState(false);
  const [cssSaving, setCssSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(340);
  const leftDragRef = useRef<{ startX: number; startW: number } | null>(null);
  const rightDragRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleLeftDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    leftDragRef.current = { startX: e.clientX, startW: leftWidth };
    const onMove = (ev: MouseEvent) => {
      if (!leftDragRef.current) return;
      const isRtl = lang === "ar";
      const delta = isRtl
        ? leftDragRef.current.startX - ev.clientX
        : ev.clientX - leftDragRef.current.startX;
      setLeftWidth(Math.max(220, Math.min(480, leftDragRef.current.startW + delta)));
    };
    const onUp = () => {
      leftDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [leftWidth, lang]);

  const handleRightDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    rightDragRef.current = { startX: e.clientX, startW: rightWidth };
    const onMove = (ev: MouseEvent) => {
      if (!rightDragRef.current) return;
      const isRtl = lang === "ar";
      const delta = isRtl
        ? ev.clientX - rightDragRef.current.startX
        : rightDragRef.current.startX - ev.clientX;
      setRightWidth(Math.max(260, Math.min(600, rightDragRef.current.startW + delta)));
    };
    const onUp = () => {
      rightDragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [rightWidth, lang]);

  const { data: project } = useGetProject(id || "");
  const { data: me } = useGetMe({ query: { queryKey: ["getMe"], retry: false } });
  const { data: tokenSummary } = useGetTokenSummary();
  const startBuildMut = useStartBuild();
  const updateFileMut = useUpdateFile();

  const handleFileChanged = useCallback((data: { userId: string; displayName: string; filePath: string; content: string }) => {
    if (!id) return;
    queryClient.invalidateQueries({ queryKey: ["listProjectFiles", id] });
  }, [id, queryClient]);

  const {
    collaborators,
    fileLocks,
    notifications,
    connected: wsConnected,
    sendCursorMove,
    sendFileOpen,
    sendFileEdit,
    lockFile,
    unlockFile,
  } = useCollaboration({ projectId: id, onFileChanged: handleFileChanged });
  const deployMut = useDeployProject();
  const undeployMut = useUndeployProject();
  const redeployMut = useRedeployProject();

  const cssEditor = useCSSEditor(iframeRef);

  const handleToggleCSSEditor = useCallback(() => {
    if (cssEditorActive) {
      cssEditor.deactivate();
      setCssEditorActive(false);
    } else {
      cssEditor.activate();
      setCssEditorActive(true);
    }
  }, [cssEditorActive, cssEditor]);

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

  const logsBuildId = activeBuildId || lastCompletedBuildId;
  const { data: buildLogs } = useGetBuildLogs(logsBuildId || "", {
    query: {
      queryKey: ["getBuildLogs", logsBuildId || ""],
      enabled: !!logsBuildId,
      refetchInterval: () => {
        if (!activeBuildId) return false;
        const isTerminal = buildStatus?.status === "completed" || buildStatus?.status === "failed" || buildStatus?.status === "cancelled";
        return isTerminal ? false : 3000;
      }
    }
  });

  const logs = buildLogs?.data || retainedLogs;

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

  const prevLogCountRef = React.useRef(0);

  const agentNames: Record<string, { en: string; ar: string }> = {
    planner: { en: "Planner", ar: "المخطط" },
    codegen: { en: "Code Generator", ar: "مولّد الكود" },
    reviewer: { en: "Code Reviewer", ar: "المراجع" },
    fixer: { en: "Code Fixer", ar: "المصلح" },
    surgical_edit: { en: "Editor", ar: "المحرر" },
    package_runner: { en: "Runner", ar: "المشغّل" },
    qa: { en: "QA", ar: "ضمان الجودة" },
    filemanager: { en: "File Manager", ar: "مدير الملفات" },
  };

  useEffect(() => {
    prevLogCountRef.current = logs.length;
  }, [logs]);

  useEffect(() => {
    if (activeBuildId && project?.status === "ready" && buildStatus?.status !== "in_progress" && buildStatus?.status !== "pending") {
      if (logs.length > 0) setRetainedLogs([...logs]);
      setLastCompletedBuildId(activeBuildId);
      const finalStatus = buildStatus?.status || "completed";
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalStatus === "failed"
          ? (lang === "ar" ? "❌ فشل البناء — راجع سجل التنفيذ لمعرفة التفاصيل" : "❌ Build failed — check the execution log for details")
          : finalStatus === "cancelled"
          ? (lang === "ar" ? "🛑 تم إيقاف البناء" : "🛑 Build cancelled")
          : (lang === "ar" ? "✅ اكتمل البناء — المشروع جاهز في المعاينة!" : "✅ Build complete — project is ready in preview!"),
        timestamp: new Date(),
      }]);
      setActiveBuildId(null);
      if (id) localStorage.removeItem(`latestBuild_${id}`);
      setPreviewKey(k => k + 1);
    }
  }, [project?.status, activeBuildId, buildStatus?.status, id, logs, lang]);

  const buildIdSetTime = useRef<number>(0);
  useEffect(() => {
    if (activeBuildId) {
      buildIdSetTime.current = Date.now();
    }
  }, [activeBuildId]);

  useEffect(() => {
    if (!activeBuildId) return;
    const elapsed = Date.now() - buildIdSetTime.current;
    if (elapsed < 10000) {
      if (!buildStatus || buildStatus.status === "in_progress" || buildStatus.status === "pending") {
        const pollTimer = setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["getBuildStatus", activeBuildId] });
          queryClient.invalidateQueries({ queryKey: ["getProject", id] });
        }, 3000);
        return () => clearTimeout(pollTimer);
      }
    }
    if (project && project.status !== "building") {
      const isStale = buildStatus && buildStatus.status !== "in_progress" && buildStatus.status !== "pending";
      const noStatusYet = !buildStatus && elapsed > 10000;
      if (isStale || noStatusYet) {
        console.log("[PREVIEW] Clearing stale build ID:", activeBuildId, "project:", project.status, "build:", buildStatus?.status, "elapsed:", elapsed);
        if (logs.length > 0) setRetainedLogs([...logs]);
        setLastCompletedBuildId(activeBuildId);
        setActiveBuildId(null);
        if (id) localStorage.removeItem(`latestBuild_${id}`);
        setPreviewKey(k => k + 1);
        return;
      }
    }
    const timeout = setTimeout(() => {
      if (buildStatus?.status === "in_progress" || buildStatus?.status === "pending") {
        queryClient.invalidateQueries({ queryKey: ["getBuildStatus", activeBuildId] });
        queryClient.invalidateQueries({ queryKey: ["getProject", id] });
      }
    }, 15000);
    return () => clearTimeout(timeout);
  }, [activeBuildId, buildStatus?.status, project?.status, id, queryClient]);

  useEffect(() => {
    if (buildStatus?.status === "completed" && activeBuildId) {
      const alreadyReplied = messages.some(m => m.buildId === activeBuildId && m.content?.includes(t.preview_ready));
      if (!alreadyReplied) {
        prevLogCountRef.current = 0;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `✅ ${t.preview_ready}`,
          buildId: activeBuildId,
          timestamp: new Date(),
        }]);
        queryClient.invalidateQueries({ queryKey: ["listProjectFiles", id] });
        queryClient.invalidateQueries({ queryKey: ["getProject", id] });
        setTimeout(() => {
          setPreviewKey(k => k + 1);
          setActiveBuildId(null);
          if (id) localStorage.removeItem(`latestBuild_${id}`);
        }, 2000);
      }
    } else if (buildStatus?.status === "failed" && activeBuildId) {
      const alreadyReplied = messages.some(m => m.buildId === activeBuildId && m.content?.includes(t.status_failed));
      if (!alreadyReplied) {
        prevLogCountRef.current = 0;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ ${t.status_failed}`,
          buildId: activeBuildId,
          timestamp: new Date(),
        }]);
        queryClient.invalidateQueries({ queryKey: ["listProjectFiles", id] });
        queryClient.invalidateQueries({ queryKey: ["getProject", id] });
        setTimeout(() => {
          setPreviewKey(k => k + 1);
          setActiveBuildId(null);
          if (id) localStorage.removeItem(`latestBuild_${id}`);
        }, 2000);
      }
    }
  }, [buildStatus?.status, activeBuildId]);


  const sendChatMessage = useCallback(async (text: string, chatHistory: ChatMessage[]) => {
    const baseUrl = import.meta.env.VITE_API_URL || "";
    const history = chatHistory
      .filter(m => (m.role === "user" || m.role === "assistant") && !m.isLog)
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    const res = await fetch(`${baseUrl}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ projectId: id, message: text, history }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (err?.reply) {
        return err as { reply: string; shouldBuild: boolean; buildId?: string; buildPrompt?: string; tokensUsed: number; costUsd: number };
      }
      throw new Error("عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.");
    }

    return res.json() as Promise<{ reply: string; shouldBuild: boolean; buildId?: string; buildPrompt?: string; tokensUsed: number; costUsd: number }>;
  }, [id]);

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
    setIsChatLoading(true);

    try {
      const chatRes = await sendChatMessage(currentPrompt, [...messages, userMsg]);
      console.log("[CHAT] Response:", JSON.stringify(chatRes));

      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: chatRes.reply,
        timestamp: new Date(),
      }]);

      if (chatRes.shouldBuild && chatRes.buildId) {
        const isFix = (chatRes as any).actionType === "fix";
        const fixResult = (chatRes as any).fixResult;

        if (isFix && fixResult) {
          console.log("[FIX] Surgical fix completed:", fixResult);
          queryClient.invalidateQueries({ queryKey: ["listProjectFiles", id] });
          queryClient.invalidateQueries({ queryKey: ["getProject", id] });
          setTimeout(() => {
            setPreviewKey(k => k + 1);
          }, 2000);
          if (fixResult.success && fixResult.fixedFiles?.length > 0) {
            setMessages(prev => [...prev, {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `✅ ${lang === "ar" ? "تم إصلاح" : "Fixed"}: ${fixResult.fixedFiles.join(", ")}`,
              timestamp: new Date(),
            }]);
          }
        } else {
          console.log("[BUILD] Build started by server:", chatRes.buildId);
          setRetainedLogs([]);
          setLastCompletedBuildId(null);
          setActiveBuildId(chatRes.buildId);
          localStorage.setItem(`latestBuild_${id}`, chatRes.buildId);
          setPlanApproved(false);

          setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role: "assistant",
            content: lang === "ar"
              ? "🚀 بدأ البناء — تابع سجل التنفيذ أدناه لمشاهدة عمل الوكلاء مباشرة"
              : "🚀 Build started — follow the execution log below to watch agents work live",
            buildId: chatRes.buildId,
            timestamp: new Date(),
          }]);
        }
      }
    } catch (err: any) {
      console.error("[FLOW] Error:", err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `⚠️ ${err?.message || t.unknown_error}`,
        timestamp: new Date(),
      }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    if (autoPromptProcessed.current || !id) return;
    const urlParams = new URLSearchParams(window.location.search);
    const initialPrompt = urlParams.get("prompt");
    if (initialPrompt && initialPrompt.trim()) {
      autoPromptProcessed.current = true;
      window.history.replaceState({}, "", window.location.pathname);
      const idea = initialPrompt.trim();
      console.log("[AUTO-PROMPT] Starting build with idea:", idea);
      setTimeout(() => {
        setPrompt(idea);
        setTimeout(() => {
          const btn = document.querySelector("[data-auto-submit]") as HTMLButtonElement;
          if (btn && !btn.disabled) {
            btn.click();
          }
        }, 300);
      }, 1500);
    }
  }, [id]);

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

  const isBuilding = buildStatus?.status === "pending" || buildStatus?.status === "in_progress" || startBuildMut.isPending || (!!activeBuildId && !buildStatus);

  const actionCount = logs.length;
  const isDeploying = deployMut.isPending || redeployMut.isPending || deploymentStatus?.status === "deploying";
  const isDeployed = deploymentStatus?.status === "active";
  const canDeploy = project?.status === "ready" && !isBuilding;
  const files = projectFiles?.data || [];

  const handleSaveCSS = useCallback(async () => {
    if (!id || cssEditor.changeCount === 0) return;
    setCssSaving(true);
    try {
      const generatedCSS = cssEditor.generateCSS();
      const cssFile = files.find(f => f.filePath?.endsWith(".css"));
      if (cssFile?.id) {
        const newContent = (cssFile.content || "") + "\n\n/* Visual Editor Changes */\n" + generatedCSS;
        await updateFileMut.mutateAsync({
          projectId: id,
          fileId: cssFile.id,
          content: newContent,
        });
      } else {
        const htmlFileForCSS = files.find(f => f.filePath?.endsWith(".html"));
        if (htmlFileForCSS?.id && htmlFileForCSS.content) {
          const styleTag = `<style>\n/* Visual Editor Changes */\n${generatedCSS}\n</style>`;
          const newContent = htmlFileForCSS.content.replace("</head>", `${styleTag}\n</head>`);
          await updateFileMut.mutateAsync({
            projectId: id,
            fileId: htmlFileForCSS.id,
            content: newContent,
          });
        }
      }
      cssEditor.clearAll();
    } catch (err) {
      console.error("Failed to save CSS:", err);
    } finally {
      setCssSaving(false);
    }
  }, [id, cssEditor, files, updateFileMut]);

  const htmlFile = files.find((f) => f.filePath?.endsWith('.html'));
  const hasPreview = !!htmlFile?.content;

  const currentPhase = inferPhase(buildStatus?.status, logs);
  const phaseFailed = buildStatus?.status === "failed";

  const sandboxProxyUrl = useMemo(() => {
    if (!id) return null;
    const allLogs = logs;
    const runnerLog = allLogs.find(l =>
      l.agentType === "package_runner" &&
      l.status === "completed" &&
      l.details &&
      typeof l.details === "object" &&
      "sandboxId" in l.details &&
      "serverStarted" in l.details &&
      (l.details as any).serverStarted === true
    );
    if (runnerLog) {
      const baseUrl = import.meta.env.VITE_API_URL || "";
      return `${baseUrl}/api/sandbox/proxy/${id}/`;
    }
    return null;
  }, [id, logs]);

  const previewUrl = sandboxProxyUrl;

  const buildPreviewHtml = (): string => {
    if (!htmlFile?.content) return "";

    const cssFiles = files.filter(f => f.filePath?.endsWith('.css') && f.content);
    const reactFiles = files.filter(f =>
      f.content &&
      (f.filePath?.endsWith('.tsx') || f.filePath?.endsWith('.jsx') ||
       (f.filePath?.endsWith('.ts') && !f.filePath?.endsWith('.config.ts') && !f.filePath?.endsWith('vite-env.d.ts')) ||
       (f.filePath?.endsWith('.js') && !f.filePath?.endsWith('.config.js') && f.filePath?.startsWith('src/'))) &&
      !f.filePath?.endsWith('.config.ts') && !f.filePath?.endsWith('.config.js')
    );
    const isReactProject = reactFiles.some(f =>
      f.content?.includes('React') || f.content?.includes('react') ||
      f.content?.includes('useState') || f.content?.includes('jsx')
    );

    if (!isReactProject) {
      let resultHtml = htmlFile.content;
      const cssContents: string[] = [];
      const jsContents: string[] = [];
      for (const f of files) {
        if (f.filePath?.endsWith('.css') && f.content && f.filePath !== htmlFile.filePath) {
          cssContents.push(`/* ${f.filePath} */\n${f.content}`);
        }
        if (f.filePath?.endsWith('.js') && f.content && f.filePath !== htmlFile.filePath) {
          jsContents.push(`// ${f.filePath}\n${f.content}`);
        }
      }
      if (cssContents.length > 0) {
        const cssBlock = `<style>\n${cssContents.join('\n')}\n</style>`;
        if (resultHtml.includes('</head>')) {
          resultHtml = resultHtml.replace('</head>', `${cssBlock}\n</head>`);
        } else {
          resultHtml = cssBlock + resultHtml;
        }
      }
      if (jsContents.length > 0) {
        const jsBlock = `<script>\n${jsContents.join('\n')}\n<\/script>`;
        if (resultHtml.includes('</body>')) {
          resultHtml = resultHtml.replace('</body>', `${jsBlock}\n</body>`);
        } else {
          resultHtml += jsBlock;
        }
      }
      resultHtml = resultHtml.replace(/<link\s+rel=["']stylesheet["']\s+href=["'][^"']*["']\s*\/?>/gi, '');
      resultHtml = resultHtml.replace(/<script\s+src=["'][^"']*["']\s*>\s*<\/script>/gi, '');
      return resultHtml;
    }

    const allCSS = cssFiles.map(f => f.content).join('\n');

    const stripImportsExports = (code: string, fallbackName: string): string => {
      let c = code;
      c = c.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]\s*;?\s*$/gm, (_m, names) => {
        const iconNames = names.split(',').map((n: string) => n.trim()).filter(Boolean);
        return iconNames.map((n: string) => {
          const parts = n.split(/\s+as\s+/);
          const original = parts[0].trim();
          const alias = (parts[1] || parts[0]).trim();
          return `var ${alias} = __icons['${original}'];`;
        }).join('\n');
      });
      c = c.replace(/^import\s[\s\S]*?from\s+['"].*?['"]\s*;?\s*$/gm, '');
      c = c.replace(/^import\s+['"].*?['"]\s*;?\s*$/gm, '');
      c = c.replace(/^import\s+type\s+[\s\S]*?from\s+['"].*?['"]\s*;?\s*$/gm, '');

      c = c.replace(/export\s+default\s+function\s+(\w+)/g, 'function $1');
      c = c.replace(/export\s+default\s+class\s+(\w+)/g, 'class $1');
      c = c.replace(/export\s+default\s+(\w+)\s*;?/g, '');

      c = c.replace(/export\s+(const|function|class|let|var)\s+/g, '$1 ');

      c = c.replace(/export\s+type\s+/g, 'type ');
      c = c.replace(/export\s+interface\s+/g, 'interface ');
      c = c.replace(/export\s+enum\s+/g, 'enum ');

      c = c.replace(/export\s+\{[^}]*\}\s*(from\s+['"].*?['"])?\s*;?/g, '');

      c = c.replace(/^export\s+default\s+/gm, 'var _default = ');

      c = c.replace(/^(?:const|let|var)\s+\w+\s*=\s*(?:React\.)?lazy\s*\(.*?\)\s*;?\s*$/gm, '');

      c = c.replace(/:\s*React\.FC(<[^>]*>)?/g, '');
      c = c.replace(/:\s*React\.ReactNode/g, '');
      c = c.replace(/:\s*React\.CSSProperties/g, '');
      c = c.replace(/:\s*React\.ChangeEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.FormEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.MouseEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.KeyboardEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.FocusEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.TouchEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.DragEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.ClipboardEvent<[^>]*>/g, '');
      c = c.replace(/:\s*React\.Dispatch<[^>]*>/g, '');
      c = c.replace(/:\s*React\.SetStateAction<[^>]*>/g, '');
      c = c.replace(/:\s*React\.RefObject<[^>]*>/g, '');
      c = c.replace(/:\s*React\.MutableRefObject<[^>]*>/g, '');
      c = c.replace(/:\s*React\.ComponentProps<[^>]*>/g, '');

      c = c.replace(/^interface\s+\w+[\s\S]*?^\}/gm, '');
      c = c.replace(/^type\s+\w+\s*=\s*[\s\S]*?(?=\n(?:const|let|var|function|export|import|\/\/|\/\*|$))/gm, '');

      c = c.replace(/as\s+\w+(\[\])?\s*[;,)]/g, (m) => m.slice(m.length - 1));
      c = c.replace(/as\s+\w+\s*$/gm, '');

      c = c.replace(/<(\w+)(?:\s*,\s*\w+)*>(?=\()/g, '');
      c = c.replace(/\w+\s*<[^>]+>\s*(?=\()/g, (m) => m.replace(/<[^>]+>/, ''));

      c = c.replace(/import\.meta\.env\.\w+/g, '""');
      c = c.replace(/import\.meta/g, '({})');

      c = c.replace(/process\.env\.\w+/g, '""');

      c = c.replace(/<(\w+)(\s[^>]*)?\s*\/>/g, (m, tag, attrs) => {
        if (/^[a-z]/.test(tag)) return m;
        return `<${tag}${attrs || ''} />`;
      });
      return c;
    };

    const componentFiles = reactFiles
      .filter(f => !f.filePath?.includes('main.') && !f.filePath?.includes('index.') && !f.filePath?.includes('vite-env'))
      .sort((a, b) => {
        const depthA = (a.filePath?.match(/\//g) || []).length;
        const depthB = (b.filePath?.match(/\//g) || []).length;
        if (depthA !== depthB) return depthB - depthA;
        const isAppA = a.filePath?.includes('App.') ? 1 : 0;
        const isAppB = b.filePath?.includes('App.') ? 1 : 0;
        return isAppA - isAppB;
      });

    const componentScripts = componentFiles.map(f => {
      return `// __FILE__: ${f.filePath}\n${f.content || ''}`;
    }).join('\n\n// __FILE_SEPARATOR__\n\n');

    const dir = files.some(f => f.content?.includes('dir="rtl"') || f.content?.includes("dir='rtl'") || f.content?.includes('direction: rtl'))
      ? 'rtl' : 'ltr';
    const htmlLang = dir === 'rtl' ? 'ar' : 'en';

    const safeComponentCode = componentScripts.replace(/<\/script/gi, '<\\/script');

    return `<!DOCTYPE html>
<html lang="${htmlLang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', 'Inter', sans-serif; }
    ${allCSS}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/plain" id="__component_code__">${safeComponentCode}<\/script>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin><\/script>
  <script src="https://unpkg.com/@babel/standalone@7/babel.min.js"><\/script>
  <script>
    var useState = React.useState, useEffect = React.useEffect, useCallback = React.useCallback,
        useMemo = React.useMemo, useRef = React.useRef, Fragment = React.Fragment,
        useReducer = React.useReducer, useLayoutEffect = React.useLayoutEffect,
        useImperativeHandle = React.useImperativeHandle, useDebugValue = React.useDebugValue,
        forwardRef = React.forwardRef, memo = React.memo, Children = React.Children,
        isValidElement = React.isValidElement, cloneElement = React.cloneElement,
        createElement = React.createElement, Component = React.Component, PureComponent = React.PureComponent,
        StrictMode = React.StrictMode;
    var createContext = function(defaultValue) {
      var ctx = React.createContext(defaultValue);
      var OrigProvider = ctx.Provider;
      return ctx;
    };
    var useContext = function(ctx) {
      try { var v = React.useContext(ctx); return v; } catch(e) { return null; }
    };
    var useId = function() { return 'id-' + Math.random().toString(36).slice(2, 8); };
    var useSyncExternalStore = function(sub, getSnapshot) { var _s = useState(0); useEffect(function() { return sub(function() { _s[1](function(c) { return c+1; }); }); }, []); return getSnapshot(); };
    var useDeferredValue = function(v) { return v; };
    var useTransition = function() { return [false, function(fn) { fn(); }]; };
    var startTransition = function(fn) { fn(); };
    var __currentParams = {};
    function __matchRoute(pattern, pathname) {
      if (!pattern) return false;
      if (pattern === pathname) return { exact: true, params: {} };
      if (pattern === '*') return { exact: false, params: { '*': pathname } };
      var patternParts = pattern.split('/').filter(Boolean);
      var pathParts = pathname.split('/').filter(Boolean);
      if (patternParts.length !== pathParts.length) return false;
      var params = {};
      for (var i = 0; i < patternParts.length; i++) {
        if (patternParts[i].charAt(0) === ':') {
          params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
        } else if (patternParts[i] !== pathParts[i]) {
          return false;
        }
      }
      return { exact: true, params: params };
    }
    var useNavigate = function() { return function(p, opts) { if (typeof p === 'number') { return; } window.location.hash = p; }; };
    var useParams = function() { return __currentParams; };
    var useLocation = function() {
      var _s = React.useState(window.location.hash.slice(1) || '/');
      React.useEffect(function() {
        var handler = function() { _s[1](window.location.hash.slice(1) || '/'); };
        window.addEventListener('hashchange', handler);
        return function() { window.removeEventListener('hashchange', handler); };
      }, []);
      return { pathname: _s[0], search: '', hash: '', state: null };
    };
    var useSearchParams = function() {
      var params = new URLSearchParams(window.location.search);
      var setParams = function() {};
      return [params, setParams];
    };
    var Navigate = function(props) { if (props.to) window.location.hash = props.to; return null; };
    var Link = function(props) {
      var p = {};
      for (var k in props) { if (k !== 'to' && k !== 'children' && k !== 'reloadDocument') p[k] = props[k]; }
      p.href = '#' + (props.to || '/');
      var origClick = props.onClick;
      p.onClick = function(e) { e.preventDefault(); if (origClick) origClick(e); window.location.hash = props.to || '/'; };
      return React.createElement('a', p, props.children);
    };
    var NavLink = function(props) {
      var currentPath = window.location.hash.slice(1) || '/';
      var isActive = currentPath === props.to || (props.to !== '/' && currentPath.indexOf(props.to) === 0);
      var cn = props.className;
      if (typeof cn === 'function') cn = cn({ isActive: isActive, isPending: false });
      var newProps = {};
      for (var k in props) { if (k !== 'to' && k !== 'children' && k !== 'className' && k !== 'end' && k !== 'reloadDocument') newProps[k] = props[k]; }
      newProps.className = cn || '';
      if (isActive && props.style && typeof props.style === 'function') newProps.style = props.style({ isActive: isActive });
      newProps.href = '#' + (props.to || '/');
      newProps.onClick = function(e) { e.preventDefault(); window.location.hash = props.to || '/'; };
      return React.createElement('a', newProps, props.children);
    };
    var BrowserRouter = function(props) { return React.createElement(Fragment, null, props.children); };
    var Routes = function(props) {
      var _s = React.useState(window.location.hash.slice(1) || '/');
      var path = _s[0], setPath = _s[1];
      React.useEffect(function() {
        var handler = function() { setPath(window.location.hash.slice(1) || '/'); };
        window.addEventListener('hashchange', handler);
        return function() { window.removeEventListener('hashchange', handler); };
      }, []);
      var routes = React.Children.toArray(props.children);
      var matched = null;
      for (var i = 0; i < routes.length; i++) {
        var r = routes[i];
        if (!r.props) continue;
        var result = __matchRoute(r.props.path, path);
        if (result) {
          __currentParams = result.params || {};
          matched = r;
          break;
        }
        if (r.props.index && path === '/') { matched = r; __currentParams = {}; break; }
      }
      if (!matched) {
        var fallback = routes.find(function(r) { return r.props && r.props.path === '*'; });
        if (!fallback) fallback = routes.find(function(r) { return r.props && (r.props.path === '/' || r.props.index); });
        if (fallback) { matched = fallback; __currentParams = {}; }
      }
      return matched && matched.props ? matched.props.element : null;
    };
    var Route = function() { return null; };
    var Outlet = function(props) { return props && props.children ? React.createElement(Fragment, null, props.children) : null; };
    var HashRouter = BrowserRouter;
    var MemoryRouter = BrowserRouter;
    var Router = BrowserRouter;
    var RouterProvider = function(props) {
      var _s = React.useState(window.location.hash.slice(1) || '/');
      var currentPath = _s[0];
      React.useEffect(function() {
        var handler = function() { _s[1](window.location.hash.slice(1) || '/'); };
        window.addEventListener('hashchange', handler);
        return function() { window.removeEventListener('hashchange', handler); };
      }, []);
      var router = props.router;
      if (!router || !router.routes) return null;
      function findMatch(routesList, path) {
        for (var i = 0; i < routesList.length; i++) {
          var route = routesList[i];
          if (route.path) {
            var m = __matchRoute(route.path, path);
            if (m) { __currentParams = m.params || {}; return route; }
          }
          if (route.index && path === '/') { __currentParams = {}; return route; }
          if (route.children) {
            var child = findMatch(route.children, path);
            if (child) {
              if (route.element) return { element: React.createElement(Fragment, null, route.element, child.element) };
              return child;
            }
          }
        }
        return null;
      }
      var matchedRoute = findMatch(router.routes, currentPath);
      if (!matchedRoute) {
        var firstRoute = router.routes[0];
        if (firstRoute && firstRoute.children) {
          var indexChild = firstRoute.children.find(function(r) { return r.index; }) || firstRoute.children[0];
          if (indexChild) {
            return firstRoute.element ? React.createElement(Fragment, null, firstRoute.element, indexChild.element) : indexChild.element;
          }
        }
        if (firstRoute && firstRoute.element) return firstRoute.element;
      }
      return matchedRoute ? matchedRoute.element : null;
    };
    var createBrowserRouter = function(routes) { return { routes: routes }; };
    var createHashRouter = createBrowserRouter;
    var createMemoryRouter = createBrowserRouter;
    var ScrollRestoration = function() { return null; };
    var useMatch = function(pattern) {
      var path = window.location.hash.slice(1) || '/';
      return __matchRoute(pattern, path) || null;
    };
    var useRouteError = function() { return null; };
    var useLoaderData = function() { return {}; };
    var Form = function(props) { return React.createElement('form', props, props.children); };
    var Suspense = function(props) { return React.createElement(Fragment, null, props.children); };
    var lazy = function(fn) { return function(props) { return null; }; };

    var axios = {
      get: function(url, config) { return fetch(url, config).then(function(r) { return r.json().then(function(d) { return { data: d, status: r.status, statusText: r.statusText, headers: {}, config: config || {} }; }); }); },
      post: function(url, data, config) { return fetch(url, Object.assign({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }, config)).then(function(r) { return r.json().then(function(d) { return { data: d, status: r.status, statusText: r.statusText, headers: {}, config: config || {} }; }); }); },
      put: function(url, data, config) { return fetch(url, Object.assign({ method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }, config)).then(function(r) { return r.json().then(function(d) { return { data: d, status: r.status, statusText: r.statusText, headers: {}, config: config || {} }; }); }); },
      delete: function(url, config) { return fetch(url, Object.assign({ method: 'DELETE' }, config)).then(function(r) { return r.json().then(function(d) { return { data: d, status: r.status, statusText: r.statusText, headers: {}, config: config || {} }; }); }); },
      create: function() { return axios; },
      defaults: { headers: { common: {} } },
      interceptors: { request: { use: function(){} }, response: { use: function(){} } }
    };
    var toast = function(msg) { console.log('[toast]', msg); };
    toast.success = toast; toast.error = toast; toast.info = toast; toast.warning = toast;
    var Toaster = function() { return null; };
    var useToast = function() { return { toast: toast }; };
    var motion = new Proxy({}, { get: function(t, prop) { return function(p) { return React.createElement(prop, p, p ? p.children : null); }; } });
    var AnimatePresence = function(props) { return React.createElement(Fragment, null, props.children); };
    var framerMotion = { motion: motion, AnimatePresence: AnimatePresence };
    var clsx = function() { return Array.prototype.slice.call(arguments).filter(Boolean).join(' '); };
    var cn = clsx;
    var twMerge = function(s) { return s; };
    function cva(base, config) { return function(props) { return base; }; }

    var __iconSvgPaths = {
      Car: 'M7 17h10M5 13l1.5-4.5h11L19 13M6 17a1 1 0 1 0 2 0 1 1 0 0 0-2 0m10 0a1 1 0 1 0 2 0 1 1 0 0 0-2 0M3 13h18v4H3z',
      Menu: 'M4 6h16M4 12h16M4 18h16',
      X: 'M18 6L6 18M6 6l12 12',
      Search: 'M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
      MapPin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zm-9 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
      Phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
      Mail: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm16 2l-8 5-8-5',
      Calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18',
      Clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4l3 3',
      Check: 'M20 6L9 17l-5-5',
      Filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
      Globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
      ChevronDown: 'M6 9l6 6 6-6', ChevronLeft: 'M15 18l-6-6 6-6', ChevronRight: 'M9 18l6-6-6-6',
      DollarSign: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
      Fuel: 'M3 22V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v17M13 10h2a2 2 0 0 1 2 2v3a2 2 0 0 0 4 0V8l-4-4',
      Gauge: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6l3 6',
      Settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4',
      Shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
      User: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
      Users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
      Award: 'M12 2l3 6 7 1-5 5 1.5 7L12 17.5 5.5 21 7 14l-5-5 7-1z',
      CreditCard: 'M1 4h22v16H1zM1 10h22',
      AlertCircle: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4m0 4h.01',
      Star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
      Heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z',
      Facebook: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
      Twitter: 'M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5',
      Instagram: 'M16 2H8a6 6 0 0 0-6 6v8a6 6 0 0 0 6 6h8a6 6 0 0 0 6-6V8a6 6 0 0 0-6-6zm-4 14a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm5-9a1 1 0 1 1 0-2 1 1 0 0 1 0 2z'
    };
    function __makeIcon(name) {
      return function(props) {
        var p = props || {};
        var size = p.size || p.width || 24;
        var color = p.color || 'currentColor';
        var cls = p.className || '';
        var pathD = __iconSvgPaths[name] || 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z';
        var paths = pathD.split(/(?<=z)(?=[A-Z])/i);
        var children = paths.map(function(d, i) { return React.createElement('path', { key: i, d: d }); });
        return React.createElement('svg', {
          xmlns: 'http://www.w3.org/2000/svg', width: size, height: size,
          viewBox: '0 0 24 24', fill: 'none', stroke: color,
          strokeWidth: p.strokeWidth || 2, strokeLinecap: 'round', strokeLinejoin: 'round',
          className: cls, style: p.style
        }, children);
      };
    }
    var __icons = new Proxy({}, { get: function(t, name) { return __makeIcon(String(name)); } });

    // DO NOT define icons as global vars - they conflict with component names (Home, Link, Menu, etc.)
    // Instead, icons are accessed via __icons registry. The import transform below handles this.
    // Only define icons that will NEVER conflict with component names as convenience globals:
    var AlertCircle=__makeIcon('AlertCircle'),Award=__makeIcon('Award'),Calendar=__makeIcon('Calendar'),Car=__makeIcon('Car'),Check=__makeIcon('Check'),ChevronDown=__makeIcon('ChevronDown'),ChevronLeft=__makeIcon('ChevronLeft'),ChevronRight=__makeIcon('ChevronRight'),ChevronUp=__makeIcon('ChevronDown'),Clock=__makeIcon('Clock'),CreditCard=__makeIcon('CreditCard'),DollarSign=__makeIcon('DollarSign'),Facebook=__makeIcon('Facebook'),Filter=__makeIcon('Filter'),Fuel=__makeIcon('Fuel'),Gauge=__makeIcon('Gauge'),Globe=__makeIcon('Globe'),Heart=__makeIcon('Heart'),Instagram=__makeIcon('Instagram'),Mail=__makeIcon('Mail'),MapPin=__makeIcon('MapPin'),Phone=__makeIcon('Phone'),Settings=__makeIcon('Settings'),Shield=__makeIcon('Shield'),Star=__makeIcon('Star'),Sun=__makeIcon('Star'),Moon=__makeIcon('Star'),Twitter=__makeIcon('Twitter'),Users=__makeIcon('Users'),ArrowRight=__makeIcon('ChevronRight'),ArrowLeft=__makeIcon('ChevronLeft'),ArrowUp=__makeIcon('ChevronDown'),ArrowDown=__makeIcon('ChevronDown'),Plus=__makeIcon('Check'),Minus=__makeIcon('X'),Eye=__makeIcon('Search'),EyeOff=__makeIcon('X'),Trash=__makeIcon('X'),Trash2=__makeIcon('X'),Edit=__makeIcon('Settings'),Edit2=__makeIcon('Settings'),Edit3=__makeIcon('Settings'),Copy=__makeIcon('CreditCard'),Download=__makeIcon('ChevronDown'),Upload=__makeIcon('ChevronDown'),Share=__makeIcon('Globe'),Share2=__makeIcon('Globe'),ExternalLink=__makeIcon('Globe'),Loader=__makeIcon('Settings'),Loader2=__makeIcon('Settings'),RefreshCw=__makeIcon('Settings'),RotateCw=__makeIcon('Settings'),RotateCcw=__makeIcon('Settings'),Info=__makeIcon('AlertCircle'),HelpCircle=__makeIcon('AlertCircle'),Bell=__makeIcon('AlertCircle'),BellRing=__makeIcon('AlertCircle'),Zap=__makeIcon('Star'),Sparkles=__makeIcon('Star'),ShoppingCart=__makeIcon('CreditCard'),ShoppingBag=__makeIcon('CreditCard'),Package=__makeIcon('CreditCard'),Tag=__makeIcon('DollarSign'),Bookmark=__makeIcon('Star'),Image=__makeIcon('CreditCard'),Camera=__makeIcon('Search'),Video=__makeIcon('CreditCard'),FileText=__makeIcon('CreditCard'),File=__makeIcon('CreditCard'),Folder=__makeIcon('CreditCard'),Paperclip=__makeIcon('CreditCard'),Send=__makeIcon('ChevronRight'),MessageCircle=__makeIcon('AlertCircle'),MessageSquare=__makeIcon('CreditCard'),Truck=__makeIcon('Car'),Grid=__makeIcon('Menu'),List=__makeIcon('Menu'),Lock=__makeIcon('Shield'),Save=__makeIcon('Check'),HeadphonesIcon=__makeIcon('Phone'),Headphones=__makeIcon('Phone'),Wifi=__makeIcon('Globe'),WifiOff=__makeIcon('X'),Battery=__makeIcon('CreditCard'),Power=__makeIcon('Zap'),Layers=__makeIcon('CreditCard'),Layout=__makeIcon('CreditCard'),Maximize=__makeIcon('CreditCard'),Minimize=__makeIcon('X'),AlertTriangle=__makeIcon('AlertCircle'),ThumbsUp=__makeIcon('Check'),ThumbsDown=__makeIcon('X'),LogIn=__makeIcon('ChevronRight'),LogOut=__makeIcon('ChevronRight'),UserPlus=__makeIcon('User'),UserMinus=__makeIcon('User'),UserCheck=__makeIcon('User'),Percent=__makeIcon('DollarSign'),Hash=__makeIcon('Menu'),AtSign=__makeIcon('Mail'),Gift=__makeIcon('Star'),Repeat=__makeIcon('Settings'),MoreHorizontal=__makeIcon('Menu'),MoreVertical=__makeIcon('Menu'),Sliders=__makeIcon('Settings'),Target=__makeIcon('Search'),Crosshair=__makeIcon('Search'),Compass=__makeIcon('Globe'),Navigation=__makeIcon('MapPin'),Map=__makeIcon('Globe'),Linkedin=__makeIcon('Globe'),Youtube=__makeIcon('Globe'),Github=__makeIcon('Globe'),Chrome=__makeIcon('Globe'),Smartphone=__makeIcon('CreditCard'),Monitor=__makeIcon('CreditCard'),Printer=__makeIcon('CreditCard'),Mic=__makeIcon('Phone'),Volume2=__makeIcon('Phone'),VolumeX=__makeIcon('X');

    try {
      var rawCode = document.getElementById('__component_code__').textContent;
      var fileChunks = rawCode.split('// __FILE_SEPARATOR__');
      var chunkErrors = [];
      var __exports = {};
      function processChunk(code, idx) {
        var fileLabel = (code.match(/\\/\\/ __FILE__:\\s*(.+)/) || [])[1] || ('chunk-' + idx);

        // 1. Extract names that should be exported to global scope BEFORE stripping
        var exportedNames = [];
        var defMatch = code.match(/export\\s+default\\s+(?:function|class)\\s+(\\w+)/);
        if (defMatch) exportedNames.push(defMatch[1]);
        var defNameMatch = code.match(/export\\s+default\\s+(\\w+)\\s*;/);
        if (defNameMatch && exportedNames.indexOf(defNameMatch[1]) === -1) exportedNames.push(defNameMatch[1]);
        var declMatches = code.match(/(?:export\\s+)?(?:const|let|var|function)\\s+(\\w+)/g);
        if (declMatches) {
          declMatches.forEach(function(d) {
            var nm = d.match(/(\\w+)$/);
            if (nm && exportedNames.indexOf(nm[1]) === -1) exportedNames.push(nm[1]);
          });
        }

        // 2. Convert lucide-react imports to local icon vars (scoped inside IIFE)
        code = code.replace(/^import\\s+\\{([^}]+)\\}\\s+from\\s+['"]lucide-react['"]\\s*;?\\s*$/gm, function(m, names) {
          return names.split(',').map(function(n) { n = n.trim(); if (!n) return ''; var parts = n.split(/\\s+as\\s+/); var orig = parts[0].trim(); var alias = (parts[1] || parts[0]).trim(); return 'var ' + alias + ' = __icons[\"' + orig + '\"];'; }).join('\\n');
        });

        // 3. Strip remaining imports
        code = code.replace(/^import\\s+[\\s\\S]*?from\\s+.+$/gm, '');
        code = code.replace(/^import\\s+['"].+['"].*$/gm, '');

        // 4. Strip exports
        code = code.replace(/export\\s+default\\s+function\\s+(\\w+)/g, 'function $1');
        code = code.replace(/export\\s+default\\s+class\\s+(\\w+)/g, 'class $1');
        code = code.replace(/export\\s+default\\s+(\\w+)\\s*;?$/gm, '');
        code = code.replace(/export\\s+(const|function|class|let|var|type|interface|enum)\\s+/g, '$1 ');
        code = code.replace(/export\\s+\\{[^}]*\\}/g, '');
        code = code.replace(/^export\\s+default\\s+/gm, 'var _default = ');

        // 5. Other cleanups
        code = code.replace(/^(?:const|let|var)\\s+\\w+\\s*=\\s*(?:React\\.)?lazy\\s*\\(.*?\\)\\s*;?\\s*$/gm, '');
        code = code.replace(/import\\.meta\\.env\\.\\w+/g, '""');
        code = code.replace(/import\\.meta/g, '({})');
        code = code.replace(/process\\.env\\.\\w+/g, '""');
        code = code.replace(/\\bconst \\{ [^}]+ \\} = require\\([^)]+\\);?/g, '');
        code = code.replace(/\\brequire\\([^)]+\\)/g, '({})');

        try {
          var transformed = Babel.transform(code, { presets: ['react', 'typescript'], filename: fileLabel }).code;
          transformed = transformed.replace(/\\bconst\\s+/g, 'var ');
          transformed = transformed.replace(/\\blet\\s+/g, 'var ');

          // 6. Wrap in IIFE so icon vars stay local, export component names to global
          var exportStmts = exportedNames.filter(function(n) { return n && n !== '_default' && n.length > 1; }).map(function(n) {
            return 'if (typeof ' + n + ' !== "undefined") __exports["' + n + '"] = ' + n + ';';
          }).join('\\n');
          // Import previously exported globals into this IIFE scope (skip router/React mocks)
          var __skipImports = ['Link','NavLink','BrowserRouter','Routes','Route','HashRouter','MemoryRouter','Router','RouterProvider','Navigate','Outlet','Suspense','Fragment','useState','useEffect','useCallback','useMemo','useRef','useReducer','useContext','createContext','useNavigate','useParams','useLocation','useSearchParams','useMatch','useRouteError','useLoaderData','Form','ScrollRestoration','lazy','forwardRef','memo','axios','toast','Toaster','useToast','motion','AnimatePresence','clsx','cn','twMerge','cva'];
          var importStmts = Object.keys(__exports).filter(function(k) { return __skipImports.indexOf(k) === -1; }).map(function(k) {
            return 'var ' + k + ' = __exports["' + k + '"];';
          }).join('\\n');
          transformed = '(function() {\\n' + importStmts + '\\n' + transformed + '\\n' + exportStmts + '\\n})();';

          (0, eval)(transformed);
        } catch(chunkErr) {
          console.warn('[Preview] Error in ' + fileLabel + ':', chunkErr.message, chunkErr.stack);
          chunkErrors.push({ file: fileLabel, error: chunkErr.message });
        }
      }
      for (var fi = 0; fi < fileChunks.length; fi++) {
        processChunk(fileChunks[fi], fi);
      }
      // Copy exports to window for compatibility
      Object.keys(__exports).forEach(function(k) { window[k] = __exports[k]; });
      var root = ReactDOM.createRoot(document.getElementById('root'));
      var AppComp = __exports.App || window.App || null;
      if (!AppComp) {
        var possibleNames = ['App', 'HomePage', 'Home', 'Main', 'Page', 'Root', 'Landing', 'LandingPage', 'Dashboard', 'Layout', 'AppLayout'];
        for (var i = 0; i < possibleNames.length; i++) {
          if (__exports[possibleNames[i]] && typeof __exports[possibleNames[i]] === 'function') { AppComp = __exports[possibleNames[i]]; break; }
          try { if (window[possibleNames[i]] && typeof window[possibleNames[i]] === 'function') { AppComp = window[possibleNames[i]]; break; } } catch(ex) {}
        }
      }
      if (AppComp) {
        var ErrorBoundary = (function() {
          function EB(props) {
            this.state = { hasError: false, error: null };
          }
          EB.prototype = Object.create(React.Component.prototype);
          EB.prototype.constructor = EB;
          EB.getDerivedStateFromError = function(error) { return { hasError: true, error: error }; };
          EB.prototype.componentDidCatch = function(error, info) { console.error('Component error:', error); };
          EB.prototype.render = function() {
            if (this.state.hasError) {
              var msg = this.state.error ? (this.state.error.message || String(this.state.error)) : 'Unknown error';
              return React.createElement('div', { style: { padding: '40px', textAlign: 'center', fontFamily: 'sans-serif', color: '#666' } },
                React.createElement('h3', { style: { marginBottom: '12px', color: '#e53e3e' } }, 'Render Error'),
                React.createElement('pre', { style: { textAlign: 'left', background: '#f7f7f7', padding: '16px', borderRadius: '8px', fontSize: '13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '300px', overflow: 'auto', color: '#c53030' } }, msg)
              );
            }
            return this.props.children;
          };
          return EB;
        })();
        try {
          root.render(React.createElement(ErrorBoundary, null, React.createElement(AppComp)));
        } catch(renderErr) {
          console.error('React render error:', renderErr);
          document.getElementById('root').innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#666"><h3 style="margin-bottom:12px;color:#e53e3e">Render Error</h3><pre style="text-align:left;background:#f7f7f7;padding:16px;border-radius:8px;font-size:13px;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto;color:#c53030">' + (renderErr.message || String(renderErr)).replace(/</g, '&lt;') + '</pre></div>';
        }
      } else {
        document.getElementById('root').innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#666"><h3>No App Component</h3><p>Could not find main component to render.</p></div>';
      }
    } catch(e) {
      console.error('Preview render error:', e);
      var errMsg = (e.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var errStack = (e.stack || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      var errLine = '';
      if (e.loc) errLine = '<p style="font-size:12px;color:#888;margin-top:4px">Line ' + e.loc.line + ', Column ' + e.loc.column + '</p>';
      var chunkInfo = chunkErrors.length > 0 ? '<p style="font-size:12px;color:#888;margin-top:8px">File errors: ' + chunkErrors.map(function(ce) { return ce.file + ': ' + ce.error; }).join('; ') + '</p>' : '';
      document.getElementById('root').innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif;color:#666"><h3 style="margin-bottom:12px;color:#e53e3e">Preview Error</h3><pre style="text-align:left;background:#f7f7f7;padding:16px;border-radius:8px;font-size:13px;white-space:pre-wrap;word-break:break-word;max-height:300px;overflow:auto;color:#c53030">' + errMsg + '</pre><pre style="text-align:left;background:#f0f0f0;padding:12px;border-radius:8px;font-size:11px;white-space:pre-wrap;word-break:break-word;max-height:200px;overflow:auto;color:#666;margin-top:8px">' + errStack + '</pre>' + errLine + chunkInfo + '</div>';
    }
  <\/script>
</body>
</html>`;
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
    { id: "iphone16_pro_max", label: "iPhone 16 Pro Max", Icon: Smartphone, width: 440, height: 956, group: "phone" },
    { id: "iphone16_pro", label: "iPhone 16 Pro", Icon: Smartphone, width: 402, height: 874, group: "phone" },
    { id: "iphone16", label: "iPhone 16", Icon: Smartphone, width: 393, height: 852, group: "phone" },
    { id: "iphone14", label: "iPhone 14", Icon: Smartphone, width: 390, height: 844, group: "phone" },
    { id: "iphonese", label: "iPhone SE", Icon: Smartphone, width: 375, height: 667, group: "phone" },
    { id: "pixel_9_pro", label: "Pixel 9 Pro", Icon: Smartphone, width: 412, height: 915, group: "phone" },
    { id: "pixel_9", label: "Pixel 9", Icon: Smartphone, width: 412, height: 892, group: "phone" },
    { id: "samsung_s25_ultra", label: "Galaxy S25 Ultra", Icon: Smartphone, width: 412, height: 915, group: "phone" },
    { id: "samsung_s25", label: "Galaxy S25", Icon: Smartphone, width: 412, height: 892, group: "phone" },
    { id: "samsung_a15", label: "Galaxy A15", Icon: Smartphone, width: 384, height: 854, group: "phone" },
    { id: "ipad_pro_13", label: "iPad Pro 13\"", Icon: Tablet, width: 1032, height: 1376, group: "tablet" },
    { id: "ipad_pro_11", label: "iPad Pro 11\"", Icon: Tablet, width: 834, height: 1194, group: "tablet" },
    { id: "ipad_air", label: "iPad Air", Icon: Tablet, width: 820, height: 1180, group: "tablet" },
    { id: "ipad_mini", label: "iPad Mini", Icon: Tablet, width: 768, height: 1024, group: "tablet" },
    { id: "samsung_tab_s9", label: "Galaxy Tab S9", Icon: Tablet, width: 800, height: 1280, group: "tablet" },
    { id: "surface_pro", label: "Surface Pro", Icon: Tablet, width: 912, height: 1368, group: "tablet" },
    { id: "macbook_air", label: "MacBook Air 13\"", Icon: Laptop, width: 1280, height: 800, group: "desktop" },
    { id: "macbook_pro_16", label: "MacBook Pro 16\"", Icon: Laptop, width: 1728, height: 1117, group: "desktop" },
    { id: "desktop_hd", label: "Desktop HD", Icon: Monitor, width: 1440, height: 900, group: "desktop" },
    { id: "fullhd", label: "Full HD", Icon: Monitor, width: 1920, height: 1080, group: "desktop" },
    { id: "imac_24", label: "iMac 24\"", Icon: Monitor, width: 2048, height: 1152, group: "desktop" },
    { id: "ultrawide", label: "Ultrawide", Icon: Monitor, width: 2560, height: 1080, group: "desktop" },
  ];

  const currentDevice = DEVICES.find(d => d.id === selectedDevice) ?? DEVICES[0];

  const handleRefresh = () => {
    setIsRefreshing(true);
    setPreviewKey(k => k + 1);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleFileUpload = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !id) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (let i = 0; i < fileList.length; i++) {
        formData.append("files", fileList[i]);
      }
      formData.append("directory", "public/assets");
      const baseUrl = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${baseUrl}/api/projects/${id}/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        queryClient.invalidateQueries({ queryKey: ["listProjectFiles", id] });
        setPreviewKey(k => k + 1);
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `${t.upload_success}: ${(data.files || []).map((f: any) => f.filePath).join(", ")}`,
          timestamp: new Date(),
        }]);
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || t.upload_error;
        setMessages(prev => [...prev, {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `${t.upload_error}: ${errMsg}`,
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      console.error("Upload failed:", err);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: "assistant",
        content: t.upload_error,
        timestamp: new Date(),
      }]);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [id, queryClient, t]);

  const handleNavBack = () => {
    try { iframeRef.current?.contentWindow?.history.back(); } catch {}
  };

  const handleNavForward = () => {
    try { iframeRef.current?.contentWindow?.history.forward(); } catch {}
  };

  return (
    <div className="flex h-screen bg-[#0e1525] text-[#e1e4e8] overflow-hidden">

      {leftPanelOpen && <div style={{ width: leftWidth }} className="flex flex-col border-e border-[#1c2333] bg-[#0d1117] flex-shrink-0 relative">
        <div className="border-b border-[#1c2333]">
          <div className="px-3 py-2 flex items-center gap-2">
            <Link href="/dashboard" className="p-1.5 text-[#8b949e] hover:text-[#e1e4e8] transition-colors rounded hover:bg-[#1c2333]">
              <ArrowLeft className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-semibold text-[#e1e4e8] truncate">{project?.name || t.loading}</h1>
            </div>
            <CollaboratorAvatars collaborators={collaborators} currentUserId={me?.id} />
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#1f6feb]/20 text-[#58a6ff] font-medium flex items-center gap-1.5 flex-shrink-0">
              {isBuilding && <span className="w-1.5 h-1.5 rounded-full bg-[#58a6ff] animate-pulse" />}
              {t.agent_label} • {actionCount}
            </span>
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5 flex-wrap">
            <Link
              href={`/project/${id}/analytics`}
              className="text-[10px] px-2 py-1 rounded-md font-medium flex items-center gap-1 flex-shrink-0 transition-all bg-[#d2a8ff]/10 text-[#d2a8ff] hover:bg-[#d2a8ff]/20"
            >
              <BarChart3 className="w-3 h-3" />
              {t.analytics}
            </Link>
            <button
              onClick={() => { setShowTranslationsPanel(v => !v); setShowDeployPanel(false); setShowPwaPanel(false); }}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md font-medium flex items-center gap-1 flex-shrink-0 transition-all",
                showTranslationsPanel
                  ? "bg-cyan-500/20 text-cyan-400"
                  : "bg-[#1c2333] text-[#8b949e] hover:bg-[#30363d] hover:text-[#e1e4e8]"
              )}
            >
              <Languages className="w-3 h-3" />
              {t.translations_panel}
            </button>
            <button
              onClick={() => { setShowPwaPanel(v => !v); setShowDeployPanel(false); setShowTranslationsPanel(false); }}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md font-medium flex items-center gap-1 flex-shrink-0 transition-all",
                showPwaPanel
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-[#1c2333] text-[#8b949e] hover:bg-[#30363d] hover:text-[#e1e4e8]"
              )}
            >
              <SmartphoneIcon className="w-3 h-3" />
              PWA
            </button>
            <button
              onClick={() => { setShowDeployPanel(v => !v); setShowPwaPanel(false); setShowTranslationsPanel(false); }}
              disabled={!canDeploy && !isDeployed && !deploymentStatus}
              className={cn(
                "text-[10px] px-2 py-1 rounded-md font-medium flex items-center gap-1 flex-shrink-0 transition-all",
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

        <AnimatePresence>
          {showTranslationsPanel && id && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-b border-[#1c2333] max-h-[60vh]"
            >
              <TranslationsPanel
                projectId={id}
                onInjectSwitcher={() => {
                  if (!id) return;
                  const htmlFileForSwitcher = files.find(f => f.filePath?.endsWith('.html'));
                  if (htmlFileForSwitcher?.id && htmlFileForSwitcher.content) {
                    const switcherScript = `
<script>
(function() {
  var switcher = document.createElement('div');
  switcher.id = 'lang-switcher';
  switcher.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;background:#1a1a2e;border-radius:12px;padding:8px;display:flex;gap:4px;box-shadow:0 4px 20px rgba(0,0,0,0.3);font-family:system-ui,sans-serif;';
  var langs = document.querySelectorAll('[data-lang]');
  var allLangs = new Set();
  langs.forEach(function(el) { allLangs.add(el.getAttribute('data-lang')); });
  if (allLangs.size === 0) { allLangs.add(document.documentElement.lang || 'en'); }
  allLangs.forEach(function(code) {
    var btn = document.createElement('button');
    btn.textContent = code.toUpperCase();
    btn.style.cssText = 'padding:6px 12px;border:none;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;background:#2a2a4a;color:#e1e4e8;transition:all 0.2s;';
    btn.addEventListener('mouseenter', function() { btn.style.background='#3a3a6a'; });
    btn.addEventListener('mouseleave', function() { btn.style.background='#2a2a4a'; });
    btn.addEventListener('click', function() {
      var rtlLangs = ['ar','he','fa','ur'];
      document.documentElement.dir = rtlLangs.indexOf(code) >= 0 ? 'rtl' : 'ltr';
      document.documentElement.lang = code;
      document.querySelectorAll('[data-lang]').forEach(function(el) {
        el.style.display = el.getAttribute('data-lang') === code ? '' : 'none';
      });
      switcher.querySelectorAll('button').forEach(function(b) { b.style.background='#2a2a4a'; });
      btn.style.background='#1f6feb';
    });
    switcher.appendChild(btn);
  });
  document.body.appendChild(switcher);
})();
<\/script>`;
                    const newContent = htmlFileForSwitcher.content.replace('</body>', switcherScript + '\n</body>');
                    updateFileMut.mutateAsync({
                      projectId: id,
                      fileId: htmlFileForSwitcher.id,
                      content: newContent,
                    }).then(() => {
                      handleRefresh();
                    });
                  }
                }}
              />
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
                        "text-[13px] leading-relaxed",
                        msg.role === "user"
                          ? "text-[#e1e4e8]"
                          : "text-[#c9d1d9]"
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

          {(isBuilding || isChatLoading) && (() => {
            const activeLog = logs.find(l => l.status === "in_progress" || l.status === "running" || l.status === "pending");
            const activeAgent = activeLog?.agentType;
            const agentLabel = activeAgent
              ? (agentNames[activeAgent] ? agentNames[activeAgent][lang] : activeAgent)
              : null;
            return (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-500/20 text-emerald-400">
                  <Bot className="w-3 h-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 pt-1">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#58a6ff]" />
                    <span className="text-[12px] text-[#c9d1d9]">
                      {isChatLoading
                        ? (lang === "ar" ? "يفكر..." : "Thinking...")
                        : agentLabel
                          ? (lang === "ar" ? `${agentLabel} يعمل الآن...` : `${agentLabel} working...`)
                          : (lang === "ar" ? "الوكلاء يعملون..." : "Agents working...")}
                    </span>
                  </div>
                  {isBuilding && !isChatLoading && (
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#58a6ff] opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#58a6ff]"></span>
                      </span>
                      <span className="text-[10px] text-[#58a6ff] font-medium">
                        {lang === "ar" ? "بث مباشر — الوكلاء يعملون أمامك" : "LIVE — agents executing in real-time"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {logs.length > 0 && <ExecutionLogTimeline logs={logs} isBuilding={isBuilding} />}

          <div ref={chatEndRef} />
        </div>

        <div className="p-3 border-t border-[#1c2333] bg-[#0d1117]">
          <div className="flex items-center justify-between mb-2">
            <LanguageToggle className="!bg-[#161b22] !text-[#8b949e] hover:!bg-[#1c2333] !px-2 !py-1 !text-xs !rounded-md" />
            {isBuilding && activeBuildId && (
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/build/${activeBuildId}/cancel`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                    });
                    if (res.ok) {
                      setMessages(prev => [...prev, {
                        id: crypto.randomUUID(),
                        role: "assistant",
                        content: lang === "ar" ? "تم إرسال طلب الإلغاء... سيتوقف البناء قريباً" : "Cancel request sent... build will stop shortly",
                        timestamp: new Date(),
                      }]);
                    }
                  } catch {}
                }}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 border border-red-500/30 text-red-400 rounded-md hover:bg-red-500/20 transition-colors text-xs font-medium"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
                {lang === "ar" ? "إيقاف البناء" : "Stop Build"}
              </button>
            )}
          </div>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={isBuilding
                ? (lang === "ar" ? "اكتب ملاحظة أو تعديل للتطبيق بعد انتهاء البناء..." : "Write a note or change for after the build finishes...")
                : t.prompt_placeholder}
              disabled={isChatLoading}
              className={cn(
                "w-full bg-[#161b22] border rounded-lg p-3 pe-10 resize-none h-20 focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]/50 transition-all text-sm text-[#e1e4e8] placeholder-[#484f58]",
                isBuilding ? "border-[#58a6ff]/30" : "border-[#30363d]",
                isChatLoading && "opacity-50"
              )}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isBuilding) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
            />
            <button
              data-auto-submit
              onClick={handleGenerate}
              disabled={isBuilding || !prompt.trim()}
              className="absolute end-2 bottom-2 p-1.5 bg-[#1f6feb] text-white rounded-md hover:bg-[#388bfd] disabled:opacity-40 disabled:hover:bg-[#1f6feb] transition-colors"
            >
              {isBuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />}
            </button>
          </div>
        </div>
      </div>}

      {leftPanelOpen && (
        <div
          onMouseDown={handleLeftDragStart}
          onDoubleClick={() => setLeftPanelOpen(false)}
          className="w-[3px] cursor-col-resize flex-shrink-0 relative group hover:bg-[#1f6feb] active:bg-[#1f6feb] transition-colors"
        >
          <div className="absolute inset-y-0 -inset-x-1 z-10" />
        </div>
      )}

      {!leftPanelOpen && (
        <button
          onClick={() => setLeftPanelOpen(true)}
          className="w-[3px] flex-shrink-0 relative hover:bg-[#1f6feb] transition-colors cursor-pointer group"
          title="Expand chat"
        >
          <div className="absolute top-1/2 -translate-y-1/2 end-0 translate-x-1/2 w-4 h-8 bg-[#1c2333] border border-[#30363d] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <ChevronRight className={cn("w-3 h-3 text-[#8b949e]", lang === "ar" && "rotate-180")} />
          </div>
        </button>
      )}

      <div className="flex-1 flex flex-col border-e border-[#1c2333] min-w-0">
        <BuildProgress currentPhase={currentPhase} failed={phaseFailed} allComplete={buildStatus?.status === "completed"} />

        {(hasPreview || previewUrl) && (
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
                <div className="absolute end-0 top-full mt-1 w-56 max-h-[420px] overflow-y-auto bg-[#161b22] border border-[#30363d] rounded-lg shadow-xl z-50 py-1">
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
            {!isBuilding && (
              <button
                onClick={handleToggleCSSEditor}
                className={cn(
                  "p-1 rounded transition-colors",
                  cssEditorActive
                    ? "text-[#58a6ff] bg-[#1f6feb]/20"
                    : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
                )}
                title={t.css_editor_tab}
              >
                <Paintbrush className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 relative bg-[#0d1117] overflow-hidden flex flex-col" onClick={() => showDeviceMenu && setShowDeviceMenu(false)}>
          <div className="flex-1 overflow-hidden relative">
            {(hasPreview || previewUrl) ? (
              <DevicePreviewFrame device={currentDevice} previewKey={previewKey}>
                {previewUrl ? (
                  <iframe
                    key={`url-${previewKey}`}
                    ref={iframeRef}
                    src={previewUrl}
                    className="border-0 bg-white"
                    style={{ width: "100%", height: "100%", display: "block" }}
                    title={t.live_preview}
                  />
                ) : (
                  <iframe
                    key={`doc-${previewKey}`}
                    ref={iframeRef}
                    srcDoc={buildPreviewHtml()}
                    sandbox="allow-scripts"
                    className="border-0 bg-white"
                    style={{ width: "100%", height: "100%", display: "block" }}
                    title={t.live_preview}
                  />
                )}
              </DevicePreviewFrame>
            ) : (
              <div className="h-full flex items-center justify-center text-[#484f58]">
                <div className="text-center">
                  <Eye className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">{t.preview_unavailable}</p>
                </div>
              </div>
            )}

            {isBuilding && (
              <div className="absolute bottom-0 start-0 end-0 z-30">
                <div className="bg-[#0d1117]/95 backdrop-blur-sm border-t border-[#1c2333] max-h-[280px] overflow-y-auto">
                  <div className="p-3">
                    <LiveBuildView logs={logs} buildStatus={buildStatus?.status} lang={lang} t={t} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {!rightPanelOpen && (
        <button
          onClick={() => setRightPanelOpen(true)}
          className="w-[3px] flex-shrink-0 relative hover:bg-[#1f6feb] transition-colors cursor-pointer group"
          title="Expand panel"
        >
          <div className="absolute top-1/2 -translate-y-1/2 start-0 -translate-x-1/2 w-4 h-8 bg-[#1c2333] border border-[#30363d] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20">
            <ChevronLeft className={cn("w-3 h-3 text-[#8b949e]", lang === "ar" && "rotate-180")} />
          </div>
        </button>
      )}

      {rightPanelOpen && (
        <div
          onMouseDown={handleRightDragStart}
          onDoubleClick={() => setRightPanelOpen(false)}
          className="w-[3px] cursor-col-resize flex-shrink-0 relative group hover:bg-[#1f6feb] active:bg-[#1f6feb] transition-colors"
        >
          <div className="absolute inset-y-0 -inset-x-1 z-10" />
        </div>
      )}

      {cssEditorActive ? (
        <CSSEditorPanel
          selectedElement={cssEditor.selectedElement}
          onChangeProperty={cssEditor.changeProperty}
          onUndo={cssEditor.undo}
          onRedo={cssEditor.redo}
          onSave={handleSaveCSS}
          onClose={handleToggleCSSEditor}
          onClear={cssEditor.clearAll}
          canUndo={cssEditor.canUndo}
          canRedo={cssEditor.canRedo}
          changeCount={cssEditor.changeCount}
          generatedCSS={cssEditor.generateCSS()}
          isSaving={cssSaving}
        />
      ) : rightPanelOpen ? (
        <div style={{ width: rightWidth }} className="flex flex-col bg-[#0d1117] flex-shrink-0 border-s border-[#1c2333]">
          <div className="h-9 flex items-center border-b border-[#1c2333] bg-[#161b22] flex-shrink-0 px-1 overflow-x-auto">
            <button
              onClick={() => setRightTab("code")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1",
                rightTab === "code"
                  ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                  : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
              )}
            >
              <Code2 className="w-3 h-3" />
              {t.code_tab}
            </button>
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
              onClick={() => setRightTab("plugins")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1",
                rightTab === "plugins"
                  ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                  : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
              )}
            >
              <Puzzle className="w-3 h-3" />
              {t.plugin_store}
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
            <button
              onClick={() => setRightTab("collab")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1.5",
                rightTab === "collab"
                  ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                  : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
              )}
            >
              <Users className="w-3 h-3" />
              {t.collab_panel_title}
              {collaborators.length > 1 && (
                <span className="text-[9px] bg-[#1f6feb]/20 text-[#58a6ff] px-1.5 rounded-full">
                  {collaborators.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setRightTab("domains")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1",
                rightTab === "domains"
                  ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                  : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
              )}
            >
              <Globe className="w-3 h-3" />
              {t.domain_settings}
            </button>
            <button
              onClick={() => setRightTab("seo")}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1",
                rightTab === "seo"
                  ? "bg-[#0d1117] text-[#e1e4e8] shadow-sm"
                  : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]"
              )}
            >
              <Search className="w-3 h-3" />
              {t.seo_tab}
            </button>
          </div>

          {rightTab === "code" ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="h-8 flex items-center justify-between px-3 border-b border-[#1c2333] bg-[#161b22]">
                <span className="text-[11px] font-semibold text-[#8b949e] uppercase tracking-wider">{t.explorer}</span>
                <div className="flex items-center gap-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.css,.js,.json,.html,.svg,.woff,.woff2,.ttf,.pdf"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !id}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-[#8b949e] hover:text-[#58a6ff] hover:bg-[#1c2333] rounded transition-colors disabled:opacity-50"
                    title={t.upload_files}
                  >
                    {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  </button>
                </div>
              </div>
              <div className="flex-1 flex flex-col min-h-0">
                <div className="max-h-[200px] overflow-y-auto border-b border-[#1c2333]">
                  <InlineFileTree
                    files={files}
                    selectedIndex={selectedFileIndex}
                    onFileSelect={setSelectedFileIndex}
                  />
                </div>
                <div className="flex-1 flex flex-col min-h-0">
                  {files.length > 0 ? (
                    <>
                      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1c2333] bg-[#161b22] overflow-x-auto flex-shrink-0">
                        {files.map((f, i) => {
                          const fp = f.filePath || "";
                          const lock = fileLocks[fp];
                          const isLockedByOther = lock && lock.userId !== me?.id;
                          return (
                            <button
                              key={f.id || i}
                              onClick={() => { setSelectedFileIndex(i); sendFileOpen(fp); }}
                              className={cn(
                                "px-2.5 py-1 text-[11px] font-mono rounded transition-colors flex items-center gap-1.5 whitespace-nowrap",
                                selectedFileIndex === i
                                  ? "bg-[#0d1117] text-[#e1e4e8] border border-[#30363d]"
                                  : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333]",
                                isLockedByOther && "opacity-60"
                              )}
                            >
                              <FileCode2 className="w-3 h-3" />
                              {fp.split('/').pop() || `file-${i}`}
                              <FileLockIndicator filePath={fp} fileLocks={fileLocks} currentUserId={me?.id} />
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex-1 overflow-hidden relative">
                        {(() => {
                          const currentFp = files[selectedFileIndex]?.filePath || "";
                          const currentLock = fileLocks[currentFp];
                          const isLockedByOther = currentLock && currentLock.userId !== me?.id;
                          const isLockedByMe = currentLock && currentLock.userId === me?.id;
                          return (
                            <>
                              {currentFp && !isBuilding && (
                                <div className="absolute top-1 end-2 z-10 flex items-center gap-1">
                                  {isLockedByMe ? (
                                    <button
                                      onClick={() => unlockFile(currentFp)}
                                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                                    >
                                      <Unlock className="w-2.5 h-2.5" />
                                      {t.collab_unlock}
                                    </button>
                                  ) : !currentLock ? (
                                    <button
                                      onClick={() => lockFile(currentFp)}
                                      className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-[#1c2333] text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#30363d] transition-colors"
                                    >
                                      <Lock className="w-2.5 h-2.5" />
                                      {t.collab_lock}
                                    </button>
                                  ) : null}
                                </div>
                              )}
                              <CodeEditor
                                content={files[selectedFileIndex]?.content || ""}
                                filePath={files[selectedFileIndex]?.filePath || "file.txt"}
                                readOnly={isBuilding || !!isLockedByOther}
                                onSave={!isBuilding && !isLockedByOther && id && files[selectedFileIndex]?.id ? (newContent: string) => {
                                  updateFileMut.mutate({
                                    projectId: id!,
                                    fileId: files[selectedFileIndex].id,
                                    content: newContent,
                                  });
                                  sendFileEdit(currentFp, newContent);
                                } : undefined}
                              />
                            </>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-[#484f58]">
                      <p className="text-sm">{t.no_files}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : rightTab === "library" ? (
            <FileLibrary files={files} onFileSelect={(idx) => { setSelectedFileIndex(idx); setRightTab("code"); }} />
          ) : rightTab === "plugins" ? (
            id ? <PluginStore projectId={id} /> : null
          ) : rightTab === "snapshots" ? (
            id ? <SnapshotsPanel projectId={id} /> : null
          ) : rightTab === "domains" ? (
            <div className="flex-1 overflow-y-auto">
              <DomainSettings projectId={id || ""} />
            </div>
          ) : rightTab === "seo" ? (
            <div className="flex-1 overflow-y-auto">
              <SeoPanel projectId={id || ""} />
            </div>
          ) : (
            <CollaborationPanel
              collaborators={collaborators}
              fileLocks={fileLocks}
              notifications={notifications}
              connected={wsConnected}
              currentUserId={me?.id}
              onLockFile={lockFile}
              onUnlockFile={unlockFile}
            />
          )}
        </div>
      ) : null}
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

function ExecutionLogTimeline({ logs, isBuilding }: { logs: ExecutionLog[]; isBuilding: boolean }) {
  const { t, lang } = useI18n();
  const logEndRef = React.useRef<HTMLDivElement>(null);
  const agentLabels: Record<string, { en: string; ar: string }> = {
    system: { en: "System", ar: "النظام" },
    planner: { en: "Planner", ar: "المخطط" },
    codegen: { en: "Code Generator", ar: "مولّد الكود" },
    reviewer: { en: "Code Reviewer", ar: "المراجع" },
    fixer: { en: "Code Fixer", ar: "المصلح" },
    surgical_edit: { en: "Editor", ar: "المحرر" },
    package_runner: { en: "Runner", ar: "المشغّل" },
    qa: { en: "QA", ar: "ضمان الجودة" },
    qa_pipeline: { en: "QA", ar: "ضمان الجودة" },
    filemanager: { en: "File Manager", ar: "مدير الملفات" },
  };

  React.useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  return (
    <div className="mt-3 bg-[#0d1117] border border-[#1c2333] rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1c2333] bg-[#161b22]">
        <Code2 className="w-3.5 h-3.5 text-[#8b949e]" />
        <span className="text-[11px] font-semibold text-[#e1e4e8] uppercase tracking-wider">{t.execution_log}</span>
        {isBuilding && (
          <span className="flex items-center gap-1 ms-1">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
            </span>
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">LIVE</span>
          </span>
        )}
      </div>

      <div className="max-h-[300px] overflow-y-auto px-3 py-2 space-y-2 font-mono text-[12px]">
        {logs.map((log, i) => {
          const time = log.createdAt ? new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
          const isCompleted = log.status === "completed" || log.status === "success";
          const isFailed = log.status === "failed" || log.status === "error";
          const isRunning = log.status === "in_progress" || log.status === "running" || log.status === "pending";
          const details = log.details as Record<string, unknown> | null;
          const message = details?.message as string | undefined;
          const agentName = agentLabels[log.agentType || "system"]?.[lang] || log.agentType || "SYSTEM";

          return (
            <motion.div
              key={log.id || i}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="group"
            >
              <div className="flex items-start gap-2">
                <span className="text-[10px] text-[#484f58] flex-shrink-0 pt-0.5 tabular-nums">{time}</span>
                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center mt-0.5">
                  {isCompleted ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  ) : isFailed ? (
                    <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  ) : isRunning ? (
                    <Loader2 className="w-3.5 h-3.5 text-[#58a6ff] animate-spin" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#484f58]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className={cn(
                    "text-[11px] font-bold me-1.5",
                    isCompleted ? "text-emerald-400" : isFailed ? "text-red-400" : isRunning ? "text-[#58a6ff]" : "text-[#8b949e]"
                  )}>
                    [{agentName}]
                  </span>
                  {message ? (
                    <span className="text-[#c9d1d9] whitespace-pre-wrap leading-relaxed">{message}</span>
                  ) : (
                    <span className="text-[#8b949e]">{log.action}</span>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {isBuilding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 py-1"
          >
            <span className="text-[10px] text-[#484f58] flex-shrink-0 tabular-nums">
              {new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <Loader2 className="w-3.5 h-3.5 text-[#58a6ff] animate-spin" />
            <span className="text-[#58a6ff] animate-pulse">
              {lang === "ar" ? "جاري التنفيذ..." : "executing..."}
            </span>
          </motion.div>
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}

function DevicePreviewFrame({ device, previewKey, children }: {
  device: { id: string; width: number | null; height: number | null; group: string | null };
  previewKey: number;
  children: React.ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!device.width || !containerRef.current) {
      setScale(1);
      return;
    }
    const container = containerRef.current.parentElement;
    if (!container) return;

    const updateScale = () => {
      const cw = container.clientWidth - 32;
      const ch = container.clientHeight - 32;
      const sw = cw / device.width!;
      const sh = ch / device.height!;
      const s = Math.min(sw, sh, 1);
      setScale(Math.round(s * 100) / 100);
    };

    updateScale();
    const ro = new ResizeObserver(updateScale);
    ro.observe(container);
    return () => ro.disconnect();
  }, [device.width, device.height, previewKey]);

  if (!device.width) {
    return (
      <div className="w-full h-full bg-[#0d1117] overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center overflow-hidden bg-[#0d1117]" ref={containerRef}>
      <div
        className="flex-shrink-0 bg-[#161b22] overflow-hidden relative"
        style={{
          width: `${device.width}px`,
          height: `${device.height}px`,
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: "center center",
          transition: "transform 300ms ease",
          borderRadius: device.group === "phone" ? "24px" : device.group === "tablet" ? "12px" : "4px",
          boxShadow: "0 0 0 1px #30363d, 0 8px 32px rgba(0,0,0,0.5)",
          border: device.group === "phone" ? "6px solid #21262d" : device.group === "tablet" ? "4px solid #21262d" : "none",
        }}
      >
        {children}
      </div>
      {scale < 1 && (
        <div className="absolute bottom-2 start-2 text-[10px] text-[#484f58] font-mono bg-[#0d1117]/80 px-1.5 py-0.5 rounded">
          {Math.round(scale * 100)}%
        </div>
      )}
    </div>
  );
}

function LiveBuildView({ logs, buildStatus, lang, t }: { logs: ExecutionLog[]; buildStatus?: string; lang: string; t: Record<string, string> }) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const isRtl = lang === "ar";

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs.length]);

  const agentSteps = [
    { key: "codegen", ar: "توليد الكود", en: "Generating Code", descAr: "يكتب الملفات والمكونات", descEn: "Writing files & components" },
    { key: "reviewer", ar: "مراجعة الكود", en: "Reviewing Code", descAr: "يفحص الجودة والأخطاء", descEn: "Checking quality & errors" },
    { key: "fixer", ar: "إصلاح الأخطاء", en: "Fixing Issues", descAr: "يصلح المشاكل المكتشفة", descEn: "Fixing detected problems" },
    { key: "filemanager", ar: "حفظ الملفات", en: "Saving Files", descAr: "يحفظ الملفات في المشروع", descEn: "Saving files to project" },
    { key: "package_runner", ar: "تثبيت الحزم", en: "Installing Packages", descAr: "يثبت المكتبات المطلوبة", descEn: "Installing dependencies" },
    { key: "qa", ar: "فحص الجودة", en: "Quality Check", descAr: "يتأكد من عمل الموقع", descEn: "Verifying site works" },
  ];

  const getStepStatus = (key: string) => {
    const stepLogs = logs.filter(l => l.agentType === key);
    if (stepLogs.length === 0) return "waiting";
    const hasFailed = stepLogs.some(l => l.status === "failed" || l.status === "error");
    const hasCompleted = stepLogs.some(l => l.status === "completed" || l.status === "success");
    const last = stepLogs[stepLogs.length - 1];
    if (last.status === "in_progress") return "active";
    if (hasFailed && hasCompleted) return "partial";
    if (hasFailed) return "failed";
    if (hasCompleted) return "done";
    return "active";
  };

  const activeStep = agentSteps.findIndex(s => getStepStatus(s.key) === "active");
  const completedCount = agentSteps.filter(s => getStepStatus(s.key) === "done" || getStepStatus(s.key) === "partial").length;
  const progress = Math.round((completedCount / agentSteps.length) * 100);

  return (
    <div className="h-full flex flex-col items-center justify-center p-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#1f6feb]/10 mb-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#58a6ff]" />
          </div>
          <h3 className="text-lg font-semibold text-[#e6edf3]">
            {isRtl ? "جاري البناء..." : "Building..."}
          </h3>
          <div className="w-full h-2 rounded-full bg-[#1c2333] overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-[#1f6feb] to-[#58a6ff] rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${Math.max(progress, activeStep >= 0 ? ((activeStep + 0.5) / agentSteps.length) * 100 : 5)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <p className="text-xs text-[#484f58]">{progress}%</p>
        </div>

        <div className="space-y-1">
          {agentSteps.map((step, idx) => {
            const status = getStepStatus(step.key);
            return (
              <motion.div
                key={step.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-300",
                  status === "active" && "bg-[#1f6feb]/8 border border-[#1f6feb]/25",
                  status === "done" && "opacity-70",
                  status === "partial" && "opacity-70",
                  status === "failed" && "opacity-70",
                  status === "waiting" && "opacity-30",
                )}
              >
                <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
                  {status === "active" && <Loader2 className="w-4 h-4 animate-spin text-[#58a6ff]" />}
                  {status === "done" && <Check className="w-4 h-4 text-emerald-400" />}
                  {status === "partial" && <AlertTriangle className="w-4 h-4 text-yellow-400" />}
                  {status === "failed" && <XCircle className="w-4 h-4 text-red-400" />}
                  {status === "waiting" && <div className="w-2 h-2 rounded-full bg-[#30363d]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    status === "active" && "text-[#e6edf3]",
                    status === "done" && "text-[#8b949e]",
                    status === "partial" && "text-[#8b949e]",
                    status === "failed" && "text-[#8b949e]",
                    status === "waiting" && "text-[#484f58]",
                  )}>
                    {isRtl ? step.ar : step.en}
                  </p>
                  {status === "active" && (
                    <p className="text-xs text-[#484f58] mt-0.5">{isRtl ? step.descAr : step.descEn}</p>
                  )}
                </div>
                {status === "active" && (
                  <div className="flex-shrink-0">
                    <span className="text-[10px] text-[#58a6ff] animate-pulse">{isRtl ? "جاري..." : "..."}</span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
