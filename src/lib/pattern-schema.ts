export type DimensionKind = 'confirmatory' | 'exploratory' | 'diagnostic'

export interface DimensionSchemaEntry {
  dimension: string
  kind: DimensionKind
}

export type SetupName =
  | 'MEAN_REVERSION'
  | 'TREND_PULLBACK'
  | 'TREND_ZLE05'
  | 'TREND_PULLBACK_3DAY'
  | 'EMA_RECLAIM'

export const SCHEMA_FROZEN_AT = '2026-10-08T00:00:00-04:00'

// confidence (AgentDecision.confidence) is never persisted on TradeEvaluation/TechnicalIndicators —
// kept in the schema as diagnostic so every setup reports it as skipped, rather than omitting it silently.
const CONFIDENCE_DIMENSION: DimensionSchemaEntry = { dimension: 'confidence_bucket', kind: 'diagnostic' }

export const SCHEMA: Record<SetupName, DimensionSchemaEntry[]> = {
  MEAN_REVERSION: [
    { dimension: 'adx_bucket', kind: 'confirmatory' },
    { dimension: 'z_bucket', kind: 'confirmatory' },
    { dimension: 'market_regime', kind: 'confirmatory' },
    { dimension: 'atr_bucket', kind: 'exploratory' },
    { dimension: 'macd_bucket', kind: 'exploratory' },
    { dimension: 'reentry_bucket', kind: 'exploratory' },
    CONFIDENCE_DIMENSION,
  ],
  TREND_PULLBACK: [
    { dimension: 'adx_bucket', kind: 'confirmatory' },
    { dimension: 'macd_bucket', kind: 'confirmatory' },
    { dimension: 'z_bucket', kind: 'confirmatory' },
    { dimension: 'ema50_extension_bucket', kind: 'exploratory' },
    { dimension: 'reentry_bucket', kind: 'exploratory' },
    CONFIDENCE_DIMENSION,
  ],
  TREND_ZLE05: [
    { dimension: 'adx_bucket', kind: 'confirmatory' },
    { dimension: 'macd_bucket', kind: 'confirmatory' },
    { dimension: 'z_bucket', kind: 'confirmatory' },
    { dimension: 'ema50_extension_bucket', kind: 'exploratory' },
    { dimension: 'reentry_bucket', kind: 'exploratory' },
    CONFIDENCE_DIMENSION,
  ],
  TREND_PULLBACK_3DAY: [
    { dimension: 'drop3d_bucket', kind: 'exploratory' },
    { dimension: 'reentry_bucket', kind: 'exploratory' },
    CONFIDENCE_DIMENSION,
  ],
  EMA_RECLAIM: [
    { dimension: 'z_bucket', kind: 'confirmatory' },
    CONFIDENCE_DIMENSION,
  ],
}

export function filterDiagnostic(dimensions: DimensionSchemaEntry[]): DimensionSchemaEntry[] {
  return dimensions.filter((d) => d.kind !== 'diagnostic')
}

export type RuleVersionAxis = 'buy' | 'sell'

export interface RuleVersionBoundary {
  label: string
  appliesTo: RuleVersionAxis
  effectiveDate: string
}

export const RULE_VERSION_BOUNDARIES: Record<SetupName, RuleVersionBoundary[]> = {
  MEAN_REVERSION: [
    { label: 'ranging ADX gate added', appliesTo: 'buy', effectiveDate: '2026-06-16' },
  ],
  TREND_PULLBACK: [
    { label: 'MACD floor added', appliesTo: 'buy', effectiveDate: '2026-06-04' },
  ],
  TREND_ZLE05: [
    { label: 'adaptive ADX gate stabilized', appliesTo: 'buy', effectiveDate: '2026-06-04' },
    { label: 'new exit rules trial', appliesTo: 'sell', effectiveDate: '2026-10-05' },
  ],
  TREND_PULLBACK_3DAY: [],
  EMA_RECLAIM: [],
}

export const MULTIPLE_COMPARISONS_NOTE =
  'Bucket labels are not corrected for multiple comparisons — each is a single, uncorrected hypothesis test. ' +
  'With many dimensions and buckets tested, some DIFFERS_POS/DIFFERS_NEG labels are expected by chance alone.'
