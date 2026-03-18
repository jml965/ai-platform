import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getOpenAIClient, getAnthropicClient } from "./ai-clients";
import { AgentConstitution, checkTokenBudget } from "./constitution";
import type { AgentResult, AgentType, BuildContext } from "./types";
import { getAgentConfig, updateAgentStats } from "./governor";

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

  private _overrideModel: ModelConfig | null = null;
  private _overridePrompt: string | null = null;
  private _overrideCreativity: number | null = null;
  private _overrideTimeoutSeconds: number | null = null;
  private _overrideMaxTokens: number | null = null;
  private _instructions: string = "";
  private _description: string = "";
  private _permissions: string[] = [];
  private _shortTermMemory: any[] = [];
  private _longTermMemory: any[] = [];
  private _batchSize: number = 10;
  private _sourceFiles: string[] = [];
  private _receivesFrom: string = "";
  private _sendsTo: string = "";
  private _roleOnReceive: string = "";
  private _roleOnSend: string = "";

  constructor(constitution: AgentConstitution) {
    this.constitution = constitution;
  }

  async loadConfigFromDB(): Promise<void> {
    try {
      const config = await getAgentConfig(this.agentType);
      if (config && config.enabled) {
        const pm = config.primaryModel as any;
        if (pm && pm.provider && pm.model && pm.provider !== "local") {
          this._overrideModel = { provider: pm.provider as AIProvider, model: pm.model };
          if (typeof pm.creativity === "number") this._overrideCreativity = pm.creativity;
          if (typeof pm.timeoutSeconds === "number") this._overrideTimeoutSeconds = pm.timeoutSeconds;
          if (typeof pm.maxTokens === "number") this._overrideMaxTokens = pm.maxTokens;
        }
        if (typeof config.creativity === "string" && parseFloat(config.creativity) >= 0) {
          this._overrideCreativity = parseFloat(config.creativity);
        }
        if (typeof config.tokenLimit === "number" && config.tokenLimit > 0) {
          if (this._overrideMaxTokens) {
            this._overrideMaxTokens = Math.min(this._overrideMaxTokens, config.tokenLimit);
          } else {
            this._overrideMaxTokens = config.tokenLimit;
          }
        }
        if (config.systemPrompt && config.systemPrompt.trim().length > 20) {
          this._overridePrompt = config.systemPrompt;
        }
        if (config.instructions && config.instructions.trim().length > 0) {
          this._instructions = config.instructions.trim();
        }
        if (config.description && config.description.trim().length > 0) {
          this._description = config.description.trim();
        }
        if (config.permissions && Array.isArray(config.permissions)) {
          this._permissions = config.permissions;
        }
        if (config.shortTermMemory && Array.isArray(config.shortTermMemory) && config.shortTermMemory.length > 0) {
          this._shortTermMemory = config.shortTermMemory;
        }
        if (config.longTermMemory && Array.isArray(config.longTermMemory) && config.longTermMemory.length > 0) {
          this._longTermMemory = config.longTermMemory;
        }
        if (typeof config.batchSize === "number" && config.batchSize > 0) {
          this._batchSize = config.batchSize;
        }
        if (config.sourceFiles && Array.isArray(config.sourceFiles) && config.sourceFiles.length > 0) {
          this._sourceFiles = config.sourceFiles;
        }
        if (config.receivesFrom) this._receivesFrom = config.receivesFrom;
        if (config.sendsTo) this._sendsTo = config.sendsTo;
        if (config.roleOnReceive) this._roleOnReceive = config.roleOnReceive;
        if (config.roleOnSend) this._roleOnSend = config.roleOnSend;
      }
    } catch (err) {
    }
  }

  protected getEffectiveModel(): ModelConfig {
    return this._overrideModel || this.modelConfig;
  }

  protected getEffectivePrompt(): string {
    let prompt = this._overridePrompt || this.systemPrompt;

    if (this._description) {
      prompt += `\n\nAgent description: ${this._description}`;
    }

    if (this._instructions) {
      prompt += `\n\nAdditional instructions:\n${this._instructions}`;
    }

    if (this._permissions.length > 0) {
      prompt += `\n\nYour permissions: ${this._permissions.join(", ")}. Only perform actions within these permissions.`;
    }

    if (this._roleOnReceive) {
      prompt += `\n\nWhen receiving input: ${this._roleOnReceive}`;
    }

    if (this._roleOnSend) {
      prompt += `\n\nWhen sending output: ${this._roleOnSend}`;
    }

    if (this._shortTermMemory.length > 0) {
      prompt += `\n\nShort-term memory (recent context):\n${JSON.stringify(this._shortTermMemory.slice(-10))}`;
    }

    if (this._longTermMemory.length > 0) {
      prompt += `\n\nLong-term memory (persistent learnings):\n${JSON.stringify(this._longTermMemory.slice(-20))}`;
    }

    return prompt;
  }

  protected getEffectiveCreativity(): number | undefined {
    return this._overrideCreativity ?? undefined;
  }

  protected getEffectiveTimeoutMs(): number {
    if (this._overrideTimeoutSeconds) return this._overrideTimeoutSeconds * 1000;
    return this.defaultTimeoutSeconds * 1000;
  }

  protected get defaultTimeoutSeconds(): number {
    return 600;
  }

  protected getEffectiveMaxTokens(): number | undefined {
    return this._overrideMaxTokens ?? undefined;
  }

  protected getPermissions(): string[] {
    return this._permissions;
  }

  protected hasPermission(perm: string): boolean {
    return this._permissions.length === 0 || this._permissions.includes(perm);
  }

  getBatchSize(): number {
    return this._batchSize;
  }

  getSourceFiles(): string[] {
    return this._sourceFiles;
  }

  getReceivesFrom(): string {
    return this._receivesFrom;
  }

  getSendsTo(): string {
    return this._sendsTo;
  }

  protected async trackStats(tokensUsed: number, success: boolean, durationMs: number, costUsd: number) {
    await updateAgentStats(this.agentType, tokensUsed, success, durationMs, costUsd);
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

    const effectiveModel = this.getEffectiveModel();

    if (effectiveModel.provider === "anthropic") {
      return this.callAnthropic(messages, maxCompletion, effectiveModel);
    }

    return this.callOpenAI(messages, maxCompletion, effectiveModel);
  }

  private async callOpenAI(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    maxCompletion: number,
    modelCfg?: ModelConfig
  ): Promise<{ content: string; tokensUsed: number }> {
    const cfg = modelCfg || this.getEffectiveModel();
    const client = await getOpenAIClient();
    const effectiveMax = this._overrideMaxTokens ? Math.min(maxCompletion, this._overrideMaxTokens) : maxCompletion;
    const createParams: any = {
      model: cfg.model,
      max_completion_tokens: effectiveMax,
      messages,
    };
    const creativity = this.getEffectiveCreativity();
    if (creativity !== undefined && creativity >= 0) {
      createParams.temperature = Math.min(creativity, 2.0);
    }
    const response = await client.chat.completions.create(createParams);

    const content = response.choices[0]?.message?.content ?? "";
    const usage = response.usage;
    const tokensUsed = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);

    return { content, tokensUsed };
  }

  private async callAnthropic(
    messages: { role: "system" | "user" | "assistant"; content: string }[],
    maxCompletion: number,
    modelCfg?: ModelConfig
  ): Promise<{ content: string; tokensUsed: number }> {
    const cfg = modelCfg || this.getEffectiveModel();
    const systemMessage = messages.find(m => m.role === "system");
    const chatMessages = messages
      .filter(m => m.role !== "system")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const MAX_RETRIES = 3;
    const RETRY_DELAYS = [5000, 15000, 30000];

    const client = await getAnthropicClient();
    const timeoutMs = this.getEffectiveTimeoutMs();

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let streamedContent = "";
      try {
        const effectiveMax = this._overrideMaxTokens ? Math.min(maxCompletion, this._overrideMaxTokens) : maxCompletion;
        const streamParams: any = {
          model: cfg.model,
          max_tokens: Math.min(effectiveMax, 64000),
          system: systemMessage?.content,
          messages: chatMessages,
        };
        const creativity = this.getEffectiveCreativity();
        if (creativity !== undefined && creativity >= 0) {
          streamParams.temperature = Math.min(creativity, 1.0);
        }
        const stream = client.messages.stream(streamParams);

        stream.on("text", (text: string) => { streamedContent += text; });

        const response = await Promise.race([
          stream.finalMessage(),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              stream.abort();
              reject(new Error(`Anthropic timeout after ${Math.round(timeoutMs / 1000)}s`));
            }, timeoutMs)
          ),
        ]);

        let content = streamedContent;
        if (!content) {
          content = response.content
            .filter((block: { type: string }) => block.type === "text")
            .map((block: { type: string; text: string }) => block.text)
            .join("");
        }

        const inputTokens = response.usage?.input_tokens ?? 0;
        const outputTokens = response.usage?.output_tokens ?? 0;

        return { content, tokensUsed: inputTokens + outputTokens };
      } catch (error: any) {
        if (streamedContent.length > 200) {
          console.log(`[${this.agentType}] Stream error but got ${streamedContent.length} chars, using partial response`);
          const estimatedTokens = Math.ceil(streamedContent.length / 4);
          return { content: streamedContent, tokensUsed: estimatedTokens };
        }

        const errorStr = typeof error === "object" ? JSON.stringify(error) : String(error);
        const errMsg = error?.message || errorStr;
        const isRetryable = errorStr.includes("overloaded") || errorStr.includes("529") || errorStr.includes("rate_limit") || errorStr.includes("500") || errorStr.includes("503") || errMsg === "terminated" || errMsg === "aborted" || errMsg.includes("aborted");

        if (isRetryable && attempt < MAX_RETRIES) {
          const delay = RETRY_DELAYS[attempt] || 30000;
          console.log(`[${this.agentType}] Anthropic error (${errMsg}), retry ${attempt + 1}/${MAX_RETRIES} in ${delay / 1000}s`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        throw error;
      }
    }

    throw new Error("Max retries exceeded for Anthropic API call");
  }

  abstract execute(context: BuildContext): Promise<AgentResult>;
}
