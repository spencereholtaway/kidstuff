import { readJSON, writeJSON, jsonResponse, errorResponse } from "./lib/store.js";
import { computeStars } from "./lib/stars.js";
import { requireAuth } from "./lib/auth.js";

const KEY = "rewards/redemptions.json";
const REWARDS_KEY = "rewards/definitions.json";

export default async (req) => {
  if (req.method === "GET") {
    return jsonResponse(await readJSON(KEY, []));
  }

  if (req.method === "POST") {
    // Kids claim rewards themselves from the kiosk, so this is intentionally not parent-gated —
    // eligibility is enforced below by the team's permanent star bank instead.
    const body = await req.json();
    const { rewardId, kid } = body;
    if (!rewardId) return errorResponse("rewardId is required");

    const rewards = await readJSON(REWARDS_KEY, []);
    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward) return errorResponse("reward not found", 404);

    const stars = await computeStars();
    if (stars.joint.available < reward.starCost) {
      return errorResponse(`Not enough stars saved up: need ${reward.starCost}, have ${stars.joint.available}`, 400);
    }

    const redemptions = await readJSON(KEY, []);
    const redemption = {
      id: crypto.randomUUID(),
      rewardId,
      title: reward.title,
      starsSpent: reward.starCost,
      kid: kid ?? null,
      redeemedAt: new Date().toISOString(),
    };
    redemptions.push(redemption);
    await writeJSON(KEY, redemptions);

    return jsonResponse({ redemption, stars: await computeStars() }, { status: 201 });
  }

  if (req.method === "DELETE") {
    // Parent-only: wipes the redemption log, zeroing `spent` — the fix for a pool that went
    // negative (which can only happen if something spent more than the bank actually had).
    const authError = await requireAuth(req);
    if (authError) return authError;

    await writeJSON(KEY, []);
    return jsonResponse({ stars: await computeStars() });
  }

  return errorResponse("method not allowed", 405);
};
