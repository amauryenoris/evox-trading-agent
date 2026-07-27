import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getTradeEvaluations } from '../db'

const { mockSelect, mockOrder, mockLimit, mockGte, mockFrom } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockOrder: vi.fn(),
  mockLimit: vi.fn(),
  mockGte: vi.fn(),
  mockFrom: vi.fn(),
}))

let queryResult: { data: Record<string, unknown>[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
}

const sharedBuilder = {
  select: mockSelect,
  order: mockOrder,
  limit: mockLimit,
  gte: mockGte,
  then: (resolve: (v: typeof queryResult) => void) => resolve(queryResult),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

function makeRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'eval_test',
    symbol: 'TEST',
    buy_timestamp: '2026-07-14T14:25:01.627Z',
    sell_timestamp: '2026-07-14T15:09:02.857Z',
    entry_price: 100,
    exit_price: 101,
    quantity: 10,
    pnl_usd: 10,
    pnl_pct: 1,
    holding_period_hours: 24,
    indicators_at_buy: {},
    buy_reasoning: 'test post-mortem',
    lessons: [],
    outcome: 'profit',
    signal_type: 'TREND_ZLE05',
    state_fingerprint: null,
    ...overrides,
  }
}

describe('getTradeEvaluations() — state_fingerprint mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(sharedBuilder)
    mockSelect.mockReturnValue(sharedBuilder)
    mockOrder.mockReturnValue(sharedBuilder)
    mockLimit.mockReturnValue(sharedBuilder)
    mockGte.mockReturnValue(sharedBuilder)
    queryResult = { data: [], error: null }
  })

  it('maps a non-null state_fingerprint column onto stateFingerprint', async () => {
    // Arrange
    const fingerprint = {
      signal_type: 'MEAN_REVERSION',
      spx_regime: 'BULL',
      market_regime: 'RANGING',
      adx_bucket: 'LOW',
      z_bucket: 'DEEP',
      macd_bucket: 'POSITIVE',
    }
    queryResult = { data: [makeRow({ state_fingerprint: fingerprint })], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    expect(result[0].stateFingerprint).toEqual(fingerprint)
  })

  it('maps a null state_fingerprint column onto stateFingerprint: null', async () => {
    // Arrange
    queryResult = { data: [makeRow({ state_fingerprint: null })], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    expect(result[0].stateFingerprint).toBeNull()
  })

  it('maps a missing state_fingerprint key (legacy row) onto stateFingerprint: null', async () => {
    // Arrange
    const row = makeRow({})
    delete row.state_fingerprint
    queryResult = { data: [row], error: null }

    // Act
    const result = await getTradeEvaluations()

    // Assert
    expect(result[0].stateFingerprint).toBeNull()
  })
})
