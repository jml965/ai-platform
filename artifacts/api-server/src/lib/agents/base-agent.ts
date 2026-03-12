import { openai } from "@workspace/integrations-openai-ai-server";
import { AgentConstitution, checkTokenBudget } from "./constitution";
import type { AgentResult, AgentType, BuildContext } from "./types";

export abstract class BaseAgent {
  abstract readonly agentType: AgentType;
  abstract readonly systemPrompt: string;

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

    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: maxCompletion,
      messages,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const usage = response.usage;
    const tokensUsed = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);

    return { content, tokensUsed };
  }

  abstract execute(context: BuildContext): Promise<AgentResult>;
}
