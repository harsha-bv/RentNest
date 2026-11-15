import assert from "node:assert/strict";
import test from "node:test";
import {
  isDeliverableEmailResult,
  validateEmailDeliverability,
} from "./validateEmailDeliverability.js";

const deliverableAddress = {
  deliverability: "DELIVERABLE",
  is_valid_format: true,
  is_mx_found: true,
  is_smtp_valid: true,
  is_disposable_email: false,
  is_catchall_email: false,
};

test("accepts an existing, deliverable, non-disposable mailbox", () => {
  assert.equal(isDeliverableEmailResult(deliverableAddress), true);
});

test("rejects nonexistent, disposable, and catch-all mailboxes", () => {
  assert.equal(isDeliverableEmailResult({ ...deliverableAddress, is_smtp_valid: false }), false);
  assert.equal(isDeliverableEmailResult({ ...deliverableAddress, is_disposable_email: true }), false);
  assert.equal(isDeliverableEmailResult({ ...deliverableAddress, is_catchall_email: true }), false);
  assert.equal(isDeliverableEmailResult({ ...deliverableAddress, deliverability: "UNDELIVERABLE" }), false);
});

test("fails closed when the provider API key is missing", async () => {
  const originalKey = process.env.ABSTRACT_API_KEY;
  delete process.env.ABSTRACT_API_KEY;
  try {
    await assert.rejects(
      validateEmailDeliverability("renter@gmail.com"),
      /Set ABSTRACT_API_KEY/,
    );
  } finally {
    if (originalKey === undefined) delete process.env.ABSTRACT_API_KEY;
    else process.env.ABSTRACT_API_KEY = originalKey;
  }
});

test("uses Abstract's email validation endpoint before accepting an address", async () => {
  const originalKey = process.env.ABSTRACT_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.ABSTRACT_API_KEY = "unit-test-key";
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    assert.equal(url.origin, "https://emailvalidation.abstractapi.com");
    assert.equal(url.pathname, "/v1/");
    assert.equal(url.searchParams.get("api_key"), "unit-test-key");
    assert.equal(url.searchParams.get("email"), "renter@gmail.com");
    return { ok: true, json: async () => deliverableAddress };
  };
  try {
    assert.equal(await validateEmailDeliverability("renter@gmail.com"), true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ABSTRACT_API_KEY;
    else process.env.ABSTRACT_API_KEY = originalKey;
  }
});
