# Review Report — Fix SPX Snapshot Insufficient SMA200 Window

**Date**: 2026-06-24
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Fetch enough calendar days to reliably yield ≥201 trading-day bars | ✅ | `claude-agent.ts:870` — `daysBack` changed `260` → `400`. 400 calendar days × ~0.69 trading-day ratio ≈ 276 bars, comfortably ≥ 201. Validated empirically by the new test's 276-bar case |
| FR-02 | Preserve existing fail-open behavior unchanged | ✅ | `.catch((err) => { console.error(...); return [] })` at lines 870-873 is byte-identical except for the changed numeric argument |
| FR-03 | Preserve no-lookahead-bias behavior unchanged | ✅ | `refIndex = bars.length - 2` (line 829) untouched — confirmed via `computeSpxSnapshot()` diff (zero changes) |
| FR-04 | Same calculation formulas, only fetch window changes | ✅ | `computeSpxSnapshot()` (lines 817-855) is byte-for-byte identical to pre-fix version — confirmed via direct read and via `git diff` showing only the call-site line changed |
| NFR-01 | `npx tsc --noEmit` passes | ✅ | Verified — zero errors |
| NFR-02 | `npm run build` passes | ✅ | Verified — required clearing a stale `.next` directory first (unrelated environment/OneDrive file-lock issue, not a code defect); clean rebuild succeeded |
| NFR-03 | Lookback value justified by the same margin already proven in the backfill script | ✅ | `400` exactly matches `scripts/backfill-spx-regime.ts:74` (`earliest.setDate(earliest.getDate() - 400)`) |
| C-01 | Protected Zone confirmed by Amaury | ✅ | Both checkboxes checked in tasks.md pre-implementation |
| C-02 | No change to `computeSpxSnapshot()`'s internal calc logic | ✅ | Confirmed byte-identical |
| C-03 | No change to `learning.ts`/`db.ts`/`types.ts` | ✅ | `git status` shows none of these files touched |
| C-04 | Single shared SPY source, no second independent fetch introduced | ✅ | Only the existing `spyBars`/`spxSnapshot` pipeline touched; no new fetch call added anywhere |

---

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | MODIFIED | Expected — listed in design.md; confirmed by Amaury; single-line numeric argument change |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

`git diff --stat` confirms exactly 1 file changed, 1 insertion(+), 1 deletion(-) — the smallest possible diff matching design.md's "Impact on Existing Files" table exactly.

---

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | This code path runs before any Claude call in `runAgentCycle()`; no prompt/schema/action-field changes anywhere in the diff |
| Supabase patterns | ✅ | No DB queries touched |
| TypeScript quality | ✅ | No `any`; no mutation; `computeSpxSnapshot`/`smaAt` unchanged and already under 50 lines; `400` is a literal matching the existing project convention of inline-commented domain constants (consistent with how `260`, `50`, `200` were treated in the original Macro-C Part 1 review) |
| Security | ✅ | No secrets, no SQL, no sensitive data in logs or test fixtures |

---

## Task Checklist

- Completed: 9/11 (T-01–T-04 implementation + 2/3 post-implementation items checked; this review is the 3rd)
- Pending: T-05, T-06 — both require a live agent cycle and a live Supabase read against a newly-opened position, neither executable in this static-review environment. Consistent with how equivalent live-verification tasks were left pending in the two prior specs this session (`fix-mr-gate-rejection-message` T-08, `SF-B` T-07).

---

## Findings

### CRITICAL (blocks merge)
None

### HIGH (should fix)
None

### MEDIUM (consider fixing)
None

### LOW (optional)
- **T-05/T-06 pending**: live-cycle and Supabase verification cannot be performed statically. Verify on the next scheduled agent run (hourly cron, market hours) that `[MACRO_SPX]` logs show non-null `sma50`/`sma200`/`regime`, and that a newly-opened position's `open_position_contexts.indicators` reflects the same.
- **Pre-existing affected positions remain stuck null**: as already flagged as an open design question (not blocking) — NOK/MSFT/AMZN/CVX and any other currently-open positions bought before this fix will keep `null` `spx_*` in their stored `indicators` for the lifetime of that position, since this fix only affects future `runAgentCycle()` calls. A follow-up backfill against `open_position_contexts` was explicitly called out as a candidate future `/spec`, not in scope here.
- **Build required clearing a stale `.next` directory**: unrelated to this change (Windows/OneDrive file-locking on a prior build's artifacts, same family of issue already documented in memory for `.git/worktrees`) — noted for awareness, not a code defect.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. All 11 verifiable requirements (4 FR + 3 NFR + 4 constraints) satisfied. `tsc`, build (after clearing an unrelated stale artifact), and 4/4 new tests pass. Diff is the exact single-line change specified in design.md — no Protected Zone file other than the explicitly-approved `claude-agent.ts` touched, and `computeSpxSnapshot()` confirmed byte-identical. Ready to commit.
