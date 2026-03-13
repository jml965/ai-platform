import { BaseAgent, type ModelConfig } from "./base-agent";
import { type AgentConstitution, getConstitution } from "./constitution";
import type { AgentResult, AgentType, BuildContext } from "./types";

export interface SeoCheckItem {
  category: "title" | "description" | "keywords" | "headings" | "images" | "links" | "mobile" | "performance" | "structured_data" | "social" | "accessibility";
  name: string;
  nameAr: string;
  passed: boolean;
  severity: "error" | "warning" | "info";
  message: string;
  messageAr: string;
  suggestion?: string;
  suggestionAr?: string;
  currentValue?: string;
  suggestedValue?: string;
}

export interface SeoAnalysisResult {
  score: number;
  checks: SeoCheckItem[];
  summary: string;
  summaryAr: string;
  metaSuggestions: {
    title?: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };
}

export class SeoAgent extends BaseAgent {
  readonly agentType: AgentType = "codegen";
  readonly modelConfig: ModelConfig = {
    provider: "openai",
    model: "gpt-4o-mini",
  };

  readonly systemPrompt = `You are an expert SEO analyst. You analyze HTML websites and provide comprehensive SEO audits.

You MUST respond with valid JSON only. No markdown, no explanation, just JSON.

Analyze the provided HTML and return a JSON object with this exact structure:
{
  "score": <number 0-100>,
  "checks": [
    {
      "category": "<title|description|keywords|headings|images|links|mobile|performance|structured_data|social|accessibility>",
      "name": "<check name in English>",
      "nameAr": "<check name in Arabic>",
      "passed": <boolean>,
      "severity": "<error|warning|info>",
      "message": "<detailed finding in English>",
      "messageAr": "<detailed finding in Arabic>",
      "suggestion": "<improvement suggestion in English>",
      "suggestionAr": "<improvement suggestion in Arabic>",
      "currentValue": "<current value if applicable>",
      "suggestedValue": "<suggested value if applicable>"
    }
  ],
  "summary": "<2-3 sentence summary in English>",
  "summaryAr": "<2-3 sentence summary in Arabic>",
  "metaSuggestions": {
    "title": "<suggested meta title or null>",
    "description": "<suggested meta description or null>",
    "keywords": "<suggested keywords or null>",
    "ogTitle": "<suggested og:title or null>",
    "ogDescription": "<suggested og:description or null>",
    "ogImage": "<suggested og:image or null>"
  }
}

Check these SEO aspects:
1. Title tag: exists, length (50-60 chars ideal), contains keywords
2. Meta description: exists, length (150-160 chars ideal), compelling
3. Keywords: relevant meta keywords, keyword density
4. Headings: H1 exists (only one), proper heading hierarchy (H1>H2>H3)
5. Images: alt attributes, file sizes, lazy loading
6. Links: internal/external links, broken href, descriptive anchor text
7. Mobile: viewport meta tag, responsive design indicators
8. Performance: excessive inline styles, render-blocking resources, image optimization
9. Structured data: schema.org markup, JSON-LD
10. Social: Open Graph tags, Twitter cards
11. Accessibility: lang attribute, semantic HTML, ARIA labels

Score calculation:
- Each failed "error" check: -10 points
- Each failed "warning" check: -5 points
- Each failed "info" check: -2 points
- Start from 100 and subtract

Be thorough but practical. Focus on actionable improvements.`;

  constructor(constitution?: AgentConstitution) {
    super(constitution || getConstitution());
  }

  async execute(context: BuildContext): Promise<AgentResult> {
    const start = Date.now();

    const htmlFiles = context.existingFiles.filter(
      (f) => f.filePath.endsWith(".html") || f.filePath.endsWith(".htm")
    );

    if (htmlFiles.length === 0) {
      return {
        success: false,
        tokensUsed: 0,
        durationMs: Date.now() - start,
        error: "No HTML files found in the project",
      };
    }

    const htmlContent = htmlFiles
      .map((f) => `--- File: ${f.filePath} ---\n${f.content}`)
      .join("\n\n");

    const cssFiles = context.existingFiles.filter(
      (f) => f.filePath.endsWith(".css")
    );
    const cssInfo = cssFiles.length > 0
      ? `\n\nCSS Files found: ${cssFiles.map((f) => f.filePath).join(", ")}\nCSS contains media queries: ${cssFiles.some((f) => f.content.includes("@media"))}`
      : "";

    const jsFiles = context.existingFiles.filter(
      (f) => f.filePath.endsWith(".js") || f.filePath.endsWith(".ts")
    );
    const jsInfo = jsFiles.length > 0
      ? `\nJS/TS Files: ${jsFiles.map((f) => f.filePath).join(", ")}`
      : "";

    try {
      const { content, tokensUsed } = await this.callLLM(
        [
          { role: "system", content: this.systemPrompt },
          {
            role: "user",
            content: `Analyze the following website for SEO:\n\n${htmlContent}${cssInfo}${jsInfo}`,
          },
        ],
        context
      );

      const cleaned = content
        .replace(/```json\s*/g, "")
        .replace(/```\s*/g, "")
        .trim();

      const result: SeoAnalysisResult = JSON.parse(cleaned);

      result.score = Math.max(0, Math.min(100, Math.round(result.score)));

      return {
        success: true,
        tokensUsed,
        durationMs: Date.now() - start,
        data: { analysis: result },
      };
    } catch (error) {
      return {
        success: false,
        tokensUsed: 0,
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : "SEO analysis failed",
      };
    }
  }

  async generateFixedHtml(
    html: string,
    metaSuggestions: SeoAnalysisResult["metaSuggestions"],
    context: BuildContext
  ): Promise<{ content: string; tokensUsed: number }> {
    const fixPrompt = `You are an HTML optimizer. Apply the following meta tag improvements to the HTML.
Return ONLY the complete modified HTML, nothing else.

Meta tag suggestions to apply:
${metaSuggestions.title ? `- Title: "${metaSuggestions.title}"` : ""}
${metaSuggestions.description ? `- Meta Description: "${metaSuggestions.description}"` : ""}
${metaSuggestions.keywords ? `- Meta Keywords: "${metaSuggestions.keywords}"` : ""}
${metaSuggestions.ogTitle ? `- og:title: "${metaSuggestions.ogTitle}"` : ""}
${metaSuggestions.ogDescription ? `- og:description: "${metaSuggestions.ogDescription}"` : ""}
${metaSuggestions.ogImage ? `- og:image: "${metaSuggestions.ogImage}"` : ""}

Rules:
- If a meta tag already exists, update its content
- If it doesn't exist, add it in the <head> section
- Add viewport meta tag if missing: <meta name="viewport" content="width=device-width, initial-scale=1.0">
- Add charset if missing: <meta charset="UTF-8">
- Preserve all existing HTML structure and content
- Add Open Graph tags if suggested
- Return ONLY valid HTML`;

    return this.callLLM(
      [
        { role: "system", content: fixPrompt },
        { role: "user", content: html },
      ],
      context
    );
  }
}
