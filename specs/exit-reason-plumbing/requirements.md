# Requirements — Exit Reason Plumbing (Fase 1a)

## STEP 0 — Pre-implementation findings

### enforceExitRules() return statements

**Current signature**: `export async function enforceExitRules(...): Promise<AgentLogEntry[]>` (line 105)

**Return statements** (1 total — no early returns; loop uses `continue`):
- **Line 304**: `return exitEntries` — `exitEntries` is `AgentLogEntry[]`, populated only on successful SELL.

### exitReason values at each SELL branch

`exitReason` is declared at **line 132**: `let exitReason: string | null = null`

The guard at **line 252** (`if (!exitReason) { ... continue }`) ensures `exitReason` is always non-null at the single `exitEntries.push()` call at **line 270**. There is no branch where `push()` fires with a null/empty exitReason.

| Branch | Line | Exact exitReason template | Nullable risk |
|--------|------|--------------------------|---------------|
| Profit target | 136 | `Exit rule: profit target reached (X.X% >= 10%)` | None — guard at 252 |
| Time stop | 139 | `Exit rule: 20-day time stop (N trading days open)` | None — guard at 252 |
| MR z-score | 145 | `Exit rule: z-score X.XXX >= -0.8 — price reverted to fair value` | None — guard at 252 |
| Trend/EMA50 | 152 | `Exit rule: price $X.XX fell below EMA50 $X.XX` | None — guard at 252 |
| EMA Reclaim | 159 | `Exit rule: EMA Reclaim failed — price $X.XX fell below EMA50 $X.XX` | None — guard at 252 |
| Trailing stop | 244 | `Trailing stop triggered: price $X.XX <= stop $X.XX (high: $X.XX)` | None — guard at 252 |

No `STOP_LOSS` string exists in enforceExitRules() — GTC stop fills are handled externally by Alpaca and detected via `detectClosedPositions()`.

### toExitReason() matching — after `.trim().toUpperCase().replace(/[-\s]/g, '_')`

| Raw template | Transformed (representative) | Matched by |
|---|---|---|
| `Exit rule: profit target reached (X% >= 10%)` | `EXIT_RULE:_PROFIT_TARGET_REACHED_(X%_>=_10%)` | `r.includes('PROFIT_TARGET')` |
| `Exit rule: 20-day time stop (N trading days open)` | `EXIT_RULE:_20_DAY_TIME_STOP_(N_TRADING_DAYS_OPEN)` | `r.includes('TIME_STOP')` |
| `Exit rule: z-score X >= -0.8 — price reverted to fair value` | `EXIT_RULE:_Z_SCORE_X_>=__0.8_—_PRICE_REVERTED_TO_FAIR_VALUE` | `r.includes('FAIR_VALUE')` |
| `Exit rule: price $X fell below EMA50 $X` | `EXIT_RULE:_PRICE_$X_FELL_BELOW_EMA50_$X` | `r.includes('FELL_BELOW_EMA50')` |
| `Exit rule: EMA Reclaim failed — price $X fell below EMA50 $X` | `EXIT_RULE:_EMA_RECLAIM_FAILED_—_PRICE_$X_FELL_BELOW_EMA50_$X` | `r.includes('FELL_BELOW_EMA50')` (both EMA strings share this) |
| `Trailing stop triggered: price $X <= stop $X (high: $X)` | `TRAILING_STOP_TRIGGERED:_PRICE_$X_<=_STOP_$X_(HIGH:_$X)` | `r.includes('TRAILING_STOP')` |

Note: `[-\s]` only replaces ASCII hyphens and whitespace; em dashes `—` survive as `—` in the transformed string. Matching on `'FAIR_VALUE'` and `'FELL_BELOW_EMA50'` avoids the em dash entirely.

### Call sites and return value usage

**Call site 1 — `src/lib/claude-agent.ts:842-849`** (inside `runAgentCycle()`):
```ts
const exitRuleEntries = await (async () => {
  try {
    const openCtxs = await getAllOpenPositionContexts()
    return await enforceExitRules(positions, indicatorsCache, openCtxs, account)
  } catch (err) {
    console.error('[EXIT-RULES] enforceExitRules failed:', err)
    return [] as AgentLogEntry[]   // ← catch branch also returns old shape
  }
})()
```
Used at **line 914**: `const decisions: AgentLogEntry[] = [...exitRuleEntries]`
→ **Array spread** — ⚠️ WILL BREAK. Both the normal return and the catch fallback must be updated to the new shape.

**Call site 2 — `src/lib/run-cycle.ts:38`**:
```ts
await enforceExitRules(positions, indicatorsCache, openContexts, account)
```
Return value **completely discarded** (no assignment). Will NOT break compilation, but should be destructured for consistency and to allow future access to `exitReasons`.

---

## Functional Requirements

FR-01: The system shall export an `ExitReason` type from `src/lib/types.ts` with exactly the variants: `Z_SCORE_EXIT`, `TRAILING_STOP`, `PROFIT_TARGET`, `STOP_LOSS`, `TIME_STOP`, `EMA_FAILURE`, `UNKNOWN`.

FR-02: The system shall export a `EnforceExitResult` type from `src/lib/types.ts` containing a `decisions` field of type `AgentLogEntry[]` and an `exitReasons` field of type `ReadonlyMap<string, ExitReason>`.

FR-03: The system shall change the return type of `enforceExitRules()` from `Promise<AgentLogEntry[]>` to `Promise<EnforceExitResult>`.

FR-04: The system shall declare an internal `exitReasons` map of type `Map<string, ExitReason>` at the top of `enforceExitRules()`.

FR-05: The system shall declare a `toExitReason(reason?: string | null): ExitReason` helper function inside `enforceExitRules()` that maps the six known raw exitReason templates to their typed variants using specific substring matching.

FR-06: The system shall emit a `console.warn([EXIT_REASON_EMPTY])` and return `UNKNOWN` when `toExitReason` receives a null, undefined, or whitespace-only string.

FR-07: The system shall emit a `console.warn([EXIT_REASON_UNMATCHED])` and return `UNKNOWN` when `toExitReason` receives a non-empty string that matches no known pattern.

FR-08: The system shall populate `exitReasons` after every successful `exitEntries.push()` call and before `removeOpenPositionContext()`, using the conflict-guard pattern (first exit wins; `console.error` on duplicate).

FR-09: The system shall return `{ decisions: exitEntries, exitReasons: new Map(exitReasons) }` — a snapshot, never the internal mutable reference — at every return point.

FR-10: The system shall update call site 1 (`claude-agent.ts:842-849`) to destructure `decisions` from the result: `const { decisions: exitRuleEntries } = await enforceExitRules(...)`, and also update the catch branch fallback to return `{ decisions: [], exitReasons: new Map() }`.

FR-11: The system shall update call site 2 (`run-cycle.ts:38`) to destructure `decisions`: `const { decisions: _exitDecisions } = await enforceExitRules(...)` (or equivalent).

---

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-02: `npm run build` shall pass with zero errors after the change.

NFR-03: No exit condition, threshold, ordering, sellDecision payload, existing console.log/error lines, or control flow inside `enforceExitRules()` shall change.

---

## Constraints

C-01: `ExitReason` and `EnforceExitResult` shall be declared outside any function (top-level exports in `src/lib/types.ts`).

C-02: `toExitReason()` shall use specific substring patterns; no single-token patterns like `'EMA'`, `'PROFIT'`, `'STOP'` alone that could match multiple categories.

C-03: The internal `exitReasons` map shall never be returned directly; always snapshot via `new Map(exitReasons)`.

C-04: All return statements in `enforceExitRules()` shall return the same `EnforceExitResult` shape — no mixed shapes.

C-05: `STOP_LOSS` is reserved in the enum for future use (GTC path via `detectClosedPositions`); no current raw string maps to it. This is expected.

C-06: This spec covers Fase 1a only. No cooldown gate logic is added. `exitReasons` is computed but only logged — not consumed for entry blocking.

---

## Out of Scope

- Any cooldown gate that uses `exitReasons` to block re-entry (Fase 1b / Prompt 2)
- Changes to exit conditions, thresholds, or trailing stop logic
- Changes to `detectClosedPositions()` or the GTC stop path
- Changes to `runAgentCycle()` beyond the IIFE destructuring at the call site
- New database columns or schema changes
- Dashboard or API changes
