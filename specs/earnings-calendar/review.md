# Review Report — Earnings Calendar (EARNINGS_BLOCK gate)

**Date**: 2026-10-29
**Reviewer**: Claude (automated)
**Status**: APPROVED WITH WARNINGS

Verification run: `tsc --noEmit` clean; full Vitest 952/952 passing (no network); `npm run build` green; coverage 93% lines over the new modules (sync script 83%, others 94–100%). No live cycle was run and the migration was not applied.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01–02 | Constant = 1; 0 never blocks | ✅ | `isEarningsBlocked` takes `blockDays`; tested with 0. |
| FR-03–09 | Entry day and next trading day block; later, earlier, Friday→Monday, holiday | ✅ | `earnings-window.test.ts`. |
| FR-10 | Entry date = ET date | ✅ | `toEasternDate` used in the context loader. |
| FR-11 | Pure, no I/O | ✅ | No network, DB or clock calls in the module. |
| FR-12–16 | Missing/invalid/weekend input → UNKNOWN, never throws | ✅ | Table-driven test. |
| FR-17–20 | Prefix constant and three reason texts | ✅ | |
| FR-21 | Trading days from an upcoming-days list | ✅ | `countTradingDaysAway`. |
| FR-22–27 | Table, PK, session check, default, index, RLS | ✅ | `migration.sql` (draft, not applied). |
| FR-28 | Deliver DDL, do not apply | ✅ | |
| FR-29–33 | DB helpers, throw on error | ✅ | `db-earnings.ts`, re-exported from `db.ts`. |
| FR-34–44 | Sync window, rate, UA, mapping, dedupe, empty day, retry, failure log | ✅ | 250 ms sleep before every request ⇒ ≤ 4 req/s. |
| FR-45 | Non-zero exit above 5% failed days | ✅ | `exceedsFailureThreshold` + `process.exit(1)` (main not unit-tested). |
| FR-46–49 | Upsert, delete unrefreshed rows of successful days only, prune 14 days | ✅ | |
| FR-50–51 | Dry run default, no secrets | ✅ | |
| FR-52–58 | Workflow runner, cron, dispatch, timeout, secrets, own concurrency group | ✅ | `17 11 * * 1-5`; not in `trading-positions`. |
| FR-59–66 | Gate after setup detection, before learning context and Claude; HOLD shape; log; skip | ✅ | 18 added lines in `claude-agent.ts`. |
| FR-67–72 | Fail open on no row / stale / read failure; one warn per cycle; UNKNOWN/STALE; auto-entries gated | ✅ | See M-1 and L-2. |
| FR-73 | Exits, sizing, stops, orders unchanged | ✅ | Diff shows additions only. |
| FR-74–77 | `earnings` object in the persisted BUY snapshot, status values, nulls | ⚠️ PARTIAL | Field and type exist in `learning-context.ts` and are tested, but nothing passes the gate result in (T-17 pending, H-1). |
| FR-78 | Older snapshots readable | ✅ | No version bump; field optional. |
| FR-79 | `buildPatternIds` accepts 2 and 3 | ✅ | Tested. |
| FR-80–83 | Prompt line only for OK within 5 trading days | ⚠️ PARTIAL | Logic and tests pass; inert until T-17. |
| FR-84–86 | Line not trimmed; footer unchanged; informs only | ✅ | Line is in `head`, outside the trimming loop. |
| FR-87–90 | Rejected-today filter, kinds, reason, labels | ✅ | Via `rejected-classification.ts`. |
| FR-91–92 | Report branch before generic "gate", own bucket | ✅ | |
| NFR-01–02 | No Claude/order calls; bounded reads | ✅ | |
| NFR-03 | Sync within timeout | ➖ | About 45 days × 0.25 s plus latency; confirm on the first run. |
| NFR-04 | ≥ 80% coverage | ✅ | |
| NFR-05–07 | No `any`, no secrets, no network in tests, size limits | ✅ | Largest new file ~170 lines. |
| C-01–05 | Protected Zone, migration, no live cycle, no dependency | ✅ | |
| C-06–07 | Fail open; N = 0 regression | ✅ | Regression test covers gate decisions. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | MODIFIED | Authorized: one gate (2 imports, 1 per-cycle context, 1 gate block). Additions only. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | O-3 edit not made (awaiting confirmation). |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | Gate runs before Claude; no change to Claude's prompt text, schema or action override. |
| Supabase patterns | ✅ | No `any`; throw on error; selects have `.limit(1)`; deletes are filtered; no `'use client'` import of `db.ts`; RLS enabled in the draft DDL. |
| TypeScript quality | ✅ | Immutable returns, named constants, short functions. |
| Security | ✅ | No secrets; Supabase client only; logs contain symbols and dates. |

## Task Checklist

- Completed: 22/23 implementation tasks (T-17 open). Post-implementation items remain for the owner.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- **H-1** T-17 is open, so the `earnings` snapshot field and the prompt line (FR-74–77, FR-80–83) never reach a real BUY. The gate itself works without it. It needs a one-property type addition in `learning.ts` and one property at the `buildLearningContext` call in `claude-agent.ts`, both pending Amaury's confirmation (O-3).

### MEDIUM (consider fixing)
- **M-1** Staleness counts weekdays, not market trading days, so a holiday can make the cache look stale one day early. It fails open and logs a warning, so the impact is a missed block, not a wrong one.
- **M-2** `tasks.md` has the pre-implementation line "`migration.sql` reviewed and applied" ticked. The migration has not been applied; the table must exist before the first sync and the first gate read. Until then every read fails open.
- **M-3** Open decision O-5: `migration.sql` follows the brief (anon SELECT policy and grant), which differs from the deny-all pattern of the other tables.

### LOW (optional)
- **L-1** The report-generator and route classification tests partly replicate branch order instead of exercising the real loop, as the existing tests do. The shared helpers are tested directly.
- **L-2** A calendar failure writes its own warning in addition to the single stale/unknown warning, so a cycle can log two earnings warnings.
- **L-3** `main()` of the sync script (exit code, argument wiring) has no unit test.
- **L-4** `TREND_3DAY_ABOVE_SMA5` holds still land in "Other" in the weekly report; the spec only asked for the Rejected-today part.

---

## Decision

**APPROVED WITH WARNINGS** — no CRITICAL findings. H-1 is an unconfirmed scope item, not a defect. Before the first live day: apply the migration, run the workflow once manually and check that `earnings_calendar` has rows, then decide on O-3. The first live day is the first real execution of the gate.
