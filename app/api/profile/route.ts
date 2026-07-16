import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/store";

export async function GET() {
  return NextResponse.json({ profile: await getProfile() });
}

export async function PUT(request: Request) {
  const { profile } = (await request.json().catch(() => ({}))) as {
    profile?: string;
  };
  if (typeof profile !== "string") {
    return NextResponse.json({ error: "profile required" }, { status: 400 });
  }
  await saveProfile(profile);
  return NextResponse.json({ ok: true });
}
