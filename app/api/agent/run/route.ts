// Agent loop entry point (stub). Gemini plans; each paid call is checked against lib/policy.ts.
import { NextRequest, NextResponse } from "next/server";
import { getGemini, GEMINI_MODEL } from "@/lib/gemini";
import { defaultPolicy, evaluate } from "@/lib/policy";

export async function POST(req: NextRequest) {
  const { task } = (await req.json()) as { task?: string };
  if (!task) return NextResponse.json({ error: "task is required" }, { status: 400 });

  // TODO: tool-calling loop. On a 402 from /api/paid/*, read the price, then:
  //   evaluate(policy, { amountUsdc, resourceUrl, spentTodayUsdc }) ->
  //   allow: pay via lib/circle.ts and retry | require_approval: create /api/approve link | deny: report.
  const policy = defaultPolicy();
  void evaluate;

  const res = await getGemini().models.generateContent({
    model: GEMINI_MODEL,
    contents: `You are an agent with a USDC allowance on Solana devnet. Task: ${task}`,
  });

  return NextResponse.json({ policy, reply: res.text });
}
