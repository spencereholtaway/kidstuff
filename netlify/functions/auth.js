import { jsonResponse, errorResponse } from "./lib/store.js";
import {
  createSessionToken,
  verifySessionToken,
  parseCookies,
  sessionCookie,
  clearSessionCookie,
} from "./lib/auth.js";

export default async (req) => {
  if (req.method === "GET") {
    const cookies = parseCookies(req);
    const authenticated = await verifySessionToken(cookies.session);
    return jsonResponse({ authenticated });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const pin = String(body.pin ?? "");
    const expected = process.env.PARENT_PIN;
    if (!expected) return errorResponse("PARENT_PIN is not configured on the server", 500);
    if (pin !== expected) return errorResponse("Incorrect PIN", 401);

    const token = await createSessionToken();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": sessionCookie(token),
      },
    });
  }

  if (req.method === "DELETE") {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": clearSessionCookie(),
      },
    });
  }

  return errorResponse("method not allowed", 405);
};
