/**
 * Tests for server/sse.ts
 *
 * Pure unit tests — no database needed.
 * Uses a minimal client mock to verify broadcast behaviour.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// We need to import the module freshly for each describe block so the
// `clients` Set is empty. Node's ESM cache prevents re-importing, so we
// test the module state across a single import instead.
import { addClient, broadcast } from "./sse.js";

function mockClient() {
  const written: string[] = [];
  const listeners: Record<string, (() => void)[]> = {};
  return {
    written,
    write: (chunk: string) => { written.push(chunk); return true; },
    onClose: (cb: () => void) => {
      listeners.close ??= [];
      listeners.close.push(cb);
    },
    on: (event: string, cb: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(cb);
    },
    emit: (event: string) => listeners[event]?.forEach((cb) => cb()),
  };
}

describe("broadcast()", () => {
  it("sends SSE-formatted payload to registered clients", async () => {
    const res = mockClient();
    addClient(res);
    await broadcast("restaurants", { action: "refresh" });
    assert.ok(res.written.some((w) => w.includes("event: restaurants") && w.includes("refresh")));
  });

  it("removes client on close event", async () => {
    const res = mockClient();
    addClient(res);
    res.emit("close");
    // After close, broadcasting should not write to this client
    const before = res.written.length;
    await broadcast("events", { action: "refresh" });
    assert.equal(res.written.length, before);
  });

  it("payload format is event:\\ndata:\\n\\n", async () => {
    const res = mockClient();
    addClient(res);
    await broadcast("test-event", { foo: "bar" });
    const last = res.written[res.written.length - 1];
    assert.ok(last.startsWith("event: test-event\n"), "starts with event line");
    assert.ok(last.includes("data: "), "contains data line");
    assert.ok(last.endsWith("\n\n"), "ends with double newline");
    const dataLine = last.split("\n").find((l) => l.startsWith("data: "))!;
    assert.deepEqual(JSON.parse(dataLine.slice(6)), { foo: "bar" });
  });
});
