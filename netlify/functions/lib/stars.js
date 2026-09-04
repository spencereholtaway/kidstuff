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
  for (const c of completions) {
    if (lifetime[c.kid] !== undefined) lifetime[c.kid] += c.starValue;
    earned += c.starValue;
  }

  const spent = redemptions.reduce((sum, r) => sum + r.starsSpent, 0);

  return {
    lifetime,
    joint: { earned, spent, available: earned - spent },
  };
}
