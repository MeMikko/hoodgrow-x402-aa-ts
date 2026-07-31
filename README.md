# hoodgrow-x402-aa

Give an ERC-4337 / account-abstraction agent a dedicated, non-custodial EOA
so it can pay [x402](https://www.x402.org) (HTTP 402) challenges — against
**any** x402 merchant, not just [HoodGrow](https://www.hoodgrow.com).

## Why this exists

x402's "exact" EVM scheme settles payments via EIP-3009
`transferWithAuthorization`, which recovers the payer's address from a
plain secp256k1 (ECDSA) signature. A smart-contract wallet's owner key is
often a P256/WebAuthn passkey (a different curve entirely — not
`ecrecover`-compatible), or even when it is a secp256k1 key, the recovered
address is the *owner's*, not the smart wallet's own address, which the
facilitator's `from`-address check rejects. Full ERC-1271/ERC-6492
smart-wallet support is an open, unshipped feature across today's x402
facilitators — see
[coinbase/x402#639](https://github.com/coinbase/x402/issues/639).

The fix isn't to route your AA wallet's signature through x402 directly —
it's to give your agent a small, **dedicated EOA** it funds itself (from
its own smart wallet, via its own existing send/transfer capability) purely
for x402 spending, separate from whatever wallet it uses for everything
else. That's what this package does.

```bash
npm i hoodgrow-x402-aa
```

## Non-custodial — read this before using it

**We never see your private key. Nobody does but you.**

- `createSpendWallet()` generates a fresh secp256k1 keypair *entirely
  inside your own process*, using viem's `generatePrivateKey`. Nothing is
  transmitted, logged, or persisted by this library.
- The private key is returned to you once, in memory. Store it yourself
  (env var, secret manager) — this library keeps no copy after the call
  returns.
- Funding the spend wallet is **your** agent's job, using **your** agent's
  own smart-wallet infrastructure. This library never moves funds itself —
  it only tells you the address to send to and (via `getUsdcBalance`) how
  much is there.
- The published package is open source. Don't trust this description —
  read `src/`, it's short.

## Quick start

```ts
import { createSpendWallet, getUsdcBalance, x402Fetch } from "hoodgrow-x402-aa";

// 1. Generate a dedicated spend wallet — locally, once.
const wallet = createSpendWallet();
console.log("fund this address:", wallet.address);
// store wallet.privateKey yourself (env var / secret manager) — we don't.

// 2. Fund `wallet.address` with a little USDC on Base from your agent's
//    own smart wallet (its own transfer/send call — not this library).

// 3. Check the balance whenever you want to know if it needs topping up.
const balance = await getUsdcBalance(wallet.address);

// 4. Pay any x402 endpoint with it.
const fetchWithPayment = x402Fetch(wallet);
const res = await fetchWithPayment("https://www.hoodgrow.com/api/agent/token/NVDA");
console.log(await res.json());
```

Restarting your agent? Rehydrate the same wallet from the key you stored:

```ts
import { spendWalletFromPrivateKey } from "hoodgrow-x402-aa";

const wallet = spendWalletFromPrivateKey(YOUR_STORED_PRIVATE_KEY);
```

## API

| Function | Returns |
| --- | --- |
| `createSpendWallet()` | A new `SpendWallet { address, privateKey, account }` |
| `spendWalletFromPrivateKey(key)` | Rehydrates a `SpendWallet` from a key you already have |
| `getUsdcBalance(address, rpcUrl?)` | USDC balance (number, human units) on Base |
| `x402Fetch(wallet)` | A `fetch`-compatible function that auto-pays x402 challenges — `wallet` can be a `SpendWallet`, a viem `LocalAccount`, or a raw private key string |

## Payment safety

Every payment `x402Fetch` makes is real USDC on Base mainnet — not
reversible. Only fund the spend wallet with what you're willing to spend,
and never reuse an EOA that also holds funds you care about for anything
else.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (mocked fetch, no network)
```

## License

MIT
