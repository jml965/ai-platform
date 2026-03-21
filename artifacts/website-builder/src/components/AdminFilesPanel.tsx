import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  File,
  Image,
  Settings,
  Package,
  X,
  RefreshCw,
  Search,
  Copy,
  Check,
  Pencil,
  Save,
  Undo2,
  MoreVertical,
  Trash2,
  FolderPlus,
  FilePlus,
  Type,
  ClipboardCopy,
  Download,
  Terminal,
  FolderMinus,
} from "lucide-react";

interface FileNode {
  name: string;
  type: "file" | "folder";
  children?: FileNode[];
}

interface ContextMenuAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  divider?: boolean;
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["ts", "tsx", "js", "jsx"].includes(ext))
    return <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />;
  if (["json"].includes(ext))
    return <Settings className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />;
  if (["md"].includes(ext))
    return <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />;
  if (["png", "jpg", "jpeg", "gif", "svg", "ico", "webp"].includes(ext))
    return <Image className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />;
  if (["yaml", "yml", "toml"].includes(ext))
    return <Package className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />;
  if (["sh"].includes(ext))
    return <FileText className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />;
  if (["css", "scss"].includes(ext))
    return <FileCode className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />;
  if (["html"].includes(ext))
    return <FileCode className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />;
  if (name === "Dockerfile")
    return <Package className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />;
  return <File className="w-3.5 h-3.5 text-[#b0bac5] flex-shrink-0" />;
}

function ContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: ContextMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight) {
      el.style.top = `${y - rect.height}px`;
    }
    if (rect.right > window.innerWidth) {
      el.style.left = `${x - rect.width}px`;
    }
  }, [x, y]);

  return (
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        ref={ref}
        className="fixed z-[101] bg-[#1c2128] border border-white/10 rounded-lg shadow-xl py-1 min-w-[180px] animate-in fade-in duration-100"
        style={{ left: x, top: y }}
      >
        {actions.map((action, i) => (
          <React.Fragment key={i}>
            {action.divider && i > 0 && <div className="border-t border-white/8 my-1" />}
            <button
              onClick={() => { action.onClick(); onClose(); }}
              className={`w-full flex items-center gap-2.5 px-3 py-[6px] text-[12px] transition-colors ${
                action.danger
                  ? "text-red-400 hover:bg-red-500/10"
                  : "text-[#c9d1d9] hover:bg-white/5"
              }`}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

function InlineInput({
  defaultValue,
  onSubmit,
  onCancel,
  placeholder,
}: {
  defaultValue: string;
  onSubmit: (val: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) onSubmit(value.trim());
        if (e.key === "Escape") onCancel();
      }}
      onBlur={() => {
        if (value.trim() && value.trim() !== defaultValue) onSubmit(value.trim());
        else onCancel();
      }}
      placeholder={placeholder}
      className="bg-[#0d419d]/30 border border-[#388bfd] rounded px-1.5 py-[2px] text-[12px] text-[#c9d1d9] outline-none w-full font-mono"
    />
  );
}

function TreeNodeItem({
  node,
  depth,
  parentPath,
  onFileClick,
  searchTerm,
  expandedFolders,
  toggleFolder,
  onContextMenu,
  renamingPath,
  setRenamingPath,
  onRenameSubmit,
  creatingIn,
  creatingType,
  onCreateSubmit,
  onCreateCancel,
}: {
  node: FileNode;
  depth: number;
  parentPath: string;
  onFileClick: (path: string) => void;
  searchTerm: string;
  expandedFolders: Set<string>;
  toggleFolder: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, fullPath: string, nodeType: "file" | "folder") => void;
  renamingPath: string | null;
  setRenamingPath: (p: string | null) => void;
  onRenameSubmit: (oldPath: string, newName: string) => void;
  creatingIn: string | null;
  creatingType: "file" | "folder" | null;
  onCreateSubmit: (parentPath: string, name: string, type: "file" | "folder") => void;
  onCreateCancel: () => void;
}) {
  const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isExpanded = expandedFolders.has(fullPath);
  const isRenaming = renamingPath === fullPath;

  if (searchTerm && node.type === "file") {
    if (!node.name.toLowerCase().includes(searchTerm.toLowerCase())) return null;
  }

  if (node.type === "folder") {
    let visibleChildren = node.children || [];
    if (searchTerm) {
      visibleChildren = filterTree(visibleChildren, searchTerm);
      if (visibleChildren.length === 0 && !node.name.toLowerCase().includes(searchTerm.toLowerCase())) return null;
    }

    return (
      <div>
        <div
          className="flex items-center w-full group"
          onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, fullPath, "folder"); }}
        >
          <button
            onClick={() => toggleFolder(fullPath)}
            className="flex items-center gap-1 flex-1 min-w-0 px-1 py-[3px] text-[12px] text-[#c9d1d9] hover:bg-white/5 rounded transition-colors"
            style={{ paddingLeft: `${depth * 12 + 4}px` }}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-[#b0bac5] flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3 h-3 text-[#b0bac5] flex-shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-[#e3b341] flex-shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-[#b0bac5] flex-shrink-0" />
            )}
            {isRenaming ? (
              <InlineInput
                defaultValue={node.name}
                onSubmit={(val) => { onRenameSubmit(fullPath, val); setRenamingPath(null); }}
                onCancel={() => setRenamingPath(null)}
              />
            ) : (
              <span className="truncate">{node.name}</span>
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onContextMenu(e, fullPath, "folder"); }}
            className="opacity-0 group-hover:opacity-100 p-0.5 mr-1 rounded hover:bg-white/10 text-[#b0bac5] hover:text-white transition-all flex-shrink-0"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>
        {isExpanded && (
          <div>
            {creatingIn === fullPath && creatingType && (
              <div className="flex items-center gap-1 px-1 py-[3px]" style={{ paddingLeft: `${(depth + 1) * 12 + 20}px` }}>
                {creatingType === "folder" ? (
                  <Folder className="w-3.5 h-3.5 text-[#e3b341] flex-shrink-0" />
                ) : (
                  <File className="w-3.5 h-3.5 text-[#b0bac5] flex-shrink-0" />
                )}
                <InlineInput
                  defaultValue=""
                  onSubmit={(val) => onCreateSubmit(fullPath, val, creatingType)}
                  onCancel={onCreateCancel}
                  placeholder={creatingType === "folder" ? "folder name" : "file name"}
                />
              </div>
            )}
            {visibleChildren.map((child, i) => (
              <TreeNodeItem
                key={child.name + i}
                node={child}
                depth={depth + 1}
                parentPath={fullPath}
                onFileClick={onFileClick}
                searchTerm={searchTerm}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onContextMenu={onContextMenu}
                renamingPath={renamingPath}
                setRenamingPath={setRenamingPath}
                onRenameSubmit={onRenameSubmit}
                creatingIn={creatingIn}
                creatingType={creatingType}
                onCreateSubmit={onCreateSubmit}
                onCreateCancel={onCreateCancel}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center w-full group"
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, fullPath, "file"); }}
    >
      <button
        onClick={() => onFileClick(fullPath)}
        className="flex items-center gap-1.5 flex-1 min-w-0 px-1 py-[3px] text-[12px] text-[#c9d1d9] hover:bg-white/5 rounded transition-colors"
        style={{ paddingLeft: `${depth * 12 + 20}px` }}
      >
        {getFileIcon(node.name)}
        {isRenaming ? (
          <InlineInput
            defaultValue={node.name}
            onSubmit={(val) => { onRenameSubmit(fullPath, val); setRenamingPath(null); }}
            onCancel={() => setRenamingPath(null)}
          />
        ) : (
          <span className="truncate">{node.name}</span>
        )}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onContextMenu(e, fullPath, "file"); }}
        className="opacity-0 group-hover:opacity-100 p-0.5 mr-1 rounded hover:bg-white/10 text-[#b0bac5] hover:text-white transition-all flex-shrink-0"
      >
        <MoreVertical className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function filterTree(nodes: FileNode[], term: string): FileNode[] {
  return nodes.reduce<FileNode[]>((acc, node) => {
    if (node.type === "file") {
      if (node.name.toLowerCase().includes(term.toLowerCase())) acc.push(node);
    } else {
      const filteredChildren = filterTree(node.children || [], term);
      if (filteredChildren.length > 0 || node.name.toLowerCase().includes(term.toLowerCase())) {
        acc.push({ ...node, children: filteredChildren });
      }
    }
    return acc;
  }, []);
}

function FileViewer({ filePath, onClose }: { filePath: string; onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [originalContent, setOriginalContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isEditable = useCallback((name: string) => {
    const ext = name.split(".").pop()?.toLowerCase() || "";
    const editableExts = ["ts", "tsx", "js", "jsx", "json", "css", "scss", "html", "md", "yaml", "yml", "toml", "sh", "txt", "env", "sql"];
    return editableExts.includes(ext) || name === "Dockerfile" || name === ".gitignore" || name === ".dockerignore";
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setEditing(false);
    setSaveStatus("idle");
    fetch(`/api/infra/file-content?path=${encodeURIComponent(filePath)}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load file");
        return r.json();
      })
      .then((data) => {
        setContent(data.content);
        setOriginalContent(data.content);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [filePath]);

  const handleCopy = useCallback(() => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [content]);

  const handleSave = useCallback(async () => {
    if (content === null) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const res = await fetch("/api/infra/file-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ path: filePath, content }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Failed to save");
      }
      setOriginalContent(content);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2500);
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } finally {
      setSaving(false);
    }
  }, [content, filePath]);

  const handleUndo = useCallback(() => {
    setContent(originalContent);
  }, [originalContent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  const hasChanges = content !== originalContent;
  const fileName = filePath.split("/").pop() || filePath;
  const canEdit = isEditable(fileName);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#161b22] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {getFileIcon(fileName)}
          <span className="text-[11px] text-[#c9d1d9] truncate font-mono">{filePath}</span>
          {hasChanges && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved changes" />}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {canEdit && !editing && (
            <button
              onClick={() => {
                setEditing(true);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }}
              className="p-1 rounded hover:bg-white/10 text-[#b0bac5] hover:text-white transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {editing && hasChanges && (
            <button
              onClick={handleUndo}
              className="p-1 rounded hover:bg-white/10 text-[#b0bac5] hover:text-white transition-colors"
              title="Undo changes"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
          {editing && (
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`p-1 rounded transition-colors ${
                hasChanges
                  ? "hover:bg-green-500/20 text-green-400 hover:text-green-300"
                  : "text-[#484f58] cursor-not-allowed"
              }`}
              title="Save (Ctrl+S)"
            >
              {saving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : saveStatus === "saved" ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-white/10 text-[#b0bac5] hover:text-white transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10 text-[#b0bac5] hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {saveStatus === "saved" && (
        <div className="px-3 py-1 bg-green-500/10 border-b border-green-500/20 text-green-400 text-[11px]">
          Saved successfully
        </div>
      )}
      {saveStatus === "error" && (
        <div className="px-3 py-1 bg-red-500/10 border-b border-red-500/20 text-red-400 text-[11px]">
          Failed to save
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {loading && <div className="text-[#b0bac5] text-[12px] animate-pulse p-3">Loading...</div>}
        {error && <div className="text-red-400 text-[12px] p-3">{error}</div>}
        {content !== null && editing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full h-full bg-transparent text-[11px] text-[#c9d1d9] font-mono leading-[1.6] p-3 resize-none outline-none border-none"
            spellCheck={false}
          />
        ) : content !== null ? (
          <pre className="text-[11px] text-[#c9d1d9] font-mono whitespace-pre leading-[1.6] select-text p-3">
            {content}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminFilesPanel({ onClose }: { onClose: () => void }) {
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set([".agents", ".github", "artifacts", "docs", "lib", "scripts"])
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showMenu, setShowMenu] = useState(false);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; nodeType: "file" | "folder" } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingIn, setCreatingIn] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(null);
  const [notification, setNotification] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const showNotification = useCallback((text: string, type: "success" | "error" = "success") => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 3000);
  }, []);

  const fetchTree = useCallback(() => {
    setLoading(true);
    fetch("/api/infra/files", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setTree(data.tree || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedFolders(new Set());
    setShowMenu(false);
  }, []);

  const expandAll = useCallback(() => {
    const allFolders = new Set<string>();
    function walk(nodes: FileNode[], parentPath: string) {
      for (const n of nodes) {
        if (n.type === "folder") {
          const p = parentPath ? `${parentPath}/${n.name}` : n.name;
          allFolders.add(p);
          if (n.children) walk(n.children, p);
        }
      }
    }
    walk(tree, "");
    setExpandedFolders(allFolders);
    setShowMenu(false);
  }, [tree]);

  const handleContextMenu = useCallback((e: React.MouseEvent, fullPath: string, nodeType: "file" | "folder") => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, path: fullPath, nodeType });
  }, []);

  const handleRename = useCallback(async (oldPath: string, newName: string) => {
    try {
      const res = await fetch("/api/infra/file-rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ oldPath, newName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Rename failed");
      }
      showNotification(`Renamed to ${newName}`);
      fetchTree();
    } catch (err: any) {
      showNotification(err.message || "Rename failed", "error");
    }
  }, [fetchTree, showNotification]);

  const handleCreate = useCallback(async (parentPath: string, name: string, type: "file" | "folder") => {
    try {
      const res = await fetch("/api/infra/file-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ parentPath, name, type }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Create failed");
      }
      showNotification(`Created ${type}: ${name}`);
      setExpandedFolders((prev) => new Set([...prev, parentPath]));
      fetchTree();
    } catch (err: any) {
      showNotification(err.message || "Create failed", "error");
    } finally {
      setCreatingIn(null);
      setCreatingType(null);
    }
  }, [fetchTree, showNotification]);

  const handleDelete = useCallback(async (filePath: string) => {
    const name = filePath.split("/").pop() || filePath;
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/infra/file-delete?path=${encodeURIComponent(filePath)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || "Delete failed");
      }
      showNotification(`Deleted: ${name}`);
      if (selectedFile === filePath) setSelectedFile(null);
      fetchTree();
    } catch (err: any) {
      showNotification(err.message || "Delete failed", "error");
    }
  }, [fetchTree, selectedFile, showNotification]);

  const handleCopyPath = useCallback((filePath: string) => {
    navigator.clipboard.writeText(filePath);
    showNotification("Path copied");
  }, [showNotification]);

  const handleDownload = useCallback(async (filePath: string) => {
    try {
      const res = await fetch(`/api/infra/file-content?path=${encodeURIComponent(filePath)}`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const data = await res.json();
      const blob = new Blob([data.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filePath.split("/").pop() || "file";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification("Download started");
    } catch {
      showNotification("Download failed", "error");
    }
  }, [showNotification]);

  const getContextActions = useCallback((): ContextMenuAction[] => {
    if (!contextMenu) return [];
    const { path: itemPath, nodeType } = contextMenu;

    if (nodeType === "folder") {
      return [
        { label: "Rename", icon: <Type className="w-3.5 h-3.5" />, onClick: () => setRenamingPath(itemPath) },
        { label: "Search this directory", icon: <Search className="w-3.5 h-3.5" />, onClick: () => { setSearchTerm(itemPath.split("/").pop() || ""); } },
        { label: "Add file", icon: <FilePlus className="w-3.5 h-3.5" />, onClick: () => { setCreatingIn(itemPath); setCreatingType("file"); setExpandedFolders((p) => new Set([...p, itemPath])); }, divider: true },
        { label: "Add folder", icon: <FolderPlus className="w-3.5 h-3.5" />, onClick: () => { setCreatingIn(itemPath); setCreatingType("folder"); setExpandedFolders((p) => new Set([...p, itemPath])); } },
        { label: "Collapse child folders", icon: <FolderMinus className="w-3.5 h-3.5" />, onClick: () => { setExpandedFolders((prev) => { const next = new Set(prev); for (const k of next) { if (k.startsWith(itemPath + "/")) next.delete(k); } return next; }); }, divider: true },
        { label: "Copy file path", icon: <ClipboardCopy className="w-3.5 h-3.5" />, onClick: () => handleCopyPath(itemPath), divider: true },
        { label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => handleDelete(itemPath), danger: true, divider: true },
      ];
    }

    return [
      { label: "Rename", icon: <Type className="w-3.5 h-3.5" />, onClick: () => setRenamingPath(itemPath) },
      { label: "Open file", icon: <FileText className="w-3.5 h-3.5" />, onClick: () => setSelectedFile(itemPath), divider: true },
      { label: "Copy file path", icon: <ClipboardCopy className="w-3.5 h-3.5" />, onClick: () => handleCopyPath(itemPath), divider: true },
      { label: "Download", icon: <Download className="w-3.5 h-3.5" />, onClick: () => handleDownload(itemPath) },
      { label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, onClick: () => handleDelete(itemPath), danger: true, divider: true },
    ];
  }, [contextMenu, handleCopyPath, handleDelete, handleDownload]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117]">
      {notification && (
        <div className={`absolute top-2 left-2 right-2 z-50 px-3 py-2 rounded-md text-[11px] font-medium shadow-lg transition-all ${
          notification.type === "success"
            ? "bg-green-500/15 border border-green-500/30 text-green-400"
            : "bg-red-500/15 border border-red-500/30 text-red-400"
        }`}>
          {notification.text}
        </div>
      )}

      <div className="flex items-center justify-between px-3 py-2.5 flex-shrink-0">
        <span className="text-[13px] font-semibold text-[#c9d1d9]">Library</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex items-center gap-1 text-[11px] text-[#b0bac5] hover:text-[#c9d1d9] transition-colors"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            <span>File tree</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-[#b0bac5] hover:text-[#c9d1d9] transition-colors p-0.5"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            {showMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                <div className="absolute right-0 top-6 z-20 bg-[#1c2128] border border-white/10 rounded-md shadow-lg py-1 min-w-[140px]">
                  <button onClick={fetchTree} className="w-full text-start px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-white/5">Refresh</button>
                  <button onClick={expandAll} className="w-full text-start px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-white/5">Expand all</button>
                  <button onClick={collapseAll} className="w-full text-start px-3 py-1.5 text-[11px] text-[#c9d1d9] hover:bg-white/5">Collapse all</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-2 pb-2 flex-shrink-0">
        <div className="flex items-center gap-1.5 bg-white/5 border border-white/7 rounded-md px-2.5 py-1.5">
          <Search className="w-3.5 h-3.5 text-[#484f58] flex-shrink-0" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search files"
            className="bg-transparent text-[12px] text-[#c9d1d9] placeholder-[#484f58] outline-none flex-1 w-full"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="text-[#b0bac5] hover:text-white">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {selectedFile ? (
        <FileViewer filePath={selectedFile} onClose={() => setSelectedFile(null)} />
      ) : (
        <div className="flex-1 overflow-y-auto px-1 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-4 h-4 text-[#b0bac5] animate-spin" />
            </div>
          ) : tree.length === 0 ? (
            <div className="text-[#b0bac5] text-[12px] text-center py-8">No files found</div>
          ) : (
            tree.map((node, i) => (
              <TreeNodeItem
                key={node.name + i}
                node={node}
                depth={0}
                parentPath=""
                onFileClick={(path) => setSelectedFile(path)}
                searchTerm={searchTerm}
                expandedFolders={expandedFolders}
                toggleFolder={toggleFolder}
                onContextMenu={handleContextMenu}
                renamingPath={renamingPath}
                setRenamingPath={setRenamingPath}
                onRenameSubmit={handleRename}
                creatingIn={creatingIn}
                creatingType={creatingType}
                onCreateSubmit={handleCreate}
                onCreateCancel={() => { setCreatingIn(null); setCreatingType(null); }}
              />
            ))
          )}
        </div>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={getContextActions()}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
