/**
 * Tests for server/sse.ts
 *
 * Pure unit tests — no database needed.
 * Uses a minimal Response-like mock to verify broadcast behaviour.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// We need to import the module freshly for each describe block so the
// `clients` Set is empty. Node's ESM cache prevents re-importing, so we
// test the module state across a single import instead.
import { addClient, broadcast } from "./sse.js";
import type { Response } from "express";

function mockRes() {
  const written: string[] = [];
  const listeners: Record<string, (() => void)[]> = {};
  return {
    written,
    write: (chunk: string) => { written.push(chunk); return true; },
    on: (event: string, cb: () => void) => {
      listeners[event] ??= [];
      listeners[event].push(cb);
    },
    emit: (event: string) => listeners[event]?.forEach((cb) => cb()),
  } as unknown as Response & { written: string[]; emit: (e: string) => void };
}

describe("broadcast()", () => {
  it("sends SSE-formatted payload to registered clients", () => {
    const res = mockRes();
    addClient(res);
    broadcast("restaurants", { action: "refresh" });
    assert.ok(
      (res as ReturnType<typeof mockRes>).written.some((w) =>
        w.includes("event: restaurants") && w.includes("refresh")
      )
    );
  });

  it("removes client on close event", () => {
    const res = mockRes() as ReturnType<typeof mockRes>;
    addClient(res);
    res.emit("close");
    // After close, broadcasting should not write to this client
    const before = res.written.length;
    broadcast("events", { action: "refresh" });
    assert.equal(res.written.length, before);
  });

  it("payload format is event:\\ndata:\\n\\n", () => {
    const res = mockRes() as ReturnType<typeof mockRes>;
    addClient(res);
    broadcast("test-event", { foo: "bar" });
    const last = res.written[res.written.length - 1];
    assert.ok(last.startsWith("event: test-event\n"), "starts with event line");
    assert.ok(last.includes("data: "), "contains data line");
    assert.ok(last.endsWith("\n\n"), "ends with double newline");
    const dataLine = last.split("\n").find((l) => l.startsWith("data: "))!;
    assert.deepEqual(JSON.parse(dataLine.slice(6)), { foo: "bar" });
  });
});
