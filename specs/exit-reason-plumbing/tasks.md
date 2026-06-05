# Tasks — Exit Reason Plumbing (Fase 1a)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed (`src/lib/claude-agent.ts` — return shape + exitReasons map only, no exit logic)

## Implementation Checklist

### Phase 1 — Types (`src/lib/types.ts`)

- [x] T-01: Add `ExitReason` union export (top-level, outside any function):
  ```ts
  export type ExitReason =
    | 'Z_SCORE_EXIT'
    | 'TRAILING_STOP'
    | 'PROFIT_TARGET'
    | 'STOP_LOSS'
    | 'TIME_STOP'
    | 'EMA_FAILURE'
    | 'UNKNOWN'
  ```
- [x] T-02: Add `EnforceExitResult` type export (top-level, after `ExitReason`):
  ```ts
  export type EnforceExitResult = {
    decisions: AgentLogEntry[]
    exitReasons: ReadonlyMap<string, ExitReason>
  }
  ```
  (Import `AgentLogEntry` if not already in scope in types.ts, or forward-declare as needed.)

### Phase 2 — `enforceExitRules()` changes (`src/lib/claude-agent.ts`)

- [x] T-03: Import `ExitReason` and `EnforceExitResult` from `./types` at the top of `claude-agent.ts`.
- [x] T-04: Change the function signature return type from `Promise<AgentLogEntry[]>` to `Promise<EnforceExitResult>` (line 105).
- [x] T-05: Declare `const exitReasons = new Map<string, ExitReason>()` immediately after `const exitEntries: AgentLogEntry[] = []` (line 106).
- [x] T-06: Add `toExitReason()` helper function inside `enforceExitRules()`, after the map declaration, using the exact patterns from STEP 0:
  ```ts
  function toExitReason(reason?: string | null): ExitReason {
    if (!reason?.trim()) {
      console.warn(`[EXIT_REASON_EMPTY] raw="${String(reason)}"`)
      return 'UNKNOWN'
    }
    const r = reason.trim().toUpperCase().replace(/[-\s]/g, '_')
    if (r.includes('PROFIT_TARGET'))    return 'PROFIT_TARGET'
    if (r.includes('TIME_STOP'))        return 'TIME_STOP'
    if (r.includes('FAIR_VALUE'))       return 'Z_SCORE_EXIT'
    if (r.includes('FELL_BELOW_EMA50')) return 'EMA_FAILURE'
    if (r.includes('TRAILING_STOP'))    return 'TRAILING_STOP'
    console.warn(`[EXIT_REASON_UNMATCHED] raw="${reason}"`)
    return 'UNKNOWN'
  }
  ```
- [x] T-07: After `exitEntries.push(...)` at line 270 and before the `if (ctx)` block at line 281, insert the conflict-guard:
  ```ts
  if (!exitReasons.has(position.symbol)) {
    const mapped = toExitReason(exitReason)
    exitReasons.set(position.symbol, mapped)
    console.log(`[EXIT_COOLDOWN] symbol=${position.symbol} reason=${mapped}`)
  } else {
    console.error(
      `[EXIT_REASON_CONFLICT] symbol=${position.symbol}` +
      ` existing=${exitReasons.get(position.symbol)}` +
      ` attemptedRaw="${exitReason}"`
    )
  }
  ```
- [x] T-08: Update the final return at line 304 from `return exitEntries` to:
  ```ts
  return { decisions: exitEntries, exitReasons: new Map(exitReasons) }
  ```
- [x] T-09: Verify there are no other return statements in `enforceExitRules()` that were missed (currently confirmed: only line 304).

### Phase 3 — Call site updates

- [x] T-10: Update call site 1 — the IIFE in `runAgentCycle()` at `claude-agent.ts:842-849`:
  - Change the `try` return to destructure: `const { decisions: exitRuleEntries, exitReasons: _exitReasons } = await (async () => {...})()`
  - Or restructure so the IIFE returns the full result and destructuring happens outside
  - Update the catch fallback from `return [] as AgentLogEntry[]` to `return { decisions: [], exitReasons: new Map() }`
  - Verify downstream at line 914 `[...exitRuleEntries]` still compiles correctly (`exitRuleEntries` is now `AgentLogEntry[]` after destructuring)
- [x] T-11: Update call site 2 — `run-cycle.ts:38`:
  - Change `await enforceExitRules(...)` to `const { decisions: _exitDecisions } = await enforceExitRules(...)`

### Phase 4 — Verification

- [x] T-12: Run `npx tsc --noEmit` — zero errors (pre-existing test file errors unrelated to this change)
- [x] T-13: Run `npm run build` — zero errors
- [x] T-14: Confirm no exit conditions, thresholds, or control flow were changed in `enforceExitRules()`
- [x] T-15: Confirm `exitReasons.set()` appears only after `push()` and before `removeOpenPositionContext()`
- [x] T-16: Confirm all return statements in `enforceExitRules()` return the `EnforceExitResult` shape (no mixed shapes)

## Post-Implementation

- [ ] Run `/review exit-reason-plumbing` to verify implementation matches spec
- [ ] Confirm Protected Zone changes are plumbing-only (no exit logic modified)

## Estimated Complexity

**Low-Medium** — Mechanical refactor: one return type change, one new Map, one helper function, six-line block at the SELL point, two call site destructures. Risk is limited to the IIFE restructuring at the call site and ensuring the catch branch also returns the new shape.
