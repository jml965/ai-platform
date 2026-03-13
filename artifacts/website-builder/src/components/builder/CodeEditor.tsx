import React, { useState, useCallback, useRef, useEffect } from "react";
import { Save, FileCode2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import Prism from "prismjs";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-python";
import "prismjs/components/prism-bash";

interface CodeEditorProps {
  content: string;
  filePath: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
  className?: string;
}

function getLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
    css: "css", scss: "css", html: "markup", htm: "markup", xml: "markup",
    svg: "markup", json: "json", py: "python", sh: "bash", bash: "bash",
    md: "markup", txt: "markup",
  };
  return map[ext] || "markup";
}

function highlightCode(code: string, language: string): string {
  try {
    const grammar = Prism.languages[language];
    if (grammar) {
      return Prism.highlight(code, grammar, language);
    }
  } catch {}
  return escapeHtml(code);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function CodeEditor({ content, filePath, onSave, readOnly = false, className }: CodeEditorProps) {
  const { t } = useI18n();
  const [editedContent, setEditedContent] = useState(content);
  const [isDirty, setIsDirty] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setEditedContent(content);
    setIsDirty(false);
  }, [content, filePath]);

  const language = getLanguage(filePath);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    setEditedContent(newVal);
    setIsDirty(newVal !== content);
  }, [content]);

  const canSave = !!onSave && !readOnly;

  const handleSave = useCallback(() => {
    if (canSave && isDirty) {
      onSave!(editedContent);
      setIsDirty(false);
    }
  }, [canSave, isDirty, editedContent, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const val = ta.value;
      const newVal = val.substring(0, start) + "  " + val.substring(end);
      setEditedContent(newVal);
      setIsDirty(newVal !== content);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }, [handleSave, content]);

  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const lines = editedContent.split("\n");
  const lineCount = lines.length;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="h-8 flex items-center justify-between px-3 bg-[#161b22] border-b border-[#1c2333] flex-shrink-0">
        <div className="flex items-center gap-2">
          <FileCode2 className="w-3.5 h-3.5 text-[#8b949e]" />
          <span className="text-[11px] text-[#8b949e] font-mono">
            {filePath}
          </span>
          {canSave && isDirty && (
            <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" title={t.editor_unsaved} />
          )}
        </div>
        <div className="flex items-center gap-1">
          {canSave && isDirty && (
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-2 py-0.5 text-[11px] bg-[#1f6feb] text-white rounded hover:bg-[#388bfd] transition-colors"
            >
              <Save className="w-3 h-3" />
              {t.editor_save}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#0d1117]">
        <div className="absolute inset-0 flex">
          <div className="flex-shrink-0 bg-[#0d1117] border-e border-[#1c2333] py-[4px] select-none">
            {Array.from({ length: lineCount }, (_, i) => (
              <div
                key={i}
                className="px-3 text-[12px] leading-[1.5] text-[#484f58] text-end font-mono"
              >
                {i + 1}
              </div>
            ))}
          </div>

          <div className="flex-1 relative overflow-auto">
            <pre
              ref={preRef}
              className="absolute inset-0 p-[4px] ps-2 text-[12px] leading-[1.5] font-mono text-[#c9d1d9] whitespace-pre overflow-auto pointer-events-none"
              dangerouslySetInnerHTML={{
                __html: highlightCode(editedContent, language),
              }}
            />
            <textarea
              ref={textareaRef}
              value={editedContent}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              readOnly={readOnly}
              spellCheck={false}
              className="absolute inset-0 p-[4px] ps-2 text-[12px] leading-[1.5] font-mono text-transparent caret-[#e1e4e8] bg-transparent resize-none outline-none overflow-auto whitespace-pre"
              style={{ caretColor: "#e1e4e8" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
