import { NextResponse } from "next/server";
import { addHistory, listHistory, removeHistory } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ history: await listHistory() });
}

export async function POST(request: Request) {
  const { engine, idea, output } = (await request
    .json()
    .catch(() => ({}))) as {
    engine?: string;
    idea?: string;
    output?: string;
  };
  if (!idea || !output) {
    return NextResponse.json({ error: "idea and output required" }, { status: 400 });
  }
  const entry = await addHistory({
    engine: engine ?? "local",
    idea: idea.slice(0, 500),
    output,
  });
  return NextResponse.json({ entry });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await removeHistory(id);
  return NextResponse.json({ ok: true });
}
