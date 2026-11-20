// Solana Pay link helpers. Client-safe (no secrets): used by server routes and ApprovalModal.
import { encodeURL } from "@solana/pay";

/**
 * Public base URL for Solana Pay links. Wallets (Phantom) must be able to reach it, so it is the
 * deployed URL even when running locally. Falls back to NEXT_PUBLIC_APP_URL.
 */
export function solanaPayBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SOLANA_PAY_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000"
  );
}

/** `solana:https://.../api/approve/<id>` transaction-request link for approval #id. */
export function approvalLink(id: number): string {
  return encodeURL({
    link: new URL(`/api/approve/${id}`, solanaPayBaseUrl()),
    label: "Allowance",
    message: `Approve agent request #${id}`,
  }).toString();
}

/** Memo text the approval transaction carries. Must match lib/approvals.ts verification. */
export function approvalMemo(a: { id: number; description: string }): string {
  return `approve #${a.id}: ${a.description}`.slice(0, 200);
}
