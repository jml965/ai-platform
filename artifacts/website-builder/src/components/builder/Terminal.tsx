import React, { useRef, useEffect, useState } from "react";
import { Terminal as TerminalIcon, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { ExecutionLog } from "@workspace/api-client-react";

interface TerminalProps {
  logs: ExecutionLog[];
  isBuilding: boolean;
  className?: string;
}

const ANSI_COLORS: Record<string, string> = {
  "30": "text-gray-900", "31": "text-red-400", "32": "text-green-400",
  "33": "text-yellow-400", "34": "text-blue-400", "35": "text-purple-400",
  "36": "text-cyan-400", "37": "text-gray-300",
  "90": "text-gray-500", "91": "text-red-300", "92": "text-emerald-300",
  "93": "text-yellow-300", "94": "text-blue-300", "95": "text-purple-300",
  "96": "text-cyan-300", "97": "text-white",
};

function parseAnsi(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /\x1b\[(\d+)m/g;
  let lastIndex = 0;
  let currentColor = "";
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      parts.push(
        currentColor
          ? <span key={lastIndex} className={currentColor}>{chunk}</span>
          : chunk
      );
    }
    const code = match[1];
    if (code === "0") {
      currentColor = "";
    } else if (ANSI_COLORS[code]) {
      currentColor = ANSI_COLORS[code];
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    parts.push(
      currentColor
        ? <span key={lastIndex} className={currentColor}>{chunk}</span>
        : chunk
    );
  }

  return parts;
}

function getLogColor(log: ExecutionLog): string {
  if (log.status === "failed" || log.status === "error") return "text-red-400";
  if (log.status === "completed" || log.status === "success") return "text-emerald-400";
  if (log.status === "in_progress" || log.status === "running") return "text-yellow-400";
  return "text-[#8b949e]";
}

function getLogPrefix(log: ExecutionLog): string {
  const time = log.createdAt ? new Date(log.createdAt).toLocaleTimeString("en-US", { hour12: false }) : "";
  const agent = log.agentType || "system";
  return `[${time}] [${agent}]`;
}

function formatLogMessage(log: ExecutionLog): string {
  let msg = `${log.action}`;
  if (log.details) {
    const detailStr = typeof log.details === "object"
      ? Object.entries(log.details)
        .filter(([k]) => k !== "type")
        .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" ")
      : String(log.details);
    if (detailStr) msg += ` ${detailStr}`;
  }
  return msg;
}

export default function BuildTerminal({ logs, isBuilding, className }: TerminalProps) {
  const { t } = useI18n();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  };

  return (
    <div className={cn("flex flex-col bg-[#0d1117] border-t border-[#1c2333]", className)}>
      <div className="h-8 flex items-center justify-between px-3 bg-[#161b22] border-b border-[#1c2333] flex-shrink-0">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-3.5 h-3.5 text-[#8b949e]" />
          <span className="text-[11px] font-semibold text-[#e1e4e8] uppercase tracking-wider">
            {t.terminal}
          </span>
          {isBuilding && (
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
          <span className="text-[10px] text-[#484f58]">
            {logs.length} {t.terminal_lines}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(v => !v)}
            className="p-1 text-[#8b949e] hover:text-[#e1e4e8] hover:bg-[#1c2333] rounded transition-colors"
          >
            {isMinimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!isMinimized && (
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-2 font-mono text-[12px] leading-[1.6] min-h-[120px] max-h-[250px]"
        >
          {logs.length === 0 ? (
            <div className="text-[#484f58] text-center py-4">
              {t.terminal_empty}
            </div>
          ) : (
            logs.map((log, i) => (
              <div key={log.id || i} className="flex gap-1 hover:bg-[#161b22] px-1 rounded">
                <span className="text-[#484f58] flex-shrink-0 select-none">
                  {getLogPrefix(log)}
                </span>
                <span className={cn("flex-shrink-0", log.status === "failed" ? "text-red-400" : "text-[#58a6ff]")}>
                  {log.status === "completed" ? "✓" : log.status === "failed" ? "✗" : log.status === "in_progress" ? "⟳" : "·"}
                </span>
                <span className={getLogColor(log)}>
                  {parseAnsi(formatLogMessage(log))}
                </span>
              </div>
            ))
          )}
          {isBuilding && (
            <div className="flex items-center gap-2 px-1 text-yellow-400">
              <span className="animate-pulse">▋</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
