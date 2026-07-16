export const AUTH_COOKIE = "zx_auth";

/**
 * Cookie value = SHA-256 of the passcode with a fixed app salt.
 * Uses Web Crypto so it runs both in the proxy (edge) and in route handlers.
 * Returns null when no PASSCODE is configured (open mode, local dev only).
 */
export async function authToken(): Promise<string | null> {
  const pass = process.env.PASSCODE;
  if (!pass) return null;
  const data = new TextEncoder().encode(`zhaksartu.v1:${pass}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
