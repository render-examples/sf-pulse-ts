import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { requireCronSecret } from "./middleware.js";

describe("requireCronSecret middleware", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("returns 503 when CRON_SECRET is not set", async () => {
    delete process.env.CRON_SECRET;
    const response = requireCronSecret(null);
    assert.equal(response?.status, 503);
    assert.deepEqual(await response?.json(), { error: "CRON_SECRET is not configured" });
  });

  it("calls next() when header matches secret", () => {
    process.env.CRON_SECRET = "s3cr3t";
    assert.equal(requireCronSecret("s3cr3t"), null);
  });

  it("returns 401 when secret is set and header is missing", () => {
    process.env.CRON_SECRET = "s3cr3t";
    assert.equal(requireCronSecret(undefined)?.status, 401);
  });

  it("returns 401 when secret is set and header is wrong", () => {
    process.env.CRON_SECRET = "s3cr3t";
    assert.equal(requireCronSecret("wrong")?.status, 401);
  });

  it("returns 401 when the header is provided multiple times", () => {
    process.env.CRON_SECRET = "s3cr3t";
    assert.equal(requireCronSecret(["s3cr3t", "wrong"])?.status, 401);
  });
});
