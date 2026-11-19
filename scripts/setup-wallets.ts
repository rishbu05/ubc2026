// npm run setup:wallets
//
// One-time wallet setup on Solana DEVNET:
//   1. (optional, --register-entity-secret) generate + register a Circle entity secret
//   2. create (or reuse) a Circle wallet set
//   3. create (or reuse) a SOL-DEVNET agent wallet in that set
//   4. generate (or reuse) a local seller keypair for X402_PAY_TO_ADDRESS
// Then prints exactly which lines go in .env. Never writes .env itself.
//
// Safe to re-run: reuses CIRCLE_WALLET_SET_ID / CIRCLE_AGENT_WALLET_ID from .env if set, reuses an
// existing SOL-DEVNET wallet in the set, and reuses .secrets/seller-keypair.json if present.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

const BLOCKCHAIN = "SOL-DEVNET" as const;
const WALLET_SET_NAME = "allowance";
const SECRETS_DIR = path.resolve(".secrets");
const SELLER_KEYPAIR = path.join(SECRETS_DIR, "seller-keypair.json");

function fail(msg: string): never {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

function ensureSecretsDir() {
  fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
}

async function registerNewEntitySecret(apiKey: string): Promise<string> {
  ensureSecretsDir();
  const entitySecret = crypto.randomBytes(32).toString("hex");
  console.log("Registering a new entity secret with Circle…");
  await registerEntitySecretCiphertext({ apiKey, entitySecret, recoveryFileDownloadPath: SECRETS_DIR });
  // Persist + print immediately, so a later failure can't lose the secret.
  const secretFile = path.join(SECRETS_DIR, "entity-secret.txt");
  fs.writeFileSync(secretFile, entitySecret + "\n", { mode: 0o600 });
  console.log(`✔ Registered. Recovery file + ${path.basename(secretFile)} saved in ${SECRETS_DIR}/`);
  console.log(`\n  CIRCLE_ENTITY_SECRET=${entitySecret}\n`);
  console.log("  Back up the secret AND the recovery file now (password manager).");
  console.log("  Without them you cannot sign with these wallets again.\n");
  return entitySecret;
}

function loadOrCreateSeller(): { keypair: Keypair; created: boolean } {
  if (fs.existsSync(SELLER_KEYPAIR)) {
    const bytes = Uint8Array.from(JSON.parse(fs.readFileSync(SELLER_KEYPAIR, "utf8")));
    return { keypair: Keypair.fromSecretKey(bytes), created: false };
  }
  ensureSecretsDir();
  const keypair = Keypair.generate();
  // Solana CLI format (JSON array of 64 bytes), so `solana` tooling can use it too.
  fs.writeFileSync(SELLER_KEYPAIR, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return { keypair, created: true };
}

async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    fail(
      "CIRCLE_API_KEY is not set. Create a TEST API key at console.circle.com (Keys > Create a key > " +
        "API key, Standard) and put it in .env as CIRCLE_API_KEY=TEST_API_KEY:...",
    );
  }

  // ── 1. Entity secret ────────────────────────────────────────────────
  let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  let newEntitySecret = false;
  if (!entitySecret) {
    if (!process.argv.includes("--register-entity-secret")) {
      fail(
        "CIRCLE_ENTITY_SECRET is not set.\n" +
          "  If you already registered one in Circle, put it in .env.\n" +
          "  If you never have, run:  npm run setup:wallets -- --register-entity-secret\n" +
          "  (generates a 32-byte secret, registers it with Circle, saves the recovery file to .secrets/).",
      );
    }
    entitySecret = await registerNewEntitySecret(apiKey);
    newEntitySecret = true;
  } else if (!/^[0-9a-fA-F]{64}$/.test(entitySecret)) {
    fail("CIRCLE_ENTITY_SECRET must be 64 hex characters (32 bytes).");
  }

  const circle = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

  // ── 2. Wallet set ───────────────────────────────────────────────────
  let walletSetId = process.env.CIRCLE_WALLET_SET_ID;
  if (walletSetId) {
    const res = await circle.getWalletSet({ id: walletSetId });
    if (!res.data?.walletSet) fail(`CIRCLE_WALLET_SET_ID ${walletSetId} not found in this Circle account.`);
    console.log(`✔ Reusing wallet set ${walletSetId}`);
  } else {
    const res = await circle.createWalletSet({ name: WALLET_SET_NAME });
    walletSetId = res.data?.walletSet?.id;
    if (!walletSetId) fail(`createWalletSet returned no id: ${JSON.stringify(res.data)}`);
    console.log(`✔ Created wallet set "${WALLET_SET_NAME}" ${walletSetId}`);
  }

  // ── 3. Agent wallet (SOL-DEVNET) ────────────────────────────────────
  let agent: { id: string; address: string } | undefined;
  const envWalletId = process.env.CIRCLE_AGENT_WALLET_ID;
  if (envWalletId) {
    const w = (await circle.getWallet({ id: envWalletId })).data?.wallet;
    if (!w) fail(`CIRCLE_AGENT_WALLET_ID ${envWalletId} not found.`);
    if (w.blockchain !== BLOCKCHAIN) fail(`Wallet ${envWalletId} is on ${w.blockchain}, expected ${BLOCKCHAIN}.`);
    agent = { id: w.id, address: w.address };
    console.log(`✔ Reusing agent wallet ${agent.id}`);
  } else {
    const existing = (await circle.listWallets({ walletSetId, blockchain: BLOCKCHAIN })).data?.wallets ?? [];
    if (existing.length > 0) {
      agent = { id: existing[0].id, address: existing[0].address };
      console.log(`✔ Found existing ${BLOCKCHAIN} wallet in set: ${agent.id}`);
    } else {
      const res = await circle.createWallets({
        walletSetId,
        blockchains: [BLOCKCHAIN],
        count: 1,
        accountType: "EOA",
        metadata: [{ name: "allowance-agent" }],
      });
      const w = res.data?.wallets?.[0];
      if (!w) fail(`createWallets returned no wallet: ${JSON.stringify(res.data)}`);
      agent = { id: w.id, address: w.address };
      console.log(`✔ Created ${BLOCKCHAIN} agent wallet ${agent.id}`);
    }
  }

  // ── 4. Seller keypair ───────────────────────────────────────────────
  const { keypair: seller, created } = loadOrCreateSeller();
  console.log(
    created
      ? `✔ Generated seller keypair → ${path.relative(process.cwd(), SELLER_KEYPAIR)} (gitignored, chmod 600)`
      : `✔ Reusing seller keypair ${path.relative(process.cwd(), SELLER_KEYPAIR)}`,
  );

  // ── Output ──────────────────────────────────────────────────────────
  const line = "─".repeat(72);
  console.log(`\n${line}`);
  console.log(`Agent wallet (Circle, ${BLOCKCHAIN}):  ${agent.address}`);
  console.log(`Seller wallet (local keypair):        ${seller.publicKey.toBase58()}`);
  console.log(line);
  console.log("Put these in .env (replace any existing lines with the same names):\n");
  if (newEntitySecret) console.log(`CIRCLE_ENTITY_SECRET=${entitySecret}`);
  console.log(`CIRCLE_WALLET_SET_ID=${walletSetId}`);
  console.log(`CIRCLE_AGENT_WALLET_ID=${agent.id}`);
  console.log(`NEXT_PUBLIC_AGENT_WALLET_ADDRESS=${agent.address}`);
  console.log(`X402_PAY_TO_ADDRESS=${seller.publicKey.toBase58()}`);
  console.log(`\n${line}`);
  console.log("Fund on devnet before testing:");
  console.log(`  • USDC → agent AND seller: https://faucet.circle.com (Solana Devnet)`);
  console.log("    The seller needs a USDC token account or x402 settlement fails (recipient_ata_missing).");
  console.log(`  • SOL  → agent (delegate top-ups pay fees): https://faucet.solana.com`);
  console.log(`\nExplorer: https://explorer.solana.com/address/${agent.address}?cluster=devnet`);
}

main().catch((err) => {
  const msg = err?.response?.data ? JSON.stringify(err.response.data) : (err as Error).message;
  fail(`Setup failed: ${msg}`);
});
