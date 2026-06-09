import { describe, it, expect, beforeEach, vi } from 'vitest'
import { upsertSymbolCooldown, getActiveCooldowns, cleanExpiredCooldowns } from '../db'

const { mockRpc, mockFrom, mockSelect, mockGt, mockLimit, mockDelete, mockLte } = vi.hoisted(() => ({
  mockRpc:    vi.fn(),
  mockFrom:   vi.fn(),
  mockSelect: vi.fn(),
  mockGt:     vi.fn(),
  mockLimit:  vi.fn(),
  mockDelete: vi.fn(),
  mockLte:    vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom, rpc: mockRpc }),
}))

const ok = { data: null, error: null }
const err = { data: null, error: { message: 'db failure' } }

describe('upsertSymbolCooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue(ok)
  })

  it('calls rpc with correct params including ISO cooldown date', async () => {
    // Arrange
    const until = new Date('2026-06-15T00:00:00Z')

    // Act
    await upsertSymbolCooldown('AAPL', 'STOP_LOSS', until)

    // Assert
    expect(mockRpc).toHaveBeenCalledWith('upsert_symbol_cooldown', {
      p_symbol:         'AAPL',
      p_exit_reason:    'STOP_LOSS',
      p_cooldown_until: '2026-06-15T00:00:00.000Z',
    })
  })

  it('logs [COOLDOWN_WRITE_ERROR] and does not throw on DB error', async () => {
    // Arrange
    mockRpc.mockResolvedValue(err)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act + Assert (no throw)
    await expect(
      upsertSymbolCooldown('TSLA', 'PROFIT_TARGET', new Date())
    ).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[COOLDOWN_WRITE_ERROR]'),
      'db failure'
    )
    consoleSpy.mockRestore()
  })
})

describe('getActiveCooldowns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters by cooldown_until > now and returns the rows', async () => {
    // Arrange
    const rows = [
      { symbol: 'NVDA', exit_reason: 'STOP_LOSS', cooldown_until: '2026-06-20T00:00:00Z' },
    ]
    mockLimit.mockResolvedValue({ data: rows, error: null })
    mockGt.mockReturnValue({ limit: mockLimit })
    mockSelect.mockReturnValue({ gt: mockGt })
    mockFrom.mockReturnValue({ select: mockSelect })

    // Act
    const result = await getActiveCooldowns()

    // Assert
    expect(mockFrom).toHaveBeenCalledWith('symbol_cooldowns')
    expect(mockSelect).toHaveBeenCalledWith('symbol, exit_reason, cooldown_until')
    expect(mockGt).toHaveBeenCalledWith('cooldown_until', expect.any(String))
    expect(mockLimit).toHaveBeenCalledWith(100)
    expect(result).toEqual(rows)
  })

  it('logs [COOLDOWN_READ_ERROR] and returns [] on DB error', async () => {
    // Arrange
    mockLimit.mockResolvedValue(err)
    mockGt.mockReturnValue({ limit: mockLimit })
    mockSelect.mockReturnValue({ gt: mockGt })
    mockFrom.mockReturnValue({ select: mockSelect })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act
    const result = await getActiveCooldowns()

    // Assert
    expect(result).toEqual([])
    expect(consoleSpy).toHaveBeenCalledWith('[COOLDOWN_READ_ERROR]', 'db failure')
    consoleSpy.mockRestore()
  })

  it('returns [] when data is null (no active cooldowns)', async () => {
    // Arrange
    mockLimit.mockResolvedValue({ data: null, error: null })
    mockGt.mockReturnValue({ limit: mockLimit })
    mockSelect.mockReturnValue({ gt: mockGt })
    mockFrom.mockReturnValue({ select: mockSelect })

    // Act
    const result = await getActiveCooldowns()

    // Assert
    expect(result).toEqual([])
  })
})

describe('cleanExpiredCooldowns', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deletes with lte (not lt) on cooldown_until', async () => {
    // Arrange
    mockLte.mockResolvedValue(ok)
    mockDelete.mockReturnValue({ lte: mockLte })
    mockFrom.mockReturnValue({ delete: mockDelete })

    // Act
    await cleanExpiredCooldowns()

    // Assert
    expect(mockFrom).toHaveBeenCalledWith('symbol_cooldowns')
    expect(mockDelete).toHaveBeenCalled()
    expect(mockLte).toHaveBeenCalledWith('cooldown_until', expect.any(String))
  })

  it('logs [COOLDOWN_CLEAN_ERROR] and does not throw on DB error', async () => {
    // Arrange
    mockLte.mockResolvedValue(err)
    mockDelete.mockReturnValue({ lte: mockLte })
    mockFrom.mockReturnValue({ delete: mockDelete })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act + Assert (no throw)
    await expect(cleanExpiredCooldowns()).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith('[COOLDOWN_CLEAN_ERROR]', 'db failure')
    consoleSpy.mockRestore()
  })
})
