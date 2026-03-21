import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Lock, Unlock, Circle, FileCode2, LogIn, LogOut, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { CollaboratorInfo, FileLock, CollaborationNotification } from "@/hooks/useCollaboration";

interface CollaborationPanelProps {
  collaborators: CollaboratorInfo[];
  fileLocks: Record<string, FileLock>;
  notifications: CollaborationNotification[];
  connected: boolean;
  currentUserId?: string;
  onLockFile?: (filePath: string) => void;
  onUnlockFile?: (filePath: string) => void;
}

export default function CollaborationPanel({
  collaborators,
  fileLocks,
  notifications,
  connected,
  currentUserId,
}: CollaborationPanelProps) {
  const { t } = useI18n();

  const otherCollaborators = collaborators.filter(c => c.userId !== currentUserId);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1c2333] bg-[#161b22] flex items-center gap-2">
        <Users className="w-3.5 h-3.5 text-[#b0bac5]" />
        <span className="text-[11px] font-semibold text-[#e1e4e8] uppercase tracking-wider">
          {t.collab_panel_title}
        </span>
        <span className="ms-auto flex items-center gap-1.5">
          <span className={cn(
            "w-2 h-2 rounded-full",
            connected ? "bg-emerald-400" : "bg-red-400"
          )} />
          <span className="text-[10px] text-[#484f58]">
            {connected ? t.collab_connected : t.collab_disconnected}
          </span>
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <div className="text-[10px] font-semibold text-[#484f58] uppercase tracking-wider mb-2">
            {t.collab_online} ({collaborators.length})
          </div>

          <div className="space-y-1.5">
            {collaborators.map(collaborator => (
              <div
                key={collaborator.userId}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#161b22] border border-[#1c2333]"
              >
                <div className="relative flex-shrink-0">
                  {collaborator.avatarUrl ? (
                    <img
                      src={collaborator.avatarUrl}
                      alt={collaborator.displayName}
                      className="w-6 h-6 rounded-full"
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ backgroundColor: collaborator.color }}
                    >
                      {collaborator.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <Circle
                    className="w-2 h-2 absolute -bottom-0.5 -end-0.5 fill-emerald-400 text-emerald-400"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-medium text-[#e1e4e8] truncate">
                    {collaborator.displayName}
                    {collaborator.userId === currentUserId && (
                      <span className="text-[9px] text-[#484f58] ms-1">({t.collab_you})</span>
                    )}
                  </div>
                  {collaborator.activeFile && (
                    <div className="flex items-center gap-1 text-[10px] text-[#484f58] truncate">
                      <FileCode2 className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{collaborator.activeFile.split("/").pop()}</span>
                    </div>
                  )}
                </div>
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: collaborator.color }}
                  title={collaborator.displayName}
                />
              </div>
            ))}

            {otherCollaborators.length === 0 && (
              <div className="text-[11px] text-[#484f58] text-center py-3">
                {t.collab_no_others}
              </div>
            )}
          </div>
        </div>

        {Object.keys(fileLocks).length > 0 && (
          <div className="px-3 py-2 border-t border-[#1c2333]">
            <div className="text-[10px] font-semibold text-[#484f58] uppercase tracking-wider mb-2">
              {t.collab_locked_files}
            </div>
            <div className="space-y-1">
              {Object.entries(fileLocks).map(([filePath, lock]) => (
                <div
                  key={filePath}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-yellow-500/5 border border-yellow-500/20"
                >
                  <Lock className="w-3 h-3 text-yellow-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-[#e1e4e8] truncate font-mono">
                      {filePath.split("/").pop()}
                    </div>
                    <div className="text-[10px] text-[#484f58] truncate">
                      {t.collab_locked_by} {lock.displayName}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {notifications.length > 0 && (
          <div className="border-t border-[#1c2333] px-2 py-1.5 space-y-1 max-h-[120px] overflow-y-auto">
            {notifications.map(notification => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn(
                  "flex items-center gap-1.5 px-2 py-1 rounded text-[10px]",
                  notification.type === "join" && "bg-emerald-500/10 text-emerald-400",
                  notification.type === "leave" && "bg-[#484f58]/10 text-[#b0bac5]",
                  notification.type === "lock" && "bg-yellow-500/10 text-yellow-400",
                  notification.type === "unlock" && "bg-blue-500/10 text-blue-400",
                  notification.type === "lock_rejected" && "bg-red-500/10 text-red-400",
                )}
              >
                {notification.type === "join" && <LogIn className="w-2.5 h-2.5 flex-shrink-0" />}
                {notification.type === "leave" && <LogOut className="w-2.5 h-2.5 flex-shrink-0" />}
                {notification.type === "lock" && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
                {notification.type === "unlock" && <Unlock className="w-2.5 h-2.5 flex-shrink-0" />}
                {notification.type === "lock_rejected" && <AlertTriangle className="w-2.5 h-2.5 flex-shrink-0" />}
                <span className="truncate">
                  {notification.type === "join" && `${notification.message} ${t.collab_joined}`}
                  {notification.type === "leave" && `${notification.message} ${t.collab_left}`}
                  {notification.type === "lock" && `${t.collab_file_locked}: ${notification.message}`}
                  {notification.type === "unlock" && `${t.collab_file_unlocked}: ${notification.message}`}
                  {notification.type === "lock_rejected" && `${t.collab_lock_rejected} ${notification.message}`}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CollaboratorAvatars({
  collaborators,
  currentUserId,
}: {
  collaborators: CollaboratorInfo[];
  currentUserId?: string;
}) {
  const others = collaborators.filter(c => c.userId !== currentUserId);
  if (others.length === 0) return null;

  const shown = others.slice(0, 3);
  const remaining = others.length - shown.length;

  return (
    <div className="flex items-center -space-x-1.5 rtl:space-x-reverse">
      {shown.map(c => (
        <div
          key={c.userId}
          className="w-5 h-5 rounded-full border-2 border-[#0d1117] flex items-center justify-center text-[8px] font-bold text-white"
          style={{ backgroundColor: c.color }}
          title={c.displayName}
        >
          {c.avatarUrl ? (
            <img src={c.avatarUrl} alt={c.displayName} className="w-full h-full rounded-full" />
          ) : (
            c.displayName.charAt(0).toUpperCase()
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div className="w-5 h-5 rounded-full border-2 border-[#0d1117] bg-[#30363d] flex items-center justify-center text-[8px] font-bold text-[#e1e4e8]">
          +{remaining}
        </div>
      )}
    </div>
  );
}

export function FileLockIndicator({
  filePath,
  fileLocks,
  currentUserId,
}: {
  filePath: string;
  fileLocks: Record<string, FileLock>;
  currentUserId?: string;
}) {
  const { t } = useI18n();
  const lock = fileLocks[filePath];
  if (!lock) return null;

  const isOwnLock = lock.userId === currentUserId;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded",
        isOwnLock
          ? "bg-blue-500/10 text-blue-400"
          : "bg-yellow-500/10 text-yellow-400"
      )}
      title={`${t.collab_locked_by} ${lock.displayName}`}
    >
      <Lock className="w-2.5 h-2.5" />
      {isOwnLock ? t.collab_you : lock.displayName}
    </span>
  );
}
