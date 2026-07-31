import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_BASE_RPC_URL, getUsdcBalance } from "../src/balance.js";

/** Minimal mock of the global fetch viem's http transport calls internally. */
function mockFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init);
  }) as typeof fetch;
}

function withGlobalFetch<T>(fetchImpl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

const ADDRESS = "0x1234567890123456789012345678901234567890" as const;

test("getUsdcBalance decodes a 6-decimal result", async () => {
  // 12500000 raw units == 12.5 USDC (6 decimals) == 0xbebc20.
  await withGlobalFetch(
    mockFetch((url) => {
      assert.equal(url.replace(/\/$/, ""), DEFAULT_BASE_RPC_URL);
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(58)}bebc20` }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }),
    async () => {
      const balance = await getUsdcBalance(ADDRESS);
      assert.equal(balance, 12.5);
    }
  );
});

test("getUsdcBalance calls eth_call against the USDC contract with balanceOf(address)", async () => {
  let capturedBody: Record<string, unknown> | null = null;
  await withGlobalFetch(
    mockFetch((_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: `0x${"0".repeat(64)}` }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }),
    () => getUsdcBalance(ADDRESS)
  );
  assert.equal(capturedBody?.method, "eth_call");
  const params = capturedBody?.params as [{ to: string; data: string }, string];
  assert.match(params[0].data, /^0x70a08231/); // balanceOf(address) selector
  assert.ok(params[0].data.toLowerCase().endsWith(ADDRESS.slice(2).toLowerCase()));
});
