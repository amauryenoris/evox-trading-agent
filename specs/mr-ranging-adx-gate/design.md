# Design — MR Ranging ADX Gate (temporary)

## Architecture Decision

The gate lives inside the setup-detection block of the main watchlist loop in `src/lib/claude-agent.ts` (Protected Zone ⚠️), directly replacing the single-line `meanReversionSetup` definition at line 1239. It follows the exact pattern already established by the TREND_PULLBACK MACD floor (lines 1242–1289): named constant + guard boolean + counterfactual variable + `[TAG]` blocked-log + cycle counter. Claude's analyst role is untouched — this is a hard gate BEFORE Claude is called, identical in kind to the existing z-score gate.

## Data Flow

```
indicators (per symbol)
  ├─ zScore ──────────────► meanReversionSignal = zScore <= effectiveThreshold   (raw, ungated)
  ├─ marketRegime ──┐
  └─ adxValue ──────┴─────► mrRangingAdxGateOk =
                              !enableMrRangingAdxGate ||
                              !(regime === 'RANGING' && hasValidAdx && adx < 18)
                                   │
meanReversionSetup = meanReversionSignal && mrRangingAdxGateOk
                                   │
        ┌──────────────────────────┼───────────────────────────────┐
        ▼                          ▼                               ▼
  setup_detected (1415)     signalType (1424)         blocked? → [MR_BLOCKED_RANGING_ADX] log
  auto-entry check (1416)                              + mrBlockedRangingAdxSymbols.add(symbol)
                                                                   │
                                              cycle end → [TREND_PULLBACK_STATS] … mrBlockedRangingAdx=N
```

Truth table (gate enabled):

| regime | ADX | hasValidAdx | gateOk | setup = signal && gateOk |
|---|---|---|---|---|
| RANGING | 13.0 / 15.2 / 16.4 / 17.6 | true | false | **false** (NEM/UUUU/RBLX/edge profiles) |
| RANGING | 18.0 / 18.1+ | true | true | signal |
| RANGING | NaN / null | false | true | signal (fail-open, FR-04) |
| HIGH_VOLATILITY | 17.6 | true | true | signal (OXY profile — regime ≠ RANGING) |
| TRANSITION / TRENDING / null | any | — | true | signal |

TypeScript note: `adxValue` is `number | null` (line 1205). `hasValidAdx` is a const aliased-condition (`typeof adxValue === 'number' && Number.isFinite(adxValue)`); TS ≥4.4 narrows `adxValue` to `number` inside `hasValidAdx && adxValue < mrRangingAdxFloor`, so the expression compiles without casts.

## Verified Anchors (read 2026-06-10)

| Anchor | Location | Status |
|---|---|---|
| `const meanReversionSetup = zScore <= effectiveThreshold` | claude-agent.ts:1239 | exact match, single occurrence |
| Cycle counter declaration `let trendPullbackBlockedMacd = 0` | claude-agent.ts:1112 | CHANGE 2 inserts adjacent |
| `[TREND_PULLBACK_BLOCKED_MACD]` block closing brace | claude-agent.ts:1281–1289 | CHANGE 3 inserts after |
| Stats log `[TREND_PULLBACK_STATS] blockedMacd=…` | claude-agent.ts:1808 | CHANGE 4 appends to this line |
| `indicators.distanceToEma50Pct` | types.ts:107, `number \| null` | exists; `?.toFixed(1)` safe |
| `meanReversionSetup` usages | 1239 (def), 1415, 1416, 1424 — claude-agent.ts only | all keep the gated name; zero renames needed elsewhere; `meanReversionSetups` in system-status/route.ts is an unrelated counter over signal_type strings |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Local gate w/ toggle + counterfactual log (proposed) | Matches TREND_PULLBACK floor pattern; reversible in one line; collects tuning data before MR Policy layer | Hardcoded const (acceptable for temporary gate) | **Chosen** |
| Block in regimeMultiplier / position sizing (size→0) | No setup-detection change | Hides the block (sized-to-zero looks like a sizing bug); Claude still called — wasted tokens; no counterfactual signal | Rejected |
| Add RSI/%B conditions too (match CLAUDE.md's documented MR definition) | Closes docs↔code divergence | No loss evidence against RSI/%B; widens a temporary change in Protected Zone; YAGNI | Rejected |
| env var `MR_RANGING_ADX_FLOOR` | Tunable without deploy | Config sprawl for a gate scheduled for deletion; promote later only if it survives Macro-B/C | Rejected |
| Wait for MR Policy layer (do nothing) | No interim churn | 3/3 loss pattern keeps bleeding ~5-6% per occurrence until Macro-B/C ships | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| src/lib/claude-agent.ts | MODIFY ⚠️ | (1) line 1239 → signal/gate/setup block per CHANGE 1; (2) `const mrBlockedRangingAdxSymbols = new Set<string>()` next to line 1112 counter; (3) blocked-log block after line 1289; (4) ` mrBlockedRangingAdx=${mrBlockedRangingAdxSymbols.size}` appended to line 1808 stats log |
| src/lib/__tests__/mr-ranging-adx-gate.test.ts | CREATE | Inline replication of the gate logic (repo convention — same as trend-zle05-setup.test.ts) covering the 11-case verify matrix |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` — **Requires Amaury confirmation before implementation.** Core decision engine; the change alters which MEAN_REVERSION setups reach Claude and execution. Blast radius is bounded: only the `meanReversionSetup` definition changes; all four consumers keep the same variable name; TREND_*/EMA_RECLAIM paths and exits are untouched. Reversible by `enableMrRangingAdxGate = false`.

Test-convention note (CLAUDE.md): signal-condition tests replicate logic inline — changing the MR condition in claude-agent.ts requires the new test helper to mirror the gated logic, which the CREATE file does from day one.

## Database Changes

None. (Counterfactual data lands in GitHub Actions logs via console; agent_log rows for blocked symbols remain generic no-setup HOLDs.)

## Open Questions

None blocking. One known interaction documented for the MR Policy layer (not this spec): near-miss watchlist auto-entries bypass all setup gates via `isAutoEntry` (line 1415), so a RANGING+lowADX symbol could still auto-enter from the watchlist. Out of scope here per the DO-NOT-CHANGE list.
