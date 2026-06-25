import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isDateRangeIncomplete, isDateRangeInverted } from '../report-validation'

// Replicates the pre-fetch guard sequence added to handleGenerate() in
// GenerateReportButton.tsx, but imports the REAL isDateRangeIncomplete /
// isDateRangeInverted from report-validation.ts (the same module
// GenerateReportButton.tsx and route.ts both import) — only the
// fetch-orchestration shell is replicated, not the validation logic itself.
// The component is not rendered here (no jsdom / @testing-library/react in
// this project's Vitest setup — environment is 'node', see vitest.config.ts).
async function handleGenerate(
  weekStart: string,
  weekEnd: string,
  fetchImpl: typeof fetch
): Promise<{ blocked: boolean; error: string | null }> {
  if (isDateRangeIncomplete(weekStart, weekEnd)) {
    return { blocked: true, error: 'Both start and end dates must be provided together' }
  }
  if (weekStart && weekEnd && isDateRangeInverted(weekStart, weekEnd)) {
    return { blocked: true, error: 'Start date must be before or equal to end date' }
  }
  const body = weekStart && weekEnd ? { weekStart, weekEnd } : {}
  await fetchImpl('/api/reports/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { blocked: false, error: null }
}

describe('GenerateReportButton — client-side XOR guard', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ success: true, reportId: 'r1', report: {} }),
    })
  })

  it('blocks submit and does not call fetch when only weekStart is filled', async () => {
    const result = await handleGenerate('2026-06-01', '', fetchMock as unknown as typeof fetch)
    expect(result.blocked).toBe(true)
    expect(result.error).toBe('Both start and end dates must be provided together')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks submit and does not call fetch when only weekEnd is filled', async () => {
    const result = await handleGenerate('', '2026-06-14', fetchMock as unknown as typeof fetch)
    expect(result.blocked).toBe(true)
    expect(result.error).toBe('Both start and end dates must be provided together')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows submit with both dates empty — falls back to current week', async () => {
    const result = await handleGenerate('', '', fetchMock as unknown as typeof fetch)
    expect(result.blocked).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({})
  })

  it('allows submit with both dates filled — sends both values', async () => {
    const result = await handleGenerate('2026-06-01', '2026-06-14', fetchMock as unknown as typeof fetch)
    expect(result.blocked).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, options] = fetchMock.mock.calls[0]
    expect(JSON.parse(options.body)).toEqual({ weekStart: '2026-06-01', weekEnd: '2026-06-14' })
  })

  it('blocks submit and does not call fetch when weekStart is after weekEnd', async () => {
    const result = await handleGenerate('2026-06-14', '2026-06-01', fetchMock as unknown as typeof fetch)
    expect(result.blocked).toBe(true)
    expect(result.error).toBe('Start date must be before or equal to end date')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('allows submit when weekStart equals weekEnd', async () => {
    const result = await handleGenerate('2026-06-01', '2026-06-01', fetchMock as unknown as typeof fetch)
    expect(result.blocked).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
