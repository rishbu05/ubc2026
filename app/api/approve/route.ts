// POST /api/approve { description, amountUsdc?, resourceUrl?, approver? }
// Creates a pending approval and returns its Solana Pay link (render as a QR with @solana/pay createQR).
import { NextRequest, NextResponse } from "next/server";
import { createApproval } from "@/lib/approvals";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    description?: string;
    amountUsdc?: number;
    resourceUrl?: string;
    approver?: string;
  };
  if (!body.description) return NextResponse.json({ error: "description is required" }, { status: 400 });
  try {
    const { approval, url } = await createApproval({
      description: body.description,
      amountUsdc: body.amountUsdc,
      resourceUrl: body.resourceUrl,
      approver: body.approver,
    });
    return NextResponse.json({ id: approval.id, reference: approval.reference, url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
