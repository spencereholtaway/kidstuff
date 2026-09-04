import { jsonResponse, errorResponse } from "./lib/store.js";
import { computeStars } from "./lib/stars.js";

export default async (req) => {
  if (req.method !== "GET") return errorResponse("method not allowed", 405);
  return jsonResponse(await computeStars());
};
