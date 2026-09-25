# Review Report — Central ACTIVE_SETUPS List, Fix Setup-Name Drift

**Date**: 2026-09-25
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Single exported `ACTIVE_SETUPS` list in new `src/lib/setups.ts` | ✅ SATISFIED | `setups.ts:9-35`, 5 entries |
| FR-02 | Each entry has `name`, `criteria`, `active` | ✅ SATISFIED | Matches `SetupDefinition` interface (`setups.ts:3-7`) |
| FR-03 | `active: true` for all 5 entries | ✅ SATISFIED | All 5 literal `true` |
| FR-04 | Exported `SetupName` type derived via `(typeof ACTIVE_SETUPS)[number]['name']` | ✅ SATISFIED | `setups.ts:37`, matches `DashboardTabs.tsx:14` pattern |
| FR-05 | `SignalType` (`types.ts:139`) restricted to the 5 live names, derived from `SetupName` | ✅ SATISFIED | `types.ts:139`: `export type SignalType = SetupName`; `AgentDecision.signal_type` field itself untouched |
| FR-06 | `system-status/route.ts:31-32` updated to real trend-setup names | ✅ SATISFIED | Now checks `'TREND_PULLBACK' \| 'TREND_ZLE05' \| 'TREND_PULLBACK_3DAY'` |
| FR-07 | `'TREND'` in `OpenPositionContext.signalType`/`TradeEvaluation.signal_type` documented as legacy-compat, not removed | ✅ SATISFIED | Comment added at `types.ts:197` and `types.ts:215`; both value sets unchanged (verified via diff — 0 lines removed from either union) |
| FR-08 | `TREND_PULLBACK_3DAY` added to `DIMENSION_IMPORTANCE`, derived from its own entry logic | ✅ SATISFIED | `gate-importance.ts:17`: `{ adx: 'not-gated', macd: 'not-gated', z: 'not-gated', regime: 'not-gated' }` — shape matches no existing row (evidence of independent derivation, not copied) |
| FR-09 | Code comment on new entry: derivation + revisit-at-n>=20-30 note | ✅ SATISFIED | `gate-importance.ts:10-16`, includes "currently n=13" |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|------------|--------|-------|
| NFR-01 | `npx tsc --noEmit` zero errors | ✅ SATISFIED | Verified independently, exit code 0, no output |
| NFR-02 | `npm test` no regressions | ✅ SATISFIED | 48 files / 448 tests passed, verified independently |
| NFR-03 | No change to setup-detection, execution gates, exit rules, position sizing | ✅ SATISFIED | `claude-agent.ts` diff is empty (confirmed via `git diff --stat`) |
| NFR-04 | No change to `compareFingerprints()` output for any setup other than `TREND_PULLBACK_3DAY` | ✅ SATISFIED | `learning.ts` diff is empty; existing 4 `DIMENSION_IMPORTANCE` rows byte-identical to "before" snapshot in `design.md` |

## Constraints

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | No Protected Zone touch without confirmation | ✅ SATISFIED | `config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts` all 0-diff |
| C-02 | No on/off logic based on `active` | ✅ SATISFIED | `active` field is written but never read/branched on anywhere in the diff |
| C-03 | `stock-selector.ts` / Buy Scanner prompt untouched | ✅ SATISFIED | 0-diff |
| C-04 | `ACTIVATION_PCT`/`ATR_MULT` untouched | ✅ SATISFIED | Inside `claude-agent.ts`, which is 0-diff |
| C-05 | `NearMissEntry.signal_type` untouched | ✅ SATISFIED | Inside `types.ts`; diff shows only the 3 documented hunks (import, `SignalType`, two comments) — `NearMissEntry` section not among them |
| C-06 | `TREND_PULLBACK_3DAY` weights not copied from another setup | ✅ SATISFIED | Row shape `{not-gated×4}` is unique in the table |
| C-07 | `risk-manager.ts`/`indicators.ts` untouched | ✅ SATISFIED | 0-diff |
| C-08 | `learning.ts` untouched | ✅ SATISFIED | 0-diff |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | UNTOUCHED | — |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |

No Protected Zone file modified. No unauthorized change to flag.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | `claude-agent.ts` untouched; Claude's schema, action-override, and prompt logic unaffected |
| Supabase patterns | ➖ N/A | No DB query added or modified; `db.ts` untouched (correctly — `OpenPositionContext`/`TradeEvaluation` value sets didn't change, so `db.ts`'s existing casts remain valid) |
| TypeScript quality | ✅ SATISFIED | No `any` in new code; `setups.ts` is 37 lines (well under 800); no mutation; `SetupDefinition` fields are plain data, no magic numbers |
| Security | ✅ SATISFIED | No secrets, no SQL, no `console.log` added |

## Task Checklist

- Completed: 12/12 implementation tasks (T-01 through T-12), plus all 3 pre-implementation checkboxes
- Post-implementation checkboxes (`/review`, Protected Zone re-confirm) are this report's own job — left unchecked in `tasks.md` pending Amaury's final sign-off

## Findings

### CRITICAL (blocks merge)
None.

### HIGH (should fix)
None.

### MEDIUM (consider fixing)
None.

### LOW (optional)
- `setups.ts:9-35` uses `as const satisfies SetupDefinition[]` — a slightly more advanced pattern than the codebase's plain `as const` usage in `DashboardTabs.tsx`/`PnLChart.tsx`. It compiles cleanly and is arguably an improvement (keeps literal narrowing for `SetupName` while still checking shape against `SetupDefinition`), but is worth a quick glance next time someone touches this file since it's a new pattern in this codebase. Not a defect.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.

Independent verification performed by this review (not just trusting the implementation report): `npx tsc --noEmit` (exit 0), `npm test` (48/48 files, 448/448 tests), and a full `git diff`/`git status` read of every changed and every Protected-Zone file. All match the spec exactly — no scope drift, no undocumented changes.
