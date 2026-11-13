import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchWithTimeout,
  OutboundHttpTimeoutError,
  promiseWithTimeout,
} from "../src/lib/outbound-http";

function neverRespondingFetch(): typeof fetch {
  return ((_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("The outbound request did not receive an abort signal."));
        return;
      }
      const abort = () => reject(signal.reason);
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    })) as typeof fetch;
}

test("fetchWithTimeout aborts a stalled HTTP request and returns a safe timeout error", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    fetchWithTimeout(
      "https://provider.example.test/never-responds",
      { headers: { Authorization: "Bearer private-token" } },
      15,
      neverRespondingFetch(),
    ),
    (error: unknown) => {
      assert.ok(error instanceof OutboundHttpTimeoutError);
      assert.equal(error.code, "ETIMEDOUT");
      assert.equal(error.timeoutMs, 15);
      assert.doesNotMatch(error.message, /provider\.example\.test|private-token/);
      return true;
    },
  );
  assert.ok(Date.now() - startedAt < 1_000);
});

test("promiseWithTimeout bounds SDK promises without abort-signal support", async () => {
  await assert.rejects(
    promiseWithTimeout(new Promise<Response>(() => {}), 15),
    (error: unknown) => error instanceof OutboundHttpTimeoutError,
  );
});
