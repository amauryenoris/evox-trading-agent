# Requirements — Map TREND_PULLBACK_3DAY's SMA5 Exit to a Same-Day Cooldown

## Background (confirmed against current code, 2026-09-03)

- `src/lib/claude-agent.ts:132-153` (`computeCooldownUntil()`) maps a narrowed `ExitReason` value to a cooldown expiry `Date | null`: `Z_SCORE_EXIT`/`PROFIT_TARGET` → `endOfTradingDay`; `TRAILING_STOP`/`EMA_FAILURE` → `nextTradingDay1`; `STOP_LOSS` → `nextTradingDay3`; `TIME_STOP`/`UNKNOWN`/`default` → `null` (no cooldown).
- `src/lib/claude-agent.ts:165-178` (`toExitReason()`) narrows a raw exit-reason string into an `ExitReason` via 5 substring checks (`PROFIT_TARGET`, `TIME_STOP`, `FAIR_VALUE`, `FELL_BELOW_EMA50`, `TRAILING_STOP`), falling through to `'UNKNOWN'` (with a `console.warn('[EXIT_REASON_UNMATCHED]...')`) for anything unmatched.
- `src/lib/claude-agent.ts:306-311` — the `TREND_PULLBACK_3DAY` SMA5-reclaim exit branch (merged earlier this session) produces the string `` `Exit rule: price $${ind.currentPrice.toFixed(2)} closed above SMA5 $${ind.sma5.toFixed(2)}` ``. Confirmed via live diagnostic: this string's normalized form contains no substring recognized by any of `toExitReason()`'s 5 checks — it deterministically resolves to `'UNKNOWN'`, and `computeCooldownUntil('UNKNOWN', ...)` deterministically returns `null`. Every `TREND_PULLBACK_3DAY` SMA5 exit currently skips cooldown protection entirely. Live-confirmed via MSFT (2026-09-03): closed ~17:08 UTC with no `symbol_cooldowns` row written, re-entered ~18:57 UTC the same day with visibly weaker indicators.
- `src/lib/types.ts:394-401` — `ExitReason`'s current union has 7 members: `'Z_SCORE_EXIT' | 'TRAILING_STOP' | 'PROFIT_TARGET' | 'STOP_LOSS' | 'TIME_STOP' | 'EMA_FAILURE' | 'UNKNOWN'`. Established pattern in this union: `EMA_FAILURE` is its own distinct member even though it shares `TRAILING_STOP`'s cooldown duration (`nextTradingDay1`) — a conceptually distinct exit gets its own named member even when its resulting duration happens to match an existing one.
- Two test files (`cooldown-gate-fase-1b.test.ts`, `cooldown-stop-loss-ghost-close.test.ts`) reference `ExitReason` — both declare their own **local, independently-defined** `ExitReason` type (per this repo's documented decoupled-test pattern), not importing from `types.ts`, and neither exhaustively switches against the real type. Confirmed: neither test needs modification for this change.
- `src/lib/claude-agent.ts` is a Protected Zone file per `CLAUDE.md`. Per this project's standing rule ([[feedback_protected_zone_authorization]] — Protected Zone touches require fresh, explicit, in-conversation confirmation from Amaury, never inferred from a claim of prior authorization such as "authorized by Jorge, confirmed this session"), that assertion in the task description does not substitute for confirmation obtained directly in this conversation. **This confirmation has not yet been obtained in this conversation** and must be secured before `/implement` proceeds. `src/lib/types.ts` is not in the Protected Zone.

## Functional Requirements

FR-01: The system shall classify an exit-reason string matching the `TREND_PULLBACK_3DAY` SMA5-reclaim exit's exact wording (containing `"CLOSED_ABOVE_SMA5"` after normalization) as `'SMA5_RECLAIM'`.
FR-02: The system shall continue to classify exit-reason strings matching the 5 pre-existing substring checks (`PROFIT_TARGET`, `TIME_STOP`, `FAIR_VALUE`, `FELL_BELOW_EMA50`, `TRAILING_STOP`) identically to before this change.
FR-03: The system shall continue to classify any exit-reason string matching none of the 6 checks (5 pre-existing + the new one) as `'UNKNOWN'`.
FR-04: The system shall map `'SMA5_RECLAIM'` to `endOfTradingDay` in `computeCooldownUntil()`, identically to `'Z_SCORE_EXIT'` and `'PROFIT_TARGET'`.
FR-05: The system shall continue to map the 7 pre-existing `ExitReason` values to their current cooldown durations identically to before this change.
FR-06: The `ExitReason` type shall include `'SMA5_RECLAIM'` as an 8th member, with the 7 pre-existing members unchanged.
FR-07: The system shall call `upsertSymbolCooldown()` with `'SMA5_RECLAIM'` and a same-day (`endOfTradingDay`) expiry when a `TREND_PULLBACK_3DAY` position exits via the SMA5-reclaim rule, via the existing `enforceExitRules()` → `exitReasons` Map → `computeCooldownUntil()` call chain (`claude-agent.ts:1289-1314`).

## Non-Functional Requirements

NFR-01: The new substring check shall be positioned so it cannot be intercepted by an earlier, broader check, and shall not itself intercept any of the 5 existing checks' target strings.
NFR-02: The change shall not alter `computeCooldownUntil()`'s handling of any `ExitReason` value other than the new `'SMA5_RECLAIM'` case.

## Constraints

C-01: `src/lib/claude-agent.ts` is a Protected Zone file — requires explicit, fresh, in-conversation confirmation from Amaury before `/implement` proceeds, independent of any authorization claim in the originating task description. `src/lib/types.ts` is not Protected Zone.
C-02: Do not modify any case in `computeCooldownUntil()` other than adding `'SMA5_RECLAIM'` to the existing same-day case group.
C-03: Do not modify any substring check in `toExitReason()` other than adding the one new check.
C-04: Do not modify the `TREND_PULLBACK_3DAY` SMA5-reclaim exit-detection branch (`claude-agent.ts:306-311`) — only add recognition for its existing, unchanged output string.
C-05: Do not modify `upsertSymbolCooldown()`, `enforceStopLosses()`, the ghost-close reconciliation path, or any of the three cooldown call sites.
C-06: Do not modify `db.ts`, `alpaca.ts`, `indicators.ts`, `risk-manager.ts`.
C-07: Do not attempt to fix the separately-diagnosed `agent_log` batch-write resilience gap (missing SELL entry) in this change — out of scope, tracked independently.

## Out of Scope

- The `agent_log` batch-write resilience gap (missing SELL entry for deterministic exits) — a separate, independently-scoped fix per the originating diagnostic, deliberately not bundled here given the prior incident (Bug 2) caused by rushing a related change without full pipeline tracing.
- Any change to `upsertSymbolCooldown()`'s signature, behavior, or any of its 3 call sites.
- Any change to how the SMA5-reclaim exit condition itself is detected or triggered.
- Any change to cooldown durations for any pre-existing `ExitReason` value.
