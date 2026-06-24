# Design — Fix SPX Snapshot Insufficient SMA200 Window

## Architecture Decision

This is a single-parameter fix at the call site of `getBars('SPY', '1Day', 260)` in `runAgentCycle()` (`src/lib/claude-agent.ts:870`), inside the existing `Promise.all` that loads portfolio/market state at the top of each cycle. No change to `computeSpxSnapshot()`, `smaAt()`, `getBars()` itself, or any downstream consumer — the fix supplies the existing, already-correct calculation with enough raw data to succeed.

## Data Flow

```
runAgentCycle()
  Promise.all([
    getAccount(), getPositions(), getClock(),
    getBars('SPY', '1Day', 260)   ← CHANGE: 260 → 400 (calendar days)
      .catch(() => [])             ← unchanged fail-open
  ])
  → spyBars  (today: ~179-185 trading-day bars; after fix: ~270-280)
  → computeSpxSnapshot(spyBars)
      refIndex = bars.length - 2        (today: ~177-183; after fix: ~268-278 — both ≥ 199 required for SMA200)
      spx_sma200 = smaAt(bars, refIndex, 200)   → today: always null; after fix: populated
      spx_sma50, spx_regime follow accordingly
  → spxSnapshot { spx_price, spx_sma50, spx_sma200, spx_regime }
  → indicatorsAtBuy / bestIndicatorsAtBuy (Path 1 / Path 2, unchanged)
  → saveOpenPositionContext (unchanged)
  → [at SELL time] learning.ts reads back from open_position_contexts.indicators (unchanged) → trade_evaluations columns (unchanged)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Change `daysBack` from `260` to `400` at the `getBars('SPY', ...)` call site | Single-line change; reuses the exact margin already proven correct by `scripts/backfill-spx-regime.ts`; no change to `limit` needed (default 250 ≥ 201 minimum bars required, even after the increased window returns more candidate bars) | None significant | **Chosen** |
| Change `getBars()`'s default `daysBack` parameter itself (currently `260`) | Would also fix any other unguarded caller | `getBars()` is a generic, reusable Alpaca helper used by many callers for many symbols/purposes unrelated to a 200-day SMA (e.g. shorter-window indicator calcs elsewhere) — changing its default risks unintended behavior/latency/rate-limit changes elsewhere | Rejected — fix at the specific call site that needs it, not the shared utility's default |
| Convert `daysBack` semantics to trading days (add a trading-day-aware calculation) | More "correct" long-term | Bigger change, touches a shared utility, not requested, not needed once the calendar-day margin is generous enough | Rejected — YAGNI, matches existing project convention of using a generous calendar-day buffer (as the backfill script already does) rather than a trading-calendar-aware fetch |
| Also bump `limit` (currently defaults to 250) | Extra margin | With `daysBack=400` (~276 trading days expected) and `limit` still 250, the API caps the return at 250 bars — still comfortably ≥ 201 minimum needed; no need to also raise `limit` | Rejected — unnecessary for this fix; keeps diff minimal |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Change `getBars('SPY', '1Day', 260)` → `getBars('SPY', '1Day', 400)` at line 870 (one argument, one line) |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — Protected Zone. Requires explicit confirmation from Amaury before implementation. Change is a single numeric argument at an existing call site — no change to setup-detection logic, trade execution, or sizing.

## Database Changes

None. This does not backfill existing rows — only future cycles will compute correctly.

## Open Questions

- None for the immediate fix. Separately (out of scope per requirements.md): should a follow-up backfill be run against `open_position_contexts` for currently-open positions (NOK, MSFT, AMZN, CVX, etc.) so their stored `indicators.spx_*` aren't stuck null for the lifetime of those positions? This spec does not address it — flagging for Amaury to decide whether a follow-up `/spec` is wanted.
