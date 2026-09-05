import { getStore } from "@netlify/blobs";

const STORE_NAME = "family-data";

// Netlify Blobs defaults to eventual consistency, which can serve a stale read right after a
// write (e.g. a chore toggle immediately followed by a re-render) — force strong consistency
// since every read here feeds a read-modify-write.
export function store() {
  return getStore(STORE_NAME, { consistency: "strong" });
}

export async function readJSON(key, fallback) {
  const value = await store().get(key, { type: "json" });
  return value ?? fallback;
}

export async function writeJSON(key, value) {
  await store().setJSON(key, value);
  return value;
}

export function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, { status });
}
