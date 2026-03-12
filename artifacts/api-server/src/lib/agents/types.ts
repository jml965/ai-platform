export type AgentType = "codegen" | "reviewer" | "fixer" | "filemanager" | "qa_pipeline" | "package_runner";

export type BuildStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed";

export interface AgentResult {
  success: boolean;
  tokensUsed: number;
  durationMs: number;
  data?: Record<string, unknown>;
  error?: string;
}

export interface GeneratedFile {
  filePath: string;
  content: string;
  fileType: string;
}

export interface CodeReviewResult {
  approved: boolean;
  issues: CodeIssue[];
  suggestions: string[];
}

export interface CodeIssue {
  file: string;
  line?: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface BuildContext {
  buildId: string;
  projectId: string;
  userId: string;
  prompt: string;
  existingFiles: { filePath: string; content: string }[];
  tokensUsedSoFar: number;
}
