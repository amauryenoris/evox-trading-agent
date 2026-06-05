# Requirements — Portfolio Chart Truncation Fix

## Context

The "Portfolio Value" chart in the dashboard displays equity history only through
May 12, 2026, despite Supabase project `hhrtqxwonpmryziuejeq` containing 1,794
rows with data through June 2, 2026. Root cause: `SUPABASE_URL` in Vercel points
to a different (stale) Supabase project than the one the trading agent writes to.

## Functional Requirements

FR-01: The system shall return equity history points for every trading day from
April 20, 2026 through the current date when `GET /api/portfolio-history` is called.

FR-02: The system shall connect to Supabase project `hhrtqxwonpmryziuejeq`
(`https://hhrtqxwonpmryziuejeq.supabase.co`) for all server-side data access in
the Vercel deployment.

FR-03: The system shall display a continuous equity curve from April 20, 2026
through the most recent trading day in the "Portfolio Value" dashboard chart.

FR-04: The system shall not emit `[API DEBUG]` console.log statements in the
production `GET /api/portfolio-history` handler once the fix is verified.

## Non-Functional Requirements

NFR-01: The fix must not introduce any new env vars — it reuses the existing
`SUPABASE_URL` variable already present in all server-side files.

NFR-02: Response time for `GET /api/portfolio-history` must not increase — no
new queries, no schema changes.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit
confirmation from Amaury.

C-02: No trading logic, signal detection, or risk management code may be touched.

C-03: The `SUPABASE_URL` env var must remain server-side only (never prefixed
with `NEXT_PUBLIC_`) to prevent the service role key from being exposed to the
browser.

## Out of Scope

- Changing any query logic, filter, or limit in `route.ts`
- Changing any other API route
- Frontend PnLChart.tsx changes
- Adding persistent structured logging
- Supabase schema or RLS changes
