// POST /api/agent/topup { owner, amountUsdc, reason }: agent pulls USDC from `owner` as SPL delegate.
// GET  /api/agent/topup?owner=<pubkey>: current delegation status for that owner.
import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getDelegation, topUpFromDelegate } from "@/lib/delegate";

// TODO: authenticate this route before anything beyond the demo. As written, anyone can trigger
// a top-up into the agent wallet, up to the owner's approved allowance.

function parseOwner(v: unknown): PublicKey | null {
  try {
    return typeof v === "string" ? new PublicKey(v) : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const owner = parseOwner(req.nextUrl.searchParams.get("owner"));
  if (!owner) return NextResponse.json({ error: "valid owner required" }, { status: 400 });
  try {
    return NextResponse.json(await getDelegation(owner));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    owner?: string;
    amountUsdc?: number | string;
    reason?: string;
  };
  const owner = parseOwner(body.owner);
  if (!owner || body.amountUsdc === undefined || !body.reason) {
    return NextResponse.json({ error: "owner, amountUsdc and reason are required" }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await topUpFromDelegate({ owner, amountUsdc: body.amountUsdc, reason: body.reason }),
    );
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
