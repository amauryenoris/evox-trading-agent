import { describe, it, expect, vi, beforeEach } from 'vitest'

// Replicates the pre-fetch XOR guard added to handleGenerate() in
// GenerateReportButton.tsx. The component is not rendered here (no jsdom /
// @testing-library/react in this project's Vitest setup — environment is
// 'node', see vitest.config.ts) — this mirrors the project's existing
// pattern of replicating logic inline rather than importing/rendering
// (see CLAUDE.md: "Signal condition tests replicate the detection logic
// inline rather than importing from claude-agent.ts").
function shouldBlockSubmit(weekStart: string, weekEnd: string): boolean {
  return (weekStart !== '' && weekEnd === '') || (weekStart === '' && weekEnd !== '')
}

async function handleGenerate(
  weekStart: string,
  weekEnd: string,
  fetchImpl: typeof fetch
): Promise<{ blocked: boolean; error: string | null }> {
  if (shouldBlockSubmit(weekStart, weekEnd)) {
    return { blocked: true, error: 'Both start and end dates must be provided together' }
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
})
