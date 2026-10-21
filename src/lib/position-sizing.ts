export const MAX_POSITION_EQUITY_FRACTION = 0.10

// With true, z <= -2.0 discards the confidence step (current behavior). With false the confidence step applies to every entry.
export const Z_SIZING_OVERRIDE_ENABLED = true

const BUYING_POWER_FRACTION = 0.95
const Z_OVERRIDE_THRESHOLD = -2.0
const MIN_CONFIDENCE_FACTOR = 0.50
const MAX_CONFIDENCE_FACTOR = 1.0
const EMA_RECLAIM_SIZE_FACTOR = 0.75
const EMA_RECLAIM_SETUP = 'EMA_RECLAIM'

const REGIME_MULTIPLIERS: Readonly<Record<string, number>> = {
  TRENDING: 1.0,
  TRANSITION: 0.75,
  RANGING: 0.5,
  HIGH_VOLATILITY: 0.25,
}

export function regimeMultiplier(regime: string | null): number {
  return regime ? (REGIME_MULTIPLIERS[regime] ?? 1.0) : 1.0
}

export interface BuyQuantityInput {
  equity: number
  buyingPower: number
  price: number
  riskPct: number
  stopLossPct: number
  kalmanSignal?: string | null
  regime?: string | null
  confidence: number
  zScore: number
  signalType: string | null
  zOverrideEnabled?: boolean
}

export interface BuyQuantityBreakdown {
  baseShares: number
  regimeMultiplier: number
  kalmanHalved: boolean
  buyingPowerCap: number
  equityCap: number
  confidenceFactor: number
  zOverrideApplied: boolean
  setupFactor: number
  adjustedShares: number
  final: number
}

export interface BuyQuantityResult {
  quantity: number
  breakdown: BuyQuantityBreakdown
}

// Kovner 1-2% Rule: risk at most RISK_PCT of equity per trade, quantity = capital at risk / risk per share.
// Regime multiplier first, then undertrade halving without Kalman confirmation, then the caps.
function cappedBaseShares(input: BuyQuantityInput, multiplier: number, isHalved: boolean, buyingPowerCap: number, equityCap: number): number {
  const riskPerShare = input.price * input.stopLossPct
  if (riskPerShare === 0) return 0

  let qty = Math.floor((input.equity * input.riskPct) / riskPerShare)
  qty = Math.floor(qty * multiplier)
  if (isHalved) qty = Math.floor(qty / 2)
  return Math.max(0, Math.min(qty, Math.min(buyingPowerCap, equityCap)))
}

export function computeBuyQuantity(input: BuyQuantityInput): BuyQuantityResult {
  const multiplier = regimeMultiplier(input.regime ?? null)
  const isHalved = !input.kalmanSignal || input.kalmanSignal === 'NEUTRAL'
  const buyingPowerCap = Math.floor((input.buyingPower * BUYING_POWER_FRACTION) / input.price)
  const equityCap = Math.floor((input.equity * MAX_POSITION_EQUITY_FRACTION) / input.price)
  const baseShares = cappedBaseShares(input, multiplier, isHalved, buyingPowerCap, equityCap)

  const confidenceFactor = Math.max(MIN_CONFIDENCE_FACTOR, Math.min(input.confidence, MAX_CONFIDENCE_FACTOR))
  const isZOverrideApplied = (input.zOverrideEnabled ?? Z_SIZING_OVERRIDE_ENABLED) && input.zScore <= Z_OVERRIDE_THRESHOLD
  const adjustedShares = isZOverrideApplied ? baseShares : Math.round(baseShares * confidenceFactor)

  const setupFactor = input.signalType === EMA_RECLAIM_SETUP ? EMA_RECLAIM_SIZE_FACTOR : 1
  const final = input.signalType === EMA_RECLAIM_SETUP ? Math.round(adjustedShares * EMA_RECLAIM_SIZE_FACTOR) : adjustedShares

  return {
    quantity: final,
    breakdown: {
      baseShares,
      regimeMultiplier: multiplier,
      kalmanHalved: isHalved,
      buyingPowerCap,
      equityCap,
      confidenceFactor,
      zOverrideApplied: isZOverrideApplied,
      setupFactor,
      adjustedShares,
      final,
    },
  }
}
