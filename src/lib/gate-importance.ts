import { mrRangingAdxFloor, trendPullbackMacdFloor, lowAdxMacdBoost } from './claude-agent'

export type GateImportance = 'hard-gated' | 'soft-referenced' | 'not-gated'

export const DIMENSION_IMPORTANCE: Record<string, Record<string, GateImportance>> = {
  MEAN_REVERSION: { adx: 'hard-gated', macd: 'not-gated', z: 'hard-gated', regime: 'hard-gated' },
  TREND_PULLBACK: { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  TREND_ZLE05:    { adx: 'hard-gated', macd: 'hard-gated', z: 'hard-gated', regime: 'not-gated' },
  EMA_RECLAIM:    { adx: 'not-gated', macd: 'not-gated', z: 'hard-gated', regime: 'not-gated' },
}

// Sourced from claude-agent.ts gate thresholds as of 2026-07-24:
// - MEAN_REVERSION.adx: mrRangingAdxFloor (imported above) — blocks
//   if marketRegime==='RANGING' && adx < mrRangingAdxFloor
// - TREND_PULLBACK.adx: manually verified against claude-agent.ts
//   line 1350 (adxValue >= 20) — no named constant exists to import
// - TREND_PULLBACK.macd: trendPullbackMacdFloor (imported above) —
//   hard-gated if macdHistogram <= trendPullbackMacdFloor
// - TREND_ZLE05.adx: manually verified against claude-agent.ts
//   lines 1359-1360 (adx>=18, or adx>=15 with lowAdxMacdBoost
//   (imported above) as the MACD companion threshold) — the ADX
//   floors themselves (18, 15) have no named constant
// - TREND_ZLE05.macd: manually verified against claude-agent.ts
//   line 1455 (macdHistogram > 0) — no named constant exists to
//   import
