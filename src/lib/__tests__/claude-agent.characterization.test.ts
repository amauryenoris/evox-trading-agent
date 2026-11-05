import { describe, it, expect } from 'vitest'
import { pump, installHarness, world } from './support/claude-agent/harness'
import { buildRecord, claudeCallAt, promptAt } from './support/claude-agent/record'
import { context, kalman, makeIndicators, mrIndicators, position, quote, trend3DayIndicators } from './support/claude-agent/builders'
import { claudeJson } from './support/claude-agent/world'
import { runAgentCycle } from '../claude-agent'

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
