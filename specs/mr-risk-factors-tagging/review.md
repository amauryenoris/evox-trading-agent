# Review Report — Add mrRiskFactors Persisted Observability Tagging

**Date**: 2026-09-23
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Add `mrRiskFactors?: string[] \| null` to `TechnicalIndicators`, no other field changed | ✅ SATISFIED | `types.ts:128` — single line added at the end of the optional-fields group; diff shows no other change to the interface. |
| FR-02 | `mrRiskFactors = null` when `meanReversionSignal` is false | ✅ SATISFIED | `claude-agent.ts:1703` — `!meanReversionSignal ? null : [...]`. |
| FR-03 | `'LOW_ADX'` tag independently on `hasValidAdx && adxValue < mrRangingAdxFloor` | ✅ SATISFIED | Reuses `hasValidAdx` and `mrRangingAdxFloor` verbatim, no new literal. |
| FR-04 | `'RANGING'` tag independently on `indicators.marketRegime === 'RANGING'` | ✅ SATISFIED | Direct field read, matches spec exactly. |
| FR-05 | `'DEEP_EXTENSION'` tag independently on `distanceToEma50Pct < -15` | ✅ SATISFIED | Matches spec exactly, including the `!== null` guard. |
| FR-06 | Persist at `indicatorsWithLearning` happy-path construction | ✅ SATISFIED | `claude-agent.ts:2298` — conditional spread added, matching the existing pattern for `learning_note`/`near_miss_score`/etc. |
| FR-07 | Persist at the MR_RANGING_ADX_GATE-blocked push | ✅ SATISFIED | `claude-agent.ts:1953` — `indicators,` replaced with `indicators: { ...indicators, ...(mrRiskFactors !== null && { mrRiskFactors }) },`. |
| FR-08 | `null`/omitted when `meanReversionSignal` was false | ✅ SATISFIED | The conditional-spread pattern `...(mrRiskFactors !== null && { mrRiskFactors })` spreads nothing (not even `mrRiskFactors: null`) when the value is `null` — field is omitted, which satisfies the "or omit" clause of FR-08. |
| FR-09 | Empty array `[]` (not `null`) when signal true but 0 tags fire | ✅ SATISFIED | `.filter(Boolean)` on an all-`null` input array correctly yields `[]`, and `[] !== null` so the conditional spread includes `mrRiskFactors: []`. Confirmed by test "signal=true, zero factors firing — returns empty array, not null". |
| FR-10 | Reuse `mrRangingAdxFloor`, no new magic number | ✅ SATISFIED | No new numeric literal `18` introduced in `claude-agent.ts`. |
| FR-11 | Reuse `hasValidAdx`, no duplicated null-check | ✅ SATISFIED | Same `hasValidAdx` const from line ~1689, not recomputed. |
| FR-12 | `emaReclaimRiskFactors` and its threshold/console.log untouched | ✅ SATISFIED | Absent from the diff entirely; independently grepped — no matches in the diff. |
| FR-13 | `meanReversionSetup`/`mrRangingAdxGateOk`/decision logic untouched | ✅ SATISFIED | Both appear only as unmodified context lines in the diff; `decision.action = 'HOLD'` override (line 2044) untouched and far from any touched line. |
| FR-14 | `MR_BLOCKED_RANGING_ADX` console.log untouched | ✅ SATISFIED | Absent from the diff. |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | `npx tsc --noEmit` zero new errors | ✅ SATISFIED | Re-run independently — clean. |
| NFR-02 | Confined to `types.ts` + `claude-agent.ts`, no migration | ✅ SATISFIED | `git status` shows only those two source files modified (plus the new test file and spec docs). No SQL/migration files touched. |
| NFR-03 | No new unsafe cast needed for `mrRiskFactors` | ✅ SATISFIED | The two pre-existing `as unknown as TechnicalIndicators` casts (max_positions/max_buys) were already present before this change, for the `would_execute`/`errors` ad-hoc fields — `mrRiskFactors` itself, now a genuine typed field, required no new cast anywhere it was attached, including inside those two literals. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | Confirmed via `git diff --stat` — no output. |
| src/lib/claude-agent.ts | **MODIFIED** | Listed in `design.md`'s Impact table; explicit, fresh, in-conversation confirmation from Amaury was obtained before implementation (per the `/implement` transcript's `AskUserQuestion` exchange), not inferred from the pre-checked spec checkbox. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`src/lib/types.ts` was also modified — correctly not gated, since it's listed as "Touch freely" in `CLAUDE.md`'s File Permission Matrix.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `decision.action = 'HOLD'` override (line 2044) and all per-branch overrides are untouched, confirmed via independent grep. This diff never reads or writes `decision.action`/`decision.reasoning`/Claude's response schema — it is confined to `indicators`-shaped observability data. |
| Supabase patterns | ➖ N/A | No new query added; `db.ts` untouched; `mrRiskFactors` rides through the existing `insertAgentLogEntry(entry)` call unchanged. |
| TypeScript quality | ✅ | No `any` introduced. The `mrRiskFactors` computation and every attachment site use immutable spread (`{ ...indicators, ... }`), never mutating the cached `indicators` object from `indicatorsCache` — consistent with the design's explicit rejection of an in-place-mutation alternative. The added logic is ~8 lines, well under the 50-line function limit (it's a `const` inside an already-existing function, not a new function). No new magic numbers. |
| Security | ✅ | No secrets, no new injection surface, no sensitive data in the new `console.log`-free code (the one new comment is not a log statement). |

## Task Checklist

- Completed: 26/27 relevant tasks — the one remaining `[ ]` is the self-referential "Run /review" line, satisfied by this review.
- **Hygiene issue found**: `tasks.md` Phase 3 (lines 39-40) still contains the *original* conditional `T-09`/`T-10` entries verbatim (`- [ ] T-09 (ONLY if Amaury answered yes...)`), unchecked, sitting alongside a *second*, already-checked `T-09`/`T-10` pair added under Phase 2 (lines 34-35) that documents the same work. This is a duplicate-ID artifact from the implementation step, not a code defect — the actual code changes for max_positions/max_buys are present and correct (confirmed in the diff and by FR verification above), but the task file itself is inconsistent and could mislead a future reader auditing the checklist by ID. See Findings.

## Additional Verification (independently re-run)

- `npx tsc --noEmit`: **0 errors** (re-verified fresh).
- `npx vitest run` (full suite): **448/448 tests passed across 48 files**, no regressions — includes the 11 new tests in `mr-risk-factors-tagging.test.ts`.
- `git diff --stat` across all 6 remaining Protected Zone files: **no output** — confirms all untouched.
- `grep -n "decision.action = 'HOLD'"`: 10 matches, all pre-existing, none touched by this diff.

## Design Fidelity Check

- The multi-site discovery in `design.md` (7 candidate push sites, only some reachable with `meanReversionSignal===true`) is borne out exactly in the shipped diff: the two mandatory sites (T-04, T-05) plus the two Amaury-approved sites (T-09/T-10, max_positions/max_buys) are all present; the two explicitly-declined sites (EMA_RECLAIM_NEAR, TREND_QUALITY_FAIL) are correctly absent — no unauthorized scope creep, no silently-skipped mandatory scope.
- The "no unsafe cast needed" architectural rationale in `design.md`'s Alternatives Considered table holds: `mrRiskFactors` is attached inside the pre-existing `as unknown as TechnicalIndicators` casts at max_positions/max_buys without needing a *new* cast, since it's now a real field on the type being cast to.

---

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional) — fixed during this review
- `specs/mr-risk-factors-tagging/tasks.md` had a stale, unchecked, duplicate pair of `T-09`/`T-10` entries (the original conditional wording from spec-authoring time) sitting alongside the checked, updated pair added under Phase 2. Purely a spec-document hygiene issue — the underlying code change was already correct and verified above. Fixed: the duplicate lines were removed from `tasks.md` as part of this review pass.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings; the one LOW documentation-hygiene finding (task-file duplicate entries, not code) was fixed during this review. All 14 functional requirements and 3 non-functional requirements satisfied, Protected Zone modification was explicit and authorized, analyst purity is intact, and the full test suite (448 tests) passes with no regressions. Ready to commit.
