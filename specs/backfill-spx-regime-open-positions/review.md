# Review Report — Backfill SPX Regime into open_position_contexts

**Date**: 2026-06-26
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Query all rows, identify candidates (any of 4 spx_* null/absent) in app code | ✅ SATISFIED | `hasMissingSpxField()` checks all 4 fields; query selects only `symbol, buy_timestamp, indicators` (narrower than design.md's `select('*')` — see LOW-01) |
| FR-02 | SPY window from candidates only (`-400d`/`+5d`) | ✅ SATISFIED | `fetchSpyBars(candidates[0].buy_timestamp, candidates[last].buy_timestamp)`, candidates pre-sorted ascending |
| FR-03 | Single bulk Alpaca fetch, same shape as reference script | ✅ SATISFIED | Identical endpoint/params (`1Day`, `feed=iex`, `limit=1000`, `sort=asc`) |
| FR-04 | ET-date conversion before resolving prior trading day | ✅ SATISFIED | `toEtDate()` — copied logic, verified by unit test |
| FR-05 | Select close strictly before ET buy date (no lookahead) | ✅ SATISFIED | `findPriorBarIndex()` uses `<`, verified by unit test |
| FR-06 | Skip + log `reason=no_prior_bar` when no prior bar | ✅ SATISFIED | Exact log string match |
| FR-07 | SMA50/SMA200 windowed average at reference bar | ✅ SATISFIED | `smaAtIndex()`, verified by unit test |
| FR-08 | Skip sma/regime (but allow spx_price) on insufficient bars | ✅ SATISFIED | See MEDIUM-01 — log string has an extra suffix beyond the literal spec'd text, but `reason=insufficient_bars` prefix matches and is grep-safe |
| FR-09 | Regime formula BULL/CAUTION/BEAR | ✅ SATISFIED | Identical formula to both `backfill-spx-regime.ts` and `computeSpxSnapshot()`; verified by unit test incl. boundary cases |
| FR-10 | Overwrite only null field(s), preserve non-null | ✅ SATISFIED* | Verified empirically: CVX's `spx_price=733.58` preserved exactly, not overwritten by recomputed `733.62`. *Caveat: `spx_sma50`/`spx_sma200`/`spx_regime` are treated as one coupled unit (if any is null, all three are recomputed) rather than 3 independently-null-checked fields — see LOW-02. This was disclosed and justified in design.md before implementation (regime is mathematically derived from both SMAs, so a "partially correct" triplet is not a realistic real-world state), so it is not a silent deviation, but it is a literal reading of FR-10's "field(s)" wording that the code doesn't fully implement at maximum granularity |
| FR-11 | Preserve all other `indicators` keys (merge, not replace) | ✅ SATISFIED | `{ ...indicators, ...fields }`; verified empirically — kalman/macd/adx survived on all 5 rows post-write |
| FR-12 | Identify row via `symbol` alone | ✅ SATISFIED | `.eq('symbol', row.symbol)`, matches `updatePositionContext` convention |
| FR-13 | Dry-run default, `[BACKFILL_OPC_DRY]` + `[BACKFILL_OPC_DRY_DONE]` | ✅ SATISFIED | Verified by actual dry-run output |
| FR-14 | Live mode (`RUN_BACKFILL=true`) UPDATE indicators | ✅ SATISFIED | Verified by actual live run + DB re-query |
| FR-15 | `[BACKFILL_OPC]` log format | ✅ SATISFIED | Verified byte-for-byte against actual terminal output |
| FR-16 | `[BACKFILL_OPC_DONE] updated=N skipped=N failed=N` | ✅ SATISFIED | Verified: `updated=2 skipped=0 failed=0` |
| FR-17 | `[BACKFILL_OPC_ERROR]` + exit 1 on Alpaca fetch failure | ✅ SATISFIED | `fetchSpyBars` throws → caught → logged → `process.exit(1)`; same label also reused (reasonably) for the Supabase pre-fetch failure path, which FR-17 doesn't explicitly cover but doesn't conflict with either |
| FR-18 | `[BACKFILL_OPC_ROW_ERROR]` + continue on row failure | ✅ SATISFIED | `failed++`, loop continues naturally |
| FR-19 | Never modify rows where all 4 fields already non-null | ✅ SATISFIED | Verified: AAPL/META/OXY never entered the candidate set in either dry or live run |
| FR-20 | Never modify `scripts/backfill-spx-regime.ts` | ✅ SATISFIED | `git diff --stat` empty for that file |
| FR-21 | Never modify any other table | ✅ SATISFIED | Code only references `open_position_contexts` |
| NFR-01 | Runnable via `npx tsx --env-file=.env.local` | ✅ SATISFIED | Ran successfully in both dry and live mode |
| NFR-02 | Exactly one Alpaca HTTP request regardless of candidate count | ✅ SATISFIED | Single `fetchSpyBars()` call in `main()`, reused for all candidates |
| NFR-03 | Logic extracted into new shared module, original untouched | ✅ SATISFIED | `scripts/lib/spx-snapshot-helpers.ts`; `backfill-spx-regime.ts` diff empty |
| NFR-04 | Helper functions pure, no I/O | ✅ SATISFIED | Confirmed by inspection; tests run with zero mocks |

## Constraints

| ID | Constraint | Status |
|----|-----------|--------|
| C-01 | No modification to `backfill-spx-regime.ts` | ✅ SATISFIED |
| C-02 | No Protected Zone modification | ✅ SATISFIED |
| C-03 | No modification to `types.ts` | ✅ SATISFIED |
| C-04 | Regime labels frozen (BULL/CAUTION/BEAR) | ✅ SATISFIED |
| C-05 | No DB migration | ✅ SATISFIED |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | `git diff --stat` empty |
| src/lib/claude-agent.ts | UNTOUCHED | `git diff --stat` empty |
| src/lib/risk-manager.ts | UNTOUCHED | `git diff --stat` empty |
| src/lib/indicators.ts | UNTOUCHED | `git diff --stat` empty |
| src/lib/news-intelligence.ts | UNTOUCHED | `git diff --stat` empty |
| src/lib/watchlist-monitor.ts | UNTOUCHED | `git diff --stat` empty |
| src/lib/learning.ts | UNTOUCHED | `git diff --stat` empty |

No Protected Zone file appears in `git status` as modified — only 4 new untracked paths exist (`scripts/backfill-spx-regime-open-positions.ts`, `scripts/lib/`, `specs/backfill-spx-regime-open-positions/`, `src/lib/__tests__/spx-snapshot-helpers.test.ts`), all of which match `design.md`'s Impact-on-Existing-Files table exactly (all `CREATE`, nothing else touched).

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | Feature does not touch `claude-agent.ts` or Claude API |
| Supabase patterns | ✅ (with note) | Errors checked (`if (fetchError)`/`if (updateError)`), CLI-script convention (log + exit/continue, not `throw`) matches `backfill-spx-regime.ts` precedent exactly. No `.limit()` on the `open_position_contexts` select — see LOW-03 (matches existing `getOpenPositionContexts()` precedent in `db.ts`, not a new gap) |
| TypeScript quality | ⚠️ (with note) | No `any` types; no in-place mutation of shared objects; file is 202 lines (well under 800). `main()` is ~115 lines, over the "<50 lines" guideline — see MEDIUM-02 (matches the reference script's own `main()`, which is similarly long) |
| Security | ✅ | No hardcoded secrets (`process.env.*` throughout); no raw SQL (Supabase client methods only); no sensitive data in logs |

## Task Checklist

- Pre-Implementation: 6/6 checked
- Implementation (T-01–T-20): 20/20 checked
- Post-Implementation: 3/3 checked (this review being the last one)
- **Total: 29/29 checked**

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- **MEDIUM-01**: FR-08's log line for the "insufficient bars, but spx_price still written" partial case appends `" (spx_price still written)"` to the `reason=insufficient_bars` string, and is emitted as a *second*, separate log line alongside the row's normal `[BACKFILL_OPC_DRY]`/`[BACKFILL_OPC]` line — meaning a single row can produce two log lines, while only being counted once in the `updated` tally (correctly — it was a real partial update, not a full skip). This is intentional and correct behavior, but the dual-log-line-per-row output could read as confusing to someone grepping logs expecting 1 line = 1 row. Consider consolidating into a single line in a future pass.
- **MEDIUM-02**: `main()` is ~115 lines, exceeding the project's "<50 lines" function-size guideline (`coding-style.md`). This matches the established style of the reference script `backfill-spx-regime.ts` (whose own `main()` is similarly long), so it's consistent with precedent for this category of CLI backfill script, but is flagged for awareness since it's a real deviation from the general project rule.

### LOW (optional)
- **LOW-01**: `design.md`'s Data Flow step 1 says `select('*')`; the implementation selects only `symbol, buy_timestamp, indicators`. This is a strict improvement (fewer bytes over the wire, no unused columns), not a regression, but is a literal deviation from the documented design that's worth a one-line note next time `design.md` is updated for traceability.
- **LOW-02**: FR-10 reads as per-field-independent ("the specific spx_* field(s)... currently null"), but the implementation treats `spx_sma50`/`spx_sma200`/`spx_regime` as one atomic triplet (recomputes all three together if any one is null), while only `spx_price` is independently null-checked. This was explicitly disclosed and justified in `design.md` (Data Flow step 6e) before implementation — `spx_regime` is mathematically derived from both SMAs in this same codebase (and in `computeSpxSnapshot()`), so a row with exactly one of the three null while the other two are valid is not a realistic state in practice. No real-world row in the current dataset exercised this edge case (CVX had all three null together). Flagging for documentation completeness only.
- **LOW-03**: The `open_position_contexts` select has no `.limit()`. This matches the existing `getOpenPositionContexts()` in `src/lib/db.ts` (also unbounded), and the table is structurally capped by `MAX_POSITIONS` (currently 5 rows) — no practical risk, but noted per the general Supabase-patterns guideline.

---

## Decision

**APPROVED WITH WARNINGS** — No CRITICAL or HIGH findings. All 21 functional requirements, 4 non-functional requirements, and 5 constraints are satisfied (one, FR-10, with a disclosed and domain-justified caveat). Protected Zone fully untouched. Reference script byte-for-byte unchanged. Live run executed successfully and independently verified against Supabase (CVX's pre-existing `spx_price` preserved exactly; all pre-existing `indicators` keys — kalman/macd/adx — survived the merge on every affected row). The 2 MEDIUM findings are cosmetic/precedent-consistent and do not affect correctness or data safety; no action required before considering this feature complete, but worth a follow-up cleanup pass if `backfill-spx-regime.ts` and this script are ever consolidated per the explicitly-deferred NFR-03.
