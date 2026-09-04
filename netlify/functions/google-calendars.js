import { readJSON, writeJSON, jsonResponse, errorResponse } from "./lib/store.js";
import { requireAuth } from "./lib/auth.js";
import { getAccessToken, listCalendars } from "./lib/google.js";

const CONNECTION_KEY = "calendar/google-connection.json";

export default async (req) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  const connection = await readJSON(CONNECTION_KEY, {});

  if (req.method === "GET") {
    if (!connection.refreshToken) return jsonResponse({ connected: false });
    try {
      const accessToken = await getAccessToken(connection.refreshToken);
      const calendars = await listCalendars(accessToken);
      return jsonResponse({
        connected: true,
        calendars,
        selectedIds: connection.calendarIds || [],
      });
    } catch (err) {
      return errorResponse(err.message, 502);
    }
  }

  if (req.method === "POST") {
    if (!connection.refreshToken) return errorResponse("Google Calendar is not connected", 400);
    const body = await req.json();
    const calendarIds = Array.isArray(body.calendarIds) ? body.calendarIds : [];
    await writeJSON(CONNECTION_KEY, { ...connection, calendarIds });
    return jsonResponse({ ok: true, calendarIds });
  }

  if (req.method === "DELETE") {
    await writeJSON(CONNECTION_KEY, {});
    return jsonResponse({ ok: true });
  }

  return errorResponse("method not allowed", 405);
};
