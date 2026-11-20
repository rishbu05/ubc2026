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
                           odds-history reads Supabase odds_snapshots: ?symbol= | ?event_ticker= (default FED261211), &since=ISO, &limit=1-5000.
                           news: real headlines from Google News RSS (?event_ticker= FED261211|SPXEND26 mapped to a topic, or ?topic=),
                           cached 5 min. DEMO: ?inject=1 or DEMO_INJECTION=true appends a prompt-injection headline (off by default).
                           Params are validated BEFORE the paywall (bad request = 400, no charge).
app/api/agent/run          Agent loop stub (reads Gemini prediction markets).
app/api/agent/topup        GET delegation status / POST delegate top-up (owner, amountUsdc, reason). Requires x-agent-secret.
app/api/approve            POST create approval -> { id, reference, url: solana:... }. Requires x-agent-secret.
app/api/approve/[id]       Solana Pay transaction request: GET label/icon, POST { account } -> memo tx to sign.
app/api/approve/[id]/check GET: find the signed approval onchain, verify it, mark approved in Supabase. Safe to poll.
lib/agentPay.ts     agentFetch(): pays 402s from the Circle wallet, retries, returns { response, payment: { txSignature, explorerUrl } }.
lib/delegate.ts     getDelegation(), topUpFromDelegate(): transferChecked as SPL delegate + Memo(reason), signed via Circle.
lib/approvals.ts    createApproval, buildApprovalTransaction, verifyApprovalOnchain (no DB), checkApproval (DB update).
lib/circle.ts       Circle client; agentKitSigner() (x402) and agentWeb3Signer() (web3.js), both via Circle sign-transaction API.
lib/solana.ts       Client-safe devnet helpers: connection, USDC mint, CAIP-2 id, memoInstruction, agentAddress, explorerTxUrl.
proxy.ts            Next 16 proxy (ex-middleware): enforces x-agent-secret on protected routes. Fails closed if unset.
lib/internalAuth.ts Which routes need AGENT_INTERNAL_SECRET (requiresInternalSecret), safeEqual, internalHeaders().
lib/policy.ts       Pure policy: evaluate(policy, {amountUsdc, kind: 'data'|'trade', spentTodayUsdc, resourceUrl}).
                    data: per-call max (0.10). Both kinds: daily limit (5.00). Trades always need approval (POLICY_TRADES_REQUIRE_APPROVAL);
                    otherwise approval above threshold (2.00). `kind` defaults to 'data'.
lib/news.ts         Google News RSS fetch/parse, EVENT_TOPICS map, injectionHeadline() (demo only).
lib/solanaPay.ts    Client-safe: approvalLink(), approvalMemo(), solanaPayBaseUrl() (NEXT_PUBLIC_SOLANA_PAY_BASE_URL). Re-exported by lib/approvals.ts.
lib/odds.ts         odds_snapshots reader (partner's recorder writes one row per contract per minute).
lib/gemini.ts       Gemini EXCHANGE Prediction Markets client: listActiveEvents, getEvent, getOrderBook, placeOrder,
                    listActiveOrders, listPositions (signed, read-only).
lib/x402.ts         Shared x402ResourceServer (ExactSvmScheme on devnet), PAID_PRICES, paidRoute().
lib/supabase.ts     Browser (anon) and admin (service role) Supabase clients.
components/WalletProviders.tsx  Wallet adapter providers (Phantom, Solflare) on devnet, wrapped in app/layout.tsx.
components/ApprovalModal.tsx    Approval UI: Solana Pay QR (Phantom mobile) + 'Sign in browser' (extension); polls /check every 2s.
app/dev/approval    Test page for ApprovalModal (server action creates a TEST: approval). 404 unless ENABLE_DEV_PAGES=true.
components/DelegatePanel.tsx    User approve()/revoke() of an N-USDC SPL delegate allowance for the agent (on app/page.tsx).
scripts/prove-revoked.ts  Demo: skips the server pre-check, Circle-signs the real top-up tx, simulates it (never sends), prints the token program's error. `npm run prove:revoked -- <owner> [amount]`
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
  agent then sends `transferChecked(userAta -> agentAta)` as delegate plus a Memo `Allowance top-up: <reason>`
  (`topUpMemo()`). Memos are permanent and public, so keep reasons user-friendly (no internal test labels).
  Both the route and `prove:revoked` build the tx with `buildTopUpTransaction()`. The server pre-check is UX only;
  the token program enforces the delegate onchain (revoked gives OwnerMismatch 0x4).
  The agent wallet pays this fee, so it **needs devnet SOL**.
- **Approval tx:** Memo v2 rejects non-signer accounts, so the Solana Pay `reference` key is attached
  to a 0-lamport self-transfer, and the memo instruction lists only the user as signer.
  The memo text is `approvalMemo()`: `approve #<id>: <description>`, truncated to 200 chars.
- Devnet RPC airdrops are closed. Get SOL from https://faucet.solana.com and USDC from https://faucet.circle.com.

## Data sources

- **odds_snapshots** (Supabase): the partner's recorder writes ts, event_ticker, symbol, label, bid, ask, last, mid,
  raw every minute, from **Gemini PRODUCTION** public market data (api.gemini.com). `mid` is a float, so round it for display.
- **Sandbox vs production:** FED261211 exists only on Gemini production (404 on sandbox). `placeOrder` uses
  `GEMINI_API_BASE_URL` (sandbox), so you cannot trade the recorded events in sandbox. Decide before wiring trades.
- **approvals** (Supabase): created by `supabase/migrations/0001_approvals.sql`. Run it in the SQL editor if missing,
  then `NOTIFY pgrst, 'reload schema';`.

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

- `lib/policy.ts` is owned by the partner. Don't edit it from dev-a work without asking.

- **Internal auth:** `/api/agent/*` (all methods) and `POST /api/approve` require header
  `x-agent-secret: $AGENT_INTERNAL_SECRET`, enforced centrally in `proxy.ts`. New `/api/agent/*` routes are
  covered automatically. These stay PUBLIC on purpose: `/api/approve/[id]` (Phantom calls it during Solana Pay),
  `/api/approve/[id]/check` (it only marks done after verifying onchain) and `/api/paid/*` (gated by x402).
  Server-side callers use `internalHeaders()`. Never call protected routes from client components.

- Secrets are server-only. Only `NEXT_PUBLIC_*` vars may be read in client components.
  `SUPABASE_SERVICE_ROLE_KEY`, `CIRCLE_*`, `GEMINI_API_KEY`, and `GEMINI_API_SECRET` must never reach the browser.
- Amounts in policy/env are human USDC units. Convert to base units (6 decimals) only at
  the chain boundary in `lib/solana.ts`.
- Keep `lib/policy.ts` pure (no I/O) so it is easy to test.
- See `.env.example` for every required variable. `.env` is gitignored, and `.env.example` is committed.
- Scripts run with `tsx --conditions=react-server`, which turns `import "server-only"` into a no-op.
  The package isn't `"type": "module"`, so tsx compiles scripts as CJS: **no top-level await**; wrap in `main()`.
- `withX402` handlers need an explicit `Promise<NextResponse<unknown>>` return type when they return more than one body shape.

## Deployment (Vercel)

- Project `ubc-2027/allowance`. Production URL: https://allowance-chi-nine.vercel.app
- Deploy: `npx vercel deploy --prod --yes --scope ubc-2027`. The CLI uploads from **disk**, so `.vercelignore`
  must keep excluding `.env*` and `.secrets/`.
- Env vars live in Vercel (Production + Preview). Secrets are type Secret (`--sensitive`). Add them with
  `printf '%s' "$v" | npx vercel env add NAME --environment production --environment preview [--sensitive|--no-sensitive]`.
  CLI 66+: the 2nd positional argument is a **git branch**, so always use `--environment`.
- `NEXT_PUBLIC_*` values are inlined at build time, so changing one requires a redeploy.
- `NEXT_PUBLIC_SOLANA_PAY_BASE_URL` is the deployed URL everywhere (Phantom can't reach localhost), so Solana Pay
  links work even from local dev.

## Commands

```
npm run dev     # local dev on :3000
npm run build
npm run lint
npm run pay:once -- /api/paid/news?event=<ticker>   # one real x402 payment from the Circle wallet
```
