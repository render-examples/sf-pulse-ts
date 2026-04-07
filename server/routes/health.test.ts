import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { makeRequestAgent, type RequestAgent } from "../test-agent.js";

describe("GET /api/healthz", () => {
  let agent: RequestAgent;

  before(() => {
    const { app } = createApp();
    agent = makeRequestAgent(app);
  });

  it("returns a lightweight process health response", async () => {
    const res = await agent.get("/api/healthz");
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});
