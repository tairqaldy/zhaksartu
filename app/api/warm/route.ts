import { NextResponse } from "next/server";
import { warmLocal } from "@/lib/engines";

/**
 * Forces the local model into memory ahead of real traffic — for a
 * scheduled pinger (keep it warm during work hours) or a manual "wake it up
 * now" call. Not gated by the passcode cookie (so a cron can hit it), but
 * requires its own secret so it isn't a public trigger for expensive work.
 */
export async function GET(request: Request) {
  const expected = process.env.WARM_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "WARM_SECRET not configured" }, { status: 501 });
  }
  const provided =
    request.headers.get("x-warm-secret") ??
    new URL(request.url).searchParams.get("secret");
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await warmLocal();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "warm failed" },
      { status: 502 }
    );
  }
}
