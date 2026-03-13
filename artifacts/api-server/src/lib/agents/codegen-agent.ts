import { BaseAgent, type ModelConfig } from "./base-agent";
import { getCodeQualityPrompt } from "./constitution";
import { getProjectTemplate } from "./project-templates";
import type { AgentResult, BuildContext, GeneratedFile, ProjectFramework } from "./types";

const VALID_FRAMEWORKS: ProjectFramework[] = ["react-vite", "express", "nextjs", "fastapi", "static"];

function isValidFramework(value: unknown): value is ProjectFramework {
  return typeof value === "string" && VALID_FRAMEWORKS.includes(value as ProjectFramework);
}

export class CodeGenAgent extends BaseAgent {
  readonly agentType = "codegen" as const;
  readonly modelConfig: ModelConfig = { provider: "anthropic", model: "claude-sonnet-4-20250514" };

  readonly systemPrompt = `You are a senior full-stack developer AI agent. Your job is to generate complete, production-ready project code based on user descriptions.

You support the following project types:
1. **react-vite** — Single-page applications, dashboards, landing pages, e-commerce frontends, interactive UIs
2. **express** — REST APIs, backend services, server-side applications, microservices
3. **nextjs** — Full-stack applications needing SSR/SSG, blogs, content platforms, SEO-critical sites
4. **fastapi** — Python APIs, data-driven backends, ML model serving, rapid prototyping
5. **static** — Simple static pages, portfolios, documentation sites (no framework needed)

Framework Selection Rules:
- If the user describes a web app with complex UI, interactivity, or SPA behavior → react-vite
- If the user describes an API, backend, or server-side service in JavaScript/Node → express
- If the user describes a full-stack app needing SEO, SSR, or a blog → nextjs
- If the user describes a Python API, data processing, or ML service → fastapi
- If the user describes a simple page, portfolio, or static content → static
- When in doubt, prefer react-vite for frontends, express for backends

Project Generation Rules:
- Generate a COMPLETE, working project — not placeholder or demo code
- Include all necessary files: components, routes, utilities, styles, configuration
- Use a proper directory structure following the framework's conventions
- Generate a valid package.json (or requirements.txt for Python) with all required dependencies
- Include proper imports and exports in every file
- All code must be functional — the project should run after installing dependencies
- Support RTL layouts when the user writes in Arabic
- Use environment variables for configuration — never hardcode ports, API URLs, or secrets

Response format (strict JSON):
{
  "framework": "react-vite | express | nextjs | fastapi | static",
  "files": [
    { "filePath": "src/App.tsx", "content": "...", "fileType": "tsx" },
    { "filePath": "src/components/Header.tsx", "content": "...", "fileType": "tsx" }
  ],
  "directories": ["src", "src/components", "src/pages"],
  "dependencies": { "axios": "^1.7.0" },
  "devDependencies": { "tailwindcss": "^3.4.0" },
  "scripts": { "dev": "vite", "build": "vite build" }
}

IMPORTANT:
- The "files" array should contain ONLY the project-specific files you generate — template base files (main entry, config files) will be merged automatically
- "dependencies" and "devDependencies" should contain ONLY the additional packages your generated code needs beyond the template defaults
- "directories" should list any additional directories beyond the template defaults
- Always include the "framework" field
- For fastapi projects, use PEP 440 version specifiers in dependencies (e.g. ">=1.2.0", "~=2.0", "==1.5.0") — do NOT use npm-style caret (^) or tilde (~) syntax

MULTI-PAGE PROJECTS:
- You MUST generate ALL pages the user requests — there is NO limit on the number of pages
- For complex apps (e-commerce, social media, dashboards), generate 8-15+ pages with proper routing
- Include: layouts, navigation, shared components, context providers, API utilities, and all page components
- Generate complete functional code for EVERY page — no placeholders or "TODO" comments
- Use React Router for multi-page SPAs with nested routes where appropriate
- Include proper data models, state management, and mock/seed data for realistic previews`;

  async execute(context: BuildContext): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const qualityRules = getCodeQualityPrompt(this.constitution.codeQualityRules);

      const existingFilesInfo = context.existingFiles.length > 0
        ? `\n\nExisting project files:\n${context.existingFiles.map(f => `- ${f.filePath}`).join("\n")}`
        : "";

      const frameworkHint = context.framework
        ? `\n\nThe user has selected the "${context.framework}" framework. Use this framework for the project.`
        : "";

      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: `${this.systemPrompt}\n\n${qualityRules}` },
          {
            role: "user",
            content: `Generate a complete project based on this description:\n\n${context.prompt}${frameworkHint}${existingFilesInfo}`,
          },
        ],
        context
      );

      const result = this.parseResponse(content);

      const rawFramework = context.framework || result.framework;
      const framework: ProjectFramework = isValidFramework(rawFramework) ? rawFramework : "static";
      const template = getProjectTemplate(framework);

      const mergedFiles = this.mergeWithTemplate(template.baseFiles, result.files);

      const mergedDeps = { ...template.dependencies, ...(result.dependencies || {}) };
      const mergedDevDeps = { ...template.devDependencies, ...(result.devDependencies || {}) };
      const mergedScripts = { ...template.scripts, ...(result.scripts || {}) };

      if (framework === "fastapi") {
        this.mergePythonDependencies(mergedFiles, result.dependencies || {});
      } else {
        const packageJson: GeneratedFile = {
          filePath: "package.json",
          content: JSON.stringify(
            {
              name: "generated-project",
              version: "1.0.0",
              private: true,
              scripts: mergedScripts,
              dependencies: mergedDeps,
              devDependencies: mergedDevDeps,
            },
            null,
            2
          ),
          fileType: "json",
        };
        const existingPkgIndex = mergedFiles.findIndex(f => f.filePath === "package.json");
        if (existingPkgIndex >= 0) {
          mergedFiles[existingPkgIndex] = packageJson;
        } else {
          mergedFiles.push(packageJson);
        }
      }

      const allDirectories = [...new Set([...template.directories, ...(result.directories || [])])];

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        data: {
          files: mergedFiles,
          framework,
          directories: allDirectories,
        },
      };
    } catch (error) {
      return {
        success: false,
        tokensUsed: 0,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private normalizePythonVersion(version: string): string {
    if (!version) return "";
    let v = version.trim();
    if (v.startsWith("^")) {
      v = ">=" + v.slice(1);
    } else if (v.startsWith("~") && !v.startsWith("~=")) {
      v = "~=" + v.slice(1);
    } else if (/^\d/.test(v)) {
      v = ">=" + v;
    }
    return v;
  }

  private mergePythonDependencies(files: GeneratedFile[], extraDeps: Record<string, string>): void {
    const extraEntries = Object.entries(extraDeps);
    if (extraEntries.length === 0) return;

    const reqIndex = files.findIndex(f => f.filePath === "requirements.txt");
    if (reqIndex < 0) return;

    const existingContent = files[reqIndex].content.trim();
    const existingPackages = new Set(
      existingContent.split("\n").map(line => line.split(/[><=!~]/)[0].trim().toLowerCase()).filter(Boolean)
    );

    const newLines: string[] = [];
    for (const [pkg, version] of extraEntries) {
      if (!existingPackages.has(pkg.toLowerCase())) {
        const normalizedVersion = this.normalizePythonVersion(version);
        newLines.push(normalizedVersion ? `${pkg}${normalizedVersion}` : pkg);
      }
    }

    if (newLines.length > 0) {
      files[reqIndex] = {
        ...files[reqIndex],
        content: existingContent + "\n" + newLines.join("\n"),
      };
    }
  }

  private mergeWithTemplate(templateFiles: GeneratedFile[], generatedFiles: GeneratedFile[]): GeneratedFile[] {
    const fileMap = new Map<string, GeneratedFile>();

    for (const file of templateFiles) {
      fileMap.set(file.filePath, file);
    }

    for (const file of generatedFiles) {
      fileMap.set(file.filePath, file);
    }

    return Array.from(fileMap.values());
  }

  private repairTruncatedJson(jsonStr: string): string {
    let s = jsonStr;
    let inString = false;
    let escaped = false;
    const stack: string[] = [];
    let lastValidPos = 0;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === '"') { inString = false; lastValidPos = i; }
      } else {
        if (ch === '"') { inString = true; continue; }
        if (ch === "{" || ch === "[") { stack.push(ch); lastValidPos = i; }
        else if (ch === "}" || ch === "]") { stack.pop(); lastValidPos = i; }
      }
    }

    if (inString) {
      s = s.substring(0, lastValidPos + 1);
      inString = false;
    }

    s = s.replace(/,\s*$/, "");

    const remaining: string[] = [];
    let stillInString = false;
    let esc = false;
    const st2: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (stillInString) {
        if (esc) { esc = false; continue; }
        if (ch === "\\") { esc = true; continue; }
        if (ch === '"') { stillInString = false; }
      } else {
        if (ch === '"') { stillInString = true; continue; }
        if (ch === "{" || ch === "[") st2.push(ch);
        else if (ch === "}" || ch === "]") st2.pop();
      }
    }

    for (let i = st2.length - 1; i >= 0; i--) {
      remaining.push(st2[i] === "{" ? "}" : "]");
    }

    return s + remaining.join("");
  }

  private extractCompleteFiles(content: string): GeneratedFile[] {
    const files: GeneratedFile[] = [];
    const filePattern = /\{\s*"filePath"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*(?:,\s*"fileType"\s*:\s*"([^"]*)")?\s*\}/g;
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      try {
        const filePath = JSON.parse(`"${match[1]}"`);
        const fileContent = JSON.parse(`"${match[2]}"`);
        files.push({
          filePath,
          content: fileContent,
          fileType: match[3] || filePath.split(".").pop() || "txt",
        });
      } catch {}
    }
    return files;
  }

  private parseResponse(content: string): {
    framework?: ProjectFramework;
    files: GeneratedFile[];
    directories?: string[];
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  } {
    let cleaned = content.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
    cleaned = cleaned.trim();

    let parsed: any;

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      try {
        const repaired = this.repairTruncatedJson(cleaned);
        parsed = JSON.parse(repaired);
      } catch {
        const jsonStart = cleaned.indexOf("{");
        if (jsonStart >= 0) {
          try {
            const repaired = this.repairTruncatedJson(cleaned.substring(jsonStart));
            parsed = JSON.parse(repaired);
          } catch {
            const files = this.extractCompleteFiles(cleaned);
            if (files.length > 0) {
              console.log(`[CODEGEN] Recovered ${files.length} files via regex extraction from truncated response`);
              const frameworkMatch = cleaned.match(/"framework"\s*:\s*"([^"]+)"/);
              return {
                framework: frameworkMatch?.[1] as ProjectFramework | undefined,
                files,
                directories: [],
                dependencies: {},
                devDependencies: {},
                scripts: {},
              };
            }
            throw new Error("Agent did not return valid JSON with files array");
          }
        } else {
          throw new Error("Agent did not return valid JSON with files array");
        }
      }
    }

    if (!Array.isArray(parsed.files)) {
      throw new Error("Response missing files array");
    }

    const files: GeneratedFile[] = parsed.files
      .filter((f: any) => f && f.filePath && typeof f.content === "string")
      .map((f: Record<string, string>) => ({
        filePath: f.filePath,
        content: f.content,
        fileType: f.fileType || f.filePath.split(".").pop() || "txt",
      }));

    return {
      framework: parsed.framework as ProjectFramework | undefined,
      files,
      directories: parsed.directories,
      dependencies: parsed.dependencies,
      devDependencies: parsed.devDependencies,
      scripts: parsed.scripts,
    };
  }
}
