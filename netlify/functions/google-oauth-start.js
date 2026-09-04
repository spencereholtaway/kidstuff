import { errorResponse } from "./lib/store.js";
import { requireAuth } from "./lib/auth.js";
import { getRedirectUri } from "./lib/google.js";

const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export default async (req) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return errorResponse("GOOGLE_CLIENT_ID is not configured", 500);

  const url = new URL(req.url);
  const redirectUri = getRedirectUri(url.origin);

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");

  return new Response(null, { status: 302, headers: { location: authUrl.toString() } });
};
