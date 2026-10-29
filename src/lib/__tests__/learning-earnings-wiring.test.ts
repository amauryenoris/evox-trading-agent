import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TechnicalIndicators } from '../types'

const { mockGetTradeEvaluations } = vi.hoisted(() => ({ mockGetTradeEvaluations: vi.fn() }))

vi.mock('../db', () => ({
  saveOpenPositionContext: vi.fn(),
  getOpenPositionContexts: vi.fn(),
  deleteOpenPositionContext: vi.fn(),
  insertTradeEvaluation: vi.fn(),
  getTradeEvaluations: mockGetTradeEvaluations,
  getPatternLibrary: vi.fn(),
  upsertPattern: vi.fn(),
}))

import { buildLearningContext } from '../learning'
import { evaluateEarningsGate, type EarningsGateInput } from '../earnings-window'

const BASE_INPUT = {
  setup: 'MEAN_REVERSION' as const,
  symbol: 'GOOGL',
  indicators: { currentPrice: 100 } as TechnicalIndicators,
  asOf: '2026-10-27T15:00:00Z',
}

const GATE_INPUT: EarningsGateInput = {
  entryDate: '2026-10-27',
  nextTradingDay: '2026-10-28',
  upcomingTradingDays: ['2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03'],
  cached: { reportDate: '2026-10-30', session: 'AMC' },
  latestFetchedAt: '2026-10-27T11:17:00Z',
  cacheReadFailed: false,
}

describe('buildLearningContext — earnings wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTradeEvaluations.mockResolvedValue([])
  })

  it('persists the gate result in the snapshot and adds the line for OK within 5 trading days', async () => {
    // Arrange
    const earnings = evaluateEarningsGate(GATE_INPUT)

    // Act
    const { text, snapshot } = await buildLearningContext({ ...BASE_INPUT, earnings })

    // Assert
    expect(snapshot.earnings).toEqual({
      nextReportDate: '2026-10-30', session: 'AMC', tradingDaysAway: 3, blocked: false, source: 'nasdaq', status: 'OK',
    })
    expect(text).toContain('Earnings: reports 2026-10-30 (after close), 3 trading days away')
  })

  it('omits the line for an OK report more than 5 trading days away but still persists it', async () => {
    const earnings = evaluateEarningsGate({ ...GATE_INPUT, cached: { reportDate: '2026-12-01', session: 'BMO' } })

    const { text, snapshot } = await buildLearningContext({ ...BASE_INPUT, earnings })

    expect(text).not.toContain('Earnings:')
    expect(snapshot.earnings?.status).toBe('OK')
  })

  it.each([
    ['UNKNOWN', { ...GATE_INPUT, cacheReadFailed: true }],
    ['UNKNOWN (empty cache)', { ...GATE_INPUT, latestFetchedAt: null }],
    ['STALE', { ...GATE_INPUT, latestFetchedAt: '2026-10-20T11:17:00Z' }],
  ])('persists nulls and adds no line for %s, without throwing', async (_name, gateInput) => {
    const earnings = evaluateEarningsGate(gateInput)

    const { text, snapshot } = await buildLearningContext({ ...BASE_INPUT, earnings })

    expect(snapshot.earnings).toMatchObject({
      nextReportDate: null, session: null, tradingDaysAway: null, blocked: false, source: 'nasdaq',
    })
    expect(['UNKNOWN', 'STALE']).toContain(snapshot.earnings?.status)
    expect(text).not.toContain('Earnings:')
  })

  it('returns no earnings field and no line when the input has none', async () => {
    const { text, snapshot } = await buildLearningContext(BASE_INPUT)

    expect(text).not.toContain('Earnings:')
    expect(Object.keys(snapshot)).not.toContain('earnings')
  })
})
