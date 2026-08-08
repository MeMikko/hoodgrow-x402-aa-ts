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

/**
 * Builds a synthetic v2 402 response carrying a real PAYMENT-REQUIRED
 * header — base64(JSON.stringify(paymentRequired)), exactly what
 * @x402/core's encodePaymentRequiredHeader does (confirmed by reading its
 * source; not re-exported publicly, so replicated here rather than
 * imported) — so the test exercises the exact wire format HoodGrow's own
 * endpoints use (see @/lib/x402.ts's own 402 demo in the main app), not a
 * v1 JSON-body shortcut.
 */
function paymentRequiredResponse(amountAtomic: string): Response {
  const paymentRequired = {
    x402Version: 2,
    resource: { url: "https://example.com/paid", method: "GET" },
    accepts: [
      {
        scheme: "exact",
        network: "eip155:8453",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        amount: amountAtomic,
        payTo: "0x8520B3693a2Cf3c2bEa3a505Af3A9c1b093954c7",
        maxTimeoutSeconds: 60,
        // EIP-712 domain params for USDC's EIP-3009 transferWithAuthorization
        // signature — a real x402 server includes these; the scheme can't
        // sign without them.
        extra: { name: "USD Coin", version: "2" },
      },
    ],
  };
  const header = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
  return new Response(null, { status: 402, headers: { "PAYMENT-REQUIRED": header } });
}

test("x402Fetch pays a real 402 challenge and retries with a payment signature header", async () => {
  const wallet = createSpendWallet();
  let callCount = 0;
  let secondRequest: Request | null = null;

  const twoStepFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    callCount++;
    if (callCount === 1) {
      return paymentRequiredResponse("50000"); // $0.05 in USDC (6 decimals)
    }
    secondRequest = new Request(input, init);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  await withGlobalFetch(twoStepFetch, async () => {
    const fetchWithPayment = x402Fetch(wallet);
    const res = await fetchWithPayment("https://example.com/paid");
    assert.equal(res.status, 200);
  });

  assert.equal(callCount, 2, "expected an initial 402 call plus one paid retry");
  assert.ok(
    secondRequest && (secondRequest.headers.has("PAYMENT-SIGNATURE") || secondRequest.headers.has("X-PAYMENT")),
    "retry request should carry a payment signature header"
  );
});

test("x402Fetch with maxAmountUsd pays a challenge under the cap", async () => {
  const wallet = createSpendWallet();
  let callCount = 0;

  await withGlobalFetch(
    (async () => {
      callCount++;
      return callCount === 1
        ? paymentRequiredResponse("50000") // $0.05
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
    async () => {
      const fetchWithPayment = x402Fetch(wallet, { maxAmountUsd: 0.1 });
      const res = await fetchWithPayment("https://example.com/paid");
      assert.equal(res.status, 200);
    }
  );
  assert.equal(callCount, 2);
});

test("x402Fetch with maxAmountUsd refuses to pay a challenge over the cap", async () => {
  const wallet = createSpendWallet();

  await withGlobalFetch(
    (async () => paymentRequiredResponse("50000000")) as typeof fetch, // $50
    async () => {
      const fetchWithPayment = x402Fetch(wallet, { maxAmountUsd: 0.05 });
      await assert.rejects(
        () => fetchWithPayment("https://example.com/paid"),
        /exceeds the configured maxAmountUsd cap/
      );
    }
  );
});
