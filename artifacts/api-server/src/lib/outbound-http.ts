export class OutboundHttpTimeoutError extends Error {
  readonly code = "ETIMEDOUT";
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Outbound request timed out after ${timeoutMs} ms.`);
    this.name = "OutboundHttpTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isOutboundNetworkFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    if (current instanceof OutboundHttpTimeoutError || current instanceof TypeError) {
      return true;
    }
    if (typeof current !== "object") return false;
    const record = current as { cause?: unknown; code?: unknown };
    if (
      typeof record.code === "string" &&
      /^(?:ECONN|ETIMEDOUT|EAI_AGAIN|ENET|EHOST|ENOTFOUND|UND_ERR)/.test(record.code)
    ) return true;
    current = record.cause;
  }
  return false;
}

export const googleCalendarTokenTimeoutMs = 10_000;
export const googleCalendarProfileTimeoutMs = 10_000;
export const googleCalendarRevokeTimeoutMs = 10_000;
export const zoomTokenTimeoutMs = 10_000;
export const zoomRevokeTimeoutMs = 10_000;
export const zoomApiTimeoutMs = 20_000;
export const calendlyTokenTimeoutMs = 10_000;
export const calendlyProfileTimeoutMs = 10_000;
export const calendlyWebhookTimeoutMs = 20_000;
export const gmailProfileTimeoutMs = 10_000;
export const gmailSendTimeoutMs = 20_000;
export const gmailSentLookupTimeoutMs = 20_000;

const responseTimeoutSignals = new WeakMap<Response, AbortSignal>();

export function hasOutboundResponseTimedOut(response: Response): boolean {
  return responseTimeoutSignals.get(response)?.aborted ?? false;
}

function assertValidTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError("Outbound HTTP timeout must be a positive integer.");
  }
}

export async function fetchWithTimeout(
  input: Parameters<typeof globalThis.fetch>[0] | URL,
  init: RequestInit = {},
  timeoutMs: number,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<Response> {
  assertValidTimeout(timeoutMs);
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  try {
    const response = await fetchImplementation(input, { ...init, signal });
    responseTimeoutSignals.set(response, timeoutSignal);
    return response;
  } catch (error) {
    if (timeoutSignal.aborted && !init.signal?.aborted) {
      throw new OutboundHttpTimeoutError(timeoutMs);
    }
    throw error;
  }
}

/** Bounds SDK calls whose public API does not accept an AbortSignal. */
export function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  assertValidTimeout(timeoutMs);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new OutboundHttpTimeoutError(timeoutMs)),
      timeoutMs,
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
