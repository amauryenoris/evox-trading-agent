import { describe, it, expect, beforeEach, vi } from 'vitest'
import { insertSelectionDecision, getRecentSelections } from '../db'
import type { SelectionDecision, CandidateScore } from '../types'

const { mockInsert, mockSelect, mockOrder, mockLimit, mockFrom } = vi.hoisted(() => ({
  mockInsert: vi.fn(),
  mockSelect: vi.fn(),
  mockOrder: vi.fn(),
  mockLimit: vi.fn(),
  mockFrom: vi.fn(),
}))

let insertResult: { error: { message: string } | null } = { error: null }
let selectResult: { data: Record<string, unknown>[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
}

const sharedBuilder = {
  insert: mockInsert,
  select: mockSelect,
  order: mockOrder,
  limit: mockLimit,
  then: (resolve: (v: typeof selectResult) => void) => resolve(selectResult),
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: mockFrom }),
}))

function makeDecision(overrides: Partial<SelectionDecision> = {}): SelectionDecision {
  return {
    timestamp: '2026-08-26T00:00:00.000Z',
    candidatesOffered: [],
    selectedSymbols: ['AAPL'],
    reasoning: 'test reasoning',
    ...overrides,
  }
}

function makeScore(overrides: Partial<CandidateScore> = {}): CandidateScore {
  return {
    symbol: 'AAPL',
    score: 7.5,
    regime: 'TRENDING',
    risks: ['earnings in 3 days'],
    thesis: 'test thesis',
    ...overrides,
  }
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    created_at: '2026-08-26T00:00:00.000Z',
    candidates_offered: [],
    selected_symbols: ['AAPL'],
    reasoning: 'test reasoning',
    candidate_scores: null,
    ...overrides,
  }
}

describe('insertSelectionDecision() — candidate_scores mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(sharedBuilder)
    mockInsert.mockReturnValue(sharedBuilder)
    insertResult = { error: null }
    mockInsert.mockImplementation(() => insertResult)
  })

  it('writes candidate_scores as the provided array when candidateScores is present', async () => {
    // Arrange
    const scores = [makeScore()]
    const decision = makeDecision({ candidateScores: scores })

    // Act
    await insertSelectionDecision(decision)

    // Assert
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ candidate_scores: scores })
    )
  })

  it('writes candidate_scores as null when candidateScores is absent', async () => {
    // Arrange
    const decision = makeDecision()

    // Act
    await insertSelectionDecision(decision)

    // Assert
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ candidate_scores: null })
    )
  })
})

describe('getRecentSelections() — candidate_scores mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFrom.mockReturnValue(sharedBuilder)
    mockSelect.mockReturnValue(sharedBuilder)
    mockOrder.mockReturnValue(sharedBuilder)
    mockLimit.mockReturnValue(sharedBuilder)
    selectResult = { data: [], error: null }
  })

  it('maps a non-null candidate_scores column onto candidateScores', async () => {
    // Arrange
    const scores = [makeScore()]
    selectResult = { data: [makeRow({ candidate_scores: scores })], error: null }

    // Act
    const result = await getRecentSelections()

    // Assert
    expect(result[0].candidateScores).toEqual(scores)
  })

  it('maps a null candidate_scores column (all pre-existing rows) onto candidateScores: undefined, without error', async () => {
    // Arrange
    selectResult = { data: [makeRow({ candidate_scores: null })], error: null }

    // Act
    const result = await getRecentSelections()

    // Assert
    expect(result[0].candidateScores).toBeUndefined()
  })
})
