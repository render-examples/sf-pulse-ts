import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertSafeFetchTarget } from "./http.js";

describe("assertSafeFetchTarget()", () => {
  it("accepts public https targets", async () => {
    const url = await assertSafeFetchTarget(
      "https://example.com/menu",
      async () => [{ address: "93.184.216.34", family: 4 }],
    );

    assert.equal(url.toString(), "https://example.com/menu");
  });

  it("rejects localhost hostnames", async () => {
    await assert.rejects(
      () =>
        assertSafeFetchTarget(
          "http://localhost:8080/admin",
          async () => [{ address: "127.0.0.1", family: 4 }],
        ),
      /hostname is blocked/,
    );
  });

  it("rejects private IPv4 literals", async () => {
    await assert.rejects(
      () => assertSafeFetchTarget("http://10.0.0.8/private"),
      /public IP/,
    );
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    await assert.rejects(
      () =>
        assertSafeFetchTarget(
          "https://menu.example.com",
          async () => [{ address: "192.168.1.10", family: 4 }],
        ),
      /public IPs/,
    );
  });
});
