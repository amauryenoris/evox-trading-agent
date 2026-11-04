# Review Report — Disable the z <= -2 sizing override

**Date**: 2026-11-04
**Reviewer**: Claude (automated)
**Status**: APPROVED

Re-verified at review time: `git status` / `git diff --name-only` (only `position-sizing.ts` and its test, plus the untracked spec folder), the exact source and test diffs, `npx tsc --noEmit` (clean), the full `npx vitest run` (71 files, **973/973**), ESLint on the two touched files (clean), and that the `computeBuyQuantity` call in `claude-agent.ts` (lines 2424-2435) does not pass `zOverrideEnabled`. `npm run build` comes from the implementation run (green); I did not re-run it. Nothing is committed, and no live cycle was run.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Flag defined as `false` in `position-sizing.ts` | ✅ | Line 4: `export const Z_SIZING_OVERRIDE_ENABLED = false`. |
| FR-02 | Export stays in the same module | ✅ | Same file, same name. |
| FR-03 | Override path and `zOverrideEnabled` input kept | ✅ | Source diff touches only lines 3-4; lines 35, 76, 77 intact. |
| FR-04 | No other constant changed | ✅ | Source diff has no other changed line. |
| FR-05 | Flag false, no input: confidence factor applies at z <= -2 | ✅ | Default-flag tests pass without `zOverrideEnabled`. |
| FR-06 | Confidence 0.32 at z -2.13 gives factor 0.5 | ✅ | Test asserts `confidenceFactor` 0.5. |
| FR-07 | Confidence 0.80 at z -2.13 gives factor 0.80 | ✅ | Test asserts 0.8. |
| FR-08 | Adjusted quantity is the rounded product | ✅ | Asserted as `Math.round(baseShares * factor)` for 0.5, 0.8 and the z = -2.0 boundary. |
| FR-09 | `zOverrideApplied` false | ✅ | Asserted in the default tests and the default breakdown. |
| FR-10 | Entries above -2.0 unchanged | ✅ | Existing `switch false` test (above-threshold case) still passes. |
| FR-11 | Capped base quantity unchanged | ✅ | Computed before the flag; `baseShares` 250 asserted in both breakdowns. |
| FR-12 | Explicit `true` keeps the old behaviour | ✅ | New test: quantity equals `baseShares`; golden test with `true`. |
| FR-13 | Golden production test kept | ✅ | 13 entries (8 with z <= -2) now run with `zOverrideEnabled: true`. |
| FR-14 | Differential test kept, override explicit | ✅ | `zOverrideEnabled: true` added to the call; still asserts > 100,000 checked cases. |
| FR-15 | Test that the default is false | ✅ | Constants test. |
| FR-16 | Test for FR-06 without the input | ✅ | |
| FR-17 | Test for FR-07 without the input | ✅ | |
| FR-18 | MP 2026-10-13 breakdown with the default flag | ✅ | Base 250, factor 0.5, adjusted/final 125, `zOverrideApplied` false. |
| FR-19 | Update only flag-dependent expectations | ✅ | Removed lines: the constants test name/assertion, one call line, one `it` title. The old breakdown expectations are preserved under an explicit `true`. |
| FR-20 | Confirm the caller does not pass `zOverrideEnabled` | ✅ | Re-checked: 0 matches in the call block. |
| FR-21 | List mentions of z <= -2 full size | ✅ | Report section 6. |
| FR-22 | No edit to `claude-agent.ts`, prompts, Protected Zone | ✅ | Not in the diff. |
| FR-23 | Report the ranking comparator as separate | ✅ | Report section 6. |
| FR-24 | `tsc --noEmit` | ✅ | Clean. |
| FR-25 | Full Vitest | ✅ | 973/973 (baseline 968 + 5 new). |
| FR-26 | `npm run build` | ✅ | Green in the implementation run. |
| FR-27 | ESLint on touched files | ✅ | Clean. |
| FR-28 | Confirm changed files, no Protected Zone | ✅ | Two files. |
| FR-29 | Report at `.tmp/z-override-off-report.md` | ✅ | Present. |
| FR-30 | Report contents | ✅ | Flag location, reads, diff summary, tests, remaining mentions. |
| FR-31 | Uncommitted | ✅ | |
| NFR-01 | No secret printed | ✅ | |
| NFR-02 | No live calls | ✅ | Only tsc, vitest, build, eslint, git. |
| NFR-03 | No position touched | ✅ | |
| NFR-04 | Unverified claims labelled | ✅ | The INTC/AAPL effect is marked as an estimate. |
| C-01 | No Protected Zone file | ✅ | See below. |
| C-02 | Edit only the two files | ✅ | |
| C-03 | No other constant, rule or threshold | ✅ | |
| C-04 | No commit/push/branch/PR | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | The flag is not in this file. |
| src/lib/claude-agent.ts | UNTOUCHED | Read only (the caller). |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`.env*`, `vercel.json`, `package.json` and the lockfile are also untouched. The request's "one Protected Zone line" authorization was not used.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A, `claude-agent.ts` untouched; sizing stays system-side and Claude's output schema is unchanged. |
| Supabase patterns | ✅ | N/A, no queries touched. |
| TypeScript quality | ✅ | No `any`; the module is pure and stays under 100 lines; the new tests build inputs through the existing `base()` helper and use named values, not new magic numbers. |
| Security | ✅ | No secrets; no new input or I/O. |

## Task Checklist

- Implementation tasks: 15/15 completed (T-01 to T-15), plus the 4 pre-implementation boxes = 19 `[x]`.
- 3 unchecked boxes remain under Post-Implementation (this review, Protected Zone confirmation, "nothing committed"). They close with this review and your commit decision; not implementation gaps.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** This is a live-capital sizing change: z <= -2 entries with confidence <= 0.5 will now be about half of the previous size. The effect on INTC/AAPL-like entries is an estimate from the code, not a measurement, and no live cycle exercised it. Worth watching the `[BUY SIZING]` lines (base, confidence, multiplier, adjusted) on the first cycles after the change reaches `main`.
- **M-2** `SDD.md:88` still describes the override as active ("= baseShares if zScore <= -2.0 (extreme edge override)"). It was left unedited because it is outside the authorized files (design O-2). The sizing flow diagram in the doc is now wrong until someone updates it.

### LOW (optional)
- **L-1** The source diff is 2 lines, not 1: the flag and the line-3 comment (which said "(current behavior)" for `true`). This follows design O-1, accepted by default; mentioned because the request's wording was "one line".
- **L-2** The ranking comparator (`claude-agent.ts:2628-2629`) still ranks z <= -2 candidates first when one slot is free. With the override off, a z <= -2 candidate can still win the last slot but is now sized by confidence. Intentionally out of scope; flagged so the interaction is known.
- **L-3** The golden and differential tests now assert the legacy (override-on) numbers by passing `zOverrideEnabled: true`. They no longer protect the default behaviour; the new default-flag tests do. Acceptable, but if the flag is flipped back later the explicit `true` arguments and the constants test are the places to revisit.
- **L-4** The full-cycle behaviour (`runAgentCycle` end to end) is only covered indirectly: the suite passes, but no test asserts a real BUY quantity at z <= -2 through `claude-agent.ts`.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Consider updating `SDD.md:88` in a follow-up and watching the first `[BUY SIZING]` logs after the change is on `main`.
