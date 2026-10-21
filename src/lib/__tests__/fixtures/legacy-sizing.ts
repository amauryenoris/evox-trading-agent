// Frozen verbatim copy of the sizing code as it stood in claude-agent.ts before the position-sizing refactor
// (regimeMultiplier, calculateBuyQuantity and the confidence / z-override / EMA steps of the sizing block).
// Used only as the reference implementation for the differential and golden tests. Do not edit.

export function legacyRegimeMultiplier(regime: string | null): number {
  const map: Record<string, number> = {
    TRENDING: 1.0,
    TRANSITION: 0.75,
    RANGING: 0.5,
    HIGH_VOLATILITY: 0.25,
  }
  return regime ? (map[regime] ?? 1.0) : 1.0
}

export function legacyCalculateBuyQuantity(
  currentPrice: number,
  portfolioEquity: number,
  availableCash: number,
  kalmanSignal?: string,
  marketRegime?: string | null
): number {
  const riskPct = parseFloat(process.env.RISK_PCT ?? '0.01')
  const stopLossPct = parseFloat(process.env.STOP_LOSS_PCT ?? '0.05')

  const capitalAtRisk = portfolioEquity * riskPct
  const riskPerShare = currentPrice * stopLossPct
  if (riskPerShare === 0) return 0

  let qty = Math.floor(capitalAtRisk / riskPerShare)

  const regimeMult = legacyRegimeMultiplier(marketRegime ?? null)
  qty = Math.floor(qty * regimeMult)

  if (!kalmanSignal || kalmanSignal === 'NEUTRAL') {
    qty = Math.floor(qty / 2)
  }

  const maxAffordable = Math.floor((availableCash * 0.95) / currentPrice)
  const maxByEquity = Math.floor((portfolioEquity * 0.10) / currentPrice)
  return Math.max(0, Math.min(qty, Math.min(maxAffordable, maxByEquity)))
}

export interface LegacySizingInput {
  price: number
  equity: number
  buyingPower: number
  kalmanSignal?: string
  regime?: string | null
  confidence: number
  zScore: number
  signalType: string | null
}

export function legacyBuyQuantity(i: LegacySizingInput): { baseShares: number; adjustedShares: number; qty: number } {
  const baseShares = legacyCalculateBuyQuantity(i.price, i.equity, i.buyingPower, i.kalmanSignal, i.regime)
  const confidenceMultiplier = Math.max(0.50, Math.min(i.confidence, 1.0))
  let adjustedShares = Math.round(baseShares * confidenceMultiplier)
  if (i.zScore <= -2.0) {
    adjustedShares = baseShares
  }
  const emaReclaimMultiplier = 0.75
  let finalShares = adjustedShares
  if (i.signalType === 'EMA_RECLAIM') {
    finalShares = Math.round(adjustedShares * emaReclaimMultiplier)
  }
  return { baseShares, adjustedShares, qty: finalShares }
}
