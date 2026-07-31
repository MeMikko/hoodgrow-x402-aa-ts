import { test } from "node:test";
import assert from "node:assert/strict";

import { createSpendWallet, x402Fetch } from "../src/index.js";

function mockFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url);
  }) as typeof fetch;
}

async function withGlobalFetch<T>(fetchImpl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("x402Fetch passes through a non-402 response untouched, for a SpendWallet", async () => {
  const wallet = createSpendWallet();
  await withGlobalFetch(
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    async () => {
      const fetchWithPayment = x402Fetch(wallet);
      const res = await fetchWithPayment("https://example.com/free");
      assert.equal(res.status, 200);
    }
  );
});

test("x402Fetch accepts a raw private key string", async () => {
  const wallet = createSpendWallet();
  await withGlobalFetch(
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    async () => {
      const fetchWithPayment = x402Fetch(wallet.privateKey);
      const res = await fetchWithPayment("https://example.com/free");
      assert.equal(res.status, 200);
    }
  );
});

test("x402Fetch accepts a raw LocalAccount", async () => {
  const wallet = createSpendWallet();
  await withGlobalFetch(
    mockFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    async () => {
      const fetchWithPayment = x402Fetch(wallet.account);
      const res = await fetchWithPayment("https://example.com/free");
      assert.equal(res.status, 200);
    }
  );
});
