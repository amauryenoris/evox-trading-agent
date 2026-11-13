import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { callClaudeWithRetry } from '../claude-call'

const PARAMS = { model: 'claude-sonnet-4-6', max_tokens: 1024, messages: [{ role: 'user' as const, content: 'prompt' }] }
const ADVANCE_ALL_MS = 300_000

function statusError(status: number | undefined, message: string): Error {
  return Object.assign(new Error(message), status === undefined ? {} : { status })
}

function fakeClient(create: ReturnType<typeof vi.fn>): Anthropic {
  return { messages: { create } } as unknown as Anthropic
}

async function run(create: ReturnType<typeof vi.fn>, maxRetries?: number) {
  const startedAt = Date.now()
  let rejectedAtMs = -1
  const settled = (maxRetries === undefined
    ? callClaudeWithRetry(fakeClient(create), PARAMS)
    : callClaudeWithRetry(fakeClient(create), PARAMS, maxRetries)
  ).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => { rejectedAtMs = Date.now() - startedAt; return { ok: false as const, error } },
  )
  await vi.advanceTimersByTimeAsync(ADVANCE_ALL_MS)
  const outcome = await settled
  return { outcome, rejectedAtMs }
}

describe('callClaudeWithRetry', () => {
  let warn: ReturnType<typeof vi.spyOn>
  let random: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    random = vi.spyOn(Math, 'random').mockReturnValue(0)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns the client result untouched on the first call, passing the parameters unchanged and without warning', async () => {
    // Arrange
    const message = { content: [] }
    const create = vi.fn().mockResolvedValue(message)

    // Act
    const { outcome } = await run(create)

    // Assert
    expect(outcome).toEqual({ ok: true, value: message })
    expect(outcome.ok && outcome.value).toBe(message)
    expect(create).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledWith(PARAMS)
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    [0, 1000],
    [0.5, 1250],
    [1, 1500],
  ])('429 then success: retries once and the delay is 1000 + 500 * random (random %s gives %sms)', async (randomValue, delayMs) => {
    // Arrange
    random.mockReturnValue(randomValue)
    const message = { content: [] }
    const create = vi.fn().mockRejectedValueOnce(statusError(429, 'rate limited')).mockResolvedValueOnce(message)

    // Act
    const { outcome } = await run(create)

    // Assert
    expect(outcome.ok && outcome.value).toBe(message)
    expect(create).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(`Claude API 429 (attempt 1/4) — retrying in ${delayMs}ms`)
  })

  it('529 behaves like 429', async () => {
    // Arrange
    const create = vi.fn().mockRejectedValueOnce(statusError(529, 'overloaded')).mockResolvedValueOnce({ content: [] })

    // Act
    const { outcome } = await run(create)

    // Assert
    expect(outcome.ok).toBe(true)
    expect(create).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith('Claude API 529 (attempt 1/4) — retrying in 1000ms')
  })

  it('a retryable status on every attempt makes 5 calls at 0, 1000, 3000, 7000 and 15000 ms and rethrows the last error without waiting after it', async () => {
    // Arrange
    const startedAt = Date.now()
    const callTimes: number[] = []
    const lastError = statusError(429, 'rate limited')
    const create = vi.fn().mockImplementation(async () => { callTimes.push(Date.now() - startedAt); throw lastError })

    // Act
    const { outcome, rejectedAtMs } = await run(create)

    // Assert
    expect(outcome.ok).toBe(false)
    expect(!outcome.ok && outcome.error).toBe(lastError)
    expect(create).toHaveBeenCalledTimes(5)
    expect(callTimes).toEqual([0, 1000, 3000, 7000, 15000])
    expect(rejectedAtMs).toBe(15000)
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'Claude API 429 (attempt 1/4) — retrying in 1000ms',
      'Claude API 429 (attempt 2/4) — retrying in 2000ms',
      'Claude API 429 (attempt 3/4) — retrying in 4000ms',
      'Claude API 429 (attempt 4/4) — retrying in 8000ms',
    ])
  })

  it('a non-retryable status (400) is thrown immediately: one call and no warn', async () => {
    // Arrange
    const badRequest = statusError(400, 'bad request')
    const create = vi.fn().mockRejectedValue(badRequest)

    // Act
    const { outcome } = await run(create)

    // Assert
    expect(!outcome.ok && outcome.error).toBe(badRequest)
    expect(create).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('an error without status is thrown immediately: one call and no warn', async () => {
    // Arrange
    const networkError = statusError(undefined, 'claude boom')
    const create = vi.fn().mockRejectedValue(networkError)

    // Act
    const { outcome } = await run(create)

    // Assert
    expect(!outcome.ok && outcome.error).toBe(networkError)
    expect(create).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('maxRetries 1 makes 2 calls and the warn says attempt 1/1', async () => {
    // Arrange
    const lastError = statusError(429, 'rate limited')
    const create = vi.fn().mockRejectedValue(lastError)

    // Act
    const { outcome } = await run(create, 1)

    // Assert
    expect(!outcome.ok && outcome.error).toBe(lastError)
    expect(create).toHaveBeenCalledTimes(2)
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual(['Claude API 429 (attempt 1/1) — retrying in 1000ms'])
  })

  it('maxRetries 0 makes 1 call and no warn', async () => {
    // Arrange
    const lastError = statusError(429, 'rate limited')
    const create = vi.fn().mockRejectedValue(lastError)

    // Act
    const { outcome } = await run(create, 0)

    // Assert
    expect(!outcome.ok && outcome.error).toBe(lastError)
    expect(create).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it.each([
    [0, [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]],
    [1, [1500, 2500, 4500, 8500, 16500, 30500, 30500, 30500]],
  ])('the delay doubles and is capped at 30000 ms before the jitter (random %s)', async (randomValue, delays) => {
    // Arrange
    random.mockReturnValue(randomValue)
    const create = vi.fn().mockRejectedValue(statusError(429, 'rate limited'))

    // Act
    await run(create, 8)

    // Assert
    expect(create).toHaveBeenCalledTimes(9)
    expect(warn.mock.calls.map((call: unknown[]) => call[0])).toEqual(
      delays.map((delayMs, index) => `Claude API 429 (attempt ${index + 1}/8) — retrying in ${delayMs}ms`),
    )
  })
})
