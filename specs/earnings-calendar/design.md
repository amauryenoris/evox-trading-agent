# Design — Earnings Calendar: Daily Cache + Pre-Claude Entry Gate (EARNINGS_BLOCK) + Snapshot Flag

## Architecture Decision

A daily GitHub workflow copies the Nasdaq earnings calendar (next 60 days) into a small Supabase cache table. During a cycle, a symbol that has detected a setup is checked against that cache by a pure function in `src/lib/earnings-window.ts`. If its report falls on the entry date or the next trading day, the cycle records a HOLD prefixed `EARNINGS_BLOCK` and skips the symbol before any Claude call. Otherwise the result (OK, UNKNOWN or STALE) travels into the BUY learning snapshot and, when a report is within 5 trading days, into one line of the BUY prompt block. Missing data never blocks.

Files: `src/lib/earnings-window.ts` (pure), `src/lib/db.ts` (helpers), `scripts/earnings-calendar-sync.ts`, `.github/workflows/earnings-calendar-sync.yml`, one gate in `claude-agent.ts`, `learning-context.ts` (line and snapshot field), dashboard and report files.

## Data Flow

Sync (06:17 America/New_York in EST, 07:17 in EDT; cron `17 11 * * 1-5`):
1. Build the weekday list from today to today + 60 calendar days.
2. Fetch `https://api.nasdaq.com/api/calendar/earnings?date=YYYY-MM-DD` per day at ≤ 4 req/s; one retry per failed day.
3. Map each row to `{ symbol, report_date, session }`; dedupe on `(symbol, report_date)`.
4. Upsert; delete rows of successful days not refreshed in this run (rescheduled reports); delete rows older than 14 days.
5. Exit non-zero if more than 5% of days failed.

Cycle:
1. A setup is detected for a symbol (after the existing `!setup_detected` block and the near-miss detection).
2. Once per cycle (memoized): read the newest `fetched_at`; fetch the next 1 to 5 trading days via `getNextTradingDay`.
3. Read the symbol's earliest cached report on or after the entry date.
4. `evaluateEarningsGate(...)` returns `{ status, nextReportDate, session, tradingDaysAway, blocked }`.
5. Blocked: push HOLD (`error` = `EARNINGS_BLOCK: ...`), log `[SETUP-GATE]`, `continue`.
6. Not blocked: pass the result into the learning context; it lands in the snapshot and the optional prompt line.

## Key Design Details

- **Entry date**: the America/New_York date of the cycle timestamp. Cycles run 14:00 to 20:00 UTC, so the UTC date and the ET date agree; the module uses ET anyway.
- **Staleness**: the cache has no row for symbols without a report, so freshness is the table-wide newest `fetched_at`. The rule in the brief ("older than 2 days") would mark every Monday stale, because the Friday sync is about 3 calendar days old. The spec uses "older than 2 trading days before the entry date" (Friday sync, Monday cycle = 1 trading day, fresh). Trading days are counted from the same upcoming-days list or by weekdays when it is unavailable. See O-2.
- **`getNextTradingDay` fallback**: on a calendar error it returns +1 calendar day, which on a Friday is Saturday, so a Monday report would not be blocked. The pure module treats a weekend `nextTradingDay` as unusable and then falls back to the weekday rule (Friday to Monday). A holiday plus a calendar failure can still miss; accepted, because the failure also logs `[CALENDAR_FALLBACK]` [P].
- **`tradingDaysAway`**: counted from a list of the next 5 trading dates. The cycle builds it with `getNextTradingDay(now, k)` for k = 1 to 5, once per cycle, in parallel.
- **Gate position**: after `detectNearMisses` and before `signalType === null`/`buildLearningContext`, so near-miss tracking is unchanged and no learning DB read or Claude call happens for a blocked symbol. This differs from the 3DAY gate, which runs before the `!setup_detected` check; only the HOLD record shape is copied.
- **Gate-block frequency**: the cycle runs hourly, so one blocked symbol writes up to 7 HOLD rows a day, as the other gates do. The Rejected-today query has `limit(100)`; a long blocked list could crowd it [P].
- **Nasdaq payload** (observed in STEP 0): rows under `data.rows[]` with `symbol` and `time` (`time-pre-market`, `time-after-hours`, `time-not-supplied`) [P for exact field names; the implementer saves one real payload to `.tmp/` and builds the test fixture from it].
- **Regression with N = 0**: gate outcomes are identical to today. The prompt text can still gain the Earnings line (information only), so the regression test compares gate decisions, not prompt text.
- **Snapshot**: default is no version bump. `earnings` is an optional field on version 3, so readers of 2 and 3 need no change. If the owner prefers version 4, `StoredLearningSnapshot` and `buildPatternIds` accept 2, 3 and 4.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Gate before Claude, cache in Supabase | No API cost; offline-safe; testable | Needs a table and a daily job | Chosen |
| Fetch Nasdaq live inside the cycle | No table | Unofficial endpoint on the order path; latency; rate limits | Rejected |
| Gate after Claude, with the execution gates | Claude sees the flag | Wastes a Claude call per blocked symbol | Rejected |
| Fail closed on unknown date | Safer on gaps | One outage stops all entries; coverage is partial (ETFs have no report) | Rejected (owner decision) |
| Bump snapshot to version 4 | Explicit schema | Touches readers and `buildPatternIds` for no gain | Not default (O-4) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/earnings-window.ts` | CREATE | Pure window, gate and reason functions |
| `src/lib/db.ts` | MODIFY | Four helpers (next report, upsert, freshness, prune) |
| `scripts/earnings-calendar-sync.ts` | CREATE | Daily sync |
| `package.json` | MODIFY | Script entry `earnings-calendar-sync` |
| `.github/workflows/earnings-calendar-sync.yml` | CREATE | Daily workflow |
| `specs/earnings-calendar/migration.sql` | CREATE | Table DDL (not applied) |
| `src/lib/claude-agent.ts` | MODIFY ⚠️ | One gate; one extra line, see O-3 |
| `src/lib/learning-context.ts` | MODIFY | Earnings line, optional snapshot field |
| `src/lib/learning.ts` | MODIFY ⚠️ (not authorized) | Optional `earnings` on `LearningContextInput`, see O-3 |
| `src/app/api/rejected-today/route.ts` | MODIFY | Filter, kind union, reason text |
| `src/components/dashboard/RejectedSetups.tsx` | MODIFY | Kind union, short labels |
| `src/lib/report-generator.ts` | MODIFY | Branch before the generic "gate" branch; own bucket |
| `src/lib/__tests__/` and `scripts/` | CREATE | Tests listed in tasks.md |

## Protected Zone Impact

⚠️ Requires Amaury confirmation before implementation.

- `claude-agent.ts` (authorized): the one gate.
- `claude-agent.ts` (needs confirmation, O-3): the `buildLearningContext` call at about line 2238 must receive the gate result. That is one added property on an existing call, outside the gate block. Without it the snapshot and prompt line cannot carry the earnings data.
- `learning.ts` (not authorized, O-3): `LearningContextInput` needs one optional property `earnings`. `buildLearningContext` already spreads the input into `buildSetupLearningBlock`, so no logic changes.
- Not touched: `config.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, exits, sizing, stops, order paths.
- The snapshot is saved at `claude-agent.ts:2479` and `:2669` from the object the learning module returns, so those lines need no edit.

## Database Changes

New table `earnings_calendar` (see `specs/earnings-calendar/migration.sql`): primary key `(symbol, report_date)`, `session` check, index on `report_date`, RLS on, SELECT policy for `anon` and `authenticated`, grants as listed. No existing table changes. Not applied by the agent.

## Open Questions

- **O-1** BMO report on the entry date, after the open: blocked or not? Default: **blocked** (as the brief says), because the label is often missing and a consistent rule is simpler.
- **O-2** Staleness rule. Default: stale when the newest `fetched_at` is more than **2 trading days** before the entry date, not 2 calendar days (which would make every Monday stale).
- **O-3** Two edits outside the authorized gate: the one-property addition at the `buildLearningContext` call in `claude-agent.ts`, and the optional type property in `learning.ts`. Default: **ask for confirmation**; if refused, the earnings flag and prompt line are dropped and only the gate and its HOLD record ship.
- **O-4** Snapshot version. Default: **no bump**, optional field on version 3.
- **O-5** RLS. Your brief asks for an anon SELECT policy "matching the other tables", but the existing tables (see `specs/enable-rls-flagged-tables`) have RLS on and no policy, and that spec rejected a SELECT policy as speculative. Default: follow the brief literally (policy and grants in `migration.sql`); recommendation: drop the anon grant and policy, since nothing reads this table from a browser.
- **O-6** Gate for watchlist auto-entries. Default: **gated** like all others.
- **O-7** Nasdaq may block a non-browser User-Agent or change its payload [U]. Default: the sync turns red above 5% failed days and the gate fails open; no fallback source in this change.
