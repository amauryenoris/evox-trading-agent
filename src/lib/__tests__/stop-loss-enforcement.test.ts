import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { AlpacaPosition } from '../types'
import { enforceStopLosses } from '../stop-loss-enforcement'

const { closePosition, getAllOpenPositionContexts, upsertSymbolCooldown } = vi.hoisted(() => ({
  closePosition: vi.fn(),
  getAllOpenPositionContexts: vi.fn(),
  upsertSymbolCooldown: vi.fn(),
}))

vi.mock('../alpaca', () => ({ closePosition }))
vi.mock('../db', () => ({ getAllOpenPositionContexts }))
vi.mock('../db-cooldowns', () => ({ upsertSymbolCooldown }))

const SYMBOL = 'HLD'
const BUY_PRICE = 100
const COOLDOWN_UNTIL = new Date('2026-11-09T00:00:00.000Z')
const STOP_PRICE = BUY_PRICE * (1 - 0.05)

function positionAt(price: number, symbol = SYMBOL): AlpacaPosition[] {
  return [{ symbol, current_price: String(price) } as unknown as AlpacaPosition]
}

describe('enforceStopLosses', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('STOP_LOSS_PCT', '0.05')
    getAllOpenPositionContexts.mockResolvedValue([{ symbol: SYMBOL, buyPrice: BUY_PRICE }])
    closePosition.mockResolvedValue(undefined)
    upsertSymbolCooldown.mockResolvedValue(undefined)
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    log = vi.spyOn(console, 'log').mockImplementation(() => {})
    error = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('fires at exactly the stop price (<=): closes, writes the cooldown and logs the trigger', async () => {
    // Arrange
    const positions = positionAt(STOP_PRICE)

    // Act
    await enforceStopLosses(positions, COOLDOWN_UNTIL)

    // Assert
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(closePosition).toHaveBeenCalledWith(SYMBOL)
    expect(upsertSymbolCooldown).toHaveBeenCalledWith(SYMBOL, 'STOP_LOSS', COOLDOWN_UNTIL)
    expect(warn).toHaveBeenCalledWith('[enforceStopLosses] Stop triggered: HLD @ $95.00 <= stop $95.00')
  })

  it('does not fire one cent above the stop price: no calls and no log', async () => {
    // Arrange
    const positions = positionAt(STOP_PRICE + 0.01)

    // Act
    await enforceStopLosses(positions, COOLDOWN_UNTIL)

    // Assert
    expect(closePosition).not.toHaveBeenCalled()
    expect(upsertSymbolCooldown).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('closes first and then writes the STOP_LOSS cooldown, logging [COOLDOWN_PERSIST] after it', async () => {
    // Arrange
    const positions = positionAt(94)

    // Act
    await enforceStopLosses(positions, COOLDOWN_UNTIL)

    // Assert
    expect(closePosition.mock.invocationCallOrder[0]).toBeLessThan(upsertSymbolCooldown.mock.invocationCallOrder[0])
    expect(upsertSymbolCooldown.mock.invocationCallOrder[0]).toBeLessThan(log.mock.invocationCallOrder[0])
    expect(warn).toHaveBeenCalledWith('[enforceStopLosses] Stop triggered: HLD @ $94.00 <= stop $95.00')
    expect(log).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith('[COOLDOWN_PERSIST] symbol=HLD reason=STOP_LOSS until=2026-11-09T00:00:00.000Z source=enforceStopLosses')
  })

  it('with a null cooldown date it still closes the position but writes no cooldown and no [COOLDOWN_PERSIST] log', async () => {
    // Arrange
    const positions = positionAt(94)

    // Act
    await enforceStopLosses(positions, null)

    // Assert
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(upsertSymbolCooldown).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(warn.mock.calls).toEqual([['[enforceStopLosses] Stop triggered: HLD @ $94.00 <= stop $95.00']])
  })

  it('when the cooldown write throws after a successful close, it logs "Failed to close" once and closes only once', async () => {
    // Arrange
    const cooldownError = new Error('cooldown boom')
    upsertSymbolCooldown.mockRejectedValue(cooldownError)
    const positions = positionAt(94)

    // Act
    await enforceStopLosses(positions, COOLDOWN_UNTIL)

    // Assert
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(log).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('[enforceStopLosses] Failed to close HLD:', cooldownError)
  })

  it('when closePosition fails, it logs the error and writes no cooldown', async () => {
    // Arrange
    const closeError = new Error('close rejected')
    closePosition.mockRejectedValue(closeError)
    const positions = positionAt(94)

    // Act
    await enforceStopLosses(positions, COOLDOWN_UNTIL)

    // Assert
    expect(upsertSymbolCooldown).not.toHaveBeenCalled()
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('[enforceStopLosses] Failed to close HLD:', closeError)
  })

  it('with STOP_LOSS_PCT unset it falls back to a 5% stop', async () => {
    // Arrange
    vi.stubEnv('STOP_LOSS_PCT', undefined)

    // Act
    await enforceStopLosses(positionAt(94.99), COOLDOWN_UNTIL)
    await enforceStopLosses(positionAt(95.01), COOLDOWN_UNTIL)

    // Assert
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[enforceStopLosses] Stop triggered: HLD @ $94.99 <= stop $95.00')
  })

  it('reads STOP_LOSS_PCT when it is set: a 10% stop does not fire at 94 but fires at 90', async () => {
    // Arrange
    vi.stubEnv('STOP_LOSS_PCT', '0.1')

    // Act
    await enforceStopLosses(positionAt(94), COOLDOWN_UNTIL)
    await enforceStopLosses(positionAt(90), COOLDOWN_UNTIL)

    // Assert
    expect(closePosition).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('[enforceStopLosses] Stop triggered: HLD @ $90.00 <= stop $90.00')
  })

  it('skips a context whose position is no longer in Alpaca: no calls and no log', async () => {
    // Arrange
    const positions = positionAt(94, 'OTHER')

    // Act
    await enforceStopLosses(positions, COOLDOWN_UNTIL)

    // Assert
    expect(closePosition).not.toHaveBeenCalled()
    expect(upsertSymbolCooldown).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
  })

  it('when the first context read fails it logs the CRITICAL error and makes no other call', async () => {
    // Arrange
    const readError = new Error('contexts unavailable')
    getAllOpenPositionContexts.mockRejectedValue(readError)

    // Act
    await enforceStopLosses(positionAt(94), COOLDOWN_UNTIL)

    // Assert
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith('[enforceStopLosses] CRITICAL: Failed to fetch positions — stop losses NOT enforced:', readError)
    expect(closePosition).not.toHaveBeenCalled()
    expect(upsertSymbolCooldown).not.toHaveBeenCalled()
  })

  it('does not mutate the positions array it receives', async () => {
    // Arrange
    const positions = positionAt(94)
    const snapshot = JSON.stringify(positions)

    // Act
    await enforceStopLosses(positions, COOLDOWN_UNTIL)

    // Assert
    expect(JSON.stringify(positions)).toBe(snapshot)
    expect(positions).toHaveLength(1)
  })
})
