# allowance

An AI agent with a spending allowance. The agent (Gemini) pays for data from
x402-protected endpoints using USDC on **Solana devnet**. Payments come from a Circle
developer-controlled wallet. Every spend is checked against a policy. Spends above the
approval threshold are sent to a human, who approves them by signing a Solana Pay
transaction request.

**Network: Solana devnet everywhere.** Never point anything at mainnet.

## Stack

- Next.js 16 App Router, TypeScript, Tailwind v4. This was originally specced as Next 15,
  but every `@x402/next` release peers on Next 16.
- `@solana/web3.js`, `@solana/spl-token`, and `@solana/kit` (v6) for chain access.
- `@solana/wallet-adapter-*` connects the human's wallet in the browser.
- `@solana/pay` encodes `solana:` transaction-request links/QRs for human approval (`encodeURL`, `createQR`).
- `@circle-fin/developer-controlled-wallets` holds the agent's wallet (blockchain `SOL-DEVNET`).
- `@x402/next`, `@x402/core`, and `@x402/svm` are **pinned to 2.28.0**. 2.29+ needs
  `@solana/kit >= 8`, which conflicts with `@solana/pay`'s `^6`. All three must stay on the
  same version.
- `@google/genai` (Gemini) runs the agent's reasoning.
- `@supabase/supabase-js` stores policies, the spend ledger, and pending approvals.

## Layout

```
app/api/paid/*      x402-protected data endpoints. They return 402 until a valid USDC payment is attached.
app/api/agent/*     Agent loop: Gemini plans, calls paid endpoints, and each spend goes through the policy.
app/api/approve/*   Solana Pay transaction-request endpoints (GET = label/icon, POST = return a tx to sign).
lib/policy.ts       Pure policy logic: per-tx max, daily limit, approval threshold, host allowlist.
lib/circle.ts       Circle client plus helpers for the agent wallet (balance, transfer).
lib/solana.ts       Devnet connection, USDC mint, CAIP-2 network id, and tx builders.
lib/gemini.ts       Gemini client and model config.
lib/x402.ts         Shared x402ResourceServer (ExactSvmScheme on devnet) and a paidRoute() config helper.
lib/supabase.ts     Browser (anon) and admin (service role) Supabase clients.
components/WalletProviders.tsx  Wallet adapter providers (Phantom, Solflare) on devnet, wrapped in app/layout.tsx.
```

## Spend flow

1. The agent calls `GET /api/paid/<x>` and gets **402** with payment requirements
   (USDC amount, `payTo`, network `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`).
2. The agent loop runs `policy.evaluate()` with the amount and today's spend from Supabase.
   - `deny`: stop and report the reason to the model.
   - `allow`: pay from the Circle wallet, retry with the x402 payment header, and record it in the ledger.
   - `require_approval`: create a pending approval row and hand the human a
     `solana:<APP_URL>/api/approve/...` link or QR code. The human signs in their wallet,
     and the agent resumes once the payment is confirmed.

## Conventions

- Secrets are server-only. Only `NEXT_PUBLIC_*` vars may be read in client components.
  `SUPABASE_SERVICE_ROLE_KEY`, `CIRCLE_*`, and `GEMINI_API_KEY` must never reach the browser.
- Amounts in policy/env are human USDC units. Convert to base units (6 decimals) only at
  the chain boundary in `lib/solana.ts`.
- Keep `lib/policy.ts` pure (no I/O) so it is easy to test.
- See `.env.example` for every required variable. `.env` is gitignored, and `.env.example` is committed.

## Commands

```
npm run dev     # local dev on :3000
npm run build
npm run lint
```
