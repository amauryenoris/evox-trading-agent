# Tasks — Gate-Blocked Display Fix in AgentReasoningLog

## Pre-Implementation

- [ X] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A — dashboard component, touch-freely zone)
- [x] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

All changes in `src/components/dashboard/AgentReasoningLog.tsx`. No other file.

### Phase 1 — Classification

- [x] T-01: Add `'GATE_BLOCKED'` to the `EntryKind` union type (lines 10–17).

- [x] T-02: In `detectKind()`, insert two checks between the HOLDING check and the final HOLD catch-all, preserving order:

  ```ts
  if (/exit_rules_check|exit_rules_skip/i.test(err))           return 'HOLDING'
  if (/correlation\s*gate|cooldown|spread|max[\s_]buys|max[\s_]positions|risk[\s_]check/i.test(err)) return 'GATE_BLOCKED'
  if (entry.decision.action === 'HOLD' && err.length > 0)       return 'GATE_BLOCKED'
  if (entry.decision.action === 'HOLD')                         return 'NO_SETUP'
  ```

  Do NOT alter the four existing pattern checks above.

### Phase 2 — Card component

- [x] T-03: Extend `CardShell`'s `accent` prop union with `'orange'` and add entries to both maps: `accentBar` → `bg-orange-500`, `accentText` → `text-orange-400`. No existing accent changes.

- [x] T-04: Add `GateBlockedCard` immediately after the `NoSetupCard` function — the proposed snippet adapted to CardShell's real API (`timeRel` + `body`, no children):

  ```tsx
  function GateBlockedCard({ entry }: { entry: AgentLogEntry }) {
    const zScore = entry.indicators?.kalman?.zScore
    const regime = entry.indicators?.marketRegime

    return (
      <CardShell
        accent="orange"
        glyph="⊘"
        title="Gate Blocked"
        symbol={entry.symbol}
        timeRel={relativeTime(entry.timestamp)}
        body={
          <div className="space-y-1.5 text-[12px]">
            <div className="text-orange-300 font-mono">{entry.error}</div>
            {zScore != null && (
              <div className="font-mono tabular-nums text-slate-400">
                z-score <span className="text-slate-200">{zScore >= 0 ? '+' : ''}{zScore.toFixed(3)}</span>
              </div>
            )}
            {regime && (
              <div className="text-slate-500">Regime<span className="ml-1.5 text-slate-300">{regime}</span></div>
            )}
          </div>
        }
      />
    )
  }
  ```

### Phase 3 — Wiring

- [x] T-05: Add the case to the render switch (after the `NO_SETUP` case):

  ```tsx
  case 'GATE_BLOCKED':    return <GateBlockedCard    key={id} entry={entry} />
  ```

- [x] T-06: Include `GATE_BLOCKED` in the REJECTED filter (line ~570):

  ```ts
  if (filter === 'REJECTED') return enriched.filter(x => x.kind === 'NO_SETUP' || x.kind === 'TREND_REJECTED' || x.kind === 'GATE_BLOCKED')
  ```

### Phase 4 — Verification

- [x] T-07: Run `npx tsc --noEmit` — must produce zero errors.

- [x] T-08: Run `npm run build` — must complete successfully.

- [x] T-09: Static classification check against real error strings:
  - `error = "Correlation gate: 3 positions already open in sector BIG_TECH (limit: 3)"`, action HOLD → **GATE_BLOCKED** (matches gate regex)
  - `error = undefined`, action HOLD (claude-agent.ts:1501 genuine no-setup) → **NO_SETUP**
  - `error = 'exit_rules_check'` → **HOLDING** (unchanged)
  - `error = 'TREND_QUALITY_FAIL: …'` → **TREND_REJECTED** (unchanged)
  - `error = 'Spread gate: stale quote'` → **GATE_BLOCKED**
  - `error = 'Gate: max positions (5/5)'` → **GATE_BLOCKED**

- [x] T-10: No new test file — `detectKind` is module-internal and there is no dashboard-component test infrastructure (Vitest env is `node`); consistent with fix-pnl-pct-trade-history precedent.

## Post-Implementation

- [x] Run /review fix-gate-blocked-display to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged
- [x] Confirm NoSetupCard, parseEntry, and the four existing detectKind patterns unchanged

## Estimated Complexity

**Low** — Single dashboard component: one union member, two classifier lines, one small card component, two wiring lines. No logic shared with trading engine.
