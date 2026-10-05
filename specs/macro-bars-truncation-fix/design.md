# Design — Fix Truncated Macro/Sector Bar Fetch + Staleness Guard

## Architecture Decision

Two independent, additive pieces, both minimal: (1) a one-argument fix at each of the 5 macro/sector `getBars()` call sites in `runAgentCycle()` (`claude-agent.ts`), matching the existing `(400, 400)` precedent already used by `scripts/daily-bars-sync.ts` and `scripts/position-health-check.ts`; (2) a new, tiny, pure, dependency-free module (`src/lib/macro-bars-staleness.ts`) holding only the staleness *check* — the logging and "treat as unavailable" *behavior* stays in `claude-agent.ts`, right where the fetches already are, reusing the exact empty-array fallback shape the `.catch()` blocks already produce today. No formula, schema, or downstream consumer changes anywhere — every consumer was confirmed null-safe already (see requirements.md Background).

## Data Flow

```
runAgentCycle()
  Promise.all([..., getBars('SPY','1Day',400,400), getBars('GDX','1Day',400,400),
                     getBars('XLE','1Day',400,400), getBars('XLK','1Day',400,400),
                     getBars('VIXY','1Day',400,400)])
         │  (each .catch() unchanged — still returns [] on fetch failure)
         ▼
  spyBars, gdxBars, xleBars, xlkBars, vixyBars   (now up to ~276 bars each, not 250)
         │
         ▼
  guardMacroBars(symbol, bars) — new local helper in claude-agent.ts, for each of the 5:
    isMacroBarsStale(bars, new Date())?
      NO  → return bars unchanged
      YES → console.warn(`[STALE_MACRO_BARS] symbol=${symbol} lastBar=${lastBar} ageDays=${ageDays}`)
            return []                                   ← identical shape to a .catch() failure
         │
         ▼
  safeSpyBars, safeGdxBars, safeXleBars, safeXlkBars, safeVixyBars
         │
         ▼
  computeSpxSnapshot(safeSpyBars)                        [unchanged function]
  computeSectorRotation(safeGdxBars, safeXleBars, safeXlkBars, safeSpyBars)  [unchanged function]
  computeVixyChangePct(safeVixyBars)                      [unchanged function]
         │
         ▼
  (unchanged downstream: narrative synthesis, dashboard, per-trade indicators —
   all already null-safe, confirmed in requirements.md Background)
```

## The staleness helper (`src/lib/macro-bars-staleness.ts`, new file)

```ts
export const STALE_MACRO_BARS_MAX_DAYS = 5

export function isMacroBarsStale(bars: { t: string }[], referenceDate: Date): boolean {
  if (bars.length === 0) return true
  const lastBarDate = new Date(bars[bars.length - 1].t)
  const ageDays = (referenceDate.getTime() - lastBarDate.getTime()) / (24 * 60 * 60 * 1000)
  return ageDays > STALE_MACRO_BARS_MAX_DAYS
}
```
Notes:
- Uses `bars[bars.length - 1]` (the literal newest bar) — deliberately *not* the `bars.length - 2` "exclude today's partial bar" convention the RS/SPX formulas use. Staleness answers "how recent is our data overall," which is a different question from "what's the last *confirmed* close" — using the true last bar gives the earliest possible detection of a truncation/fetch problem.
- `ageDays > 5` (strict) — exactly 5.0 days is not yet stale; this absorbs a long weekend plus one holiday (Fri close → Tue morning run = 4 calendar days) without false-flagging, per FR-05's test requirement, while still catching the real ~35-day staleness this bug produces by a wide margin.
- Pure: takes `referenceDate` as a parameter rather than calling `new Date()` internally (C-06) — the call site (`claude-agent.ts`) passes `new Date()` at the point of use.

## The call-site guard (`claude-agent.ts`, local, not exported)

```ts
function guardMacroBars(symbol: string, bars: AlpacaBar[]): AlpacaBar[] {
  if (!isMacroBarsStale(bars, new Date())) return bars
  const lastBar = bars.length > 0 ? bars[bars.length - 1].t.split('T')[0] : 'none'
  const ageDays = bars.length > 0
    ? Math.floor((Date.now() - new Date(bars[bars.length - 1].t).getTime()) / (24 * 60 * 60 * 1000))
    : -1
  console.warn(`[STALE_MACRO_BARS] symbol=${symbol} lastBar=${lastBar} ageDays=${ageDays}`)
  return []
}
```
Applied once per symbol, right after the `Promise.all` destructure and before any `compute*` call:
```ts
const safeSpyBars = guardMacroBars('SPY', spyBars)
const safeGdxBars = guardMacroBars('GDX', gdxBars)
const safeXleBars = guardMacroBars('XLE', xleBars)
const safeXlkBars = guardMacroBars('XLK', xlkBars)
const safeVixyBars = guardMacroBars('VIXY', vixyBars)
```
`spyBars`/`safeSpyBars` is guarded once and reused for both `computeSpxSnapshot` and `computeSectorRotation` — no duplicate check or duplicate log line for the same underlying fetch.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Pass explicit `limit=400` at each of the 5 call sites | Matches the existing `(400, 400)` precedent exactly (`daily-bars-sync.ts`, `position-health-check.ts`); zero new abstraction | None identified | **Chosen** |
| Add pagination (follow `next_page_token`) instead of raising `limit` | Would work for windows >400 bars too | Explicitly forbidden (FR-02); unnecessary complexity for a window that fits in one page once `limit` matches `daysBack` | Rejected |
| Put the staleness check inside `alpaca.ts`'s `getBars()` itself | One central enforcement point | Explicitly forbidden (C-02) — `alpaca.ts` is used by many call sites with different freshness needs (e.g. historical backfills in `daily-bars-sync.ts` *should* return old bars); staleness is a caller concern, not a fetch-layer concern | Rejected |
| Put the stale→`[]` substitution inside the new helper file itself | Slightly less code at the call site | The helper would then need `console.warn` (an I/O side effect) and the symbol name, making it no longer a "small pure helper" — violates C-06 and the explicit ALLOWED-item-2 framing ("small pure helper" for the *check*; logging/substitution happens "in `runAgentCycle()`") | Rejected |
| Test via direct import of `isMacroBarsStale` (it's a small, fully exported, side-effect-free function in its own new file — no Protected-Zone or bulk-module obstacle exists) | Simpler, fewer lines, no duplicate logic to keep in sync | Diverges from the explicit instruction to use the inline-replica convention; the rest of this test suite's convention exists for a different reason (testing un-exported logic inside bulky `claude-agent.ts`), which doesn't actually apply here | Rejected — instruction followed literally despite the simpler alternative being available; noted here for transparency |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY ⚠️ Protected Zone | 5 `getBars()` calls gain an explicit `400` limit argument; new local `guardMacroBars()` helper; 5 guard calls inserted between the `Promise.all` destructure and the `compute*` calls |
| `src/lib/macro-bars-staleness.ts` | CREATE | `STALE_MACRO_BARS_MAX_DAYS` constant + `isMacroBarsStale()` pure function |
| `src/lib/__tests__/macro-bars-staleness.test.ts` | CREATE | Inline-replica tests: fresh array (not stale), stale array, empty array (stale), 3-4-day-old last bar across a simulated weekend/holiday gap (not stale) |
| `src/lib/__tests__/compute-spx-snapshot-window.test.ts` | MODIFY (comment only) | Update the "~276 bars from 400-calendar-day fetch" comment if it reads as describing the pre-fix (truncated) behavior rather than the post-fix one — no expectation/assertion changes (FR-10) |

No other file. `sector-rotation.ts`, `state-fingerprint.ts`, `market-daily-briefing.ts`, `alpaca.ts`, `risk-manager.ts`, `indicators.ts`, `config.ts`, `learning.ts`, all db files, and all migrations are untouched.

## Protected Zone Impact

**⚠️ Requires Amaury confirmation before implementation.** `claude-agent.ts` is on `CLAUDE.md`'s Protected Zone list. This change touches only the macro/sector data-fetch block inside `runAgentCycle()` — not setup detection, not exit rules, not the sizing formula — but it is still `claude-agent.ts`, and per `specs/README.md`'s rule this needs separate, explicit sign-off even after spec approval.

## Database Changes

None. (No backfill of existing rows — explicitly out of scope, C-04.)

## Open Questions

None. The one condition that genuinely needed verification before this spec could be written safely — whether treating a stale symbol as unavailable could crash prompt building, the briefing, or the dashboard (the CHANGE's own FAIL FAST clause) — was traced end-to-end this session and confirmed not triggered (see requirements.md Background: every consumer already handles null gracefully).
