# Design — Wire ACTIVE_SETUPS into stock-selector.ts's Prompt

## Architecture Decision

This lives entirely in `src/lib/stock-selector.ts`'s prompt-construction code, one layer up from `claude-agent.ts`'s per-symbol analysis. `stock-selector.ts` adds an `import { ACTIVE_SETUPS } from './setups'` and a new module-level constant, `ACTIVE_SETUP_CRITERIA_TEXT`, computed once at module load by filtering/mapping `ACTIVE_SETUPS`. That constant is interpolated into the existing `SELECTION_SYSTEM_PROMPT` template literal's `CRITERIA` block, as one more bullet alongside the existing ones. No other file changes.

The `.claude/skills/claude-api-patterns.md` rule "do not build ad-hoc prompts for trading analysis outside of `buildEnrichedPrompt()`" does not apply here — that rule scopes the per-symbol technical-analysis prompt in `claude-agent.ts`. `stock-selector.ts`'s selection prompt is an existing, separate, pre-established prompt-building location with its own constant (`SELECTION_SYSTEM_PROMPT`); this change extends that existing constant, it does not introduce a new ad-hoc prompt path.

## Data Flow

```
setups.ts
  ACTIVE_SETUPS: { name, criteria, active }[]  (5 entries, unchanged by this feature)
       │
       ▼
stock-selector.ts (module load time)
  ACTIVE_SETUP_CRITERIA_TEXT =
    ACTIVE_SETUPS.filter(s => s.active).map(s => `    * ${s.name}: ${s.criteria}`).join('\n')
       │
       ▼
SELECTION_SYSTEM_PROMPT (template literal, CRITERIA block)
  existing bullets (volume, momentum, MANDATORY sector coverage, past performance, correlation)
  + new bullet: "Also weigh whether a candidate plausibly fits one of these active
    trading setups (one more factor among the above, not a requirement):"
    ${ACTIVE_SETUP_CRITERIA_TEXT}
       │
       ▼
selectStocksForAnalysis() → client.messages.create({ system: SELECTION_SYSTEM_PROMPT, ... })
       │
       ▼
Claude's response — schema UNCHANGED ({ selected, reasoning, scores })
       │
       ▼
(later, independently) claude-agent.ts's per-symbol loop — setup detection unaffected,
runs its own boolean gates regardless of what the Buy Scanner picked or why
```

## Why the system prompt, not the user prompt

The setup-criteria text is static per-cycle (it doesn't depend on any per-call data like portfolio state or candidate prices) — it changes only when `ACTIVE_SETUPS` itself changes. `SELECTION_SYSTEM_PROMPT`'s `CRITERIA` block already holds exactly this kind of static, cycle-independent guidance (the sector list, the correlation-avoidance instruction). The user prompt (`stock-selector.ts:162-178`) holds only things that vary per call: current portfolio, today's briefing, this cycle's candidate lines, this cycle's learning lines. Putting setup criteria there would mean re-rendering identical text on every single call for no benefit, and would misplace static guidance among data that actually changes.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add setup-criteria bullet to `SELECTION_SYSTEM_PROMPT`'s `CRITERIA` block | Matches where equivalent static guidance already lives (sector list); zero-cost across calls | None identified | **Chosen** |
| Add setup-criteria section to the per-call user prompt | Would also work functionally | Re-renders identical static text on every cycle; misplaces static guidance among per-cycle data | Rejected |
| Compute `ACTIVE_SETUP_CRITERIA_TEXT` inside `selectStocksForAnalysis()` (per-call) instead of at module load | Would still satisfy "generated via `.filter()`/`.map()` at runtime" | No observable difference today (`ACTIVE_SETUPS` is a static in-module array; per-call and module-load evaluation produce identical output); module-load computation keeps `SELECTION_SYSTEM_PROMPT` a flat top-level constant, matching the codebase's existing pattern | Rejected — same outcome, less consistent with current style |
| Add a `setups[].fitsSetup` field to the response schema | Would let Claude report which setup(s) it thinks fit | Explicitly out of scope (SCOPE item 4 / FR-07) — no downstream consumer needs it, adds schema surface for zero current benefit | Rejected |
| Add a hard filter (only offer candidates plausibly fitting an active setup) | Could shrink Pool A/B more aggressively | Explicitly out of scope — SCOPE item 3 requires additive guidance only, not a second MANDATORY/filter clause | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | Add `ACTIVE_SETUPS` import, add `ACTIVE_SETUP_CRITERIA_TEXT` constant, extend `SELECTION_SYSTEM_PROMPT`'s `CRITERIA` block with one new non-mandatory bullet |

No other file changes. `setups.ts`, `types.ts`, `gate-importance.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts` are all untouched.

## Resulting Prompt (illustrative — exact wording finalized at implementation)

```
SELECTION CRITERIA (CRITERIA block, full text after change):
- Prefer stocks with high volume (strong institutional interest) from the screener pool
- Prefer stocks with significant price movement (momentum opportunities)
- MANDATORY: include at least 1 stock from each of these sectors in your final selection:
    * Big Tech (AAPL, MSFT, NVDA, GOOGL, META, AMZN, TSLA)
    * Oil & Energy (XOM, CVX, OXY, COP, XLE)
    * Mining / Gold / Rare Earth (MP, UUUU, NEM, FCX, GOLD)
- Use your past selection performance to refine your choices within sectors
- Avoid selecting highly correlated stocks (e.g. don't pick 3 energy stocks)
- Also weigh whether a candidate plausibly fits one of these active trading setups
  (one more factor among the above, not a requirement):
    * TREND_PULLBACK_3DAY: Price above SMA200 (uptrend) with exactly 3 consecutive
      lower daily closes immediately before entry; enters on the 4th day. No
      z-score, ADX, or MACD condition.
    * MEAN_REVERSION: Ranging market regime, z-score <= -1.3 (or news-adjusted
      threshold), RSI < 45, %B < 0.2.
    * TREND_PULLBACK: Uptrend structure (price > EMA50 > EMA200), z-score <= 0,
      EMA50 slope rising, ADX >= 20, momentum confirmed.
    * TREND_ZLE05: Uptrend structure (price > EMA50 > EMA200), 0 < z-score <=
      1.25, EMA50 slope rising, ADX >= 18 (or >= 15 with MACD histogram > 0.25),
      MACD histogram positive.
    * EMA_RECLAIM: Price crossed above EMA50 from below (confirmed vs. prior
      day), z-score < 0, distance from EMA50 > 0.2%, momentum confirmed.
```

The 5 lines above come verbatim from `ACTIVE_SETUPS[*].criteria` — they are not retyped by hand in `stock-selector.ts`. The implementation report (per this change's VERIFICATION EXPECTED) will show the actual generated string end-to-end, including the rest of the unchanged prompt, once written.

## Protected Zone Impact

None. `stock-selector.ts` is not on `CLAUDE.md`'s Protected Zone list or its broader "confirm before touching" list (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`) — it's on the unrestricted `src/lib/` surface.

## Database Changes

None.

## Open Questions

None. The design choices above (system prompt vs. user prompt; module-load vs. per-call computation) have a clear evidence-based answer each, given in "Alternatives Considered."
