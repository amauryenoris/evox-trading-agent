# Tasks — Portfolio History Debug Logging

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A — no Protected Zone files touched)
- [x] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

### Phase 1 — API Route
- [x] T-01: In `src/app/api/portfolio-history/route.ts`, add `const CURRENT_LIMIT = 10000` immediately after `if (error) throw error`
- [x] T-02: Add the `console.log('[API DEBUG]', ...)` line immediately after `CURRENT_LIMIT` (see design.md for exact text)
- [x] T-03: Verify no other lines in the file were modified (diff should show exactly +2 lines)

### Phase 2 — Deploy & Observe
- [ ] T-04: Commit with `chore: add [API DEBUG] log to portfolio-history route` and push to trigger Vercel deploy
- [ ] T-05: Open `/api/portfolio-history` in the browser and record: `history.length`, `history[0].date`, `history[history.length-1].date`, last 3 objects from `history` array
- [ ] T-06: Open Vercel Function Logs for the `/api/portfolio-history` invocation and paste the `[API DEBUG]` line output
- [ ] T-07: Interpret result using the decision tree in design.md and report findings

### Phase 3 — Cleanup
- [ ] T-08: After diagnosis is complete, remove the two debug lines in a follow-up commit (`chore: remove [API DEBUG] log from portfolio-history`)

## Post-Implementation

- [ ] Run `/review portfolio-history-debug-logging` to verify implementation matches spec
- [ ] Confirm Protected Zone files unchanged (expected: yes, no Protected Zone files touched)

## Estimated Complexity

**Low** — 2-line insertion in a single non-protected file. Deploy + observe cycle is the only meaningful step.
