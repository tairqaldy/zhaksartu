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
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

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
    // Generous timeout: first request after app sleeping loads the model.
    const res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: this.body(prompt, false, 0.3),
      // CPU inference + cold model load can be very slow; give it room.
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
      // Whole-stream cap: prompt eval on CPU can take minutes before the
      // first token, and generation itself runs at single-digit tok/s.
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
        // Belt-and-suspenders: suppress <think> spans even though think:false
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

  async complete(prompt: string): Promise<string> {
    const msg = await this.client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 2048,
      messages: [{ role: "user", content: prompt }],
    });
    return msg.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  async *stream(prompt: string): AsyncIterable<string> {
    const stream = this.client.messages.stream({
      model: CLAUDE_MODEL,
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

export function getEngine(id: string | undefined): EnhanceEngine {
  if (id === "claude") {
    if (!claudeAvailable()) {
      throw new Error("Claude engine requested but ANTHROPIC_API_KEY is not set");
    }
    return new ClaudeEngine();
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

export const engineInfo = {
  localModel: OLLAMA_MODEL,
  claudeModel: CLAUDE_MODEL,
};
