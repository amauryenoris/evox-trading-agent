# Design — Gate-Blocked Display Fix in AgentReasoningLog

## Architecture Decision

Display-layer-only fix in `src/components/dashboard/AgentReasoningLog.tsx` ("touch freely" zone). A new `GATE_BLOCKED` entry kind is added to the client-side classifier `detectKind()`, with a dedicated `GateBlockedCard` that shows the real block reason (`entry.error`) instead of routing gate-blocked HOLDs through `NoSetupCard`'s fabricated threshold line. No data-layer, API, or trading-logic change — `agent_log` rows are already correct; only their presentation is wrong.

## Data Flow

```
claude-agent.ts (UNCHANGED)
  gate blocked → decisions.push({ action:'HOLD', error:'Correlation gate: …' })
        │
        ▼
agent_log → /api/agent-log → AgentReasoningLog.tsx
        │
        ▼
detectKind(entry)
  1. BUY_EXECUTED / SELL_EXECUTED            (unchanged)
  2. err matches already_in_position          → ALREADY_HOLDING   (unchanged)
  3. err matches trend_zgt05|quality_fail     → TREND_REJECTED    (unchanged)
  4. err matches setup gate|no setup          → NO_SETUP          (unchanged)
  5. err matches exit_rules_*                 → HOLDING           (unchanged)
  6. err matches correlation gate|cooldown|spread|max buys|max positions|risk check
                                              → GATE_BLOCKED      (NEW)
  7. action HOLD && err non-empty             → GATE_BLOCKED      (NEW)
  8. action HOLD                              → NO_SETUP          (unchanged — err empty only)
        │
        ▼
render switch → case 'GATE_BLOCKED' → <GateBlockedCard> (NEW)
  shows: entry.error verbatim · z-score (if present) · regime (if present)
```

Classification matrix after the change (error strings verified in claude-agent.ts):

| agent_log error | Before | After |
|---|---|---|
| `undefined` (genuine no-setup, line 1501) | NO_SETUP | NO_SETUP ✓ |
| `Correlation gate: …` (risk-manager.ts:125) | NO_SETUP ✗ | GATE_BLOCKED |
| `Spread gate: …` / `Liquidity gate: …` / `Trading hours gate: …` | NO_SETUP ✗ | GATE_BLOCKED |
| `Gate: max positions (…)` / `Gate: max buys per day (…)` / `Overtrading gate: …` | NO_SETUP ✗ | GATE_BLOCKED |
| `Market closed — order queued…` / `Queued for ranking` / `Skipped: no indicators…` | NO_SETUP ✗ | GATE_BLOCKED |
| `TREND_ZGT125: excluded…` / `EMA_RECLAIM_NEAR: conditions not met` | NO_SETUP | GATE_BLOCKED (full reason now visible) |
| `exit_rules_check` / `exit_rules_skip` | HOLDING | HOLDING ✓ |
| `TREND_QUALITY_FAIL: …` | TREND_REJECTED | TREND_REJECTED ✓ |

## Adaptations Required for Compilation

The proposed `GateBlockedCard` snippet uses an API `CardShell` does not have. Three mechanical adaptations, all confined to the same file:

1. **`CardShell` takes `timeRel` + `body` props, not `time` + children** → use `timeRel={relativeTime(entry.timestamp)}` and `body={…}` like every other card in the file.
2. **`CardShell` accent union has no `'orange'`** (`green|red|slate|blue|amber|purple`) → add `orange` to the accent union and to the `accentBar` (`bg-orange-500`) / `accentText` (`text-orange-400`) maps. Additive; no existing accent changes. (Alternative — reuse `amber` — rejected: amber already means TREND_REJECTED; gates deserve visual distinction.)
3. **Render switch requires `key`** → `case 'GATE_BLOCKED': return <GateBlockedCard key={id} entry={entry} />`.

Additionally, the REJECTED filter (line 570) must include `GATE_BLOCKED`; otherwise these entries — visible today under REJECTED as misclassified NO_SETUPs — would silently vanish from that view (visibility regression).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| New GATE_BLOCKED kind + card (client-side classification) | Fixes display now; no backend change; error text is already in DB | Regex-on-strings classification stays brittle | **Chosen** |
| Structured error codes in claude-agent.ts + typed kinds | Robust long-term | Touches Protected Zone (claude-agent.ts); requires migration of log conventions; out of scope per instruction | Rejected |
| Fix only NoSetupCard fallback (show '—' instead of -1.30) | Tiny | Still mislabels gate blocks as "No Setup"; hides the real reason; NoSetupCard is on the DO-NOT-CHANGE list | Rejected |
| Add GATE_BLOCKED to a new filter tab instead of REJECTED | Cleaner taxonomy | More UI surface; YAGNI for a bugfix | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| src/components/dashboard/AgentReasoningLog.tsx | MODIFY | (1) `EntryKind` union += `'GATE_BLOCKED'`; (2) two new lines in `detectKind()` between the HOLDING check and the HOLD catch-all; (3) `CardShell` accent union/maps += `orange`; (4) new `GateBlockedCard` component after `NoSetupCard`; (5) render switch += `GATE_BLOCKED` case; (6) REJECTED filter += `GATE_BLOCKED` |

No other file is modified.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `src/components/dashboard/**` is in the "touch freely" zone. `claude-agent.ts` and `risk-manager.ts` were read for verification only.

## Database Changes

None.

## Open Questions

None. Two judgment calls embedded above for review: (a) `orange` accent added to `CardShell` (CardShell is not on the DO-NOT-CHANGE list; change is additive), (b) `GATE_BLOCKED` included in the REJECTED filter to prevent a visibility regression. Both implement the requested behavior with the minimum deviation needed to compile and not regress.
