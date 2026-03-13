import { BaseAgent, type ModelConfig } from "./base-agent";
import type { AgentResult, BuildContext } from "./types";

interface TranslationRequest {
  sourceLanguage: string;
  targetLanguage: string;
  contentEntries: { key: string; text: string }[];
  websiteContext?: string;
}

export class TranslationAgent extends BaseAgent {
  readonly agentType = "translator" as const;
  readonly modelConfig: ModelConfig = { provider: "openai", model: "gpt-4o-mini" };

  readonly systemPrompt = `You are a professional website content translator AI. Your job is to translate website content from one language to another while preserving:

1. HTML tags and attributes (do NOT translate attribute values like class names, ids, or URLs)
2. Brand names and proper nouns (keep them as-is unless there's a well-known localized version)
3. Technical terms that are commonly used in their original form
4. Formatting, punctuation style appropriate for the target language
5. Cultural context — adapt idioms and expressions naturally
6. For RTL languages (Arabic, Hebrew, Persian, Urdu): ensure text reads naturally in RTL direction

Translation Quality Rules:
- Maintain the same tone and style as the original
- Use natural, fluent expressions in the target language — avoid literal word-for-word translation
- Preserve placeholder variables like {{name}}, {count}, etc.
- Keep code snippets, URLs, and email addresses unchanged
- For UI elements (buttons, labels, menus), use conventional translations used in software localization

Response format (strict JSON):
{
  "translations": [
    { "key": "content_key_here", "translatedText": "translated content here" }
  ]
}

IMPORTANT: Return ONLY valid JSON. Do not include any explanation or markdown.`;

  async execute(context: BuildContext): Promise<AgentResult> {
    const startTime = Date.now();
    try {
      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: this.systemPrompt },
          { role: "user", content: context.prompt },
        ],
        context
      );

      const parsed = this.parseResponse(content);

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - startTime,
        data: { translations: parsed.translations },
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

  async translateContent(
    request: TranslationRequest,
    buildContext: BuildContext
  ): Promise<{ key: string; translatedText: string }[]> {
    const entriesText = request.contentEntries
      .map((e) => `Key: "${e.key}"\nText: "${e.text}"`)
      .join("\n\n");

    const contextInfo = request.websiteContext
      ? `\nWebsite context: ${request.websiteContext}`
      : "";

    const prompt = `Translate the following content from ${request.sourceLanguage} to ${request.targetLanguage}.${contextInfo}

Content to translate:
${entriesText}`;

    const { content, tokensUsed } = await this.callLLM(
      [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: prompt },
      ],
      buildContext
    );

    const parsed = this.parseResponse(content);
    return parsed.translations;
  }

  private parseResponse(content: string): {
    translations: { key: string; translatedText: string }[];
  } {
    const jsonMatch = content.match(/\{[\s\S]*"translations"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Translation agent did not return valid JSON with translations array");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.translations)) {
      throw new Error("Response missing translations array");
    }

    return {
      translations: parsed.translations.map((t: Record<string, string>) => ({
        key: t.key,
        translatedText: t.translatedText,
      })),
    };
  }
}
