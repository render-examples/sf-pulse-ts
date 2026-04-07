import type { Pool } from "pg";
import { addSubscription, removeSubscription } from "../../../server/storage.js";
import {
  getVapidPublicKey,
  parsePushSubscriptionBody,
  parsePushUnsubscribeBody,
} from "../../../server/security.js";
import { json, readJson } from "./utils.js";

export function getPushVapidKeyResponse(): Response {
  return json({ key: getVapidPublicKey() });
}

export async function subscribeToPushResponse(
  request: Request,
  pool?: Pool,
): Promise<Response> {
  const parsed = parsePushSubscriptionBody(await readJson(request));
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? "Invalid subscription" },
      { status: 400 },
    );
  }

  const { endpoint, keys } = parsed.data;
  return json(await addSubscription(endpoint, keys, pool));
}

export async function unsubscribeFromPushResponse(
  request: Request,
  pool?: Pool,
): Promise<Response> {
  const parsed = parsePushUnsubscribeBody(await readJson(request));
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? "Invalid subscription" },
      { status: 400 },
    );
  }

  await removeSubscription(parsed.data.endpoint, pool);
  return json({ ok: true });
}
