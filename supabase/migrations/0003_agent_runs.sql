-- Agent runs: audit log + global rate limit for the Claude agent loop (lib/rateLimit.ts).
-- `slot` = floor(epoch_seconds / 30): the unique constraint makes "max 1 run per 30s" atomic across
-- serverless instances (a concurrent second insert in the same window fails with 23505).
create table if not exists public.agent_runs (
  id           bigint generated always as identity primary key,
  started_at   timestamptz not null default now(),
  slot         bigint      not null unique,
  source       text        not null,              -- 'api' | 'page'
  task         text,
  status       text        not null default 'started' check (status in ('started', 'succeeded', 'failed')),
  finished_at  timestamptz,
  error        text
);

create index if not exists agent_runs_started_idx on public.agent_runs (started_at desc);

-- Server uses the service role key (bypasses RLS). No anon access.
alter table public.agent_runs enable row level security;

-- Make the new table visible to the API immediately.
notify pgrst, 'reload schema';
