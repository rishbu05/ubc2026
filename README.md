# allowance

**An AI agent with a spending allowance.** The agent pays for market data with USDC on Solana,
under a policy it can't talk its way out of. Anything big, and every trade, needs a human to approve
it by signing in their wallet.

> Solana **devnet** only. No real money moves.

- Live demo: https://allowance-chi-nine.vercel.app
- Video: TODO
- Devpost: TODO

## The problem

Agents are starting to pay for things themselves: APIs, data, compute. Handing one an API key with
a credit card behind it is all-or-nothing. Either it can spend anything, or a human approves every call.
And anything the agent reads, like a news headline, can try to talk it into spending more.

## What allowance does

You ask the agent a question about a prediction market (demo: **FED261211**, *"Fed decision in December?"*,
and **BTC2611302200**, *"BTC price on November 30"*). The agent:

1. **Reads the market for free** from Gemini's Prediction Markets API.
2. **Buys the data it needs** from paid endpoints that answer `402 Payment Required` ([x402](https://x402.org)).
   It pays in devnet USDC from its own wallet, held in Circle Developer-Controlled Wallets.
3. **Checks every payment against a policy** before any money moves:
   allow, block, or ask a human.
4. **Proposes a trade** with a specific limit price. Trades always need approval. The human scans a
   Solana Pay QR (or clicks *Sign in browser*) and signs a memo transaction. The agent sees the signature
   onchain and only then places the order.
5. **Logs every spend** (paid, blocked, waiting for approval, failed) to a ledger with the Solana
   transaction signature, so every payment can be checked on Solana Explorer.

The human funds the agent with an **SPL token delegate allowance**: they approve *N* USDC from their own
wallet, and the agent can only pull up to that amount. Revoking it (one click on the home page) cuts the agent off. That limit
is enforced by the token program, not by our server.

## Guardrails

| Rule | Default | Enforced by |
|---|---|---|
| Max per data call | 0.10 USDC | `lib/policy.ts` |
| Daily cap | 5.00 USDC | `lib/policy.ts` + `spend_ledger` |
| Endpoint allowlist | only our 3 paid endpoints, on our own origin | `lib/policy.ts` |
| Human approval | above 2.00 USDC, and **every trade** | `lib/policy.ts` + Solana Pay |
| Total the agent can ever pull | whatever the human delegated | SPL Token program (onchain) |
| Who can trigger the agent | holders of `AGENT_INTERNAL_SECRET` | `proxy.ts` |

**Prompt injection.** `/api/paid/news` can append a hostile headline (`?inject=1` or `DEMO_INJECTION=true`)
that tells the agent to pay an outside address or buy everything. Even if the model goes along with it, the
payment still goes through `evaluate()`. An endpoint that isn't allowlisted is blocked, per-call and daily caps
still apply, and a trade still needs a human signature.

## How a payment works

```
agent ── GET /api/paid/news ──────────────▶ 402 + price (USDC, payTo, solana devnet)
  │
  ├─ evaluate(policy, {amount, url, spentToday})
  │     block            → log "blocked", stop
  │     require_approval → create Solana Pay approval, log "pending_approval", stop
  │     allow            ↓
  ├─ build USDC transferChecked, Circle signs as the agent (facilitator pays the SOL fee)
  ├─ retry with PAYMENT-SIGNATURE ──────────▶ facilitator verifies + settles onchain ──▶ 200 + data
  └─ log "paid" with the tx signature (Solana Explorer link)
```

## Paid endpoints (x402, devnet USDC)

| Endpoint | Price | Returns |
|---|---|---|
| `/api/paid/odds-history?event_ticker=` | $0.01 | Odds over time: Gemini candles, plus our per-minute recorder, plus the live ticker |
| `/api/paid/news?event_ticker=` | $0.02 | Recent headlines for the market's topic (Google News RSS) |
| `/api/paid/analysis?symbol=` | $0.05 | Order-book analysis: spread, depth, imbalance |

Bad parameters return 400 *before* the paywall, so a malformed request is never charged.

## Stack

- **Solana devnet**: `@solana/web3.js`, `@solana/kit`, `@solana/spl-token`
- **x402** (`@x402/next`, `@x402/core`, `@x402/svm` pinned to 2.28.0): HTTP 402 payments; the facilitator pays fees
- **Circle Developer-Controlled Wallets**: the agent's wallet (`SOL-DEVNET`); keys never touch our server
- **Solana Pay**: transaction-request links and QR codes for human approval
- **Gemini Prediction Markets API** (the Gemini *exchange*, not Google's AI): market data from
  production, orders on **sandbox** only
- **Supabase**: approvals, the spend ledger, and recorded odds
- **Next.js 16** (App Router) on **Vercel**

## Run it locally

You need Node 20+, a Supabase project, a Circle developer account, and Phantom set to devnet.

```bash
npm install
cp .env.example .env          # fill in the values; every one is documented in the file
```

1. **Database.** Run `supabase/migrations/0001_approvals.sql` and `0002_spend_ledger.sql` in the Supabase SQL
   editor. If the API still says a table is missing afterwards, run `NOTIFY pgrst, 'reload schema';`.
2. **Wallets.** Run `npm run setup:wallets`. It creates the Circle wallet set, the agent's `SOL-DEVNET` wallet
   and a seller keypair, then prints the values to copy into `.env`.
3. **Fund the agent wallet** with devnet USDC from https://faucet.circle.com and a little SOL from
   https://faucet.solana.com. The SOL pays the fees for delegate top-ups.
   The seller wallet (`X402_PAY_TO_ADDRESS`) also needs a USDC token account.
4. **Run the app:**
   ```bash
   npm run dev
   npm run pay:once -- "/api/paid/news?event_ticker=FED261211"   # one real x402 payment, prints the Explorer link
   npm test                                                       # policy + ledger wiring unit tests
   npm run ledger:smoke                                           # live check against Supabase spend_ledger
   ```
5. **Odds recorder (optional).** `scripts/poll.mjs` saves Gemini odds into `odds_snapshots` every minute:
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... EVENTS=BTC2611302200,FED261211,SPXEND26 node scripts/poll.mjs
   ```
   Run it without `EVENTS` to list the active markets.

Solana Pay links use `NEXT_PUBLIC_SOLANA_PAY_BASE_URL`, set to the deployed URL even when you run locally,
because Phantom can't reach `localhost`.

## Repo map

```
app/api/paid/*           x402-protected data endpoints
app/api/agent/run        agent loop (POST, needs x-agent-secret)
app/api/agent/topup      SPL delegate status and top-up
app/api/approve/*        Solana Pay approvals: create, transaction request, onchain check
lib/policy.ts            pure spending policy (unit tested)
lib/policyFetch.ts       agentFetch + policy + ledger + approvals
lib/agentPay.ts          x402 client that pays from the Circle wallet
lib/ledger.ts            spend_ledger: getSpentToday(), recordSpend()
lib/approvals.ts         create, verify onchain, and mark approvals
lib/delegate.ts          SPL delegate top-ups (transferChecked as delegate + Memo)
lib/gemini.ts            Gemini Prediction Markets client
components/ApprovalModal.tsx   QR code + "Sign in browser" approval UI
scripts/                 pay-once, setup-wallets, prove-revoked, ledger-smoke, poll
```

## Team

TODO: names and roles.
