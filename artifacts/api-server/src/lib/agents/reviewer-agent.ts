import { BaseAgent, type ModelConfig } from "./base-agent";
import type { AgentResult, BuildContext, CodeReviewResult } from "./types";

export class ReviewerAgent extends BaseAgent {
  readonly agentType = "reviewer" as const;
  readonly modelConfig: ModelConfig = { provider: "anthropic", model: "claude-sonnet-4-20250514" };

  readonly systemPrompt = `You are a senior code reviewer AI agent. Your job is to review generated website code for quality, security, accessibility, and best practices.

Review criteria:
- Valid HTML5 structure
- No XSS vulnerabilities (no inline event handlers with user data, no eval)
- Proper CSS organization and responsive design
- Accessibility (ARIA labels, semantic HTML, color contrast)
- RTL support where applicable
- No hardcoded sensitive data
- Clean, maintainable code structure

Response format (strict JSON):
{
  "approved": true/false,
  "issues": [
    { "file": "index.html", "line": 10, "severity": "error|warning|info", "message": "..." }
  ],
  "suggestions": ["..."]
}`;

  async execute(context: BuildContext): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const filesContent = context.existingFiles
        .map((f) => `--- ${f.filePath} ---\n${f.content}`)
        .join("\n\n");

      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: this.getEffectivePrompt() },
          {
            role: "user",
            content: `Review the following website code:\n\n${filesContent}`,
          },
        ],
        context
      );

      const review = this.parseResponse(content);

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        data: { review },
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

  private parseResponse(content: string): CodeReviewResult {
    const jsonMatch = content.match(/\{[\s\S]*"approved"[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        approved: false,
        issues: [{ file: "unknown", severity: "error" as const, message: "Reviewer failed to produce structured output" }],
        suggestions: [],
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        approved: Boolean(parsed.approved),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      };
    } catch {
      return {
        approved: false,
        issues: [{ file: "unknown", severity: "error" as const, message: "Reviewer output was not valid JSON" }],
        suggestions: [],
      };
    }
  }
}
