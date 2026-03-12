import React, { useState, useRef, useEffect } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Send, Loader2, Code2, Eye, Wrench, FolderOpen, AlertCircle, CheckCircle2, FileCode2, Coins, User, Bot } from "lucide-react";
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
  useGetTokenSummary
} from "@workspace/api-client-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  buildId?: string;
  timestamp: Date;
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

  const { data: project } = useGetProject(id || "");
  const { data: tokenSummary } = useGetTokenSummary();
  const startBuildMut = useStartBuild();

  const { data: buildStatus } = useGetBuildStatus(activeBuildId || "", {
    query: {
      queryKey: ["getBuildStatus", activeBuildId || ""],
      enabled: !!activeBuildId,
      refetchInterval: (query: { state: { data?: { status?: string } } }) => {
        const status = query.state.data?.status;
        return (status === "completed" || status === "failed") ? false : 3000;
      }
    }
  });

  const { data: buildLogs } = useGetBuildLogs(activeBuildId || "", {
    query: {
      queryKey: ["getBuildLogs", activeBuildId || ""],
      enabled: !!activeBuildId,
      refetchInterval: () =>
        (buildStatus?.status === "completed" || buildStatus?.status === "failed") ? false : 3000
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

  const isBuilding = buildStatus?.status === "pending" || buildStatus?.status === "in_progress" || startBuildMut.isPending;

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="h-14 border-b border-white/10 bg-card/80 backdrop-blur flex items-center justify-between px-4 flex-shrink-0 z-10">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="p-2 -ms-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-secondary">
            <ArrowLeft className={cn("w-5 h-5", lang === "ar" && "rotate-180")} />
          </Link>
          <div className="h-4 w-px bg-white/10" />
          <h1 className="font-semibold">{project?.name || t.loading}</h1>
          {buildStatus?.status && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium flex items-center gap-1.5">
              {isBuilding && <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
              {t[`status_${buildStatus.status}` as keyof typeof t] || buildStatus.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {tokenSummary && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-white/5">
              <Coins className="w-4 h-4 text-yellow-500" />
              <span className="text-xs font-medium">{tokenSummary.monthTokens.toLocaleString()} {t.tokens}</span>
            </div>
          )}
          <LanguageToggle />
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">

        <div className="w-full md:w-80 lg:w-96 border-e border-white/10 flex flex-col bg-card/30 flex-shrink-0 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.2)]">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !startBuildMut.isPending && (
              <div className="text-center mt-20 text-muted-foreground">
                <div className="w-16 h-16 mx-auto bg-secondary rounded-full flex items-center justify-center mb-4">
                  <Code2 className="w-8 h-8 opacity-50" />
                </div>
                <p>{t.prompt_placeholder}</p>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-2.5",
                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  )}
                >
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                    msg.role === "user" ? "bg-primary/20 text-primary" : "bg-emerald-500/20 text-emerald-400"
                  )}>
                    {msg.role === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className={cn(
                    "rounded-xl p-3 text-sm max-w-[80%]",
                    msg.role === "user"
                      ? "bg-primary/10 border border-primary/20"
                      : "bg-secondary/50 border border-white/5"
                  )}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    <span className="text-[10px] text-muted-foreground/60 mt-1 block">
                      {format(msg.timestamp, 'HH:mm')}
                    </span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isBuilding && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-emerald-500/20 text-emerald-400">
                  <Bot className="w-3.5 h-3.5" />
                </div>
                <div className="bg-secondary/50 border border-white/5 rounded-xl p-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-white/10 bg-card/80 backdrop-blur-md">
            <div className="relative">
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder={t.prompt_placeholder}
                disabled={isBuilding}
                className="w-full bg-background border border-white/10 rounded-xl p-3 pe-12 resize-none h-24 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-50 transition-all text-sm shadow-inner"
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
                className="absolute end-2 bottom-2 p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:hover:bg-primary transition-colors shadow-md"
              >
                {isBuilding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className={cn("w-4 h-4", lang === "ar" && "rotate-180")} />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 relative bg-black/40 flex flex-col">
          {isBuilding ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex flex-col items-center">
                <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground font-medium">{t.building}</p>
                <p className="text-sm text-muted-foreground/60 mt-1">{t.agents_working}</p>
              </div>
            </div>
          ) : projectFiles?.data && projectFiles.data.length > 0 ? (
            <FilePreview files={projectFiles.data} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground/50">
              <div className="text-center">
                <Eye className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>{t.preview_unavailable}</p>
              </div>
            </div>
          )}
        </div>

        <div className="w-full md:w-80 border-s border-white/10 flex flex-col bg-card/50 flex-shrink-0 z-10 shadow-[-4px_0_24px_rgba(0,0,0,0.2)] hidden lg:flex">
          <div className="p-4 border-b border-white/10 font-semibold flex items-center justify-between bg-card">
            {t.execution_log}
            {isBuilding && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4 relative before:absolute before:inset-0 before:ms-[19px] before:-translate-x-px before:h-full before:w-0.5 before:bg-white/10">
              <AnimatePresence initial={false}>
                {buildLogs?.data?.map((log, i) => (
                  <LogItem key={log.id || i} log={log} />
                ))}
              </AnimatePresence>
              {isBuilding && (!buildLogs?.data || buildLogs.data.length === 0) && (
                <div className="text-center text-sm text-muted-foreground pt-10">
                  {t.agents_working}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function FilePreview({ files }: { files: ProjectFile[] }) {
  const [selectedFile, setSelectedFile] = useState(0);
  const { t } = useI18n();

  const htmlFile = files.find((f) => f.filePath?.endsWith('.html'));
  const hasPreview = !!htmlFile?.content;

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 p-2 border-b border-white/10 bg-card/60 overflow-x-auto">
        {files.map((f, i) => (
          <button
            key={f.id || i}
            onClick={() => setSelectedFile(i)}
            className={cn(
              "px-3 py-1.5 text-xs font-mono rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5",
              selectedFile === i
                ? "bg-primary/20 text-primary border border-primary/30"
                : "text-muted-foreground hover:bg-secondary"
            )}
          >
            <FileCode2 className="w-3 h-3" />
            {f.filePath?.split('/').pop() || `file-${i}`}
          </button>
        ))}
      </div>

      {hasPreview && selectedFile === files.indexOf(htmlFile!) ? (
        <iframe
          srcDoc={buildPreviewHtml()}
          sandbox="allow-scripts"
          className="flex-1 w-full border-0 bg-white"
          title={t.live_preview}
        />
      ) : (
        <pre className="flex-1 overflow-auto p-4 text-sm font-mono text-foreground/80 bg-black/20">
          <code>{files[selectedFile]?.content || ""}</code>
        </pre>
      )}
    </div>
  );
}

function LogItem({ log }: { log: ExecutionLog }) {
  const { t } = useI18n();

  const agentLabel = (): string => {
    const key = `agent_${log.agentType}` as keyof typeof t;
    return (t[key] as string) || log.agentType;
  };

  const getIcon = () => {
    switch (log.agentType) {
      case 'codegen': return <Code2 className="w-4 h-4" />;
      case 'reviewer': return <Eye className="w-4 h-4" />;
      case 'fixer': return <Wrench className="w-4 h-4" />;
      case 'filemanager': return <FolderOpen className="w-4 h-4" />;
      default: return <Loader2 className="w-4 h-4" />;
    }
  };

  const getStatusColor = () => {
    switch (log.status) {
      case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'failed': return 'bg-destructive/20 text-destructive-foreground border-destructive/30';
      case 'in_progress': return 'bg-primary/20 text-primary border-primary/30';
      default: return 'bg-secondary text-secondary-foreground border-white/10';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative ps-10"
    >
      <div className={cn("absolute start-0 w-10 h-10 -ms-1 flex items-center justify-center rounded-full bg-card border", getStatusColor())}>
        {log.status === 'completed' ? <CheckCircle2 className="w-4 h-4" /> :
         log.status === 'failed' ? <AlertCircle className="w-4 h-4" /> :
         log.status === 'in_progress' ? <Loader2 className="w-4 h-4 animate-spin" /> : getIcon()}
      </div>
      <div className="bg-background border border-white/5 rounded-xl p-3 shadow-sm">
        <div className="flex justify-between items-start mb-1">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{agentLabel()}</span>
          {log.createdAt && <span className="text-[10px] text-muted-foreground">{format(new Date(log.createdAt), 'HH:mm:ss')}</span>}
        </div>
        <p className="text-sm">{log.action.replace(/_/g, ' ')}</p>
        {log.tokensUsed ? (
          <div className="mt-2 text-[10px] font-mono text-muted-foreground/80 bg-white/5 inline-block px-1.5 py-0.5 rounded">
            {log.tokensUsed} {t.tokens_label}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
