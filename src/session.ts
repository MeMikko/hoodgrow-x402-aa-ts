import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import type { LocalAccount } from "viem";

import { spendWalletFromPrivateKey, type SpendWallet } from "./wallet.js";

/** Base mainnet, CAIP-2 form — the only network today's x402 facilitators
 * settle EOA payments on for this scheme. */
export const NETWORK = "eip155:8453";

function isSpendWallet(w: SpendWallet | LocalAccount | `0x${string}`): w is SpendWallet {
  return typeof w === "object" && "account" in w;
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
 */
export function x402Fetch(wallet: SpendWallet | LocalAccount | `0x${string}`): typeof fetch {
  const account: LocalAccount =
    typeof wallet === "string"
      ? spendWalletFromPrivateKey(wallet).account
      : isSpendWallet(wallet)
        ? wallet.account
        : wallet;

  const client = new x402Client().register(NETWORK, new ExactEvmScheme(account));
  return wrapFetchWithPayment(fetch, client);
}
