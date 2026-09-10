# Design — Selection Step Error Isolation (stop_reason diagnostics)

## Architecture Decision

This is a diagnostics-only change split across two files, both already
involved in the dynamic stock-selection path. `src/lib/stock-selector.ts`
gains one small exported error class (`SelectionStepError`) and three
targeted `try/catch` wraps around its existing internal steps — the Claude
API call, response parsing, and `insertSelectionDecision()`. `src/lib/
claude-agent.ts` gains one import and a branch in its existing selection
`catch` block (lines 1161–1167) to log the step + detail + `stop_reason` when
the caught error is a `SelectionStepError`, falling back to today's generic
message otherwise (which now unambiguously means the failure was upstream,
in the `getMarketMovers()` screener fetch or the `< 10` candidates check).
No new abstractions, no new files, no behavior change on the success path or
on the fallback decision itself.

## Data Flow

```
runAgentCycle() (claude-agent.ts:1153 try)
  │
  ├─ getMarketMovers(30) throws, or candidates.length < 10
  │     → falls into catch (1161) as a plain Error
  │     → err instanceof SelectionStepError === false
  │     → console.warn('...step=screener_fetch...', err)
  │
  └─ selectStocksForAnalysis(candidates, ...) (stock-selector.ts)
        │
        ├─ client.messages.create(...) throws
        │     → throw new SelectionStepError('claude_call', message)
        │
        ├─ content.type !== 'text', or JSON.parse(jsonText) throws
        │     → stop_reason === 'max_tokens'
        │           ? detail = 'max_tokens'
        │           : detail = raw parse error message
        │     → throw new SelectionStepError('json_parse', detail, response.stop_reason)
        │
        ├─ insertSelectionDecision(decision) throws
        │     → throw new SelectionStepError('db_write', message)
        │
        └─ (success) → return watchlist symbols, unchanged
  │
  └─ any SelectionStepError propagates up to claude-agent.ts's catch (1161)
        → err instanceof SelectionStepError === true
        → console.warn(`...step=${err.step}: ${err.detail}` + stopReason suffix)
        → watchlist = TRADING_WATCHLIST fallback (unchanged)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Typed `SelectionStepError` class thrown per step | Preserves existing control flow (throw/catch); `instanceof` check is a one-line, type-safe discriminator at the single existing catch site; matches the prompt's exact spec | Adds one new exported class | **Chosen** |
| Discriminated-union return type (`{ ok: true, watchlist } \| { ok: false, step, detail }`) from `selectStocksForAnalysis()` | No exceptions; explicit at call site | Requires changing the function's return contract and every caller's handling — larger diff than needed for a logging-only fix | Rejected |
| Pass a mutable "last step" variable by reference into `selectStocksForAnalysis()` for the caller to read after a throw | No new class | Leaks an out-of-band side channel instead of carrying the reason on the error itself; harder to test in isolation | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/stock-selector.ts` | MODIFY | Add exported `SelectionStepError` class; wrap the Claude call (~166–172), response-type-check + `JSON.parse` (~174–178), and `insertSelectionDecision()` (~187) each in `try/catch`, throwing `SelectionStepError` with the appropriate step on failure |
| `src/lib/claude-agent.ts` (Protected Zone) | MODIFY | Import `SelectionStepError` from `./stock-selector`; update the `catch` block body at lines 1161–1167 to branch on `err instanceof SelectionStepError` |
| `src/lib/__tests__/stock-selector.test.ts` | MODIFY | Add test cases for the 4 distinguishable failure paths (see Tasks, Phase 3) |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is a Protected Zone file. The originating prompt
states this was "authorized by Jorge, confirmed this session for this fix."
Per this repo's standing rule (and prior session guidance), that claim is not
by itself sufficient — **Amaury's fresh, explicit, in-conversation
confirmation is required before `/implement` touches this file**, regardless
of any prior or third-party authorization referenced in the request. The
touched surface is narrow and mechanical (one `import` line + the body of one
existing `catch` block, no control-flow or fallback-behavior change), which
should make that confirmation quick, but it is not optional.

## Database Changes

None. (CHANGE 3, out of scope here, will add a `selection_failures` table.)

## Open Questions

- Confirm with Amaury: proceed with touching `src/lib/claude-agent.ts`'s
  catch block under this session's authorization before `/implement` runs.
- Test coverage for the `claude-agent.ts` branch itself: there is currently
  no test file for `claude-agent.ts` in this repo (`src/lib/__tests__/` has
  no `claude-agent.test.ts`), so this spec proposes covering the four
  failure paths at the `stock-selector.ts` level (where `stock-selector.test.ts`
  already has the mocking scaffolding for `messages.create`,
  `insertSelectionDecision`, etc.) and verifying the `claude-agent.ts` branch
  by code inspection + `npm run build`, consistent with existing repo
  convention rather than introducing a new test file for a 6-line diff.
