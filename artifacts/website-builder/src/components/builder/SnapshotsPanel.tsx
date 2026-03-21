import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Archive, Plus, RotateCcw, GitCompare, Trash2, Loader2,
  ChevronDown, ChevronRight, FileText, FilePlus, FileMinus, FileEdit, Check, X
} from "lucide-react";
import { format } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  useListSnapshots,
  useCreateSnapshot,
  useDeleteSnapshot,
  useRestoreSnapshot,
  useCompareSnapshot,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface SnapshotSummary {
  id: string;
  projectId: string;
  label: string;
  description?: string;
  fileCount: number;
  createdAt: string;
}

interface SnapshotFileDiff {
  filePath: string;
  snapshotContent: string;
  currentContent: string;
}

interface SnapshotsPanelProps {
  projectId: string;
}

export default function SnapshotsPanel({ projectId }: SnapshotsPanelProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [expandedSnapshotId, setExpandedSnapshotId] = useState<string | null>(null);
  const [comparingSnapshotId, setComparingSnapshotId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "restore" | "delete"; id: string } | null>(null);

  const { data: snapshotList } = useListSnapshots(projectId, {
    query: {
      queryKey: ["listSnapshots", projectId],
      enabled: !!projectId,
    },
  });

  const createMut = useCreateSnapshot();
  const deleteMut = useDeleteSnapshot();
  const restoreMut = useRestoreSnapshot();

  const { data: compareData } = useCompareSnapshot(projectId, comparingSnapshotId || "", {
    query: {
      queryKey: ["compareSnapshot", projectId, comparingSnapshotId],
      enabled: !!comparingSnapshotId,
    },
  });

  const snapshots: SnapshotSummary[] = (snapshotList?.data || []) as SnapshotSummary[];
  const typedCompareData = compareData as { added: string[]; removed: string[]; modified: SnapshotFileDiff[]; unchanged: string[] } | undefined;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["listSnapshots", projectId] });
    queryClient.invalidateQueries({ queryKey: ["listProjectFiles", projectId] });
  };

  const handleCreate = async () => {
    if (!label.trim()) return;
    try {
      await createMut.mutateAsync({
        projectId,
        data: { label: label.trim(), description: description.trim() || undefined },
      });
      setLabel("");
      setDescription("");
      setShowCreateForm(false);
      invalidateAll();
    } catch {}
  };

  const handleDelete = async (snapshotId: string) => {
    try {
      await deleteMut.mutateAsync({ projectId, snapshotId });
      setConfirmAction(null);
      invalidateAll();
    } catch {}
  };

  const handleRestore = async (snapshotId: string) => {
    try {
      await restoreMut.mutateAsync({ projectId, snapshotId });
      setConfirmAction(null);
      invalidateAll();
    } catch {}
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1c2333] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-[#58a6ff]" />
          <span className="text-xs font-semibold text-[#e1e4e8]">{t.snapshots}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#1c2333] text-[#b0bac5]">
            {snapshots.length}
          </span>
        </div>
        <button
          onClick={() => setShowCreateForm((v) => !v)}
          className="p-1 rounded text-[#b0bac5] hover:text-[#58a6ff] hover:bg-[#1c2333] transition-colors"
          title={t.snapshot_create}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-[#1c2333]"
          >
            <div className="p-3 space-y-2">
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t.snapshot_label}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t.snapshot_description}
                className="w-full bg-[#0d1117] border border-[#30363d] rounded px-2 py-1.5 text-xs text-[#e1e4e8] placeholder-[#484f58] focus:outline-none focus:border-[#58a6ff]"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!label.trim() || createMut.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-[#1f6feb] text-white text-xs rounded hover:bg-[#388bfd] disabled:opacity-50 transition-colors"
                >
                  {createMut.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      {t.snapshot_creating}
                    </>
                  ) : (
                    <>
                      <Plus className="w-3 h-3" />
                      {t.snapshot_create}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="px-2 py-1.5 text-[#b0bac5] text-xs rounded hover:bg-[#1c2333] transition-colors"
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto">
        {snapshots.length === 0 ? (
          <div className="text-center mt-8 px-4">
            <Archive className="w-8 h-8 mx-auto text-[#484f58] mb-2" />
            <p className="text-xs text-[#b0bac5]">{t.snapshot_no_snapshots}</p>
          </div>
        ) : (
          <div className="divide-y divide-[#1c2333]">
            {snapshots.map((snap) => (
              <div key={snap.id} className="group">
                <div
                  className="px-3 py-2 hover:bg-[#161b22] cursor-pointer transition-colors"
                  onClick={() =>
                    setExpandedSnapshotId((prev) =>
                      prev === snap.id ? null : snap.id
                    )
                  }
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      {expandedSnapshotId === snap.id ? (
                        <ChevronDown className="w-3 h-3 text-[#b0bac5]" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-[#b0bac5]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[#e1e4e8] truncate">
                        {snap.label}
                      </p>
                      {snap.description && (
                        <p className="text-[10px] text-[#b0bac5] truncate mt-0.5">
                          {snap.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-[#484f58]">
                          {format(new Date(snap.createdAt), "yyyy-MM-dd HH:mm")}
                        </span>
                        <span className="text-[10px] text-[#484f58]">
                          {snap.fileCount} {t.snapshot_files}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedSnapshotId === snap.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3 pb-2 space-y-1.5">
                        {confirmAction && confirmAction.id === snap.id ? (
                          <div className="bg-[#0d1117] border border-[#30363d] rounded p-2">
                            <p className="text-[11px] text-[#c9d1d9] mb-2">
                              {confirmAction.type === "restore"
                                ? t.snapshot_confirm_restore
                                : t.snapshot_confirm_delete}
                            </p>
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => {
                                  if (confirmAction.type === "restore") {
                                    handleRestore(snap.id);
                                  } else {
                                    handleDelete(snap.id);
                                  }
                                }}
                                disabled={restoreMut.isPending || deleteMut.isPending}
                                className={cn(
                                  "flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[11px] rounded transition-colors",
                                  confirmAction.type === "restore"
                                    ? "bg-[#1f6feb] text-white hover:bg-[#388bfd]"
                                    : "bg-red-600/80 text-white hover:bg-red-600"
                                )}
                              >
                                {(restoreMut.isPending || deleteMut.isPending) ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                                {confirmAction.type === "restore" ? t.snapshot_restore : t.delete}
                              </button>
                              <button
                                onClick={() => setConfirmAction(null)}
                                className="px-2 py-1 text-[11px] text-[#b0bac5] rounded hover:bg-[#1c2333] transition-colors"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmAction({ type: "restore", id: snap.id });
                              }}
                              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[11px] text-[#58a6ff] bg-[#1f6feb]/10 rounded hover:bg-[#1f6feb]/20 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {t.snapshot_restore}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setComparingSnapshotId(
                                  comparingSnapshotId === snap.id ? null : snap.id
                                );
                              }}
                              className={cn(
                                "flex-1 flex items-center justify-center gap-1 px-2 py-1 text-[11px] rounded transition-colors",
                                comparingSnapshotId === snap.id
                                  ? "text-[#d2a8ff] bg-purple-500/20"
                                  : "text-[#b0bac5] bg-[#1c2333] hover:bg-[#21262d]"
                              )}
                            >
                              <GitCompare className="w-3 h-3" />
                              {t.snapshot_compare}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmAction({ type: "delete", id: snap.id });
                              }}
                              className="px-1.5 py-1 text-[11px] text-[#f85149] rounded hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <AnimatePresence>
                          {comparingSnapshotId === snap.id && typedCompareData && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="bg-[#0d1117] border border-[#30363d] rounded p-2 space-y-2 mt-1">
                                <p className="text-[11px] font-medium text-[#e1e4e8]">
                                  {t.snapshot_compare_title}
                                </p>

                                {typedCompareData.added.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <FilePlus className="w-3 h-3 text-emerald-400" />
                                      <span className="text-[10px] text-emerald-400 font-medium">
                                        {t.snapshot_added} ({typedCompareData.added.length})
                                      </span>
                                    </div>
                                    {typedCompareData.added.map((f) => (
                                      <p key={f} className="text-[10px] text-[#b0bac5] ps-4 truncate">{f}</p>
                                    ))}
                                  </div>
                                )}

                                {typedCompareData.removed.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <FileMinus className="w-3 h-3 text-[#f85149]" />
                                      <span className="text-[10px] text-[#f85149] font-medium">
                                        {t.snapshot_removed} ({typedCompareData.removed.length})
                                      </span>
                                    </div>
                                    {typedCompareData.removed.map((f) => (
                                      <p key={f} className="text-[10px] text-[#b0bac5] ps-4 truncate">{f}</p>
                                    ))}
                                  </div>
                                )}

                                {typedCompareData.modified.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <FileEdit className="w-3 h-3 text-[#d29922]" />
                                      <span className="text-[10px] text-[#d29922] font-medium">
                                        {t.snapshot_modified} ({typedCompareData.modified.length})
                                      </span>
                                    </div>
                                    {typedCompareData.modified.map((f) => (
                                      <p key={f.filePath} className="text-[10px] text-[#b0bac5] ps-4 truncate">
                                        {f.filePath}
                                      </p>
                                    ))}
                                  </div>
                                )}

                                {typedCompareData.unchanged.length > 0 && (
                                  <div>
                                    <div className="flex items-center gap-1 mb-1">
                                      <FileText className="w-3 h-3 text-[#484f58]" />
                                      <span className="text-[10px] text-[#484f58] font-medium">
                                        {t.snapshot_unchanged} ({typedCompareData.unchanged.length})
                                      </span>
                                    </div>
                                  </div>
                                )}

                                {typedCompareData.added.length === 0 &&
                                  typedCompareData.removed.length === 0 &&
                                  typedCompareData.modified.length === 0 && (
                                    <p className="text-[10px] text-[#b0bac5]">
                                      {t.snapshot_unchanged}
                                    </p>
                                  )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
