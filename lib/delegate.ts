// SPL delegate top-up: the agent pulls USDC from a user's token account into its own hot
// wallet, acting as the delegate the user approved (see components/DelegatePanel.tsx).
// Server-only: signs with the agent's Circle wallet.
import "server-only";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from "@solana/spl-token";
import { agentWeb3Signer } from "./circle";
import {
  USDC_DECIMALS,
  USDC_MINT,
  agentAddress,
  baseUnitsToUsdc,
  explorerTxUrl,
  getConnection,
  memoInstruction,
  usdcAta,
  usdcToBaseUnits,
} from "./solana";

export interface DelegationStatus {
  hasUsdcAccount: boolean;
  delegate: string | null;
  delegatedUsdc: number;
  balanceUsdc: number;
  agentIsDelegate: boolean;
}

/** getAccount, but with a readable error when the owner has no USDC token account. */
async function getUsdcAccount(owner: PublicKey) {
  try {
    return await getAccount(getConnection(), usdcAta(owner));
  } catch (e) {
    if (e instanceof TokenAccountNotFoundError) return null;
    throw e;
  }
}

/** Read the user's USDC account: who the delegate is and how much allowance remains. */
export async function getDelegation(owner: PublicKey): Promise<DelegationStatus> {
  const acct = await getUsdcAccount(owner);
  const agent = agentAddress();
  if (!acct) {
    return { hasUsdcAccount: false, delegate: null, delegatedUsdc: 0, balanceUsdc: 0, agentIsDelegate: false };
  }
  return {
    hasUsdcAccount: true,
    delegate: acct.delegate?.toBase58() ?? null,
    delegatedUsdc: baseUnitsToUsdc(acct.delegatedAmount),
    balanceUsdc: baseUnitsToUsdc(acct.amount),
    agentIsDelegate: !!acct.delegate?.equals(agent),
  };
}

/** User-facing memo text recorded onchain with every top-up. */
export function topUpMemo(reason: string): string {
  return `Allowance top-up: ${reason.trim()}`.slice(0, 500);
}

/**
 * The exact top-up transaction (unsigned): create the agent's USDC account if needed, then
 * transferChecked from the owner's account with the AGENT as authority (i.e. as delegate), plus
 * a Memo. No pre-checks here. Shared by topUpFromDelegate() and scripts/prove-revoked.ts.
 */
export async function buildTopUpTransaction(params: {
  owner: PublicKey;
  amount: bigint;
  reason: string;
}) {
  const conn = getConnection();
  const agent = agentAddress();
  const source = usdcAta(params.owner);
  const destination = usdcAta(agent);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: agent, blockhash, lastValidBlockHeight }).add(
    createAssociatedTokenAccountIdempotentInstruction(agent, destination, agent, USDC_MINT),
    createTransferCheckedInstruction(source, USDC_MINT, destination, agent, params.amount, USDC_DECIMALS),
    memoInstruction(topUpMemo(params.reason), [agent]),
  );
  return { tx, blockhash, lastValidBlockHeight, source, destination, agent };
}

/**
 * Transfer `amountUsdc` from `owner`'s USDC account to the agent's USDC account, signed by the
 * agent as delegate, with a Memo "Allowance top-up: <reason>".
 * The agent wallet pays the tx fee, so it needs a little devnet SOL.
 */
export async function topUpFromDelegate(params: {
  owner: PublicKey;
  amountUsdc: number | string;
  reason: string;
}) {
  const { owner, reason } = params;
  const amount = usdcToBaseUnits(params.amountUsdc);
  if (amount <= BigInt(0)) throw new Error("amountUsdc must be positive");
  if (!reason.trim()) throw new Error("reason is required");

  const agent = agentAddress();
  const source = usdcAta(owner);

  // Fail fast with a clear message instead of an opaque simulation error.
  // (Not the security boundary: the token program enforces delegate authority onchain.
  //  `npm run prove:revoked` demonstrates that by skipping this check.)
  const acct = await getUsdcAccount(owner);
  if (!acct) throw new Error(`${owner.toBase58()} has no devnet USDC token account`);
  if (!acct.delegate?.equals(agent)) {
    throw new Error(`Agent ${agent.toBase58()} is not the delegate on ${source.toBase58()}`);
  }
  if (acct.delegatedAmount < amount) {
    throw new Error(
      `Delegated allowance ${baseUnitsToUsdc(acct.delegatedAmount)} USDC < requested ${baseUnitsToUsdc(amount)} USDC`,
    );
  }

  const conn = getConnection();
  const { tx, blockhash, lastValidBlockHeight } = await buildTopUpTransaction({ owner, amount, reason });
  const signed = await agentWeb3Signer().signTransaction(tx);
  const signature = await conn.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
  const result = await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  if (result.value.err) {
    throw new Error(`Top-up ${signature} failed: ${JSON.stringify(result.value.err)}`);
  }

  return {
    signature,
    explorerUrl: explorerTxUrl(signature),
    amountUsdc: baseUnitsToUsdc(amount),
    from: owner.toBase58(),
    to: agent.toBase58(),
    reason,
    memo: topUpMemo(reason),
  };
}
