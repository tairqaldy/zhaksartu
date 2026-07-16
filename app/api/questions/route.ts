import { NextResponse } from "next/server";
import { getEngine } from "@/lib/engines";
import { parseQuestions, questionGenPrompt } from "@/lib/prompts";

export const maxDuration = 300;

export async function POST(request: Request) {
  const { idea, engine, model } = (await request.json().catch(() => ({}))) as {
    idea?: string;
    engine?: string;
    model?: string;
  };

  if (!idea || idea.trim().length < 3) {
    return NextResponse.json({ error: "idea required" }, { status: 400 });
  }

  try {
    const raw = await getEngine(engine, model).complete(questionGenPrompt(idea));
    // Garbage-tolerant: a failed parse just means no extra questions.
    return NextResponse.json({ questions: parseQuestions(raw) });
  } catch (err) {
    // Extras are optional — never block the flow on them.
    console.error("questions failed:", err);
    return NextResponse.json({ questions: [] });
  }
}
