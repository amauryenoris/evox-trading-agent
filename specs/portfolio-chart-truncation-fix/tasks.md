# Tasks — Portfolio Chart Truncation Fix

## Pre-Implementation

- [ X] Amaury has reviewed and approved this spec
- [ ] Protected Zone changes confirmed (N/A — no Protected Zone files touched)
- [ ] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

### Phase 1 — Vercel Configuration (manual — cannot be automated)

- [ X] T-01: In Vercel Dashboard → Project → Settings → Environment Variables,
      locate `SUPABASE_URL` and verify its current value
- [ X] T-02: If `SUPABASE_URL` ≠ `https://hhrtqxwonpmryziuejeq.supabase.co`,
      update it to `https://hhrtqxwonpmryziuejeq.supabase.co` for all
      environments (Production, Preview, Development)
- [X ] T-03: Verify `SUPABASE_SERVICE_ROLE_KEY` is the service role key for
      project `hhrtqxwonpmryziuejeq` (not a key for the old project)

### Phase 2 — Code Cleanup

- [x] T-04: In `src/app/api/portfolio-history/route.ts`, remove the first
      debug block (lines with `CURRENT_LIMIT` constant + first `console.log`)
      added in commit `2525800`
- [x] T-05: Remove the second debug block (5-line `console.log` with
      `'raw rows:'`, `'first row date:'`, `'last row date:'`, `'unique days in map:'`)
      added in commit `64ede05`
- [x] T-06: Verify diff shows exactly -11 lines, no other changes

### Phase 3 — Deploy & Verify

- [x] T-07: Commit cleanup with `chore: remove [API DEBUG] logs from portfolio-history`
      and push to trigger Vercel redeploy
- [ ] T-08: After deploy, open `/api/portfolio-history` in browser and confirm:
      - `history.length` ≥ 40 (trading days Apr 20 → Jun 2)
      - `history[history.length-1].date` = `2026-06-02` (or most recent trading day)
- [ ] T-09: Open dashboard and confirm "Portfolio Value" chart renders a
      continuous equity curve from April 20 through June 2

## Post-Implementation

- [ ] Run `/review portfolio-chart-truncation-fix` to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (expected: yes)

## Estimated Complexity

**Low** — the code fix is a deletion (remove debug logs). The impactful change is a
Vercel env var update which takes under 2 minutes. Risk is minimal — no logic changes,
no new code, no schema changes.
