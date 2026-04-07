import { json } from "./utils.js";

export function getHealthResponse(): Response {
  return json({ ok: true });
}
