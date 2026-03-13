import { useState, useEffect, useRef, useCallback } from "react";

export interface CollaboratorInfo {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  activeFile: string | null;
  cursorPosition: { line: number; column: number } | null;
  color: string;
  joinedAt: number;
}

export interface FileLock {
  userId: string;
  displayName: string;
  lockedAt: number;
}

export interface CollaborationNotification {
  id: string;
  type: "join" | "leave" | "lock" | "unlock" | "lock_rejected";
  message: string;
  timestamp: number;
}

interface UseCollaborationOptions {
  projectId: string | undefined;
  onFileChanged?: (data: { userId: string; displayName: string; filePath: string; content: string }) => void;
}

export function useCollaboration({ projectId, onFileChanged }: UseCollaborationOptions) {
  const [collaborators, setCollaborators] = useState<CollaboratorInfo[]>([]);
  const [fileLocks, setFileLocks] = useState<Record<string, FileLock>>({});
  const [notifications, setNotifications] = useState<CollaborationNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalCloseRef = useRef(false);

  const addNotification = useCallback((type: CollaborationNotification["type"], message: string) => {
    const notification: CollaborationNotification = {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: Date.now(),
    };
    setNotifications(prev => [...prev.slice(-9), notification]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== notification.id));
    }, 5000);
  }, []);

  const connect = useCallback(() => {
    if (!projectId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/collaborate`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "join", projectId }));

      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case "collaborators":
            setCollaborators(msg.data);
            break;

          case "user_joined":
            setCollaborators(prev => {
              if (prev.some(c => c.userId === msg.data.userId)) return prev;
              return [...prev, msg.data];
            });
            addNotification("join", msg.data.displayName);
            break;

          case "user_left":
            setCollaborators(prev => prev.filter(c => c.userId !== msg.data.userId));
            addNotification("leave", msg.data.displayName);
            break;

          case "cursor_update":
            setCollaborators(prev =>
              prev.map(c =>
                c.userId === msg.data.userId
                  ? { ...c, activeFile: msg.data.filePath, cursorPosition: { line: msg.data.line, column: msg.data.column } }
                  : c
              )
            );
            break;

          case "file_changed":
            onFileChanged?.(msg.data);
            break;

          case "file_locked":
            setFileLocks(prev => ({
              ...prev,
              [msg.data.filePath]: {
                userId: msg.data.userId,
                displayName: msg.data.displayName,
                lockedAt: Date.now(),
              },
            }));
            addNotification("lock", `${msg.data.displayName}: ${msg.data.filePath.split("/").pop()}`);
            break;

          case "file_unlocked":
            setFileLocks(prev => {
              const next = { ...prev };
              delete next[msg.data.filePath];
              return next;
            });
            break;

          case "locks_state":
            setFileLocks(msg.data);
            break;

          case "lock_rejected":
            addNotification("lock_rejected", msg.data.lockedBy);
            break;

          case "pong":
            break;
        }
      } catch {}
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (!intentionalCloseRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => connect(), 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [projectId, addNotification, onFileChanged]);

  useEffect(() => {
    intentionalCloseRef.current = false;
    connect();
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendCursorMove = useCallback((filePath: string, line: number, column: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cursor_move", filePath, line, column }));
    }
  }, []);

  const sendFileOpen = useCallback((filePath: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "file_open", filePath }));
    }
  }, []);

  const sendFileEdit = useCallback((filePath: string, content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "file_edit", filePath, content }));
    }
  }, []);

  const lockFile = useCallback((filePath: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "lock_file", filePath }));
    }
  }, []);

  const unlockFile = useCallback((filePath: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unlock_file", filePath }));
    }
  }, []);

  return {
    collaborators,
    fileLocks,
    notifications,
    connected,
    sendCursorMove,
    sendFileOpen,
    sendFileEdit,
    lockFile,
    unlockFile,
  };
}
