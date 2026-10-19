import type { ProtectiveStopSnapshot } from './types'

export interface ProfitFloorSettings {
  activationPct: number
  floorPct: number
  ratchetPp: number
}

export type ProfitFloorConfig = Readonly<Record<string, ProfitFloorSettings>>

// An empty object is the rollback: no setup gets a profit floor.
export const PROFIT_FLOOR_CONFIG: ProfitFloorConfig = {
  MEAN_REVERSION: { activationPct: 5, floorPct: 3, ratchetPp: 3 },
}

// Trailing activation for the setups that still use the ATR trailing (fractions of entry).
export const TRAILING_ACTIVATION_PCT: Readonly<Record<string, number>> = {
  TREND: 0.06,
  TREND_PULLBACK: 0.06,
  TREND_ZLE05: 0.03,
  EMA_RECLAIM: 0.04,
  TREND_PULLBACK_3DAY: 0.06,
  default: 0.05,
}

// Per-signal-type profit target (fractions) — TREND_ZLE05 trial (see specs/trend-zle05-exit-rules-trial)
export const PROFIT_TARGET_PCT: Readonly<Record<string, number>> = {
  TREND_ZLE05: 0.05,
  default: 0.10,
}

export function getProfitTargetPct(setup?: string | null): number {
  return PROFIT_TARGET_PCT[setup ?? 'default'] ?? PROFIT_TARGET_PCT.default
}

export function getProfitFloorSettings(
  setup: string | null | undefined,
  config: ProfitFloorConfig = PROFIT_FLOOR_CONFIG,
): ProfitFloorSettings | null {
  if (!setup || !Object.prototype.hasOwnProperty.call(config, setup)) return null
  return config[setup]
}

const TICK_SUB_DOLLAR = 0.0001
const TICK_DOLLAR = 0.01
const TICK_EPSILON = 1e-7

export function tickFor(price: number): number {
  return price >= 1 ? TICK_DOLLAR : TICK_SUB_DOLLAR
}

export function roundDownToTick(price: number): number {
  const tick = tickFor(price)
  const decimals = tick === TICK_DOLLAR ? 2 : 4
  return Number((Math.floor(price / tick + TICK_EPSILON) * tick).toFixed(decimals))
}

export function isHigherByTick(next: number, previous: number): boolean {
  return next - previous >= tickFor(next) - TICK_EPSILON * tickFor(next)
}

export type ProtectiveStopAction = 'none' | 'place' | 'replace' | 'sell_now'

export interface ProtectiveStopInput {
  setup: string | null | undefined
  entry: number
  high: number
  current: number
  existingStop: number | null | undefined
}

export interface ProtectiveStopResult {
  active: boolean
  stopPrice: number | null
  action: ProtectiveStopAction
}

const INACTIVE: ProtectiveStopResult = Object.freeze({ active: false, stopPrice: null, action: 'none' })

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

export function computeProtectiveStop(
  input: ProtectiveStopInput,
  config: ProfitFloorConfig = PROFIT_FLOOR_CONFIG,
): ProtectiveStopResult {
  const { setup, entry, high, current, existingStop } = input
  const settings = getProfitFloorSettings(setup, config)
  if (!settings) return INACTIVE
  if (![entry, high, current].every(isPositiveFinite)) return INACTIVE

  const activationLevel = entry * (1 + settings.activationPct / 100)
  if (high < activationLevel * (1 - TICK_EPSILON)) return INACTIVE

  const highPct = (high / entry - 1) * 100
  const floorPct = Math.max(settings.floorPct, highPct - settings.ratchetPp)
  const rounded = roundDownToTick(entry * (1 + floorPct / 100))

  const hasExisting = typeof existingStop === 'number' && Number.isFinite(existingStop)
  const stopPrice = hasExisting ? Math.max(rounded, existingStop) : rounded

  if (current <= stopPrice) return { active: true, stopPrice, action: 'sell_now' }
  if (!hasExisting) return { active: true, stopPrice, action: 'place' }
  if (isHigherByTick(rounded, existingStop)) return { active: true, stopPrice, action: 'replace' }
  return { active: true, stopPrice, action: 'none' }
}

export function buildProtectiveStopSnapshot(params: {
  setup: string | null | undefined
  entry: number
  high: number
  stopPrice: number
  stopOrderId: string | null
  activatedAt: string
}): ProtectiveStopSnapshot | null {
  const settings = getProfitFloorSettings(params.setup)
  if (!settings) return null
  return {
    design: 'R',
    activationPct: settings.activationPct,
    floorPct: settings.floorPct,
    ratchetPp: settings.ratchetPp,
    activatedAt: params.activatedAt,
    highPct: (params.high / params.entry - 1) * 100,
    stopPrice: params.stopPrice,
    stopOrderId: params.stopOrderId,
  }
}
