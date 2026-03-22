import * as oidc from "openid-client";
import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "../lib/password";
import { setSessionCookie, clearSessionCookie } from "../lib/session";
import { requireAuth } from "../middlewares/authSession";
import {
  getOidcConfig,
  createSession,
  clearSession as clearReplitSession,
  getSessionId as getReplitSessionId,
  SESSION_COOKIE,
  SESSION_TTL,
} from "../lib/replitAuth";

const OIDC_COOKIE_TTL = 10 * 60 * 1000;
const router: IRouter = Router();

function getAuthProvider(): "replit" | "local" {
  const provider = process.env.AUTH_PROVIDER?.toLowerCase();
  if (provider === "local") return "local";
  if (provider === "replit") return "replit";
  if (!process.env.REPL_ID && !process.env.REPLIT_DEV_DOMAIN) return "local";
  return "replit";
}

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setReplitSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertReplitUser(claims: Record<string, unknown>) {
  const replitId = claims.sub as string;
  const email = (claims.email as string) || `${replitId}@replit.user`;
  const displayName =
    (claims.name as string) ||
    (claims.first_name as string) ||
    email.split("@")[0];
  const avatarUrl = (claims.profile_image_url || claims.picture) as string | null;

  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.replitId, replitId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(usersTable)
      .set({ email, displayName, avatarUrl, updatedAt: new Date() })
      .where(eq(usersTable.id, existing.id))
      .returning();
    return updated;
  }

  const [userCount] = await db.select({ cnt: sql<number>`count(*)::int` }).from(usersTable);
  const isFirstUser = (userCount?.cnt ?? 0) === 0;

  const [user] = await db
    .insert(usersTable)
    .values({ replitId, email, displayName, avatarUrl, role: isFirstUser ? "admin" : "user" })
    .returning();
  return user;
}

router.get("/auth/provider", (_req, res) => {
  return res.json({ provider: getAuthProvider() });
});

router.get("/auth/me", async (req, res) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.json({
      id: user.id,
      replitId: user.replitId,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      locale: user.locale,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/auth/me", requireAuth, async (req, res) => {
  try {
    const user = req.user!;
    const { displayName, locale } = req.body;

    const updates: Partial<{ displayName: string; locale: string; updatedAt: Date }> = { updatedAt: new Date() };
    if (displayName !== undefined) updates.displayName = displayName;
    if (locale !== undefined) updates.locale = locale;

    const [updated] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, user.id))
      .returning();

    return res.json({
      id: updated.id,
      replitId: updated.replitId,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      locale: updated.locale,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/register", async (req, res) => {
  if (getAuthProvider() !== "local") {
    return res.status(404).json({ error: "Registration not available" });
  }

  try {
    const { email, password, displayName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const [existing] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashed = await hashPassword(password);

    const [userCount] = await db.select({ cnt: sql<number>`count(*)::int` }).from(usersTable);
    const isFirstUser = (userCount?.cnt ?? 0) === 0;

    const [user] = await db
      .insert(usersTable)
      .values({
        email,
        passwordHash: hashed,
        displayName: displayName || email.split("@")[0],
        role: isFirstUser ? "admin" : "user",
      })
      .returning();

    setSessionCookie(res, user.id);

    return res.status(201).json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/login", async (req, res) => {
  if (getAuthProvider() !== "local") {
    return res.status(404).json({ error: "Local login not available" });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.passwordHash) {
      const hashed = await hashPassword(password);
      await db.update(usersTable).set({ passwordHash: hashed }).where(eq(usersTable.id, user.id));
    } else {
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
    }

    setSessionCookie(res, user.id);

    return res.json({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      locale: user.locale,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/auth/login", async (req: Request, res: Response) => {
  if (getAuthProvider() !== "replit") {
    return res.redirect("/");
  }

  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/auth/callback`;

    const returnTo = getSafeReturnTo(req.query.returnTo);

    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const codeVerifier = oidc.randomPKCECodeVerifier();
    const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

    const redirectTo = oidc.buildAuthorizationUrl(config, {
      redirect_uri: callbackUrl,
      scope: "openid email profile offline_access",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "login consent",
      state,
      nonce,
    });

    setOidcCookie(res, "code_verifier", codeVerifier);
    setOidcCookie(res, "nonce", nonce);
    setOidcCookie(res, "state", state);
    setOidcCookie(res, "return_to", returnTo);

    res.redirect(redirectTo.href);
  } catch (error) {
    console.error("OIDC login error:", error);
    return res.status(500).json({ error: "Failed to initiate login" });
  }
});

router.get("/auth/callback", async (req: Request, res: Response) => {
  if (getAuthProvider() !== "replit") {
    return res.redirect("/");
  }

  try {
    const config = await getOidcConfig();
    const callbackUrl = `${getOrigin(req)}/api/auth/callback`;

    const codeVerifier = req.cookies?.code_verifier;
    const nonce = req.cookies?.nonce;
    const expectedState = req.cookies?.state;

    if (!codeVerifier || !expectedState) {
      return res.redirect("/api/auth/login");
    }

    const currentUrl = new URL(
      `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
    );

    let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
    try {
      tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: codeVerifier,
        expectedNonce: nonce,
        expectedState,
        idTokenExpected: true,
      });
    } catch {
      return res.redirect("/api/auth/login");
    }

    const returnTo = getSafeReturnTo(req.cookies?.return_to);

    res.clearCookie("code_verifier", { path: "/" });
    res.clearCookie("nonce", { path: "/" });
    res.clearCookie("state", { path: "/" });
    res.clearCookie("return_to", { path: "/" });

    const claims = tokens.claims();
    if (!claims) {
      return res.redirect("/api/auth/login");
    }

    const dbUser = await upsertReplitUser(
      claims as unknown as Record<string, unknown>,
    );

    const now = Math.floor(Date.now() / 1000);
    const sid = await createSession({
      userId: dbUser.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
    });

    setReplitSessionCookie(res, sid);
    res.redirect(returnTo);
  } catch (error) {
    console.error("OIDC callback error:", error);
    return res.status(500).json({ error: "Authentication callback failed" });
  }
});

router.post("/auth/logout", async (req: Request, res: Response) => {
  const provider = getAuthProvider();

  if (provider === "local") {
    clearSessionCookie(res);
    return res.json({ success: true, message: "Logged out successfully" });
  }

  const sid = getReplitSessionId(req);
  await clearReplitSession(res, sid);
  return res.json({ success: true, message: "Logged out successfully" });
});

router.get("/auth/logout", async (req: Request, res: Response) => {
  const provider = getAuthProvider();

  if (provider === "local") {
    clearSessionCookie(res);
    return res.redirect("/");
  }

  try {
    const config = await getOidcConfig();
    const origin = getOrigin(req);

    const sid = getReplitSessionId(req);
    await clearReplitSession(res, sid);

    const endSessionUrl = oidc.buildEndSessionUrl(config, {
      client_id: process.env.REPL_ID!,
      post_logout_redirect_uri: origin,
    });

    res.redirect(endSessionUrl.href);
  } catch {
    clearSessionCookie(res);
    return res.redirect("/");
  }
});

export default router;
