"use client";
// User grants the agent wallet an SPL delegate allowance of N USDC (approveChecked), or revokes it.
// The agent can then pull up to N USDC via lib/delegate.ts without further signatures.
import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  createApproveCheckedInstruction,
  createRevokeInstruction,
  getAccount,
} from "@solana/spl-token";
import {
  USDC_DECIMALS,
  USDC_MINT,
  agentAddress,
  baseUnitsToUsdc,
  explorerTxUrl,
  usdcAta,
  usdcToBaseUnits,
} from "@/lib/solana";

interface Status {
  balance: number;
  delegate: string | null;
  delegated: number;
}

async function loadStatus(connection: Connection, owner: PublicKey): Promise<Status> {
  try {
    const acct = await getAccount(connection, usdcAta(owner));
    return {
      balance: baseUnitsToUsdc(acct.amount),
      delegate: acct.delegate?.toBase58() ?? null,
      delegated: baseUnitsToUsdc(acct.delegatedAmount),
    };
  } catch {
    return { balance: 0, delegate: null, delegated: 0 }; // no USDC account yet
  }
}

export default function DelegatePanel() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [amount, setAmount] = useState("1");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // bump to reload status
  const [message, setMessage] = useState<{ text: string; href?: string; error?: boolean } | null>(null);

  const agent = useMemo(() => {
    try {
      return agentAddress();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!publicKey) return; // status is only rendered while connected
    let cancelled = false;
    loadStatus(connection, publicKey).then((st) => {
      if (!cancelled) setStatus(st);
    });
    return () => {
      cancelled = true;
    };
  }, [connection, publicKey, version]);

  async function send(build: () => Transaction, label: string) {
    if (!publicKey) return;
    setBusy(true);
    setMessage(null);
    try {
      const tx = build();
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      setMessage({ text: `${label} confirmed`, href: explorerTxUrl(signature) });
      setVersion((v) => v + 1);
    } catch (e) {
      setMessage({ text: (e as Error).message, error: true });
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    if (!agent) return;
    const n = Number(amount);
    if (!(n > 0)) return setMessage({ text: "Enter a positive amount", error: true });
    send(
      () =>
        new Transaction().add(
          createApproveCheckedInstruction(
            usdcAta(publicKey!),
            USDC_MINT,
            agent,
            publicKey!,
            usdcToBaseUnits(n),
            USDC_DECIMALS,
          ),
        ),
      `Approved ${n} USDC`,
    );
  }

  function revoke() {
    send(() => new Transaction().add(createRevokeInstruction(usdcAta(publicKey!), publicKey!)), "Revoked");
  }

  if (!agent) {
    return (
      <p className="text-sm text-[var(--acc-block)]">Set NEXT_PUBLIC_AGENT_WALLET_ADDRESS to enable the allowance panel.</p>
    );
  }
  const agentIsDelegate = status?.delegate === agent.toBase58();

  return (
    <section className="w-full max-w-md space-y-4 rounded-2xl border border-[var(--navy-line)] bg-[var(--navy-1)]/95 p-5 text-slate-100 shadow-2xl shadow-black/30">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Agent allowance</h2>
        <WalletMultiButton />
      </div>

      <p className="break-all font-mono text-xs text-slate-400">Agent: {agent.toBase58()}</p>

      {publicKey && status && (
        <dl className="grid grid-cols-2 gap-y-1 rounded-lg bg-[var(--navy-2)] p-3 text-sm">
          <dt className="text-slate-400">Your USDC</dt>
          <dd className="text-right tabular-nums">{status.balance}</dd>
          <dt className="text-slate-400">Agent allowance</dt>
          <dd className="text-right font-mono tabular-nums text-[var(--acc-pay)]">{agentIsDelegate ? status.delegated : 0}</dd>
          {status.delegate && !agentIsDelegate && (
            <dd className="col-span-2 text-amber-400">
              Another delegate is set; approving replaces it.
            </dd>
          )}
        </dl>
      )}

      {publicKey ? (
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded-md border border-[#2a3b5e] bg-[var(--navy-2)] px-2 py-1.5 font-mono tabular-nums focus:border-[var(--acc-pay)] focus:outline-none"
            aria-label="USDC amount"
          />
          <button
            onClick={approve}
            disabled={busy}
            className="flex-1 rounded-md bg-[var(--acc-pay)] px-3 py-1.5 font-medium text-[var(--navy-1)] transition hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={revoke}
            disabled={busy || !status?.delegate}
            className="rounded-md border border-[var(--acc-block)]/50 px-3 py-1.5 text-[var(--acc-block)] transition hover:bg-[var(--acc-block)]/10 disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Connect Phantom (devnet) to set an allowance.</p>
      )}

      {message && (
        <p className={`anim-step-in text-sm break-all ${message.error ? "text-[var(--acc-block)]" : "text-[var(--acc-ok)]"}`}>
          {message.text}{" "}
          {message.href && (
            <a href={message.href} target="_blank" rel="noreferrer" className="underline">
              View on Explorer
            </a>
          )}
        </p>
      )}
    </section>
  );
}
