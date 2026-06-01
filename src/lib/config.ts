// Single source of truth for trading parameters
export const ZSCORE_ENTRY_THRESHOLD = -1.3
export const MAX_SPREAD_BPS = 100
export const MAX_QUOTE_AGE_SECONDS = 60

export const INSTRUMENT_BLACKLIST = new Set([
  // Inverse ETFs — semiconductor
  'SOXS', 'SOXX',
  // Inverse ETFs — broad market
  'SQQQ', 'SPXS', 'SDOW', 'SH', 'PSQ',
  'DOG', 'RWM', 'MYY', 'SMDD',
  // Inverse ETFs — sectors
  'LABD', 'DRIP', 'DUST', 'JDST',
  'ERY', 'FAZ', 'SKF', 'SDS',
  // Leveraged long ETFs (distorted Kalman)
  'TQQQ', 'SOXL', 'UPRO', 'SPXL',
  'LABU', 'FNGU', 'TECL', 'BULZ',
  'NAIL', 'WANT', 'WEBL',
  // Speculative — unreliable Kalman fair value
  'SMR',   // NuScale Power — fraud lawsuit
  'RGTI',  // Rigetti Computing — pre-revenue quantum
  'ONDS',  // Ondas Holdings — micro-cap speculative
  'RCAT',  // Red Cat Holdings — micro-cap drones
])
