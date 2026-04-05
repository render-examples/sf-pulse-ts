import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";

function makeAgent(pool: PgPool) {
  const { app } = createApp(pool);
  return makeRequestAgent(app);
}

// ── GET /api/push/vapid-key ───────────────────────────────────────────────────

describe("GET /api/push/vapid-key", () => {
  let agent: RequestAgent;

  before(async () => {
    const pool = await createTestDb();
    agent = makeAgent(pool);
  });

  it("returns a non-empty key string", async () => {
    const res = await agent.get("/api/push/vapid-key");
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.key === "string" && res.body.key.length > 0);
  });
});

// ── POST /api/push/subscribe + /unsubscribe ───────────────────────────────────

describe("push subscription endpoints", () => {
  let agent: RequestAgent;
  const endpoint = "https://push.example.com/test-sub";
  const keys = { p256dh: "p256key", auth: "authkey" };

  before(async () => {
    const pool = await createTestDb();
    agent = makeAgent(pool);
  });

  it("POST /api/push/subscribe returns the subscription", async () => {
    const res = await agent
      .post("/api/push/subscribe")
      .send({ endpoint, keys });
    assert.equal(res.status, 200);
    assert.equal(res.body.endpoint, endpoint);
  });

  it("POST /api/push/subscribe returns 400 when endpoint is missing", async () => {
    const res = await agent
      .post("/api/push/subscribe")
      .send({ keys });
    assert.equal(res.status, 400);
  });

  it("POST /api/push/subscribe returns 400 when keys are missing", async () => {
    const res = await agent
      .post("/api/push/subscribe")
      .send({ endpoint });
    assert.equal(res.status, 400);
  });

  it("POST /api/push/unsubscribe returns { ok: true }", async () => {
    const res = await agent
      .post("/api/push/unsubscribe")
      .send({ endpoint });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });

  it("POST /api/push/unsubscribe returns 400 when endpoint is missing", async () => {
    const res = await agent.post("/api/push/unsubscribe").send({});
    assert.equal(res.status, 400);
  });
});
