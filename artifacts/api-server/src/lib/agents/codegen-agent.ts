import { BaseAgent, type ModelConfig } from "./base-agent";
import type { AgentResult, BuildContext, GeneratedFile } from "./types";

export class CodeGenAgent extends BaseAgent {
  readonly agentType = "codegen" as const;
  readonly modelConfig: ModelConfig = { provider: "anthropic", model: "claude-sonnet-4-5" };

  readonly systemPrompt = `You are a senior web developer AI agent. Your job is to generate clean, production-ready website code based on user descriptions.

Rules:
- Generate complete, working HTML/CSS/JS files
- Use modern, semantic HTML5
- Use responsive CSS with mobile-first approach
- Support RTL layouts when the user writes in Arabic
- Include proper meta tags, viewport settings
- Use clean, well-structured code
- Return your response as a JSON array of files

Response format (strict JSON):
{
  "files": [
    { "filePath": "index.html", "content": "...", "fileType": "html" },
    { "filePath": "styles.css", "content": "...", "fileType": "css" },
    { "filePath": "script.js", "content": "...", "fileType": "js" }
  ]
}`;

  async execute(context: BuildContext): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      const existingFilesInfo = context.existingFiles.length > 0
        ? `\n\nExisting project files:\n${context.existingFiles.map(f => `- ${f.filePath}`).join("\n")}`
        : "";

      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: this.systemPrompt },
          {
            role: "user",
            content: `Generate a website based on this description:\n\n${context.prompt}${existingFilesInfo}`,
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

  private parseResponse(content: string): GeneratedFile[] {
    const jsonMatch = content.match(/\{[\s\S]*"files"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Agent did not return valid JSON with files array");
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
