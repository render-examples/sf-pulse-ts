import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Pool } from "pg";
import { getRestaurantsResponse, deleteRestaurantResponse } from "../src/server/api/restaurants.js";
import { getEventsResponse, deleteEventResponse } from "../src/server/api/events.js";
import { getPushVapidKeyResponse, subscribeToPushResponse, unsubscribeFromPushResponse } from "../src/server/api/push.js";
import { getUpdatesResponse, getLastUpdatedResponse } from "../src/server/api/updates.js";
import { getEventsStreamResponse } from "../src/server/api/events-stream.js";
import { getRssResponse } from "../src/server/api/rss.js";
import { getHealthResponse } from "../src/server/api/health.js";

export interface AppInstance {
  app: (req: IncomingMessage, res: ServerResponse) => void;
  httpServer: Server;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
  const headers = new Headers();

  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }
    if (value !== undefined) {
      headers.set(name, value);
    }
  }

  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await readBody(req);

  return new Request(url, {
    method: req.method,
    headers,
    body,
  });
}

async function handleRequest(request: Request, pool?: Pool): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === "GET" && pathname === "/api/restaurants") {
    return getRestaurantsResponse(pool);
  }

  if (request.method === "DELETE" && /^\/api\/restaurants\/\d+$/.test(pathname)) {
    return deleteRestaurantResponse(request, Number(pathname.split("/").pop()), pool);
  }

  if (request.method === "GET" && pathname === "/api/events") {
    return getEventsResponse(pool);
  }

  if (request.method === "DELETE" && /^\/api\/events\/\d+$/.test(pathname)) {
    return deleteEventResponse(request, Number(pathname.split("/").pop()), pool);
  }

  if (request.method === "GET" && pathname === "/api/push/vapid-key") {
    return getPushVapidKeyResponse();
  }

  if (request.method === "POST" && pathname === "/api/push/subscribe") {
    return subscribeToPushResponse(request, pool);
  }

  if (request.method === "POST" && pathname === "/api/push/unsubscribe") {
    return unsubscribeFromPushResponse(request, pool);
  }

  if (request.method === "GET" && pathname === "/api/updates") {
    return getUpdatesResponse(pool);
  }

  if (request.method === "GET" && pathname === "/api/updates/last-updated") {
    return getLastUpdatedResponse(pool);
  }

  if (request.method === "GET" && pathname === "/api/events-stream") {
    return getEventsStreamResponse(request);
  }

  if (request.method === "GET" && pathname === "/api/rss.xml") {
    return getRssResponse(pool);
  }

  if (request.method === "GET" && pathname === "/api/healthz") {
    return getHealthResponse();
  }

  return Response.json({ message: "Not Found" }, { status: 404 });
}

async function writeResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));

  if (!response.body) {
    res.end();
    return;
  }

  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    const body = Buffer.from(await response.arrayBuffer());
    res.end(body);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    Readable.fromWeb(response.body as WebReadableStream<Uint8Array>)
      .on("error", reject)
      .on("end", resolve)
      .pipe(res);
  });
}

export function createApp(pool?: Pool): AppInstance {
  const app = (req: IncomingMessage, res: ServerResponse) => {
    toRequest(req)
      .then((request) => handleRequest(request, pool))
      .then((response) => writeResponse(response, res))
      .catch((error) => {
        const status =
          (error as { status?: number }).status ||
          (error as { statusCode?: number }).statusCode ||
          500;
        const message = error instanceof Error ? error.message : "Internal Server Error";
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ message }));
      });
  };

  return { app, httpServer: createServer(app) };
}
