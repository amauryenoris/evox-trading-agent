# Design — Guard Trailing-Stop Exit Reason Against Overwriting an Earlier Exit

## Architecture Decision

Single-file, single-condition change, entirely within `enforceExitRules()` in
`src/lib/claude-agent.ts` (Protected Zone, explicitly authorized). The fix adds one boolean clause
(`!exitReason`) to the existing trailing-stop trigger condition at lines 296-302 — no new
functions, no signature changes, no restructuring of the five-condition check sequence. This
brings the trailing-stop block in line with the "first check to set `exitReason` wins" pattern
every other condition in this function already follows.

## Data Flow

1. `enforceExitRules()` evaluates, in order, per position: profit target → time stop →
   MEAN_REVERSION z-score reversion → TREND-family EMA50 breach → EMA_RECLAIM EMA50 breach — each
   already guarded by `!exitReason`, so only the first to match sets it.
2. Regardless of whether `exitReason` is now set, the trailing-stop block's state-tracking
   (lines 242-295 — `highSinceEntry` update, activation, `trailingStop` ratcheting, and their
   `updatePositionContext()` persistence) runs exactly as it does today — **unchanged, unconditional**.
3. At the trailing-stop block's final check (lines 296-303), the condition gains one new clause:
   `!exitReason && trailingActivated && !justActivated && !madeNewHigh && trailingStop !== null &&
   currentPrice <= trailingStop`. If `exitReason` is already set, this whole condition is now
   false regardless of the trailing-stop math, so `exitReason` is left untouched.
4. Everything downstream (`toExitReason()` mapping, `agent_log` insert, `closePosition()` call,
   `exitReasons` Map population for cooldown-writing) is unchanged — it simply now sees whichever
   reason was set first, consistently with every other condition in the function.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Add `!exitReason` to the trailing-stop block's final `if` condition only (lines 296-302) | Matches the "first to fire wins" pattern already used by every other condition; minimal, surgical, single-line diff; state-tracking (242-295) stays fully unconditional as confirmed necessary by the diagnostic | None identified | **Chosen** |
| Skip the entire trailing-stop block (242-308) when `exitReason` is already set | Slightly fewer DB writes on cycles where another reason already fired | Loses `highSinceEntry`/`trailingActivated`/`trailingStop` tracking continuity in the rare `closePosition()`-failure case (per diagnostic, this write is usually moot but matters exactly then); no correctness or meaningful efficiency benefit since the write already happens unconditionally today | Rejected — diagnostic explicitly confirmed lines 242-295 must stay unconditional |
| Add a guard to the TREND-family/EMA_RECLAIM EMA50-breach checks instead (defensive symmetry) | N/A | Those checks are not the bug — they already correctly guard on `!exitReason`; adding anything there is out of scope and unnecessary | Rejected |
| Reorder checks so trailing-stop runs before the signal-type-specific exits | Would also prevent overwriting | Reverses today's intentional priority (signal-type-specific exits are meant to be checked before the generic trailing mechanism per the function's existing comments); changes behavior for cases where trailing-stop currently doesn't fire but would under a new order; far larger blast radius than adding one clause | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `src/lib/claude-agent.ts` | MODIFY | Add `!exitReason &&` as the first clause of the trailing-stop block's final trigger condition (lines 296-302). No other line in the function changes. |
| `src/lib/__tests__/*` (new or existing file, decided at implementation time) | MODIFY/CREATE (additive only) | New test case(s) covering the fixed behavior — trailing-stop no longer overwrites an already-set TREND-family/EMA_RECLAIM exit reason, while still firing normally when no earlier reason was set. Following this project's established "replicate logic inline, don't import from `claude-agent.ts`" convention. |

## Protected Zone Impact

⚠️ `claude-agent.ts` **is** modified — explicitly authorized by Amaury in the request that
generated this spec, in the same file as the prior cooldown fixes this session. No other
Protected Zone file (`config.ts`, `risk-manager.ts`, `indicators.ts`) is touched.

## Database Changes

None — no schema, column, index, or RLS change. `updatePositionContext()`'s call shape and
frequency are unchanged (NFR-02).

## Open Questions

None blocking. Exact test file name/location (new file vs. addition to an existing exit-rules
test file) is an implementation detail with no behavioral ambiguity, left to the implementation
step.
