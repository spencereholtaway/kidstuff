import { readJSON, writeJSON } from "./store.js";
import { getAccessToken, listCalendars, listEvents } from "./google.js";

const CONNECTION_KEY = "calendar/google-connection.json";
const EVENTS_KEY = "calendar/events.json";
const LOOKAHEAD_DAYS = 14;

/** Pulls events from every connected calendar and refreshes the events cache. */
export async function runCalendarSync() {
  const connection = await readJSON(CONNECTION_KEY, {});
  if (!connection.refreshToken) {
    return { synced: false, reason: "not connected", events: [], lastSyncedAt: null };
  }
  if (!connection.calendarIds || connection.calendarIds.length === 0) {
    return { synced: false, reason: "no calendars selected", events: [], lastSyncedAt: null };
  }

  const accessToken = await getAccessToken(connection.refreshToken);
  const calendars = await listCalendars(accessToken);
  const colorById = Object.fromEntries(calendars.map((c) => [c.id, c.color]));

  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const results = await Promise.all(
    connection.calendarIds.map((id) =>
      listEvents(accessToken, id, timeMin, timeMax).then((items) => ({ id, items })),
    ),
  );

  const events = results
    .flatMap(({ id, items }) =>
      items.map((e) => ({
        id: e.id,
        title: e.summary || "(untitled)",
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
        allDay: !e.start?.dateTime,
        calendarId: id,
        color: colorById[id] || "#4a90d9",
      })),
    )
    .sort((a, b) => a.start.localeCompare(b.start));

  const cache = { events, lastSyncedAt: new Date().toISOString() };
  await writeJSON(EVENTS_KEY, cache);
  return { synced: true, ...cache };
}
