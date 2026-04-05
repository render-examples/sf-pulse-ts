import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { requireCronSecret } from "./middleware.js";

function makeReq(header?: string): Request {
  return { headers: { "x-cron-secret": header } } as unknown as Request;
}

function makeRes(): { statusCode: number | undefined; body: unknown; status: (n: number) => { json: (b: unknown) => void }; } {
  const res = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    status(n: number) {
      res.statusCode = n;
      return { json: (b: unknown) => { res.body = b; } };
    },
  };
  return res;
}

describe("requireCronSecret middleware", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 503 when CRON_SECRET is not set", () => {
    delete process.env.CRON_SECRET;
    let called = false;
    const next: NextFunction = () => { called = true; };
    const res = makeRes();
    requireCronSecret(makeReq(), res as unknown as Response, next);
    assert.ok(!called);
    assert.equal(res.statusCode, 503);
  });

  it("calls next() when header matches secret", () => {
    process.env.CRON_SECRET = "s3cr3t";
    let called = false;
    const next: NextFunction = () => { called = true; };
    const res = makeRes();
    requireCronSecret(makeReq("s3cr3t"), res as unknown as Response, next);
    assert.ok(called);
    assert.equal(res.statusCode, undefined);
  });

  it("returns 401 when secret is set and header is missing", () => {
    process.env.CRON_SECRET = "s3cr3t";
    let called = false;
    const next: NextFunction = () => { called = true; };
    const res = makeRes();
    requireCronSecret(makeReq(undefined), res as unknown as Response, next);
    assert.ok(!called);
    assert.equal(res.statusCode, 401);
  });

  it("returns 401 when secret is set and header is wrong", () => {
    process.env.CRON_SECRET = "s3cr3t";
    let called = false;
    const next: NextFunction = () => { called = true; };
    const res = makeRes();
    requireCronSecret(makeReq("wrong"), res as unknown as Response, next);
    assert.ok(!called);
    assert.equal(res.statusCode, 401);
  });
});
