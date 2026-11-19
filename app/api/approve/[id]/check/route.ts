// GET /api/approve/<id>/check: confirm the approval signature onchain and mark it approved.
// Returns { status: "approved" | "pending" | "invalid", ... }. Safe to poll.
import { NextResponse } from "next/server";
import { checkApproval } from "@/lib/approvals";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid approval id" }, { status: 400 });
  try {
    const result = await checkApproval(id);
    return NextResponse.json(result, { status: result.status === "invalid" ? 422 : 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
