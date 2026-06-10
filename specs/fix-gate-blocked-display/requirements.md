# Requirements — Gate-Blocked Display Fix in AgentReasoningLog

## Context

`detectKind()` (`AgentReasoningLog.tsx:82-94`) classifies any HOLD whose `error` does not match the ALREADY_HOLDING / TREND_REJECTED / NO_SETUP / HOLDING patterns as `'NO_SETUP'` (catch-all, line 92). HOLDs where the setup WAS detected but a posterior execution gate blocked it (correlation gate, cooldown, spread, liquidity, trading hours, overtrading, max positions, risk check) are therefore rendered by `NoSetupCard`, which fabricates the line "z-score X > threshold -1.30" using a hardcoded `>` and a `-1.30` fallback (line 441) whenever the threshold regex (line 60) finds no match. Verified example: AMZN HOLD with `error = "Correlation gate: 3 positions already open in sector BIG_TECH (limit: 3)"` (string produced at `risk-manager.ts:125`, reaches `agent_log.error` via `claude-agent.ts:1667`) displayed as "No Setup · z-score -1.440 > threshold -1.30" — mathematically false and hiding the real block reason.

Gate/blocked error strings written by `claude-agent.ts` that currently fall into the catch-all: `Correlation gate: …` and other `riskCheck.reason` strings, `Liquidity gate: …`, `Spread gate: …` (3 variants), `Trading hours gate: …`, `Overtrading gate: …`, `Gate: max positions (…)`, `Gate: max buys per day (…)`, `Market closed — order queued but not executed`, `Queued for ranking`, `Skipped: no indicators available in cache`, `TREND_ZGT125: excluded — zScore > 1.25`, `EMA_RECLAIM_NEAR: conditions not met`.

## Functional Requirements

FR-01: The system shall classify an agent_log entry as `GATE_BLOCKED` when its `decision.action` is `HOLD`, its `error` is non-empty, and the error does not match the existing ALREADY_HOLDING, TREND_REJECTED, NO_SETUP, or HOLDING patterns.

FR-02: The system shall classify an entry as `GATE_BLOCKED` when its `error` matches the gate pattern `/correlation\s*gate|cooldown|spread|max[\s_]buys|max[\s_]positions|risk[\s_]check/i`, regardless of action, provided no earlier classification matched.

FR-03: The system shall continue to classify an entry as `NO_SETUP` when its `decision.action` is `HOLD` and its `error` is empty or absent.

FR-04: Where an entry is classified `GATE_BLOCKED`, the system shall render a "Gate Blocked" card that displays the full `entry.error` text verbatim.

FR-05: Where an entry is classified `GATE_BLOCKED` and `entry.indicators.kalman.zScore` is available, the system shall display the z-score with sign and 3 decimals.

FR-06: Where an entry is classified `GATE_BLOCKED` and `entry.indicators.marketRegime` is available, the system shall display the regime.

FR-07: The system shall preserve the existing classification behavior for entries matching the ALREADY_HOLDING, TREND_REJECTED, NO_SETUP (setup-gate pattern), and HOLDING patterns.

FR-08: The system shall include `GATE_BLOCKED` entries in the REJECTED filter view.

FR-09: The system shall render the AMZN example entry (`error = "Correlation gate: 3 positions already open in sector BIG_TECH (limit: 3)"`) as a "Gate Blocked" card showing that exact error text, not as "No Setup".

FR-10: The system shall not display a fabricated threshold comparison for `GATE_BLOCKED` entries.

## Non-Functional Requirements

NFR-01: After the change, `npx tsc --noEmit` shall produce zero errors.

NFR-02: After the change, `npm run build` shall complete successfully.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury.

C-02: Only `src/components/dashboard/AgentReasoningLog.tsx` shall be modified. No other file may change — explicitly NOT `src/lib/claude-agent.ts` nor any API route.

C-03: The following must remain unchanged: `NoSetupCard`, `TrendRejectedCard`, `HoldingCard`, `AlreadyHoldingCard`, `parseEntry()`, and the `detectKind()` cases for ALREADY_HOLDING, TREND_REJECTED, NO_SETUP, and HOLDING.

C-04: The new `GATE_BLOCKED` checks must be inserted AFTER the existing four error-pattern checks and BEFORE the final `action === 'HOLD'` catch-all, preserving evaluation order.

## Out of Scope

- Changing `NoSetupCard`'s `-1.30` fallback or hardcoded `>` (BUG 2 is mitigated by reclassification: gate-blocked entries no longer reach `NoSetupCard`; genuine no-setup entries carry the real threshold in their reasoning, which the line-60 regex parses correctly).
- The pre-existing mismatch where `TREND_ZGT125` errors do not match the TREND_REJECTED regex `/trend_zgt05/` — after this change those entries move from "No Setup" to "Gate Blocked" (more honest: full error text shown). Renaming the regex is a separate fix.
- Any change to how `claude-agent.ts` writes error strings (e.g. structured error codes) — future refactor.
- Component unit tests — no dashboard-component test infrastructure exists (Vitest env is `node`, no jsdom); consistent with the fix-pnl-pct-trade-history precedent.
