import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { AgentConstitution, checkTokenBudget } from "./constitution";
import type { AgentResult, AgentType, BuildContext } from "./types";

export type AIProvider = "openai" | "anthropic";

export interface ModelConfig {
  provider: AIProvider;
  model: string;
}

export abstract class BaseAgent {
  abstract readonly agentType: AgentType;
  abstract readonly systemPrompt: string;
  abstract readonly modelConfig: ModelConfig;

  protected constitution: AgentConstitution;

  constructor(constitution: AgentConstitution) {
    this.constitution = constitution;
  }

  protected async callLLM(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    context: BuildContext
  ): Promise<{ content: string; tokensUsed: number }> {
    const budget = checkTokenBudget(context.tokensUsedSoFar, this.constitution);
    if (!budget.allowed) {
      throw new Error(`Token budget exhausted. Used: ${context.tokensUsedSoFar}, Limit: ${this.constitution.maxTotalTokensPerBuild}`);
    }

    const estimatedPromptTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    if (estimatedPromptTokens > budget.remaining) {
      throw new Error(`Estimated prompt tokens (${estimatedPromptTokens}) exceed remaining budget (${budget.remaining})`);
    }

    const maxCompletion = Math.min(
      this.constitution.maxTokensPerCall,
      Math.max(1024, budget.remaining - estimatedPromptTokens)
    );

    if (this.modelConfig.provider === "anthropic") {
      return this.callAnthropic(messages, maxCompletion);
    }

    return this.callOpenAI(messages, maxCompletion);
  }

  private async callOpenAI(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    maxCompletion: number
  ): Promise<{ content: string; tokensUsed: number }> {
    const response = await openai.chat.completions.create({
      model: this.modelConfig.model,
      max_completion_tokens: maxCompletion,
      messages,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const usage = response.usage;
    const tokensUsed = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);

    return { content, tokensUsed };
  }

  private async callAnthropic(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    maxCompletion: number
  ): Promise<{ content: string; tokensUsed: number }> {
    const systemMessage = messages.find(m => m.role === "system");
    const chatMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const response = await anthropic.messages.create({
      model: this.modelConfig.model,
      max_tokens: maxCompletion,
      system: systemMessage?.content,
      messages: chatMessages,
    });

    const content = response.content
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { type: string; text: string }) => block.text)
      .join("");

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

    return { content, tokensUsed };
  }

  abstract execute(context: BuildContext): Promise<AgentResult>;
}
