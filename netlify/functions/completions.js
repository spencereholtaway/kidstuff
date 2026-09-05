import { readJSON, writeJSON, jsonResponse, errorResponse } from "./lib/store.js";

const COMPLETIONS_KEY = "chores/completions.json";
const CHORES_KEY = "chores/definitions.json";

export default async (req) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    let completions = await readJSON(COMPLETIONS_KEY, []);
    const kid = url.searchParams.get("kid");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (kid) completions = completions.filter((c) => c.kid === kid);
    if (from) completions = completions.filter((c) => c.date >= from);
    if (to) completions = completions.filter((c) => c.date <= to);
    return jsonResponse(completions);
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { choreId, kid, date } = body;
    if (!choreId || !kid || !date) {
      return errorResponse("choreId, kid, and date (YYYY-MM-DD) are required");
    }

    const chores = await readJSON(CHORES_KEY, []);
    const chore = chores.find((c) => c.id === choreId);
    if (!chore) return errorResponse("to-do not found", 404);
    if (chore.kid !== kid && chore.kid !== "both") return errorResponse("to-do is not assigned to this kid", 400);

    const completions = await readJSON(COMPLETIONS_KEY, []);
    const existingIdx = completions.findIndex(
      (c) => c.choreId === choreId && c.kid === kid && c.date === date,
    );

    if (existingIdx !== -1) {
      completions.splice(existingIdx, 1);
      await writeJSON(COMPLETIONS_KEY, completions);
      return jsonResponse({ completed: false });
    }

    const completion = {
      id: crypto.randomUUID(),
      choreId,
      kid,
      date,
      starValue: chore.starValue,
      completedAt: new Date().toISOString(),
    };
    completions.push(completion);
    await writeJSON(COMPLETIONS_KEY, completions);
    return jsonResponse({ completed: true, completion }, { status: 201 });
  }

  return errorResponse("method not allowed", 405);
};
