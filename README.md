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

You ask the agent, Claude (`claude-opus-5-5`) with tool calling, a question about a prediction market (default demo market:
**BTC2611302200**, *"BTC price on November 30"*, which exists on both Gemini production and sandbox; **FED261211**,
*"Fed decision in December?"*, is also available for data). The agent:

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
| Who can trigger the agent | `/api/agent/*`: holders of `AGENT_INTERNAL_SECRET`. The `/agent` page is public. | `proxy.ts` |
| How often the agent can run | 1 run per 30 s, 30 runs per UTC day (API and page combined) | `lib/rateLimit.ts` + `agent_runs` |

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

## The agent

`lib/agent.ts` runs **Claude `claude-opus-5-5`** through the Anthropic Messages API **Tool Runner** (tool calling),
hosted in our own server so the tools can use our wallet, database and exchange keys. Adaptive thinking with effort
`medium`, server-side refusal fallbacks on, at most 12 tool iterations per run.

| Tool | Cost | What it does |
|---|---|---|
| `get_market` | free | Contracts with live production prices, and which ones are tradable on the Gemini sandbox |
| `buy_odds_history` | $0.01 | Paid via `policyFetch` (policy check, x402 payment, ledger row) |
| `buy_news` | $0.02 | Paid via `policyFetch`. Headlines are handed to Claude as **untrusted data** |
| `buy_analysis` | $0.05 | Paid via `policyFetch` |
| `propose_trade` | – | Validates against live sandbox contract specs (listing, price/qty grid, $25 demo cap), checks the policy (`kind: "trade"`), creates a Solana Pay approval. **Never executes.** At most one per run. |

After the human signs, `executeApprovedTrade` (`lib/trade.ts`) re-checks the signature onchain, makes sure the order
matches the approved text exactly, and places a **real Gemini sandbox limit order**. If the sandbox rejects it, a
clearly labeled paper trade is recorded instead. The `/agent` page shows the odds chart, each tool step with its
Explorer link, the proposal, the approval modal and the resulting order id.

## Demo run (production, November 20, 2026)

One run on https://allowance-chi-nine.vercel.app/agent, market BTC2611302200. Every payment below is a finalized
devnet USDC transfer from the agent wallet to the seller wallet.

| Time (UTC) | What | Amount | Proof |
|---|---|---|---|
| 15:17:12 | `buy_analysis` GEMI-BTC2611302200-HI67500 | 0.05 USDC | [3N2Eswme…](https://explorer.solana.com/tx/3N2EswmeTVqRqKnrrqsDv5cZ9G3eMsqMo4fnAboxaQax2vvedPN9NEzoQkSiqvUE6c94yRDg3vmgwE9H5YhaaKM5?cluster=devnet) |
| 15:17:12 | `buy_news` BTC2611302200 | 0.02 USDC | [cT2UreMn…](https://explorer.solana.com/tx/cT2UreMnUX5L5DGcgpAbRmZegWZxeYtK7jzgaGiWHgtsgvjSsK7PbyFc2HZYcKBN3CkGNCjTLYQSAXP1MRNbQ1f?cluster=devnet) |
| 15:17:14 | `buy_odds_history` BTC2611302200 | 0.01 USDC | [3xTUJn17…](https://explorer.solana.com/tx/3xTUJn17gCeoANxaqjaXxfMuH8ddP8iuJUTQ5363vNWDEPx2z9fH2WijXMyEhKGj4NQ4NtzFiPKAnK7bWi5HYAoz?cluster=devnet) |
| 15:17:44 | `buy_news` BTC2611302200 | 0.02 USDC | [QpLSWy25…](https://explorer.solana.com/tx/QpLSWy25vb4Zn8qSTKmNpafKwWCEkeHS3VTkecRG9asTebD2M76AHHa1Sw6sCYnfbiYQGN2DDmwEyQZ1jd9xT27?cluster=devnet) |
| 15:17:44 | `buy_odds_history` GEMI-BTC2611302200-HI67500 | 0.01 USDC | [237KL8qQ…](https://explorer.solana.com/tx/237KL8qQPMdJiEh4XNtCGrL4VNcLNouFRGw9YfCBhKTeGFyoXMs8rpYrjSEwrqvjpknVbGqswNds5iC7JjcWmr86?cluster=devnet) |
| 15:17:53 | `propose_trade`: *Buy 20.00 YES GEMI-BTC2611302200-HI67500 @ 0.07 (~$1.40)* → approval #3 | – | ledger `pending_approval` |
| 15:18:28 | Human approval: Phantom signs memo `approve #3: Buy 20.00 YES …` | – | [4G3YfzsV…](https://explorer.solana.com/tx/4G3YfzsVTuqPP41gRT9AKnU7YymwJGrx34oztnu479oTq3dvxK3TNaXmPSUEAQdggFQrkBopKBL9VKi1ih3GW3eX?cluster=devnet) |
| 15:18:31 | **Gemini sandbox order `145853902325065147`** placed (limit buy, status `open`) | sandbox play money | ledger `paid` (0 USDC) |

The approval transaction was checked onchain: the memo matches approval #3 exactly, the signer is the approver bound
to the request (`gLGaL5TnBSgfeaGD4h6VkCqP6KJ13aZT4bJTxK7MbWX`), and the Solana Pay reference key is present.

## Onchain programs and addresses (devnet)

| What | Address |
|---|---|
| SPL Token program | [`TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`](https://explorer.solana.com/address/TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA?cluster=devnet) |
| Associated Token Account program | [`ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL`](https://explorer.solana.com/address/ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL?cluster=devnet) |
| Memo program (v2) | [`MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr`](https://explorer.solana.com/address/MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr?cluster=devnet) |
| System program (0-lamport transfer that carries the Solana Pay reference) | `11111111111111111111111111111111` |
| USDC mint (Circle, devnet) | [`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`](https://explorer.solana.com/address/4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU?cluster=devnet) |
| Agent wallet (Circle, `SOL-DEVNET`) | [`2HyQKpXvLsC8i9v9AoHJBLAvsS6UATmxzFgo3fZobF2S`](https://explorer.solana.com/address/2HyQKpXvLsC8i9v9AoHJBLAvsS6UATmxzFgo3fZobF2S?cluster=devnet) |
| Seller wallet (receives x402 payments) | [`HyiucXmHwYJtBPNg7dEJRFYFpRJzUVAXkN6jrTfAiktj`](https://explorer.solana.com/address/HyiucXmHwYJtBPNg7dEJRFYFpRJzUVAXkN6jrTfAiktj?cluster=devnet) |
| x402 facilitator fee payer (x402.org) | `CKPKJWNdJEqa81x7CkZ14BVPiY6y16Sxs7owznqtWYp5` |

## Paid endpoints (x402, devnet USDC)

| Endpoint | Price | Returns |
|---|---|---|
| `/api/paid/odds-history?event_ticker=` | $0.01 | Odds over time: Gemini candles, plus our per-minute recorder, plus the live ticker |
| `/api/paid/news?event_ticker=` | $0.02 | Recent headlines for the market's topic (Google News RSS) |
| `/api/paid/analysis?symbol=` | $0.05 | Order-book analysis: spread, depth, imbalance |

Bad parameters return 400 *before* the paywall, so a malformed request is never charged.

## Stack

- **Claude `claude-opus-5-5`** (Anthropic Messages API, Tool Runner) with tool calling: the agent
- **Solana devnet**: `@solana/web3.js`, `@solana/kit`, `@solana/spl-token`
- **x402** (`@x402/next`, `@x402/core`, `@x402/svm` pinned to 2.28.0): HTTP 402 payments; the facilitator pays fees
- **Circle Developer-Controlled Wallets**: the agent's wallet (`SOL-DEVNET`); keys never touch our server
- **Solana Pay**: transaction-request links and QR codes for human approval
- **Gemini Prediction Markets API** (the Gemini *exchange*, not Google's AI): market data from
  production, orders on **sandbox** only
- **Supabase**: approvals, the spend ledger, and recorded odds
- **Next.js 16** (App Router) on **Vercel**

## Run it locally

You need Node 20+, a Supabase project, a Circle developer account, an Anthropic API key, and Phantom set to devnet.

```bash
npm install
cp .env.example .env          # fill in the values; every one is documented in the file
```

1. **Database.** Run `supabase/migrations/0001_approvals.sql`, `0002_spend_ledger.sql` and `0003_agent_runs.sql`
   (the agent rate limit; runs are refused until it exists) in the Supabase SQL editor. If the API still says a table is missing afterwards, run `NOTIFY pgrst, 'reload schema';`.
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
app/agent                dashboard: odds chart, run the agent, approve its trade, see the sandbox order
app/api/agent/run        agent loop (POST, needs x-agent-secret, rate limited)
app/api/agent/execute    place the sandbox order for an approved proposal
app/api/agent/topup      SPL delegate status and top-up
app/api/approve/*        Solana Pay approvals: create, transaction request, onchain check
lib/agent.ts             Claude claude-opus-5-5 agent loop (Tool Runner, 5 tools)
lib/trade.ts             trade validation, proposal + approval, sandbox execution
lib/rateLimit.ts         1 run / 30 s, 30 / day (Supabase agent_runs)
lib/odds.ts, lib/news.ts odds history (candles + recorder + live) and Google News headlines
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
