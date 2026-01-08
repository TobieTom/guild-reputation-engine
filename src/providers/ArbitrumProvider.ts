/**
 * Arbitrum Blockchain Data Provider
 *
 * Fetches on-chain data from Arbitrum One:
 * - ETH balance
 * - ARB token balance
 * - MAGIC token balance
 * - Transaction count (activity indicator)
 *
 * @author PineOT (Tobias)
 */

import { ethers } from 'ethers';

// Configuration from environment variables with defaults
const ARBITRUM_RPC = process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc';
const REQUEST_TIMEOUT_MS = parseInt(process.env.RPC_TIMEOUT_MS || '30000', 10);

// Token contract addresses on Arbitrum One (checksummed)
const ARB_TOKEN = '0x912CE59144191C1204E64559FE8253a0e49E6548';
const MAGIC_TOKEN = '0x539bdE0d7Dbd336b79148AA742883198BBF60342';

// Standard ERC20 ABI (minimal for balanceOf)
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
] as const;

export interface ArbitrumData {
  address: string;
  ethBalance: string;
  ethBalanceFormatted: string;
  arbBalance: string;
  arbBalanceFormatted: string;
  magicBalance: string;
  magicBalanceFormatted: string;
  transactionCount: number;
  timestamp: string;
}

/**
 * Validates and normalizes an Ethereum address
 * @throws Error if address is invalid
 */
function validateAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new Error('Address is required and must be a string');
  }

  const trimmed = address.trim();
  const preview = trimmed.length > 20 ? trimmed.substring(0, 20) + '...' : trimmed;

  if (!ethers.isAddress(trimmed)) {
    throw new Error(`Invalid Ethereum address format: ${preview}`);
  }

  // Return checksummed address
  return ethers.getAddress(trimmed);
}

/**
 * Fetch all Arbitrum blockchain data for a given wallet address
 * @param address - Ethereum address to query
 * @returns ArbitrumData object with balances and transaction count
 * @throws Error if address is invalid or RPC calls fail
 */
export async function getArbitrumData(address: string): Promise<ArbitrumData> {
  // Validate and normalize address
  const validatedAddress = validateAddress(address);

  // Create provider with timeout
  const provider = new ethers.JsonRpcProvider(ARBITRUM_RPC);

  // Create token contract instances
  const arbContract = new ethers.Contract(ARB_TOKEN, ERC20_ABI, provider);
  const magicContract = new ethers.Contract(MAGIC_TOKEN, ERC20_ABI, provider);

  // Fetch all data in parallel with timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('RPC request timeout')), REQUEST_TIMEOUT_MS);
  });

  const dataPromise = Promise.all([
    provider.getBalance(validatedAddress),
    arbContract.balanceOf(validatedAddress),
    magicContract.balanceOf(validatedAddress),
    provider.getTransactionCount(validatedAddress),
  ]);

  const [ethBalance, arbBalance, magicBalance, txCount] = await Promise.race([
    dataPromise,
    timeoutPromise,
  ]) as [bigint, bigint, bigint, number];

  // Format balances (ETH and tokens use 18 decimals)
  const ethFormatted = ethers.formatEther(ethBalance);
  const arbFormatted = ethers.formatUnits(arbBalance, 18);
  const magicFormatted = ethers.formatUnits(magicBalance, 18);

  return {
    address: validatedAddress,
    ethBalance: ethBalance.toString(),
    ethBalanceFormatted: ethFormatted,
    arbBalance: arbBalance.toString(),
    arbBalanceFormatted: arbFormatted,
    magicBalance: magicBalance.toString(),
    magicBalanceFormatted: magicFormatted,
    transactionCount: txCount,
    timestamp: new Date().toISOString(),
  };
}
