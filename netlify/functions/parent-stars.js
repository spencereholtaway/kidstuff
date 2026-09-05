import { readJSON, writeJSON, jsonResponse, errorResponse } from "./lib/store.js";
import { requireAuth } from "./lib/auth.js";

const COMPLETIONS_KEY = "chores/completions.json";
const PARENT_CHORE_ID = "__parent__";
const PARENT_KID = "dad";

/** Lets a parent add or subtract stars from their own pool directly (for things outside the
 * chore list) — not attributed to either kid — recorded as completions tagged `source: "parent"`
 * so they flow into the combined weekly/team totals (reward tiers, joint pool) exactly like chore
 * stars, while staying easy to tell apart and undo if added by mistake. */
export default async (req) => {
  const authError = await requireAuth(req);
  if (authError) return authError;

  if (req.method === "POST") {
    const { amount, date } = await req.json();
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt === 0 || !date) {
      return errorResponse("a non-zero whole number amount and date (YYYY-MM-DD) are required");
    }

    const completions = await readJSON(COMPLETIONS_KEY, []);
    const completion = {
      id: crypto.randomUUID(),
      choreId: PARENT_CHORE_ID,
      kid: PARENT_KID,
      date,
      starValue: amt,
      completedAt: new Date().toISOString(),
      source: "parent",
    };
    completions.push(completion);
    await writeJSON(COMPLETIONS_KEY, completions);
    return jsonResponse(completion, { status: 201 });
  }

  if (req.method === "DELETE") {
    const completions = await readJSON(COMPLETIONS_KEY, []);
    const next = completions.filter((c) => c.source !== "parent");
    await writeJSON(COMPLETIONS_KEY, next);
    return jsonResponse({ removed: completions.length - next.length });
  }

  return errorResponse("method not allowed", 405);
};
