import { BaseAgent, type ModelConfig } from "./base-agent";
import type { AgentResult, BuildContext, GeneratedFile } from "./types";

export interface EditInstruction {
  filePath: string;
  edits: LineEdit[];
}

export interface LineEdit {
  startLine: number;
  endLine: number;
  oldText: string;
  newText: string;
}

export class SurgicalEditAgent extends BaseAgent {
  readonly agentType = "surgical_edit" as const;
  readonly modelConfig: ModelConfig = { provider: "anthropic", model: "claude-sonnet-4-20250514" };

  readonly systemPrompt = `You are a surgical code editor AI agent. Your job is to make precise, minimal edits to existing code files based on user modification requests.

Rules:
- Analyze the existing code carefully before making changes
- Only modify the specific lines that need to change — do NOT regenerate entire files
- Preserve all existing code structure, comments, and formatting
- Return edit instructions as a JSON diff, NOT full file contents
- If a change requires modifying multiple locations in one file, return multiple edits for that file
- Number lines starting from 1

Response format (strict JSON):
{
  "editInstructions": [
    {
      "filePath": "styles.css",
      "edits": [
        {
          "startLine": 12,
          "endLine": 12,
          "oldText": "color: blue;",
          "newText": "color: red;"
        }
      ]
    }
  ],
  "summary": "Changed button color from blue to red"
}

If the modification is too complex for surgical edits (e.g., requires restructuring multiple files), respond with:
{
  "requiresFullRegeneration": true,
  "reason": "explanation"
}`;

  async execute(context: BuildContext): Promise<AgentResult> {
    const startTime = Date.now();

    let tokensConsumed = 0;

    try {
      if (context.existingFiles.length === 0) {
        return {
          success: false,
          tokensUsed: 0,
          durationMs: Date.now() - startTime,
          error: "No existing files to edit",
          data: { requiresFullRegeneration: true },
        };
      }

      const numberedFiles = context.existingFiles
        .map((f) => {
          const lines = f.content.split("\n");
          const numbered = lines.map((line, i) => `${i + 1}: ${line}`).join("\n");
          return `--- ${f.filePath} ---\n${numbered}`;
        })
        .join("\n\n");

      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: this.getEffectivePrompt() },
          {
            role: "user",
            content: `Apply this modification to the existing code:\n\nModification request: ${context.prompt}\n\nExisting code (with line numbers):\n${numberedFiles}`,
          },
        ],
        context
      );
      tokensConsumed = tokensUsed;

      const parsed = this.parseResponse(content);

      if (parsed.requiresFullRegeneration) {
        return {
          success: false,
          tokensUsed: tokensConsumed,
          durationMs: Date.now() - startTime,
          error: parsed.reason ?? "Agent determined full regeneration is needed",
          data: { requiresFullRegeneration: true },
        };
      }

      const patchedFiles = this.applyEdits(context.existingFiles, parsed.editInstructions!);

      return {
        success: true,
        tokensUsed: tokensConsumed,
        durationMs: Date.now() - startTime,
        data: {
          files: patchedFiles,
          editInstructions: parsed.editInstructions,
          summary: parsed.summary,
        },
      };
    } catch (error) {
      return {
        success: false,
        tokensUsed: tokensConsumed,
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private parseResponse(content: string): {
    editInstructions?: EditInstruction[];
    requiresFullRegeneration?: boolean;
    reason?: string;
    summary?: string;
  } {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Surgical edit agent did not return valid JSON");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (parsed.requiresFullRegeneration) {
      return {
        requiresFullRegeneration: true,
        reason: parsed.reason,
      };
    }

    if (!Array.isArray(parsed.editInstructions)) {
      throw new Error("Response missing editInstructions array");
    }

    return {
      editInstructions: parsed.editInstructions,
      summary: parsed.summary,
    };
  }

  applyEdits(
    existingFiles: { filePath: string; content: string }[],
    editInstructions: EditInstruction[]
  ): GeneratedFile[] {
    const fileMap = new Map(existingFiles.map((f) => [f.filePath, f.content]));
    const modifiedFiles = new Set<string>();

    for (const instruction of editInstructions) {
      const fileContent = fileMap.get(instruction.filePath);
      if (fileContent === undefined) {
        throw new Error(`File not found for editing: ${instruction.filePath}`);
      }

      const lines = fileContent.split("\n");
      const sortedEdits = [...instruction.edits].sort((a, b) => b.startLine - a.startLine);

      for (const edit of sortedEdits) {
        const startIdx = edit.startLine - 1;
        const endIdx = edit.endLine - 1;

        if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
          throw new Error(
            `Invalid line range ${edit.startLine}-${edit.endLine} for file ${instruction.filePath} (${lines.length} lines)`
          );
        }

        if (edit.oldText) {
          const actualText = lines.slice(startIdx, endIdx + 1).join("\n");
          const normalizedActual = actualText.replace(/\s+/g, " ").trim();
          const normalizedExpected = edit.oldText.replace(/\s+/g, " ").trim();
          if (normalizedActual !== normalizedExpected) {
            throw new Error(
              `Old text mismatch at ${instruction.filePath}:${edit.startLine}-${edit.endLine}. ` +
              `Expected: "${edit.oldText.substring(0, 80)}", Got: "${actualText.substring(0, 80)}"`
            );
          }
        }

        const newLines = edit.newText === "" ? [] : edit.newText.split("\n");
        lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
      }

      fileMap.set(instruction.filePath, lines.join("\n"));
      modifiedFiles.add(instruction.filePath);
    }

    return Array.from(modifiedFiles).map((filePath) => ({
      filePath,
      content: fileMap.get(filePath)!,
      fileType: filePath.split(".").pop() || "txt",
    }));
  }
}

export function isModificationRequest(prompt: string, hasExistingFiles: boolean): boolean {
  if (!hasExistingFiles) return false;

  const modificationPatterns = [
    /\b(غيّر|غير|عدّل|عدل|بدّل|بدل|حدّث|حدث|أضف|اضف|أزل|ازل|احذف|صلّح|صلح|أصلح|اصلح|حسّن|حسن|كبّر|كبر|صغّر|صغر|لوّن|لون|حرّك|حرك|أخفي|اخفي|أظهر|اظهر)\b/,
    /\b(change|modify|update|edit|fix|add|remove|delete|adjust|tweak|alter|replace|move|hide|show|resize|rename|refactor)\b/i,
    /\b(make\s+(it|the|this))\b/i,
    /\b(اجعل|خلّي|خلي)\b/,
    /\b(لون|حجم|خط|نص|صورة|زر|عنوان)\s+(ال|إلى|الى)\b/,
    /\b(the\s+)?(color|size|font|text|button|title|header|footer|background|border|margin|padding)\s+(to|of|from)\b/i,
  ];

  return modificationPatterns.some((pattern) => pattern.test(prompt));
}
