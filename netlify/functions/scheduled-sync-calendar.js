import { runCalendarSync } from "./lib/sync.js";

// Nightly baseline refresh (~midnight Pacific, ignoring DST). This is only the
// safety net — the real "fast" path is sync-calendar.js, called on demand by
// the parent panel's "Sync Now" button and the kiosk refresh button.
export const config = {
  schedule: "0 8 * * *",
};

export default async () => {
  try {
    await runCalendarSync();
  } catch (err) {
    console.error("Scheduled calendar sync failed:", err.message);
  }
  return new Response("ok");
};
