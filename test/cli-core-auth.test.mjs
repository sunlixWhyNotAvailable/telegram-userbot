import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cliCore from "../dist/cli-core.js";

const {
  buildTelegramQrLoginUrl,
  resolveAuthMethodSelection,
  shouldPrintSensitiveQrLoginUrl,
} = cliCore;

describe("resolveAuthMethodSelection", () => {
  it("defaults to phone-code login for empty input", () => {
    assert.equal(resolveAuthMethodSelection(""), "code");
    assert.equal(resolveAuthMethodSelection("   "), "code");
  });

  it("accepts numeric and named login methods", () => {
    assert.equal(resolveAuthMethodSelection("1"), "code");
    assert.equal(resolveAuthMethodSelection("code"), "code");
    assert.equal(resolveAuthMethodSelection("message"), "code");
    assert.equal(resolveAuthMethodSelection("telegram"), "code");

    assert.equal(resolveAuthMethodSelection("2"), "qr");
    assert.equal(resolveAuthMethodSelection("qr"), "qr");
    assert.equal(resolveAuthMethodSelection("qr-code"), "qr");
    assert.equal(resolveAuthMethodSelection("qrcode"), "qr");
  });

  it("returns undefined for unsupported selections", () => {
    assert.equal(resolveAuthMethodSelection("3"), undefined);
    assert.equal(resolveAuthMethodSelection("email"), undefined);
  });
});

describe("buildTelegramQrLoginUrl", () => {
  it("builds Telegram QR login URLs with base64url tokens", () => {
    const token = Buffer.from([ 251, 255, 255 ]);
    assert.equal(buildTelegramQrLoginUrl(token), "tg://login?token=-___");
  });
});

describe("shouldPrintSensitiveQrLoginUrl", () => {
  it("hides the sensitive fallback QR login URL by default", () => {
    assert.equal(shouldPrintSensitiveQrLoginUrl(undefined), false);
    assert.equal(shouldPrintSensitiveQrLoginUrl(""), false);
    assert.equal(shouldPrintSensitiveQrLoginUrl("0"), false);
    assert.equal(shouldPrintSensitiveQrLoginUrl("false"), false);
  });

  it("allows explicit opt-in values", () => {
    assert.equal(shouldPrintSensitiveQrLoginUrl("1"), true);
    assert.equal(shouldPrintSensitiveQrLoginUrl("true"), true);
    assert.equal(shouldPrintSensitiveQrLoginUrl("yes"), true);
    assert.equal(shouldPrintSensitiveQrLoginUrl("Y"), true);
  });
});
