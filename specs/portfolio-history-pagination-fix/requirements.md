# Requirements — Portfolio History Pagination Fix

## Context

The `/api/portfolio-history` route fetches `agent_log` rows from Supabase to build
the equity curve shown in the dashboard "Portfolio Value" chart. Despite using
`.limit(10000)` in the JS client, Supabase's project-level **Max Rows** setting
(default: 1000) caps every response at 1000 rows. With 1,827 rows from Apr 20 to
Jun 2, only the first 1000 (covering 16 trading days, Apr 20 – May 12) are
returned — the remaining 827 rows (May 12 – Jun 2) are silently dropped.

## Functional Requirements

FR-01: The system shall retrieve all `agent_log` rows where `portfolio_snapshot` is
       not null and `created_at >= 2026-04-20`, regardless of how many rows exist.

FR-02: The system shall fetch rows in sequential pages of at most 1000 rows each
       until a page is returned that contains fewer rows than the page size,
       indicating no more data exists.

FR-03: The system shall combine all pages into a single dataset before applying the
       per-day aggregation logic.

FR-04: The system shall return a `history` array that covers every trading day from
       the first available data point through the most recent row in Supabase.

FR-05: The system shall return the most recent available equity as `currentEquity`
       based on the full paginated dataset.

## Non-Functional Requirements

NFR-01: The total fetch time for the full history (currently ~1,827 rows across 2
        pages) shall complete within 5 seconds on a Vercel serverless function.

NFR-02: The implementation shall not require changes to Supabase project settings
        (Max Rows) to function correctly.

NFR-03: The fix shall not increase the number of Supabase queries beyond O(N/1000)
        where N is the total row count.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation
      from Amaury.
C-02: The per-day aggregation logic (one point per trading day, max equity value)
      must remain unchanged.
C-03: The `Cache-Control: no-store` response header must remain in place.

## Out of Scope

- Changing the Supabase project's Max Rows setting (infrastructure change, not code)
- Modifying the frontend chart component or its range-filtering logic
- Adding a DB-level aggregate function or stored procedure
- Changing the equity filter threshold (`> 50000`)
- Any other API routes
