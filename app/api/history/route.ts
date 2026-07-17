import { NextResponse } from "next/server";
import { addHistory, listHistory, removeHistory, updateHistory } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ history: await listHistory() });
}

export async function POST(request: Request) {
  const { mode, engine, idea, output } = (await request
    .json()
    .catch(() => ({}))) as {
    mode?: string;
    engine?: string;
    idea?: string;
    output?: string;
  };
  if (!idea || !output) {
    return NextResponse.json({ error: "idea and output required" }, { status: 400 });
  }
  const entry = await addHistory({
    mode: mode || "build",
    engine: engine ?? "sonnet",
    idea: idea.slice(0, 500),
    output,
  });
  return NextResponse.json({ entry });
}

export async function PATCH(request: Request) {
  const { id, output } = (await request.json().catch(() => ({}))) as {
    id?: string;
    output?: string;
  };
  if (!id || typeof output !== "string") {
    return NextResponse.json({ error: "id and output required" }, { status: 400 });
  }
  await updateHistory(id, { output });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await removeHistory(id);
  return NextResponse.json({ ok: true });
}
