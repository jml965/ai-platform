import { BaseAgent, type ModelConfig } from "./base-agent";
import type { AgentResult, BuildContext, CodeIssue, GeneratedFile } from "./types";

export class FixerAgent extends BaseAgent {
  readonly agentType = "fixer" as const;
  readonly modelConfig: ModelConfig = { provider: "anthropic", model: "claude-sonnet-4-5-20241022" };

  readonly systemPrompt = `You are a code fixer AI agent. Your job is to fix issues found during code review. You receive the original code and a list of issues, and you return the corrected files.

Rules:
- Fix all reported issues
- Preserve the original code structure as much as possible
- Do not introduce new issues
- Maintain RTL support if present
- Return only the files that were changed

Response format (strict JSON):
{
  "files": [
    { "filePath": "index.html", "content": "...", "fileType": "html" }
  ],
  "fixesSummary": ["Fixed XSS vulnerability in...", "Added ARIA label to..."]
}`;

  async executeWithIssues(
    context: BuildContext,
    issues: CodeIssue[]
  ): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const filesContent = context.existingFiles
        .map((f) => `--- ${f.filePath} ---\n${f.content}`)
        .join("\n\n");

      const issuesText = issues
        .map(
          (i) =>
            `[${i.severity}] ${i.file}${i.line ? `:${i.line}` : ""}: ${i.message}`
        )
        .join("\n");

      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: this.systemPrompt },
          {
            role: "user",
            content: `Fix the following issues in the code:\n\nIssues:\n${issuesText}\n\nCode:\n${filesContent}`,
          },
        ],
        context
      );

      const files = this.parseResponse(content);

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        data: { files },
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

  async execute(context: BuildContext): Promise<AgentResult> {
    return this.executeWithIssues(context, []);
  }

  private parseResponse(content: string): GeneratedFile[] {
    const jsonMatch = content.match(/\{[\s\S]*"files"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Fixer agent did not return valid JSON with files array");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.files)) {
      throw new Error("Response missing files array");
    }

    return parsed.files.map((f: Record<string, string>) => ({
      filePath: f.filePath,
      content: f.content,
      fileType: f.fileType || f.filePath.split(".").pop() || "txt",
    }));
  }
}
