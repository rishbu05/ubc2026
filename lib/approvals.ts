// Human approvals via Solana Pay. Server-only.
//
// 1. createApproval() inserts a pending row with a fresh reference pubkey and returns a
//    `solana:<APP_URL>/api/approve/<id>` transaction-request link (QR-able).
// 2. The wallet POSTs to /api/approve/<id>; buildApprovalTransaction() returns a memo tx
//    "approve #<id>: <description>" signed by the user, with the reference key attached.
// 3. checkApproval() finds the tx onchain by reference, verifies it succeeded, carries the exact
//    memo and was signed by the allowed approver, then marks the row approved.
import "server-only";
import { Keypair, PublicKey, SystemProgram, Transaction, type ParsedInstruction } from "@solana/web3.js";
import { address, createSolanaRpc } from "@solana/kit";
import { encodeURL, findReference, FindReferenceError } from "@solana/pay";
import { supabaseAdmin } from "./supabase";
import { MEMO_PROGRAM_ID, RPC_URL, explorerTxUrl, getConnection, memoInstruction } from "./solana";

export interface Approval {
  id: number;
  description: string;
  amount_usdc: string | null;
  resource_url: string | null;
  reference: string;
  approver: string | null;
  status: "pending" | "approved" | "rejected";
  signature: string | null;
  created_at: string;
  approved_at: string | null;
}

const MAX_MEMO = 200;

export function approvalMemo(a: Pick<Approval, "id" | "description">): string {
  return `approve #${a.id}: ${a.description}`.slice(0, MAX_MEMO);
}

/**
 * Public base URL for Solana Pay links. Wallets (Phantom) must be able to reach it, so it should
 * be the deployed URL even when running locally. Falls back to NEXT_PUBLIC_APP_URL.
 */
export function solanaPayBaseUrl(): string {
  return process.env.SOLANA_PAY_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function approvalLink(id: number): string {
  return encodeURL({
    link: new URL(`/api/approve/${id}`, solanaPayBaseUrl()),
    label: "Allowance",
    message: `Approve agent request #${id}`,
  }).toString();
}

export async function createApproval(input: {
  description: string;
  amountUsdc?: number;
  resourceUrl?: string;
  approver?: string;
}) {
  if (!input.description.trim()) throw new Error("description is required");
  if (input.approver) new PublicKey(input.approver); // validate

  const { data, error } = await supabaseAdmin()
    .from("approvals")
    .insert({
      description: input.description.trim(),
      amount_usdc: input.amountUsdc ?? null,
      resource_url: input.resourceUrl ?? null,
      approver: input.approver ?? null,
      reference: Keypair.generate().publicKey.toBase58(),
    })
    .select()
    .single<Approval>();
  if (error) throw new Error(`createApproval: ${error.message}`);
  return { approval: data, url: approvalLink(data.id) };
}

export async function getApproval(id: number): Promise<Approval | null> {
  const { data, error } = await supabaseAdmin()
    .from("approvals")
    .select()
    .eq("id", id)
    .maybeSingle<Approval>();
  if (error) throw new Error(`getApproval: ${error.message}`);
  return data;
}

/** Solana Pay transaction-request body: the unsigned memo tx for `account` to sign. */
export async function buildApprovalTransaction(approval: Approval, account: PublicKey) {
  if (approval.status !== "pending") throw new Error(`Approval #${approval.id} is ${approval.status}`);
  if (approval.approver && approval.approver !== account.toBase58()) {
    throw new Error(`Approval #${approval.id} must be signed by ${approval.approver}`);
  }

  // Memo v2 requires every account it receives to be a signer, so the (non-signer) reference
  // key rides on a 0-lamport self-transfer instead. findReference() locates the tx by it.
  const transferWithReference = SystemProgram.transfer({
    fromPubkey: account,
    toPubkey: account,
    lamports: 0,
  });
  transferWithReference.keys.push({
    pubkey: new PublicKey(approval.reference),
    isSigner: false,
    isWritable: false,
  });

  const memo = approvalMemo(approval);
  const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: account, blockhash, lastValidBlockHeight }).add(
    transferWithReference,
    memoInstruction(memo, [account]),
  );

  return {
    transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    message: memo,
  };
}

export type CheckResult =
  | { status: "approved"; signature: string; approver: string; explorerUrl: string }
  | { status: "pending" }
  | { status: "invalid"; reason: string; signature?: string };

/**
 * Onchain half of the check (no DB writes): find the tx by reference, then verify it succeeded,
 * carries the exact memo, and was signed by the allowed approver.
 */
export async function verifyApprovalOnchain(approval: Approval): Promise<CheckResult> {
  let signature: string;
  try {
    const found = await findReference(createSolanaRpc(RPC_URL), address(approval.reference), {
      commitment: "confirmed",
    });
    signature = found.signature;
  } catch (e) {
    if (e instanceof FindReferenceError) return { status: "pending" };
    throw e;
  }

  const tx = await getConnection().getParsedTransaction(signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) return { status: "pending" }; // seen by signature index but not yet fetchable
  if (tx.meta?.err) return { status: "invalid", reason: "Transaction failed onchain", signature };

  const expectedMemo = approvalMemo(approval);
  const memoIx = tx.transaction.message.instructions.find(
    (ix): ix is ParsedInstruction => ix.programId.equals(MEMO_PROGRAM_ID) && "parsed" in ix,
  );
  if (!memoIx || memoIx.parsed !== expectedMemo) {
    return { status: "invalid", reason: "Memo does not match approval", signature };
  }

  const signer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey.toBase58();
  if (!signer) return { status: "invalid", reason: "No signer", signature };
  if (approval.approver && approval.approver !== signer) {
    return { status: "invalid", reason: `Signed by ${signer}, expected ${approval.approver}`, signature };
  }
  return { status: "approved", signature, approver: signer, explorerUrl: explorerTxUrl(signature) };
}

/** Look for the signed approval onchain; mark it approved if valid. Idempotent. */
export async function checkApproval(id: number): Promise<CheckResult> {
  const approval = await getApproval(id);
  if (!approval) return { status: "invalid", reason: `Approval #${id} not found` };
  if (approval.status === "approved" && approval.signature) {
    return {
      status: "approved",
      signature: approval.signature,
      approver: approval.approver ?? "",
      explorerUrl: explorerTxUrl(approval.signature),
    };
  }
  if (approval.status !== "pending") return { status: "invalid", reason: `Approval is ${approval.status}` };

  const result = await verifyApprovalOnchain(approval);
  if (result.status !== "approved") return result;

  const { error } = await supabaseAdmin()
    .from("approvals")
    .update({
      status: "approved",
      signature: result.signature,
      approver: result.approver,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) throw new Error(`checkApproval update: ${error.message}`);
  return result;
}
