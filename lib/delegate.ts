// SPL delegate top-up: the agent pulls USDC from a user's token account into its own hot
// wallet, acting as the delegate the user approved (see components/DelegatePanel.tsx).
// Server-only: signs with the agent's Circle wallet.
import "server-only";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
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
  delegate: string | null;
  delegatedUsdc: number;
  balanceUsdc: number;
  agentIsDelegate: boolean;
}

/** Read the user's USDC account: who the delegate is and how much allowance remains. */
export async function getDelegation(owner: PublicKey): Promise<DelegationStatus> {
  const acct = await getAccount(getConnection(), usdcAta(owner));
  const agent = agentAddress();
  return {
    delegate: acct.delegate?.toBase58() ?? null,
    delegatedUsdc: baseUnitsToUsdc(acct.delegatedAmount),
    balanceUsdc: baseUnitsToUsdc(acct.amount),
    agentIsDelegate: !!acct.delegate?.equals(agent),
  };
}

/**
 * Transfer `amountUsdc` from `owner`'s USDC account to the agent's USDC account, signed by the
 * agent as delegate, with a Memo instruction carrying `reason`.
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

  const conn = getConnection();
  const agent = agentAddress();
  const source = usdcAta(owner);
  const destination = usdcAta(agent);

  // Fail fast with a clear message instead of an opaque simulation error.
  const acct = await getAccount(conn, source);
  if (!acct.delegate?.equals(agent)) {
    throw new Error(`Agent ${agent.toBase58()} is not the delegate on ${source.toBase58()}`);
  }
  if (acct.delegatedAmount < amount) {
    throw new Error(
      `Delegated allowance ${baseUnitsToUsdc(acct.delegatedAmount)} USDC < requested ${baseUnitsToUsdc(amount)} USDC`,
    );
  }

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: agent, blockhash, lastValidBlockHeight }).add(
    createAssociatedTokenAccountIdempotentInstruction(agent, destination, agent, USDC_MINT),
    createTransferCheckedInstruction(source, USDC_MINT, destination, agent, amount, USDC_DECIMALS),
    memoInstruction(`allowance top-up: ${reason}`.slice(0, 500), [agent]),
  );

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
  };
}
