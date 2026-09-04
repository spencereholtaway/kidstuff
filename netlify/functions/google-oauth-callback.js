import { readJSON, writeJSON, errorResponse } from "./lib/store.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CONNECTION_KEY = "calendar/google-connection.json";

function redirectToParent(origin, error) {
  const dest = new URL("/parent.html", origin);
  dest.searchParams.set("google", error ? "error" : "connected");
  if (error) dest.searchParams.set("message", error);
  return new Response(null, { status: 302, headers: { location: dest.toString() } });
}

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return redirectToParent(url.origin, `Google sign-in was cancelled or failed: ${error}`);
  }
  if (!code) {
    return errorResponse("missing code", 400);
  }

  const redirectUri = `${url.origin}/api/google-oauth-callback`;

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.refresh_token) {
    return redirectToParent(
      url.origin,
      tokens.error_description ||
        "Google didn't return a refresh token. Try disconnecting access at https://myaccount.google.com/permissions and connecting again.",
    );
  }

  const existing = await readJSON(CONNECTION_KEY, {});
  await writeJSON(CONNECTION_KEY, {
    ...existing,
    refreshToken: tokens.refresh_token,
    connectedAt: new Date().toISOString(),
    calendarIds: existing.calendarIds || [],
  });

  return redirectToParent(url.origin, null);
};
