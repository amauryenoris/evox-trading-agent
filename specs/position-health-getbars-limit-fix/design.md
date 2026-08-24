# Design — Fix Stale current_price in Position Health Monitor (getBars limit)

## Architecture Decision

This is a two-line, single-file parameter fix in `scripts/position-health-check.ts`, the standalone script (outside `src/`, run via `npm run health-check` on a GitHub Actions cron) that populates `position_health_snapshots`. No architecture changes — the existing `getBars()` helper, its defaults, and every other consumer of it are untouched. The fix brings this script's two call sites in line with the correct pattern already established and in production use at `claude-agent.ts:1109,1144,1164` (`getBars(sym, '1Day', 300, 300)`), where `limit` is always passed to match `daysBack`.

## Data Flow

```
position-health-check.ts main()
   │
   ├─ getBars('SPY', '1Day', 400)          ← BEFORE: limit defaults to 250, sort=asc → oldest 250 of ~285 trading days returned
   │  getBars('SPY', '1Day', 400, 400)      ← AFTER:  limit=400 ≥ ~285 available trading days → full window returned, no truncation
   │
   └─ for each open position:
        getBars(ctx.symbol, '1Day', 400)          ← BEFORE: same truncation bug, per-symbol
        getBars(ctx.symbol, '1Day', 400, 400)      ← AFTER:  fixed
           │
           ▼
        calculateAllIndicators(bars)   ← unchanged, shared production logic
           │
           ▼
        currentPrice = bars[bars.length - 1].c   ← now correctly the most recent trading day's close
           │
           ▼
        position_health_snapshots row (current_price, current_z_score, etc.)
```

Nothing downstream of the `getBars()` call changes — `calculateAllIndicators()`, the ADX/MACD/Z bucket helpers, and the insert logic all operate on whatever `bars` array they're handed, unmodified by this fix.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Pass `limit=400` matching `daysBack=400` on both calls | Matches the exact working precedent already in production (`claude-agent.ts`'s 3 calls); minimal diff (2 characters of intent, `, 400` added twice); zero behavioral change beyond fetching the correct window | None significant | Chosen |
| Increase `getBars()`'s default `limit` value in `alpaca.ts` | Fixes this bug at the source, benefits any future caller that forgets to pass `limit` | Touches a shared helper used by every caller in the codebase — broader blast radius than this diagnostic's confirmed, scoped root cause; the diagnostic explicitly ruled `claude-agent.ts`'s own unmatched-limit calls (SPY/GDX/XLE/XLK) as NOT exhibiting this bug in practice, so changing the shared default risks altering behavior that was independently verified as currently correct | Rejected — out of scope per the diagnostic's explicit exclusion of `alpaca.ts`/`claude-agent.ts` |
| Remove `daysBack=400` and rely on `limit`'s own default window sizing | Simpler call signature | `daysBack=400` intentionally requests more history than the default 260 (for the 200+ bar minimum checks at lines 84/105) — reducing it changes an intentional, unrelated design choice | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `scripts/position-health-check.ts` | MODIFY | Add explicit `limit=400` to the two `getBars()` calls (lines 80 and 98) |

No other file changes. `alpaca.ts`, `claude-agent.ts`, `indicators.ts`, `state-fingerprint.ts`, and the `position_health_snapshots` migration are all untouched.

## Protected Zone Impact

None — `scripts/position-health-check.ts` is explicitly listed under "Touch freely" in `CLAUDE.md`'s file permission matrix (`scripts/**`). No Protected Zone file is touched.

## Database Changes

None. This fix only changes which bars are fetched before a row is constructed — the `position_health_snapshots` schema, the insert shape, and the migration are all unchanged.

## Open Questions

- None. The fix is a direct, minimal application of the diagnostic's confirmed root cause, scoped exactly as specified.
