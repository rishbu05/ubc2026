# allowance

> **⚠️ "Gemini" in this project = the Gemini crypto EXCHANGE's Prediction Markets REST API**
> (`https://api.gemini.com/v1/prediction-markets/...`, sandbox `https://api.sandbox.gemini.com`,
> docs: https://developer.gemini.com/prediction-markets-spec).
> **It is NOT Google Gemini AI.** Never install `@google/genai` / `@google/generative-ai`, never
> add `GEMINI_MODEL`, and never call an LLM from `lib/gemini.ts`. `GEMINI_API_KEY` /
> `GEMINI_API_SECRET` are Gemini *exchange* API credentials.

An agent with a spending allowance. The agent pays for data from
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
- Gemini exchange Prediction Markets API is called with plain `fetch` + `node:crypto` in
  `lib/gemini.ts`. No SDK.
- `@supabase/supabase-js` stores policies, the spend ledger, and pending approvals.

## Layout

```
app/api/paid/odds-history|news|analysis   x402-protected ($0.01 / $0.02 / $0.05 devnet USDC). Prices live in lib/x402.ts PAID_PRICES.
app/api/agent/run          Agent loop stub (reads Gemini prediction markets).
app/api/agent/topup        GET delegation status / POST delegate top-up (owner, amountUsdc, reason). UNAUTHENTICATED: TODO.
app/api/approve            POST create approval -> { id, reference, url: solana:... }.
app/api/approve/[id]       Solana Pay transaction request: GET label/icon, POST { account } -> memo tx to sign.
app/api/approve/[id]/check GET: find the signed approval onchain, verify it, mark approved in Supabase. Safe to poll.
lib/agentPay.ts     agentFetch(): pays 402s from the Circle wallet, retries, returns { response, payment: { txSignature, explorerUrl } }.
lib/delegate.ts     getDelegation(), topUpFromDelegate(): transferChecked as SPL delegate + Memo(reason), signed via Circle.
lib/approvals.ts    createApproval, buildApprovalTransaction, verifyApprovalOnchain (no DB), checkApproval (DB update).
lib/circle.ts       Circle client; agentKitSigner() (x402) and agentWeb3Signer() (web3.js), both via Circle sign-transaction API.
lib/solana.ts       Client-safe devnet helpers: connection, USDC mint, CAIP-2 id, memoInstruction, agentAddress, explorerTxUrl.
lib/policy.ts       Pure policy logic: per-tx max, daily limit, approval threshold, host allowlist.
lib/gemini.ts       Gemini EXCHANGE Prediction Markets client: listActiveEvents, getEvent, getOrderBook, placeOrder.
lib/x402.ts         Shared x402ResourceServer (ExactSvmScheme on devnet), PAID_PRICES, paidRoute().
lib/supabase.ts     Browser (anon) and admin (service role) Supabase clients.
components/WalletProviders.tsx  Wallet adapter providers (Phantom, Solflare) on devnet, wrapped in app/layout.tsx.
components/DelegatePanel.tsx    User approve()/revoke() of an N-USDC SPL delegate allowance for the agent (on app/page.tsx).
scripts/pay-once.ts One end-to-end paid call; prints the Explorer link. `npm run pay:once -- [path]` (needs `npm run dev`).
supabase/migrations/0001_approvals.sql  approvals table. Apply in the Supabase SQL editor or with `supabase db push`.
```

## Spend flow

1. The agent calls `GET /api/paid/<x>` and gets **402** with payment requirements
   (USDC amount, `payTo`, network `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`).
2. The agent loop runs `policy.evaluate()` with the amount and today's spend from Supabase.
   - `deny`: stop and record the reason.
   - `allow`: pay from the Circle wallet, retry with the x402 payment header, and record it in the ledger.
   - `require_approval`: create a pending approval row and hand the human a
     `solana:<APP_URL>/api/approve/...` link or QR code. The human signs in their wallet,
     and the agent resumes once the payment is confirmed.

## Payments, delegation, approvals: how they work

- **x402 (agent pays):** the facilitator (`https://x402.org/facilitator`) is the **fee payer**
  (`CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5`). The agent only partially signs the USDC
  transferChecked, so it needs USDC but **no SOL**. The **seller wallet (`X402_PAY_TO_ADDRESS`) must
  already have a USDC token account**; otherwise settlement fails with
  `invalid_exact_svm_recipient_ata_missing`.
- **Circle signing:** `@circle-fin/developer-controlled-wallets/solana/kit` and `/solana/web3` give
  signers backed by `POST /v1/w3s/developer/sign/transaction`. Don't hand-roll that call.
- **Delegate top-up:** the user's Phantom wallet runs `approveChecked(userAta, mint, agent, N)`. The
  agent then sends `transferChecked(userAta -> agentAta)` as delegate plus a Memo carrying the reason.
  The agent wallet pays this fee, so it **needs devnet SOL**.
- **Approval tx:** Memo v2 rejects non-signer accounts, so the Solana Pay `reference` key is attached
  to a 0-lamport self-transfer, and the memo instruction lists only the user as signer.
  The memo text is `approvalMemo()`: `approve #<id>: <description>`, truncated to 200 chars.
- Devnet RPC airdrops are closed. Get SOL from https://faucet.solana.com and USDC from https://faucet.circle.com.

## Gemini Prediction Markets (lib/gemini.ts)

- Base URL comes from `GEMINI_API_BASE_URL` and defaults to the **sandbox**. Don't point it at prod without asking.
- Public endpoints, no key needed:
  - `GET /v1/prediction-markets/events?status=active` returns `{ data, pagination }`.
  - `GET /v1/prediction-markets/events/{eventTicker}` returns the event object (no wrapper).
  - `GET /v1/book/{instrumentSymbol}` returns `{ bids, asks }`. The standard book endpoint accepts prediction symbols.
- Private endpoint: `POST /v1/prediction-markets/order`. Limit orders only; `price` is 0–1 and
  `quantity` is a contract count; fields are `symbol`, `orderType`, `side`, `quantity`, `price`,
  `outcome` (yes/no) and `timeInForce`. The key needs the Trader role, and the account must have
  accepted the latest prediction-markets terms.
- Signing: the JSON payload `{ request: <path>, nonce, ...fields }` is base64-encoded into
  `X-GEMINI-PAYLOAD`, `X-GEMINI-SIGNATURE` is `hex(HMAC-SHA384(payloadB64, secret))`, and
  `X-GEMINI-APIKEY` carries the key. The HTTP body is empty. Nonces must strictly increase
  (millisecond timestamps).
- Always take `instrumentSymbol` from an event's `contracts[]` (e.g. `GEMI-SOL2611192200-HI69`).
  Never build it from a title or ticker.

## Conventions

- Secrets are server-only. Only `NEXT_PUBLIC_*` vars may be read in client components.
  `SUPABASE_SERVICE_ROLE_KEY`, `CIRCLE_*`, `GEMINI_API_KEY`, and `GEMINI_API_SECRET` must never reach the browser.
- Amounts in policy/env are human USDC units. Convert to base units (6 decimals) only at
  the chain boundary in `lib/solana.ts`.
- Keep `lib/policy.ts` pure (no I/O) so it is easy to test.
- See `.env.example` for every required variable. `.env` is gitignored, and `.env.example` is committed.
- Scripts run with `tsx --conditions=react-server`, which turns `import "server-only"` into a no-op.
  The package isn't `"type": "module"`, so tsx compiles scripts as CJS: **no top-level await**; wrap in `main()`.
- `withX402` handlers need an explicit `Promise<NextResponse<unknown>>` return type when they return more than one body shape.

## Commands

```
npm run dev     # local dev on :3000
npm run build
npm run lint
npm run pay:once -- /api/paid/news?event=<ticker>   # one real x402 payment from the Circle wallet
```
