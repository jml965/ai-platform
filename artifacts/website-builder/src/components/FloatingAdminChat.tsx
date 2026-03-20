import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Crown, Activity, Crosshair, Server, Palette, Database, Lock, Rocket,
  FlaskConical, Bot, Wand2, Trash2, X, Send, Minimize2, Maximize2,
  ChevronDown, GripHorizontal, MessageSquare, Terminal, FileText, HardDrive,
  Settings, FolderOpen, Shield, PanelLeftOpen, PanelLeftClose, Plus, MoreHorizontal,
  Pencil, Check, Camera, Crop, Image as ImageIcon, Scissors, Copy, Download, CheckCheck,
  Save, File, Eye,
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

interface ChatThread {
  id: string;
  title: string;
  agentKey: string;
  messages: ChatMsg[];
  createdAt: number;
  updatedAt: number;
}

const THREADS_KEY = "floating-chat-threads";

function loadThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(THREADS_KEY);
    if (raw) {
      const threads = JSON.parse(raw);
      return threads.map((t: any) => ({
        ...t,
        messages: (t.messages || []).filter((m: any) => m.role !== "status").map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
      }));
    }
  } catch {}
  return [];
}

function saveThreads(threads: ChatThread[]) {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, 50)));
  } catch {}
}

function generateTitle(msgs: ChatMsg[]): string {
  const first = msgs.find(m => m.role === "user");
  if (!first) return "محادثة جديدة";
  const text = first.content.replace(/\[.*?\]/g, "").replace(/\n.*/s, "").trim();
  return text.length > 40 ? text.slice(0, 40) + "..." : text || "محادثة جديدة";
}

interface SavedFile {
  id: string;
  name: string;
  lang: string;
  content: string;
  agentKey: string;
  savedAt: number;
}

const FILES_KEY = "floating-chat-files";

function loadSavedFiles(): SavedFile[] {
  try {
    const raw = localStorage.getItem(FILES_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveSavedFiles(files: SavedFile[]) {
  try {
    localStorage.setItem(FILES_KEY, JSON.stringify(files.slice(0, 200)));
  } catch {}
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
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [wandMode, setWandMode] = useState(false);
  const [wandHighlight, setWandHighlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreads());
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"chats" | "files">("chats");
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [threadMenuId, setThreadMenuId] = useState<string | null>(null);

  const [savedFiles, setSavedFiles] = useState<SavedFile[]>(() => loadSavedFiles());
  const [fileMenuId, setFileMenuId] = useState<string | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
  const [renameFileName, setRenameFileName] = useState("");
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  const [screenshotMode, setScreenshotMode] = useState<"off" | "full" | "crop" | "capturing">("off");
  const [cropRect, setCropRect] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const [pendingImages, setPendingImages] = useState<{ data: string; name: string }[]>([]);
  const [showScreenshotMenu, setShowScreenshotMenu] = useState(false);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pos, setPos] = useState(saved?.pos || { x: window.innerWidth - 420, y: window.innerHeight - 580 });
  const [size, setSize] = useState(saved?.size || { w: 380, h: 520 });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ pos, size, agentKey: selectedAgent?.agentKey }));
    } catch {}
  }, [pos, size, selectedAgent]);

  useEffect(() => { saveThreads(threads); }, [threads]);

  useEffect(() => {
    if (activeThreadId) {
      const thread = threads.find(t => t.id === activeThreadId);
      if (thread) setMessages(thread.messages);
    }
  }, [activeThreadId]);

  const syncMessagesToThread = useCallback((msgs: ChatMsg[]) => {
    if (!activeThreadId || msgs.length === 0) return;
    setThreads(prev => prev.map(t =>
      t.id === activeThreadId
        ? { ...t, messages: msgs, updatedAt: Date.now(), title: t.title === "محادثة جديدة" || t.title === "New Chat" ? generateTitle(msgs) : t.title }
        : t
    ));
  }, [activeThreadId]);

  useEffect(() => {
    if (messages.length > 0 && activeThreadId) syncMessagesToThread(messages.filter(m => m.role !== "status"));
  }, [messages, activeThreadId, syncMessagesToThread]);

  const startNewThread = () => {
    const id = crypto.randomUUID();
    const agentKey = selectedAgent?.agentKey || "strategic";
    const newThread: ChatThread = { id, title: isRTL ? "محادثة جديدة" : "New Chat", agentKey, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setThreads(prev => [newThread, ...prev]);
    setActiveThreadId(id);
    setMessages([]);
    setShowSidebar(false);
  };

  const switchThread = (threadId: string) => {
    if (loading) return;
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    setActiveThreadId(threadId);
    setMessages(thread.messages.filter(m => m.role !== "status"));
    if (agents.length > 0) {
      const ag = agents.find(a => a.agentKey === thread.agentKey);
      if (ag) setSelectedAgent(ag);
    }
    setShowSidebar(false);
  };

  const deleteThread = (threadId: string) => {
    setThreads(prev => prev.filter(t => t.id !== threadId));
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      setMessages([]);
    }
    setThreadMenuId(null);
  };

  const renameThread = (threadId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, title: newTitle.trim() } : t));
    setEditingThreadId(null);
    setEditTitle("");
  };

  const saveFile = (name: string, lang: string, content: string) => {
    const file: SavedFile = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      lang,
      content,
      agentKey: selectedAgent?.agentKey || "strategic",
      savedAt: Date.now(),
    };
    setSavedFiles(prev => { const next = [file, ...prev]; saveSavedFiles(next); return next; });
  };

  const deleteFile = (fileId: string) => {
    setSavedFiles(prev => { const next = prev.filter(f => f.id !== fileId); saveSavedFiles(next); return next; });
    if (fileMenuId === fileId) setFileMenuId(null);
  };

  const renameFile = (fileId: string, newName: string) => {
    if (!newName.trim()) return;
    setSavedFiles(prev => { const next = prev.map(f => f.id === fileId ? { ...f, name: newName.trim() } : f); saveSavedFiles(next); return next; });
    setRenamingFileId(null);
    setRenameFileName("");
  };

  const downloadFile = (file: SavedFile) => {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyFileContent = (content: string) => {
    navigator.clipboard.writeText(content);
  };

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
    if (!target || target.closest("[data-wand-overlay]")) return;
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
      if (!target || target.closest("[data-wand-overlay]")) {
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setWandMode(false); setWandHighlight(null); setScreenshotMode("off"); setCropRect(null); cropStartRef.current = null; } };
    document.addEventListener("click", onClick, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("keydown", onKey);
    const style = document.createElement("style");
    style.id = "wand-cursor-float";
    style.textContent = `* { cursor: crosshair !important; } [data-wand-overlay] * { cursor: default !important; }`;
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

  const captureFullScreen = useCallback(async () => {
    setShowScreenshotMenu(false);
    setScreenshotMode("capturing");
    await new Promise(r => setTimeout(r, 150));
    const name = `screenshot_${new Date().toISOString().slice(0,19).replace(/[T:]/g, "-")}.png`;
    try {
      const chatEl = document.querySelector("[data-floating-chat]") as HTMLElement | null;
      const origVis = chatEl?.style.visibility;
      if (chatEl) chatEl.style.visibility = "hidden";
      const html2canvasMod = await import("html2canvas");
      const html2canvas = html2canvasMod.default;
      const rendered = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        scale: 1,
        width: window.innerWidth,
        height: window.innerHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      });
      if (chatEl) chatEl.style.visibility = origVis || "";
      const dataUrl = rendered.toDataURL("image/png");
      if (dataUrl && dataUrl.length > 100) {
        setPendingImages(prev => [...prev, { data: dataUrl, name }]);
        setScreenshotMode("off");
        return;
      }
    } catch (err) {
      console.error("html2canvas failed, trying fallback:", err);
      const chatEl = document.querySelector("[data-floating-chat]") as HTMLElement | null;
      if (chatEl) chatEl.style.visibility = "";
    }
    try {
      const canvas = document.createElement("canvas");
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const elements = document.body.querySelectorAll("*");
      let capturedSomething = false;
      for (const el of elements) {
        if ((el as HTMLElement).dataset?.floatingChat || (el as HTMLElement).dataset?.cropOverlay) continue;
        const imgs = el.tagName === "IMG" ? [el as HTMLImageElement] : [];
        for (const img of imgs) {
          try {
            const rect = img.getBoundingClientRect();
            ctx.drawImage(img, rect.x, rect.y, rect.width, rect.height);
            capturedSomething = true;
          } catch {}
        }
      }
      if (!capturedSomething) {
        ctx.fillStyle = "#e1e4e8";
        ctx.font = "14px sans-serif";
        ctx.fillText("Screenshot captured - content may be limited due to browser security", 20, 30);
      }
      const dataUrl = canvas.toDataURL("image/png");
      setPendingImages(prev => [...prev, { data: dataUrl, name }]);
    } catch (err2) {
      console.error("All screenshot methods failed:", err2);
    }
    setScreenshotMode("off");
  }, []);

  const startCropMode = useCallback(() => {
    setShowScreenshotMenu(false);
    setScreenshotMode("crop");
  }, []);

  const handleCropMouseDown = useCallback((e: React.MouseEvent) => {
    cropStartRef.current = { x: e.clientX, y: e.clientY };
    setCropRect({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY });
  }, []);

  const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
    if (!cropStartRef.current) return;
    setCropRect(prev => prev ? { ...prev, endX: e.clientX, endY: e.clientY } : null);
  }, []);

  const pendingCropRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleCropMouseUp = useCallback(() => {
    if (!cropStartRef.current || !cropRect) { cropStartRef.current = null; setCropRect(null); setScreenshotMode("off"); return; }
    const x = Math.min(cropRect.startX, cropRect.endX);
    const y = Math.min(cropRect.startY, cropRect.endY);
    const w = Math.abs(cropRect.endX - cropRect.startX);
    const h = Math.abs(cropRect.endY - cropRect.startY);
    cropStartRef.current = null;
    setCropRect(null);
    if (w < 10 || h < 10) { setScreenshotMode("off"); return; }
    pendingCropRef.current = { x, y, w, h };
    setScreenshotMode("capturing");
  }, [cropRect]);

  useEffect(() => {
    if (screenshotMode !== "capturing" || !pendingCropRef.current) return;
    const { x, y, w, h } = pendingCropRef.current;
    pendingCropRef.current = null;
    const name = `crop_${new Date().toISOString().slice(0,19).replace(/[T:]/g, "-")}.png`;
    (async () => {
      await new Promise(r => setTimeout(r, 150));
      try {
        const chatEl = document.querySelector("[data-floating-chat]") as HTMLElement | null;
        const origChat = chatEl?.style.visibility;
        if (chatEl) chatEl.style.visibility = "hidden";
        const html2canvasMod = await import("html2canvas");
        const html2canvas = html2canvasMod.default;
        const rendered = await html2canvas(document.body, {
          useCORS: true,
          allowTaint: true,
          scale: 1,
          x, y, width: w, height: h,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
        });
        if (chatEl) chatEl.style.visibility = origChat || "";
        const dataUrl = rendered.toDataURL("image/png");
        if (dataUrl && dataUrl.length > 100) {
          setPendingImages(prev => [...prev, { data: dataUrl, name }]);
        }
      } catch (err) {
        console.error("Crop screenshot failed:", err);
        const chatEl = document.querySelector("[data-floating-chat]") as HTMLElement | null;
        if (chatEl) chatEl.style.visibility = "";
      }
      setScreenshotMode("off");
    })();
  }, [screenshotMode]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPendingImages(prev => [...prev, { data: dataUrl, name: file.name }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }, []);

  const removePendingImage = useCallback((idx: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const handleStop = () => {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setLoading(false);
  };

  const doSend = async (directMsg?: string) => {
    const currentPrompt = directMsg || prompt;
    if ((!currentPrompt.trim() && pendingImages.length === 0) || loading || !selectedAgent) return;
    if (!currentPrompt.trim() && pendingImages.length > 0) {
      const defaultPrompt = isRTL ? "ما رأيك في هذا؟" : "What do you think about this?";
      return doSend(defaultPrompt);
    }
    setPrompt("");
    setLoading(true);
    userScrolledUpRef.current = false;

    const imagesToSend = [...pendingImages];
    setPendingImages([]);

    if (!activeThreadId) {
      const id = crypto.randomUUID();
      const newThread: ChatThread = { id, title: isRTL ? "محادثة جديدة" : "New Chat", agentKey: selectedAgent.agentKey, messages: [], createdAt: Date.now(), updatedAt: Date.now() };
      setThreads(prev => [newThread, ...prev]);
      setActiveThreadId(id);
    }

    const userMsgContent = imagesToSend.length > 0
      ? `${currentPrompt}\n\n${imagesToSend.map(img => `![${img.name}](${img.data.slice(0, 60)}...)`).join("\n")}`
      : currentPrompt;
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: "user", content: userMsgContent, timestamp: new Date(), images: imagesToSend.map(i => i.data) } as any]);

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
        const attachments = imagesToSend.map(img => ({ name: img.name, type: "image/png", content: img.data }));
        body = {
          message: infraContext ? `${currentPrompt}\n\n---\n${infraContext}` : currentPrompt,
          projectId: "general",
          ...(attachments.length > 0 ? { attachments } : {}),
        };
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
              setStatusLines(prev => [...prev, event.message || event.messageEn]);
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
      setStatusLines([]);
      abortRef.current = null;
    }
  };

  const LANG_EXT: Record<string, string> = {
    javascript: "js", js: "js", typescript: "ts", ts: "ts", tsx: "tsx", jsx: "jsx",
    python: "py", py: "py", html: "html", css: "css", scss: "scss",
    json: "json", yaml: "yaml", yml: "yml", sql: "sql", bash: "sh", sh: "sh",
    shell: "sh", dockerfile: "Dockerfile", xml: "xml", markdown: "md", md: "md",
    rust: "rs", go: "go", java: "java", cpp: "cpp", c: "c", ruby: "rb",
  };

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyCode = (code: string, blockId: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedId(blockId);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const downloadCode = (code: string, lang?: string) => {
    const ext = lang ? (LANG_EXT[lang.toLowerCase()] || lang) : "txt";
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `code.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
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
            const blockId = `code-${i}-${seg.value.length}`;
            const trimmed = seg.value.trim();
            const ext = seg.lang ? (LANG_EXT[seg.lang.toLowerCase()] || seg.lang) : "txt";
            return (
              <div key={i} className="my-2 rounded-lg border border-[#30363d] overflow-hidden bg-[#0d1117]">
                <div className="flex items-center justify-between px-3 py-1.5 bg-[#161b22] border-b border-[#30363d]">
                  <span className="text-[10px] text-[#8b949e] font-medium">{seg.lang || "code"}{ext !== "txt" ? `.${ext}` : ""}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyCode(trimmed, blockId)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#8b949e] hover:text-[#e1e4e8] hover:bg-white/5 transition-colors"
                      title={isRTL ? "نسخ" : "Copy"}
                    >
                      {copiedId === blockId ? <CheckCheck className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                      {copiedId === blockId ? (isRTL ? "تم" : "Copied") : (isRTL ? "نسخ" : "Copy")}
                    </button>
                    <button
                      onClick={() => downloadCode(trimmed, seg.lang)}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#8b949e] hover:text-[#e1e4e8] hover:bg-white/5 transition-colors"
                      title={isRTL ? "تحميل" : "Download"}
                    >
                      <Download className="w-3 h-3" />
                      {isRTL ? "تحميل" : "Download"}
                    </button>
                    <button
                      onClick={() => {
                        const fileName = `code.${ext}`;
                        saveFile(fileName, seg.lang || "txt", trimmed);
                        setShowSidebar(true);
                        setSidebarTab("files");
                      }}
                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#8b949e] hover:text-cyan-400 hover:bg-cyan-500/5 transition-colors"
                      title={isRTL ? "حفظ" : "Save"}
                    >
                      <Save className="w-3 h-3" />
                      {isRTL ? "حفظ" : "Save"}
                    </button>
                  </div>
                </div>
                <pre className="p-3 text-[12px] text-[#e1e4e8] overflow-x-auto max-h-[300px] overflow-y-auto" dir="ltr"><code>{trimmed}</code></pre>
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
        className="fixed z-[9990] shadow-2xl rounded-xl overflow-hidden border border-[#30363d] bg-[#161b22] cursor-move"
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
        className="fixed z-[9990] shadow-2xl rounded-xl overflow-hidden border border-[#30363d] bg-[#0d1117] flex flex-col"
        style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 bg-[#161b22] border-b border-[#30363d] cursor-move flex-shrink-0 select-none"
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
            onClick={() => setShowSidebar(!showSidebar)}
            className={`p-1.5 transition-colors rounded-md ${showSidebar ? "text-[#58a6ff] bg-[#58a6ff]/10" : "text-[#8b949e] hover:text-[#e1e4e8] hover:bg-white/5"}`}
            title={isRTL ? "المحادثات" : "Conversations"}
          >
            {showSidebar ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => { setWandMode(!wandMode); setWandHighlight(null); }}
            className={`p-1.5 transition-colors rounded-md ${wandMode ? "text-amber-400 bg-amber-500/15" : "text-[#8b949e] hover:text-amber-400 hover:bg-white/5"}`}
            title={isRTL ? "عصا سحرية" : "Magic Wand"}
          >
            <Wand2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { setMessages([]); setActiveThreadId(null); }} className="p-1.5 text-[#8b949e] hover:text-red-400 rounded-md hover:bg-white/5" title={isRTL ? "مسح" : "Clear"}>
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

        <div className="flex-1 flex overflow-hidden min-h-0">
          {showSidebar && (
            <div className={`w-[220px] flex-shrink-0 bg-[#0a0e14] ${isRTL ? "border-l" : "border-r"} border-[#1c2333] flex flex-col`}>
              <div className="flex border-b border-[#1c2333]">
                <button
                  onClick={() => setSidebarTab("chats")}
                  className={`flex-1 px-2 py-1.5 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${sidebarTab === "chats" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-[#484f58] hover:text-[#8b949e]"}`}
                >
                  <MessageSquare className="w-3 h-3" />
                  {isRTL ? "المحادثات" : "Chats"}
                </button>
                <button
                  onClick={() => setSidebarTab("files")}
                  className={`flex-1 px-2 py-1.5 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors ${sidebarTab === "files" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-[#484f58] hover:text-[#8b949e]"}`}
                >
                  <FolderOpen className="w-3 h-3" />
                  {isRTL ? "الملفات" : "Files"}
                  {savedFiles.length > 0 && <span className="text-[8px] bg-cyan-500/20 text-cyan-400 px-1 rounded-full">{savedFiles.length}</span>}
                </button>
              </div>

              {sidebarTab === "chats" ? (
                <>
                  <div className="p-2 flex items-center justify-between border-b border-[#1c2333]">
                    <span className="text-[10px] text-[#484f58]">{threads.length} {isRTL ? "محادثة" : "chats"}</span>
                    <button
                      onClick={startNewThread}
                      className="p-1 rounded-md hover:bg-white/5 text-[#8b949e] hover:text-cyan-400 transition-colors"
                      title={isRTL ? "محادثة جديدة" : "New chat"}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {threads.length === 0 ? (
                      <div className="p-3 text-center">
                        <MessageSquare className="w-5 h-5 mx-auto text-[#30363d] mb-2" />
                        <p className="text-[10px] text-[#484f58]">{isRTL ? "لا توجد محادثات" : "No conversations"}</p>
                      </div>
                    ) : (
                      <div className="py-1">
                        {threads.map(thread => {
                          const isActive = thread.id === activeThreadId;
                          const isEditing = editingThreadId === thread.id;
                          const threadAgent = AGENT_ICONS[thread.agentKey];
                          const threadColor = AGENT_COLORS[thread.agentKey] || "text-[#8b949e]";
                          return (
                            <div
                              key={thread.id}
                              className={`group relative px-2 py-1.5 mx-1 rounded-lg cursor-pointer transition-colors ${isActive ? "bg-white/8" : "hover:bg-white/5"}`}
                              onClick={() => !isEditing && switchThread(thread.id)}
                            >
                              <div className="flex items-center gap-1.5">
                                <div className={`flex-shrink-0 ${threadColor}`}>
                                  {threadAgent || <Bot className="w-3 h-3" />}
                                </div>
                                {isEditing ? (
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <input
                                      autoFocus
                                      value={editTitle}
                                      onChange={e => setEditTitle(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") renameThread(thread.id, editTitle); if (e.key === "Escape") setEditingThreadId(null); }}
                                      onClick={e => e.stopPropagation()}
                                      className="flex-1 min-w-0 bg-[#161b22] border border-[#30363d] rounded px-1.5 py-0.5 text-[10px] text-[#e1e4e8] focus:outline-none focus:border-cyan-500/50"
                                    />
                                    <button onClick={(e) => { e.stopPropagation(); renameThread(thread.id, editTitle); }} className="p-0.5 text-green-400 hover:text-green-300">
                                      <Check className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="flex-1 min-w-0 text-[11px] text-[#c9d1d9] truncate">
                                    {thread.title}
                                  </span>
                                )}
                                {!isEditing && (
                                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingThreadId(thread.id); setEditTitle(thread.title); }}
                                      className="p-0.5 text-[#484f58] hover:text-[#e1e4e8] rounded"
                                    >
                                      <Pencil className="w-2.5 h-2.5" />
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); deleteThread(thread.id); }}
                                      className="p-0.5 text-[#484f58] hover:text-red-400 rounded"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div className="text-[9px] text-[#484f58] mt-0.5 truncate" style={{ paddingInlineStart: "18px" }}>
                                {thread.messages.length > 0 ? `${thread.messages.length} ${isRTL ? "رسالة" : "msgs"}` : ""} · {new Date(thread.updatedAt).toLocaleDateString(isRTL ? "ar" : "en", { month: "short", day: "numeric" })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  {savedFiles.length === 0 ? (
                    <div className="p-3 text-center">
                      <FolderOpen className="w-5 h-5 mx-auto text-[#30363d] mb-2" />
                      <p className="text-[10px] text-[#484f58]">{isRTL ? "لا توجد ملفات محفوظة" : "No saved files"}</p>
                      <p className="text-[9px] text-[#30363d] mt-1">{isRTL ? "اضغط 'حفظ' في أي كود" : "Click 'Save' on any code block"}</p>
                    </div>
                  ) : (
                    <div className="py-1">
                      {savedFiles.map(file => {
                        const isRenaming = renamingFileId === file.id;
                        const isPreviewing = previewFileId === file.id;
                        const fileColor = AGENT_COLORS[file.agentKey] || "text-[#8b949e]";
                        return (
                          <div key={file.id}>
                            <div className={`group relative px-2 py-1.5 mx-1 rounded-lg transition-colors hover:bg-white/5`}>
                              <div className="flex items-center gap-1.5">
                                <File className={`w-3 h-3 flex-shrink-0 ${fileColor}`} />
                                {isRenaming ? (
                                  <div className="flex items-center gap-1 flex-1 min-w-0">
                                    <input
                                      autoFocus
                                      value={renameFileName}
                                      onChange={e => setRenameFileName(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") renameFile(file.id, renameFileName); if (e.key === "Escape") setRenamingFileId(null); }}
                                      className="flex-1 min-w-0 bg-[#161b22] border border-[#30363d] rounded px-1.5 py-0.5 text-[10px] text-[#e1e4e8] focus:outline-none focus:border-cyan-500/50"
                                    />
                                    <button onClick={() => renameFile(file.id, renameFileName)} className="p-0.5 text-green-400 hover:text-green-300">
                                      <Check className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="flex-1 min-w-0 text-[11px] text-[#c9d1d9] truncate cursor-pointer" onClick={() => setPreviewFileId(isPreviewing ? null : file.id)}>
                                    {file.name}
                                  </span>
                                )}
                                {!isRenaming && (
                                  <div className="relative">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setFileMenuId(fileMenuId === file.id ? null : file.id); }}
                                      className="p-0.5 text-[#484f58] hover:text-[#e1e4e8] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <MoreHorizontal className="w-3 h-3" />
                                    </button>
                                    {fileMenuId === file.id && (
                                      <div className={`absolute ${isRTL ? "end-0" : "start-0"} top-full mt-1 w-[200px] bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl z-50 py-1`}>
                                        <button
                                          onClick={() => { setPreviewFileId(isPreviewing ? null : file.id); setFileMenuId(null); }}
                                          className="w-full flex items-center gap-2 px-3 py-1.5 text-start text-[11px] text-[#c9d1d9] hover:bg-white/5"
                                        >
                                          <Eye className="w-3 h-3 text-blue-400" />
                                          {isRTL ? "معاينة" : "Preview"}
                                        </button>
                                        <button
                                          onClick={() => { copyFileContent(file.content); setFileMenuId(null); }}
                                          className="w-full flex items-center gap-2 px-3 py-1.5 text-start text-[11px] text-[#c9d1d9] hover:bg-white/5"
                                        >
                                          <Copy className="w-3 h-3 text-[#8b949e]" />
                                          {isRTL ? "نسخ المحتوى" : "Copy content"}
                                        </button>
                                        <button
                                          onClick={() => { downloadFile(file); setFileMenuId(null); }}
                                          className="w-full flex items-center gap-2 px-3 py-1.5 text-start text-[11px] text-[#c9d1d9] hover:bg-white/5"
                                        >
                                          <Download className="w-3 h-3 text-green-400" />
                                          {isRTL ? "تحميل" : "Download"}
                                        </button>
                                        <button
                                          onClick={() => { setRenamingFileId(file.id); setRenameFileName(file.name); setFileMenuId(null); }}
                                          className="w-full flex items-center gap-2 px-3 py-1.5 text-start text-[11px] text-[#c9d1d9] hover:bg-white/5"
                                        >
                                          <Pencil className="w-3 h-3 text-amber-400" />
                                          {isRTL ? "إعادة تسمية" : "Rename"}
                                        </button>
                                        <div className="border-t border-[#30363d] my-1" />
                                        <button
                                          onClick={() => deleteFile(file.id)}
                                          className="w-full flex items-center gap-2 px-3 py-1.5 text-start text-[11px] text-red-400 hover:bg-red-500/10"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                          {isRTL ? "حذف" : "Delete"}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-[9px] text-[#484f58] mt-0.5 truncate" style={{ paddingInlineStart: "18px" }}>
                                {file.lang} · {new Date(file.savedAt).toLocaleDateString(isRTL ? "ar" : "en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </div>
                            </div>
                            {isPreviewing && (
                              <div className="mx-2 mb-1 rounded border border-[#30363d] bg-[#0d1117] overflow-hidden">
                                <pre className="p-2 text-[10px] text-[#e1e4e8] overflow-x-auto max-h-[150px] overflow-y-auto" dir="ltr"><code>{file.content}</code></pre>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex-1 flex flex-col min-w-0">
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

              {messages.filter(m => m.role !== "status").map(msg => {
                const msgImages = (msg as any).images as string[] | undefined;
                const textContent = msg.content.replace(/\n\n!\[.*?\]\(data:image.*?\.\.\.\)/g, "").trim();
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
                      ) : renderMessageContent(textContent || msg.content)}
                      {msgImages && msgImages.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {msgImages.map((imgSrc, i) => (
                            <img key={i} src={imgSrc} alt="attached" className="max-w-[200px] max-h-[140px] rounded-lg border border-cyan-500/20 object-cover cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(imgSrc, "_blank")} />
                          ))}
                        </div>
                      )}
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

            {statusLines.length > 0 && (
              <div className="px-3 py-1.5 border-t border-[#1c2333] flex-shrink-0 space-y-0.5">
                {statusLines.map((line, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${i === statusLines.length - 1 ? "bg-cyan-400 animate-pulse" : "bg-[#30363d]"}`} />
                    <span className={`text-[10px] ${i === statusLines.length - 1 ? "text-[#8b949e]" : "text-[#484f58]"}`}>{line}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-[#1c2333] px-3 py-2 flex-shrink-0">
              {pendingImages.length > 0 && (
                <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
                  {pendingImages.map((img, idx) => (
                    <div key={idx} className="relative flex-shrink-0 group">
                      <img src={img.data} alt={img.name} className="h-16 w-auto rounded-lg border border-[#30363d] object-cover" />
                      <button
                        onClick={() => removePendingImage(idx)}
                        className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                      <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-white text-center py-0.5 rounded-b-lg truncate px-1">
                        {img.name.length > 12 ? img.name.slice(0, 12) + "…" : img.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder={isRTL ? "اكتب أمرك..." : "Type command..."}
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-xl px-10 py-2.5 pe-12 text-[13px] text-[#e1e4e8] placeholder-[#484f58] resize-none focus:outline-none focus:border-cyan-500/50 transition-colors"
                  rows={prompt.split("\n").length > 3 ? 4 : prompt.includes("\n") ? 3 : 1}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } }}
                />
                <div className="absolute start-1.5 bottom-1.5 flex items-center">
                  <div className="relative">
                    <button
                      onClick={() => setShowScreenshotMenu(!showScreenshotMenu)}
                      className={`p-1.5 rounded-lg transition-colors ${pendingImages.length > 0 ? "text-cyan-400 bg-cyan-500/10" : "text-[#484f58] hover:text-[#8b949e] hover:bg-white/5"}`}
                      title={isRTL ? "التقاط صورة" : "Screenshot"}
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                    {showScreenshotMenu && (
                      <div className="absolute bottom-full left-0 mb-1 w-48 bg-[#161b22] border border-[#30363d] rounded-lg shadow-2xl z-50 py-1">
                        <button
                          onClick={captureFullScreen}
                          className="w-full flex items-center gap-2 px-3 py-2 text-start text-[12px] text-[#c9d1d9] hover:bg-white/5 transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5 text-cyan-400" />
                          {isRTL ? "صورة كامل الشاشة" : "Full screenshot"}
                        </button>
                        <button
                          onClick={startCropMode}
                          className="w-full flex items-center gap-2 px-3 py-2 text-start text-[12px] text-[#c9d1d9] hover:bg-white/5 transition-colors"
                        >
                          <Scissors className="w-3.5 h-3.5 text-amber-400" />
                          {isRTL ? "قص جزء من الشاشة" : "Crop area"}
                        </button>
                        <button
                          onClick={() => { setShowScreenshotMenu(false); fileInputRef.current?.click(); }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-start text-[12px] text-[#c9d1d9] hover:bg-white/5 transition-colors"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-green-400" />
                          {isRTL ? "رفع صورة من الجهاز" : "Upload image"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
                {loading ? (
                  <button onClick={handleStop} className="absolute end-2 bottom-2 p-2 bg-red-500 hover:bg-red-400 text-white rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button onClick={() => doSend()} disabled={!prompt.trim() && pendingImages.length === 0} className="absolute end-2 bottom-2 p-2 bg-cyan-500 hover:bg-cyan-400 text-black rounded-lg disabled:opacity-40 transition-colors">
                    <Send className={`w-3.5 h-3.5 ${isRTL ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>
            </div>
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

      {screenshotMode === "crop" && createPortal(
        <div
          data-crop-overlay="true"
          className="fixed inset-0 z-[9995] cursor-crosshair"
          style={{ background: "rgba(0,0,0,0.3)" }}
          onMouseDown={handleCropMouseDown}
          onMouseMove={handleCropMouseMove}
          onMouseUp={handleCropMouseUp}
        >
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#161b22] border border-[#30363d] rounded-lg px-4 py-2 flex items-center gap-3 shadow-2xl">
            <Scissors className="w-4 h-4 text-amber-400" />
            <span className="text-[12px] text-[#e1e4e8]">{isRTL ? "اسحب لتحديد المنطقة — Esc للإلغاء" : "Drag to select area — Esc to cancel"}</span>
            <button onClick={() => { setScreenshotMode("off"); setCropRect(null); cropStartRef.current = null; }} className="p-1 text-[#8b949e] hover:text-red-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {cropRect && (() => {
            const x = Math.min(cropRect.startX, cropRect.endX);
            const y = Math.min(cropRect.startY, cropRect.endY);
            const w = Math.abs(cropRect.endX - cropRect.startX);
            const h = Math.abs(cropRect.endY - cropRect.startY);
            return w > 5 && h > 5 ? (
              <div className="absolute border-2 border-cyan-400 bg-cyan-400/10 rounded-sm" style={{ left: x, top: y, width: w, height: h }}>
                <div className="absolute -top-5 left-0 bg-cyan-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-sm whitespace-nowrap">
                  {Math.round(w)}×{Math.round(h)}
                </div>
              </div>
            ) : null;
          })()}
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}
