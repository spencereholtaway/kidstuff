import { readJSON, writeJSON, jsonResponse, errorResponse } from "./lib/store.js";

const KEY = "rewards/definitions.json";

export default async (req) => {
  if (req.method === "GET") {
    return jsonResponse(await readJSON(KEY, []));
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { title, starCost } = body;
    if (!title || !(Number(starCost) > 0)) {
      return errorResponse("title and a positive starCost are required");
    }

    const rewards = await readJSON(KEY, []);
    const reward = {
      id: crypto.randomUUID(),
      title,
      starCost: Number(starCost),
      active: true,
    };
    rewards.push(reward);
    await writeJSON(KEY, rewards);
    return jsonResponse(reward, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json();
    const rewards = await readJSON(KEY, []);
    const idx = rewards.findIndex((r) => r.id === body.id);
    if (idx === -1) return errorResponse("reward not found", 404);
    rewards[idx] = { ...rewards[idx], ...body };
    await writeJSON(KEY, rewards);
    return jsonResponse(rewards[idx]);
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    const rewards = await readJSON(KEY, []);
    const next = rewards.filter((r) => r.id !== id);
    if (next.length === rewards.length) return errorResponse("reward not found", 404);
    await writeJSON(KEY, next);
    return jsonResponse({ ok: true });
  }

  return errorResponse("method not allowed", 405);
};
