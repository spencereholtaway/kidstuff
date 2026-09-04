import { jsonResponse, errorResponse } from "./lib/store.js";
import { runCalendarSync } from "./lib/sync.js";

/** Callable on demand: parent panel "Sync Now" and the kiosk home screen refresh button. */
export default async (req) => {
  if (req.method !== "POST") return errorResponse("method not allowed", 405);
  try {
    return jsonResponse(await runCalendarSync());
  } catch (err) {
    return errorResponse(err.message, 502);
  }
};
