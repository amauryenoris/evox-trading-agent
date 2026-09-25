import { mrRangingAdxFloor, trendPullbackMacdFloor, lowAdxMacdBoost } from './claude-agent'

export type GateImportance = 'hard-gated' | 'soft-referenced' | 'not-gated'

export const DIMENSION_IMPORTANCE: Record<string, Record<string, GateImportance>> = {
  MEAN_REVERSION: { adx: 'hard-gated', macd: 'not-gated', z: 'hard-gated', regime: 'hard-gated' },
  TREND_PULLBACK: { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  TREND_ZLE05:    { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  EMA_RECLAIM:    { adx: 'not-gated', macd: 'not-gated', z: 'hard-gated', regime: 'not-gated' },
  // Derived directly from TREND_PULLBACK_3DAY's own entry condition (claude-agent.ts:1711-1728:
  // prevClose > sma200 + 3 consecutive lower closes) — not borrowed from TREND_ZLE05 or any other
  // setup. adx/macd/z: the entry gate never reads any of them, so not-gated. regime: the entry
  // gate never reads indicators.marketRegime either (only checks sma200 directly) — same as its
  // trend-setup siblings above, none of which read marketRegime. Only MEAN_REVERSION's gate reads
  // marketRegime directly, which is why it alone is hard-gated on regime.
  // Revisit with real evidence once this setup reaches n>=20-30 closed trades (currently n=13).
  TREND_PULLBACK_3DAY: { adx: 'not-gated', macd: 'not-gated', z: 'not-gated', regime: 'not-gated' },
}

// Sourced from claude-agent.ts gate thresholds as of 2026-07-27:
// - MEAN_REVERSION.adx: mrRangingAdxFloor (imported above) — blocks
//   if marketRegime==='RANGING' && adx < mrRangingAdxFloor
// - TREND_PULLBACK.adx: manually verified against claude-agent.ts
//   line 1355 (adxValue >= 20) — no named constant exists to import
// - TREND_PULLBACK.macd: trendPullbackMacdFloor (imported above) —
//   hard-gated if macdHistogram <= trendPullbackMacdFloor
// - TREND_ZLE05.adx: manually verified against claude-agent.ts
//   lines 1362-1363 (adx>=18, or adx>=15 with lowAdxMacdBoost
//   (imported above) as the MACD companion threshold) — the ADX
//   floors themselves (18, 15) have no named constant
// - TREND_ZLE05.macd: manually verified against claude-agent.ts
//   line 1456 (macdHistogram > 0) — no named constant exists to
//   import
