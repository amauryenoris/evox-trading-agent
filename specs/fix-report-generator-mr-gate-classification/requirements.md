# Requirements — Fix report-generator.ts HOLD Classification for MR Gate-Blocked Entries

## STEP 0 — Pre-implementation observations (DO NOT MODIFY)

### Classification loop — `src/lib/report-generator.ts:214-246` (verbatim)

```typescript
for (const e of nonExecuted) {
  const err = e.error ?? ''
  if (err.includes('Setup gate:') || e.decision.reasoning?.includes('Setup gate:')) {
    noSetupDetected++
  } else if (err.includes('Liquidity gate')) {
    gate1Liquidity++
  } else if (err.includes('Trading hours gate')) {
    gate2Hours++
  } else if (err.includes('Overtrading gate')) {
    gate3Overtrading++
  } else if (err.includes('gate') || err.includes('Gate') || err.includes('Market closed')) {
    gate4Portfolio++
  } else if (err.includes('Already in position')) {
    alreadyInPosition++
  } else if (err === 'exit_rules_check' || err === 'exit_rules_skip') {
    positionHeld++
  } else if (err === '') {
    const reasoning = e.decision.reasoning ?? ''
    if (reasoning.includes('Setup gate:') ||
        reasoning.includes('no setup') ||
        reasoning.includes('NO_SETUP')) {
      noSetupDetected++
    } else {
      otherHold++
    }
  } else if (err.includes('TREND_ZGT05')) {
    noSetupDetected++
  } else if (err.includes('TREND_QUALITY_FAIL')) {
    noSetupDetected++
  } else {
    otherHold++
  }
}
```

### Available counters (confirmed, 8 total)

`noSetupDetected`, `gate1Liquidity`, `gate2Hours`, `gate3Overtrading`, `gate4Portfolio`, `alreadyInPosition`, `positionHeld`, `otherHold`.

### No GATE_BLOCKED-equivalent counter exists for setup-level gates

Confirmed: `gate1Liquidity`/`gate2Hours`/`gate3Overtrading`/`gate4Portfolio` are exclusively for **execution-level** gates (checked after a setup is already detected — liquidity, trading hours, max-buys/overtrading, portfolio risk). The MR Ranging ADX gate is a **setup-level** gate (blocks a signal from becoming a valid setup at all), which is the same category as `TREND_ZGT05` and `TREND_QUALITY_FAIL` — both setup-level structural/quality rejections, both already mapped to `noSetupDetected` (lines 239-242). **No dedicated counter is warranted** — `noSetupDetected` is the established, semantically consistent bucket for this class of entry.

### Root cause confirmed

`gateError` (from `claude-agent.ts`) is `"MR_RANGING_ADX_GATE: z-score X met entry threshold Y, blocked — regime=RANGING, ADX=Z < 18"`. Tracing it through the loop above:
- Line 216: does not contain `"Setup gate:"` → false
- Lines 218/220/222: does not match `Liquidity gate`/`Trading hours gate`/`Overtrading gate` → false
- Line 224: `err.includes('gate')` and `err.includes('Gate')` are **case-sensitive** — the string only contains uppercase `GATE` (inside `ADX_GATE`), never lowercase `gate` or `Gate` → false
- Lines 226/228/230: false (non-empty, not `exit_rules_*`)
- Lines 239/241: does not contain `TREND_ZGT05`/`TREND_QUALITY_FAIL` → false
- **Falls to line 244 `else` → `otherHold++`** (regression — was `noSetupDetected++` pre-fix)

## Functional Requirements

FR-01: The system shall classify a HOLD entry whose `error` field contains the literal substring `MR_RANGING_ADX_GATE` as `noSetupDetected`.

FR-02: The system shall evaluate the new classification branch before the generic `err.includes('gate') || err.includes('Gate') || err.includes('Market closed')` branch (current line 224), so the generic branch never has the opportunity to (mis)handle this prefix.

FR-03: The system shall not alter the classification outcome for any entry that does not contain `MR_RANGING_ADX_GATE` in its `error` field.

FR-04: The system shall not alter the relative order of any existing branch in the if/else chain with respect to each other.

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall pass with zero errors after the change.

NFR-02: `npm run build` shall pass after the change.

## Constraints

C-01: This feature touches `src/lib/report-generator.ts`, which is **not** in the Protected Zone — no Amaury confirmation required beyond standard spec approval.

C-02: This feature must not modify `src/lib/claude-agent.ts` or any signal/gate-detection logic — this is a reporting-classification-only fix.

C-03: This feature must not modify the `error`/`reasoning` string content produced by `claude-agent.ts` (already correct per the prior fix).

C-04: The match must be on the exact prefix substring `MR_RANGING_ADX_GATE` (case-sensitive) — the existing generic `gate`/`Gate` substring matching must not be loosened or made case-insensitive, to avoid accidentally reclassifying unrelated entries.

## Out of Scope

- Adding a new dedicated counter for MR-gate-blocked entries (STEP 0 concluded `noSetupDetected` is the correct, consistent bucket).
- Any change to `AgentReasoningLog.tsx`, `detectKind()`, or the dashboard (already fixed in `fix-mr-gate-rejection-message`).
- Any change to `claude-agent.ts` setup-detection logic.
- Backfilling or recomputing historical weekly PDF reports already generated with the incorrect `otherHold` count.
- Any other downstream consumer of `error` not already identified (none found in the prior diagnostic).
