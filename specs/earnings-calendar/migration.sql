-- earnings_calendar: daily cache of upcoming earnings report dates (source: Nasdaq calendar).
-- This is the DDL ALREADY APPLIED to the database by the owner (2026-10-29).
-- Kept in the repo only so the file matches production. Do not apply from the agent.

create table if not exists public.earnings_calendar (
  symbol text not null,
  report_date date not null,
  session text not null default 'UNKNOWN' check (session in ('BMO','AMC','UNKNOWN')),
  fetched_at timestamptz not null default now(),
  primary key (symbol, report_date)
);
create index if not exists earnings_calendar_report_date_idx on public.earnings_calendar (report_date);
alter table public.earnings_calendar enable row level security;
-- RLS on, no anon policy (deny-all for the Data API); service role bypasses RLS.
grant select on public.earnings_calendar to anon;
grant select, insert, update, delete on public.earnings_calendar to authenticated;
grant all on public.earnings_calendar to service_role;
