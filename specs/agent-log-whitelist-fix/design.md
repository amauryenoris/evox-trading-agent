# Design — Fix getAgentLog()/getAgentLogPrioritized() Whitelist Bug

## Architecture Decision

This is a two-expression change inside `src/lib/db.ts` — no new architecture. Both functions already reconstruct `indicators` from `row.indicators` via an inline IIFE; this change adds a `...raw` spread as the first key in each reconstruction so any key already present in the raw jsonb (the 16-field whitelist, plus `self_flagged_disqualifying_risk`, `spx_*`, `state_fingerprint`, `tp_*`, `zle05_*`, `effectiveThreshold`, `newsAdjustment`, `learning_note`, `near_miss_score`, `what_would_trigger`, `prevClose`, `ema50Prev`, or anything written in the future) survives into the returned object, while the 16 explicit keys immediately after continue to apply their exact current defaulting logic on top. This mirrors `getTradeEvaluations()`'s already-shipped fix (`db.ts:296-314`) exactly, applied independently to two functions instead of one, since no shared helper exists between them.

## Data Flow

1. `getAgentLog()` fetches `agent_log` rows via `.select('*')` (`db.ts:53-57`) — unchanged. For each row, `indicators` is reconstructed via an IIFE (`db.ts:70-90`). **Fixed**: `const raw = row.indicators ?? {}` then `return { ...raw, rsi: raw.rsi ?? null, ... [all 16 fields, unchanged], kalman: raw.kalman ?? null }` — object-spread semantics mean `...raw` contributes every raw key first, and the 16 explicit keys immediately after override those same 16 keys with their exact current defaults.
2. `getAgentLogPrioritized()` fetches two result sets (`sellsResult`/`nonSellsResult`, `db.ts:100-103`) and maps each row through a shared `mapRow` closure (`db.ts:107-143`) — unchanged except identically fixing the `indicators` IIFE (`db.ts:118-138`) the same way, preserving every existing `as X` cast on the 16 explicit keys.
3. No other function changes. `insertAgentLogEntry()` (write path, `db.ts:32-49`) already writes the full `indicators` object as-is (confirmed: `indicators: entry.indicators` with no whitelist on the write side) — this was never the lossy hop; only these two read paths were.
4. Every consumer of `getAgentLog()`/`getAgentLogPrioritized()` (dashboard Agent Reasoning Log via `readAgentLog()` → `getAgentLogPrioritized()`, `system-status` API, weekly report generator, the portfolio-risk gate in `claude-agent.ts` via `db.getAgentLog(200)`) now receives the full `indicators` object, including whatever `self_flagged_disqualifying_risk`/`spx_*`/`state_fingerprint`/etc. was already being written.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `{...raw, ...16 explicit override keys}` in both functions independently (as specified) | Minimal diff per function; explicit keys retain byte-identical defaulting; every current/future extra key survives; exactly mirrors the proven `getTradeEvaluations()` pattern | Two edits instead of one | **Chosen** |
| Extract a shared `mapAgentLogIndicators(raw)` helper, call it from both functions | Single point of change | Not requested — the originating FIX/PROMPT explicitly says "Do NOT add a shared helper function... apply the fix independently in both places, matching the confirmed absence of any shared mapping function between them"; `getAgentLog()`'s `raw` is implicitly `any` while `getAgentLogPrioritized()`'s is explicitly `Record<string, unknown>`, so a shared helper would also need to reconcile two different typing situations, adding scope | Rejected — explicitly out of scope per the FIX/PROMPT |
| Return `raw` directly (typed `AgentLogEntry['indicators'] & Record<string, unknown>`), without the 16 explicit override keys | Smaller diff | Loses the safe `?? null`/`?? 0` defaults on the 16 core fields for rows with missing/partial keys (e.g. very old rows) — would change behavior for those rows, violating FR-03/FR-04 | Rejected |
| Add a `TechnicalIndicators & Record<string, unknown>` cast to both spreads unconditionally | Zero risk of a surprise compile error | Speculative — the prior `getTradeEvaluations()` fix found no cast was needed for an implicitly-`any` `raw`, and the FIX/PROMPT explicitly asks to add a cast only if `tsc --noEmit` demonstrates it's required, not preemptively; `getAgentLogPrioritized()`'s `Record<string, unknown>`-typed `raw` is flagged as the one genuinely unproven case | Rejected per instruction, pending `tsc --noEmit` confirmation at implementation time |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/db.ts` | MODIFY | `getAgentLog()`'s `indicators` IIFE (`70-90`): add `...raw` as the first key. `getAgentLogPrioritized()`'s `mapRow`'s `indicators` IIFE (`118-138`): add `...raw` as the first key. All 16 explicit keys in both, unchanged, unreordered. |
| `src/lib/__tests__/` (new test file, e.g. `db.agent-log-passthrough.test.ts`) | CREATE | New tests per NFR-03, mirroring the pattern already established for `getTradeEvaluations()`'s passthrough test. |

No other file is created or modified by this CHANGE — `getTradeEvaluations()`, `AgentLogEntry`'s type definition, `report-generator.ts`, `risk-manager.ts`, and every dashboard component are all left untouched.

## Protected Zone Impact

None — `src/lib/db.ts` is not in CLAUDE.md's Protected Zone (neither the core 4-file list nor the separate "Confirm with Amaury" File Permission Matrix table). This mirrors the same conclusion already reached and reviewed for the `getTradeEvaluations()` fix (`specs/trade-evaluations-read-passthrough-fix/design.md`).

## Database Changes

None. No schema change, no migration, no new column — `agent_log.indicators` is already an untyped `jsonb` column that already contains the extra keys this fix makes visible on read.

## Open Questions

None blocking. One item flagged for extra care at implementation time, not a design decision requiring Amaury's input: `getAgentLogPrioritized()`'s `raw` is typed `Record<string, unknown>` (not implicitly `any`, unlike `getAgentLog()`'s `raw` and unlike `getTradeEvaluations()`'s `raw` when it was fixed). Spreading a `Record<string, unknown>` is expected to compile without a cast (it produces a structurally compatible `{ [key: string]: unknown }`), but this is a prediction to be confirmed by `tsc --noEmit` at implementation time, not yet literally proven for this exact typing — per the FIX/PROMPT's own instruction, if `tsc --noEmit` reports an error here, implementation must report the exact error rather than silently changing `raw`'s type annotation or casting the spread itself.
