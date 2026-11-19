// One paid x402 call end to end: agent (Circle SOL-DEVNET wallet) pays a /api/paid/* endpoint.
//
// Prereqs: `npm run dev` running; .env filled (CIRCLE_*, NEXT_PUBLIC_AGENT_WALLET_ADDRESS,
// X402_PAY_TO_ADDRESS); agent wallet holds devnet USDC (https://faucet.circle.com, Solana Devnet).
// The facilitator pays the SOL fee, so the agent needs no SOL for this.
//
// Usage: npm run pay:once -- [path]    (default: /api/paid/odds-history?event=<first active event>)
import { agentFetch } from "@/lib/agentPay";
import { listActiveEvents } from "@/lib/gemini";
import { agentAddress, getUsdcBalance } from "@/lib/solana";

async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let path = process.argv[2];
  if (!path) {
    const events = await listActiveEvents({ limit: 1 });
    path = `/api/paid/odds-history?event=${encodeURIComponent(events.data[0].ticker)}`;
  }
  const url = new URL(path, base);
  const agent = agentAddress();

  console.log(`Agent wallet: ${agent.toBase58()}`);
  console.log(`USDC before:  ${await getUsdcBalance(agent)}`);
  console.log(`GET ${url}`);

  const { response, payment } = await agentFetch(url, {}, {
    beforePay: ({ amountUsdc, payTo }) => {
      console.log(`402 -> paying ${amountUsdc} USDC to ${payTo} (signing via Circle)...`);
      return true;
    },
  });

  console.log(`Status: ${response.status}`);
  const body = await response.text();
  console.log(`Body:   ${body.length > 600 ? body.slice(0, 600) + "…" : body}`);

  if (!payment) {
    console.log("No payment was made (endpoint did not return 402, or payment refused).");
    process.exitCode = response.ok ? 0 : 1;
    return;
  }
  console.log(`Paid:   ${payment.amountUsdc} USDC  payer=${payment.payer ?? agent.toBase58()}`);
  console.log(`Tx:     ${payment.txSignature}`);
  console.log(`Explorer: ${payment.explorerUrl}`);
  console.log(`USDC after:   ${await getUsdcBalance(agent)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
