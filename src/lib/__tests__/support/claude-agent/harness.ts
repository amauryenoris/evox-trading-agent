import { afterEach, beforeEach, vi } from 'vitest'
import { world } from './mocks'
import { PINS } from './world'

const ENV = {
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  ALPACA_API_KEY: 'test-alpaca-key',
  RISK_PCT: '0.01',
  STOP_LOSS_PCT: '0.05',
  MAX_POSITIONS: '5',
  MAX_POSITION_SIZE: '0.10',
  TZ: 'UTC',
}
const TIMER_STEP_MS = 2000
const MAX_PUMP_ROUNDS = 100

export { world }

// Fake timers are advanced while the cycle runs, so retry delays inside the production code cost no real time.
export async function pump<T>(promise: Promise<T>): Promise<T> {
  let isDone = false
  const tracked = promise.finally(() => { isDone = true })
  for (let round = 0; !isDone; round++) {
    if (round >= MAX_PUMP_ROUNDS) throw new Error('runAgentCycle did not settle within the pump budget')
    await vi.advanceTimersByTimeAsync(TIMER_STEP_MS)
  }
  return tracked
}

export function installHarness(): void {
  const saved: Record<string, string | undefined> = {}

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) { saved[key] = process.env[key]; process.env[key] = value }
    delete process.env.TRADING_WATCHLIST
    vi.useFakeTimers()
    vi.setSystemTime(new Date(PINS.nowIso))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    world.reset()
  })

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
}
