import { readJSON, writeJSON, jsonResponse, errorResponse } from "./lib/store.js";

const KEY = "chores/definitions.json";
const VALID_KIDS = new Set(["jack", "jojo"]);
const VALID_DAYS = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);

export default async (req) => {
  if (req.method === "GET") {
    return jsonResponse(await readJSON(KEY, []));
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { title, kid, days, starValue, icon } = body;

    if (
      !title ||
      !VALID_KIDS.has(kid) ||
      !Array.isArray(days) ||
      days.length === 0 ||
      !days.every((d) => VALID_DAYS.has(d))
    ) {
      return errorResponse(
        "title, kid (jack|jojo), and days (non-empty array of weekday codes) are required",
      );
    }

    const chores = await readJSON(KEY, []);
    const chore = {
      id: crypto.randomUUID(),
      title,
      kid,
      days,
      starValue: Number(starValue) > 0 ? Number(starValue) : 1,
      icon: icon || "⭐",
    };
    chores.push(chore);
    await writeJSON(KEY, chores);
    return jsonResponse(chore, { status: 201 });
  }

  if (req.method === "PATCH") {
    const body = await req.json();
    const chores = await readJSON(KEY, []);
    const idx = chores.findIndex((c) => c.id === body.id);
    if (idx === -1) return errorResponse("chore not found", 404);
    chores[idx] = { ...chores[idx], ...body };
    await writeJSON(KEY, chores);
    return jsonResponse(chores[idx]);
  }

  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    const chores = await readJSON(KEY, []);
    const next = chores.filter((c) => c.id !== id);
    if (next.length === chores.length) return errorResponse("chore not found", 404);
    await writeJSON(KEY, next);
    return jsonResponse({ ok: true });
  }

  return errorResponse("method not allowed", 405);
};
