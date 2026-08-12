import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cancelOrder } from '../alpaca'

function mockFetch204() {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
  }))
}

beforeEach(() => {
  process.env.ALPACA_API_KEY    = 'test-key'
  process.env.ALPACA_SECRET_KEY = 'test-secret'
  process.env.ALPACA_BASE_URL   = 'https://paper-api.alpaca.markets'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('cancelOrder', () => {
  it('resolves to undefined without throwing on a 204 response', async () => {
    // Arrange
    mockFetch204()

    // Act
    const result = await cancelOrder('order-123')

    // Assert
    expect(result).toBeUndefined()
  })
})
