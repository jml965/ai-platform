import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import http from "http";
import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import net from "net";
import {
  createSandbox,
  stopSandbox,
  restartSandbox,
  executeCommand,
  startServer,
  getSandboxStatus,
  getSandboxProjectId,
  getProjectSandbox,
  getProjectSandboxAny,
  getSandboxLastCommand,
  listUserSandboxes,
  subscribeSandboxOutput,
  recoverSandboxForProject,
} from "../lib/sandbox/sandbox-manager";
import { getUserId } from "../middlewares/permissions";
import { verifySessionToken } from "../lib/session";
import { db } from "@workspace/db";
import { projectsTable, teamMembersTable } from "@workspace/db/schema";
import { eq, or, inArray } from "drizzle-orm";

const router: IRouter = Router();

async function getUserProjectIds(userId: string): Promise<string[]> {
  const teamMemberships = await db
    .select({ teamId: teamMembersTable.teamId })
    .from(teamMembersTable)
    .where(eq(teamMembersTable.userId, userId));

  const teamIds = teamMemberships.map((m) => m.teamId);

  const accessCondition = teamIds.length > 0
    ? or(eq(projectsTable.userId, userId), inArray(projectsTable.teamId, teamIds))
    : eq(projectsTable.userId, userId);

  const projects = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(accessCondition!);

  return projects.map((p) => p.id);
}

async function requireSandboxAccess(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  const sandboxId = req.params.sandboxId as string;

  const projectId = getSandboxProjectId(sandboxId);
  if (!projectId) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
    return;
  }

  const projectIds = await getUserProjectIds(userId);
  if (!projectIds.includes(projectId)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    return;
  }

  next();
}

async function requireProjectOwnership(req: Request, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  const projectId = (req.body?.projectId || req.params?.projectId) as string;

  if (!projectId) {
    res.status(400).json({ error: { code: "VALIDATION", message: "projectId is required" } });
    return;
  }

  const projectIds = await getUserProjectIds(userId);
  if (!projectIds.includes(projectId)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    return;
  }

  next();
}

router.post("/sandbox", requireProjectOwnership, async (req, res) => {
  try {
    const { projectId, runtime = "node", memoryLimitMb = 256, timeoutSeconds = 300 } = req.body;

    if (!["node", "python"].includes(runtime)) {
      res.status(400).json({ error: { code: "VALIDATION", message: "runtime must be 'node' or 'python'" } });
      return;
    }

    const result = await createSandbox(projectId, runtime, memoryLimitMb, timeoutSeconds);
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create sandbox";
    const status = message.includes("Maximum") || message.includes("already has") ? 409 : 500;
    res.status(status).json({ error: { code: "SANDBOX_ERROR", message } });
  }
});

router.get("/sandbox", async (req, res) => {
  try {
    const userId = getUserId(req);
    const projectIds = await getUserProjectIds(userId);
    const sandboxes = listUserSandboxes(projectIds);
    res.json({ data: sandboxes, meta: { total: sandboxes.length, maxConcurrent: 10 } });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to list sandboxes" } });
  }
});

router.get("/sandbox/project/:projectId", requireProjectOwnership, async (req, res) => {
  try {
    const sandboxId = getProjectSandbox(req.params.projectId as string);
    if (!sandboxId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No active sandbox for this project" } });
      return;
    }

    const status = getSandboxStatus(sandboxId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get sandbox" } });
  }
});

router.get("/sandbox/:sandboxId", requireSandboxAccess, async (req, res) => {
  try {
    const sandboxId = req.params.sandboxId as string;
    const status = getSandboxStatus(sandboxId);
    if (!status) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
      return;
    }

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get sandbox status" } });
  }
});

router.post("/sandbox/:sandboxId/execute", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const { command } = req.body;
    if (!command || typeof command !== "string") {
      res.status(400).json({ error: { code: "VALIDATION", message: "command is required" } });
      return;
    }

    const result = await executeCommand(id, command);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Command execution failed";
    res.status(500).json({ error: { code: "EXECUTION_ERROR", message } });
  }
});

router.post("/sandbox/:sandboxId/start-server", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const { command } = req.body;
    if (!command || typeof command !== "string") {
      res.status(400).json({ error: { code: "VALIDATION", message: "command is required" } });
      return;
    }

    const result = await startServer(id, command);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start server";
    res.status(500).json({ error: { code: "SERVER_ERROR", message } });
  }
});

router.post("/sandbox/:sandboxId/stop", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    await stopSandbox(id);
    res.json({ success: true, message: "Sandbox stopped" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stop sandbox";
    res.status(500).json({ error: { code: "SANDBOX_ERROR", message } });
  }
});

router.post("/sandbox/:sandboxId/restart", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const { command } = req.body;
    const result = await restartSandbox(id, command);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to restart sandbox";
    res.status(500).json({ error: { code: "SANDBOX_ERROR", message } });
  }
});

router.get("/sandbox/:sandboxId/logs", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const status = getSandboxStatus(id);
    if (!status) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
      return;
    }

    res.json({ sandboxId: id, logs: status.outputTail });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to get logs" } });
  }
});

router.get("/sandbox/:sandboxId/stream", requireSandboxAccess, async (req, res) => {
  try {
    const id = req.params.sandboxId as string;
    const status = getSandboxStatus(id);
    if (!status) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Sandbox not found" } });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    res.write(`data: ${JSON.stringify({ type: "connected", sandboxId: id })}\n\n`);

    for (const line of status.outputTail) {
      res.write(`data: ${JSON.stringify({ type: "output", data: line })}\n\n`);
    }

    const unsubscribe = subscribeSandboxOutput(id, (data) => {
      res.write(`data: ${JSON.stringify({ type: "output", data })}\n\n`);
    });

    const heartbeat = setInterval(() => {
      res.write(`: heartbeat\n\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL", message: "Failed to stream output" } });
  }
});

const SAFE_PROXY_HEADERS = new Set([
  "accept", "accept-encoding", "accept-language", "cache-control",
  "content-type", "content-length", "if-modified-since", "if-none-match",
  "range", "user-agent", "referer", "origin",
]);

router.use("/sandbox/proxy", async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);

    const pathAfterProxy = req.url.startsWith("/") ? req.url.slice(1) : req.url;
    const slashIdx = pathAfterProxy.indexOf("/");
    const projectId = slashIdx === -1 ? pathAfterProxy.split("?")[0] : pathAfterProxy.slice(0, slashIdx);

    if (!projectId) {
      res.status(400).json({ error: { code: "VALIDATION", message: "projectId is required" } });
      return;
    }

    const projectIds = await getUserProjectIds(userId);
    if (!projectIds.includes(projectId)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
      return;
    }

    let sandboxId = getProjectSandbox(projectId);

    if (!sandboxId) {
      const stoppedId = getProjectSandboxAny(projectId);
      if (stoppedId) {
        const lastCmd = getSandboxLastCommand(stoppedId);
        if (lastCmd) {
          try {
            console.log(`[Sandbox Proxy] Auto-restarting stopped sandbox ${stoppedId} for project ${projectId} with command: ${lastCmd}`);
            await restartSandbox(stoppedId, lastCmd);
            await new Promise(resolve => setTimeout(resolve, 3000));
            sandboxId = getProjectSandbox(projectId);
          } catch (err) {
            console.error(`[Sandbox Proxy] Auto-restart failed for ${stoppedId}:`, err);
          }
        }
      }
    }

    if (!sandboxId) {
      console.log(`[Sandbox Proxy] No in-memory sandbox for project ${projectId}, attempting recovery from DB files...`);
      const recoveredId = await recoverSandboxForProject(projectId);
      if (recoveredId) {
        sandboxId = getProjectSandbox(projectId);
      }
    }

    if (!sandboxId) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "No active sandbox" } });
      return;
    }

    const status = getSandboxStatus(sandboxId);
    if (!status || status.status !== "running") {
      res.status(503).json({ error: { code: "NOT_RUNNING", message: "Sandbox not running" } });
      return;
    }

    const targetPath = slashIdx === -1 ? "/" : "/" + pathAfterProxy.slice(slashIdx + 1);
    const cleanPath = targetPath.split("?")[0];
    const queryString = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";

    const safeHeaders: Record<string, string | string[] | undefined> = {
      host: `127.0.0.1:${status.port}`,
    };
    for (const [key, val] of Object.entries(req.headers)) {
      if (SAFE_PROXY_HEADERS.has(key.toLowerCase())) {
        safeHeaders[key] = val;
      }
    }

    const isHtmlRequest = cleanPath === "/" || cleanPath.endsWith(".html");
    const proxyPrefix = `/api/sandbox/proxy/${projectId}`;

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: status.port,
        path: cleanPath + queryString,
        method: req.method,
        headers: safeHeaders,
      },
      (proxyRes) => {
        if (isHtmlRequest && proxyRes.headers["content-type"]?.includes("text/html")) {
          const chunks: Buffer[] = [];
          proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
          proxyRes.on("end", () => {
            let html = Buffer.concat(chunks).toString("utf8");
            html = html.replace(/(src|href)="\/(?!\/)/g, `$1="${proxyPrefix}/`);
            html = html.replace(/from\s+"\/(?!\/)/g, `from "${proxyPrefix}/`);
            const routerFixScript = `<script>
(function(){
  var prefix = "${proxyPrefix}";
  var origPushState = history.pushState;
  var origReplaceState = history.replaceState;
  function fixPath(url) {
    if (typeof url === "string" && url.startsWith("/") && !url.startsWith(prefix)) {
      return prefix + url;
    }
    return url;
  }
  history.pushState = function(state, title, url) {
    return origPushState.call(this, state, title, fixPath(url));
  };
  history.replaceState = function(state, title, url) {
    return origReplaceState.call(this, state, title, fixPath(url));
  };
  window.__SANDBOX_PREFIX__ = prefix;
  if(window.location.pathname.startsWith(prefix)){
    var real = window.location.pathname.slice(prefix.length) || "/";
    origReplaceState.call(history, null, "", real);
  }
})();
</script>`;
            html = html.replace("<!DOCTYPE html>", "<!DOCTYPE html>" + routerFixScript);
            if (!html.includes("<!DOCTYPE html>")) {
              html = html.replace("<html", routerFixScript + "<html");
            }
            const headers = { ...proxyRes.headers };
            delete headers["content-length"];
            delete headers["content-encoding"];
            headers["transfer-encoding"] = "chunked";
            res.writeHead(proxyRes.statusCode || 200, headers);
            res.end(html);
          });
        } else {
          const contentType = proxyRes.headers["content-type"] || "";
          const isJsModule = contentType.includes("javascript") ||
                            contentType.includes("typescript") ||
                            cleanPath.endsWith(".js") || cleanPath.endsWith(".ts") ||
                            cleanPath.endsWith(".tsx") || cleanPath.endsWith(".jsx") ||
                            cleanPath.endsWith(".mjs") ||
                            cleanPath.startsWith("/@") || cleanPath.startsWith("/node_modules/");

          if (isJsModule) {
            const chunks: Buffer[] = [];
            proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
            proxyRes.on("end", () => {
              let js = Buffer.concat(chunks).toString("utf8");
              js = js.replace(/from\s+"\/(?!\/)/g, `from "${proxyPrefix}/`);
              js = js.replace(/import\s*\(\s*"\/(?!\/)/g, `import("${proxyPrefix}/`);
              js = js.replace(/import\s+"\/(?!\/)/g, `import "${proxyPrefix}/`);
              const headers = { ...proxyRes.headers };
              delete headers["content-length"];
              delete headers["content-encoding"];
              res.writeHead(proxyRes.statusCode || 200, headers);
              res.end(js);
            });
          } else {
            res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
            proxyRes.pipe(res, { end: true });
          }
        }
      }
    );

    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.status(502).json({ error: { code: "PROXY_ERROR", message: "Cannot reach sandbox server" } });
      }
    });

    req.pipe(proxyReq, { end: true });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: { code: "INTERNAL", message: "Proxy error" } });
    }
  }
});

function parseWsCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
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

export async function handleSandboxWebSocketUpgrade(req: IncomingMessage & { _sandboxHandled?: boolean }, socket: Duplex, head: Buffer) {
  const url = req.url || "";
  const proxyMatch = url.match(/^\/api\/sandbox\/proxy\/([a-f0-9-]+)\/(.*)?/);
  if (!proxyMatch) return false;
  req._sandboxHandled = true;

  const cookies = parseWsCookies(req.headers.cookie);
  const sessionToken = cookies["session_token"];
  const userId = sessionToken ? verifySessionToken(sessionToken) : null;
  if (!userId) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return true;
  }

  const projectId = proxyMatch[1];

  const projectIds = await getUserProjectIds(userId);
  if (!projectIds.includes(projectId)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return true;
  }

  const sandboxId = getProjectSandbox(projectId);
  if (!sandboxId) {
    socket.destroy();
    return true;
  }

  const status = getSandboxStatus(sandboxId);
  if (!status || status.status !== "running") {
    socket.destroy();
    return true;
  }

  const WS_SAFE_HEADERS = new Set([
    "upgrade", "connection", "sec-websocket-key", "sec-websocket-version",
    "sec-websocket-extensions", "sec-websocket-protocol",
    "origin", "user-agent",
  ]);

  const targetPath = proxyMatch[2] ? "/" + proxyMatch[2] : "/";
  const proxySocket = net.connect(status.port, "127.0.0.1", () => {
    const reqLine = `GET ${targetPath} HTTP/1.1\r\n`;
    const headers: string[] = [`Host: 127.0.0.1:${status.port}`];
    for (const [key, val] of Object.entries(req.headers)) {
      if (key.toLowerCase() === "host") continue;
      if (!WS_SAFE_HEADERS.has(key.toLowerCase())) continue;
      if (val) {
        headers.push(`${key}: ${Array.isArray(val) ? val.join(", ") : val}`);
      }
    }
    proxySocket.write(reqLine + headers.join("\r\n") + "\r\n\r\n");
    if (head.length > 0) proxySocket.write(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });

  proxySocket.on("error", () => socket.destroy());
  socket.on("error", () => proxySocket.destroy());

  return true;
}

export default router;
