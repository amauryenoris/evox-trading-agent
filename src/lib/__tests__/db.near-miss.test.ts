import { describe, it, expect, beforeEach, vi } from 'vitest'
import { cleanupExpiredNearMisses, cancelRevertedMRNearMisses } from '../db'

const { mockUpdate, mockEq, mockLt, mockGt, mockFrom } = vi.hoisted(() => ({
  mockUpdate: vi.fn(),
  mockEq: vi.fn(),
  mockLt: vi.fn(),
  mockGt: vi.fn(),
  mockFrom: vi.fn(),
}))

const sharedBuilder = {
  update: mockUpdate,
  eq: mockEq,
  lt: mockLt,
  gt: mockGt,
  then: (resolve: (v: { data: null; error: null }) => void) =>
    resolve({ data: null, error: null }),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

describe('near-miss watchlist lifecycle db helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(sharedBuilder)
    mockUpdate.mockReturnValue(sharedBuilder)
    mockEq.mockReturnValue(sharedBuilder)
    mockLt.mockReturnValue(sharedBuilder)
    mockGt.mockReturnValue(sharedBuilder)
  })

  describe('cleanupExpiredNearMisses', () => {
    it('updates ACTIVE entries to EXPIRED where expires_at is in the past', async () => {
      // Act
      await cleanupExpiredNearMisses()

      // Assert
      expect(mockFrom).toHaveBeenCalledWith('near_miss_watchlist')
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'EXPIRED' })
      expect(mockEq).toHaveBeenCalledWith('status', 'ACTIVE')
      expect(mockLt).toHaveBeenCalledWith('expires_at', expect.any(String))
    })
  })

  describe('cancelRevertedMRNearMisses', () => {
    it('updates ACTIVE MEAN_REVERSION entries to CANCELLED where latest_zscore exceeds threshold', async () => {
      // Arrange
      const threshold = -1.0

      // Act
      await cancelRevertedMRNearMisses(threshold)

      // Assert
      expect(mockFrom).toHaveBeenCalledWith('near_miss_watchlist')
      expect(mockUpdate).toHaveBeenCalledWith({ status: 'CANCELLED' })
      expect(mockEq).toHaveBeenCalledWith('signal_type', 'MEAN_REVERSION')
      expect(mockGt).toHaveBeenCalledWith('latest_zscore', threshold)
      expect(mockGt).toHaveBeenCalledWith('expires_at', expect.any(String))
    })

    it('applies MEAN_REVERSION filter — non-MR entries are excluded by construction', async () => {
      // Act
      await cancelRevertedMRNearMisses(-1.0)

      // Assert — exactly one signal_type filter, and it must be MEAN_REVERSION
      const eqCalls = mockEq.mock.calls as Array<[string, unknown]>
      const signalTypeCalls = eqCalls.filter(([key]) => key === 'signal_type')
      expect(signalTypeCalls).toHaveLength(1)
      expect(signalTypeCalls[0]).toEqual(['signal_type', 'MEAN_REVERSION'])
    })
  })
})
