# Tasks — Earnings Calendar: Daily Cache + Pre-Claude Entry Gate (EARNINGS_BLOCK) + Snapshot Flag

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone confirmed: `claude-agent.ts` gate (given); O-3 extra line in `claude-agent.ts` and optional type in `learning.ts` (pending)
- [x] O-1 to O-7 answered or defaults accepted
- [ ] `migration.sql` reviewed and applied by the owner's tool (before the first live run) — applied by the owner 2026-10-29

## Implementation Checklist

### Phase 1 — Pure module (tests first)
- [x] T-01: `src/lib/__tests__/earnings-window.test.ts` (RED): entry date; next trading day; day after (not blocked); Friday to Monday; holiday gap; N = 0 never blocks; BMO, AMC and UNKNOWN all block in the window; report in the past; missing, invalid and weekend inputs return UNKNOWN and never throw; reason texts for the three sessions; trading-days-away count.
- [x] T-02: Create `src/lib/earnings-window.ts` (GREEN): `EARNINGS_BLOCK_TRADING_DAYS`, `EARNINGS_BLOCK` prefix, `isEarningsBlocked`, `countTradingDaysAway`, `buildEarningsBlockReason`.
- [x] T-03: Tests for `evaluateEarningsGate` (blocked; not blocked; UNKNOWN for empty cache or failed read; STALE for old freshness; Monday with Friday sync is fresh; N = 0 records but does not block).
- [x] T-04: Add `evaluateEarningsGate` to the module.

### Phase 2 — Data layer
- [x] T-05: Confirm `specs/earnings-calendar/migration.sql` (already drafted); do not apply.
- [x] T-06: Tests with the Supabase mock pattern (`vi.hoisted`) for the four `db.ts` helpers: query shape, null result, throw on error.
- [x] T-07: Add the helpers to `db.ts` (no `any`).
- [x] T-08: Save one real Nasdaq payload to `.tmp/` (read-only fetch) and build the test fixture from it.

### Phase 3 — Sync script and workflow
- [x] T-09: `scripts/earnings-calendar-sync.test.ts` (RED), mocked fetch and Supabase: payload parsing and time labels; unknown label; empty day; duplicate symbol; a failing day retried once; more than 5% failed gives a non-zero result; upsert shape; stale-row deletion only for successful days; prune of rows older than 14 days; dry run writes nothing; rate limiter spacing.
- [x] T-10: `scripts/earnings-calendar-sync.ts` (GREEN) in the style of `daily-bars-sync.ts`, with an `npm run earnings-calendar-sync` entry.
- [x] T-11: `.github/workflows/earnings-calendar-sync.yml`: cron `17 11 * * 1-5`, `workflow_dispatch`, `ubuntu-24.04`, timeout, Supabase secrets, `RUN_EARNINGS_CALENDAR_SYNC: "true"`, own concurrency group.

### Phase 4 — Gate (⚠️ Protected Zone, after confirmation)
- [x] T-12: Tests for the gate wiring through the extracted function: the HOLD record shape (`error` prefix, `orderExecuted` false, quantity 0, confidence 0, full indicators).
- [x] T-13: `claude-agent.ts`: one gate after the near-miss detection, calling `evaluateEarningsGate`; one `console.warn` per cycle for an unusable cache; `[SETUP-GATE]` log; `continue`.
- [x] T-14: Regression test: with `EARNINGS_BLOCK_TRADING_DAYS` = 0, gate decisions equal those of a cycle without the gate for the same inputs.

### Phase 5 — Snapshot and prompt (⚠️ O-3)
- [x] T-15: Tests in `learning-context.test.ts`: `earnings` present in the snapshot; version 2 and 3 snapshots still readable; `buildPatternIds` unchanged; the line appears only for status OK within 5 trading days; absent for UNKNOWN, STALE and 6+ days; the footer is unchanged; the line survives the size-trimming loop.
- [x] T-16: `learning-context.ts`: optional input, line in the head, optional snapshot field.
- [x] T-17: `learning.ts` type property and the `claude-agent.ts` call-site property (only if O-3 is approved).

### Phase 6 — Dashboard and reports
- [x] T-18: Tests: Rejected-today route (filter contains both new prefixes; kind and reason for each), report-generator classification (new bucket, placed before the generic "gate" branch; `MR_RANGING_ADX_GATE` unchanged).
- [x] T-19: Edit `route.ts`, `RejectedSetups.tsx`, `report-generator.ts`.

### Phase 7 — Verification
- [x] T-20: `npx tsc --noEmit` clean.
- [x] T-21: Full `npx vitest run` green, with no network.
- [x] T-22: Coverage ≥ 80% on `earnings-window.ts`, the new `db.ts` helpers and the sync script.
- [x] T-23: `npm run build` green.

## Post-Implementation

- [ ] Run `/review earnings-calendar` to verify the implementation matches the spec
- [ ] Confirm Protected Zone diff: `claude-agent.ts` gate only (plus the O-3 line if approved); `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts` unchanged
- [ ] State in the report that no live cycle was run and that the first live day is the first real execution of the gate

## First-Live-Day Checklist (for the owner)

- [ ] The migration is applied and the new workflow ran green; `earnings_calendar` has rows for the next 60 days
- [ ] HOLDs with the `EARNINGS_BLOCK` prefix appear in `agent_log` and in Rejected-today
- [ ] No BUY has a report on its entry date or the next trading day
- [ ] The BUY snapshot carries the `earnings` field
- [ ] Symbols without a report behave as before (no new HOLD, no prompt line)
- [ ] No `[CALENDAR_FALLBACK]` or stale-cache warning on the first Monday

## Estimated Complexity

Medium. Many small parts (table, sync, workflow, gate, snapshot, dashboard), but each is simple and mostly pure. The risk sits in the two Protected Zone touchpoints and in the unofficial Nasdaq source, which the fail-open design contains.
