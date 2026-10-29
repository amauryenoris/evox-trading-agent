import { EARNINGS_BLOCK } from './earnings-window'
import { TREND_3DAY_ABOVE_SMA5_PREFIX } from './sma5-exit'

export type RejectedKind =
  | 'TREND_ZGT125'
  | 'TREND_QUALITY_FAIL'
  | 'SPREAD_GATE'
  | 'MR_RANGING_ADX_GATE'
  | 'EARNINGS_BLOCK'
  | 'TREND_3DAY_ABOVE_SMA5'

export const REJECTED_FILTER = [
  'error.ilike.TREND_ZGT125%',
  'error.ilike.TREND_QUALITY_FAIL%',
  'error.ilike.Spread gate%',
  'error.ilike.MR_RANGING_ADX_GATE%',
  `error.ilike.${EARNINGS_BLOCK}%`,
  `error.ilike.${TREND_3DAY_ABOVE_SMA5_PREFIX}%`,
].join(',')

export const REJECTED_LABELS: Record<RejectedKind, string> = {
  TREND_ZGT125: 'Z>1.25',
  TREND_QUALITY_FAIL: 'QUALITY',
  SPREAD_GATE: 'SPREAD',
  MR_RANGING_ADX_GATE: 'MR RANGING',
  EARNINGS_BLOCK: 'EARNINGS',
  TREND_3DAY_ABOVE_SMA5: 'SMA5',
}

export function classifyRejected(error: string): RejectedKind {
  const upper = error.toUpperCase()
  if (upper.startsWith('TREND_QUALITY_FAIL')) return 'TREND_QUALITY_FAIL'
  if (upper.startsWith('SPREAD GATE')) return 'SPREAD_GATE'
  if (upper.startsWith('MR_RANGING_ADX_GATE')) return 'MR_RANGING_ADX_GATE'
  if (upper.startsWith(EARNINGS_BLOCK)) return 'EARNINGS_BLOCK'
  if (upper.startsWith(TREND_3DAY_ABOVE_SMA5_PREFIX)) return 'TREND_3DAY_ABOVE_SMA5'
  return 'TREND_ZGT125'
}

const fixed = (value: number | null, digits: number): string => (value != null ? value.toFixed(digits) : '—')

function stripPrefix(error: string, prefix: string): string {
  return error.slice(0, prefix.length + 1).toUpperCase() === `${prefix}:` ? error.slice(prefix.length + 1).trimStart() : error
}

export function buildRejectedReason(kind: RejectedKind, error: string, z: number | null, adx: number | null): string {
  switch (kind) {
    case 'TREND_ZGT125': return `z-score ${fixed(z, 3)} > 1.25 threshold`
    case 'TREND_QUALITY_FAIL': return `ADX ${fixed(adx, 1)} < 20 — trend not confirmed`
    case 'MR_RANGING_ADX_GATE': return `z-score ${fixed(z, 3)} met threshold but ADX ${fixed(adx, 1)} too low — RANGING regime`
    case 'EARNINGS_BLOCK': return stripPrefix(error, EARNINGS_BLOCK)
    case 'TREND_3DAY_ABOVE_SMA5': return stripPrefix(error, TREND_3DAY_ABOVE_SMA5_PREFIX)
    case 'SPREAD_GATE': return error.replace(/^Spread gate:\s*/i, '')
  }
}
