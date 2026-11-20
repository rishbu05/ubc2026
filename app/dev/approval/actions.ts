"use server";
// Server action for the /dev/approval test page. Creates a real (pending) approval row.
// Gated by ENABLE_DEV_PAGES so it can be switched off for public demos.
import { createApproval } from "@/lib/approvals";

export type CreateTestApprovalResult =
  | { ok: true; id: number; amountUsdc: number; description: string; url: string }
  | { ok: false; error: string };

export async function createTestApproval(input: {
  description: string;
  amountUsdc: number;
}): Promise<CreateTestApprovalResult> {
  if (process.env.ENABLE_DEV_PAGES !== "true") return { ok: false, error: "Dev pages are disabled" };
  const description = input.description.trim().slice(0, 150);
  const amountUsdc = Number(input.amountUsdc);
  if (!description) return { ok: false, error: "Description is required" };
  if (!(amountUsdc > 0) || amountUsdc > 1000) return { ok: false, error: "Amount must be between 0 and 1000" };
  try {
    const { approval, url } = await createApproval({ description: `TEST: ${description}`, amountUsdc });
    return { ok: true, id: approval.id, amountUsdc, description: approval.description, url };
  } catch (e) {
    // Server action errors are masked in production, so return the message explicitly.
    return { ok: false, error: (e as Error).message };
  }
}
