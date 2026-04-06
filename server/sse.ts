import type { Response } from "express";
import Redis from "ioredis";

const REALTIME_CHANNEL = "sf-pulse:realtime";

const clients = new Set<Response>();

let publisher: Redis | null = null;
let subscriber: Redis | null = null;
let subscriberReady: Promise<void> | null = null;

function getRedisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

function logRedisError(role: "publisher" | "subscriber", error: unknown): void {
  console.error(
    `[realtime] redis ${role} error:`,
    error instanceof Error ? error.message : error,
  );
}

function broadcastLocal(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
}

function createPublisher(): Redis | null {
  const url = getRedisUrl();
  if (!url) return null;
  if (!publisher) {
    publisher = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
    publisher.on("error", (error) => logRedisError("publisher", error));
  }
  return publisher;
}

function handleRealtimeMessage(message: string): void {
  try {
    const parsed = JSON.parse(message) as { event?: unknown; data?: unknown };
    if (typeof parsed.event !== "string" || parsed.event.length === 0) return;
    broadcastLocal(parsed.event, parsed.data);
  } catch (error) {
    console.error(
      "[realtime] dropped invalid pubsub message:",
      error instanceof Error ? error.message : error,
    );
  }
}

export async function initializeRealtime(): Promise<void> {
  const url = getRedisUrl();
  if (!url || subscriberReady) return subscriberReady ?? undefined;

  subscriber = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  subscriber.on("error", (error) => logRedisError("subscriber", error));
  subscriber.on("message", (channel, message) => {
    if (channel === REALTIME_CHANNEL) {
      handleRealtimeMessage(message);
    }
  });

  subscriberReady = (async () => {
    await subscriber!.connect();
    await subscriber!.subscribe(REALTIME_CHANNEL);
  })().catch((error) => {
    subscriberReady = null;
    if (subscriber) {
      subscriber.disconnect();
      subscriber = null;
    }
    throw error;
  });

  return subscriberReady;
}

export function addClient(res: Response): void {
  clients.add(res);
  res.on("close", () => clients.delete(res));
}

export async function broadcast(event: string, data: unknown): Promise<void> {
  const redis = createPublisher();
  if (!redis) {
    broadcastLocal(event, data);
    return;
  }

  if (redis.status === "wait") {
    await redis.connect();
  }

  await redis.publish(REALTIME_CHANNEL, JSON.stringify({ event, data }));
}
