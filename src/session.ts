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

/**
 * Circle's own native USDC contract addresses, keyed by CAIP-2 network —
 * every one is 6 decimals (Circle mandates this across all its official
 * deployments, unlike third-party bridged/wrapped variants elsewhere).
 * `PaymentRequirements.asset` is just an address; nothing about the x402
 * protocol guarantees it points at one of these. `maxAmountUsdPolicy`
 * only applies the USDC_DECIMALS-based cap to a requirement whose asset
 * matches an entry here — anything else is excluded rather than
 * evaluated with a guessed decimal count. Getting decimals wrong in
 * either direction is bad, but guessing UNDER the real value (e.g.
 * treating an 18-decimal asset's raw amount as if it were 6-decimal)
 * makes a genuinely large charge look small enough to pass the cap —
 * that failure mode is worse than refusing to pay an asset this policy
 * can't verify, so unknown assets fail closed.
 */
const KNOWN_USDC_ADDRESSES: Partial<Record<Network, string>> = {
  "eip155:8453": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // Base mainnet
  "eip155:84532": "0x036cbd53842c5426634e7929541ec2318f3dcf7e", // Base Sepolia
};

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
    const affordable = requirements.filter((r) => {
      const knownUsdc = KNOWN_USDC_ADDRESSES[r.network];
      if (!knownUsdc || r.asset.toLowerCase() !== knownUsdc) return false;
      return BigInt(r.amount) <= capAtomic;
    });
    if (affordable.length === 0 && requirements.length > 0) {
      const asked = requirements
        .map((r) => {
          const knownUsdc = KNOWN_USDC_ADDRESSES[r.network];
          const reason =
            !knownUsdc || r.asset.toLowerCase() !== knownUsdc
              ? "unrecognized asset, decimals not verified"
              : "over cap";
          return `${r.amount} atomic units of ${r.asset} on ${r.network} (${reason})`;
        })
        .join(", ");
      throw new Error(
        `x402Fetch: every payment option (${asked}) exceeds the configured maxAmountUsd cap of $${maxAmountUsd}, or is on an asset this policy can't verify — refusing to pay. ` +
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
