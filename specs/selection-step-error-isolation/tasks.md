# Tasks — Selection Step Error Isolation (stop_reason diagnostics)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Amaury has given fresh, explicit, in-conversation confirmation to touch `src/lib/claude-agent.ts` (Protected Zone) for this specific change — not inferred from the originating prompt's claimed "authorized by Jorge" note
- [x] No database migrations needed (confirmed — see design.md)

## Implementation Checklist

### Phase 1 — `stock-selector.ts` (not Protected Zone)

- [x] T-01: Define and export `SelectionStepError` near the top of `src/lib/stock-selector.ts`, alongside other local type definitions:
  ```ts
  export class SelectionStepError extends Error {
    constructor(
      public readonly step: 'claude_call' | 'json_parse' | 'db_write',
      public readonly detail: string,
      public readonly stopReason?: string | null
    ) {
      super(`Selection failed at step=${step}: ${detail}`)
      this.name = 'SelectionStepError'
    }
  }
  ```
- [x] T-02: Wrap the Claude API call (current lines 166–172) in `try/catch`; on failure throw `new SelectionStepError('claude_call', (err as Error).message ?? String(err))`.
- [x] T-03: Wrap the response-type check + `JSON.parse` (current lines 174–178) in `try/catch`; set `detail` to `'max_tokens'` when `response.stop_reason === 'max_tokens'`, otherwise the raw parse error's message; throw `new SelectionStepError('json_parse', detail, response.stop_reason)` in both cases (`stopReason` passed regardless of whether it was the primary cause).
- [x] T-04: Wrap `insertSelectionDecision(decision)` (current line 187) in `try/catch`; on failure throw `new SelectionStepError('db_write', (err as Error).message ?? String(err))`.
- [x] T-05: Confirm no other logic in `selectStocksForAnalysis()` (pre-filter, sector snapshot fetch, prompt construction, return statement) was touched.

### Phase 2 — `claude-agent.ts` (Protected Zone — requires confirmed sign-off from Pre-Implementation)

- [x] T-06: Add `import { SelectionStepError } from './stock-selector'` (or add to the existing `stock-selector` import if one is added there).
- [x] T-07: Update the `catch` block body at lines 1161–1167 to:
  ```ts
  } catch (err) {
    if (err instanceof SelectionStepError) {
      console.warn(
        `Dynamic selection failed at step=${err.step}: ${err.detail}` +
        (err.stopReason ? ` (stop_reason=${err.stopReason})` : '')
      )
    } else {
      console.warn('Dynamic selection failed at step=screener_fetch:', err)
    }
    watchlist = (process.env.TRADING_WATCHLIST ?? 'AAPL,MSFT,NVDA,XOM,CVX,MP,NEM,GOOGL,META')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  ```
- [x] T-08: Confirm no other line in `claude-agent.ts` was touched (diff should be the new import + this one block).

### Phase 3 — Testing (`src/lib/__tests__/stock-selector.test.ts`)

- [x] T-09: Test — Claude API call rejects (`mockMessagesCreate.mockRejectedValue(...)`) → `selectStocksForAnalysis()` rejects with a `SelectionStepError` where `step === 'claude_call'`.
- [x] T-10: Test — response text is malformed JSON and `stop_reason` is `'max_tokens'` (mock `messages.create` to resolve with `{ content: [{ type: 'text', text: '<truncated>' }], stop_reason: 'max_tokens' }`) → rejects with `step === 'json_parse'`, `detail === 'max_tokens'`, `stopReason === 'max_tokens'`.
- [x] T-11: Test — response text is malformed JSON with `stop_reason` absent or a different value (e.g. `'end_turn'`) → rejects with `step === 'json_parse'`, `detail` equal to the raw parse error message (not `'max_tokens'`), distinguishable from T-10.
- [x] T-12: Test — `insertSelectionDecision` rejects (`mockInsertSelectionDecision.mockRejectedValue(...)`) → rejects with `step === 'db_write'`.
- [x] T-13: Confirm (by inspection, no new test file per design.md's Open Questions) that a `getMarketMovers()` failure or `< 10` candidates in `claude-agent.ts` still logs via the `screener_fetch` / non-`SelectionStepError` branch. Verified: both throw a plain `Error` (not `SelectionStepError`), so `err instanceof SelectionStepError` is `false` and the `else` branch (`step=screener_fetch`) fires — matches pre-change behavior.

### Phase 4 — Verification

- [x] T-14: `npx tsc --noEmit` passes.
- [x] T-15: `npm run build` passes.
- [x] T-16: Confirm the fallback watchlist's value and the fact that it triggers are byte-identical to pre-change behavior in every failure scenario (T-09 through T-13) — only the `console.warn` text changed. Verified via `git diff` on `claude-agent.ts`: the `watchlist = (process.env.TRADING_WATCHLIST ?? '...').split(',').map(...).filter(...)` block is untouched, byte-identical, in both the `SelectionStepError` and `screener_fetch` branches.
- [x] T-17: Report the final line count of both `src/lib/stock-selector.ts` and `src/lib/claude-agent.ts`. — `stock-selector.ts`: 247 lines. `claude-agent.ts`: 2435 lines (net +9 from this change; the file was already large pre-existing, out of scope to refactor here).

## Post-Implementation

- [x] Run `/review selection-step-error-isolation` to verify implementation matches spec — see `specs/selection-step-error-isolation/review.md` (APPROVED)
- [x] Confirm `src/lib/claude-agent.ts`'s diff is limited to the new import + the one `catch` block (Protected Zone audit) — verified via `git diff`, see T-08.

## Estimated Complexity

**Low** — one new error class, three mechanical `try/catch` wraps in a non-Protected file, and a small branch in one existing `catch` block in a Protected file. No new data flow, no schema changes, no behavior change outside logging. The only friction is re-confirming Protected Zone sign-off before Phase 2.
