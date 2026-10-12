# Review Report — setup-aware-learning-context

**Date**: 2026-10-12
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verification basis: static review of the diff, `npx tsc --noEmit` (clean), full Vitest run (55 files / 575 tests
pass), `npm run build` (succeeds), ESLint on the changed files (0 errors; 3 warnings, none from this change),
coverage on `learning-context.ts` (98.7% lines), and a read-only run of `.tmp/learning-context-check.ts` against
116 real closed trades. **Not run:** a live agent cycle, the real BUY prompt end to end, and a real
`open_position_contexts` write containing `learningContext`.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Pure `buildSetupLearningBlock` returning `{ text, snapshot }` | ✅ | |
| FR-02 | Time-dependent values come from `asOf`, no clock | ✅ | No `Date.now` / `new Date()` in the module (grep) |
| FR-03 | No I/O, logs, or input mutation | ✅ | No `console.*`; purity test passes |
| FR-04 | Section order a→e | ✅ | `render()` |
| FR-05 | Track record: n, win rate, avg, median, worst | ✅ | |
| FR-06 | Current rule version n | ⚠️ | Rendered, but see MEDIUM-1: for TREND_ZLE05 the "latest" boundary is a sell-side trial, giving n=1 |
| FR-07 | Percent / counts only | ✅ | |
| FR-08 | No dollar / profit-factor figure | ⚠️ | Holds for generated text. Verbatim lessons can contain them (real lesson with "$11.16"); spec was amended to say so |
| FR-09 | Empty setup → one line replaces a, b, d | ✅ | Tested |
| FR-10 | Candidate buckets via the same functions as `pattern-stats` | ✅ | Pseudo-trade + `getTradeDimensionValue` |
| FR-11 to FR-14 | Non-diagnostic, viable, resolved, `n >= MIN_BUCKET_N` | ✅ | Each has a test |
| FR-15 | Line has bucket, n, avg, shrunk, label, baseline | ✅ | |
| FR-16 | Exact label wording | ✅ | `LABEL_TEXT` |
| FR-17 | Exploratory marked | ✅ | `[exploratory]`, listed after confirmatory |
| FR-18 | No "supported"/"strong" | ⚠️ | Holds for generated text. Verbatim lessons can contain "strong" (seen in real output); spec amended |
| FR-19 to FR-21 | Same-symbol: last 3, any setup, newest first, fields, omit if none | ✅ | |
| FR-22 to FR-25 | ≤2 lessons, same setup only, newest first, tagged | ✅ | A ZLE05 lesson never reaches a 3DAY candidate (tested) |
| FR-26, FR-27 | Pre-cutoff + sector data excluded; instant comparison | ✅ | Z-vs-`-04:00` boundary test passes |
| FR-28, FR-29 | Header text; omit section when empty | ✅ | |
| FR-30 | Footer | ✅ | |
| FR-31 to FR-33 | ≤40 lines, ≤3000 chars, lessons dropped first | ✅ | Tested; real blocks were 10–15 lines / 1.0–1.5k chars |
| FR-34 to FR-38 | Snapshot shape and contents | ✅ | Key set asserted exactly |
| FR-39 | Snapshot → `{setup}\|{dimension}\|{bucket}` | ✅ | `buildPatternIds` |
| FR-40, FR-41 | One additive export in `pattern-stats.ts`; others unchanged | ✅ | Diff is a single added function |
| FR-42 | `buildLearningContext` takes setup/symbol/indicators/asOf, returns `{ text, snapshot }` | ✅ | |
| FR-43, FR-44 | Existing `getTradeEvaluations` only, limit 1000 | ✅ | `LEARNING_TRADES_LIMIT` |
| FR-45 | Delegates to the module | ✅ | |
| FR-46 to FR-49 | Old prompt parts removed | ✅ | `compareFingerprints`, recent/general lessons, pattern rows gone; import removed |
| FR-50 | `updatePatternLibrary` unchanged | ✅ | No diff hunk touches it; pattern-library tests pass |
| FR-51 | Fetch errors propagate | ✅ | No try/catch added |
| FR-52 | Per-candidate call with cycle timestamp | ✅ | Single call site, inside the candidate loop |
| FR-53 | Block text goes to the prompt in the same slot | ✅ | |
| FR-54 | Snapshot carried through `buyQueue` | ✅ | |
| FR-55, FR-56 | Snapshot persisted under `indicators.learningContext` at both sites | ➖ | Present in the diff and type-checks; never executed against a real position |
| FR-57 | `patternIdsUsed` from `buildPatternIds` at both sites | ➖ | Same; `pattern_ids` column confirmed `text[]` |
| FR-58 | Reconcile site unchanged | ✅ | `patternIdsUsed: []` still there |
| NFR-01 | <300 lines, functions <50 | ✅ | 210 lines; longest function ~37 lines |
| NFR-02 | No `any`, no new dependency | ✅ | |
| NFR-03 | Deterministic | ✅ | Tested |
| NFR-04 | ≥80% coverage | ✅ | 98.7% lines, 89.5% branches |
| NFR-05 to NFR-07 | tsc / suite / build | ✅ | |
| NFR-08 | One DB read per call | ✅ | |
| C-01 to C-05 | Scope constraints | ✅ | See Protected Zone audit |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Listed in design.md; wiring only (import, queue field, call site + guard, two persist sites). Confirmed by Amaury in conversation |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | MODIFIED | Listed in design.md; `buildLearningContext` replaced, dead prompt helpers removed, `updatePatternLibrary` / `getRelevantPatterns` untouched |

`db.ts`, `types.ts`, `trade-views.ts`, `state-fingerprint.ts`, `pattern-schema.ts`, `pattern-labels.ts`, migrations,
dashboard, workflows and `package.json` are unchanged. No unauthorized change.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Decision schema, SYSTEM_PROMPT text, and the "action forced to HOLD" path are untouched. The block carries the "informs; never gates" footer. See MEDIUM-2 for a stale prompt sentence |
| Supabase patterns | ✅ | N/A — no new query; `getTradeEvaluations` already has `.limit()` and error checks |
| TypeScript quality | ✅ | No `any`; no mutation; named constants; one narrow `in` guard for `sectorRotation` |
| Security | ✅ | No secrets, no logging of data. The `.tmp/` scripts read `.env.local` but print no values and are gitignored |

## Task Checklist

- Completed: 30/30 implementation tasks (4 post-implementation items are covered by this review)

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
1. **"Current rule version" can mislead for TREND_ZLE05.** The latest boundary by date is the sell-side
   "new exit rules trial" (2026-10-05), so the block says `Current rule version (...): n=1` although 27 trades
   were entered under the current entry rules. Claude may read n=1 as a tiny sample. Suggested follow-up: count
   by the latest *buy*-axis boundary, or show both axes.
2. **SYSTEM_PROMPT line ~115 is now stale.** It tells Claude to use "the gate-importance context provided
   alongside" a lesson from a different signal type. The new block provides neither cross-setup lessons nor that
   context, so the sentence is inert but misleading. The spec forbids editing system-prompt text, so it was left;
   needs its own change.
3. **Verbatim lessons carry content the module is not allowed to generate.** Real output included `$11.16`,
   "strong sector tailwinds", and a lesson citing a "17% win rate" from the old pattern_library. That last one can
   re-inject old, non-validated statistics. Options: sanitize/skip such lessons, or keep as is and accept it.

### LOW (optional)
- The wiring in `claude-agent.ts` (call site, queue field, two persist sites) has no automated test; it is
  verified by `tsc` and the diff only, as the spec allowed.
- Now unused in production but kept per spec: `getRelevantPatterns`, `matchesConditions`, and `gate-importance.ts`
  (only referenced by a comment). Retire with `pattern_library` later.
- The `signalType === null` guard is unreachable today (the earlier setup gate already skips such candidates); it
  exists for type narrowing and logs a warning if ever hit.
- `bySellDesc` returns NaN if a `sellTimestamp` is empty, which makes ordering unstable. `getTradeEvaluations`
  yields `''` for a null timestamp; unlikely for closed trades.
- `pattern-stats.ts` still compares timestamps as strings in its rule-version / frozen-date splits (pre-existing,
  out of scope); the track-record `n` for rule versions inherits that imprecision.
- The three ESLint warnings in `claude-agent.ts` (`checkOvertradingLimit`, `wouldPassWithoutZ`, `wouldExecute`)
  are pre-existing, not from this change.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.

Recommendation: because this changes the prompt used for live BUY decisions and the persist path was never
executed, watch the first live cycle after deploy (check that a new `open_position_contexts` row carries
`indicators.learningContext` and a non-empty `pattern_ids`) and decide on MEDIUM-1 to MEDIUM-3 afterwards.
