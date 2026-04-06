import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Pool as PgPool } from "pg";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";
import { createTestDb } from "../test-helpers.js";

const TEST_VAPID_PUBLIC_KEY = "test-vapid-public-key";
const TEST_VAPID_PRIVATE_KEY = "test-vapid-private-key";

function makeAgent(pool: PgPool) {
  const { app } = createApp(pool);
  return makeRequestAgent(app);
}

// ── GET /api/push/vapid-key ───────────────────────────────────────────────────

describe("GET /api/push/vapid-key", () => {
  let agent: RequestAgent;
  const originalPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;

  before(async () => {
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID_PRIVATE_KEY;
    const pool = await createTestDb();
    agent = makeAgent(pool);
  });

  after(() => {
    if (originalPublicKey === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = originalPublicKey;
    }
    if (originalPrivateKey === undefined) {
      delete process.env.VAPID_PRIVATE_KEY;
    } else {
      process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
    }
  });

  it("returns a non-empty key string", async () => {
    const res = await agent.get("/api/push/vapid-key");
    assert.equal(res.status, 200);
    assert.equal(res.body.key, TEST_VAPID_PUBLIC_KEY);
  });
});

// ── POST /api/push/subscribe + /unsubscribe ───────────────────────────────────

describe("push subscription endpoints", () => {
  let agent: RequestAgent;
  const endpoint = "https://fcm.googleapis.com/fcm/send/test-sub";
  const keys = { p256dh: "p256key", auth: "authkey" };
  const originalPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;

  before(async () => {
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID_PUBLIC_KEY;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID_PRIVATE_KEY;
    const pool = await createTestDb();
    agent = makeAgent(pool);
  });

  after(() => {
    if (originalPublicKey === undefined) {
      delete process.env.VAPID_PUBLIC_KEY;
    } else {
      process.env.VAPID_PUBLIC_KEY = originalPublicKey;
    }
    if (originalPrivateKey === undefined) {
      delete process.env.VAPID_PRIVATE_KEY;
    } else {
      process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
    }
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

  it("POST /api/push/subscribe rejects untrusted endpoints", async () => {
    const res = await agent
      .post("/api/push/subscribe")
      .send({ endpoint: "https://attacker.example.com/push", keys });
    assert.equal(res.status, 400);
    assert.match(String((res.body as { error?: string }).error), /trusted web-push provider/i);
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

  it("POST /api/push/unsubscribe rejects untrusted endpoints", async () => {
    const res = await agent
      .post("/api/push/unsubscribe")
      .send({ endpoint: "https://attacker.example.com/push" });
    assert.equal(res.status, 400);
  });
});
