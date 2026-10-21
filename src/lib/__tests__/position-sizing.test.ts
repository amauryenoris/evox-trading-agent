import { describe, it, expect, afterEach } from 'vitest'
import {
  computeBuyQuantity,
  regimeMultiplier,
  MAX_POSITION_EQUITY_FRACTION,
  Z_SIZING_OVERRIDE_ENABLED,
  type BuyQuantityInput,
} from '../position-sizing'
import { legacyBuyQuantity, legacyRegimeMultiplier } from './fixtures/legacy-sizing'
import golden from './fixtures/position-sizing-golden.json'

interface GoldenEntry {
  symbol: string
  date: string
  setup: string | null
  equity: number
  buyingPower: number
  price: number
  regime: string | null
  kalmanSignal: string | null
  zScore: number
  confidence: number
  requestedQty: number
}

const ORIGINAL_ENV = { risk: process.env.RISK_PCT, stop: process.env.STOP_LOSS_PCT }

afterEach(() => {
  if (ORIGINAL_ENV.risk === undefined) delete process.env.RISK_PCT
  else process.env.RISK_PCT = ORIGINAL_ENV.risk
  if (ORIGINAL_ENV.stop === undefined) delete process.env.STOP_LOSS_PCT
  else process.env.STOP_LOSS_PCT = ORIGINAL_ENV.stop
})

function base(overrides: Partial<BuyQuantityInput> = {}): BuyQuantityInput {
  return {
    equity: 106_719.72,
    buyingPower: 400_000,
    price: 42.545,
    riskPct: 0.01,
    stopLossPct: 0.05,
    kalmanSignal: 'MEAN_REVERSION_LONG',
    regime: 'TRANSITION',
    confidence: 0.38,
    zScore: -3.24,
    signalType: 'MEAN_REVERSION',
    ...overrides,
  }
}

describe('constants', () => {
  it('keeps the cap at 10% of equity and the z override on', () => {
    expect(MAX_POSITION_EQUITY_FRACTION).toBe(0.10)
    expect(Z_SIZING_OVERRIDE_ENABLED).toBe(true)
  })
})

describe('golden quantities from the production entries (switch true)', () => {
  it.each((golden as GoldenEntry[]).map((g) => [`${g.symbol} ${g.date}`, g] as const))('%s', (_name, g) => {
    // Arrange
    const input: BuyQuantityInput = {
      equity: g.equity,
      buyingPower: g.buyingPower,
      price: g.price,
      riskPct: 0.01,
      stopLossPct: 0.05,
      kalmanSignal: g.kalmanSignal,
      regime: g.regime,
      confidence: g.confidence,
      zScore: g.zScore,
      signalType: g.setup,
    }

    // Act
    const { quantity } = computeBuyQuantity(input)

    // Assert
    expect(quantity).toBe(g.requestedQty)
  })
})

describe('differential check against the frozen pre-refactor code (switch true)', () => {
  it('returns identical quantities and intermediate values over a large input grid', () => {
    // Arrange
    const equities = [50_000, 106_719.72, 250_000]
    const prices = [0.5, 8.435, 42.545, 218.074, 1500]
    const buyingPowers = [(e: number) => e * 4, () => 500, () => 0]
    const kalmans: Array<string | undefined | null> = [undefined, null, 'NEUTRAL', 'MEAN_REVERSION_LONG', 'EXIT_LONG']
    const regimes: Array<string | null | undefined> = [null, undefined, 'TRENDING', 'TRANSITION', 'RANGING', 'HIGH_VOLATILITY', 'UNKNOWN']
    const confidences = [0, 0.28, 0.38, 0.5, 0.52, 0.99, 1, 1.7, Number.NaN]
    const zs = [-5, -2.0001, -2, -1.9999, 0, 1.3]
    const setups: Array<string | null> = [null, 'MEAN_REVERSION', 'EMA_RECLAIM']
    const envs: Array<[string, string]> = [['0.01', '0.05'], ['0.02', '0.03']]
    let checked = 0

    for (const [risk, stop] of envs) {
      process.env.RISK_PCT = risk
      process.env.STOP_LOSS_PCT = stop
      for (const equity of equities) for (const price of prices) for (const bp of buyingPowers)
        for (const kalman of kalmans) for (const regime of regimes)
          for (const confidence of confidences) for (const zScore of zs) for (const signalType of setups) {
            const buyingPower = bp(equity)
            const legacy = legacyBuyQuantity({ price, equity, buyingPower, kalmanSignal: kalman ?? undefined, regime, confidence, zScore, signalType })

            // Act
            const result = computeBuyQuantity({
              equity, buyingPower, price, riskPct: parseFloat(risk), stopLossPct: parseFloat(stop),
              kalmanSignal: kalman, regime, confidence, zScore, signalType,
            })

            // Assert
            const same =
              Object.is(result.quantity, legacy.qty) &&
              Object.is(result.breakdown.baseShares, legacy.baseShares) &&
              Object.is(result.breakdown.adjustedShares, legacy.adjustedShares)
            if (!same) {
              throw new Error(`mismatch: ${JSON.stringify({ equity, price, buyingPower, kalman, regime, confidence, zScore, signalType, risk, stop, legacy, result })}`)
            }
            checked++
          }
    }
    expect(checked).toBeGreaterThan(100_000)
  })
})

describe('switch false', () => {
  it('applies the confidence step to z <= -2 entries: round(cappedBase x 0.5) at confidence 0.38', () => {
    // MP 2026-10-13: capped base 250, confidence 0.38 -> factor 0.5
    const { quantity, breakdown } = computeBuyQuantity(base({ zOverrideEnabled: false }))

    expect(breakdown.baseShares).toBe(250)
    expect(quantity).toBe(Math.round(250 * 0.5))
    expect(breakdown.zOverrideApplied).toBe(false)
  })

  it('leaves entries above the z threshold exactly as with the switch on', () => {
    const input = base({ zScore: -1.5, confidence: 0.7 })

    expect(computeBuyQuantity({ ...input, zOverrideEnabled: false }).quantity)
      .toBe(computeBuyQuantity({ ...input, zOverrideEnabled: true }).quantity)
  })
})

describe('individual rules', () => {
  it.each([
    ['TRENDING', 1.0],
    ['TRANSITION', 0.75],
    ['RANGING', 0.5],
    ['HIGH_VOLATILITY', 0.25],
    ['SOMETHING_ELSE', 1.0],
    [null, 1.0],
  ])('regime %s multiplies by %s', (regime, expected) => {
    expect(regimeMultiplier(regime)).toBe(expected)
    expect(regimeMultiplier(regime)).toBe(legacyRegimeMultiplier(regime))
  })

  it('halves the quantity when the Kalman signal is NEUTRAL or missing', () => {
    // RANGING (0.5x) on $100,000 at $100: 200 shares -> 100 after the regime; halving gives 50, below the 100-share cap
    const common = { regime: 'RANGING', zScore: 0, confidence: 1, equity: 100_000, buyingPower: 1e9, price: 100 }
    const confirmed = computeBuyQuantity(base(common))
    const neutral = computeBuyQuantity(base({ ...common, kalmanSignal: 'NEUTRAL' }))
    const missing = computeBuyQuantity(base({ ...common, kalmanSignal: undefined }))

    expect(confirmed.breakdown.kalmanHalved).toBe(false)
    expect(neutral.breakdown.kalmanHalved).toBe(true)
    expect(missing.breakdown.kalmanHalved).toBe(true)
    expect(confirmed.breakdown.baseShares).toBe(100)
    expect(neutral.breakdown.baseShares).toBe(50)
    expect(missing.breakdown.baseShares).toBe(50)
  })

  it('caps the quantity at 10% of equity', () => {
    const { breakdown } = computeBuyQuantity(base({ regime: 'TRENDING', equity: 100_000, price: 50, buyingPower: 1e9 }))

    expect(breakdown.equityCap).toBe(200)
    expect(breakdown.baseShares).toBe(200)
  })

  it('caps the quantity at 95% of buying power', () => {
    const { breakdown } = computeBuyQuantity(base({ regime: 'TRENDING', equity: 100_000, price: 50, buyingPower: 1_000 }))

    expect(breakdown.buyingPowerCap).toBe(Math.floor((1_000 * 0.95) / 50))
    expect(breakdown.baseShares).toBe(19)
  })

  it('applies the 0.5 minimum to the confidence factor and never exceeds 1', () => {
    expect(computeBuyQuantity(base({ confidence: 0.1, zScore: 0 })).breakdown.confidenceFactor).toBe(0.5)
    expect(computeBuyQuantity(base({ confidence: 3, zScore: 0 })).breakdown.confidenceFactor).toBe(1)
    expect(computeBuyQuantity(base({ confidence: 0.62, zScore: 0 })).breakdown.confidenceFactor).toBe(0.62)
  })

  it('applies the EMA_RECLAIM factor of 0.75 with rounding', () => {
    const tsla = { regime: 'RANGING', kalmanSignal: 'EXIT_LONG', confidence: 0.28, zScore: -0.08, equity: 106_898.9, price: 367.285 }
    const plain = computeBuyQuantity(base({ ...tsla, signalType: 'TREND_PULLBACK' }))
    const ema = computeBuyQuantity(base({ ...tsla, signalType: 'EMA_RECLAIM' }))

    expect(plain.breakdown.setupFactor).toBe(1)
    expect(ema.breakdown.setupFactor).toBe(0.75)
    expect(ema.quantity).toBe(Math.round(plain.quantity * 0.75))
    expect(ema.quantity).toBe(11)
  })

  it('returns zero when the risk per share is zero', () => {
    expect(computeBuyQuantity(base({ stopLossPct: 0 })).quantity).toBe(0)
    expect(computeBuyQuantity(base({ price: 0 })).quantity).toBe(0)
  })

  it('never returns a negative base quantity', () => {
    expect(computeBuyQuantity(base({ buyingPower: -1_000 })).breakdown.baseShares).toBe(0)
  })

  it('lets a non-finite confidence propagate as before (no new guard)', () => {
    const { quantity } = computeBuyQuantity(base({ confidence: Number.NaN, zScore: 0 }))

    expect(Number.isNaN(quantity)).toBe(true)
  })
})

describe('breakdown', () => {
  it('reports every step for MP 2026-10-13', () => {
    const { quantity, breakdown } = computeBuyQuantity(base())

    expect(breakdown).toEqual({
      baseShares: 250,
      regimeMultiplier: 0.75,
      kalmanHalved: false,
      buyingPowerCap: Math.floor((400_000 * 0.95) / 42.545),
      equityCap: 250,
      confidenceFactor: 0.5,
      zOverrideApplied: true,
      setupFactor: 1,
      adjustedShares: 250,
      final: 250,
    })
    expect(quantity).toBe(breakdown.final)
  })
})

describe('purity', () => {
  it('returns the same output for the same input and does not mutate it', () => {
    const input = Object.freeze(base())

    const first = computeBuyQuantity(input)
    const second = computeBuyQuantity(input)

    expect(second).toEqual(first)
    expect(input).toEqual(base())
  })

  it('does not read the environment', () => {
    const input = base()
    const before = computeBuyQuantity(input).quantity

    process.env.RISK_PCT = '0.5'
    process.env.STOP_LOSS_PCT = '0.001'

    expect(computeBuyQuantity(input).quantity).toBe(before)
  })
})
