import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { Writable } from "node:stream";
import { after, test } from "node:test";
import pino from "pino";
import type { RequestHandler } from "express";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.NODE_ENV = "test";
process.env.TRUST_PROXY_HOPS ??= "1";
const { createApp } = await import("../src/app");

const noOpAuthentication: RequestHandler = (_req, _res, next) => next();
const servers: Server[] = [];
const priorTrustProxyHops = process.env.TRUST_PROXY_HOPS;

after(async () => {
  await Promise.all(servers.map(server => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
  if (priorTrustProxyHops === undefined) delete process.env.TRUST_PROXY_HOPS;
  else process.env.TRUST_PROXY_HOPS = priorTrustProxyHops;
});

async function createIpTestServer(hops: number) {
  process.env.TRUST_PROXY_HOPS = String(hops);
  const logLines: string[] = [];
  const logDestination = new Writable({
    write(chunk, _encoding, callback) {
      logLines.push(chunk.toString());
      callback();
    },
  });
  const requestLogger = pino({ level: "info" }, logDestination);
  const app = createApp({
    authenticationMiddleware: noOpAuthentication,
    requestLogger,
  });
  app.get("/__test/client-ip", (req, res) => {
    res.json({ ip: req.ip, ips: req.ips });
  });
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    logLines,
  };
}

function clientIpLog(logLines: string[], url: string): string[] {
  return logLines
    .map(line => JSON.parse(line) as { req?: { url?: string }; clientIp?: string })
    .filter(event => event.req?.url === url)
    .map(event => event.clientIp ?? "");
}

test("createApp trusts only the configured rightmost proxy hops and logs req.ip", async () => {
  const { origin, logLines } = await createIpTestServer(1);
  const forwarded = await fetch(`${origin}/__test/client-ip`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
  assert.deepEqual(await forwarded.json(), { ip: "203.0.113.9", ips: ["203.0.113.9"] });

  const clientInjectedLeftmost = await fetch(`${origin}/__test/client-ip`, {
    headers: { "x-forwarded-for": "198.51.100.7, 203.0.113.9" },
  });
  assert.deepEqual(await clientInjectedLeftmost.json(), {
    ip: "203.0.113.9",
    ips: ["203.0.113.9"],
  });

  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(clientIpLog(logLines, "/__test/client-ip"), [
    "203.0.113.9",
    "203.0.113.9",
  ]);
});

test("createApp ignores forwarded addresses when TRUST_PROXY_HOPS is zero", async () => {
  const { origin, logLines } = await createIpTestServer(0);
  const response = await fetch(`${origin}/__test/client-ip`, {
    headers: { "x-forwarded-for": "203.0.113.9" },
  });
  const body = await response.json() as { ip: string; ips: string[] };
  assert.notEqual(body.ip, "203.0.113.9");
  assert.deepEqual(body.ips, []);

  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(clientIpLog(logLines, "/__test/client-ip"), [body.ip]);
});
