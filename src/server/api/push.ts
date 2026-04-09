import type { Pool } from "pg";
import {
  addSubscription,
  getSubscriptionByEndpoint,
  removeSubscription,
  updateSubscriptionPreferences,
} from "../../../server/storage.js";
import {
  parsePushPreferencesBody,
  getVapidPublicKey,
  parsePushSubscriptionBody,
  parsePushSubscriptionLookup,
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

  const { endpoint, keys, preferences } = parsed.data;
  return json(await addSubscription(endpoint, keys, preferences, pool));
}

export async function getPushSubscriptionResponse(
  request: Request,
  pool?: Pool,
): Promise<Response> {
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  const parsed = parsePushSubscriptionLookup({ endpoint });
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? "Invalid subscription lookup" },
      { status: 400 },
    );
  }

  const subscription = await getSubscriptionByEndpoint(parsed.data.endpoint, pool);
  if (!subscription) {
    return json({ error: "Subscription not found" }, { status: 404 });
  }

  return json(subscription);
}

export async function updatePushPreferencesResponse(
  request: Request,
  pool?: Pool,
): Promise<Response> {
  const parsed = parsePushPreferencesBody(await readJson(request));
  if (!parsed.success) {
    return json(
      { error: parsed.error.issues[0]?.message ?? "Invalid push preferences" },
      { status: 400 },
    );
  }

  const subscription = await updateSubscriptionPreferences(
    parsed.data.endpoint,
    parsed.data.preferences,
    pool,
  );

  if (!subscription) {
    return json({ error: "Subscription not found" }, { status: 404 });
  }

  return json(subscription);
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
