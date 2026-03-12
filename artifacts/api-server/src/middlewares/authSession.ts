import * as oidc from "openid-client";
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { getSessionUserId } from "../lib/session";
import {
  getOidcConfig,
  getSessionId as getReplitSessionId,
  getSession,
  clearSession,
  type SessionData,
} from "../lib/replitAuth";

function getAuthProvider(): "replit" | "local" {
  const provider = process.env.AUTH_PROVIDER?.toLowerCase();
  if (provider === "local") return "local";
  return "replit";
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expiresAt || now <= session.expiresAt) return session;

  if (!session.refreshToken) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refreshToken);
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token ?? session.refreshToken;
    session.expiresAt = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expiresAt;
    const { db: dbImport } = await import("@workspace/db");
    const { sessionsTable } = await import("@workspace/db/schema");
    await dbImport
      .update(sessionsTable)
      .set({
        sess: session as unknown as Record<string, unknown>,
        expire: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      })
      .where(eq(sessionsTable.sid, sid));
    return session;
  } catch {
    return null;
  }
}

export async function authSession(req: Request, res: Response, next: NextFunction) {
  const provider = getAuthProvider();

  if (provider === "local") {
    const userId = getSessionUserId(req);
    if (userId) {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      if (user) {
        req.user = user;
      }
    }
  } else {
    const sid = getReplitSessionId(req);
    if (sid) {
      const session = await getSession(sid);
      if (session?.userId) {
        const refreshed = await refreshIfExpired(sid, session);
        if (!refreshed) {
          await clearSession(res, sid);
        } else {
          const [user] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, refreshed.userId))
            .limit(1);
          if (user) {
            req.user = user;
          }
        }
      } else if (sid) {
        await clearSession(res, sid);
      }
    }
  }

  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}
