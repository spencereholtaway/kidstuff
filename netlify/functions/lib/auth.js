const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 2 weeks

function requireSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function toBase64url(bytes) {
  let binary = "";
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(str.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

export async function createSessionToken() {
  const secret = requireSecret();
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = toBase64url(encoder.encode(JSON.stringify({ exp })));
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return `${payload}.${toBase64url(signature)}`;
}

export async function verifySessionToken(token) {
  if (!token || !token.includes(".")) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;

  try {
    const key = await hmacKey(requireSecret());
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64url(signature),
      encoder.encode(payload),
    );
    if (!valid) return false;

    const { exp } = JSON.parse(decoder.decode(fromBase64url(payload)));
    return typeof exp === "number" && exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function parseCookies(req) {
  const header = req.headers.get("cookie") || "";
  return Object.fromEntries(
    header
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const idx = p.indexOf("=");
        return [p.slice(0, idx), decodeURIComponent(p.slice(idx + 1))];
      }),
  );
}

export function sessionCookie(token, cookieName = "session") {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(cookieName = "session") {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Returns an error Response if the request's session cookie is missing/invalid, else null. */
export async function requireAuth(req, cookieName = "session") {
  const cookies = parseCookies(req);
  const ok = await verifySessionToken(cookies[cookieName]);
  if (!ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }
  return null;
}
