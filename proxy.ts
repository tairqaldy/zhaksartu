import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The gate itself and the auth endpoint stay reachable
  if (pathname === "/gate" || pathname === "/api/auth") {
    return NextResponse.next();
  }

  const expected = await authToken();
  // No PASSCODE configured → open mode (local dev). Set PASSCODE in prod.
  if (!expected) return NextResponse.next();

  if (request.cookies.get(AUTH_COOKIE)?.value === expected) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/gate";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
