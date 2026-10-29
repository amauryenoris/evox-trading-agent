# Review Report — Earnings Calendar Follow-up (snapshot wiring + migration file)

**Date**: 2026-10-29
**Reviewer**: Claude (automated)
**Status**: APPROVED

Verification: `tsc --noEmit` clean; full Vitest 958/958; `npm run build` green. Changes are uncommitted in the working tree. No live cycle, no order, no migration applied.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01–03 | Pass the gate's own result to `buildLearningContext`, no re-evaluation | ✅ | `earnings: earningsFlag` at `claude-agent.ts:2256` call; `earningsFlag` is the value the gate computed just above. |
| FR-04–05 | Optional type property, forwarded unchanged | ✅ | `learning.ts` input type; `buildLearningContext` already spreads the input. |
| FR-06–08 | Persist the object with the six fields, `source` = `nasdaq` | ✅ | Test asserts the exact object. |
| FR-09–10 | UNKNOWN / STALE persist with null fields | ✅ | Tests for empty cache, failed read and stale cache. |
| FR-11–12 | Prompt line only for OK within 5 trading days | ✅ | Tests for 3 days (line), more than 5 days (no line), UNKNOWN and STALE (no line). |
| FR-13 | No field and no line without an earnings input | ✅ | Test checks the key list and the text. |
| FR-14 | Never throws | ✅ | Gate context catches loader errors; the new tests run the unavailable paths. |
| FR-15 | Both BUY paths carry it | ✅ | Both save the snapshot returned by this call (`:2498`, `:2688`); no edit needed. |
| FR-16–17 | Version stays 3; old snapshots readable | ✅ | No version change; `learning-context.test.ts` still passes. |
| FR-18–21 | Wiring tests for snapshot, OK, UNKNOWN, STALE | ✅ | `learning-earnings-wiring.test.ts`, 6 tests built from `evaluateEarningsGate`. |
| FR-22 | Unchanged text and keys without `earnings` | ⚠️ PARTIAL | The new test checks no line and no `earnings` key; exact equality with pre-change output rests on the unchanged golden tests in `learning-context.test.ts`, which pass. |
| FR-23–25 | Migration file replaced, not applied, RLS-no-policy noted | ✅ | Matches the DDL supplied; header says it is already applied. |
| FR-26–28 | Code uses only the four columns and their types | ✅ | `db-earnings.ts` and the sync script write/read `symbol`, `report_date`, `session`, `fetched_at` as text, `YYYY-MM-DD`, `BMO|AMC|UNKNOWN`, ISO-8601. |
| FR-29 | Confirmation reported | ✅ | In the implementation report. |
| FR-30–32 | Task file: migration line unticked and annotated; T-17 ticked | ✅ | Annotated "applied by the owner 2026-10-29". |
| NFR-01–04 | No extra DB/Alpaca/Claude call; no `any`; no network; checks green | ✅ | |
| C-01–03 | Only the two authorized changes | ✅ | See audit. |
| C-04–06 | No gate, exit, sizing, stop or order change; no migration; no dependency | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Authorized: one line, `earnings: earningsFlag,` at the call. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | MODIFIED | Authorized: `earnings?: EarningsFlag` plus the type-only import (O-1 default). `git diff` shows exactly 3 added lines across both files. |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Prompt text is the only addition, and it is the already-approved information line; the action override, schema and footer are unchanged. |
| Supabase patterns | ✅ | No new queries; the migration file keeps RLS on with no policy. |
| TypeScript quality | ✅ | No `any`; type-only import; no mutation. |
| Security | ✅ | No secrets; the file is DDL only. |

## Task Checklist

- Completed: 10/10 implementation tasks. Post-implementation items (this review, the report, the live-day note) remain by design.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** The call-site mapping in `claude-agent.ts` has no unit test; it is covered only by the type check and by the first-live-day check (a BUY of a symbol with a report within 5 trading days carries `earnings` in its snapshot). Stated in the design; no test is feasible without a full cycle.

### LOW (optional)
- **L-1** FR-22 is proven indirectly (see PARTIAL above).
- **L-2** The Rejected-today, report and gate items from the first review (L-1 to L-4 there) are unchanged and still open.
- **L-3** The earlier review's M-3 (anon policy in the draft DDL) is closed: the applied DDL has no policy.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. The first live BUY with a nearby report is the first real check of the snapshot field.
