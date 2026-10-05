# Tasks — Fix Truncated Macro/Sector Bar Fetch + Staleness Guard

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] **Protected Zone changes confirmed** — `src/lib/claude-agent.ts` is touched. Spec approval alone does not satisfy this; needs Amaury's separate, explicit sign-off before `/implement` proceeds, per `specs/README.md`'s Protected Zone rule.
- [x] Database migrations drafted — N/A, none required (no backfill, no schema change)

## Implementation Checklist

### Phase 1 — Staleness helper (new file)

- [x] T-01: Create `src/lib/macro-bars-staleness.ts`: export `STALE_MACRO_BARS_MAX_DAYS = 5` and `isMacroBarsStale(bars: { t: string }[], referenceDate: Date): boolean` — empty array → `true`; otherwise compare `referenceDate` against the newest bar (`bars[bars.length - 1]`), strictly greater than `STALE_MACRO_BARS_MAX_DAYS` days → stale. No `Date.now()`/`new Date()` call inside the function itself (C-06) — `referenceDate` is always a parameter.

### Phase 2 — Fix the 5 truncated fetches

- [x] T-02: `claude-agent.ts:1194,1198,1202,1206,1210` — add an explicit `400` as the 4th argument to each of the 5 `getBars('SPY'|'GDX'|'XLE'|'XLK'|'VIXY', '1Day', 400)` calls, i.e. `getBars(sym, '1Day', 400, 400)`. No other change to these lines (`.catch()` blocks stay exactly as they are).

### Phase 3 — Wire the staleness guard into `runAgentCycle()`

- [x] T-03: Add a local (not exported) `guardMacroBars(symbol: string, bars: AlpacaBar[]): AlpacaBar[]` next to the `Promise.all` block: if `isMacroBarsStale(bars, new Date())`, log `[STALE_MACRO_BARS] symbol=${symbol} lastBar=${lastBar} ageDays=${ageDays}` (lastBar = newest bar's date, or `'none'` if empty; ageDays = floored integer, or `-1` if empty) and return `[]`; otherwise return `bars` unchanged.
- [x] T-04: Immediately after the `Promise.all` destructure (before `computeSpxSnapshot`/`computeSectorRotation`/`computeVixyChangePct` are called), apply `guardMacroBars` once per symbol: `safeSpyBars`, `safeGdxBars`, `safeXleBars`, `safeXlkBars`, `safeVixyBars`.
- [x] T-05: Update `computeSpxSnapshot(spyBars)` → `computeSpxSnapshot(safeSpyBars)`; `computeSectorRotation(gdxBars, xleBars, xlkBars, spyBars)` → `computeSectorRotation(safeGdxBars, safeXleBars, safeXlkBars, safeSpyBars)`; `computeVixyChangePct(vixyBars)` → `computeVixyChangePct(safeVixyBars)`. Confirm no other reference to the raw (unguarded) `spyBars`/`gdxBars`/`xleBars`/`xlkBars`/`vixyBars` variables remains anywhere later in `runAgentCycle()`.

### Phase 4 — Tests

- [x] T-06: Create `src/lib/__tests__/macro-bars-staleness.test.ts`, inline-replica convention (replicate `isMacroBarsStale`/`STALE_MACRO_BARS_MAX_DAYS` inline rather than importing, per explicit instruction — see design.md's Alternatives Considered for why a direct import would also have worked).
- [x] T-07: Test — a bars array whose newest bar is "today" (age 0 days) is not stale.
- [x] T-08: Test — a bars array whose newest bar is well beyond `STALE_MACRO_BARS_MAX_DAYS` old (e.g. ~35 days, matching the live-observed bug) is stale.
- [x] T-09: Test — an empty bars array is stale.
- [x] T-10: Test — a bars array whose newest bar is exactly 3 days old is not stale (simulated weekend gap).
- [x] T-11: Test — a bars array whose newest bar is exactly 4 days old is not stale (simulated weekend + 1 holiday gap).
- [x] T-12: Test — a bars array whose newest bar is exactly at the `STALE_MACRO_BARS_MAX_DAYS` boundary (5.0 days) is not stale (strictly-greater-than semantics); one day beyond the boundary is stale.
- [x] T-13: Check `src/lib/__tests__/compute-spx-snapshot-window.test.ts`'s "~276 bars from 400-calendar-day fetch" comment (`:56`) against the post-fix behavior. Likely outcome: the comment already describes the correct post-fix state accurately (it was aspirational, written before the `limit` bug was found) and needs no edit — confirm this rather than assuming either way; edit only if a genuine inconsistency is found (FR-10). Do not change any assertion in this file.

### Phase 5 — Verification

- [x] T-14: Run `npx tsc --noEmit` — must be clean.
- [x] T-15: Run the full test suite — must pass with no regressions.
- [x] T-16: Show the five changed `getBars()` calls and the new `guardMacroBars()`/`isMacroBarsStale()` code in the implementation report.
- [x] T-17: Using the project's existing Alpaca client with read-only GETs (same credentials `alpaca.ts` already uses — no new secrets read, none printed), confirm the five fetches now return a bar dated at most a few days old (print only dates/closes). Compare against the pre-fix live result captured in STEP 0 (last bar `2026-08-27` as of 2026-10-03) to show the fix actually changes the outcome.
- [x] T-18: Re-confirm (do not re-derive from scratch — cross-check against the table already in `requirements.md`'s Background) that every other `getBars()` call site's effective `daysBack`/`limit` is unaffected by this change and was not itself truncated before this change. Report-only, no code change from this task.
- [x] T-19: Run `git diff --stat` — confirm it touches exactly `src/lib/claude-agent.ts`, `src/lib/macro-bars-staleness.ts` (new), `src/lib/__tests__/macro-bars-staleness.test.ts` (new), and — only if T-13 found a genuine inconsistency — `src/lib/__tests__/compute-spx-snapshot-window.test.ts`'s comment. No other file.

## Post-Implementation

- [x] Run `/review macro-bars-truncation-fix` to verify implementation matches spec
- [x] Confirm Protected Zone file (`claude-agent.ts`) changes were explicitly approved, not just spec-approved
- [ ] Note for Amaury (not an implementation task): the next real cycle's `[SECTOR_ROTATION]`/`[MACRO_SPX]` log lines and the next `market_daily_briefings` row will be the first live confirmation that the fix behaves correctly against real production data end-to-end — this can only be observed after merge + a live run, not during `/implement` itself. Existing stale rows/per-trade records are not touched by this change (C-04) and remain as historical artifacts of the bug unless a separate backfill change is decided later.

## Estimated Complexity

**Low** — a one-argument fix at 5 already-identified call sites plus one small, fully pure, well-tested new helper. No formula, schema, or downstream-consumer change; every consumer of the now-possibly-null outputs was confirmed null-safe before writing this spec. The only reason this isn't "trivial" is that it's a Protected Zone file and warrants the explicit sign-off above.
