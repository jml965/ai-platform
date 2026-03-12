import { createHmac, randomBytes } from "crypto";
import type { Request, Response } from "express";

const SESSION_COOKIE = "session_token";
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret && process.env.AUTH_PROVIDER?.toLowerCase() === "local") {
    throw new Error(
      "SESSION_SECRET environment variable is required when AUTH_PROVIDER=local. " +
      "Set a random string of at least 32 characters."
    );
  }
  return secret || "dev-fallback-replit-mode-only";
}

export function createSessionToken(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const sig = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, timestamp, sig] = parts;
  const payload = `${userId}.${timestamp}`;
  const expected = createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
  if (sig !== expected) return null;
  const ts = parseInt(timestamp!, 10);
  if (isNaN(ts) || Date.now() - ts > SESSION_MAX_AGE * 1000) return null;
  return userId!;
}

export function setSessionCookie(res: Response, userId: string): void {
  const token = createSessionToken(userId);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionUserId(req: Request): string | null {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token || typeof token !== "string") return null;
  return verifySessionToken(token);
}
