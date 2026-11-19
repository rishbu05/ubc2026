// Solana Pay transaction-request endpoint for approval #id.
// Link: solana:<APP_URL>/api/approve/<id>
//   GET  -> { label, icon }
//   POST { account } -> { transaction, message }: memo tx "approve #<id>: ..." for the wallet to sign.
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { buildApprovalTransaction, getApproval, solanaPayBaseUrl } from "@/lib/approvals";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type Ctx = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET() {
  return NextResponse.json(
    { label: "Allowance approval", icon: `${solanaPayBaseUrl()}/next.svg` },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const { account } = (await req.json().catch(() => ({}))) as { account?: string };

  let payer: PublicKey;
  try {
    payer = new PublicKey(account ?? "");
  } catch {
    return NextResponse.json({ error: "valid account required" }, { status: 400, headers: CORS });
  }
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "invalid approval id" }, { status: 400, headers: CORS });
  }

  try {
    const approval = await getApproval(id);
    if (!approval) return NextResponse.json({ error: "not found" }, { status: 404, headers: CORS });
    return NextResponse.json(await buildApprovalTransaction(approval, payer), { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400, headers: CORS });
  }
}
