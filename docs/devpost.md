# allowance (Devpost draft)

**Tagline:** An AI agent with a spending allowance: it pays for its own data in USDC on Solana, and needs a human signature for anything that matters.

## Inspiration

Agents are starting to pay for things on their own: APIs, data, compute. Today the choices are bad. Either you hand an agent a card with no real limit, or you approve every single call yourself. And everything the agent reads, like a news headline or an API response, can try to talk it into spending more. We wanted something in between: an allowance, like a kid's. Small purchases just happen, big ones need a parent, and the limit is enforced by the bank, not by the kid promising to behave.

## What it does

You ask the agent a question about a prediction market, such as *"Will the Fed hike in December?"* (Gemini market FED261211) or *"Where will BTC be on November 30?"* (BTC2611302200).

1. **It reads the market for free** from Gemini's Prediction Markets API.
2. **It buys the data it needs.** Our data endpoints answer `402 Payment Required` using the x402 protocol: odds history for $0.01, news for $0.02 and order-book analysis for $0.05. The agent pays in USDC on Solana devnet from its own Circle wallet, and gets the data back in the same request.
3. **Every payment goes through a spending policy first.** It checks a max per call, a daily cap, an allowlist of our own endpoints, and an approval threshold. The result is *allow*, *block*, or *ask a human*.
4. **It proposes a trade** with a specific limit price. Every trade needs approval. You scan a Solana Pay QR code with Phantom, or sign in the browser extension. The agent watches the chain for your signature and only then places the order on the Gemini sandbox.
5. **It logs every spend**: paid, blocked, waiting for approval, or failed. Paid rows carry the Solana transaction signature, so every cent can be checked on Explorer.

The human funds the agent with an **SPL token delegate**: approve N USDC from your own wallet, and the agent can pull at most N. Revoke it and the agent is cut off. That limit is enforced by the Solana token program, not by our server. Our `prove:revoked` script shows it: after a revoke, even a correctly signed top-up transaction fails onchain.

We also built a **prompt-injection demo**. The paid news feed can slip in a hostile headline telling the agent to pay an outside address. Even if the model believes it, the payment still has to pass the policy. An endpoint that isn't allowlisted gets blocked, and a trade still needs your signature.

## How we built it

- **Next.js 16** (App Router) on **Vercel**, in TypeScript.
- **x402** (`@x402/next`, `@x402/svm`) protects the data endpoints. The x402.org facilitator pays the SOL fee, so the agent only needs USDC.
- **Circle Developer-Controlled Wallets** hold the agent's `SOL-DEVNET` wallet. Every agent transaction is signed through Circle's signing API, so no private key sits on our server.
- **Solana Pay** transaction requests handle approvals. The wallet signs a memo `approve #<id>: <description>`, and we find it onchain by its reference key and verify the memo and the signer before marking it approved.
- **SPL Token** `approveChecked` / `transferChecked` provide the delegate allowance, with a Memo carrying the reason for each top-up.
- **Gemini Prediction Markets API** (the Gemini crypto exchange): public market data from production, signed orders on the sandbox only.
- **Supabase** stores approvals and the spend ledger. A per-minute odds recorder also writes every contract's bid, ask and last price, which powers the odds-history endpoint.
- **The policy engine is a pure function**, unit tested for allowed calls, blocked endpoints, the per-call max, the daily cap, approval thresholds and trades.
- **Claude** (Anthropic API) runs the agent, using tool calling to read markets, buy data and propose trades.
- [TODO: agent loop details: tools, step limit, how results are streamed to the UI]

## Challenges we ran into

- **Dependency conflicts.** Every `@x402/next` release needs Next 16, and x402 2.29+ needs `@solana/kit` 8, which conflicts with Solana Pay's kit 6. We pinned all three x402 packages to 2.28.0.
- **Memo v2 rejects non-signer accounts.** Solana Pay finds transactions by attaching a "reference" key, but Memo refused it. We attach the reference to a 0-lamport self-transfer instead, and the memo lists only the signer.
- **The demo market wasn't on the sandbox.** FED261211 exists only on Gemini production. We split the client so market data comes from production and orders go to the sandbox only, and we never place real orders.
- **Settlement failures with unclear errors.** x402 settlement fails if the seller wallet has no USDC token account. It took a while to track down `invalid_exact_svm_recipient_ata_missing`.
- **Phantom can't reach localhost**, so Solana Pay links always point at the deployed URL, even during local development.
- **Floating-point money.** 0.97 + 0.03 must not count as over a $1.00 cap. The policy compares amounts in micro-USDC.

## Accomplishments that we're proud of

- **Every payment the agent makes is a real onchain transaction** you can click through on Solana Explorer.
- **The hard limit doesn't depend on our code.** Even if our server or the model is compromised, the agent can't pull more than the delegated amount.
- **Approval is a wallet signature, not a button on our site.** The approval is recorded onchain and tied to the exact action being approved.
- **A prompt injection that fools the model still can't spend the money.**

## What we learned

- x402 makes paid APIs feel like normal HTTP, and having the facilitator pay fees removes a lot of friction for agents.
- Solana's token delegates are an underused primitive. They're exactly what agent budgets need.
- **Agent safety comes from layers.** Prompting helps, but the guarantees come from policy code, onchain limits and human signatures.

## What's next for allowance

- Per-merchant and per-category budgets, and allowances that reset weekly.
- Approve once for a session ("let it spend up to $1 on news today").
- Mainnet, with Circle wallets and real x402 sellers.
- [TODO: anything specific to the agent loop]

## Built with

`solana` · `x402` · `circle` · `usdc` · `solana-pay` · `spl-token` · `next.js` · `typescript` · `vercel` · `supabase` · `gemini-prediction-markets` · `phantom` · `claude` · `anthropic`

---

Links: demo https://allowance-chi-nine.vercel.app · video [TODO] · repo https://github.com/rishbu05/ubc2026
