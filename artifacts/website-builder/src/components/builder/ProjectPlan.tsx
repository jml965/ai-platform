import React from "react";
import { CheckCircle2, Edit3, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

interface PlanStep {
  title: string;
  description?: string;
  status?: "pending" | "done" | "active";
}

interface ProjectPlanProps {
  steps: PlanStep[];
  onApprove?: () => void;
  onModify?: () => void;
  isApproved?: boolean;
  className?: string;
}

export default function ProjectPlan({ steps, onApprove, onModify, isApproved, className }: ProjectPlanProps) {
  const { t } = useI18n();

  if (steps.length === 0) return null;

  return (
    <div className={cn("bg-[#161b22] border border-[#1c2333] rounded-lg overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[#1c2333] bg-[#0d1117]/50">
        <ListChecks className="w-4 h-4 text-[#58a6ff]" />
        <span className="text-sm font-semibold text-[#e1e4e8]">{t.plan_title}</span>
        {isApproved && (
          <span className="ms-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {t.plan_approved}
          </span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {steps.map((step, idx) => (
          <div
            key={idx}
            className={cn(
              "flex items-start gap-3 px-3 py-2 rounded-md transition-colors",
              step.status === "active" && "bg-[#1f6feb]/10 border border-[#1f6feb]/20",
              step.status === "done" && "opacity-70",
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[11px] font-bold",
              step.status === "done" ? "bg-emerald-500/20 text-emerald-400" :
              step.status === "active" ? "bg-[#1f6feb]/20 text-[#58a6ff]" :
              "bg-[#1c2333] text-[#484f58]"
            )}>
              {step.status === "done" ? "✓" : idx + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-[13px] font-medium",
                step.status === "done" ? "text-[#b0bac5] line-through" : "text-[#e1e4e8]"
              )}>
                {step.title}
              </p>
              {step.description && (
                <p className="text-[11px] text-[#484f58] mt-0.5">{step.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {!isApproved && (onApprove || onModify) && (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-[#1c2333]">
          {onApprove && (
            <button
              onClick={onApprove}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md hover:bg-emerald-500/30 transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {t.plan_approve}
            </button>
          )}
          {onModify && (
            <button
              onClick={onModify}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-[#b0bac5] border border-[#30363d] rounded-md hover:text-[#e1e4e8] hover:bg-[#1c2333] transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {t.plan_modify}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
