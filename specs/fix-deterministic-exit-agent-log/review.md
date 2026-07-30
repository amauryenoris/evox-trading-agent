# Review Report — Persist Deterministic-Exit SELL Entries to agent_log (Bug 2)

**Date**: 2026-07-29
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Write one `agent_log` row via `insertAgentLogEntry()` for every deterministic exit with a non-null `ctx` | ✅ SATISFIED | New call sits inside the single shared `if (ctx) { try { ... } }` block reached by all deterministic-exit branches (profit target, time stop, z-score, trend/EMA50, EMA Reclaim, trailing stop) — `exitReason` is a single `let` set by exactly one branch, then execution falls through unconditionally. Verified by reading, not by name. |
| FR-02 | `decision.reasoning` = the exact per-branch `exitReason` string, no new taxonomy | ✅ SATISFIED | `reasoning: exitReason` — same variable already used by the untouched `exitEntries.push` at line 341. |
| FR-03 | `timestamp` = `exitTimestamp`, not cycle-start `timestamp` | ✅ SATISFIED | `timestamp: exitTimestamp` — reuses the variable computed at line 365 from the real order fill (`sellOrder.filled_at`), falling back to cycle `timestamp` only if no fill record exists, same as the existing fallback logic already governing `exitTimestamp` itself. |
| FR-04 | `indicators.exitPrice` = real fill price `exitPrice` | ✅ SATISFIED | `exitPrice` reused directly from lines 362-364, not recomputed. |
| FR-05 | `quantity`/`entryPrice`/`signalType`/`daysOpen` sourced from `ctx.quantity`/`ctx.buyPrice`/`ctx.signalType`/`daysOpen` | ✅ SATISFIED | All four fields map 1:1 to the named source variables, matching the ghost-close call's field-naming convention. |
| FR-06 | `error` field ≠ `'ghost_close'` | ✅ SATISFIED | `error: undefined` — matches the convention already used by the untouched `exitEntries.push` (line 345), distinguishable from the ghost-close row's `error: 'ghost_close'`. |
| FR-07 | Call placed after `evaluateClosedTrade()`, before `removeOpenPositionContext()`, inside the existing `if (ctx)` block | ✅ SATISFIED | Confirmed directly in the diff — inserted between lines 367 and what is now 398 in the modified file. |
| FR-08 | Dedicated `.catch()` on the new call; a write failure must not block `removeOpenPositionContext()` | ✅ SATISFIED | `.catch((err) => console.error(...))` chained directly on the promise; `await` on a caught promise resolves normally, so the next line (`removeOpenPositionContext`) executes regardless of insert success/failure. |
| FR-09 | Existing `exitEntries.push({...})` (lines 337-346) left byte-for-byte unchanged | ✅ SATISFIED | Confirmed via `git diff` — zero changes outside the single new hunk. |
| NFR-01 | `npx tsc --noEmit` — zero new errors | ✅ SATISFIED | Ran clean, zero output. |
| NFR-02 | `npm run build` — zero errors | ✅ SATISFIED | Build completed successfully, all routes compiled. |
| NFR-03 | No change to exit conditions, thresholds, ordering, trailing-stop floor (lines ~275-291), `closePosition()`, or `evaluateClosedTrade()` | ✅ SATISFIED | `git diff` shows exactly one hunk (28 inserted lines), nothing else in the file changed. |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone modification authorized | ✅ SATISFIED | User authorization present in the originating CHANGE prompt and confirmed via the checked pre-implementation boxes in `tasks.md`. |
| C-02 | No changes to `scripts/run-cycle.ts`, `src/lib/run-cycle.ts`, `src/app/api/cron/run/route.ts` | ✅ SATISFIED | `git status --porcelain` confirms only `src/lib/claude-agent.ts` modified in tracked source. |
| C-03 | No changes to `risk-manager.ts`, `indicators.ts`, `learning.ts`, `db.ts` | ✅ SATISFIED | Confirmed untouched via `git status`. |
| C-04 | No DB schema/RLS changes | ✅ SATISFIED | No migration files added; `insertAgentLogEntry()` itself unmodified in `db.ts`. |
| C-05 | Ghost-close duplicate-insert bug left untouched, out of scope | ✅ SATISFIED | `detectClosedPositions()` / the ghost-close block (~line 1110+ pre-edit) not present in the diff. |
| C-06 | `ctx === null` legacy positions still receive no `agent_log`/`trade_evaluations` row from this path | ✅ SATISFIED | New call sits inside the same `if (ctx)` guard as `evaluateClosedTrade()` — behavior for `ctx === null` positions is unchanged. |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| `src/lib/config.ts` | UNTOUCHED | — |
| `src/lib/claude-agent.ts` | **MODIFIED** | Listed in `design.md` → Impact on Existing Files as the sole required change; authorized. Single 28-line additive hunk inside `enforceExitRules()`. |
| `src/lib/risk-manager.ts` | UNTOUCHED | — |
| `src/lib/indicators.ts` | UNTOUCHED | — |
| `src/lib/news-intelligence.ts` | UNTOUCHED | — |
| `src/lib/watchlist-monitor.ts` | UNTOUCHED | — |
| `src/lib/learning.ts` | UNTOUCHED | — |
| `.env` / `.env.local` | UNTOUCHED | — |
| `vercel.json` | UNTOUCHED | — |
| DB migrations | NONE ADDED | — |

No unauthorized Protected Zone changes found.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ➖ N/A | This change is entirely inside the deterministic exit-rules path (`enforceExitRules`), which runs before and independently of any Claude API call. Claude's decision schema, the forced `action: 'HOLD'` override, and `buildEnrichedPrompt()` are untouched — confirmed via `git diff` scope. |
| Supabase patterns | ✅ SATISFIED | Reuses the existing `insertAgentLogEntry()` helper in `db.ts` (unmodified) rather than a raw query; the helper already checks `if (error) throw new Error(...)` internally and uses the service role client. Called from `claude-agent.ts` (server-only, never a `'use client'` file). No new query added, so `.limit()` is not applicable (this is an INSERT). |
| TypeScript quality | ✅ SATISFIED | No `any` used — the `as unknown as TechnicalIndicators` cast is not a new pattern; it's the exact cast already used by the pre-existing ghost-close call at the former line 1110 to attach the same enrichment fields (`entryPrice`, `exitPrice`, `pnlPct`, `signalType`, `daysOpen`, `closedBy`). No mutation — a new object literal is constructed; `ind` is spread, not mutated. `confidence: 1.0` mirrors the hardcoded value already used identically by both the ghost-close call and the untouched `exitEntries.push`, not a newly-introduced magic number. |
| Security | ✅ SATISFIED | No secrets, no raw SQL (Supabase client abstraction), `console.error` logs only `position.symbol` and the generic error object — no sensitive data. |
| File/function size | ⚠️ PRE-EXISTING, NOT INTRODUCED BY THIS DIFF | `claude-agent.ts` is now 2181 lines (was ~2151); `enforceExitRules()` spans ~233 lines — both already well over the project's 800-line/50-line guidelines *before* this change. The diff adds 28 lines to an already-oversized function per the spec's explicit "additive only" scope; refactoring `enforceExitRules()` was out of scope and correctly not attempted. |

## Test Impact

No test was added or updated — `tasks.md` (as approved) has no test-writing task for this change, consistent with `design.md`'s framing as "additive logging only" inside an existing, already-covered function. Ran the three existing tests that reference `enforceExitRules()`-adjacent exit/cooldown logic (`trailing-stop-exit-reason-guard.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`, `self-flagged-disqualifying-risk.test.ts`): **29/29 passed**, no regressions. Per CLAUDE.md's test-pattern note, these tests replicate exit-condition logic inline rather than importing `enforceExitRules()` directly, so none of them assert on `insertAgentLogEntry` call counts — a change here would not have broken them either way.

## Task Checklist

- Completed: 12/12 implementation tasks (T-01 – T-12), 2/2 pre-implementation checks, 2/3 post-implementation checks (the third — "Run `/review`" — is satisfied by this report).

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- No regression test asserts that `insertAgentLogEntry()` is actually invoked on a deterministic exit (trailing stop / z-score / time stop / profit target). This was an explicit, approved scope decision (not a spec violation), but given this fixes a previously-silent data-loss bug, a small follow-up test — e.g. mocking `insertAgentLogEntry` and asserting it's called once per `exitEntries.push()` in a deterministic-exit scenario — would guard against this regressing silently again in the future.

### LOW (optional)
- `claude-agent.ts` (2181 lines) and `enforceExitRules()` (~233 lines) both exceed the project's file/function-size guidelines — pre-existing conditions, not introduced or worsened materially by this diff (+28 lines). Noted for awareness only; no action recommended as part of this change.
- Per `design.md`'s already-flagged, accepted tradeoff (C-05): after this ships, a genuine deterministic exit will show two `agent_log` rows (the new correct one + the pre-existing spurious `ghost_close` duplicate from `detectClosedPositions()`) until that separately-tracked bug is fixed. Expected, not a new issue, already communicated to Amaury in `tasks.md`.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
