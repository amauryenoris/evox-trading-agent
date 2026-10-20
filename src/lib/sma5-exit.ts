export const TREND_3DAY_ABOVE_SMA5_PREFIX = 'TREND_3DAY_ABOVE_SMA5'

export type Sma5GateState = 'allowed' | 'blocked' | 'sma5_unusable'

// The one SMA5 comparison shared by the TREND_PULLBACK_3DAY exit and its entry gate.
// Strict ">" on purpose: equality does not fire the exit, so it is not blocked at entry either.
export function isSma5ExitConditionMet(price: number, sma5: number | null | undefined): boolean {
  return sma5 != null && price > sma5
}

export function evaluateSma5EntryGate(price: number, sma5: number | null | undefined): Sma5GateState {
  if (sma5 == null || !Number.isFinite(sma5)) return 'sma5_unusable'
  return isSma5ExitConditionMet(price, sma5) ? 'blocked' : 'allowed'
}

export function buildTrend3DayAboveSma5Reason(price: number, sma5: number | null | undefined): string {
  return `${TREND_3DAY_ABOVE_SMA5_PREFIX}: price $${price.toFixed(2)} >= SMA5 $${sma5?.toFixed(2) ?? 'NA'} (3DAY exit would fire immediately)`
}
