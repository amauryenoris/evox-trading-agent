# Search First — Read Before You Write

## The rule

Before implementing any feature or fix in this project, read the relevant files first.
Never assume how something works. The codebase has non-obvious patterns, layered logic,
and intentional design decisions that aren't visible from filenames alone.

## Minimum reads before touching any file

| Task | Read first |
|------|-----------|
| Adding a new signal type | `src/lib/claude-agent.ts` (full setup detection block) |
| Changing exit logic | `src/lib/claude-agent.ts` (`enforceExitRules`) |
| Adding a DB query | `src/lib/db.ts` (check if function already exists) |
| Touching indicators | `src/lib/indicators.ts` + `src/lib/types.ts` (`TechnicalIndicators`) |
| Adding an API route | Check `src/app/api/` for existing patterns |
| Changing position sizing | `claude-agent.ts` (`calculateBuyQuantity`) + `src/lib/config.ts` |
| Adding risk rules | `src/lib/risk-manager.ts` (full file) |
| Modifying news logic | `src/lib/news-intelligence.ts` + `src/lib/watchlist-monitor.ts` |
| Changing Supabase schema | `src/lib/db.ts` + `src/lib/types.ts` (all affected types) |
| Adding dashboard components | Read an existing component in `src/components/dashboard/` first |

## Specific things you cannot assume

- **Signal types**: there are 4 (`MEAN_REVERSION`, `TREND_PULLBACK`, `TREND_ZLE05`, `EMA_RECLAIM`). Any new one requires changes in: setup detection, exit rules, trailing stop config, sizing multipliers, prompt context, and CLAUDE.md.
- **Exit rules**: exits are deterministic and run BEFORE Claude is called. Claude does not trigger exits.
- **Config values**: `ZSCORE_ENTRY_THRESHOLD`, `MAX_SPREAD_BPS`, `INSTRUMENT_BLACKLIST` live in `config.ts`. Do not hardcode these values anywhere else.
- **Env vars**: there are two Supabase client patterns (browser vs server). Check which context you're in before choosing a client.
- **Numeric types**: Alpaca returns monetary values as strings. Always `parseFloat` before arithmetic.
- **Claude action field**: `decision.action` is always overridden to `'HOLD'` after parsing. Claude never decides the action.

## How to explore before writing

1. **Find the function that does something similar** — grep for the concept, not the filename
2. **Read the types** — `src/lib/types.ts` tells you the shape of every major object
3. **Follow the data flow** — start from `runAgentCycle()` in `claude-agent.ts` for any cycle-related change
4. **Check `db.ts` before adding queries** — the function may already exist
5. **Check `config.ts`** — parameters may already be centralized there

## When in doubt, ask

If you're unsure about the intent behind a piece of logic (especially in `claude-agent.ts` or `risk-manager.ts`),
ask Amaury before changing it. These files encode live trading rules — a wrong assumption can cause real financial impact.
