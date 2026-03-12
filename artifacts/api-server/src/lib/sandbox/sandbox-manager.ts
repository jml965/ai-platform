import { spawn, execSync, type ChildProcess } from "child_process";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join, resolve, normalize } from "path";
import { tmpdir } from "os";
import { db } from "@workspace/db";
import { sandboxInstancesTable, projectFilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

const MAX_CONCURRENT_SANDBOXES = 10;
const CLEANUP_INTERVAL_MS = 60_000;
const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
const BASE_PORT = 9000;
const PORT_RANGE = 100;

const SAFE_ENV_KEYS = new Set([
  "PATH",
  "LANG",
  "LC_ALL",
  "TERM",
  "SHELL",
  "TMPDIR",
  "NODE_ENV",
]);

interface SandboxProcess {
  id: string;
  projectId: string;
  process: ChildProcess | null;
  workDir: string;
  port: number;
  runtime: "node" | "python";
  memoryLimitMb: number;
  timeoutSeconds: number;
  status: "created" | "running" | "stopped" | "error";
  lastActivity: Date;
  outputBuffer: string[];
  listeners: Set<(data: string) => void>;
}

const activeSandboxes = new Map<string, SandboxProcess>();
const usedPorts = new Set<number>();
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

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
  const dir = join(tmpdir(), "sandboxes", sandboxId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanWorkDir(dir: string) {
  try {
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true, force: true });
    }
  } catch (e: unknown) {
    console.error(`Failed to clean work dir ${dir}:`, e);
  }
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
  env.HOME = sandbox.workDir;
  env.TMPDIR = join(sandbox.workDir, ".tmp");

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

function buildResourceLimitedCommand(command: string, memoryLimitMb: number, runtime: "node" | "python"): string {
  const memoryLimitKb = memoryLimitMb * 1024;
  const ulimitPrefix = `ulimit -v ${memoryLimitKb} 2>/dev/null; `;
  return `${ulimitPrefix}${command}`;
}

function isPathSafe(filePath: string, workDir: string): boolean {
  if (filePath.includes("\0")) return false;

  const normalizedPath = normalize(filePath);
  if (normalizedPath.startsWith("/") || normalizedPath.startsWith("..")) return false;

  const resolvedPath = resolve(workDir, normalizedPath);
  const resolvedWorkDir = resolve(workDir);
  return resolvedPath.startsWith(resolvedWorkDir + "/") || resolvedPath === resolvedWorkDir;
}

export function getSandboxProjectId(sandboxId: string): string | null {
  const sandbox = activeSandboxes.get(sandboxId);
  return sandbox?.projectId ?? null;
}

export async function createSandbox(
  projectId: string,
  runtime: "node" | "python" = "node",
  memoryLimitMb: number = 256,
  timeoutSeconds: number = 300
): Promise<{ id: string; port: number; status: string }> {
  if (activeSandboxes.size >= MAX_CONCURRENT_SANDBOXES) {
    throw new Error(`Maximum concurrent sandboxes reached (${MAX_CONCURRENT_SANDBOXES})`);
  }

  const clampedMemory = Math.min(Math.max(memoryLimitMb, 64), 512);
  const clampedTimeout = Math.min(Math.max(timeoutSeconds, 30), 600);

  const existingSandbox = Array.from(activeSandboxes.values()).find(
    (s) => s.projectId === projectId && (s.status === "created" || s.status === "running")
  );
  if (existingSandbox) {
    throw new Error(`Project already has an active sandbox: ${existingSandbox.id}`);
  }

  const port = allocatePort();
  if (port === null) {
    throw new Error("No available ports for sandbox");
  }

  const sandboxId = uuidv4();
  const workDir = createWorkDir(sandboxId);

  mkdirSync(join(workDir, ".tmp"), { recursive: true });

  if (runtime === "python") {
    try {
      execSync("python3 -m venv .venv", { cwd: workDir, timeout: 30_000 });
    } catch (e: unknown) {
      console.warn(`Failed to create Python venv: ${e}`);
    }
  }

  await syncProjectFiles(projectId, workDir);

  const [instance] = await db.insert(sandboxInstancesTable).values({
    projectId,
    status: "created",
    runtime,
    port,
    workDir,
    memoryLimitMb: clampedMemory,
    timeoutSeconds: clampedTimeout,
    lastActivityAt: new Date(),
  }).returning();

  const sandbox: SandboxProcess = {
    id: instance.id,
    projectId,
    process: null,
    workDir,
    port,
    runtime,
    memoryLimitMb: clampedMemory,
    timeoutSeconds: clampedTimeout,
    status: "created",
    lastActivity: new Date(),
    outputBuffer: [],
    listeners: new Set(),
  };

  activeSandboxes.set(instance.id, sandbox);
  startCleanupIfNeeded();

  return { id: instance.id, port, status: "created" };
}

async function syncProjectFiles(projectId: string, workDir: string) {
  const files = await db
    .select({ filePath: projectFilesTable.filePath, content: projectFilesTable.content })
    .from(projectFilesTable)
    .where(eq(projectFilesTable.projectId, projectId));

  for (const file of files) {
    if (!isPathSafe(file.filePath, workDir)) {
      console.warn(`Skipping unsafe file path: ${file.filePath}`);
      continue;
    }

    const normalizedPath = normalize(file.filePath);
    const fullPath = join(workDir, normalizedPath);
    const dir = join(fullPath, "..");
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, file.content, "utf-8");
  }
}

function appendOutput(sandbox: SandboxProcess, text: string) {
  sandbox.lastActivity = new Date();
  sandbox.outputBuffer.push(text);
  if (sandbox.outputBuffer.length > 1000) {
    sandbox.outputBuffer.splice(0, sandbox.outputBuffer.length - 500);
  }
  for (const listener of sandbox.listeners) {
    listener(text);
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

  sandbox.lastActivity = new Date();

  await db.update(sandboxInstancesTable)
    .set({ lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(sandboxInstancesTable.id, sandboxId));

  const timeoutMs = sandbox.timeoutSeconds * 1000;

  return new Promise((resolve, reject) => {
    const outputChunks: string[] = [];
    const env = buildSafeEnv(sandbox);
    const wrappedCommand = buildResourceLimitedCommand(command, sandbox.memoryLimitMb, sandbox.runtime);

    const child = spawn("sh", ["-c", wrappedCommand], {
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
  command: string
): Promise<{ pid: number; port: number }> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

  if (sandbox.process) {
    sandbox.process.kill("SIGTERM");
    sandbox.process = null;
  }

  sandbox.lastActivity = new Date();

  const env = buildSafeEnv(sandbox);

  const wrappedCommand = buildResourceLimitedCommand(command, sandbox.memoryLimitMb, sandbox.runtime);

  const child = spawn("sh", ["-c", wrappedCommand], {
    cwd: sandbox.workDir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    detached: false,
  });

  child.stdout?.on("data", (data: Buffer) => {
    appendOutput(sandbox, data.toString());
  });

  child.stderr?.on("data", (data: Buffer) => {
    appendOutput(sandbox, `[stderr] ${data.toString()}`);
  });

  const maxServerLifetimeMs = sandbox.timeoutSeconds * 1000;
  const serverTimeout = setTimeout(() => {
    console.log(`Server in sandbox ${sandboxId} exceeded max lifetime (${sandbox.timeoutSeconds}s), terminating`);
    child.kill("SIGTERM");
    setTimeout(() => {
      if (sandbox.process === child) {
        child.kill("SIGKILL");
      }
    }, 5000);
  }, maxServerLifetimeMs);

  child.on("error", (err) => {
    clearTimeout(serverTimeout);
    console.error(`Server spawn error in sandbox ${sandboxId}:`, err);
    sandbox.status = "error";
    sandbox.process = null;
    appendOutput(sandbox, `[error] Failed to start server: ${err.message}`);
    db.update(sandboxInstancesTable)
      .set({ status: "error", stoppedAt: new Date(), updatedAt: new Date() })
      .where(eq(sandboxInstancesTable.id, sandboxId))
      .catch((e: unknown) => console.error(`Failed to update sandbox status: ${e}`));
  });

  child.on("close", () => {
    clearTimeout(serverTimeout);
    sandbox.status = "stopped";
    sandbox.process = null;
    db.update(sandboxInstancesTable)
      .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
      .where(eq(sandboxInstancesTable.id, sandboxId))
      .catch((e: unknown) => console.error(`Failed to update sandbox status: ${e}`));
  });

  sandbox.process = child;
  sandbox.status = "running";

  await db.update(sandboxInstancesTable)
    .set({
      status: "running",
      pid: child.pid ?? null,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sandboxInstancesTable.id, sandboxId));

  return { pid: child.pid!, port: sandbox.port };
}

export async function stopSandbox(sandboxId: string): Promise<void> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

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

  await db.update(sandboxInstancesTable)
    .set({ status: "stopped", stoppedAt: new Date(), updatedAt: new Date() })
    .where(eq(sandboxInstancesTable.id, sandboxId));
}

export async function restartSandbox(
  sandboxId: string,
  command?: string
): Promise<{ pid?: number; port: number; status: string }> {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) {
    throw new Error(`Sandbox not found: ${sandboxId}`);
  }

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

  await db.update(sandboxInstancesTable)
    .set({ status: "created", lastActivityAt: new Date(), updatedAt: new Date() })
    .where(eq(sandboxInstancesTable.id, sandboxId));

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
} | null {
  const sandbox = activeSandboxes.get(sandboxId);
  if (!sandbox) return null;

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
  };
}

export function getProjectSandbox(projectId: string): string | null {
  for (const [id, sandbox] of activeSandboxes) {
    if (sandbox.projectId === projectId && (sandbox.status === "created" || sandbox.status === "running")) {
      return id;
    }
  }
  return null;
}

export function listUserSandboxes(projectIds: string[]): Array<{
  id: string;
  projectId: string;
  status: string;
  port: number;
  runtime: string;
  lastActivity: string;
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

async function cleanupInactiveSandboxes() {
  const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS);
  const toRemove: string[] = [];

  for (const [id, sandbox] of activeSandboxes) {
    if (sandbox.lastActivity < cutoff) {
      toRemove.push(id);
    }
  }

  for (const id of toRemove) {
    console.log(`Cleaning up inactive sandbox: ${id}`);
    try {
      await stopSandbox(id);
    } catch (e: unknown) {
      console.error(`Failed to cleanup sandbox ${id}:`, e);
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
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  const ids = Array.from(activeSandboxes.keys());
  for (const id of ids) {
    try {
      await stopSandbox(id);
    } catch (e: unknown) {
      console.error(`Failed to shutdown sandbox ${id}:`, e);
    }
  }
}
