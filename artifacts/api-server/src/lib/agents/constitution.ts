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
  maxTokensPerCall: 64000,
  maxRetriesPerTask: 3,
  maxTotalTokensPerBuild: 20000000,
  allowedFileExtensions: [
    ".html", ".css", ".js", ".ts", ".tsx", ".jsx",
    ".json", ".svg", ".md", ".txt", ".xml",
    ".py", ".yaml", ".yml", ".toml", ".cfg", ".ini",
    ".env", ".gitignore", ".dockerignore",
    ".mjs", ".cjs", ".map",
    ".example", ".sample", ".template",
    ".sh", ".bash",
    ".prisma", ".graphql", ".gql",
    ".woff", ".woff2", ".ttf", ".eot",
    ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp",
  ],
  maxFileSizeBytes: 512 * 1024,
  maxFilesPerProject: 600,
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
  const fileName = filePath.split("/").pop() || filePath;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0) {
    return constitution.allowedFileExtensions.includes("." + fileName.toLowerCase());
  }
  const ext = fileName.substring(dotIndex).toLowerCase();
  if (constitution.allowedFileExtensions.includes(ext)) return true;
  const firstDotIndex = fileName.indexOf(".");
  if (firstDotIndex !== dotIndex) {
    const firstExt = fileName.substring(firstDotIndex).toLowerCase();
    const parts = firstExt.split(".");
    return parts.some((_part, i) => {
      if (i === 0) return false;
      const subExt = "." + parts.slice(i).join(".");
      return constitution.allowedFileExtensions.includes(subExt);
    });
  }
  return false;
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
