import { describe, it, expect, vi } from 'vitest'
import { pump, installHarness, world } from './support/claude-agent/harness'
import { buildRecord, claudeCallAt, promptAt } from './support/claude-agent/record'
import { context, emaReclaimIndicators, kalman, makeIndicators, mrIndicators, position, quote, trend3DayIndicators, trendPullbackIndicators, trendZle05Indicators } from './support/claude-agent/builders'
import { PINS, claudeJson, defaultAccount, makeOrder } from './support/claude-agent/world'
import { runAgentCycle } from '../claude-agent'
import type { AlpacaOrder } from '../types'

// Goldens were generated once from the current code. Do not regenerate them to make a failing run pass:
// a changed golden means the behaviour changed and must be reviewed as such.
const GOLDEN = './__golden__/claude-agent'
const SYMBOL = 'AAA'

installHarness()

async function runAndRecord(): Promise<{ record: string; result: Awaited<ReturnType<typeof runAgentCycle>> }> {
  const result = await pump(runAgentCycle())
  return { record: buildRecord(world, result), result }
}

function callHeader(): string {
  return `CLAUDE CALL PARAMS ${JSON.stringify(claudeCallAt(world), null, 2)}`
}

function heldIndicators(zScore: number) {
  return makeIndicators({ kalman: kalman(zScore), ema50: 95, ema200: 90 })
}

describe('entries', () => {
  it('(a) MEAN_REVERSION BUY, z <= -2 with the sizing override pinned off: the confidence factor halves the size', async () => {
    world.reset({ watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() }, claude: () => claudeJson(0.32) })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/a-mean-reversion-buy.json`)
    const prompt = promptAt(world)
    await expect(`${callHeader()}\n\n${prompt?.system}\n\n----- USER -----\n${prompt?.user}\n`).toMatchFileSnapshot(`${GOLDEN}/a-mean-reversion-buy.prompt.txt`)
  })

  it('(a) auto-entry BUY: QUIRK entryLogId passed to markWatchlistTriggered never equals the persisted log entry id', async () => {
    world.reset({ watchlist: [SYMBOL], autoEntry: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() }, claude: () => claudeJson(0.6) })

    const { record, result } = await runAndRecord()

    const marked = world.calls.find((c) => c.fn === 'watchlist.markTriggered')
    expect(marked).toBeDefined()
    expect(result.decisions.map((d) => d.id)).not.toContain(marked?.args.entryLogId)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/a-auto-entry-buy.json`)
  })

  it('(b) TREND_PULLBACK_3DAY BUY', async () => {
    world.reset({
      watchlist: [SYMBOL], indicators: { [SYMBOL]: trend3DayIndicators() },
      quotes: { [SYMBOL]: quote({ bid: 99.95, ask: 100 }) }, claude: () => claudeJson(0.7),
    })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/b-trend-pullback-3day-buy.json`)
    const prompt = promptAt(world)
    await expect(`${callHeader()}\n\n${prompt?.user}\n`).toMatchFileSnapshot(`${GOLDEN}/b-trend-pullback-3day-buy.prompt.txt`)
  })

  it('(m) MEAN_REVERSION BUY with non-default env values: the prompt, the quantity and the stop price use them', async () => {
    world.reset({ watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() }, claude: () => claudeJson(0.32) })
    process.env.MAX_POSITIONS = '7'
    process.env.MAX_POSITION_SIZE = '0.20'
    process.env.STOP_LOSS_PCT = '0.07'

    const { record } = await runAndRecord()

    // QUIRK: MAX_POSITION_SIZE only changes the prompt text; the order quantity is capped by the fixed 10% equity constant.
    const text = promptAt(world)?.user ?? ''
    expect(text).toContain('Open Positions: 0/7')
    expect(text).toContain('Max Position Value Allowed: $20000.00')
    expect(text).toContain('Max Position Size: 20% of equity ($20000.00)')
    expect(text).toContain('Stop Loss: 7% below entry')
    expect(text).toContain('Max Simultaneous Positions: 7')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/m-non-default-env-buy.json`)
    await expect(`${callHeader()}\n\n${text}\n`).toMatchFileSnapshot(`${GOLDEN}/m-non-default-env-buy.prompt.txt`)
  })

  it('(l) ranking with one free slot: the z <= -2 candidate wins and the other is logged as outranked', async () => {
    const held = ['P1', 'P2', 'P3', 'P4']
    world.reset({
      watchlist: [SYMBOL, 'BBB'],
      positions: held.map((s) => position(s)),
      contexts: held.map((s) => context(s)),
      indicators: {
        P1: heldIndicators(-1), P2: heldIndicators(-1), P3: heldIndicators(-1), P4: heldIndicators(-1),
        [SYMBOL]: mrIndicators(), BBB: mrIndicators({ kalman: kalman(-1.6, 'MEAN_REVERSION_LONG') }),
      },
      quotes: { [SYMBOL]: quote(), BBB: quote() },
    })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/l-ranking-one-slot.json`)
  })

  it('(k) IOC zero fill: the buy is not executed and no stop or context is written', async () => {
    world.reset({ watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() }, fill: { [SYMBOL]: 'zero' } })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/k-ioc-zero-fill.json`)
  })
})

describe('Claude API call parameters (read from the mocked client)', () => {
  const EXPECTED_PARAM_KEYS = ['max_tokens', 'messages', 'model', 'system']

  function arrangeSingleSymbol(): void {
    world.reset({ watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() } })
  }

  it.each([
    ['model', (c: Record<string, unknown>) => c.model, 'claude-sonnet-4-6'],
    ['max_tokens', (c: Record<string, unknown>) => c.maxTokens, 1024],
    ['parameter keys (no temperature, tools or other)', (c: Record<string, unknown>) => c.paramKeys, EXPECTED_PARAM_KEYS],
    ['extra parameters beyond model, max_tokens, system, messages', (c: Record<string, unknown>) => c.extraParams, {}],
    ['message roles (a single user message)', (c: Record<string, unknown>) => c.messageRoles, ['user']],
    ['system prompt is passed as a string in the system field', (c: Record<string, unknown>) => c.systemIsString, true],
  ])('%s', async (_name, pick, expected) => {
    arrangeSingleSymbol()

    await runAndRecord()

    expect(pick(claudeCallAt(world) as Record<string, unknown>)).toEqual(expected)
  })

  it('keeps the system prompt separate from the user message (user text is not in the system field)', async () => {
    arrangeSingleSymbol()

    await runAndRecord()

    const prompt = promptAt(world)
    expect(prompt?.system.length).toBeGreaterThan(0)
    expect(prompt?.system).not.toContain('ANALYSIS REQUEST')
    expect(prompt?.user).toContain(`ANALYSIS REQUEST: ${SYMBOL}`)
  })

  it('calls Claude exactly once per analysed symbol', async () => {
    world.reset({
      watchlist: [SYMBOL, 'BBB'], indicators: { [SYMBOL]: mrIndicators(), BBB: mrIndicators() }, quotes: { [SYMBOL]: quote(), BBB: quote() },
    })

    await runAndRecord()

    expect(world.calls.filter((c) => c.fn === 'claude.create')).toHaveLength(2)
  })
})

describe('holds', () => {
  it('(c) HOLD by MR_RANGING_ADX_GATE: Claude is never called', async () => {
    world.reset({ watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators({ adx: 12 }) }, quotes: { [SYMBOL]: quote() } })

    const { record } = await runAndRecord()

    expect(world.calls.some((c) => c.fn === 'claude.create')).toBe(false)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/c-mr-ranging-adx-gate.json`)
  })

  it('(d) HOLD by the spread gate: Claude runs first, no order is sent', async () => {
    world.reset({ watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote({ spreadBps: 150 }) } })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/d-spread-gate.json`)
  })

  it('(e) HOLD by EARNINGS_BLOCK: blocked before Claude is called', async () => {
    world.reset({
      watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() },
      earnings: { [SYMBOL]: { reportDate: '2026-11-05', session: 'BMO' } },
    })

    const { record } = await runAndRecord()

    expect(world.calls.some((c) => c.fn === 'claude.create')).toBe(false)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/e-earnings-block.json`)
  })

  it('(f) rejection by the risk manager: HOLD with the manager reason, no order', async () => {
    world.reset({
      watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() },
      risk: { allowed: false, reason: 'Portfolio risk gate: drawdown limit reached' },
    })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/f-risk-manager-rejection.json`)
  })
})

describe('exits and rotation', () => {
  it('(g) SELL by the exit rules: z-score reverted to fair value on a MEAN_REVERSION position', async () => {
    world.reset({
      positions: [position('HLD', { unrealized_plpc: '0.02', current_price: '102' })],
      contexts: [context('HLD', { signalType: 'MEAN_REVERSION' })],
      indicators: { HLD: makeIndicators({ kalman: kalman(-0.4, 'EXIT_LONG'), ema50: 95, ema200: 90 }) },
    })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/g-exit-sell.json`)
  })

  it('(h) rotation close: QUIRK context is not removed, no cooldown is written, and the freed slot is not refreshed', async () => {
    const held = ['P1', 'P2', 'P3', 'P4', 'P5']
    world.reset({
      watchlist: [SYMBOL],
      positions: held.map((s) => position(s)),
      contexts: held.map((s) => context(s)),
      indicators: {
        P1: heldIndicators(-0.2), P2: heldIndicators(-1), P3: heldIndicators(-1), P4: heldIndicators(-1), P5: heldIndicators(-1),
        [SYMBOL]: mrIndicators(),
      },
      quotes: { [SYMBOL]: quote() },
    })

    const { record } = await runAndRecord()

    expect(world.calls.some((c) => c.fn === 'closePosition' && c.args.symbol === 'P1')).toBe(true)
    expect(world.calls.some((c) => c.fn === 'db.deleteOpenPositionContext' && c.args.symbol === 'P1')).toBe(false)
    expect(world.calls.some((c) => c.fn === 'cooldown.upsert' && c.args.symbol === 'P1')).toBe(false)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/h-rotation-close.json`)
  })
})

describe('boundaries and errors', () => {
  it('(i) no candidates and no open positions: persists an empty batch', async () => {
    world.reset({ watchlist: [] })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/i-no-candidates.json`)
  })

  it('(i) market closed with no open positions: early return, nothing persisted', async () => {
    world.reset({ watchlist: [SYMBOL], marketOpen: false })

    const { record } = await runAndRecord()

    await expect(record).toMatchFileSnapshot(`${GOLDEN}/i-market-closed.json`)
  })

  it('(j) Claude API error on one symbol and a broker order error on another', async () => {
    world.reset({
      watchlist: [SYMBOL, 'BBB'],
      indicators: { [SYMBOL]: mrIndicators(), BBB: mrIndicators() },
      quotes: { [SYMBOL]: quote(), BBB: quote() },
      claude: (prompt) => { if (prompt.includes(SYMBOL)) throw new Error('claude boom'); return claudeJson(0.6) },
      orderError: { BBB: 'broker rejected the order' },
    })

    const { record, result } = await runAndRecord()

    // QUIRK: decision.action is set to 'BUY' before the order is submitted, so a rejected order is persisted as a BUY with orderExecuted=false.
    const rejected = result.decisions.find((d) => d.symbol === 'BBB')
    expect(rejected?.decision.action).toBe('BUY')
    expect(rejected?.orderExecuted).toBe(false)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/j-claude-and-broker-errors.json`)
  })
})

const END_OF_TRADING_DAY = '2026-11-04T21:00:00.000Z'
const NEXT_TRADING_DAY_1 = '2026-11-05T00:00:00.000Z'
const NEXT_TRADING_DAY_3 = '2026-11-09T00:00:00.000Z'
const GHOST = 'GHO'

function upserts() {
  return world.calls.filter((c) => c.fn === 'cooldown.upsert').map((c) => c.args)
}

function ghostSellOrder(id: string, filledAvgPrice: string) {
  return { [GHOST]: { id, filledAvgPrice, filledAt: PINS.nowIso } }
}

describe('ghost-close (a position that left Alpaca while its context row is still open)', () => {
  it('(n) loss: evaluates the trade, removes the context, logs ghost_close and writes a STOP_LOSS cooldown', async () => {
    world.reset({
      contexts: [context(GHOST, { buyPrice: 100 })],
      sellOrders: ghostSellOrder('sell-gho', '90'),
    })

    const { record, result } = await runAndRecord()

    expect(result.evaluations).toHaveLength(1)
    expect(world.calls.some((c) => c.fn === 'db.deleteOpenPositionContext' && c.args.symbol === GHOST)).toBe(true)
    expect(upserts()).toEqual([{ symbol: GHOST, reason: 'STOP_LOSS', until: NEXT_TRADING_DAY_3 }])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/n-ghost-close-loss.json`)
  })

  it('(o) loss with an existing cooldown: COOLDOWN_SKIP, no second cooldown write', async () => {
    world.reset({
      contexts: [context(GHOST, { buyPrice: 100 })],
      sellOrders: ghostSellOrder('sell-gho', '90'),
      activeCooldowns: [{ symbol: GHOST, exit_reason: 'Z_SCORE_EXIT', cooldown_until: END_OF_TRADING_DAY }],
    })

    const { record, result } = await runAndRecord()

    expect(result.evaluations).toHaveLength(1)
    expect(upserts()).toEqual([])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/o-ghost-close-loss-existing-cooldown.json`)
  })

  it('(p) profit confirmed as the trailing stop order: TRAILING_STOP cooldown until the next trading day', async () => {
    world.reset({
      contexts: [context(GHOST, { buyPrice: 100, trailingStopOrderId: 'trail-gho' })],
      sellOrders: ghostSellOrder('trail-gho', '110'),
    })

    const { record } = await runAndRecord()

    expect(upserts()).toEqual([{ symbol: GHOST, reason: 'TRAILING_STOP', until: NEXT_TRADING_DAY_1 }])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/p-ghost-close-profit-trailing-confirmed.json`)
  })

  it("(q) QUIRK: profit not confirmed as trailing is written as 'GHOST_CLOSE_PROFIT', which is not an ExitReason, until the end of the day", async () => {
    world.reset({
      contexts: [context(GHOST, { buyPrice: 100, trailingStopOrderId: 'trail-gho' })],
      sellOrders: ghostSellOrder('some-other-sell', '110'),
    })

    const { record } = await runAndRecord()

    expect(upserts()).toEqual([{ symbol: GHOST, reason: 'GHOST_CLOSE_PROFIT', until: END_OF_TRADING_DAY }])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/q-ghost-close-profit-not-confirmed.json`)
  })

  it('(r) already evaluated by the exit rules: audit trail only, no second evaluation and no outcome recorded', async () => {
    world.reset({
      contexts: [context(GHOST, { buyPrice: 100 })],
      sellOrders: ghostSellOrder('sell-gho', '90'),
      evaluatedTrades: [GHOST],
    })

    const { record, result } = await runAndRecord()

    expect(result.evaluations).toHaveLength(0)
    expect(world.calls.some((c) => c.fn === 'learning.evaluateClosedTrade')).toBe(false)
    expect(world.calls.some((c) => c.fn === 'selector.recordOutcome')).toBe(false)
    expect(world.calls.some((c) => c.fn === 'db.deleteOpenPositionContext' && c.args.symbol === GHOST)).toBe(true)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/r-ghost-close-already-evaluated.json`)
  })
})

describe('re-entry protection', () => {
  it('(s) a symbol closed by ghost-close this cycle is skipped with GTC_STOP: no Claude call and no order', async () => {
    world.reset({
      watchlist: [GHOST],
      contexts: [context(GHOST, { buyPrice: 100 })],
      sellOrders: ghostSellOrder('sell-gho', '90'),
      indicators: { [GHOST]: mrIndicators() },
      quotes: { [GHOST]: quote() },
    })

    const { record } = await runAndRecord()

    expect(world.calls.some((c) => c.fn === 'claude.create')).toBe(false)
    expect(world.calls.some((c) => c.fn === 'submitLimitOrder')).toBe(false)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/s-gtc-stop-reentry-skip.json`)
  })

  it('(t) a watchlist symbol with an active persistent cooldown is skipped: no Claude call and no order', async () => {
    world.reset({
      watchlist: [SYMBOL],
      indicators: { [SYMBOL]: mrIndicators() },
      quotes: { [SYMBOL]: quote() },
      activeCooldowns: [{ symbol: SYMBOL, exit_reason: 'STOP_LOSS', cooldown_until: NEXT_TRADING_DAY_3 }],
    })

    const { record } = await runAndRecord()

    expect(world.calls.some((c) => c.fn === 'claude.create')).toBe(false)
    expect(world.calls.some((c) => c.fn === 'submitLimitOrder')).toBe(false)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/t-persistent-cooldown-skip.json`)
  })
})

const HELD = 'HLD'

function heldAt(currentPrice: number, plpc: string) {
  return position(HELD, { current_price: String(currentPrice), unrealized_plpc: plpc })
}

function callsOf(fn: string) {
  return world.calls.filter((c) => c.fn === fn).map((c) => c.args)
}

describe('MEAN_REVERSION profit floor', () => {
  // High +6% -> floor max(3%, 6% - 3pp) = 3% -> stop 103. Held price 105 is above it.
  const mrHeld = () => context(HELD, { signalType: 'MEAN_REVERSION', highSinceEntry: 106 })

  it('(u) activation at a +6% high: cancels the Capa A stop, submits the floor stop and persists the snapshot', async () => {
    world.reset({
      positions: [heldAt(105, '0.05')],
      contexts: [mrHeld()],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record } = await runAndRecord()

    expect(callsOf('cancelOrder')).toEqual([{ orderId: `stop-${HELD}` }])
    expect(callsOf('submitStopOrder')).toEqual([{ symbol: HELD, qty: 10, stopPrice: 103, side: 'sell', type: 'stop' }])
    expect(callsOf('db.updatePositionProtectiveStop')).toHaveLength(1)
    expect(callsOf('closePosition')).toEqual([])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/u-profit-floor-activation.json`)
  })

  it('(v) price already at or below the computed floor: sells instead of replacing the stop', async () => {
    world.reset({
      positions: [heldAt(102, '0.02')],
      contexts: [mrHeld()],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record } = await runAndRecord()

    expect(callsOf('closePosition')).toEqual([{ symbol: HELD, side: 'sell', type: 'market_close' }])
    expect(callsOf('cancelOrder')).toEqual([])
    expect(callsOf('submitStopOrder')).toEqual([])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/v-profit-floor-sell-now.json`)
  })

  it('(w1) the cancel of the old stop fails: no new stop, naked-stop alert logged, position kept', async () => {
    world.reset({
      positions: [heldAt(105, '0.05')],
      contexts: [mrHeld()],
      indicators: { [HELD]: heldIndicators(-1) },
      cancelErrors: { [`stop-${HELD}`]: 'cancel rejected' },
    })

    const { record } = await runAndRecord()

    expect(callsOf('cancelOrder')).toEqual([{ orderId: `stop-${HELD}` }])
    expect(callsOf('submitStopOrder')).toEqual([])
    expect(callsOf('db.insertAgentLogEntry').some((e) => e.error === 'trailing_stop_naked')).toBe(true)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/w1-profit-floor-cancel-failed.json`)
  })

  it('(w2) QUIRK: the cancel succeeds but the new stop fails twice; the position is left naked, the alert is logged, yet the context is still marked trailingActivated with the floor price and a snapshot with stopOrderId null is persisted', async () => {
    world.reset({
      positions: [heldAt(105, '0.05')],
      contexts: [mrHeld()],
      indicators: { [HELD]: heldIndicators(-1) },
      stopErrors: { [HELD]: 'stop rejected' },
    })

    const { record } = await runAndRecord()

    expect(callsOf('cancelOrder')).toHaveLength(1)
    expect(callsOf('submitStopOrder')).toHaveLength(2)
    expect(callsOf('db.insertAgentLogEntry').some((e) => e.error === 'trailing_stop_naked')).toBe(true)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/w2-profit-floor-submit-failed-naked.json`)
  })
})

describe('ATR trailing stop for the other setups', () => {
  it('(x1) TREND_PULLBACK_3DAY at +7% (activation 6%): replaces the Capa A stop by a trailing stop-limit and saves its order id', async () => {
    world.reset({
      positions: [heldAt(107, '0.07')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK_3DAY', highSinceEntry: 107 })],
      indicators: { [HELD]: makeIndicators({ kalman: kalman(-1), ema50: 95, ema200: 90, sma5: 101 }) },
    })

    const { record } = await runAndRecord()

    expect(callsOf('cancelOrder')).toEqual([{ orderId: `stop-${HELD}` }])
    expect(callsOf('submitStopLimitOrder')).toHaveLength(1)
    expect(callsOf('db.updatePositionContext').some((e) => (e.patch as Record<string, unknown>).trailingStopOrderId !== undefined)).toBe(true)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/x1-trailing-activation-trend-pullback-3day.json`)
  })

  it('(x2) EMA_RECLAIM at +5% (activation 4%): same replacement with the 1.0 ATR multiplier', async () => {
    world.reset({
      positions: [heldAt(105, '0.05')],
      contexts: [context(HELD, { signalType: 'EMA_RECLAIM', highSinceEntry: 105 })],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record } = await runAndRecord()

    expect(callsOf('cancelOrder')).toEqual([{ orderId: `stop-${HELD}` }])
    expect(callsOf('submitStopLimitOrder')).toHaveLength(1)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/x2-trailing-activation-ema-reclaim.json`)
  })
})

describe('exit rules by setup', () => {
  // ema50 105 is above the indicator price 100, so the price is below EMA50 for every held symbol below.
  const belowEma50 = (z: number, overrides: Parameters<typeof makeIndicators>[0] = {}) =>
    makeIndicators({ kalman: kalman(z), ema50: 105, ema200: 90, ...overrides })

  it('(y) EMA50 break exits TREND_PULLBACK and EMA_RECLAIM, TREND_ZLE05 exits only at z >= 1.25, 3DAY exits on the SMA5 reclaim', async () => {
    world.reset({
      positions: ['PB', 'RC', 'ZE', 'ZN', 'TD'].map((s) => position(s, { current_price: '100', unrealized_plpc: '0' })),
      contexts: [
        context('PB', { signalType: 'TREND_PULLBACK', highSinceEntry: 100 }),
        context('RC', { signalType: 'EMA_RECLAIM', highSinceEntry: 100 }),
        context('ZE', { signalType: 'TREND_ZLE05', highSinceEntry: 100 }),
        context('ZN', { signalType: 'TREND_ZLE05', highSinceEntry: 100 }),
        context('TD', { signalType: 'TREND_PULLBACK_3DAY', highSinceEntry: 100 }),
      ],
      indicators: {
        PB: belowEma50(0),
        RC: belowEma50(0),
        ZE: belowEma50(1.25),
        ZN: belowEma50(0.5),
        TD: makeIndicators({ kalman: kalman(-0.5), ema50: 95, ema200: 90, sma5: 99 }),
      },
    })

    const { record, result } = await runAndRecord()

    const sold = result.decisions.filter((d) => d.decision.action === 'SELL').map((d) => d.symbol).sort()
    expect(sold).toEqual(['PB', 'RC', 'TD', 'ZE'])
    expect(result.decisions.some((d) => d.symbol === 'ZN')).toBe(false)
    expect(upserts().map((u) => `${u.symbol}:${u.reason}`).sort()).toEqual(['PB:EMA_FAILURE', 'RC:EMA_FAILURE', 'TD:SMA5_RECLAIM', 'ZE:Z_SCORE_EXIT'])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/y-exit-rules-by-setup.json`)
  })

  it('(z1) profit target: 10% for a normal setup and 5% for TREND_ZLE05, just below and at the target', async () => {
    const heldIndicatorsAbove = makeIndicators({ kalman: kalman(-1), ema50: 95, ema200: 90 })
    world.reset({
      positions: [
        position('N1', { current_price: '109.9', unrealized_plpc: '0.099' }),
        position('N2', { current_price: '110', unrealized_plpc: '0.1' }),
        position('Z1', { current_price: '104.9', unrealized_plpc: '0.049' }),
        position('Z2', { current_price: '105', unrealized_plpc: '0.05' }),
      ],
      contexts: [
        context('N1', { signalType: 'TREND_PULLBACK' }),
        context('N2', { signalType: 'TREND_PULLBACK' }),
        context('Z1', { signalType: 'TREND_ZLE05' }),
        context('Z2', { signalType: 'TREND_ZLE05' }),
      ],
      indicators: { N1: heldIndicatorsAbove, N2: heldIndicatorsAbove, Z1: heldIndicatorsAbove, Z2: heldIndicatorsAbove },
    })

    const { record, result } = await runAndRecord()

    const sold = result.decisions.filter((d) => d.decision.action === 'SELL').map((d) => d.symbol).sort()
    expect(sold).toEqual(['N2', 'Z2'])
    expect(upserts().map((u) => `${u.symbol}:${u.reason}`).sort()).toEqual(['N2:PROFIT_TARGET', 'Z2:PROFIT_TARGET'])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/z1-profit-target-boundaries.json`)
  })
})

describe('time stop and stop loss', () => {
  const OLD_BUY = '2026-10-07T15:30:00.000Z'

  it('(z2a) open 28 calendar days (20 trading days): TIME_STOP sell and no cooldown written', async () => {
    world.reset({
      positions: [heldAt(101, '0.01')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK', buyTimestamp: OLD_BUY })],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record, result } = await runAndRecord()

    expect(result.decisions.filter((d) => d.decision.action === 'SELL').map((d) => d.symbol)).toEqual([HELD])
    expect(callsOf('closePosition')).toEqual([{ symbol: HELD, side: 'sell', type: 'market_close' }])
    expect(upserts()).toEqual([])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/z2a-time-stop-no-cooldown.json`)
  })

  it('(z2b) invalid buyTimestamp: the time stop is skipped with a warning and the position is not sold', async () => {
    world.reset({
      positions: [heldAt(101, '0.01')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK', buyTimestamp: 'not-a-date' })],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record, result } = await runAndRecord()

    expect(console.warn).toHaveBeenCalledWith(`[TIME_STOP_SKIPPED_INVALID_TIMESTAMP] symbol=${HELD} buyTimestamp=not-a-date`)
    expect(result.decisions.some((d) => d.decision.action === 'SELL')).toBe(false)
    expect(callsOf('closePosition')).toEqual([])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/z2b-time-stop-invalid-timestamp.json`)
  })

  it('(z3) QUIRK: Capa B closes a held position down 6% and writes STOP_LOSS, but the exit rules still evaluate the same position afterwards (HOLD exit_rules_check, context update) and no SELL decision is logged', async () => {
    world.reset({
      positions: [heldAt(94, '-0.06')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK', buyPrice: 100 })],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record } = await runAndRecord()

    expect(callsOf('closePosition')).toEqual([{ symbol: HELD, side: 'sell', type: 'market_close' }])
    expect(upserts()).toEqual([{ symbol: HELD, reason: 'STOP_LOSS', until: NEXT_TRADING_DAY_3 }])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/z3-stop-loss-capa-b.json`)
  })
})

describe('orphaned positions and missing indicators', () => {
  it('(z4a) a position with no context row and no protecting order: submits a stop, backfills the context and logs the reconciliation', async () => {
    world.reset({
      positions: [heldAt(101, '0.01')],
      contexts: [],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record } = await runAndRecord()

    expect(callsOf('submitStopOrder')).toEqual([{ symbol: HELD, qty: 10, stopPrice: 95, side: 'sell', type: 'stop' }])
    expect(callsOf('db.saveOpenPositionContext')).toHaveLength(1)
    expect(callsOf('db.insertAgentLogEntry').some((e) => e.error === 'orphaned_position_reconciled')).toBe(true)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/z4a-orphan-reconciled-new-stop.json`)
  })

  it('(z4b) an orphaned position that already has a sell order: context backfilled, no new stop submitted', async () => {
    const protectingOrder = { id: 'existing-sell', symbol: HELD, side: 'sell', status: 'new' } as unknown as AlpacaOrder
    world.reset({
      positions: [heldAt(101, '0.01')],
      contexts: [],
      indicators: { [HELD]: heldIndicators(-1) },
      openOrders: [protectingOrder],
    })

    const { record } = await runAndRecord()

    expect(callsOf('submitStopOrder')).toEqual([])
    expect(callsOf('db.saveOpenPositionContext')).toHaveLength(1)
    expect(callsOf('db.insertAgentLogEntry').some((e) => e.error === 'orphaned_position_reconciled')).toBe(true)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/z4b-orphan-reconciled-existing-order.json`)
  })

  it('(z5) a held symbol without Kalman indicators is skipped by the exit rules and the skip is logged', async () => {
    world.reset({
      positions: [heldAt(101, '0.01')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK' })],
      indicators: { [HELD]: makeIndicators({ kalman: null, ema50: 95, ema200: 90 }) },
    })

    const { record } = await runAndRecord()

    expect(callsOf('db.insertAgentLogEntry').some((e) => e.error === 'exit_rules_skip')).toBe(true)
    expect(callsOf('closePosition')).toEqual([])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/z5-exit-rules-skip-no-kalman.json`)
  })
})

const NO_CLAUDE_AND_NO_ORDER = () => {
  expect(world.calls.some((c) => c.fn === 'claude.create')).toBe(false)
  expect(world.calls.some((c) => c.fn === 'submitLimitOrder')).toBe(false)
}

function holdEntries() {
  return world.calls.filter((c) => c.fn === 'db.insertAgentLogEntry' || c.fn === 'agentLog.append')
}

function holdsOf(result: Awaited<ReturnType<typeof runAgentCycle>>, symbol: string) {
  return result.decisions.filter((d) => d.symbol === symbol)
}

describe('entries by setup', () => {
  it('(aa) TREND_PULLBACK BUY: classification, Claude call, sizing, IOC, stop and context with the setup', async () => {
    world.reset({
      watchlist: [SYMBOL], indicators: { [SYMBOL]: trendPullbackIndicators() },
      quotes: { [SYMBOL]: quote({ bid: 99.95, ask: 100 }) }, claude: () => claudeJson(0.7),
    })

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.decision.action).toBe('BUY')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[TREND_PULLBACK_STATS] blockedMacd=0'))
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/aa-trend-pullback-buy.json`)
    await expect(`${callHeader()}\n\n${promptAt(world)?.user}\n`).toMatchFileSnapshot(`${GOLDEN}/aa-trend-pullback-buy.prompt.txt`)
  })

  it('(ab) TREND_ZLE05 BUY: classification, Claude call, sizing, IOC, stop and context with the setup', async () => {
    world.reset({
      watchlist: [SYMBOL], indicators: { [SYMBOL]: trendZle05Indicators() },
      quotes: { [SYMBOL]: quote({ bid: 99.95, ask: 100 }) }, claude: () => claudeJson(0.7),
    })

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.decision.action).toBe('BUY')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ab-trend-zle05-buy.json`)
    await expect(`${callHeader()}\n\n${promptAt(world)?.user}\n`).toMatchFileSnapshot(`${GOLDEN}/ab-trend-zle05-buy.prompt.txt`)
  })

  it('(ac) EMA_RECLAIM BUY: the 0.75 setup size factor shows in the quantity and the context', async () => {
    world.reset({
      watchlist: [SYMBOL], indicators: { [SYMBOL]: emaReclaimIndicators() },
      quotes: { [SYMBOL]: quote({ bid: 99.95, ask: 100 }) }, claude: () => claudeJson(0.7),
    })

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.decision.action).toBe('BUY')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ac-ema-reclaim-buy.json`)
    await expect(`${callHeader()}\n\n${promptAt(world)?.user}\n`).toMatchFileSnapshot(`${GOLDEN}/ac-ema-reclaim-buy.prompt.txt`)
  })
})

describe('setup near-misses that end in HOLD', () => {
  it('(ad-1) TREND_PULLBACK blocked by the MACD floor: generic no-setup HOLD, counted in the stats line, Claude not called', async () => {
    world.reset({
      watchlist: [SYMBOL],
      indicators: { [SYMBOL]: trendPullbackIndicators({ macd: { macdLine: -2.5, signalLine: 0, histogram: -2.5 } }) },
      quotes: { [SYMBOL]: quote({ bid: 99.95, ask: 100 }) },
    })

    const { record } = await runAndRecord()

    NO_CLAUDE_AND_NO_ORDER()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[TREND_PULLBACK_BLOCKED_MACD] symbol=AAA'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('[TREND_PULLBACK_STATS] blockedMacd=1'))
    expect(holdEntries().length).toBeGreaterThan(0)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ad1-trend-pullback-macd-floor-hold.json`)
  })

  it('(ad-2) QUIRK: a TREND_ZLE05 candidate with ADX 19 passes its own ADX gate (>= 18) but is held by the TREND_PULLBACK quality filter (>= 20)', async () => {
    world.reset({
      watchlist: [SYMBOL], indicators: { [SYMBOL]: trendZle05Indicators({ adx: 19 }) },
      quotes: { [SYMBOL]: quote({ bid: 99.95, ask: 100 }) },
    })

    const { record, result } = await runAndRecord()

    NO_CLAUDE_AND_NO_ORDER()
    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('TREND_QUALITY_FAIL: adx=19.0 slope=ok')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ad2-trend-zle05-quality-fail-hold.json`)
  })

  it('(ad-3) EMA_RECLAIM_NEAR: cross detected but the distance is too small, HOLD without a Claude call', async () => {
    world.reset({
      watchlist: [SYMBOL],
      indicators: { [SYMBOL]: emaReclaimIndicators({ ema50: 99.9, ema50Prev: 99.8 }) },
      quotes: { [SYMBOL]: quote({ bid: 99.95, ask: 100 }) },
    })

    const { record, result } = await runAndRecord()

    NO_CLAUDE_AND_NO_ORDER()
    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('EMA_RECLAIM_NEAR: conditions not met')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ad3-ema-reclaim-near-hold.json`)
  })
})

describe('order execution: partial fills and stop-submit failure', () => {
  const mrEntry = (overrides: Parameters<typeof world.reset>[0] = {}) => ({
    watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() }, claude: () => claudeJson(0.32),
    ...overrides,
  })

  it('(ae) partial fill, remainder inside the drift and size gates, second order fills: weighted average price, fillAttempts and a stop for the filled total', async () => {
    world.reset(mrEntry({
      fillPlan: { [SYMBOL]: [{ filled: 60 }, { filled: 40 }] },
      quoteSequence: { [SYMBOL]: [quote(), quote({ bid: 50, ask: 50.05 })] },
    }))

    const { record, result } = await runAndRecord()

    const limitOrders = callsOf('submitLimitOrder')
    expect(limitOrders.map((o) => o.qty)).toEqual([100, 40])
    expect(limitOrders.map((o) => o.limitPrice)).toEqual([50, 50.05])
    expect(callsOf('submitStopOrder')).toEqual([{ symbol: SYMBOL, qty: 100, stopPrice: 47.5, side: 'sell', type: 'stop' }])
    expect(holdsOf(result, SYMBOL)[0]?.decision.quantity).toBe(100)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ae-ioc-partial-fill-remainder-retry.json`)
  })

  it('(af-1) partial fill, remainder retry skipped because the ask drifted above the limit: stop covers only the filled quantity', async () => {
    world.reset(mrEntry({
      fillPlan: { [SYMBOL]: [{ filled: 60 }] },
      quoteSequence: { [SYMBOL]: [quote(), quote({ bid: 50.45, ask: 50.5 })] },
    }))

    const { record, result } = await runAndRecord()

    expect(callsOf('submitLimitOrder')).toHaveLength(1)
    expect(callsOf('submitStopOrder')).toEqual([{ symbol: SYMBOL, qty: 60, stopPrice: 47.5, side: 'sell', type: 'stop' }])
    expect(holdsOf(result, SYMBOL)[0]?.decision.quantity).toBe(60)
    expect(console.log).toHaveBeenCalledWith(`[ORDER] ${SYMBOL} IOC_PARTIAL_FILL: requested 100, filled 60`)
    expect(console.log).toHaveBeenCalledWith(`[IOC_RETRY] ${SYMBOL} stopping remainder retries — gate check failed (remainder=40)`)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/af1-ioc-partial-fill-drift-skip.json`)
  })

  it('(af-2) partial fill, remainder retry skipped because the remainder is below the USD minimum: stop covers only the filled quantity', async () => {
    world.reset(mrEntry({ fillPlan: { [SYMBOL]: [{ unfilled: 2 }] } }))

    const { record, result } = await runAndRecord()

    expect(callsOf('submitLimitOrder')).toHaveLength(1)
    expect(callsOf('submitStopOrder')).toEqual([{ symbol: SYMBOL, qty: 98, stopPrice: 47.5, side: 'sell', type: 'stop' }])
    expect(holdsOf(result, SYMBOL)[0]?.decision.quantity).toBe(98)
    expect(console.log).toHaveBeenCalledWith(`[ORDER] ${SYMBOL} IOC_PARTIAL_FILL: requested 100, filled 98`)
    expect(console.log).toHaveBeenCalledWith(`[IOC_RETRY] ${SYMBOL} stopping remainder retries — gate check failed (remainder=2)`)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/af2-ioc-partial-fill-remainder-too-small.json`)
  })

  it('(ag) QUIRK: the BUY fills but the GTC stop fails twice; the position is left unprotected with only STOP_SUBMIT_FAILED in the error field and the context saved without a stop id', async () => {
    world.reset(mrEntry({ stopErrors: { [SYMBOL]: 'stop rejected' } }))

    const { record, result } = await runAndRecord()

    expect(callsOf('submitStopOrder')).toHaveLength(2)
    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('STOP_SUBMIT_FAILED: stop rejected')
    expect(holdsOf(result, SYMBOL)[0]?.orderExecuted).toBe(true)
    expect(callsOf('db.saveOpenPositionContext')).toHaveLength(1)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ag-stop-submit-failed-after-buy.json`)
  })
})

describe('skips in the main loop', () => {
  it('(ah) a blacklisted symbol, a symbol with an open position and a symbol without cached indicators are skipped; only the last one is logged as a HOLD', async () => {
    world.reset({
      watchlist: ['SQQQ', HELD, 'NOIND'],
      positions: [heldAt(101, '0.01')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK' })],
      indicators: { [HELD]: heldIndicators(-1), SQQQ: mrIndicators() },
      quotes: { SQQQ: quote() },
    })

    const { record, result } = await runAndRecord()

    NO_CLAUDE_AND_NO_ORDER()
    expect(callsOf('closePosition')).toEqual([])
    expect(result.decisions.filter((d) => d.symbol === 'SQQQ')).toEqual([])
    expect(console.log).toHaveBeenCalledWith('[AGENT] SQQQ skipped — blacklisted instrument')
    expect(console.log).toHaveBeenCalledWith(`[AGENT] ${HELD} skipped — open position, handled by enforceExitRules`)
    expect(result.decisions.filter((d) => d.symbol === 'NOIND').map((d) => d.error)).toEqual(['Skipped: no indicators available in cache'])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ah-main-loop-skips.json`)
  })
})

describe('leftovers: trailing exit, peak high, orphan lookup, unknown reason, Capa B failures', () => {
  it('(ai) QUIRK: the ATR trailing stop is raised and replaced, and in the same pass the price at the stop sells the position', async () => {
    world.reset({
      positions: [heldAt(103.9, '0.039')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK', highSinceEntry: 108, trailingActivated: true, trailingStop: 104, trailingStopOrderId: 'trail-HLD' })],
      indicators: { [HELD]: heldIndicators(-1) },
    })

    const { record, result } = await runAndRecord()

    expect(result.decisions.filter((d) => d.decision.action === 'SELL').map((d) => d.symbol)).toEqual([HELD])
    expect(result.decisions[0]?.decision.reasoning).toMatch(/^Trailing stop triggered: price \$103\.90 <= stop \$105\.00 \(high: \$108\.00\)$/)
    expect(callsOf('cancelOrder')).toEqual([{ orderId: 'trail-HLD' }])
    expect(callsOf('submitStopLimitOrder')).toHaveLength(1)
    expect(upserts()).toEqual([{ symbol: HELD, reason: 'TRAILING_STOP', until: NEXT_TRADING_DAY_1 }])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ai-atr-trailing-stop-exit.json`)
  })

  it('(aj) ghost-close with a profit and an existing cooldown: COOLDOWN_SKIP, no second cooldown write', async () => {
    world.reset({
      contexts: [context(GHOST, { buyPrice: 100 })],
      sellOrders: ghostSellOrder('sell-gho', '110'),
      activeCooldowns: [{ symbol: GHOST, exit_reason: 'Z_SCORE_EXIT', cooldown_until: END_OF_TRADING_DAY }],
    })

    const { record, result } = await runAndRecord()

    expect(result.evaluations).toHaveLength(1)
    expect(upserts()).toEqual([])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/aj-ghost-close-profit-existing-cooldown.json`)
  })

  it('(ak) a scripted peak high above the stored high is persisted and drives the profit floor', async () => {
    world.reset({
      positions: [heldAt(106, '0.06')],
      contexts: [context(HELD, { signalType: 'MEAN_REVERSION', highSinceEntry: 102 })],
      indicators: { [HELD]: heldIndicators(-1) },
      peakHighs: { [HELD]: 108 },
    })

    const { record } = await runAndRecord()

    expect(callsOf('db.updatePositionContext').some((e) => (e.patch as Record<string, unknown>).highSinceEntry === 108)).toBe(true)
    expect(callsOf('submitStopOrder')).toEqual([{ symbol: HELD, qty: 10, stopPrice: 105, side: 'sell', type: 'stop' }])
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ak-peak-high-update.json`)
  })

  it('(al-1) orphan reconciliation takes the buy timestamp from the latest filled buy order of the symbol', async () => {
    const buy = (id: string, filledAt: string, symbol = HELD, side = 'buy') =>
      ({ ...makeOrder(id, symbol, side, 10, 'filled', 10, 100), filled_at: filledAt })
    world.reset({
      positions: [heldAt(101, '0.01')],
      contexts: [],
      indicators: { [HELD]: heldIndicators(-1) },
      filledOrders: [
        buy('buy-old', '2026-10-30T14:00:00.000Z'),
        buy('buy-new', '2026-11-02T15:00:00.000Z'),
        buy('buy-other-symbol', '2026-11-03T15:00:00.000Z', 'OTH'),
        buy('sell-newest', '2026-11-04T10:00:00.000Z', HELD, 'sell'),
      ],
    })

    const { record } = await runAndRecord()

    const saved = world.calls.find((c) => c.fn === 'db.saveOpenPositionContext')?.args.ctx as { buyTimestamp: string }
    expect(saved.buyTimestamp).toBe('2026-11-02T15:00:00.000Z')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/al1-orphan-buy-timestamp-from-orders.json`)
  })

  it('(al-2) orphan reconciliation without a matching buy order falls back to the cycle timestamp and warns', async () => {
    world.reset({ positions: [heldAt(101, '0.01')], contexts: [], indicators: { [HELD]: heldIndicators(-1) } })

    const { record } = await runAndRecord()

    const saved = world.calls.find((c) => c.fn === 'db.saveOpenPositionContext')?.args.ctx as { buyTimestamp: string }
    expect(saved.buyTimestamp).toBe(PINS.nowIso)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`[RECONCILE] ${HELD} no matching filled buy order found`))
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/al2-orphan-buy-timestamp-fallback.json`)
  })

  it('(am) an UNKNOWN exit reason (forced through the exit-cooldown mock hook) sells but applies no cooldown and warns', async () => {
    world.reset({
      positions: [heldAt(110, '0.1')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK', highSinceEntry: 110 })],
      indicators: { [HELD]: heldIndicators(-1) },
      forceUnknownExitReason: true,
    })

    const { record, result } = await runAndRecord()

    expect(result.decisions.filter((d) => d.decision.action === 'SELL').map((d) => d.symbol)).toEqual([HELD])
    expect(upserts()).toEqual([])
    expect(console.warn).toHaveBeenCalledWith(`[EXIT_COOLDOWN_UNKNOWN_REASON] symbol=${HELD}`)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/am-unknown-exit-reason-no-cooldown.json`)
  })

  it('(an-1) Capa B: closePosition fails for a position down 6%: the error is logged and no STOP_LOSS cooldown is written', async () => {
    world.reset({
      positions: [heldAt(94, '-0.06')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK', buyPrice: 100 })],
      indicators: { [HELD]: heldIndicators(-1) },
      closeErrors: { [HELD]: 'close rejected' },
    })

    const { record } = await runAndRecord()

    expect(callsOf('closePosition')).toEqual([{ symbol: HELD, side: 'sell', type: 'market_close' }])
    expect(upserts()).toEqual([])
    expect(console.error).toHaveBeenCalledWith(`[enforceStopLosses] Failed to close ${HELD}:`, expect.any(Error))
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/an1-stop-loss-close-failed.json`)
  })

  it('(an-2) Capa B: the first context read fails, so no stop loss is enforced this cycle', async () => {
    world.reset({
      positions: [heldAt(94, '-0.06')],
      contexts: [context(HELD, { signalType: 'TREND_PULLBACK', buyPrice: 100 })],
      indicators: { [HELD]: heldIndicators(-1) },
      contextReadFailures: 1,
    })

    const { record } = await runAndRecord()

    expect(callsOf('closePosition')).toEqual([])
    expect(upserts()).toEqual([])
    expect(console.error).toHaveBeenCalledWith('[enforceStopLosses] CRITICAL: Failed to fetch positions — stop losses NOT enforced:', expect.any(Error))
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/an2-stop-loss-context-read-failed.json`)
  })
})

const HOLD_NO_ORDER = () => {
  expect(world.calls.some((c) => c.fn === 'submitLimitOrder')).toBe(false)
  expect(world.calls.some((c) => c.fn === 'submitStopOrder')).toBe(false)
}

function claudeCalls(): number {
  return world.calls.filter((c) => c.fn === 'claude.create').length
}

const mrCandidate = (overrides: Parameters<typeof world.reset>[0] = {}) => ({
  watchlist: [SYMBOL], indicators: { [SYMBOL]: mrIndicators() }, quotes: { [SYMBOL]: quote() }, claude: () => claudeJson(0.32),
  ...overrides,
})

const HELD_SLOTS = ['P1', 'P2', 'P3', 'P4']

const rankingWorld = (overrides: Parameters<typeof world.reset>[0] = {}) => ({
  watchlist: [SYMBOL], positions: HELD_SLOTS.map((s) => position(s)), contexts: HELD_SLOTS.map((s) => context(s)),
  indicators: { ...Object.fromEntries(HELD_SLOTS.map((s) => [s, heldIndicators(-1)])), [SYMBOL]: mrIndicators() },
  quotes: { [SYMBOL]: quote() }, claude: () => claudeJson(0.32),
  ...overrides,
})

const rankedIndicators = (symbolZ: number, otherZ: number) => ({
  ...Object.fromEntries(HELD_SLOTS.map((s) => [s, heldIndicators(-1)])),
  [SYMBOL]: mrIndicators({ kalman: kalman(symbolZ, 'MEAN_REVERSION_LONG') }),
  BBB: mrIndicators({ kalman: kalman(otherZ, 'MEAN_REVERSION_LONG') }),
})

describe('entry gates in normal mode', () => {
  it('(ao) liquidity gate: previous-day volume 999,999 is held after the Claude call and no order is sent', async () => {
    world.reset(mrCandidate({ indicators: { [SYMBOL]: mrIndicators({ prevDayVolume: 999_999 }) } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Liquidity gate: prev day volume 999,999 < 1,000,000')
    expect(holdsOf(result, SYMBOL)[0]?.decision.action).toBe('HOLD')
    expect(claudeCalls()).toBe(1)
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ao-liquidity-gate-below-minimum.json`)
  })

  it('(ao-b) liquidity gate: previous-day volume exactly 1,000,000 passes and the buy is sent', async () => {
    world.reset(mrCandidate({ indicators: { [SYMBOL]: mrIndicators({ prevDayVolume: 1_000_000 }) } }))

    const { result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ error: undefined, orderExecuted: true, decision: { action: 'BUY', quantity: 100 } })
    expect(callsOf('submitLimitOrder')).toHaveLength(1)
    expect(callsOf('submitStopOrder')).toHaveLength(1)
  })

  it('(ap-1) spread gate: no quote is held with Spread gate: no quote available', async () => {
    world.reset(mrCandidate({ quotes: { [SYMBOL]: null } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Spread gate: no quote available')
    expect(claudeCalls()).toBe(1)
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ap1-no-quote-gate.json`)
  })

  it('(ap-2) spread gate: a stale quote is held with Spread gate: stale quote', async () => {
    world.reset(mrCandidate({ quotes: { [SYMBOL]: quote({ fresh: false }) } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Spread gate: stale quote')
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ap2-stale-quote-gate.json`)
  })

  it('(ap-3) spread gate: a spread exactly at MAX_SPREAD_BPS (100) passes and the buy is sent', async () => {
    world.reset(mrCandidate({ quotes: { [SYMBOL]: quote({ spreadBps: PINS.maxSpreadBps }) } }))

    const { result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ error: undefined, orderExecuted: true, decision: { action: 'BUY', quantity: 100 } })
    expect(console.log).toHaveBeenCalledWith(`[ORDER] ${SYMBOL} limit IOC BUY @ $50 id: order-1 status: filled filled: 100/100 spread: 100bps`)
  })

  it('(aq-1) trading-hours gate: 9:44 ET is held with the outside-window error and no order is sent', async () => {
    world.reset(mrCandidate())
    vi.setSystemTime(new Date('2026-11-04T14:44:00.000Z'))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Trading hours gate: outside 9:45am–3:30pm ET window')
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/aq1-trading-hours-before-open.json`)
  })

  it('(aq-2) trading-hours gate: 15:31 ET is held with the outside-window error and no order is sent', async () => {
    world.reset(mrCandidate())
    vi.setSystemTime(new Date('2026-11-04T20:31:00.000Z'))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Trading hours gate: outside 9:45am–3:30pm ET window')
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/aq2-trading-hours-after-close.json`)
  })

  it('(aq-3) trading-hours gate: exactly 9:45 ET passes and the buy is sent', async () => {
    world.reset(mrCandidate())
    vi.setSystemTime(new Date('2026-11-04T14:45:00.000Z'))

    const { result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ error: undefined, orderExecuted: true, decision: { action: 'BUY' } })
  })

  it('(aq-4) trading-hours gate: exactly 15:30 ET passes and the buy is sent', async () => {
    world.reset(mrCandidate())
    vi.setSystemTime(new Date('2026-11-04T20:30:00.000Z'))

    const { result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ error: undefined, orderExecuted: true, decision: { action: 'BUY' } })
  })

  it('(ar) early max-buys gate: with 5 buys already today the candidate is held with Gate: max buys per day (5/5) and the near miss is recorded twice', async () => {
    world.reset(mrCandidate({ buysToday: 5 }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Gate: max buys per day (5/5)')
    expect(claudeCalls()).toBe(1)
    expect(world.calls.filter((c) => c.fn === 'watchlist.detectNearMisses')).toHaveLength(2)
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ar-max-buys-per-day-gate.json`)
  })

  it('(av) market closed with an open position: the candidate gets the queued-not-executed error and no order, but Claude is still called', async () => {
    world.reset(mrCandidate({
      marketOpen: false, positions: [position(HELD)], contexts: [context(HELD)],
      indicators: { [HELD]: heldIndicators(-1), [SYMBOL]: mrIndicators() },
    }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Market closed — order queued but not executed')
    expect(claudeCalls()).toBe(1)
    HOLD_NO_ORDER()
    expect(console.log).toHaveBeenCalledWith('[AGENT] Market closed — running exit evaluation only')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/av-market-closed-with-position.json`)
  })
})

describe('setup variants that end in HOLD or no order', () => {
  it('(as) TREND_ZGT125: a trend-aligned candidate with z-score 1.5 is excluded before Claude is called', async () => {
    world.reset(mrCandidate({ indicators: { [SYMBOL]: trendPullbackIndicators({ kalman: kalman(1.5) }) } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('TREND_ZGT125: excluded — zScore > 1.25')
    expect(console.log).toHaveBeenCalledWith(`[SETUP-GATE] ${SYMBOL}: TREND_ZGT125 — trend aligned but zScore 1.500 > 1.25, excluded (price above fair value)`)
    NO_CLAUDE_AND_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/as-trend-zgt125-excluded.json`)
  })

  it('(at) TREND_PULLBACK_3DAY with the price above SMA5 is held with the SMA5 reason before Claude is called', async () => {
    world.reset(mrCandidate({ indicators: { [SYMBOL]: trend3DayIndicators({ sma5: 99 }) } }))

    const { record, result } = await runAndRecord()

    const reason = 'TREND_3DAY_ABOVE_SMA5: price $100.00 >= SMA5 $99.00 (3DAY exit would fire immediately)'
    expect(holdsOf(result, SYMBOL)[0]?.error).toBe(reason)
    expect(console.log).toHaveBeenCalledWith(`[SETUP-GATE] ${SYMBOL}: ${reason}`)
    NO_CLAUDE_AND_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/at-3day-above-sma5-blocked.json`)
  })

  it('(au) insufficient buying power: the sizing gives 0 shares, the candidate is held and no order is sent', async () => {
    world.reset(mrCandidate({ account: { ...defaultAccount(), buying_power: '10' } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Insufficient buying power for position')
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining(`[BUY SIZING] ${SYMBOL}: baseShares=0`))
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/au-insufficient-buying-power.json`)
  })
})

describe('auto-entry through the normal-mode path (current behavior)', () => {
  it('(aw-1) QUIRK: an auto-entry symbol with no setup logs that it bypasses the setup gate and is then skipped: no Claude call, no order and no decision entry', async () => {
    world.reset(mrCandidate({ autoEntry: [SYMBOL], indicators: { [SYMBOL]: makeIndicators() } }))

    const { record, result } = await runAndRecord()

    expect(console.log).toHaveBeenCalledWith(`[WATCHLIST] ${SYMBOL}: auto-entry bypassing setup gate (monitored from near-miss watchlist)`)
    expect(console.warn).toHaveBeenCalledWith(`[LEARNING] ${SYMBOL}: reached learning context without a setup — skipping`)
    expect(holdsOf(result, SYMBOL)).toEqual([])
    NO_CLAUDE_AND_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/aw1-auto-entry-without-setup.json`)
  })

  it('(aw-2) auto-entry keeps the entry gates: a setup symbol with previous-day volume 999,999 is held by the liquidity gate', async () => {
    world.reset(mrCandidate({ autoEntry: [SYMBOL], indicators: { [SYMBOL]: mrIndicators({ prevDayVolume: 999_999 }) } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Liquidity gate: prev day volume 999,999 < 1,000,000')
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/aw2-auto-entry-liquidity-gate.json`)
  })

  it('(aw-3) auto-entry does not skip the TREND_ZGT125 exclusion: the bypass log is followed by the exclusion HOLD', async () => {
    world.reset(mrCandidate({ autoEntry: [SYMBOL], indicators: { [SYMBOL]: trendPullbackIndicators({ kalman: kalman(1.5) }) } }))

    const { record, result } = await runAndRecord()

    expect(console.log).toHaveBeenCalledWith(`[WATCHLIST] ${SYMBOL}: auto-entry bypassing setup gate (monitored from near-miss watchlist)`)
    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('TREND_ZGT125: excluded — zScore > 1.25')
    NO_CLAUDE_AND_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/aw3-auto-entry-trend-zgt125.json`)
  })
})

describe('ranking mode (one free slot) execution paths', () => {
  it('(ax-1) the ranking winner has no quote at ranking time: the error text of the thrown gate is kept on the entry and no order is sent', async () => {
    world.reset(rankingWorld({ quotes: { [SYMBOL]: null }, quoteSequence: { [SYMBOL]: [quote()] } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ error: 'Error: Spread gate: no quote at ranking execution', orderExecuted: false })
    expect(callsOf('getQuote').filter((c) => c.symbol === SYMBOL)).toHaveLength(2)
    HOLD_NO_ORDER()
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ax1-ranking-no-quote.json`)
  })

  it('(ax-2) the ranking winner gets a zero fill: IOC_NOT_FILLED on the entry, no stop and no saved context', async () => {
    world.reset(rankingWorld({ fill: { [SYMBOL]: 'zero' } }))

    const { record, result } = await runAndRecord()

    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ error: 'IOC_NOT_FILLED: limit buy canceled, 0 shares filled at $50', orderExecuted: false })
    expect(callsOf('submitStopOrder')).toEqual([])
    expect(callsOf('db.saveOpenPositionContext')).toEqual([])
    expect(console.log).toHaveBeenCalledWith(`[ORDER] ${SYMBOL} IOC not filled — 0 shares filled at $50`)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ax2-ranking-zero-fill.json`)
  })

  it('(ax-3) the ranking winner is partially filled: IOC_PARTIAL_FILL is logged and the stop and the saved quantity cover only the filled shares', async () => {
    world.reset(rankingWorld({ fillPlan: { [SYMBOL]: [{ unfilled: 2 }] } }))

    const { record, result } = await runAndRecord()

    expect(console.log).toHaveBeenCalledWith(`[ORDER] ${SYMBOL} IOC_PARTIAL_FILL: requested 100, filled 98`)
    expect(callsOf('submitStopOrder')).toEqual([{ symbol: SYMBOL, qty: 98, stopPrice: 47.5, side: 'sell', type: 'stop' }])
    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ orderExecuted: true, error: undefined, decision: { action: 'BUY', quantity: 98 } })
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ax3-ranking-partial-fill.json`)
  })

  it('(ax-4) QUIRK: the ranking winner fills but its GTC stop fails twice; STOP_SUBMIT_FAILED is the only trace on an executed entry and the context is still saved', async () => {
    world.reset(rankingWorld({ stopErrors: { [SYMBOL]: 'stop rejected' } }))

    const { record, result } = await runAndRecord()

    expect(callsOf('submitStopOrder')).toHaveLength(2)
    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ error: 'STOP_SUBMIT_FAILED: stop rejected', orderExecuted: true, decision: { action: 'BUY', quantity: 100 } })
    expect(callsOf('db.saveOpenPositionContext')).toHaveLength(1)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ax4-ranking-stop-submit-failed.json`)
  })

  it('(ax-5) two candidates without the z <= -2 edge: the lower z-score wins, is bought and the other is logged as outranked', async () => {
    world.reset(rankingWorld({
      watchlist: [SYMBOL, 'BBB'], indicators: rankedIndicators(-1.5, -1.6), quotes: { [SYMBOL]: quote(), BBB: quote() },
    }))

    const { record, result } = await runAndRecord()

    expect(callsOf('submitLimitOrder').map((o) => o.symbol)).toEqual(['BBB'])
    expect(holdsOf(result, 'BBB')[0]).toMatchObject({ orderExecuted: true, decision: { action: 'BUY', quantity: 100 } })
    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Outranked by BBB (z=-1.600 vs z=-1.500)')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ax5-ranking-different-z.json`)
  })

  it('(ax-6) two candidates with the same z-score: the higher confidence wins, is bought and the other is logged as outranked', async () => {
    world.reset(rankingWorld({
      watchlist: [SYMBOL, 'BBB'], indicators: rankedIndicators(-1.5, -1.5), quotes: { [SYMBOL]: quote(), BBB: quote() },
      claude: (prompt: string) => claudeJson(prompt.includes('ANALYSIS REQUEST: BBB') ? 0.7 : 0.5),
    }))

    const { record, result } = await runAndRecord()

    expect(callsOf('submitLimitOrder').map((o) => ({ symbol: o.symbol, qty: o.qty }))).toEqual([{ symbol: 'BBB', qty: 140 }])
    expect(holdsOf(result, SYMBOL)[0]?.error).toBe('Outranked by BBB (z=-1.500 vs z=-1.500)')
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ax6-ranking-same-z-confidence.json`)
  })

  it('(ax-7) current behavior: the quote re-fetched at ranking time is not checked for staleness or spread, so a stale 500 bps quote still gets the order at its ask', async () => {
    world.reset(rankingWorld({
      quoteSequence: { [SYMBOL]: [quote(), quote({ fresh: false, spreadBps: 500, bid: 49.7, ask: 50.2 })] },
    }))

    const { record, result } = await runAndRecord()

    expect(callsOf('submitLimitOrder')).toEqual([{ symbol: SYMBOL, qty: 100, side: 'buy', limitPrice: 50.2, type: 'limit' }])
    expect(holdsOf(result, SYMBOL)[0]).toMatchObject({ orderExecuted: true, error: undefined, decision: { action: 'BUY', quantity: 100 } })
    expect(console.log).toHaveBeenCalledWith(`[ORDER] ${SYMBOL} limit IOC BUY @ $50.2 id: order-1 status: filled filled: 100/100 spread: 500bps`)
    await expect(record).toMatchFileSnapshot(`${GOLDEN}/ax7-ranking-requote-not-regated.json`)
  })
})
