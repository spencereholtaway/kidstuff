import { jsonResponse, errorResponse } from "./lib/store.js";
import { createSessionToken, verifySessionToken, parseCookies, sessionCookie, clearSessionCookie } from "./lib/auth.js";

const COOKIE_NAME = "kiosk_session";

/** Gates the kiosk-facing pages (home + kid) behind their own PIN, separate from the parent
 * panel's — so the kids/anyone with the URL can't see the family's stuff without it, but the
 * kiosk PIN doesn't also hand out access to the parent panel. */
export default async (req) => {
  if (req.method === "GET") {
    const cookies = parseCookies(req);
    const authenticated = await verifySessionToken(cookies[COOKIE_NAME]);
    return jsonResponse({ authenticated });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const pin = String(body.pin ?? "");
    const expected = process.env.KIOSK_PIN;
    if (!expected) return errorResponse("KIOSK_PIN is not configured on the server", 500);
    if (pin !== expected) return errorResponse("Incorrect PIN", 401);

    const token = await createSessionToken();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": sessionCookie(token, COOKIE_NAME),
      },
    });
  }

  if (req.method === "DELETE") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": clearSessionCookie(COOKIE_NAME),
      },
    });
  }

  return errorResponse("method not allowed", 405);
};
