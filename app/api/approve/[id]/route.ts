// Solana Pay transaction-request endpoint for human approval of an over-threshold spend.
// Wallets call GET for label/icon, then POST { account } to receive a transaction to sign.
// Link format: solana:<APP_URL>/api/approve/<id>
import { NextRequest, NextResponse } from "next/server";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { getConnection, usdcAta, usdcToBaseUnits, USDC_MINT, USDC_DECIMALS } from "@/lib/solana";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS });
}

export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return NextResponse.json(
    { label: "Allowance approval", icon: `${appUrl}/next.svg` },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { account } = (await req.json()) as { account: string };
  const payer = new PublicKey(account);

  // TODO: load the pending approval `id` from Supabase (amount + recipient).
  const pending = {
    amountUsdc: "0.10",
    recipient: process.env.CIRCLE_AGENT_WALLET_ADDRESS ?? account,
  };
  const recipient = new PublicKey(pending.recipient);

  const conn = getConnection();
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ feePayer: payer, blockhash, lastValidBlockHeight }).add(
    createTransferCheckedInstruction(
      usdcAta(payer),
      USDC_MINT,
      getAssociatedTokenAddressSync(USDC_MINT, recipient, true),
      payer,
      usdcToBaseUnits(pending.amountUsdc),
      USDC_DECIMALS,
    ),
  );

  const transaction = tx.serialize({ requireAllSignatures: false }).toString("base64");
  return NextResponse.json(
    { transaction, message: `Approve agent spend #${id}: ${pending.amountUsdc} USDC` },
    { headers: CORS },
  );
}
