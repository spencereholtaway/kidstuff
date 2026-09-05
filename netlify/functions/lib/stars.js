import { readJSON } from "./store.js";

const COMPLETIONS_KEY = "chores/completions.json";
const REDEMPTIONS_KEY = "rewards/redemptions.json";
const KIDS = ["jack", "jojo"];

/**
 * lifetime[kid] = cumulative stars that kid has ever earned (never decreases).
 * joint.available = shared pool both kids draw rewards from (earned - spent).
 */
export async function computeStars() {
  const [completions, redemptions] = await Promise.all([
    readJSON(COMPLETIONS_KEY, []),
    readJSON(REDEMPTIONS_KEY, []),
  ]);

  const lifetime = Object.fromEntries(KIDS.map((k) => [k, 0]));
  let earned = 0;
  let parentAwarded = 0;
  for (const c of completions) {
    if (lifetime[c.kid] !== undefined) lifetime[c.kid] += c.starValue;
    earned += c.starValue;
    if (c.source === "parent") parentAwarded += c.starValue;
  }

  const spent = redemptions.reduce((sum, r) => sum + r.starsSpent, 0);

  return {
    lifetime,
    parentAwarded,
    joint: { earned, spent, available: earned - spent },
  };
}

function startOfWeekIso(from = new Date()) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Combined stars both kids have earned so far in the current (Mon-start) week. */
export async function computeWeeklyTeamTotal() {
  const completions = await readJSON(COMPLETIONS_KEY, []);
  const weekStart = startOfWeekIso();
  return completions.filter((c) => c.date >= weekStart).reduce((sum, c) => sum + c.starValue, 0);
}

export { startOfWeekIso };
