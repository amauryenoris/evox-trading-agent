# Requirements — Fix MR Ranging ADX Gate Rejection Message

## Diagnostic findings (STEP 0 — see conversation for full detail)

- `src/lib/claude-agent.ts:1566-1579` — the catch-all `if (!setup_detected)` branch builds the HOLD `reasoning` as a hardcoded string literal: `` `Setup gate: no mean reversion setup (z-score ${zScore.toFixed(3)} > ${effectiveThreshold.toFixed(2)}) and no trend setup...` ``. This fires for ANY symbol where `setup_detected` is false — including when `meanReversionSignal` was `true` (z-score DID cross `effectiveThreshold`) but `meanReversionSetup` was `false` because the MR Ranging ADX gate (`claude-agent.ts:1345-1351`) blocked it. The message is factually wrong in that case: it claims `z-score X > threshold` when in fact `z-score X <= threshold`.
- `error` is left `undefined` for every case in this branch (`claude-agent.ts:1576`), including the gate-blocked case — there is no machine-readable distinction between "genuinely no signal" and "signal present, gate blocked".
- The condition that correctly isolates the gate-blocked case already exists at `claude-agent.ts:1390`: `!meanReversionSetup && meanReversionSignal && !mrRangingAdxGateOk` — but it currently only feeds a `console.log`, never the persisted `reasoning`/`error`.
- `AgentReasoningLog.tsx:83-97` (`detectKind`) classifies entries by regex on `entry.error` only (never `entry.decision.reasoning`). Because `error` is `undefined` for this case, it falls through to the generic `action === 'HOLD'` rule (line 95) and is classified `NO_SETUP`, displaying the misleading reasoning text in the "No Setup" card.
- Persistence path: `claude-agent.ts:2038 appendAgentLogEntries(decisions)` → `db.ts:31 insertAgentLogEntry()` → `agent_log` table (`reasoning`, `error` columns) → `/api/agent-log` → `AgentReasoningLog.tsx`. Not read by `/api/rejected-today` (different error-prefix filter).
- Protected Zone: the message logic lives in `src/lib/claude-agent.ts` (Protected Zone). `AgentReasoningLog.tsx` is not Protected Zone.

## Functional Requirements

FR-01: The system shall distinguish, within the `if (!setup_detected)` branch, between a symbol where `meanReversionSignal` is `true` and blocked only by the MR Ranging ADX gate (`meanReversionSignal && !mrRangingAdxGateOk`), versus a symbol with no qualifying signal at all.

FR-02: When a symbol is blocked specifically by the MR Ranging ADX gate, the system shall set `decision.reasoning` to a message stating that the z-score met the entry threshold and that the block was caused by the RANGING regime + low-ADX gate, citing the actual z-score, threshold, and ADX values.

FR-03: When a symbol is blocked specifically by the MR Ranging ADX gate, the system shall set `error` to a non-empty, prefixed string (e.g. `MR_RANGING_ADX_GATE: ...`) distinct from the generic no-setup case, so downstream consumers can classify it without re-deriving the gate condition.

FR-04: When a symbol has no qualifying signal at all (the existing genuine no-setup case), the system shall leave the existing `reasoning` text and `error: undefined` behavior unchanged.

FR-05: The system shall classify MR-gate-blocked HOLD entries as `GATE_BLOCKED` (not `NO_SETUP`) in `AgentReasoningLog.tsx`'s `detectKind()`, via an explicit regex match on the new error prefix — not relying on the existing generic `action === 'HOLD' && err.length > 0` fallthrough.

FR-06: The system shall not alter the classification or displayed message of any other existing rejection path (`TREND_ZGT125`, `EMA_RECLAIM_NEAR`, `TREND_QUALITY_FAIL`, correlation/cooldown/spread/max-buys/max-positions/risk-check gates).

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-02: `npm run build` shall pass after the change.

NFR-03: Existing tests in `src/lib/__tests__/mr-ranging-adx-gate.test.ts` shall continue to pass unmodified (they test `signal`/`setup` booleans, not message content).

## Constraints

C-01: This feature touches `src/lib/claude-agent.ts` (Protected Zone) — requires explicit confirmation from Amaury before implementation.

C-02: The fix must not change `meanReversionSignal`, `meanReversionSetup`, `mrRangingAdxGateOk`, or any other setup-detection boolean — only the message/error constructed when the existing booleans yield `!setup_detected`.

C-03: The fix must not change behavior, trade execution, or sizing for any symbol — this is a logging/observability correction only, no trading-logic change.

C-04: Claude's analyst role is unaffected — this branch never calls Claude; no changes to prompt schema, action field, or analyst purity.

## Out of Scope

- Adding a structured `reasonType` field to `AgentDecision`/`AgentLogEntry` (would require a wider types.ts + db.ts + UI refactor — bigger change than this fix warrants; string-prefix convention matches the existing `TREND_QUALITY_FAIL`/`TREND_ZGT125` pattern already in the codebase).
- Changing `/api/rejected-today` to include MR-gate-blocked entries.
- Backfilling historical `agent_log` rows that already contain the misleading message.
- Any change to the MR Ranging ADX gate's threshold (`mrRangingAdxFloor = 18`) or its enable/disable toggle.
