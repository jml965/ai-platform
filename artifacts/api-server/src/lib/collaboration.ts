import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import type { IncomingMessage } from "http";
import { db } from "@workspace/db";
import { usersTable, projectsTable, teamMembersTable } from "@workspace/db/schema";
import { eq, or, and } from "drizzle-orm";
import { verifySessionToken } from "./session";

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    let val = pair.slice(idx + 1).trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    try { val = decodeURIComponent(val); } catch {}
    cookies[key] = val;
  }
  return cookies;
}

interface CollaboratorInfo {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  activeFile: string | null;
  cursorPosition: { line: number; column: number } | null;
  color: string;
  joinedAt: number;
}

interface FileLock {
  userId: string;
  displayName: string;
  lockedAt: number;
}

interface ProjectRoom {
  collaborators: Map<WebSocket, CollaboratorInfo>;
  fileLocks: Map<string, FileLock>;
}

type IncomingMessage_WS =
  | { type: "join"; projectId: string }
  | { type: "cursor_move"; filePath: string; line: number; column: number }
  | { type: "file_open"; filePath: string }
  | { type: "file_edit"; filePath: string; content: string }
  | { type: "lock_file"; filePath: string }
  | { type: "unlock_file"; filePath: string }
  | { type: "ping" };

type OutgoingMessage =
  | { type: "collaborators"; data: CollaboratorInfo[] }
  | { type: "user_joined"; data: CollaboratorInfo }
  | { type: "user_left"; data: { userId: string; displayName: string } }
  | { type: "cursor_update"; data: { userId: string; filePath: string; line: number; column: number } }
  | { type: "file_changed"; data: { userId: string; displayName: string; filePath: string; content: string } }
  | { type: "file_locked"; data: { filePath: string; userId: string; displayName: string } }
  | { type: "file_unlocked"; data: { filePath: string; userId: string } }
  | { type: "lock_rejected"; data: { filePath: string; lockedBy: string } }
  | { type: "locks_state"; data: Record<string, FileLock> }
  | { type: "error"; data: { message: string } }
  | { type: "pong" };

const COLORS = [
  "#58a6ff", "#f78166", "#d2a8ff", "#7ee787",
  "#ffa657", "#ff7b72", "#79c0ff", "#a5d6ff",
  "#f2cc60", "#56d364", "#bc8cff", "#ff9bce",
];

const rooms = new Map<string, ProjectRoom>();

function getRoom(projectId: string): ProjectRoom {
  if (!rooms.has(projectId)) {
    rooms.set(projectId, {
      collaborators: new Map(),
      fileLocks: new Map(),
    });
  }
  return rooms.get(projectId)!;
}

function assignColor(room: ProjectRoom): string {
  const usedColors = new Set(
    Array.from(room.collaborators.values()).map((c) => c.color)
  );
  for (const color of COLORS) {
    if (!usedColors.has(color)) return color;
  }
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

function broadcast(room: ProjectRoom, msg: OutgoingMessage, excludeWs?: WebSocket) {
  const data = JSON.stringify(msg);
  for (const [ws] of room.collaborators) {
    if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

function send(ws: WebSocket, msg: OutgoingMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function cleanupLocksForUser(room: ProjectRoom, userId: string) {
  const unlocked: string[] = [];
  for (const [filePath, lock] of room.fileLocks) {
    if (lock.userId === userId) {
      room.fileLocks.delete(filePath);
      unlocked.push(filePath);
    }
  }
  for (const filePath of unlocked) {
    broadcast(room, { type: "file_unlocked", data: { filePath, userId } });
  }
}

async function authenticateFromCookies(
  req: IncomingMessage
): Promise<{ userId: string; displayName: string; avatarUrl: string | null } | null> {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = parseCookies(cookieHeader);

  const sessionToken = cookies["session_token"];
  if (sessionToken) {
    const userId = verifySessionToken(sessionToken);
    if (userId) {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (user) {
        return {
          userId: user.id,
          displayName: user.displayName || user.email || "User",
          avatarUrl: user.avatarUrl || null,
        };
      }
    }
  }

  const sid = cookies["sid"];
  if (sid) {
    try {
      const { getSession } = await import("./replitAuth");
      const session = await getSession(sid);
      if (session?.userId) {
        const [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, session.userId))
          .limit(1);
        if (user) {
          return {
            userId: user.id,
            displayName: user.displayName || user.email || "User",
            avatarUrl: user.avatarUrl || null,
          };
        }
      }
    } catch {}
  }

  return null;
}

async function checkProjectAccess(userId: string, projectId: string): Promise<boolean> {
  const [project] = await db
    .select({ id: projectsTable.id, userId: projectsTable.userId, teamId: projectsTable.teamId })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId))
    .limit(1);

  if (!project) return false;
  if (project.userId === userId) return true;

  if (project.teamId) {
    const [member] = await db
      .select({ id: teamMembersTable.id })
      .from(teamMembersTable)
      .where(
        and(
          eq(teamMembersTable.teamId, project.teamId),
          eq(teamMembersTable.userId, userId)
        )
      )
      .limit(1);
    if (member) return true;
  }

  return false;
}

export function setupCollaborationWebSocket(server: HTTPServer) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req: IncomingMessage & { _sandboxHandled?: boolean }, socket, head) => {
    if (req._sandboxHandled) return;
    if (req.url !== "/ws/collaborate") {
      socket.destroy();
      return;
    }

    const userInfo = await authenticateFromCookies(req);
    if (!userInfo) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      (ws as any).__userInfo = userInfo;
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    const userInfo = (ws as any).__userInfo as {
      userId: string;
      displayName: string;
      avatarUrl: string | null;
    };

    let currentProjectId: string | null = null;

    ws.on("message", async (raw) => {
      let msg: IncomingMessage_WS;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: "error", data: { message: "Invalid JSON" } });
        return;
      }

      if (msg.type === "ping") {
        send(ws, { type: "pong" });
        return;
      }

      if (msg.type === "join") {
        const hasAccess = await checkProjectAccess(userInfo.userId, msg.projectId);
        if (!hasAccess) {
          send(ws, { type: "error", data: { message: "Access denied to this project" } });
          return;
        }

        if (currentProjectId) {
          const oldRoom = rooms.get(currentProjectId);
          if (oldRoom) {
            const info = oldRoom.collaborators.get(ws);
            oldRoom.collaborators.delete(ws);
            cleanupLocksForUser(oldRoom, userInfo.userId);
            if (info) {
              broadcast(oldRoom, {
                type: "user_left",
                data: { userId: userInfo.userId, displayName: userInfo.displayName },
              });
            }
            if (oldRoom.collaborators.size === 0) {
              rooms.delete(currentProjectId);
            }
          }
        }

        currentProjectId = msg.projectId;
        const room = getRoom(msg.projectId);

        const collaboratorInfo: CollaboratorInfo = {
          userId: userInfo.userId,
          displayName: userInfo.displayName,
          avatarUrl: userInfo.avatarUrl,
          activeFile: null,
          cursorPosition: null,
          color: assignColor(room),
          joinedAt: Date.now(),
        };
        room.collaborators.set(ws, collaboratorInfo);

        broadcast(room, { type: "user_joined", data: collaboratorInfo }, ws);

        send(ws, {
          type: "collaborators",
          data: Array.from(room.collaborators.values()),
        });

        const locksObj: Record<string, FileLock> = {};
        for (const [fp, lock] of room.fileLocks) {
          locksObj[fp] = lock;
        }
        send(ws, { type: "locks_state", data: locksObj });

        return;
      }

      if (!currentProjectId) {
        send(ws, { type: "error", data: { message: "Must join a project first" } });
        return;
      }

      const room = rooms.get(currentProjectId);
      if (!room) return;

      switch (msg.type) {
        case "cursor_move": {
          const info = room.collaborators.get(ws);
          if (info) {
            info.activeFile = msg.filePath;
            info.cursorPosition = { line: msg.line, column: msg.column };
          }
          broadcast(room, {
            type: "cursor_update",
            data: {
              userId: userInfo.userId,
              filePath: msg.filePath,
              line: msg.line,
              column: msg.column,
            },
          }, ws);
          break;
        }

        case "file_open": {
          const info = room.collaborators.get(ws);
          if (info) {
            info.activeFile = msg.filePath;
            info.cursorPosition = null;
          }
          broadcast(room, {
            type: "cursor_update",
            data: {
              userId: userInfo.userId,
              filePath: msg.filePath,
              line: 0,
              column: 0,
            },
          }, ws);
          break;
        }

        case "file_edit": {
          const lock = room.fileLocks.get(msg.filePath);
          if (lock && lock.userId !== userInfo.userId) {
            send(ws, {
              type: "lock_rejected",
              data: { filePath: msg.filePath, lockedBy: lock.displayName },
            });
            return;
          }
          broadcast(room, {
            type: "file_changed",
            data: {
              userId: userInfo.userId,
              displayName: userInfo.displayName,
              filePath: msg.filePath,
              content: msg.content,
            },
          }, ws);
          break;
        }

        case "lock_file": {
          const existing = room.fileLocks.get(msg.filePath);
          if (existing && existing.userId !== userInfo.userId) {
            send(ws, {
              type: "lock_rejected",
              data: { filePath: msg.filePath, lockedBy: existing.displayName },
            });
            return;
          }
          const lockInfo: FileLock = {
            userId: userInfo.userId,
            displayName: userInfo.displayName,
            lockedAt: Date.now(),
          };
          room.fileLocks.set(msg.filePath, lockInfo);
          broadcast(room, {
            type: "file_locked",
            data: {
              filePath: msg.filePath,
              userId: userInfo.userId,
              displayName: userInfo.displayName,
            },
          });
          break;
        }

        case "unlock_file": {
          const lock = room.fileLocks.get(msg.filePath);
          if (lock && lock.userId === userInfo.userId) {
            room.fileLocks.delete(msg.filePath);
            broadcast(room, {
              type: "file_unlocked",
              data: { filePath: msg.filePath, userId: userInfo.userId },
            });
          }
          break;
        }
      }
    });

    ws.on("close", () => {
      if (currentProjectId) {
        const room = rooms.get(currentProjectId);
        if (room) {
          room.collaborators.delete(ws);
          cleanupLocksForUser(room, userInfo.userId);
          broadcast(room, {
            type: "user_left",
            data: { userId: userInfo.userId, displayName: userInfo.displayName },
          });
          if (room.collaborators.size === 0) {
            rooms.delete(currentProjectId);
          }
        }
      }
    });

    ws.on("error", () => {
      ws.close();
    });
  });

  const LOCK_TIMEOUT = 15 * 60 * 1000;
  setInterval(() => {
    const now = Date.now();
    for (const [, room] of rooms) {
      for (const [filePath, lock] of room.fileLocks) {
        if (now - lock.lockedAt > LOCK_TIMEOUT) {
          room.fileLocks.delete(filePath);
          broadcast(room, {
            type: "file_unlocked",
            data: { filePath, userId: lock.userId },
          });
        }
      }
    }
  }, 60_000);

  console.log("[Collaboration] WebSocket server ready on /ws/collaborate");
  return wss;
}
