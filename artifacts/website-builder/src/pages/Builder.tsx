import React, { useState, useRef, useEffect, useMemo } from "react";
import { useParams, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send, Loader2, Code2, Eye, Wrench, FolderOpen, AlertCircle, CheckCircle2,
  FileCode2, User, Bot, Search, ChevronRight, ChevronDown,
  FileText, FileJson, FileImage, File, Folder, ArrowLeft, Clock
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
  const [centerTab, setCenterTab] = useState<"canvas" | "code">("canvas");
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);

  const { data: project } = useGetProject(id || "");
  const { data: tokenSummary } = useGetTokenSummary();
  const startBuildMut = useStartBuild();

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

  const actionCount = buildLogs?.data?.length || 0;

  const files = projectFiles?.data || [];

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
        </div>

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
        </div>

        <div className="flex-1 relative bg-[#0d1117] overflow-hidden">
          {centerTab === "canvas" ? (
            isBuilding ? (
              <div className="flex-1 h-full flex items-center justify-center">
                <div className="flex flex-col items-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[#58a6ff] mb-3" />
                  <p className="text-[#8b949e] text-sm font-medium">{t.building}</p>
                  <p className="text-xs text-[#484f58] mt-1">{t.agents_working}</p>
                </div>
              </div>
            ) : hasPreview ? (
              <iframe
                srcDoc={buildPreviewHtml()}
                sandbox="allow-scripts"
                className="w-full h-full border-0 bg-white"
                title={t.live_preview}
              />
            ) : (
              <div className="flex-1 h-full flex items-center justify-center text-[#484f58]">
                <div className="text-center">
                  <Eye className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">{t.preview_unavailable}</p>
                </div>
              </div>
            )
          ) : (
            <div className="h-full flex flex-col">
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
                      </button>
                    ))}
                  </div>
                  <pre className="flex-1 overflow-auto p-4 text-[13px] font-mono text-[#c9d1d9] bg-[#0d1117] leading-relaxed">
                    <code>{files[selectedFileIndex]?.content || ""}</code>
                  </pre>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-[#484f58]">
                  <p className="text-sm">{t.no_files}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-[240px] flex flex-col bg-[#0d1117] flex-shrink-0">
        <div className="h-9 flex items-center px-3 border-b border-[#1c2333] bg-[#161b22] flex-shrink-0">
          <span className="text-xs font-semibold text-[#e1e4e8] uppercase tracking-wider">{t.library}</span>
        </div>

        <FileLibrary files={files} onFileSelect={(idx) => { setSelectedFileIndex(idx); setCenterTab("code"); }} />
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
        className="w-full flex items-center gap-1.5 px-2 py-1 text-[12px] text-[#c9d1d9] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors"
        style={{ paddingInlineStart: `${depth * 12 + 20}px` }}
      >
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
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
