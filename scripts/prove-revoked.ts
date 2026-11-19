// npm run prove:revoked -- <ownerAddress> [amountUsdc]
//
// Demo "prove it" mode: shows that a revoked (or never-granted) delegate is enforced ONCHAIN by the
// Solana token program, not just by our server's pre-check.
//
// It skips the pre-check in lib/delegate.ts, builds the exact top-up transaction the server would
// send (transferChecked with the agent as authority), gets a REAL agent signature from Circle, and
// SIMULATES it against devnet with signature verification on. Nothing is ever broadcast.
//
// Expected after a revoke: the token program rejects it with OwnerMismatch (custom error 0x4,
// "owner does not match").
import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";
import { buildTopUpTransaction } from "@/lib/delegate";
import { agentWeb3Signer } from "@/lib/circle";
import { baseUnitsToUsdc, getConnection, usdcAta, usdcToBaseUnits } from "@/lib/solana";

// spl-token TokenError enum (index = custom error code).
const TOKEN_ERRORS = [
  "NotRentExempt", "InsufficientFunds", "InvalidMint", "MintMismatch", "OwnerMismatch",
  "FixedSupply", "AlreadyInUse", "InvalidNumberOfProvidedSigners", "InvalidNumberOfRequiredSigners",
  "UninitializedState", "NativeNotSupported", "NonNativeHasBalance", "InvalidInstruction",
  "InvalidState", "Overflow", "AuthorityTypeNotSupported", "MintCannotFreeze", "AccountFrozen",
  "MintDecimalsMismatch", "NonNativeNotSupported",
];

async function main() {
  const ownerArg = process.argv[2] ?? process.env.DEMO_OWNER_ADDRESS;
  if (!ownerArg) {
    console.error("Usage: npm run prove:revoked -- <ownerAddress> [amountUsdc]");
    process.exit(2);
  }
  const owner = new PublicKey(ownerArg);
  const amountUsdc = process.argv[3] ?? "1";
  const conn = getConnection();

  // 1. Current onchain state of the owner's USDC account.
  const acct = await getAccount(conn, usdcAta(owner), "confirmed");
  console.log(`Owner USDC account: ${usdcAta(owner).toBase58()}`);
  console.log(`  balance:          ${baseUnitsToUsdc(acct.amount)} USDC`);
  console.log(`  delegate:         ${acct.delegate?.toBase58() ?? "none"}`);
  console.log(`  delegatedAmount:  ${baseUnitsToUsdc(acct.delegatedAmount)} USDC\n`);

  // 2. Build the real top-up tx, deliberately skipping the server pre-check.
  const { tx, agent } = await buildTopUpTransaction({
    owner,
    amount: usdcToBaseUnits(amountUsdc),
    reason: "prove revoked (simulation only, never sent)",
  });
  console.log(`Built transferChecked: ${amountUsdc} USDC, authority = agent ${agent.toBase58()}`);
  console.log("Server pre-check: SKIPPED\n");

  // 3. Real signature from the agent's Circle wallet, so this can't be blamed on a bad signature.
  const signed = await agentWeb3Signer().signTransaction(tx);
  console.log("Signed by agent via Circle sign-transaction API ✔");

  // 4. Simulate with signature verification ON. Never broadcast.
  const vtx = VersionedTransaction.deserialize(signed.serialize());
  const sim = await conn.simulateTransaction(vtx, { sigVerify: true, commitment: "confirmed" });
  console.log("Simulated against devnet (NOT broadcast)\n");

  const err = sim.value.err;
  if (!err) {
    console.log("⚠ Simulation SUCCEEDED: the agent is currently an active delegate with enough allowance,");
    console.log("  so the token program would allow this transfer. Revoke in Phantom, then run again.");
    process.exitCode = 1;
    return;
  }

  console.log("✖ Solana rejected the transfer:");
  console.log(`  err: ${JSON.stringify(err)}`);
  const ixErr = typeof err === "object" && "InstructionError" in err ? (err as { InstructionError: [number, unknown] }).InstructionError : null;
  if (ixErr) {
    const [index, detail] = ixErr;
    const code = typeof detail === "object" && detail && "Custom" in detail ? (detail as { Custom: number }).Custom : null;
    console.log(`  instruction #${index} (${index === 1 ? "spl-token transferChecked" : "see logs"})`);
    if (code !== null) console.log(`  token program error ${code} (0x${code.toString(16)}): ${TOKEN_ERRORS[code] ?? "unknown"}`);
  }
  console.log("\nProgram logs:");
  for (const line of sim.value.logs ?? []) {
    if (/Tokenkeg|Error|failed|owner/i.test(line)) console.log(`  ${line}`);
  }
}

main().catch((e) => {
  console.error("✖", e?.response?.data ? JSON.stringify(e.response.data) : e.message);
  process.exit(1);
});
