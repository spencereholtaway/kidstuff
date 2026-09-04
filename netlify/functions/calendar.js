import { readJSON, jsonResponse, errorResponse } from "./lib/store.js";

const EVENTS_KEY = "calendar/events.json";

export default async (req) => {
  if (req.method !== "GET") return errorResponse("method not allowed", 405);
  return jsonResponse(await readJSON(EVENTS_KEY, { events: [], lastSyncedAt: null }));
};
