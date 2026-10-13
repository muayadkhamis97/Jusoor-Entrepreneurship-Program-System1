import assert from "node:assert/strict";
import { test } from "node:test";
import { grantReceiptStatus, totalGrantReceived } from "../src/lib/grant-ledger";

test("sums dated grant installments and correction reversals in cents", () => {
  assert.equal(totalGrantReceived([
    { kind: "received", amount: 1250.25 },
    { kind: "received", amount: 749.75 },
    { kind: "reversal", amount: 50.25 },
  ]), 1949.75);
});

test("classifies grant funding progress without treating missing amounts as zero awards", () => {
  assert.equal(grantReceiptStatus(null, 0), "amount_needed");
  assert.equal(grantReceiptStatus(0, 0), "amount_needed");
  assert.equal(grantReceiptStatus(1000, 0), "not_received");
  assert.equal(grantReceiptStatus(1000, 500), "partially_received");
  assert.equal(grantReceiptStatus(1000, 1000), "received");
  assert.equal(grantReceiptStatus(1000, 1001), "over_received");
});

test("rejects an unknown ledger entry kind instead of silently counting it", () => {
  assert.throws(() => totalGrantReceived([{ kind: "other", amount: 100 }]));
});
