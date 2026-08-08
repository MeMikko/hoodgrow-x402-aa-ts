# x402-aa-wallet

**The easiest way for an ERC-4337 / account-abstraction agent to pay x402
API calls — with a dedicated, non-custodial EOA, since its smart-wallet
signature doesn't work with x402 yet.**

A lightweight, TypeScript-first SDK: generate a spend wallet, fund it from
your agent's own smart wallet, and every request through it pays x402
(HTTP 402) challenges automatically — retried and returned, no manual
handling — against **any** x402 merchant. Originally built for
[HoodGrow](https://www.hoodgrow.com) (see "Sponsored by" below), and works
the same way against any other x402 API.

```mermaid
flowchart LR
    A[AI Agent] --> B[Request API]
    B --> C[402 Payment Required]
    C --> D[x402Fetch pays automatically]
    D --> E[Retry request]
    E --> F[Response]
```

## Features

- 🤖 Built for ERC-4337 / account-abstraction agents
- 💳 Automatic x402 payment handling — detect a 402, pay, retry, transparently
- 💰 Optional `maxAmountUsd` spend cap — a real enforcement boundary, not just a docs warning
- 🔒 Non-custodial — the private key never leaves your process, and isn't even enumerable on the returned object (safe to log the wallet by accident)
- ⚡ Minimal dependencies (`viem` + `@x402/*`)
- 🌐 Works against any x402-compatible API
- 📦 TypeScript-first, with full types included
- 🐍 Python implementation also available (see Related projects)

## Installation

```bash
npm install x402-aa-wallet
```

> Formerly published as `hoodgrow-x402-aa` — same code, same maintainers,
> new name to reflect that it's a general-purpose x402 utility, not a
> HoodGrow-specific client. See "Sponsored by" below.

## Quick start

```ts
import { createSpendWallet, getUsdcBalance, x402Fetch } from "x402-aa-wallet";

// 1. Generate a dedicated spend wallet — locally, once.
const wallet = createSpendWallet();
console.log("fund this address:", wallet.address);
// store wallet.privateKey yourself (env var / secret manager) — this
// library never sees it again after this call returns.

// 2. Fund `wallet.address` with a little USDC on Base — from your agent's
//    own smart wallet, using its own transfer/send call (not this library).

// 3. Check the balance whenever you want to know if it needs topping up.
const balance = await getUsdcBalance(wallet.address);

// 4. Pay any x402 endpoint with it — payment happens automatically.
//    maxAmountUsd is optional but strongly recommended for autonomous use:
//    it refuses to pay any single challenge above this amount instead of
//    trusting whatever the server's 402 response asks for.
const fetchWithPayment = x402Fetch(wallet, { maxAmountUsd: 0.5 });

// First call: HoodGrow's own hello-world endpoint — $0.001, no API key, a
// real 402 challenge and settlement so you can watch the whole flow work.
const ping = await fetchWithPayment("https://www.hoodgrow.com/api/agent/ping");
console.log(await ping.json());

// Then: real data, same wallet, same call shape.
const res = await fetchWithPayment("https://www.hoodgrow.com/api/agent/token/NVDA");
console.log(await res.json());
```

Restarting your agent? Rehydrate the same wallet from the key you stored:

```ts
import { spendWalletFromPrivateKey } from "x402-aa-wallet";

const wallet = spendWalletFromPrivateKey(YOUR_STORED_PRIVATE_KEY);
```

## Why this exists

x402's "exact" EVM scheme settles payment via an EIP-3009 ECDSA signature,
which an account-abstraction owner key (often a P256/WebAuthn passkey, or
even secp256k1 but the wrong address) usually can't produce — full
ERC-1271/ERC-6492 smart-wallet support is still an open, unshipped
facilitator feature (see
[coinbase/x402#639](https://github.com/coinbase/x402/issues/639)). The fix
is giving the agent a small, dedicated EOA it funds itself, purely for
x402 spending. Full writeup:
[hoodgrow.com/blog/x402-account-abstraction-eoa](https://www.hoodgrow.com/blog/x402-account-abstraction-eoa).

## Non-custodial — read this before using it

**We never see your private key. Nobody does but you.**

- `createSpendWallet()` generates a fresh secp256k1 keypair *entirely
  inside your own process*, using viem's `generatePrivateKey`. Nothing is
  transmitted, logged, or persisted by this library.
- The private key is returned to you once, in memory. Store it yourself
  (env var, secret manager) — this library keeps no copy after the call
  returns.
- The returned `SpendWallet.privateKey` is a non-enumerable property:
  `wallet.privateKey` still works, but `console.log(wallet)`,
  `JSON.stringify(wallet)`, and most structured loggers/error
  serializers/Sentry breadcrumbs skip it automatically — one less way an
  accidental log line leaks a key.
- Funding the spend wallet is **your** agent's job, using **your** agent's
  own smart-wallet infrastructure. This library never moves funds itself —
  it only tells you the address to send to and (via `getUsdcBalance`) how
  much is there.
- The published package is open source. Don't trust this description —
  read `src/`, it's short.

## Spend cap

`x402Fetch`'s second argument accepts `maxAmountUsd`:

```ts
const fetchWithPayment = x402Fetch(wallet, { maxAmountUsd: 0.10 });
```

Without it, `x402Fetch` pays whatever a 402 response asks for — a
misbehaving or compromised merchant returning a much larger amount than
expected gets paid in full, silently. With `maxAmountUsd` set, a payment
requirement above the cap is filtered out before signing (via a real
`x402Client` policy, not a client-side amount check bolted on after the
fact), and if that leaves nothing payable, the call throws instead of
proceeding. Assumes the asset is USDC (6 decimals) — the only asset x402's
"exact" scheme settles today.

## API

| Function | Returns |
| --- | --- |
| `createSpendWallet()` | A new `SpendWallet { address, privateKey, account }` |
| `spendWalletFromPrivateKey(key)` | Rehydrates a `SpendWallet` from a key you already have |
| `getUsdcBalance(address, rpcUrl?)` | USDC balance (number, human units) on Base |
| `x402Fetch(wallet, options?)` | A `fetch`-compatible function that auto-pays x402 challenges — `wallet` can be a `SpendWallet`, a viem `LocalAccount`, or a raw private key string. `options: { maxAmountUsd?, network? }` — see "Spend cap" above; `network` overrides the default `eip155:8453` (Base mainnet) |

## Use cases

- AI assistants and copilots
- MCP servers
- Autonomous agents built on ERC-4337 smart wallets
- Multi-agent systems
- Research agents
- Trading bots
- Automation workflows

## Payment safety

Every payment `x402Fetch` makes is real USDC on Base mainnet — not
reversible. Only fund the spend wallet with what you're willing to spend,
and never reuse an EOA that also holds funds you care about for anything
else. Set `maxAmountUsd` (see "Spend cap" above) for any autonomous/agent
use — don't rely on funding discipline alone as the only safety boundary.

## Sponsored by

Built and maintained by the team behind
[HoodGrow](https://www.hoodgrow.com) — stock token data for Robinhood
Chain — to pay their own [x402-protected API](https://www.hoodgrow.com/api-access).
Released as a standalone, general-purpose tool because the AA/x402 gap
this solves isn't specific to HoodGrow.

## Related projects

Once your agent has a wallet that pays for itself, the next step is an
agent that already knows what to call:

- [hoodgrow-mcp](https://www.npmjs.com/package/hoodgrow-mcp) — an MCP
  server for HoodGrow's stock-token API. Free tier, no signup required for
  a key.
- [x402-aa-wallet](https://pypi.org/project/x402-aa-wallet/) — Python
  implementation of this package
- [x402](https://www.x402.org) — the HTTP 402 payment protocol

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (mocked fetch, no network)
```

## License

MIT
