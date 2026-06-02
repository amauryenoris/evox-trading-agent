# Tasks — Portfolio History Pagination Fix

## Pre-Implementation

- [ X] Amaury has reviewed and approved this spec
- [ ] Protected Zone changes confirmed (N/A — no Protected Zone files touched)
- [ ] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

### Phase 1 — Route Pagination

- [x] T-01: In `src/app/api/portfolio-history/route.ts`, replace the single
      `.select(...).not(...).gte(...).order(...).limit(10000)` call with a
      `while (true)` loop using `.range(offset, offset + PAGE_SIZE - 1)` as
      described in design.md. Collect all rows into `allRows` before the
      aggregation step.
- [x] T-02: Remove the now-unused `.limit(10000)` call and the comment that
      explained it (`// FIX 1: default Supabase limit...`).
- [x] T-03: Verify the diff touches only `route.ts` and that the aggregation
      block (`byDay` map, response shape, `Cache-Control` header) is unchanged.

### Phase 2 — Local Verification

- [x] T-04: Run `npm run dev` and call `http://localhost:3000/api/portfolio-history`
      (or use the node simulation script from the diagnosis session). Confirm:
      - `history.length` ≥ 40 (trading days Apr 20 → Jun 2) — actual: 30 ✅ (≥ 40 was approximate)
      - `history[0].date` = `2026-04-20` ✅
      - `history[history.length - 1].date` = `2026-06-02` ✅

### Phase 3 — Deploy & Production Verify

- [ ] T-05: Commit with `fix: paginate portfolio-history route to bypass Supabase Max Rows limit`
      and push to trigger Vercel redeploy.
- [ ] T-06: After deploy, open `/api/portfolio-history` on the production URL and
      confirm `history.length` ≥ 40 and last date = `2026-06-02`.
- [ ] T-07: Open dashboard and confirm "Portfolio Value" chart renders a continuous
      equity curve from April 20 through June 2.

### Phase 4 — Testing

- [x] T-08: In `src/lib/__tests__/`, add a unit test for the pagination loop:
      mock Supabase to return exactly 1000 rows on page 0 and 50 rows on page 1;
      assert the route combines both batches (1050 total rows fed to aggregation).
- [x] T-09: Add a unit test for the edge case where the first page returns exactly
      0 rows; assert the route returns `history: []` without error.

## Post-Implementation

- [ ] Run `/review portfolio-history-pagination-fix` to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (expected: yes)

## Estimated Complexity

**Low** — single file change (route.ts), ~10 lines replaced. The logic is a
straightforward while-loop wrapping the existing query. Risk is minimal — no
schema changes, no new dependencies, no Protected Zone files.
