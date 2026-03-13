import React from "react";
import { CheckCircle2, Loader2, Circle, XCircle, Sparkles, Code2, Package, Play, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export type BuildPhase = "planning" | "generating" | "installing" | "running" | "ready";

interface BuildProgressProps {
  currentPhase: BuildPhase | null;
  failed?: boolean;
  allComplete?: boolean;
  className?: string;
}

const PHASES: { key: BuildPhase; icon: React.ElementType }[] = [
  { key: "planning", icon: Sparkles },
  { key: "generating", icon: Code2 },
  { key: "installing", icon: Package },
  { key: "running", icon: Play },
  { key: "ready", icon: Rocket },
];

function getPhaseIndex(phase: BuildPhase | null): number {
  if (!phase) return -1;
  return PHASES.findIndex(p => p.key === phase);
}

export default function BuildProgress({ currentPhase, failed, allComplete, className }: BuildProgressProps) {
  const { t } = useI18n();
  const currentIndex = getPhaseIndex(currentPhase);

  if (currentPhase === null) return null;

  return (
    <div className={cn("flex items-center gap-1 px-3 py-2 bg-[#161b22] border-b border-[#1c2333]", className)}>
      {PHASES.map((phase, idx) => {
        const Icon = phase.icon;
        const isActive = idx === currentIndex && !allComplete;
        const isCompleted = idx < currentIndex || (allComplete && idx <= currentIndex);
        const isFailed = failed && idx === currentIndex;
        const isPending = idx > currentIndex && !allComplete;

        const phaseLabel = t[`phase_${phase.key}` as keyof typeof t] || phase.key;

        return (
          <React.Fragment key={phase.key}>
            <div className="flex items-center gap-1.5">
              <div className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300",
                isFailed && "bg-red-500/20 text-red-400",
                isCompleted && "bg-emerald-500/20 text-emerald-400",
                isActive && !isFailed && "bg-[#1f6feb]/20 text-[#58a6ff]",
                isPending && "bg-[#1c2333] text-[#484f58]",
              )}>
                {isFailed ? (
                  <XCircle className="w-3.5 h-3.5" />
                ) : isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Circle className="w-3 h-3" />
                )}
              </div>
              <span className={cn(
                "text-[11px] font-medium transition-colors",
                isFailed && "text-red-400",
                isCompleted && "text-emerald-400",
                isActive && !isFailed && "text-[#e1e4e8]",
                isPending && "text-[#484f58]",
              )}>
                {phaseLabel}
              </span>
            </div>
            {idx < PHASES.length - 1 && (
              <div className={cn(
                "flex-1 h-px min-w-[16px] max-w-[40px] transition-colors duration-300",
                isCompleted ? "bg-emerald-500/40" : "bg-[#1c2333]"
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function classifyAction(action: string): BuildPhase {
  const a = action.toLowerCase();
  if (a.includes("plan") || a.includes("analyz")) return "planning";
  if (a.includes("install") || a.includes("package") || a.includes("npm") || a.includes("pip")) return "installing";
  if (a.includes("run") || a.includes("start") || a.includes("server") || a.includes("preview")) return "running";
  return "generating";
}

export function inferPhase(
  buildStatus: string | undefined,
  logs: { action: string; status: string }[]
): BuildPhase | null {
  if (!buildStatus) return null;
  if (buildStatus === "completed") return "ready";
  if (buildStatus === "pending") return "planning";

  const lastLog = logs[logs.length - 1];

  if (buildStatus === "failed") {
    if (lastLog) return classifyAction(lastLog.action);
    return "generating";
  }

  if (!lastLog) return "planning";
  return classifyAction(lastLog.action);
}
