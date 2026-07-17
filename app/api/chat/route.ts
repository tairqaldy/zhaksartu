import { getClaudeEngine, type ChatMessage } from "@/lib/engines";
import { CHAT_PERSONAS } from "@/lib/prompts";
import { getProfile } from "@/lib/store";
import { toSafeTextStream } from "@/lib/stream";

export const maxDuration = 300;

export async function POST(request: Request) {
  const { persona, messages, model } = (await request
    .json()
    .catch(() => ({}))) as {
    persona?: string;
    messages?: ChatMessage[];
    model?: string;
  };

  if (!persona || !CHAT_PERSONAS[persona]) {
    return new Response("unknown persona", { status: 400 });
  }
  const buildSystem = CHAT_PERSONAS[persona];
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages required", { status: 400 });
  }

  const profile = await getProfile();

  let eng;
  try {
    eng = getClaudeEngine(model);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "engine error", {
      status: 400,
    });
  }

  const source = eng.chatStream(buildSystem(profile), messages);
  const stream = toSafeTextStream(source, persona);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
