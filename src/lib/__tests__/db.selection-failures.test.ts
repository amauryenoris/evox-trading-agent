import { describe, it, expect, beforeEach, vi } from 'vitest'
import { insertSelectionFailure } from '../db'
import type { SelectionFailure } from '../types'

const { mockInsert, mockFrom } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockFrom: vi.fn(),
}))

let insertResult: { error: { message: string } | null } = { error: null }

const sharedBuilder = {
  insert: mockInsert,
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

function makeFailure(overrides: Partial<SelectionFailure> = {}): SelectionFailure {
  return {
    failureStep: 'json_parse',
    failureDetail: 'max_tokens',
    ...overrides,
  }
}

describe('insertSelectionFailure()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(sharedBuilder)
    insertResult = { error: null }
    mockInsert.mockImplementation(() => insertResult)
  })

  it('writes failure_step and failure_detail mapped from failureStep and failureDetail', async () => {
    // Arrange
    const failure = makeFailure({ failureStep: 'claude_call', failureDetail: 'rate limited' })

    // Act
    await insertSelectionFailure(failure)

    // Assert
    expect(mockFrom).toHaveBeenCalledWith('selection_failures')
    expect(mockInsert).toHaveBeenCalledWith({
      failure_step: 'claude_call',
      failure_detail: 'rate limited',
    })
  })

  it('throws when the Supabase client returns an error', async () => {
    // Arrange
    insertResult = { error: { message: 'connection refused' } }
    const failure = makeFailure()

    // Act
    const attempt = insertSelectionFailure(failure)

    // Assert
    await expect(attempt).rejects.toThrow('Failed to insert selection failure: connection refused')
  })
})
