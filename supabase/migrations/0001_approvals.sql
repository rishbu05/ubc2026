-- Human approvals for agent actions above the policy threshold.
-- The user approves by signing a Solana Pay memo transaction "approve #<id>: <description>".
create table if not exists public.approvals (
  id            bigint generated always as identity primary key,
  description   text        not null,
  amount_usdc   numeric(20, 6),
  resource_url  text,
  -- Solana Pay reference pubkey (base58); attached to the tx so the checker can find it onchain.
  reference     text        not null unique,
  -- Optional: only this wallet may approve. Null = any wallet; filled with the signer once approved.
  approver      text,
  status        text        not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  signature     text unique,
  created_at    timestamptz not null default now(),
  approved_at   timestamptz
);

create index if not exists approvals_status_idx on public.approvals (status);

-- Server uses the service role key (bypasses RLS). No anon access.
alter table public.approvals enable row level security;
