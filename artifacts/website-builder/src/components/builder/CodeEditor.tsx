import React, { useRef, useEffect, useCallback, useState } from "react";
import { Save, FileCode2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, crosshairCursor, highlightSpecialChars } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, indentWithTab, history, historyKeymap, undo, redo } from "@codemirror/commands";
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { yaml } from "@codemirror/lang-yaml";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";

interface CodeEditorProps {
  content: string;
  filePath: string;
  onSave?: (content: string) => void;
  readOnly?: boolean;
  className?: string;
}

function getLanguageExtension(filePath: string) {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const fileName = filePath.split("/").pop()?.toLowerCase() || "";
  switch (ext) {
    case "js": case "jsx": case "mjs": case "cjs": return javascript({ jsx: true });
    case "ts": case "tsx": case "mts": case "cts": return javascript({ jsx: true, typescript: true });
    case "html": case "htm": case "svg": case "xml": case "ejs": case "hbs": return html();
    case "css": case "scss": case "less": return css();
    case "py": case "pyw": return python();
    case "json": case "jsonc": return json();
    case "md": case "mdx": case "markdown": return markdown();
    case "yml": case "yaml": return yaml();
    case "sql": return sql();
    case "sh": case "bash": case "zsh": return [];
    case "graphql": case "gql": return [];
    case "prisma": return [];
    case "env": return [];
    case "toml": return [];
    case "txt": return [];
    default:
      if (fileName === "dockerfile" || fileName === ".dockerignore") return [];
      if (fileName === ".gitignore" || fileName === ".env" || fileName.startsWith(".env.")) return [];
      if (fileName === "makefile") return [];
      return [];
  }
}

const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "#0d1117",
    color: "#c9d1d9",
    fontSize: "13px",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    padding: "4px 0",
    caretColor: "#58a6ff",
  },
  ".cm-cursor": {
    borderLeftColor: "#58a6ff",
    borderLeftWidth: "2px",
  },
  ".cm-activeLine": {
    backgroundColor: "#161b2280",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "#161b2280",
    color: "#e1e4e8",
  },
  ".cm-gutters": {
    backgroundColor: "#0d1117",
    color: "#484f58",
    borderRight: "1px solid #1c2333",
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 8px 0 12px",
    minWidth: "3ch",
  },
  ".cm-foldGutter .cm-gutterElement": {
    padding: "0 4px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "#1f6feb40 !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "#1f6feb60 !important",
  },
  ".cm-matchingBracket": {
    backgroundColor: "#17e5e640",
    outline: "1px solid #17e5e680",
  },
  ".cm-searchMatch": {
    backgroundColor: "#e2b71440",
    outline: "1px solid #e2b71480",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "#e2b71480",
  },
  ".cm-tooltip": {
    backgroundColor: "#161b22",
    border: "1px solid #30363d",
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li": {
      padding: "2px 8px",
    },
    "& > ul > li[aria-selected]": {
      backgroundColor: "#1f6feb40",
      color: "#e1e4e8",
    },
  },
  ".cm-panels": {
    backgroundColor: "#161b22",
    borderTop: "1px solid #30363d",
    color: "#c9d1d9",
  },
  ".cm-panel.cm-search": {
    padding: "4px 8px",
  },
  ".cm-panel.cm-search input": {
    backgroundColor: "#0d1117",
    border: "1px solid #30363d",
    color: "#c9d1d9",
    borderRadius: "4px",
    padding: "2px 6px",
  },
  ".cm-panel.cm-search button": {
    backgroundColor: "#21262d",
    border: "1px solid #30363d",
    color: "#c9d1d9",
    borderRadius: "4px",
    padding: "2px 8px",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
});

export default function CodeEditor({ content, filePath, onSave, readOnly = false, className }: CodeEditorProps) {
  const { t } = useI18n();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const langCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const [isDirty, setIsDirty] = useState(false);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef(content);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  contentRef.current = content;

  const handleSave = useCallback(() => {
    if (viewRef.current && onSaveRef.current && !readOnly) {
      const currentContent = viewRef.current.state.doc.toString();
      onSaveRef.current(currentContent);
      setIsDirty(false);
    }
  }, [readOnly]);

  const handleCopy = useCallback(() => {
    if (viewRef.current) {
      navigator.clipboard.writeText(viewRef.current.state.doc.toString());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;

    const saveKeymap = keymap.of([{
      key: "Mod-s",
      run: () => {
        if (onSaveRef.current && !readOnly) {
          const currentContent = viewRef.current?.state.doc.toString() || "";
          onSaveRef.current(currentContent);
          setIsDirty(false);
        }
        return true;
      },
    }]);

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString();
        setIsDirty(newContent !== contentRef.current);
      }
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        langCompartment.current.of(getLanguageExtension(filePath)),
        readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        darkTheme,
        oneDark,
        saveKeymap,
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          indentWithTab,
        ]),
        updateListener,
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentContent = view.state.doc.toString();
    if (currentContent !== content) {
      view.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content },
      });
      setIsDirty(false);
    }
  }, [content]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(getLanguageExtension(filePath)),
    });
  }, [filePath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(readOnly)),
    });
  }, [readOnly]);

  const canSave = !!onSave && !readOnly;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="h-8 flex items-center justify-between px-3 bg-[#161b22] border-b border-[#1c2333] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode2 className="w-3.5 h-3.5 text-[#b0bac5] flex-shrink-0" />
          <span className="text-[11px] text-[#b0bac5] font-mono truncate">
            {filePath}
          </span>
          {canSave && isDirty && (
            <span className="w-2 h-2 rounded-full bg-yellow-400 flex-shrink-0" title={t.editor_unsaved} />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2 py-0.5 text-[11px] text-[#b0bac5] hover:text-[#e1e4e8] hover:bg-[#21262d] rounded transition-colors"
            title="Copy"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          </button>
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

      <div ref={editorRef} className="flex-1 overflow-hidden" />
    </div>
  );
}
