# Design — TREND_ZLE05 Exits: Drop EMA50 Break, Add Z-Score Exhaustion Exit, 5% Profit Target

## Architecture Decision

All logic changes live in one function, `enforceExitRules()` (`src/lib/claude-agent.ts:159-553`),
exactly where the rules being changed already live. No new module, no new exported surface. Two
local constants are added inside the function (not module-level), next to where the existing
trailing-stop constants (`ACTIVATION_PCT`, `ATR_MULT`, `MIN_DISTANCE_PCT`, `:322-340`) already live —
this mirrors the existing convention: those are also per-signal-type lookup tables declared locally
inside `enforceExitRules()`, not exported module constants (the module-level exported constants at
`:68-70`, `mrRangingAdxFloor` etc., exist specifically for `gate-importance.ts` to import — this
change's constants have no consumer outside this function, so they follow the trailing-stop
precedent, not the gate-importance one).

## Data Flow

```
enforceExitRules() per-position loop (:185-550)
  │
  ├─ 0. ctx missing → orphaned-position reconciliation (unchanged)
  │
  ├─ 1. Universal profit target                                    [CHANGED]
  │      was: pnlPct >= 0.10
  │      now: pnlPct >= PROFIT_TARGET_PCT[signalType ?? 'default']
  │           (TREND_ZLE05 → 0.05, everything else → 0.10)
  │      message now states the applied threshold, not a fixed "10%"
  │
  ├─ 2. Universal 20-day time stop                                  [UNCHANGED]
  │
  ├─ 3. MEAN_REVERSION — kalman EXIT_LONG                           [UNCHANGED]
  │
  ├─ 4. Trend — EMA50 break                                         [CHANGED]
  │      was: signalType in {TREND, TREND_PULLBACK, TREND_ZLE05}
  │      now: signalType in {TREND, TREND_PULLBACK}                 ← TREND_ZLE05 removed
  │
  ├─ 4b. TREND_ZLE05 — z-score exhaustion                           [NEW]
  │      signalType === 'TREND_ZLE05' && Number.isFinite(zScore) && zScore >= TREND_ZLE05_Z_EXIT
  │      placed exactly where rule 4's TREND_ZLE05 branch used to fire
  │
  ├─ 5. EMA_RECLAIM — reclaim failed                                [UNCHANGED]
  ├─ 6. TREND_PULLBACK_3DAY — SMA5 reclaim                          [UNCHANGED]
  │
  └─ 7. Trailing stop (ACTIVATION_PCT / ATR_MULT / math)            [UNCHANGED]
```

`zScore` is already in scope as a plain `number` local (`:202`) by the time rule 1 runs — no new
indicator plumbing is needed; the new rule only adds a `Number.isFinite()` guard around the existing
variable.

### Illustrative diff (exact code finalized at `/implement` time)

```ts
// near :322, alongside ACTIVATION_PCT/ATR_MULT — new local constants
const PROFIT_TARGET_PCT: Record<string, number> = {
  TREND_ZLE05: 0.05,
  default: 0.10,
}
// Mirrors the TREND_ZLE05 entry ceiling (zScore <= 1.25, trendZLE05Setup, ~:1895).
// Revisit this value if that entry literal ever changes.
const TREND_ZLE05_Z_EXIT = 1.25
```

```ts
// :283-285 — was unconditional 0.10; now per-signal-type
const profitTargetPct = PROFIT_TARGET_PCT[signalType ?? 'default'] ?? PROFIT_TARGET_PCT['default']
if (pnlPct >= profitTargetPct) {
  exitReason = `Exit rule: profit target reached (${(pnlPct * 100).toFixed(1)}% >= ${(profitTargetPct * 100).toFixed(0)}%)`
}
```

```ts
// :298 — TREND_ZLE05 removed from this condition
if (!exitReason && (signalType === 'TREND' || signalType === 'TREND_PULLBACK')) {
  if (ind.ema50 !== null && ind.currentPrice < ind.ema50) {
    exitReason = `Exit rule: price $${ind.currentPrice.toFixed(2)} fell below EMA50 $${ind.ema50.toFixed(2)}`
  }
}

// new — placed immediately after, before the EMA_RECLAIM block
if (!exitReason && signalType === 'TREND_ZLE05') {
  if (Number.isFinite(zScore) && zScore >= TREND_ZLE05_Z_EXIT) {
    exitReason = `Exit rule: z-score ${zScore.toFixed(2)} reached 1.25 (entry ceiling) — move exhausted`
  }
}
```

The constant placement (`PROFIT_TARGET_PCT`, `TREND_ZLE05_Z_EXIT`) and the exact line each new block
lands on will shift slightly once `/implement` applies the real edit — this snippet establishes
intent and ordering, not final line numbers.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Remove `TREND_ZLE05` from the existing EMA50-break `\|\|` condition | One-line, isolated, cannot affect `TREND`/`TREND_PULLBACK` | None identified | **Chosen** |
| Add a `TREND_ZLE05`-specific EMA50 check with a wider buffer instead of removing it entirely | Keeps *some* EMA-based safety net | Not what was asked; the evidence (9 exits, -2.66% avg) argues for removing the rule for this setup entirely, not loosening it; also a bigger behavior change to validate in a trial | Rejected |
| `PROFIT_TARGET_PCT` as a full per-signal-type map (one entry per existing signal type, like `ACTIVATION_PCT`) | Mirrors the trailing-stop constants' style exactly | Not requested — spec explicitly asks for only `TREND_ZLE05: 0.05` + `default: 0.10`; every other signal type already uses 10%, so distinct entries would be redundant | Rejected |
| New `ExitReason` enum value (e.g. `Z_EXHAUSTION`) for the new exit's cooldown classification | Correct, explicit cooldown behavior for the new exit, consistent with every other deterministic exit reason | Requires editing `types.ts`, which this change's explicit scope forbids (`claude-agent.ts` and one test file only) | Rejected — surfaced as an Open Question instead |
| Reuse the existing `Z_SCORE_EXIT` `ExitReason` value for the new exit (via a text match `toExitReason()` already recognizes, or a small addition to its matching) | Stays within `claude-agent.ts` only — `toExitReason()` lives there; gets *some* cooldown instead of none | Semantically imprecise: `Z_SCORE_EXIT` currently means "MEAN_REVERSION completed" (`computeCooldownUntil` → same-day cooldown), not "TREND_ZLE05 exhausted" — conflates two different setups' exit semantics under one classification | Candidate — see Open Questions |
| Let the new exit reason fall through to `'UNKNOWN'` (no code change to `toExitReason()`) | Zero additional risk of misclassifying an existing reason; literally no new code beyond the two rule changes | The new exit gets **no same-day cooldown** — a closed TREND_ZLE05 position could be re-bought the same cycle if a fresh signal fires, unlike every other deterministic exit | Candidate — see Open Questions |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY ⚠️ Protected Zone | `:283-285` profit target → per-signal-type map + dynamic message; `:298-302` EMA50-break condition drops `TREND_ZLE05`; new z-score-exhaustion block inserted immediately after, before `EMA_RECLAIM` (`:305`); two new local constants (`PROFIT_TARGET_PCT`, `TREND_ZLE05_Z_EXIT`) added near `:322` |
| `src/lib/__tests__/trend-zle05-exit-rules-trial.test.ts` | CREATE | Inline-replica tests (this project's established convention for exit-rule logic — see `trailing-stop-exit-reason-guard.test.ts`), covering FR-01 through FR-13 |

No other file. `trailing-stop-exit-reason-guard.test.ts`, `trend-zle05-setup.test.ts`, `types.ts`,
`gate-importance.ts`, `SDD.md`, `risk-manager.ts`, `indicators.ts`, `config.ts`, `learning.ts`, and
all DB/migration files are untouched (see requirements.md Out of Scope for why each is safe to leave
as-is).

## Protected Zone Impact

**⚠️ Requires Amaury's explicit, fresh, in-conversation confirmation before implementation**, in
addition to spec approval — `claude-agent.ts` is on the Protected Zone list in both `CLAUDE.md` and
`SDD.md` §17. This touches only the exit-rule evaluation block inside `enforceExitRules()` — not
entry/setup detection, not position sizing, not trailing-stop math — but the file itself still
requires separate sign-off per this project's established rule (a `tasks.md` checkbox alone is not
sufficient — confirmed directly with Amaury each time, not inferred).

## Database Changes

None.

## Open Questions

**How should the new z-score-exhaustion exit reason be classified for same-day-cooldown purposes,
given `types.ts` cannot be touched?**

`toExitReason()` (`:169-183`) maps exit-reason text to an `ExitReason` enum value, which
`computeCooldownUntil()` (`:135-157`) then maps to a cooldown duration. The required exact message
text for the new exit (`"Exit rule: z-score X.XX reached 1.25 (entry ceiling) — move exhausted"`)
matches none of `toExitReason()`'s existing substring checks, so without a code change there it falls
through to `'UNKNOWN'` → `computeCooldownUntil()` returns `null` → **no cooldown is applied**, unlike
every other deterministic exit reason in this function.

Two ways to resolve this without touching `types.ts`:

1. **Leave it as `'UNKNOWN'` / no cooldown** (zero additional code — `toExitReason()` untouched). A
   closed TREND_ZLE05 position could, in principle, be re-bought the same cycle if a fresh qualifying
   signal fires for the same symbol. Simplest, but a real behavioral gap specific to this new exit.
2. **Add one more branch to `toExitReason()`** (still inside `claude-agent.ts`, no `types.ts` change)
   that matches this new message and returns the existing `'Z_SCORE_EXIT'` value, giving it the same
   same-day cooldown as a MEAN_REVERSION fair-value exit. Stays within the file-scope constraint, but
   reuses a label whose name ("Z_SCORE_EXIT") was written for a different setup's exit semantics —
   acceptable or not is a judgment call, not a correctness question.

This spec does not pick one — **Amaury's call before `/implement` proceeds.** Whichever is chosen,
it's a small addition inside the already-in-scope `claude-agent.ts` and does not expand the file
list in the Expected-git-diff constraint.
