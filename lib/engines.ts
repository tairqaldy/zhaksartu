import Anthropic from "@anthropic-ai/sdk";

export type EngineId = "local" | "claude";

export interface EnhanceEngine {
  id: EngineId;
  /** One-shot completion (question generation). */
  complete(prompt: string): Promise<string>;
  /** Token stream (final enhancement). */
  stream(prompt: string): AsyncIterable<string>;
}

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";

/**
 * Local (Ollama, CPU-only on Railway) turned out too slow for real use —
 * multi-second-per-token generation, plus Railway's own edge proxy kills a
 * connection that goes too long without a byte, so long CPU decodes 502
 * before finishing. It stays available as an honest "experimental / slow"
 * option; Claude tiers are the primary engines.
 */
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

function stripThink(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "");
}

class OllamaEngine implements EnhanceEngine {
  id = "local" as const;

  private body(prompt: string, stream: boolean, temperature: number) {
    return JSON.stringify({
      model: OLLAMA_MODEL,
      stream,
      think: false,
      messages: [{ role: "user", content: prompt }],
      options: { temperature, top_p: 0.9, num_ctx: 8192 },
    });
  }

  async complete(prompt: string): Promise<string> {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: this.body(prompt, false, 0.3),
      signal: AbortSignal.timeout(420_000),
    });
    if (!res.ok) throw new Error(`ollama responded ${res.status}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return stripThink(data.message?.content ?? "");
  }

  async *stream(prompt: string): AsyncIterable<string> {
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: this.body(prompt, true, 0.45),
      signal: AbortSignal.timeout(900_000),
    });
    if (!res.ok || !res.body) throw new Error(`ollama responded ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inThink = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let content = "";
        try {
          const chunk = JSON.parse(line) as { message?: { content?: string } };
          content = chunk.message?.content ?? "";
        } catch {
          continue;
        }
        if (!content) continue;
        if (inThink) {
          const end = content.indexOf("</think>");
          if (end === -1) continue;
          content = content.slice(end + "</think>".length);
          inThink = false;
        }
        const start = content.indexOf("<think>");
        if (start !== -1) {
          const end = content.indexOf("</think>", start);
          if (end === -1) {
            content = content.slice(0, start);
            inThink = true;
          } else {
            content =
              content.slice(0, start) + content.slice(end + "</think>".length);
          }
        }
        if (content) yield content;
      }
    }
  }
}

class ClaudeEngine implements EnhanceEngine {
  id = "claude" as const;
  private client = new Anthropic();
  private isFable: boolean;

  constructor(private model: string) {
    this.isFable = model === "claude-fable-5";
  }

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

  async *stream(prompt: string): AsyncIterable<string> {
    const stream = this.isFable
      ? this.client.beta.messages.stream({
          model: this.model,
          max_tokens: 8192,
          betas: ["server-side-fallback-2026-06-01"],
          fallbacks: [{ model: "claude-opus-4-8" }],
          messages: [{ role: "user", content: prompt }],
        })
      : this.client.messages.stream({
          model: this.model,
          max_tokens: 8192,
          messages: [{ role: "user", content: prompt }],
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

export function getEngine(id: string | undefined, claudeTier?: string): EnhanceEngine {
  if (id === "claude") {
    if (!claudeAvailable()) {
      throw new Error("Claude engine requested but ANTHROPIC_API_KEY is not set");
    }
    return new ClaudeEngine(resolveClaudeModel(claudeTier));
  }
  return new OllamaEngine();
}

export async function localHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Forces the model into memory so the next real request is fast, instead of
 * paying the cold-load penalty (container wake + full weight read, since
 * Railway volumes don't support mmap) on a user-facing call. Cheap no-op if
 * the model is already resident.
 */
export async function warmLocal(): Promise<{
  alreadyLoaded: boolean;
  ms: number;
}> {
  const start = Date.now();
  try {
    const psRes = await fetch(`${OLLAMA_URL}/api/ps`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (psRes.ok) {
      const data = (await psRes.json()) as { models?: { model?: string }[] };
      const loaded = (data.models ?? []).some((m) => m.model === OLLAMA_MODEL);
      if (loaded) return { alreadyLoaded: true, ms: Date.now() - start };
    }
  } catch {
    // container may still be waking up; fall through to the forcing call
  }

  await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      think: false,
      messages: [{ role: "user", content: "hi" }],
      options: { num_predict: 1 },
      keep_alive: "30m",
    }),
    signal: AbortSignal.timeout(420_000),
  });
  return { alreadyLoaded: false, ms: Date.now() - start };
}

export const engineInfo = {
  localModel: OLLAMA_MODEL,
  defaultClaudeModel: resolveClaudeModel(DEFAULT_TIER),
};
