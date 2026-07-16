import { getEngine } from "@/lib/engines";
import { enhancePrompt, type Answer } from "@/lib/prompts";
import { getProfile } from "@/lib/store";

export const maxDuration = 300;

export async function POST(request: Request) {
  const { idea, answers, engine, model } = (await request
    .json()
    .catch(() => ({}))) as {
    idea?: string;
    answers?: Answer[];
    engine?: string;
    model?: string;
  };

  if (!idea || idea.trim().length < 3) {
    return new Response("idea required", { status: 400 });
  }

  const profile = await getProfile();
  const prompt = enhancePrompt({
    profile,
    idea,
    answers: Array.isArray(answers) ? answers : [],
  });

  let eng;
  try {
    eng = getEngine(engine, model);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "engine error", {
      status: 400,
    });
  }

  const encoder = new TextEncoder();
  const source = eng.stream(prompt);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const token of source) {
          controller.enqueue(encoder.encode(token));
        }
        controller.close();
      } catch (err) {
        console.error("enhance stream failed:", err);
        controller.enqueue(
          encoder.encode(
            `\n\n[zhaksartu error] ${err instanceof Error ? err.message : "stream failed"}`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
