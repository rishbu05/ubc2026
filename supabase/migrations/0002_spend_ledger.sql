-- Spend ledger: one row per spend decision the agent made (paid, blocked, or sent for approval).
-- getSpentToday() in lib/ledger.ts sums `paid` rows since UTC midnight for the daily cap.
create table if not exists public.spend_ledger (
  id            bigint generated always as identity primary key,
  ts            timestamptz    not null default now(),
  agent_id      text           not null,
  amount_usdc   numeric(20, 6) not null check (amount_usdc >= 0),
  resource_url  text           not null,
  reason        text,
  -- Settlement tx signature on Solana devnet (paid rows only).
  tx_signature  text unique,
  status        text           not null check (status in ('paid', 'blocked', 'pending_approval', 'failed'))
);

create index if not exists spend_ledger_agent_ts_idx on public.spend_ledger (agent_id, ts desc);

-- Server uses the service role key (bypasses RLS). No anon access.
alter table public.spend_ledger enable row level security;
