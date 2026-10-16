// Session token helpers (edge-runtime compatible: uses WebCrypto only).
// The admin password never leaves the server; only signed session cookies do.

export const COOKIE_NAME = "ileoja_session";
export const SESSION_HOURS = 8;

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Derive the HMAC signing key from AUTH_SECRET (or the password-derived fallback). */
async function signingKey(): Promise<CryptoKey> {
  const base = process.env.AUTH_SECRET || process.env.PASSWORD_FALLBACK_SECRET || "ILEOJA4321@-ileoja-academy-session-key";
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(base), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = await crypto.subtle.sign("HMAC", baseKey, encoder.encode("ileoja-session-v1"));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(): Promise<string> {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = b64url(encoder.encode(JSON.stringify({ exp })));
  const key = await signingKey();
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const key = await signingKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      unb64url(sig) as BufferSource,
      encoder.encode(payload)
    );
    if (!ok) return false;
    const data = JSON.parse(new TextDecoder().decode(unb64url(payload)));
    return typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}
