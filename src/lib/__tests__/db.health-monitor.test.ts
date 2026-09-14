import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getLatestHealthSnapshots } from '../db'
import type { PositionHealthSnapshot } from '../types'

const { mockFrom, mockSelect, mockOrder, mockLimit } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockSelect: vi.fn(),
  mockOrder: vi.fn(),
  mockLimit: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

function makeSnapshot(overrides: Partial<PositionHealthSnapshot> = {}): PositionHealthSnapshot {
  return {
    id: '1',
    symbol: 'AAPL',
    position_buy_timestamp: '2026-09-01T14:30:00.000Z',
    snapshot_timestamp: '2026-09-11T17:11:35.620Z',
    entry_adx_bucket: 'MID',
    entry_macd_bucket: 'POSITIVE',
    entry_z_bucket: 'DEEP',
    entry_spx_regime: 'BULL',
    current_adx_bucket: 'HIGH',
    current_macd_bucket: 'POSITIVE',
    current_z_bucket: 'CONTINUATION',
    current_spx_regime: 'BULL',
    current_adx: 27.4,
    current_macd_histogram: 1.23,
    current_z_score: -0.4,
    current_price: 231.5,
    days_since_entry: 7,
    ...overrides,
  }
}

describe('getLatestHealthSnapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrder.mockReturnValue({ limit: mockLimit })
    mockSelect.mockReturnValue({ order: mockOrder })
    mockFrom.mockReturnValue({ select: mockSelect })
  })

  it('orders by snapshot_timestamp descending, limits to 20, and returns the rows', async () => {
    // Arrange
    const rows = [makeSnapshot({ id: '1' }), makeSnapshot({ id: '2', symbol: 'NVDA' })]
    mockLimit.mockResolvedValue({ data: rows, error: null })

    // Act
    const result = await getLatestHealthSnapshots()

    // Assert
    expect(mockFrom).toHaveBeenCalledWith('position_health_snapshots')
    expect(mockSelect).toHaveBeenCalledWith('*')
    expect(mockOrder).toHaveBeenCalledWith('snapshot_timestamp', { ascending: false })
    expect(mockLimit).toHaveBeenCalledWith(20)
    expect(result).toEqual(rows)
  })

  it('returns an empty array when no rows exist', async () => {
    // Arrange
    mockLimit.mockResolvedValue({ data: [], error: null })

    // Act
    const result = await getLatestHealthSnapshots()

    // Assert
    expect(result).toEqual([])
  })

  it('returns an empty array when data is null', async () => {
    // Arrange
    mockLimit.mockResolvedValue({ data: null, error: null })

    // Act
    const result = await getLatestHealthSnapshots()

    // Assert
    expect(result).toEqual([])
  })

  it('throws on a Supabase error', async () => {
    // Arrange
    mockLimit.mockResolvedValue({ data: null, error: { message: 'connection lost' } })

    // Act + Assert
    await expect(getLatestHealthSnapshots()).rejects.toThrow(
      'Failed to fetch position health snapshots: connection lost'
    )
  })
})
