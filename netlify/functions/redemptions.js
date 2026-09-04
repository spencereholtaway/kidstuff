import { readJSON, writeJSON, jsonResponse, errorResponse } from "./lib/store.js";
import { computeStars } from "./lib/stars.js";

const KEY = "rewards/redemptions.json";
const REWARDS_KEY = "rewards/definitions.json";

export default async (req) => {
  if (req.method === "GET") {
    return jsonResponse(await readJSON(KEY, []));
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { rewardId } = body;
    if (!rewardId) return errorResponse("rewardId is required");

    const rewards = await readJSON(REWARDS_KEY, []);
    const reward = rewards.find((r) => r.id === rewardId);
    if (!reward) return errorResponse("reward not found", 404);

    const stars = await computeStars();
    if (stars.joint.available < reward.starCost) {
      return errorResponse(
        `Not enough team stars: need ${reward.starCost}, have ${stars.joint.available}`,
        400,
      );
    }

    const redemptions = await readJSON(KEY, []);
    const redemption = {
      id: crypto.randomUUID(),
      rewardId,
      title: reward.title,
      starsSpent: reward.starCost,
      redeemedAt: new Date().toISOString(),
    };
    redemptions.push(redemption);
    await writeJSON(KEY, redemptions);

    return jsonResponse({ redemption, stars: await computeStars() }, { status: 201 });
  }

  return errorResponse("method not allowed", 405);
};
