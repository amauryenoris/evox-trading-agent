# Tasks — Cooldown Gate Fase 1b (Same-Process Re-entry)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone change confirmed — `src/lib/claude-agent.ts` approved for modification

---

## Implementation Checklist

### Phase 1 — Call site fix (prerequisite)
- [x] T-01: `src/lib/claude-agent.ts` line 872 — update outer destructuring to also capture `exitReasons`:
  ```typescript
  const { decisions: exitRuleEntries, exitReasons } = await (async () => { ... })()
  ```
  The IIFE already returns the full `EnforceExitResult`; only the outer binding needs updating.

### Phase 2 — Module-level constant
- [x] T-02: `src/lib/claude-agent.ts` — declare near other module-level config constants:
  ```typescript
  const COOLDOWN_UNKNOWN_EXIT_REASON = false
  // Set true to also cooldown symbols with unmapped exit reasons.
  // Default false to avoid blocking valid re-entries from unknown exits.
  ```

### Phase 3 — Build cooldownSymbols
- [x] T-03: `src/lib/claude-agent.ts` — add the `cooldownSymbols` block in `runAgentCycle()`,
  immediately after the `closedThisCycle` Set declaration (line 968), before the
  `for (const symbol of watchlist)` loop. Include:
  - Sequencing comment (verbatim from spec)
  - NOTE 1 and NOTE 2 known-limitation comments
  - Full loop with UNKNOWN handling, TIME_STOP exclusion, `[EXIT_COOLDOWN_ADD]` logging
  - `[EXIT_COOLDOWN_READY]` log after the loop

### Phase 4 — Re-entry gate
- [x] T-04: `src/lib/claude-agent.ts` lines 988–991 — replace:
  ```typescript
  if (closedThisCycle.has(symbol)) {
    console.log(`[AGENT] ${symbol} skipped — closed by GTC this cycle, cooldown`)
    continue
  }
  ```
  With:
  ```typescript
  const skipReason =
    closedThisCycle.has(symbol) ? 'GTC_STOP' :
    cooldownSymbols.has(symbol) ? (exitReasons.get(symbol) ?? 'UNKNOWN') :
    null

  if (skipReason) {
    console.log(`[AGENT] ${symbol} skipped — cooldown: ${skipReason}`)
    continue
  }
  ```

### Phase 5 — Cycle stats
- [x] T-05: `src/lib/claude-agent.ts` — add `[EXIT_COOLDOWN_STATS]` log immediately after the
  existing TEMP stats at line 1612, before the ranking phase at line 1614:
  ```typescript
  const activeBreakdown = [...cooldownSymbols]
    .map(sym => `${sym}:${exitReasons.get(sym)}`)
    .join(',')

  const excludedBreakdown = [...exitReasons.entries()]
    .filter(([, reason]) =>
      reason === 'TIME_STOP' || reason === 'UNKNOWN'
    )
    .map(([sym, reason]) => `${sym}:${reason}`)
    .join(',')

  console.log(
    `[EXIT_COOLDOWN_STATS]` +
    ` total=${cooldownSymbols.size}` +
    ` active=${activeBreakdown || 'none'}` +
    ` excluded=${excludedBreakdown || 'none'}`
  )
  ```

### Phase 6 — Tests
- [x] T-06: `src/lib/__tests__/cooldown-gate-fase-1b.test.ts` — write Vitest unit tests
  covering the three acceptance test cases:
  - **TC-1 same-process re-entry**: exitReasons has `AVGO → Z_SCORE_EXIT` →
    `cooldownSymbols.has('AVGO') === true`
  - **TC-2 TIME_STOP exemption**: exitReasons has `NVDA → TIME_STOP` →
    `cooldownSymbols.has('NVDA') === false`
  - **TC-3 UNKNOWN with flag=false**: exitReasons has `MSFT → UNKNOWN` →
    `cooldownSymbols.has('MSFT') === false`, warning emitted
  - **TC-4 UNKNOWN with flag=true**: flag set to true →
    `cooldownSymbols.has('MSFT') === true`
  - **TC-5 skipReason ternary**: `closedThisCycle` takes priority over `cooldownSymbols`
  
  Tests replicate the `cooldownSymbols` build logic inline (do not import from
  `claude-agent.ts`) — same decoupling pattern as other signal tests.

- [x] T-07: Verify 80% coverage on new code paths

---

## Post-Implementation

- [ ] Run `npx tsc --noEmit` — must pass with 0 errors
- [ ] Run `npm run build` — must pass
- [ ] Run `/review cooldown-gate-fase-1b` to verify implementation matches spec
- [ ] Confirm `enforceExitRules()` body is unchanged (diff check)
- [ ] Confirm `closedThisCycle` Set initialization is unchanged (only the skip check is replaced)

---

## Acceptance Test Cases (manual verification)

**TC-1 — same-process re-entry (core acceptance criteria):**
1. AVGO exits via z-score SELL in `enforceExitRules()`
2. `exitReasons` contains `AVGO → Z_SCORE_EXIT`
3. BUY evaluation runs later in same process
4. AVGO setup becomes valid again
5. `cooldownSymbols.has('AVGO') === true`
6. BUY skipped, log: `[AGENT] AVGO skipped — cooldown: Z_SCORE_EXIT` ✅

**TC-2 — TIME_STOP exemption (design exception):**
1. NVDA exits via `TIME_STOP` in `enforceExitRules()`
2. `exitReasons` contains `NVDA → TIME_STOP`
3. BUY evaluation runs later in same process
4. NVDA setup becomes valid again
5. `cooldownSymbols.has('NVDA') === false`
6. Re-entry remains ALLOWED — no skip log for NVDA ✅

**TC-3 — cross-run (known limitation):**
AVGO exits in run A, new run B starts — AVGO may re-enter.
This is expected and documented, NOT a failure ✅

---

## Estimated Complexity

**Low** — single file, ~35 lines added, no new types, no DB, no new abstractions.
All logic is pure Set operations on an existing Map.
