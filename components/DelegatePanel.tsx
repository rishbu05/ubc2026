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
      <p className="text-sm text-red-600">Set NEXT_PUBLIC_AGENT_WALLET_ADDRESS to enable the allowance panel.</p>
    );
  }
  const agentIsDelegate = status?.delegate === agent.toBase58();

  return (
    <section className="w-full max-w-md rounded-xl border border-black/10 dark:border-white/15 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Agent allowance</h2>
        <WalletMultiButton />
      </div>

      <p className="text-sm opacity-70 break-all">Agent: {agent.toBase58()}</p>

      {publicKey && status && (
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          <dt className="opacity-70">Your USDC</dt>
          <dd className="text-right tabular-nums">{status.balance}</dd>
          <dt className="opacity-70">Agent allowance</dt>
          <dd className="text-right tabular-nums">{agentIsDelegate ? status.delegated : 0}</dd>
          {status.delegate && !agentIsDelegate && (
            <dd className="col-span-2 text-amber-600">
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
            className="w-28 rounded-md border border-black/15 dark:border-white/20 bg-transparent px-2 py-1.5 tabular-nums"
            aria-label="USDC amount"
          />
          <button
            onClick={approve}
            disabled={busy}
            className="flex-1 rounded-md bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 font-medium disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={revoke}
            disabled={busy || !status?.delegate}
            className="rounded-md border border-black/15 dark:border-white/20 px-3 py-1.5 disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
      ) : (
        <p className="text-sm opacity-70">Connect Phantom (devnet) to set an allowance.</p>
      )}

      {message && (
        <p className={`text-sm break-all ${message.error ? "text-red-600" : ""}`}>
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
