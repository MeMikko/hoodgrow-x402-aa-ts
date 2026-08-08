import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import type { Network, PaymentRequirements } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { LocalAccount } from "viem";

import { spendWalletFromPrivateKey, type SpendWallet } from "./wallet.js";

/** Base mainnet, CAIP-2 form — the default network, and the only one
 * registered unless `options.network` overrides it. */
export const NETWORK: Network = "eip155:8453";

/** USDC's own decimals on every chain x402 currently settles on (Base
 * included) — used to convert a human `maxAmountUsd` into the atomic
 * units `PaymentRequirements.amount` is expressed in. */
const USDC_DECIMALS = 6;

function isSpendWallet(w: SpendWallet | LocalAccount | `0x${string}`): w is SpendWallet {
  return typeof w === "object" && "account" in w;
}

export interface X402FetchOptions {
  /**
   * Refuse to pay any single 402 challenge above this USD amount (assumes
   * the asset is USDC, the only asset x402's "exact" scheme settles today
   * — `PaymentRequirements.amount` is atomic units, so this converts
   * against `USDC_DECIMALS`). Without this, `x402Fetch` pays whatever the
   * server's 402 response asks for — a misbehaving or compromised
   * merchant returning e.g. `amount: "50000000"` ($50) instead of the
   * expected $0.05 gets paid in full, silently. Recommended for any
   * caller giving an agent autonomous spending — this is a real
   * enforcement boundary (a `PaymentPolicy` registered on the underlying
   * `x402Client`), not just a suggestion in a docstring: a requirement
   * over the cap is filtered out before signing, and if that leaves
   * nothing payable, the call throws instead of silently proceeding.
   */
  maxAmountUsd?: number;
  /** Override the network this wallet pays on — CAIP-2 form, e.g.
   * `"eip155:8453"` (Base) or `"solana:mainnet"`. Defaults to `NETWORK`
   * (Base mainnet). Only Base/EVM "exact"-scheme payments are supported
   * by this library today regardless of the value passed here — see the
   * README before assuming Solana works out of the box. */
  network?: Network;
}

function maxAmountUsdPolicy(maxAmountUsd: number) {
  const capAtomic = BigInt(Math.round(maxAmountUsd * 10 ** USDC_DECIMALS));
  return (_x402Version: number, requirements: PaymentRequirements[]): PaymentRequirements[] => {
    const affordable = requirements.filter((r) => BigInt(r.amount) <= capAtomic);
    if (affordable.length === 0 && requirements.length > 0) {
      const asked = requirements.map((r) => `${r.amount} atomic units on ${r.network}`).join(", ");
      throw new Error(
        `x402Fetch: every payment option (${asked}) exceeds the configured maxAmountUsd cap of $${maxAmountUsd} — refusing to pay. ` +
          "Raise maxAmountUsd if this charge is expected, or investigate why the server is asking for more than usual."
      );
    }
    return affordable;
  };
}

/**
 * A `fetch`-compatible function that transparently pays any HTTP 402 x402
 * challenge it hits, signing with `wallet` — works against ANY x402
 * "exact"-scheme merchant on Base mainnet, not just HoodGrow.
 *
 * @param wallet a `SpendWallet` (from `createSpendWallet`), a raw viem
 *   `LocalAccount`, or a private key hex string. Every payment this makes
 *   is real USDC on Base mainnet — only fund this wallet with what you're
 *   willing to spend, and never reuse an EOA that also holds other funds
 *   you care about.
 * @param options see {@link X402FetchOptions}. `maxAmountUsd` is strongly
 *   recommended for autonomous/agent use.
 */
export function x402Fetch(
  wallet: SpendWallet | LocalAccount | `0x${string}`,
  options?: X402FetchOptions
): typeof fetch {
  const account: LocalAccount =
    typeof wallet === "string"
      ? spendWalletFromPrivateKey(wallet).account
      : isSpendWallet(wallet)
        ? wallet.account
        : wallet;

  const client = new x402Client().register(options?.network ?? NETWORK, new ExactEvmScheme(account));
  if (options?.maxAmountUsd !== undefined) {
    client.registerPolicy(maxAmountUsdPolicy(options.maxAmountUsd));
  }
  return wrapFetchWithPayment(fetch, client);
}
