import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function POST(request: Request) {
  const { passcode } = (await request.json().catch(() => ({}))) as {
    passcode?: string;
  };

  const expected = process.env.PASSCODE;
  if (!expected) {
    return NextResponse.json({ ok: true, open: true });
  }

  if (typeof passcode !== "string" || passcode !== expected) {
    // Slow down brute force a little
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = await authToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
