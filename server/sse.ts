import Redis from "ioredis";

const REALTIME_CHANNEL = "sf-pulse:realtime";

interface SseClient {
  write: (chunk: string) => void;
  onClose: (callback: () => void) => void;
}

const clients = new Set<SseClient>();

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
  for (const client of clients) {
    client.write(payload);
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

export function addClient(client: SseClient): void {
  clients.add(client);
  client.onClose(() => clients.delete(client));
}

export async function broadcast(event: string, data: unknown): Promise<void> {
  const redis = createPublisher();
  if (!redis) {
    broadcastLocal(event, data);
    return;
  }

  try {
    if (redis.status === "wait") {
      await redis.connect();
    }
    await redis.publish(REALTIME_CHANNEL, JSON.stringify({ event, data }));
  } catch (error) {
    console.warn(
      `[realtime] redis publish failed, skipping broadcast:`,
      error instanceof Error ? error.message : error,
    );
    publisher = null;
  }
}

export function createSseResponse(signal: AbortSignal): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
      };

      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;

        try {
          controller.enqueue(chunk);
        } catch {
          cleanup();
        }
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(encoder.encode(": ping\n\n"));
      }, 25_000);

      const close = () => {
        if (closed) return;
        cleanup();

        try {
          controller.close();
        } catch {
          // Ignore repeated close attempts during abort races.
        }
      };

      addClient({
        write(chunk) {
          safeEnqueue(encoder.encode(chunk));
        },
        onClose(callback) {
          signal.addEventListener("abort", callback, { once: true });
        },
      });

      signal.addEventListener("abort", close, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
