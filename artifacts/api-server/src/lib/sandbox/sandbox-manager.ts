import { spawn, execSync, type ChildProcess } from "child_process";
import { mkdirSync, rmSync, existsSync, writeFileSync, chmodSync, readFileSync } from "fs";
import { join, resolve, normalize } from "path";
import { tmpdir } from "os";
import http from "http";
import { db } from "@workspace/db";
import { sandboxInstancesTable, projectFilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const MAX_CONCURRENT_SANDBOXES = 10;
const CLEANUP_INTERVAL_MS = 60_000;
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const BASE_PORT = 9000;
const PORT_RANGE = 100;
const SANDBOX_BASE_DIR = join(tmpdir(), "sandboxes");
const MAX_SANDBOX_LIFETIME_MS = 30 * 60 * 1000;
const MAX_OUTPUT_BUFFER = 2000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const BLOCKED_COMMANDS = [
  /rm\s+-rf\s+\/(?!\s)/,
  /mkfs\./,
  /dd\s+if=/,
  /:(){ :\|:& };:/,
  />\s*\/dev\/sd/,
  /shutdown/,
  /reboot/,
  /init\s+0/,
  /halt/,
];

const SAFE_ENV_KEYS = new Set([
  "PATH",
  "LANG",
  "LC_ALL",
  "TERM",
  "SHELL",
  "NODE_ENV",
  "NIX_PROFILES",
  "NIX_SSL_CERT_FILE",
  "SSL_CERT_FILE",
  "LOCALE_ARCHIVE",
]);

interface SandboxProcess {
  id: string;
  projectId: string;
  userId: string;
  process: ChildProcess | null;
  workDir: string;
  port: number;
  runtime: "node" | "python";
  memoryLimitMb: number;
  timeoutSeconds: number;
  status: "created" | "running" | "stopped" | "error";
  createdAt: Date;
  lastActivity: Date;
  outputBuffer: string[];
  listeners: Set<(data: string) => void>;
  lastCommand?: string;
  serverPid?: number;
}

const activeSandboxes = new Map<string, SandboxProcess>();
const usedPorts = new Set<number>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

mkdirSync(SANDBOX_BASE_DIR, { recursive: true });

function allocatePort(): number | null {
  for (let i = 0; i < PORT_RANGE; i++) {
    const port = BASE_PORT + i;
    if (!usedPorts.has(port)) {
      usedPorts.add(port);
      return port;
    }
  }
  return null;
}

function releasePort(port: number) {
  usedPorts.delete(port);
}

function createWorkDir(sandboxId: string): string {
  const dir = join(SANDBOX_BASE_DIR, sandboxId);
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, ".tmp"), { recursive: true });
  return dir;
}

function cleanWorkDir(dir: string) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (e: unknown) {
    console.error(`[Sandbox] Failed to clean work dir ${dir}:`, e);
  }
}

function isCommandSafe(command: string): boolean {
  for (const pattern of BLOCKED_COMMANDS) {
    if (pattern.test(command)) {
      return false;
    }
  }
  return true;
}

function buildSafeEnv(sandbox: SandboxProcess): Record<string, string> {
  const env: Record<string, string> = {};

  for (const key of SAFE_ENV_KEYS) {
    if (process.env[key]) {
      env[key] = process.env[key]!;
    }
  }

  env.PORT = String(sandbox.port);
  env.SANDBOX_ID = sandbox.id;
  env.HOME = process.env.HOME || "/home/runner";
  env.TMPDIR = join(sandbox.workDir, ".tmp");
  env.SANDBOX_PROJECT_ID = sandbox.projectId;
  env.NODE_ENV = "development";

  const nodeModulesBin = join(sandbox.workDir, "node_modules", ".bin");
  env.PATH = `${nodeModulesBin}:${env.PATH || "/usr/bin:/bin"}`;

  env.npm_config_cache = join(sandbox.workDir, ".tmp", ".npm");
  env.npm_config_prefix = sandbox.workDir;

  if (sandbox.runtime === "node") {
    env.NODE_OPTIONS = `--max-old-space-size=${sandbox.memoryLimitMb}`;
  }

  if (sandbox.runtime === "python") {
    const venvBin = join(sandbox.workDir, ".venv", "bin");
    if (existsSync(venvBin)) {
      env.VIRTUAL_ENV = join(sandbox.workDir, ".venv");
      env.PATH = `${venvBin}:${env.PATH || ""}`;
    }
  }

  return env;
}

function isPathSafe(filePath: string, workDir: string): boolean {
  if (filePath.includes("\0")) return false;
  if (filePath.includes("..")) return false;

  const normalizedPath = normalize(filePath);
  if (normalizedPath.startsWith("/") || normalizedPath.startsWith("..")) return false;

  const resolvedPath = resolve(workDir, normalizedPath);
  const resolvedWorkDir = resolve(workDir);
  return resolvedPath.startsWith(resolvedWorkDir + "/") || resolvedPath === resolvedWorkDir;
}

function isSandboxAlive(sandbox: SandboxProcess): boolean {
  if (!sandbox.process || !sandbox.process.pid) return false;
  try {
    process.kill(sandbox.process.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function getSandboxProjectId(sandboxId: string): string | null {
  const sandbox = activeSandboxes.get(sandboxId);
  return sandbox?.projectId ?? null;
}

export async function createSandbox(
  projectId: string,
  runtime: "node" | "python" = "node",
  memoryLimitMb: number = 256,
  timeoutSeconds: number = 600,
  userId: string = "system"
): Promise<{ id: string; port: number; status: string }> {
  if (activeSandboxes.size >= MAX_CONCURRENT_SANDBOXES) {
    const oldestInactive = findOldestInactiveSandbox();
    if (oldestInactive) {
      console.log(`[Sandbox] Evicting inactive sandbox ${oldestInactive} to make room`);
      try { await stopSandbox(oldestInactive); } catch {}
    } else {
      throw new Error(`Maximum concurrent sandboxes reached (${MAX_CONCURRENT_SANDBOXES}). Try again later.`);
    }
  }

  const clampedMemory = Math.min(Math.max(memoryLimitMb, 64), 1024);
  const clampedTimeout = Math.min(Math.max(timeoutSeconds, 30), 1800);

  const existingSandbox = Array.from(activeSandboxes.values()).find(
    (s) => s.projectId === projectId
  );
  if (existingSandbox) {
    console.log(`[Sandbox] Stopping existing sandbox ${existingSandbox.id} for project ${projectId}`);
    try {
      await stopSandbox(existingSandbox.id);
    } catch (e) {
      console.warn(`[Sandbox] Failed to stop existing sandbox: ${e}`);
      activeSandboxes.delete(existingSandbox.id);
      releasePort(existingSandbox.port);
    }
  }

  const port = allocatePort();
  if (!port) {
    throw new Error("No available ports for sandbox. Try again later.");
  }

  const instance = {
    id: uuidv4(),
    projectId,
    port,
    runtime,
    memoryLimitMb: clampedMemory,
    timeoutSeconds: clampedTimeout,
  };

  const workDir = createWorkDir(instance.id);
  await syncProjectFiles(projectId, workDir);

  try {
    await db.insert(sandboxInstancesTable).values({
      id: instance.id,
      projectId,
      port,
      status: "created",
      lastActivityAt: new Date(),
    });
  } catch {}

  const sandbox: SandboxProcess = {
    id: instance.id,
    projectId,
    userId,
    process: null,
    workDir,
    port,
    runtime: instance.runtime,
    memoryLimitMb: clampedMemory,
    timeoutSeconds: clampedTimeout,
    status: "created",
    createdAt: new Date(),
    lastActivity: new Date(),
    outputBuffer: [],
    listeners: new Set(),
  };

  activeSandboxes.set(instance.id, sandbox);
  startCleanupIfNeeded();

  console.log(`[Sandbox] Created sandbox ${instance.id} for project ${projectId} on port ${port} (mem: ${clampedMemory}MB, timeout: ${clampedTimeout}s)`);
  return { id: instance.id, port, status: "created" };
}

async function syncProjectFiles(projectId: string, workDir: string) {
  const files = await db
    .select({ filePath: projectFilesTable.filePath, content: projectFilesTable.content })
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId));

  let synced = 0;
  for (const file of files) {
    if (!isPathSafe(file.filePath, workDir)) {
      console.warn(`[Sandbox] Skipping unsafe file path: ${file.filePath}`);
      continue;
    }

    const contentSize = Buffer.byteLength(file.content, 'utf-8');
    if (contentSize > MAX_FILE_SIZE_BYTES) {
      console.warn(`[Sandbox] Skipping oversized file: ${file.filePath} (${contentSize} bytes)`);
      continue;
    }

    const normalizedPath = normalize(file.filePath);
    const fullPath = join(workDir, normalizedPath);
    const dir = join(fullPath, "..");
    mkdirSync(dir, { recursive: true });
    const dataUriMatch = file.content.match(/^data:[^;]+;base64,(.+)$/s);
    if (dataUriMatch) {
      writeFileSync(fullPath, Buffer.from(dataUriMatch[1], "base64"));
    } else {
      writeFileSync(fullPath, file.content, "utf-8");
    }
    synced++;
  }
  console.log(`[Sandbox] Synced ${synced}/${files.length} files for project ${projectId}`);
}

function appendOutput(sandbox: SandboxProcess, text: string) {
  sandbox.lastActivity = new Date();
  sandbox.outputBuffer.push(text);
  if (sandbox.outputBuffer.length > MAX_OUTPUT_BUFFER) {
    sandbox.outputBuffer.splice(0, sandbox.outputBuffer.length - (MAX_OUTPUT_BUFFER / 2));
  }
  for (const listener of sandbox.listeners) {
    try { listener(text); } catch {}
  }
}

export async function executeCommand(
  sandboxId: string,
  command: string,
  onOutput?: (data: string) => void
): Promise<{ exitCode: number | null; output: string }> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  if (!isCommandSafe(command)) {
    throw new Error("Command blocked by security policy");
  }

  sandbox.lastActivity = new Date();

  try {
    await db.update(sandboxInstancesTable)
      .set({ lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(sandboxInstancesTable.id, sandboxId));
  } catch {}

  const timeoutMs = Math.min(sandbox.timeoutSeconds * 1000, 300_000);

  return new Promise((resolve, reject) => {
    const outputChunks: string[] = [];
    const env = buildSafeEnv(sandbox);

    const child = spawn("sh", ["-c", command], {
      cwd: sandbox.workDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Command timed out after ${sandbox.timeoutSeconds}s`));
    }, timeoutMs);

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      outputChunks.push(text);
      appendOutput(sandbox, text);
      if (onOutput) onOutput(text);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = `[stderr] ${data.toString()}`;
      outputChunks.push(text);
      appendOutput(sandbox, text);
      if (onOutput) onOutput(text);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      sandbox.lastActivity = new Date();
      resolve({ exitCode: code, output: outputChunks.join("") });
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function startServer(
  sandboxId: string,
  command: string,
  onOutput?: (data: string) => void
): Promise<{ pid: number; port: number }> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  if (!isCommandSafe(command)) {
    throw new Error("Command blocked by security policy");
  }

  if (sandbox.process && isSandboxAlive(sandbox)) {
    sandbox.process.kill("SIGTERM");
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  const env = buildSafeEnv(sandbox);

  const child = spawn("sh", ["-c", command], {
    cwd: sandbox.workDir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
  });

  sandbox.process = child;
  sandbox.status = "running";
  sandbox.lastActivity = new Date();
  sandbox.lastCommand = command;
  sandbox.serverPid = child.pid;

  child.stdout?.on("data", (data: Buffer) => {
    appendOutput(sandbox, data.toString());
    if (onOutput) onOutput(data.toString());
  });

  child.stderr?.on("data", (data: Buffer) => {
    appendOutput(sandbox, `[stderr] ${data.toString()}`);
    if (onOutput) onOutput(`[stderr] ${data.toString()}`);
  });

  const maxLifetimeMs = Math.min(sandbox.timeoutSeconds * 1000, MAX_SANDBOX_LIFETIME_MS);
  const serverTimeout = setTimeout(() => {
    console.log(`[Sandbox] Server in ${sandboxId} exceeded max lifetime (${maxLifetimeMs / 1000}s), terminating`);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (sandbox.process === child) {
        child.kill("SIGKILL");
      }
    }, 5000);
  }, maxLifetimeMs);

  child.on("error", (err) => {
    clearTimeout(serverTimeout);
    console.error(`[Sandbox] Server spawn error in ${sandboxId}:`, err);
    sandbox.status = "error";
  });

  child.on("close", (code) => {
    clearTimeout(serverTimeout);
    console.log(`[Sandbox] Server in ${sandboxId} exited with code ${code}`);
    sandbox.status = "stopped";
    sandbox.process = null;
    sandbox.serverPid = undefined;
  });

  try {
    await db.update(sandboxInstancesTable)
      .set({ status: "running", lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(sandboxInstancesTable.id, sandboxId));
  } catch {}

  console.log(`[Sandbox] Server started in ${sandboxId} (pid: ${child.pid}, port: ${sandbox.port})`);
  return { pid: child.pid!, port: sandbox.port };
}

export async function stopSandbox(sandboxId: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  console.log(`[Sandbox] Stopping sandbox ${sandboxId} for project ${sandbox.projectId}`);

  if (sandbox.process) {
    sandbox.process.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (sandbox.process) {
          sandbox.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);
      sandbox.process?.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    sandbox.process = null;
  }

  sandbox.status = "stopped";
  releasePort(sandbox.port);
  cleanWorkDir(sandbox.workDir);
  activeSandboxes.delete(sandboxId);

  try {
    await db.update(sandboxInstancesTable)
      .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
      .where(eq(sandboxInstancesTable.id, sandboxId));
  } catch {}
}

export async function restartSandbox(
  sandboxId: string,
  command?: string
): Promise<{ pid?: number; port: number; status: string }> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  console.log(`[Sandbox] Restarting sandbox ${sandboxId}`);

  if (sandbox.process) {
    sandbox.process.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (sandbox.process) sandbox.process.kill("SIGKILL");
        resolve();
      }, 5000);
      sandbox.process?.on("close", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    sandbox.process = null;
  }

  sandbox.status = "created";
  sandbox.outputBuffer = [];
  sandbox.lastActivity = new Date();

  await syncProjectFiles(sandbox.projectId, sandbox.workDir);

  try {
    await db.update(sandboxInstancesTable)
      .set({ status: "created", lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(sandboxInstancesTable.id, sandboxId));
  } catch {}

  if (command) {
    const result = await startServer(sandboxId, command);
    return { pid: result.pid, port: result.port, status: "running" };
  }

  return { port: sandbox.port, status: "created" };
}

export function getSandboxStatus(sandboxId: string): {
  id: string;
  projectId: string;
  status: string;
  port: number;
  runtime: string;
  memoryLimitMb: number;
  timeoutSeconds: number;
  pid: number | undefined;
  outputTail: string[];
  alive: boolean;
  uptimeMs: number;
} | null {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) return null;

  const alive = sandbox.process ? isSandboxAlive(sandbox) : false;
  if (sandbox.status === "running" && !alive) {
    sandbox.status = "stopped";
    sandbox.process = null;
  }

  return {
    id: sandbox.id,
    projectId: sandbox.projectId,
    status: sandbox.status,
    port: sandbox.port,
    runtime: sandbox.runtime,
    memoryLimitMb: sandbox.memoryLimitMb,
    timeoutSeconds: sandbox.timeoutSeconds,
    pid: sandbox.process?.pid ?? undefined,
    outputTail: sandbox.outputBuffer.slice(-50),
    alive,
    uptimeMs: Date.now() - sandbox.createdAt.getTime(),
  };
}

export function getSandboxWorkDir(sandboxId: string): string | null {
  const sandbox = activeSandboxes.get(sandboxId);
  return sandbox?.workDir ?? null;
}

export function getProjectSandbox(projectId: string): string | null {
  for (const [id, sandbox] of activeSandboxes) {
    if (sandbox.projectId === projectId && (sandbox.status === "created" || sandbox.status === "running")) {
      if (sandbox.status === "running" && sandbox.process && !isSandboxAlive(sandbox)) {
        sandbox.status = "stopped";
        sandbox.process = null;
        continue;
      }
      return id;
    }
  }
  return null;
}

export function getProjectSandboxAny(projectId: string): string | null {
  for (const [id, sandbox] of activeSandboxes) {
    if (sandbox.projectId === projectId) {
      return id;
    }
  }
  return null;
}

const recoveryInProgress = new Set<string>();

async function waitForServerReady(port: number, timeoutMs: number = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const ok = await new Promise<boolean>((resolve) => {
        const req = http.request({ hostname: "127.0.0.1", port, path: "/", method: "HEAD", timeout: 2000 }, (res) => {
          resolve(res.statusCode !== undefined && res.statusCode < 500);
        });
        req.on("error", () => resolve(false));
        req.on("timeout", () => { req.destroy(); resolve(false); });
        req.end();
      });
      if (ok) return true;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 1500));
  }
  return false;
}

export async function recoverSandboxForProject(projectId: string): Promise<string | null> {
  if (recoveryInProgress.has(projectId)) {
    console.log(`[Sandbox Recovery] Already recovering project ${projectId}, waiting...`);
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!recoveryInProgress.has(projectId)) {
        const sid = getProjectSandbox(projectId);
        if (sid) return sid;
        break;
      }
    }
    return getProjectSandbox(projectId);
  }

  const files = await db
    .select({ filePath: projectFilesTable.filePath })
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId));

  if (files.length === 0) return null;

  recoveryInProgress.add(projectId);
  console.log(`[Sandbox Recovery] Recreating sandbox for project ${projectId} (${files.length} files)`);
  try {
    const { id, port } = await createSandbox(projectId, "node", 256, 600);

    const hasPackageJson = files.some(f => f.filePath === "package.json");
    if (hasPackageJson) {
      console.log(`[Sandbox Recovery] Installing dependencies for ${projectId}...`);
      const installCmd = "npm install --legacy-peer-deps 2>&1";
      const installResult = await executeCommand(id, installCmd);
      if (installResult.exitCode !== 0) {
        console.warn(`[Sandbox Recovery] npm install exited with code ${installResult.exitCode} for ${projectId}`);
        console.warn(`[Sandbox Recovery] npm output: ${installResult.output.slice(-500)}`);
      } else {
        console.log(`[Sandbox Recovery] Dependencies installed successfully for ${projectId}`);
      }

      console.log(`[Sandbox Recovery] Starting dev server for ${projectId}...`);
      const devCmd = "vite --port $PORT --host 0.0.0.0 --strictPort";
      await startServer(id, devCmd);

      const ready = await waitForServerReady(port, 30000);
      if (ready) {
        console.log(`[Sandbox Recovery] Server confirmed ready for ${projectId} on port ${port}`);
      } else {
        console.warn(`[Sandbox Recovery] Server did not respond in 30s for ${projectId}, sandbox may still be starting`);
      }
    }

    return id;
  } catch (err) {
    console.error(`[Sandbox Recovery] Failed for project ${projectId}:`, err);
    return null;
  } finally {
    recoveryInProgress.delete(projectId);
  }
}

export function writeFilesToSandboxDirect(
  sandboxId: string,
  files: Array<{ filePath: string; content: string }>
): number {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) return 0;

  let written = 0;
  for (const file of files) {
    if (!isPathSafe(file.filePath, sandbox.workDir)) continue;

    const contentSize = Buffer.byteLength(file.content, 'utf-8');
    if (contentSize > MAX_FILE_SIZE_BYTES) continue;

    const normalizedPath = normalize(file.filePath);
    const fullPath = join(sandbox.workDir, normalizedPath);
    const dir = join(fullPath, "..");
    mkdirSync(dir, { recursive: true });

    const dataUriMatch = file.content.match(/^data:[^;]+;base64,(.+)$/s);
    if (dataUriMatch) {
      writeFileSync(fullPath, Buffer.from(dataUriMatch[1], "base64"));
    } else {
      writeFileSync(fullPath, file.content, "utf-8");
    }
    written++;
  }

  sandbox.lastActivity = new Date();
  return written;
}

export function getSandboxLastCommand(sandboxId: string): string | null {
  const sandbox = activeSandboxes.get(sandboxId);
  return sandbox?.lastCommand ?? null;
}

export function listUserSandboxes(projectIds: string[]): Array<{
  id: string;
  projectId: string;
  status: string;
  port: number;
  runtime: string;
  lastActivity: string;
  alive: boolean;
}> {
  const projectIdSet = new Set(projectIds);
  return Array.from(activeSandboxes.values())
    .filter((s) => projectIdSet.has(s.projectId))
    .map((s) => ({
      id: s.id,
      projectId: s.projectId,
      status: s.status,
      port: s.port,
      runtime: s.runtime,
      lastActivity: s.lastActivity.toISOString(),
      alive: s.process ? isSandboxAlive(s) : false,
    }));
}

export function subscribeSandboxOutput(
  sandboxId: string,
  listener: (data: string) => void
): () => void {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  sandbox.listeners.add(listener);
  return () => {
    sandbox.listeners.delete(listener);
  };
}

function findOldestInactiveSandbox(): string | null {
  let oldest: { id: string; lastActivity: Date } | null = null;
  for (const [id, sandbox] of activeSandboxes) {
    if (sandbox.status === "stopped" || sandbox.status === "error" || !isSandboxAlive(sandbox)) {
      if (!oldest || sandbox.lastActivity < oldest.lastActivity) {
        oldest = { id, lastActivity: sandbox.lastActivity };
      }
    }
  }
  if (!oldest) {
    for (const [id, sandbox] of activeSandboxes) {
      if (!oldest || sandbox.lastActivity < oldest.lastActivity) {
        oldest = { id, lastActivity: sandbox.lastActivity };
      }
    }
  }
  return oldest?.id ?? null;
}

async function cleanupInactiveSandboxes() {
  const inactivityCutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS);
  const lifetimeCutoff = new Date(Date.now() - MAX_SANDBOX_LIFETIME_MS * 2);
  const toRemove: string[] = [];

  for (const [id, sandbox] of activeSandboxes) {
    if (sandbox.lastActivity < inactivityCutoff) {
      toRemove.push(id);
      continue;
    }
    if (sandbox.createdAt < lifetimeCutoff) {
      toRemove.push(id);
      continue;
    }
    if (sandbox.status === "running" && sandbox.process && !isSandboxAlive(sandbox)) {
      sandbox.status = "stopped";
      sandbox.process = null;
      toRemove.push(id);
    }
  }

  for (const id of toRemove) {
    console.log(`[Sandbox] Cleaning up sandbox: ${id} (project: ${activeSandboxes.get(id)?.projectId})`);
    try {
      await stopSandbox(id);
    } catch (e: unknown) {
      console.error(`[Sandbox] Failed to cleanup sandbox ${id}:`, e);
      activeSandboxes.delete(id);
    }
  }

  if (activeSandboxes.size === 0 && cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

function startCleanupIfNeeded() {
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupInactiveSandboxes, CLEANUP_INTERVAL_MS);
  }
}

export async function shutdownAllSandboxes(): Promise<void> {
  console.log(`[Sandbox] Shutting down all sandboxes (${activeSandboxes.size} active)`);
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  const ids = Array.from(activeSandboxes.keys());
  for (const id of ids) {
    try {
      await stopSandbox(id);
    } catch (e: unknown) {
      console.error(`[Sandbox] Failed to shutdown sandbox ${id}:`, e);
    }
  }
}

export function getSandboxStats(): {
  active: number;
  running: number;
  stopped: number;
  maxConcurrent: number;
  portsUsed: number;
  portRange: number;
} {
  let running = 0;
  let stopped = 0;
  for (const sandbox of activeSandboxes.values()) {
    if (sandbox.status === "running" && isSandboxAlive(sandbox)) running++;
    else stopped++;
  }
  return {
    active: activeSandboxes.size,
    running,
    stopped,
    maxConcurrent: MAX_CONCURRENT_SANDBOXES,
    portsUsed: usedPorts.size,
    portRange: PORT_RANGE,
  };
}
