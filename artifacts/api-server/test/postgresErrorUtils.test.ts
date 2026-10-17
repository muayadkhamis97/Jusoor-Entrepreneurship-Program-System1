import assert from "node:assert/strict";
import test from "node:test";
import { hasPostgresErrorCode } from "../src/lib/postgres-error-utils";

test("finds PostgreSQL error codes wrapped in nested causes", () => {
  const error = new Error("Query failed", {
    cause: new Error("Driver error", { cause: { code: "42P01" } }),
  });

  assert.equal(hasPostgresErrorCode(error, "42P01"), true);
});

test("does not classify unrelated or cyclic errors as missing relations", () => {
  const error = { code: "23505" } as { code: string; cause?: unknown };
  error.cause = error;

  assert.equal(hasPostgresErrorCode(error, "42P01"), false);
});
