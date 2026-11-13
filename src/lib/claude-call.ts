import type Anthropic from '@anthropic-ai/sdk'

// ============================================================
// CLAUDE API — RETRY WITH EXPONENTIAL BACKOFF
// ============================================================

const RETRYABLE_STATUS_CODES = new Set([429, 529])

export async function callClaudeWithRetry(
  client: Anthropic,
  params: Parameters<Anthropic['messages']['create']>[0],
  maxRetries = 4
): Promise<Anthropic.Message> {
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.messages.create(params) as Anthropic.Message
    } catch (err) {
      lastError = err
      const status = (err as { status?: number }).status
      if (!status || !RETRYABLE_STATUS_CODES.has(status)) throw err

      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * 2 ** attempt, 30_000) + Math.random() * 500
        console.warn(`Claude API ${status} (attempt ${attempt + 1}/${maxRetries}) — retrying in ${Math.round(delayMs)}ms`)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }
  throw lastError
}
