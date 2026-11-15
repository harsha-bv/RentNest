import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedEmailAddress } from "./emailAddress.js";

test("accepts a properly formatted email with a non-reserved domain", () => {
  assert.equal(isAllowedEmailAddress(" renter@gmail.com "), true);
});

test("rejects reserved example and test domains", () => {
  for (const address of ["renter@example.com", "renter@mail.example.org", "renter@sample.test", "renter@localhost"]) {
    assert.equal(isAllowedEmailAddress(address), false, `${address} should be rejected`);
  }
});

test("rejects malformed and overlong email addresses", () => {
  assert.equal(isAllowedEmailAddress("not-an-email"), false);
  assert.equal(isAllowedEmailAddress("renter@gmail.com."), false);
  assert.equal(isAllowedEmailAddress(`a${"b".repeat(250)}@gmail.com`), false);
});
