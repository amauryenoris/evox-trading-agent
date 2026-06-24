# Tasks — Fix MR Ranging ADX Gate Rejection Message

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Amaury has confirmed Protected Zone change in `src/lib/claude-agent.ts`

## Implementation Checklist

### Phase 1 — Root cause fix (Protected Zone)

- [x] T-01: In `src/lib/claude-agent.ts`, inside `if (!setup_detected)` (~line 1566), add `const mrGateBlocked = meanReversionSignal && !mrRangingAdxGateOk` and branch: if `mrGateBlocked`, push a HOLD decision with corrected `reasoning` (states z-score met threshold, blocked by RANGING+ADX gate, cites actual z/threshold/ADX values) and `error: 'MR_RANGING_ADX_GATE: ...'` (also citing actual values); else fall through to the existing unchanged genuine no-setup push.

### Phase 2 — Dashboard classification fix

- [x] T-02: In `src/components/dashboard/AgentReasoningLog.tsx`, add an explicit regex branch in `detectKind()` (before the generic `action === 'HOLD' && err.length > 0` fallback) matching `/mr_ranging_adx_gate/i` on `entry.error` → return `'GATE_BLOCKED'`.

### Phase 3 — Testing

- [x] T-03: Create `src/lib/__tests__/mr-gate-rejection-message.test.ts` replicating the new branch logic inline (per project convention for signal-condition tests). Cover:
  - `meanReversionSignal=true, mrRangingAdxGateOk=false` → reasoning mentions z-score met threshold + gate block, error starts with `MR_RANGING_ADX_GATE:`
  - `meanReversionSignal=false` (genuine no signal) → reasoning/error match the existing unchanged no-setup text, `error` is `undefined`
  - `meanReversionSignal=true, mrRangingAdxGateOk=true` → this case never reaches `if (!setup_detected)` (setup_detected would be true) — not applicable, no test needed
- [x] T-04: Add a `detectKind()` unit test (or extend an existing AgentReasoningLog test file if one exists) asserting an entry with `error: 'MR_RANGING_ADX_GATE: ...'` classifies as `GATE_BLOCKED`, not `NO_SETUP`.
- [x] T-05: Run `npx tsc --noEmit` — must exit 0 with no errors.
- [x] T-06: Run `npm run build` — must pass.
- [x] T-07: Run `npx vitest run src/lib/__tests__/mr-ranging-adx-gate.test.ts` — must still pass unmodified.
- [ ] T-08: Manual verification — on next agent cycle, confirm a symbol with `meanReversionSignal=true` blocked by the gate appears in `AgentReasoningLog` as "Gate Blocked" (orange, `⊘`) with the corrected message, not "No Setup".

## Post-Implementation

- [x] Run `/review fix-mr-gate-rejection-message` to verify implementation matches spec
- [x] Confirm only `claude-agent.ts` and `AgentReasoningLog.tsx` (+ new test file) were modified — no other Protected Zone files touched
- [x] Confirm `meanReversionSignal`, `mrRangingAdxGateOk`, `meanReversionSetup` booleans are byte-for-byte unchanged

## Estimated Complexity

**Low** — One new conditional branch reusing existing booleans, one new regex line in a non-Protected file, plus tests. No schema change, no new abstractions, no behavior change to trade execution.
