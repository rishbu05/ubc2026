// agentFetch: fetch wrapper that pays x402 (HTTP 402) challenges from the agent's Circle wallet.
//
// Flow: request -> 402 + PaymentRequired -> x402 ExactSvmScheme builds a USDC transferChecked tx
// (fee payer = facilitator) -> Circle sign-transaction API partially signs it as the agent ->
// retry with the PAYMENT-SIGNATURE header -> facilitator verifies + settles onchain ->
// PAYMENT-RESPONSE header carries the settlement tx signature.
import "server-only";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import type { PaymentRequirements } from "@x402/core/types";
import type { TransactionPartialSigner } from "@solana/kit";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { agentKitSigner } from "./circle";
import { RPC_URL, SOLANA_CAIP2, baseUnitsToUsdc, explorerTxUrl } from "./solana";

export interface PaymentInfo {
  /** Settlement transaction signature on Solana devnet. */
  txSignature: string;
  explorerUrl: string;
  amountUsdc: number;
  payTo: string;
  payer?: string;
  network: string;
}

export interface AgentFetchResult {
  response: Response;
  /** Present when a payment was made and settled. */
  payment?: PaymentInfo;
}

export interface AgentFetchOptions {
  /** Override the signer (default: agent's Circle wallet). Useful for local tests with a keypair. */
  signer?: TransactionPartialSigner;
  /**
   * Called before paying. Return false (or throw) to refuse. Plug lib/policy.ts `evaluate` in here.
   * When refused, the original 402 response is returned with no payment.
   */
  beforePay?: (req: {
    amountUsdc: number;
    payTo: string;
    resourceUrl: string;
    requirements: PaymentRequirements;
  }) => boolean | Promise<boolean>;
}

function buildHttpClient(signer: TransactionPartialSigner): x402HTTPClient {
  const client = new x402Client().register(SOLANA_CAIP2, new ExactSvmScheme(signer, { rpcUrl: RPC_URL }));
  return new x402HTTPClient(client);
}

let _agentHttp: x402HTTPClient | null = null;
function httpClient(signer?: TransactionPartialSigner): x402HTTPClient {
  if (signer) return buildHttpClient(signer);
  return (_agentHttp ??= buildHttpClient(agentKitSigner()));
}

export async function agentFetch(
  input: string | URL,
  init: RequestInit = {},
  opts: AgentFetchOptions = {},
): Promise<AgentFetchResult> {
  const url = input.toString();
  const first = await fetch(url, init);
  if (first.status !== 402) return { response: first };

  const http = httpClient(opts.signer);
  const body = await first
    .clone()
    .json()
    .catch(() => undefined);
  const paymentRequired = http.getPaymentRequiredResponse((h) => first.headers.get(h), body);

  const requirements =
    paymentRequired.accepts.find((r) => r.network === SOLANA_CAIP2 && r.scheme === "exact") ??
    paymentRequired.accepts[0];
  if (!requirements) throw new Error(`402 from ${url} has no payment options`);
  if (requirements.network !== SOLANA_CAIP2) {
    throw new Error(`402 from ${url} wants ${requirements.network}; agent only pays on ${SOLANA_CAIP2}`);
  }

  const amountUsdc = baseUnitsToUsdc(requirements.amount);
  if (opts.beforePay) {
    const ok = await opts.beforePay({
      amountUsdc,
      payTo: requirements.payTo,
      resourceUrl: url,
      requirements,
    });
    if (!ok) return { response: first };
  }

  // Build + sign (via Circle) the payment transaction.
  const payload = await http.createPaymentPayload({ ...paymentRequired, accepts: [requirements] });
  const headers = new Headers(init.headers);
  for (const [k, v] of Object.entries(http.encodePaymentSignatureHeader(payload))) headers.set(k, v);

  const paid = await fetch(url, { ...init, headers });

  if (paid.status === 402) {
    // Payment rejected (verify/settle failed). The reason is in the new PAYMENT-REQUIRED header.
    let reason = "unknown";
    try {
      const again = http.getPaymentRequiredResponse(
        (h) => paid.headers.get(h),
        await paid.clone().json().catch(() => undefined),
      );
      reason = again.error ?? reason;
    } catch {
      /* no parseable challenge */
    }
    throw new Error(`x402 payment to ${url} was rejected: ${reason}`);
  }

  let settle;
  try {
    settle = http.getPaymentSettleResponse((h) => paid.headers.get(h));
  } catch {
    throw new Error(
      `Paid request to ${url} returned ${paid.status} without a settlement header: ${await paid.text()}`,
    );
  }
  if (!settle.success || !settle.transaction) {
    throw new Error(`x402 settlement failed: ${settle.errorReason ?? "unknown"} ${settle.errorMessage ?? ""}`);
  }

  return {
    response: paid,
    payment: {
      txSignature: settle.transaction,
      explorerUrl: explorerTxUrl(settle.transaction),
      amountUsdc,
      payTo: requirements.payTo,
      payer: settle.payer,
      network: settle.network,
    },
  };
}
