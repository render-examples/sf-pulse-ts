import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getPublicAppUrl,
  getVapidConfig,
  getVapidPublicKey,
  isTrustedPushEndpoint,
  serializeForInlineScript,
} from "./security.js";

describe("serializeForInlineScript()", () => {
  it("escapes closing script tags inside serialized JSON", () => {
    const serialized = serializeForInlineScript({
      title: "</script><script>alert('xss')</script>",
    });

    assert.ok(serialized.includes("\\u003C/script>\\u003Cscript>"));
    assert.ok(!serialized.includes("</script>"));
  });

  it("escapes unicode line separators that break inline scripts", () => {
    const serialized = serializeForInlineScript({ text: "hello\u2028world\u2029" });

    assert.ok(serialized.includes("\\u2028"));
    assert.ok(serialized.includes("\\u2029"));
  });
});

describe("getPublicAppUrl()", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppUrl = process.env.APP_URL;
  const originalRenderExternalUrl = process.env.RENDER_EXTERNAL_URL;
  const originalPort = process.env.PORT;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAppUrl === undefined) {
      delete process.env.APP_URL;
    } else {
      process.env.APP_URL = originalAppUrl;
    }
    if (originalRenderExternalUrl === undefined) {
      delete process.env.RENDER_EXTERNAL_URL;
    } else {
      process.env.RENDER_EXTERNAL_URL = originalRenderExternalUrl;
    }
    if (originalPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = originalPort;
    }
  });

  it("uses APP_URL when configured", () => {
    process.env.APP_URL = "https://sfpulse.example.com/";
    process.env.RENDER_EXTERNAL_URL = "https://sf-pulse.onrender.com";

    assert.equal(getPublicAppUrl(), "https://sfpulse.example.com");
  });

  it("falls back to RENDER_EXTERNAL_URL when APP_URL is absent", () => {
    delete process.env.APP_URL;
    process.env.RENDER_EXTERNAL_URL = "https://sf-pulse.onrender.com/";
    process.env.NODE_ENV = "production";

    assert.equal(getPublicAppUrl(), "https://sf-pulse.onrender.com");
  });

  it("falls back to a local URL outside production", () => {
    delete process.env.APP_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    process.env.NODE_ENV = "test";
    process.env.PORT = "7777";

    assert.equal(getPublicAppUrl(), "http://127.0.0.1:7777");
  });

  it("throws in production when neither APP_URL nor RENDER_EXTERNAL_URL is set", () => {
    delete process.env.APP_URL;
    delete process.env.RENDER_EXTERNAL_URL;
    process.env.NODE_ENV = "production";

    assert.throws(
      () => getPublicAppUrl(),
      /APP_URL or RENDER_EXTERNAL_URL must be configured in production/,
    );
  });
});

describe("isTrustedPushEndpoint()", () => {
  it("accepts major browser push providers", () => {
    assert.equal(
      isTrustedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"),
      true,
    );
    assert.equal(
      isTrustedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc"),
      true,
    );
    assert.equal(
      isTrustedPushEndpoint("https://web.push.apple.com/QH123"),
      true,
    );
  });

  it("rejects untrusted or non-https endpoints", () => {
    assert.equal(
      isTrustedPushEndpoint("https://attacker.example.com/push"),
      false,
    );
    assert.equal(
      isTrustedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc"),
      false,
    );
  });
});

describe("getVapidConfig()", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
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

  it("reads configured VAPID keys from the environment", () => {
    process.env.VAPID_PUBLIC_KEY = "public-key";
    process.env.VAPID_PRIVATE_KEY = "private-key";

    assert.deepEqual(getVapidConfig(), {
      publicKey: "public-key",
      privateKey: "private-key",
      subject: "mailto:sf-pulse@example.com",
    });
    assert.equal(getVapidPublicKey(), "public-key");
  });

  it("throws outside production when keys are missing", () => {
    process.env.NODE_ENV = "test";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    assert.throws(
      () => getVapidConfig(),
      /configured in the local environment/,
    );
  });

  it("throws in production when keys are missing", () => {
    process.env.NODE_ENV = "production";
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;

    assert.throws(
      () => getVapidConfig(),
      /VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured/,
    );
  });
});
