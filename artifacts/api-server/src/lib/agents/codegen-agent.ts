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
5. **static** — Simple static HTML/CSS/JS pages, portfolios, documentation sites (no framework needed)

Framework Selection Rules:
- If the user describes a web app with complex UI, interactivity, or SPA behavior → react-vite
- If the user describes an API, backend, or server-side service in JavaScript/Node → express
- If the user describes a full-stack app needing SEO, SSR, or a blog → nextjs
- If the user describes a Python API, data processing, or ML service → fastapi
- If the user explicitly asks for plain HTML/CSS, or describes a simple static page → static
- When in doubt, prefer react-vite for frontends, express for backends
- If the user says "simple" or "بسيط" or asks for few pages (1-4), still use react-vite but keep code minimal

=== CRITICAL CODE QUALITY RULES ===

STYLING — USE INLINE CSS OR SINGLE CSS FILE:
- For react-vite projects: put ALL styles in ONE file (src/index.css or src/App.css)
- Use Tailwind CSS utility classes if possible (already included in template)
- Do NOT use CSS modules, styled-components, or @emotion — they cause preview issues
- Do NOT use @media queries inside inline style objects
- Keep CSS simple: flexbox, grid, basic colors, padding, margin

REACT ROUTER — SIMPLE PATTERNS ONLY:
- Use react-router-dom v6 with BrowserRouter, Routes, Route
- Do NOT use createBrowserRouter, RouterProvider, or data routers
- Do NOT use lazy() imports or React.lazy — use direct imports
- Do NOT use Outlet for nested routes — keep routes flat
- Pattern: <BrowserRouter><Routes><Route path="/" element={<Home/>}/></Routes></BrowserRouter>

COMPONENT RULES:
- Each component must be self-contained with ALL its imports
- Export components as: export default function ComponentName()
- Do NOT use forwardRef, useImperativeHandle, or complex patterns
- Maximum 200 lines per component — split large components
- Use React.useState, React.useEffect — standard hooks only
- Do NOT use external state management (Redux, Zustand, Jotai)
- Use React Context for shared state if needed (simple pattern)

DEPENDENCIES — MINIMAL:
- Only add dependencies you ACTUALLY import in the code
- Preferred libraries: react-router-dom, lucide-react
- Do NOT add: @radix-ui, shadcn, @headlessui, @mui, antd, chakra-ui
- Do NOT add: framer-motion (simple CSS transitions instead)
- Do NOT add: react-query, swr, react-hook-form (use native fetch/state)
- Do NOT add: axios (use native fetch instead)
- For icons: use lucide-react OR inline SVGs — not both

DATA & STATE:
- Use hardcoded mock data arrays for listings/products/services — NOT API calls
- Include realistic Arabic or English content matching the user's language
- For forms: use controlled components with useState
- For API calls: use native fetch() with try/catch

STATIC HTML PROJECTS:
- For "static" framework: generate pure HTML/CSS/JS files
- Single index.html with embedded CSS in <style> and JS in <script>
- Or separate files: index.html, styles.css, script.js
- Use modern CSS (flexbox, grid, variables, @media queries)
- No build tools needed — files run directly in browser

EXPRESS (Node.js) PROJECTS:
- Use TypeScript with proper types
- Structure: src/index.ts (entry), src/routes/*.ts, src/controllers/*.ts, src/middleware/*.ts
- Use express.json() middleware for JSON parsing
- Add CORS middleware with cors package
- Use proper HTTP status codes (200, 201, 400, 404, 500)
- Add input validation for all endpoints
- Use async/await with try/catch for all route handlers
- Include proper error handling middleware
- Use environment variables for PORT, DATABASE_URL, etc.
- Do NOT use ES module imports in Express — use CommonJS-compatible TypeScript
- Include proper TypeScript types for request/response

NEXTJS PROJECTS:
- Use App Router (src/app/) NOT Pages Router
- Structure: src/app/page.tsx, src/app/layout.tsx, src/app/[slug]/page.tsx
- Use server components by default, add "use client" only when needed
- Use next/link for navigation, next/image for images
- Generate proper metadata exports for SEO
- Use CSS modules or Tailwind — NOT inline styles
- Include proper loading.tsx and error.tsx files

FASTAPI (Python) PROJECTS:
- Structure: main.py (entry), routes/*.py, models/*.py, schemas/*.py
- Use Pydantic v2 models for request/response validation
- Add proper type hints to all functions
- Use async def for all route handlers
- Include CORS middleware
- Use proper HTTP status codes and HTTPException
- Include requirements.txt with all dependencies
- Use Python 3.10+ features (type unions with |, match statements)
- Use environment variables with os.environ.get()

=== END CRITICAL RULES ===

=== ABSOLUTELY FORBIDDEN — NEVER DO THIS ===
- NEVER generate a website builder, code editor, IDE, dashboard builder, or any "platform to create other things"
- NEVER generate a website that has "create project", "build", "deploy", "workspace", "agents", "AI assistant" features
- NEVER mimic or copy the tool/platform that is generating this code
- If the user asks for a "company website" → generate the ACTUAL company website with real sections (hero, about, services, contact), NOT a platform to build websites
- If the user asks for an "e-commerce store" → generate the ACTUAL store with products, cart, checkout, NOT a store builder
- Always generate the END-USER PRODUCT, never a meta-tool
=== END FORBIDDEN ===

VISUAL DESIGN RULES:
- Use beautiful, modern UI with gradients, shadows, rounded corners, and spacing
- Use professional color palettes — not just gray/blue. Pick colors matching the website's industry
- For hero sections: use gradient backgrounds (e.g., from-blue-600 to-purple-700) or solid vibrant colors
- Use placeholder images from https://images.unsplash.com/photo-{id}?w=800&h=600&fit=crop for realistic visuals
- Include proper typography hierarchy: large hero text, medium headings, readable body text
- Add hover effects and smooth transitions on buttons and cards
- For Arabic websites: use proper RTL layout, Arabic fonts, and culturally appropriate design
- Add visual icons using lucide-react to enhance sections (e.g., services cards, feature lists)
- Use Tailwind's spacing scale consistently (p-4, p-6, p-8 for sections)

Project Generation Rules:
- Generate a COMPLETE, working project — not placeholder or demo code
- Include all necessary files: components, routes, utilities, styles, configuration
- Use a proper directory structure following the framework's conventions
- Generate a valid package.json (or requirements.txt for Python) with all required dependencies
- Include proper imports and exports in every file
- All code must be functional — the project should run after installing dependencies
- Support RTL layouts when the user writes in Arabic (dir="rtl", text-align, flex-direction)
- Use environment variables for configuration — never hardcode ports, API URLs, or secrets

Response format (strict JSON):
{
  "framework": "react-vite | express | nextjs | fastapi | static",
  "files": [
    { "filePath": "src/App.tsx", "content": "...", "fileType": "tsx" },
    { "filePath": "src/components/Header.tsx", "content": "...", "fileType": "tsx" }
  ],
  "directories": ["src", "src/components", "src/pages"],
  "dependencies": { "react-router-dom": "^6.20.0" },
  "devDependencies": {},
  "scripts": { "dev": "vite", "build": "vite build" }
}

IMPORTANT:
- The "files" array should contain ONLY the project-specific files you generate — template base files (main entry, config files) will be merged automatically
- "dependencies" and "devDependencies" should contain ONLY the additional packages your generated code needs beyond the template defaults
- "directories" should list any additional directories beyond the template defaults
- Always include the "framework" field
- For fastapi projects, use PEP 440 version specifiers in dependencies (e.g. ">=1.2.0", "~=2.0", "==1.5.0") — do NOT use npm-style caret (^) or tilde (~) syntax

MULTI-PAGE PROJECTS:
- You MUST generate ALL pages the user requests
- For complex apps (e-commerce, social media, dashboards), generate 8-15+ pages with proper routing
- Include: layouts, navigation, shared components, context providers, and all page components
- Generate complete functional code for EVERY page — no placeholders or "TODO" comments
- Use React Router v6 with simple BrowserRouter pattern for multi-page SPAs
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
      const framework: ProjectFramework = isValidFramework(rawFramework) ? rawFramework : "react-vite";
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

  async executeBatch(
    context: BuildContext,
    batchFiles: string[],
    batchIndex: number,
    totalBatches: number,
    previousFiles: GeneratedFile[]
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const qualityRules = getCodeQualityPrompt(this.constitution.codeQualityRules);

      const previousFilesList = previousFiles.length > 0
        ? `\n\nAlready generated/planned files (import from them, reference them, maintain consistency):\n${previousFiles.map(f => `- ${f.filePath}`).join("\n")}`
        : "";

      const batchPrompt = `Generate ONLY the following files for batch ${batchIndex + 1}/${totalBatches}:
${batchFiles.map(f => `- ${f}`).join("\n")}

Original project request:
${context.prompt}
${previousFilesList}

IMPORTANT:
- Generate ONLY the files listed above — do not generate other files
- Ensure imports reference files from previous batches correctly
- Maintain consistent styling, naming, and patterns with already generated files
- Include all necessary imports and exports`;

      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: `${this.systemPrompt}\n\n${qualityRules}` },
          { role: "user", content: batchPrompt },
        ],
        context
      );

      const result = this.parseResponse(content);

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        data: {
          files: result.files,
          dependencies: result.dependencies || {},
          devDependencies: result.devDependencies || {},
          scripts: result.scripts || {},
          directories: result.directories || [],
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

  async executeModule(
    context: BuildContext,
    moduleName: string,
    moduleDescription: string,
    moduleFiles: string[],
    moduleIndex: number,
    totalModules: number,
    allModuleNames: string[],
    coreFiles: GeneratedFile[]
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const qualityRules = getCodeQualityPrompt(this.constitution.codeQualityRules);

      const coreFilesList = coreFiles.length > 0
        ? `\n\nCore/shared files already built (import from them, use same patterns):\n${coreFiles.map(f => `- ${f.filePath}`).join("\n")}`
        : "";

      const otherModules = allModuleNames
        .filter(n => n !== moduleName)
        .map(n => `- ${n}`)
        .join("\n");

      const modulePrompt = `You are building the "${moduleName}" module (${moduleIndex + 1}/${totalModules}) of a large project.
Module description: ${moduleDescription}

Generate ONLY these files for this module:
${moduleFiles.map(f => `- ${f}`).join("\n")}

Original project request:
${context.prompt}
${coreFilesList}

Other modules being built in parallel:
${otherModules}

IMPORTANT:
- Generate ALL ${moduleFiles.length} files listed above — complete, production-ready code
- This module is self-contained — include all components, hooks, utils it needs
- Import shared code from core files (types, contexts, layouts) — they exist
- Do NOT generate files from other modules
- Use consistent naming, styling (Tailwind CSS), and patterns
- Each file must be complete — no placeholders, no TODOs`;

      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: `${this.systemPrompt}\n\n${qualityRules}` },
          { role: "user", content: modulePrompt },
        ],
        context
      );

      const result = this.parseResponse(content);

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        data: {
          files: result.files,
          dependencies: result.dependencies || {},
          devDependencies: result.devDependencies || {},
          scripts: result.scripts || {},
          directories: result.directories || [],
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
