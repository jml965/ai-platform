export interface AgentConstitution {
  maxTokensPerCall: number;
  maxRetriesPerTask: number;
  maxTotalTokensPerBuild: number;
  allowedFileExtensions: string[];
  maxFileSizeBytes: number;
  maxFilesPerProject: number;
  allowedDirectoryDepth: number;
  codeQualityRules: CodeQualityRules;
}

export interface CodeQualityRules {
  requireTypeAnnotations: boolean;
  requireErrorHandling: boolean;
  requireResponsiveDesign: boolean;
  requireAccessibility: boolean;
  requireEnvironmentVariables: boolean;
  maxComponentLines: number;
  maxFunctionLines: number;
}

const DEFAULT_CODE_QUALITY_RULES: CodeQualityRules = {
  requireTypeAnnotations: true,
  requireErrorHandling: true,
  requireResponsiveDesign: true,
  requireAccessibility: true,
  requireEnvironmentVariables: true,
  maxComponentLines: 300,
  maxFunctionLines: 50,
};

const DEFAULT_CONSTITUTION: AgentConstitution = {
  maxTokensPerCall: 32000,
  maxRetriesPerTask: 3,
  maxTotalTokensPerBuild: 500000,
  allowedFileExtensions: [
    ".html", ".css", ".js", ".ts", ".tsx", ".jsx",
    ".json", ".svg", ".md", ".txt",
    ".py", ".yaml", ".yml", ".toml", ".cfg", ".ini",
    ".env", ".gitignore", ".dockerignore",
    ".mjs", ".cjs",
  ],
  maxFileSizeBytes: 512 * 1024,
  maxFilesPerProject: 100,
  allowedDirectoryDepth: 8,
  codeQualityRules: DEFAULT_CODE_QUALITY_RULES,
};

export function getConstitution(): AgentConstitution {
  return { ...DEFAULT_CONSTITUTION, codeQualityRules: { ...DEFAULT_CODE_QUALITY_RULES } };
}

export function validateFilePath(filePath: string, projectId: string, maxDepth?: number): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  if (normalized.startsWith("/")) return false;

  const depth = normalized.split("/").length;
  if (depth > (maxDepth ?? DEFAULT_CONSTITUTION.allowedDirectoryDepth)) return false;

  return true;
}

export function validateDirectoryPath(dirPath: string, maxDepth?: number): boolean {
  const normalized = dirPath.replace(/\\/g, "/");
  if (normalized.includes("..")) return false;
  if (normalized.startsWith("/")) return false;

  const depth = normalized.split("/").length;
  if (depth > (maxDepth ?? DEFAULT_CONSTITUTION.allowedDirectoryDepth)) return false;

  const invalidChars = /[<>:"|?*]/;
  if (invalidChars.test(normalized)) return false;

  return true;
}

export function validateFileExtension(filePath: string, constitution: AgentConstitution): boolean {
  const ext = filePath.substring(filePath.lastIndexOf("."));
  return constitution.allowedFileExtensions.includes(ext.toLowerCase());
}

export function checkTokenBudget(
  tokensUsed: number,
  constitution: AgentConstitution
): { allowed: boolean; remaining: number } {
  const remaining = constitution.maxTotalTokensPerBuild - tokensUsed;
  return { allowed: remaining > 0, remaining: Math.max(0, remaining) };
}

export function getCodeQualityPrompt(rules: CodeQualityRules): string {
  const lines: string[] = ["Code Quality Requirements:"];

  if (rules.requireTypeAnnotations) {
    lines.push("- Use TypeScript with proper type annotations for all function parameters and return types");
  }
  if (rules.requireErrorHandling) {
    lines.push("- Include proper error handling with try/catch blocks and meaningful error messages");
  }
  if (rules.requireResponsiveDesign) {
    lines.push("- Use responsive CSS with mobile-first approach, support all screen sizes");
  }
  if (rules.requireAccessibility) {
    lines.push("- Follow WCAG accessibility guidelines: semantic HTML, ARIA labels, keyboard navigation");
  }
  if (rules.requireEnvironmentVariables) {
    lines.push("- Use environment variables for configuration (ports, API URLs, secrets) — never hardcode");
  }
  lines.push(`- Keep components under ${rules.maxComponentLines} lines; extract sub-components when needed`);
  lines.push(`- Keep functions under ${rules.maxFunctionLines} lines; break down complex logic`);

  return lines.join("\n");
}
