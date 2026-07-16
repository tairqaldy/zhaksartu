import Anthropic from "@anthropic-ai/sdk";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const CLAUDE_TIERS = [
  { id: "haiku", label: "haiku", model: "claude-haiku-4-5", note: "fast, cheap" },
  { id: "sonnet", label: "sonnet", model: "claude-sonnet-5", note: "balanced — default" },
  { id: "opus", label: "opus", model: "claude-opus-4-8", note: "best quality" },
  { id: "fable", label: "fable", model: "claude-fable-5", note: "top-tier, priciest" },
] as const;

export type ClaudeTierId = (typeof CLAUDE_TIERS)[number]["id"];
const DEFAULT_TIER: ClaudeTierId = "sonnet";

function resolveClaudeModel(tierId: string | undefined): string {
  const tier = CLAUDE_TIERS.find((t) => t.id === tierId);
  return (tier ?? CLAUDE_TIERS.find((t) => t.id === DEFAULT_TIER)!).model;
}

export class ClaudeEngine {
  private client = new Anthropic();
  private isFable: boolean;

  constructor(private model: string) {
    this.isFable = model === "claude-fable-5";
  }

  /** One-shot completion — question generation, single-prompt calls. */
  async complete(prompt: string): Promise<string> {
    if (this.isFable) {
      const msg = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 2048,
        betas: ["server-side-fallback-2026-06-01"],
        fallbacks: [{ model: "claude-opus-4-8" }],
        messages: [{ role: "user", content: prompt }],
      });
      return msg.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    }
    const msg = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  /** Streamed single-prompt completion — the build-mode enhancement. */
  async *stream(prompt: string): AsyncIterable<string> {
    yield* this.chatStream(undefined, [{ role: "user", content: prompt }]);
  }

  /** Streamed multi-turn chat with a system prompt — roast mode. */
  async *chatStream(
    system: string | undefined,
    messages: ChatMessage[]
  ): AsyncIterable<string> {
    const stream = this.isFable
      ? this.client.beta.messages.stream({
          model: this.model,
          max_tokens: 8192,
          ...(system ? { system } : {}),
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: "claude-opus-4-8" }],
          messages,
        })
      : this.client.messages.stream({
          model: this.model,
          max_tokens: 8192,
          ...(system ? { system } : {}),
          messages,
        });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }
  }
}

export function claudeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function getClaudeEngine(tier?: string): ClaudeEngine {
  if (!claudeAvailable()) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new ClaudeEngine(resolveClaudeModel(tier));
}

export const engineInfo = {
  defaultClaudeModel: resolveClaudeModel(DEFAULT_TIER),
};
