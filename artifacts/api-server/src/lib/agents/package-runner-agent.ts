import { watch, type FSWatcher } from "fs";
import { BaseAgent, type ModelConfig } from "./base-agent";
import {
  createSandbox,
  executeCommand,
  startServer,
  stopSandbox,
  getProjectSandbox,
  restartSandbox,
  subscribeSandboxOutput,
  getSandboxStatus,
  getSandboxWorkDir,
} from "../sandbox/sandbox-manager";
import type { AgentResult, AgentType, BuildContext, GeneratedFile } from "./types";

export type ProjectType = "nodejs" | "python" | "static" | "unknown";

export interface RunnerOutput {
  type: "stdout" | "stderr" | "info" | "error";
  message: string;
  timestamp: string;
}

export interface RunnerStatus {
  phase: "idle" | "detecting" | "installing" | "starting" | "running" | "failed" | "stopped";
  projectType: ProjectType;
  installExitCode: number | null;
  serverPort: number | null;
  sandboxId: string | null;
  error: string | null;
}

const MAX_RETRIES = 2;
const START_RETRY_DELAY_MS = 2000;
const FILE_WATCH_DEBOUNCE_MS = 1000;

type OutputListener = (output: RunnerOutput) => void;

export class PackageRunnerAgent extends BaseAgent {
  readonly agentType: AgentType = "package_runner";
  readonly modelConfig: ModelConfig = { provider: "openai", model: "o1" };
  readonly systemPrompt = `You are a build and deployment assistant. You analyze error logs from package installation and server startup, then suggest fixes. Respond with a JSON object: { "diagnosis": "...", "suggestedCommand": "..." }`;

  private sandboxId: string | null = null;
  private fileWatcher: FSWatcher | null = null;
  private unsubscribeSandbox: (() => void) | null = null;
  private outputListeners: Set<OutputListener> = new Set();
  private status: RunnerStatus = {
    phase: "idle",
    projectType: "unknown",
    installExitCode: null,
    serverPort: null,
    sandboxId: null,
    error: null,
  };
  private lastStartCommand: string | null = null;
  private lastProjectId: string | null = null;
  private lastFiles: GeneratedFile[] = [];

  getStatus(): RunnerStatus {
    return { ...this.status };
  }

  onOutput(listener: OutputListener): () => void {
    this.outputListeners.add(listener);
    return () => { this.outputListeners.delete(listener); };
  }

  private emitOutput(type: RunnerOutput["type"], message: string): void {
    const output: RunnerOutput = {
      type,
      message,
      timestamp: new Date().toISOString(),
    };
    for (const listener of this.outputListeners) {
      listener(output);
    }
  }

  detectProjectType(files: GeneratedFile[]): ProjectType {
    const filePaths = files.map((f) => f.filePath.toLowerCase());
    const hasFile = (name: string) => filePaths.some((p) => p === name || p.endsWith(`/${name}`));

    if (hasFile("package.json")) return "nodejs";
    if (hasFile("requirements.txt") || hasFile("setup.py") || hasFile("pyproject.toml")) return "python";
    if (hasFile("index.html")) return "static";

    return "unknown";
  }

  private getInstallCommand(projectType: ProjectType, files: GeneratedFile[]): string | null {
    switch (projectType) {
      case "nodejs":
        return "npm install";
      case "python": {
        const hasRequirements = files.some(
          (f) => f.filePath === "requirements.txt" || f.filePath.endsWith("/requirements.txt")
        );
        if (hasRequirements) return "pip install -r requirements.txt";
        const hasPyproject = files.some(
          (f) => f.filePath === "pyproject.toml" || f.filePath.endsWith("/pyproject.toml")
        );
        if (hasPyproject) return "pip install .";
        return null;
      }
      default:
        return null;
    }
  }

  private getStartCommand(projectType: ProjectType, files: GeneratedFile[]): string | null {
    if (projectType === "nodejs") {
      const pkgFile = files.find(
        (f) => f.filePath === "package.json" || f.filePath.endsWith("/package.json")
      );
      if (pkgFile) {
        try {
          const pkg = JSON.parse(pkgFile.content);
          if (pkg.scripts?.dev) return "npm run dev";
          if (pkg.scripts?.start) return "npm start";
          if (pkg.main) return `node ${pkg.main}`;
        } catch {}
      }
      const entryFiles = ["server.js", "server.ts", "app.js", "app.ts", "index.js", "index.ts",
        "server.mjs", "app.mjs", "index.mjs"];
      for (const entry of entryFiles) {
        const found = files.find(
          (f) => f.filePath === entry || f.filePath.endsWith(`/${entry}`)
        );
        if (found) return `node ${found.filePath}`;
      }
      return null;
    }

    if (projectType === "python") {
      const entryFiles = ["main.py", "app.py", "server.py", "run.py", "manage.py"];
      for (const entry of entryFiles) {
        const found = files.find(
          (f) => f.filePath === entry || f.filePath.endsWith(`/${entry}`)
        );
        if (found) {
          if (found.content.includes("from flask") || found.content.includes("import flask")) {
            return `python ${found.filePath}`;
          }
          if (found.content.includes("uvicorn") || found.content.includes("from fastapi")) {
            const moduleName = found.filePath.replace(/\.py$/, "").replace(/\//g, ".");
            return `uvicorn ${moduleName}:app --host 0.0.0.0 --port $PORT`;
          }
          return `python ${found.filePath}`;
        }
      }
      return null;
    }

    if (projectType === "static") {
      return "npx serve -s . -l $PORT";
    }

    return null;
  }

  private analyzeInstallError(output: string): string | null {
    if (/ERESOLVE|peer dep|could not resolve/i.test(output)) {
      return "npm install --legacy-peer-deps";
    }
    if (/ENOENT.*package\.json/i.test(output)) {
      return null;
    }
    return null;
  }

  private analyzeStartError(output: string, projectType: ProjectType): string | null {
    if (projectType === "nodejs") {
      if (/Cannot find module/i.test(output)) {
        return "npm install && npm start";
      }
      if (/EADDRINUSE/i.test(output)) {
        return null;
      }
      if (/SyntaxError/i.test(output)) {
        return null;
      }
    }
    if (projectType === "python") {
      if (/ModuleNotFoundError/i.test(output)) {
        return "pip install -r requirements.txt && python main.py";
      }
      if (/Address already in use/i.test(output)) {
        return null;
      }
    }
    return null;
  }

  private setupFileWatcher(): void {
    if (!this.sandboxId) return;

    const workDir = getSandboxWorkDir(this.sandboxId);
    if (!workDir) return;

    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      this.fileWatcher = watch(workDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        if (filename.startsWith("node_modules") || filename.startsWith(".")) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.emitOutput("info", `File changed: ${filename}. Restarting server...`);
          this.handleFileChange().catch((err) => {
            this.emitOutput("error", `Auto-restart failed: ${err instanceof Error ? err.message : String(err)}`);
          });
        }, FILE_WATCH_DEBOUNCE_MS);
      });
      this.emitOutput("info", "File watcher active. Server will auto-restart on file changes.");
    } catch (err) {
      this.emitOutput("info", `File watching not available: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  private async handleFileChange(): Promise<void> {
    if (!this.sandboxId || !this.lastStartCommand) return;

    try {
      const result = await restartSandbox(this.sandboxId, this.lastStartCommand);
      this.status.serverPort = result.port;
      this.status.phase = result.status === "running" ? "running" : "idle";
      this.emitOutput("info", `Server restarted on port ${result.port}`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.emitOutput("error", `Failed to restart server: ${errMsg}`);
    }
  }

  async execute(context: BuildContext): Promise<AgentResult> {
    const files = context.existingFiles.map((f) => ({
      filePath: f.filePath,
      content: f.content,
      fileType: f.filePath.split(".").pop() || "txt",
    }));
    return this.executeWithFiles(context.projectId, files);
  }

  async executeWithFiles(
    projectId: string,
    files: GeneratedFile[],
  ): Promise<AgentResult> {
    const startTime = Date.now();
    this.lastProjectId = projectId;
    this.lastFiles = files;

    try {
      this.status.phase = "detecting";
      const projectType = this.detectProjectType(files);
      this.status.projectType = projectType;
      this.emitOutput("info", `Detected project type: ${projectType}`);

      if (projectType === "unknown") {
        this.emitOutput("info", "No recognizable project structure found. Skipping install/start.");
        this.status.phase = "idle";
        return {
          success: true,
          tokensUsed: 0,
          durationMs: Date.now() - startTime,
          data: { projectType, skipped: true, reason: "unknown_project_type" },
        };
      }

      const runtime = projectType === "python" ? "python" : "node";
      this.emitOutput("info", "Creating isolated sandbox environment...");

      const existingSandboxId = getProjectSandbox(projectId);
      if (existingSandboxId) {
        try {
          await stopSandbox(existingSandboxId);
        } catch {}
      }

      const sandbox = await createSandbox(projectId, runtime as "node" | "python", 256, 300);
      this.sandboxId = sandbox.id;
      this.status.sandboxId = sandbox.id;
      this.emitOutput("info", `Sandbox created (id: ${sandbox.id}, port: ${sandbox.port})`);

      const installCmd = this.getInstallCommand(projectType, files);
      if (installCmd) {
        this.status.phase = "installing";
        this.emitOutput("info", `Installing dependencies: ${installCmd}`);

        let retries = 0;
        let installSuccess = false;
        let cmdToRun = installCmd;

        while (retries <= MAX_RETRIES && !installSuccess) {
          try {
            const result = await executeCommand(sandbox.id, cmdToRun, (data) => {
              this.emitOutput("stdout", data);
            });
            this.status.installExitCode = result.exitCode;

            if (result.exitCode === 0) {
              installSuccess = true;
              this.emitOutput("info", "Dependencies installed successfully.");
            } else {
              const retryCmd = this.analyzeInstallError(result.output);
              if (retryCmd && retries < MAX_RETRIES) {
                this.emitOutput("info", `Install failed (exit ${result.exitCode}). Analyzing error and retrying with: ${retryCmd}`);
                cmdToRun = retryCmd;
                retries++;
              } else {
                this.status.phase = "failed";
                this.status.error = `Install failed with exit code ${result.exitCode}`;
                this.emitOutput("error", this.status.error);
                return {
                  success: false,
                  tokensUsed: 0,
                  durationMs: Date.now() - startTime,
                  error: this.status.error,
                  data: { projectType, phase: "install", sandboxId: sandbox.id, output: result.output.slice(0, 2000) },
                };
              }
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            if (retries < MAX_RETRIES) {
              this.emitOutput("info", `Install error: ${errMsg}. Retrying...`);
              retries++;
            } else {
              this.status.phase = "failed";
              this.status.error = errMsg;
              this.emitOutput("error", errMsg);
              return {
                success: false,
                tokensUsed: 0,
                durationMs: Date.now() - startTime,
                error: errMsg,
                data: { projectType, phase: "install", sandboxId: sandbox.id },
              };
            }
          }
        }
      }

      this.unsubscribeSandbox = subscribeSandboxOutput(sandbox.id, (data: string) => {
        const isStderr = data.startsWith("[stderr]");
        this.emitOutput(isStderr ? "stderr" : "stdout", data);
      });

      const startCmd = this.getStartCommand(projectType, files);
      if (startCmd) {
        this.status.phase = "starting";
        this.lastStartCommand = startCmd;
        this.emitOutput("info", `Starting server: ${startCmd}`);

        let startRetries = 0;
        let startSuccess = false;
        let currentStartCmd = startCmd;

        while (startRetries <= MAX_RETRIES && !startSuccess) {
          try {
            const server = await startServer(sandbox.id, currentStartCmd);
            this.status.phase = "running";
            this.status.serverPort = sandbox.port;
            this.emitOutput("info", `Server running on port ${sandbox.port} (pid: ${server.pid})`);
            startSuccess = true;

            this.setupFileWatcher();
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);

            const sandboxInfo = getSandboxStatus(sandbox.id);
            const outputLog = sandboxInfo?.outputTail?.join("\n") ?? errMsg;
            const retryCmd = this.analyzeStartError(outputLog, projectType);

            if (retryCmd && startRetries < MAX_RETRIES) {
              this.emitOutput("info", `Start failed: ${errMsg}. Analyzing error and retrying with: ${retryCmd}`);
              currentStartCmd = retryCmd;
              startRetries++;
              await new Promise((resolve) => setTimeout(resolve, START_RETRY_DELAY_MS));
            } else if (startRetries < MAX_RETRIES) {
              this.emitOutput("info", `Start failed: ${errMsg}. Retrying with same command...`);
              startRetries++;
              await new Promise((resolve) => setTimeout(resolve, START_RETRY_DELAY_MS));
            } else {
              this.status.phase = "failed";
              this.status.error = errMsg;
              this.emitOutput("error", `Failed to start server after ${MAX_RETRIES + 1} attempts: ${errMsg}`);
              return {
                success: false,
                tokensUsed: 0,
                durationMs: Date.now() - startTime,
                error: errMsg,
                data: { projectType, phase: "start", sandboxId: sandbox.id },
              };
            }
          }
        }
      } else {
        this.emitOutput("info", "No start command detected. Project files deployed to sandbox.");
        this.status.phase = "idle";
      }

      return {
        success: true,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        data: {
          projectType,
          sandboxId: sandbox.id,
          installed: !!installCmd,
          serverStarted: !!startCmd,
          port: this.status.serverPort,
        },
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.status.phase = "failed";
      this.status.error = errMsg;
      this.emitOutput("error", errMsg);
      return {
        success: false,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: errMsg,
      };
    }
  }

  async stop(): Promise<void> {
    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = null;
    }

    if (this.unsubscribeSandbox) {
      this.unsubscribeSandbox();
      this.unsubscribeSandbox = null;
    }

    if (this.sandboxId) {
      this.emitOutput("info", "Stopping sandbox...");
      try {
        await stopSandbox(this.sandboxId);
      } catch (err) {
        console.error(`Failed to stop sandbox ${this.sandboxId}:`, err);
      }
      this.sandboxId = null;
      this.status.phase = "stopped";
      this.status.serverPort = null;
      this.status.sandboxId = null;
    }
  }

  async restartFromFiles(projectId: string, files: GeneratedFile[]): Promise<AgentResult> {
    await this.stop();
    return this.executeWithFiles(projectId, files);
  }
}

const activeRunners = new Map<string, PackageRunnerAgent>();

export function getRunner(buildId: string): PackageRunnerAgent | undefined {
  return activeRunners.get(buildId);
}

export function setRunner(buildId: string, runner: PackageRunnerAgent): void {
  activeRunners.set(buildId, runner);
}

export function removeRunner(buildId: string): void {
  const runner = activeRunners.get(buildId);
  if (runner) {
    runner.stop().catch((err) => console.error(`Failed to stop runner for build ${buildId}:`, err));
    activeRunners.delete(buildId);
  }
}
