import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { base } from "viem/chains";

/** Base mainnet USDC balance check — use this to decide when your agent's
 * spend wallet needs topping up from its main smart wallet. */

export const DEFAULT_BASE_RPC_URL = "https://mainnet.base.org";
export const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

export async function getUsdcBalance(
  address: `0x${string}`,
  rpcUrl: string = DEFAULT_BASE_RPC_URL
): Promise<number> {
  const client = createPublicClient({ chain: base, transport: http(rpcUrl) });
  const raw = await client.readContract({
    address: USDC_BASE_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
  });
  return Number(formatUnits(raw, 6)); // USDC has 6 decimals
}
