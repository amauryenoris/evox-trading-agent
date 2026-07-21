# Requirements — Guard Trailing-Stop Exit Reason Against Overwriting an Earlier Exit

## Context

Confirmed via two prior read-only diagnostics (this session, not re-verified here): inside
`enforceExitRules()`, every exit condition follows a "first to set `exitReason` wins" pattern via
a `!exitReason` guard — universal exits (profit target, time stop), MEAN_REVERSION's z-score
reversion, and (as of this same fix family) TREND-family/EMA_RECLAIM's EMA50-breach checks all
respect this — except the trailing-stop block's final assignment (`claude-agent.ts:296-303`),
which has no such guard. Because it runs unconditionally after every other check, it can silently
overwrite an already-set `TREND`/`TREND_PULLBACK`/`TREND_ZLE05`/`EMA_RECLAIM` exit reason with its
own `"Trailing stop triggered: ..."` message whenever both conditions are independently true in
the same cycle for the same position.

`MEAN_REVERSION` is structurally immune today: its z-score-exit condition (`claude-agent.ts:203`)
is itself guarded by `!ctx?.trailingActivated`, which interacts with the trailing-stop block's own
`!justActivated` requirement so the two conditions can never both be true for the same position in
the same cycle.

Confirmed live: 4/4 real production trailing-stop closes (FCX 2026-05-14, NVDA 2026-06-03, RDW
2026-06-04, AAPL 2026-07-14) did not exhibit this overwrite — in all four, price was still above
EMA50 when trailing stop fired. This is a structural risk confirmed by reading the code, not yet a
manifested data-corruption case in the sample checked.

Confirmed live: lines 242-295 (state-tracking — `highSinceEntry` update, trailing activation,
`trailingStop` ratcheting, and their persistence via `updatePositionContext()`) must remain
unconditional. This write is usually moot anyway — `removeOpenPositionContext()` deletes the same
row moments later whenever the position actually closes this cycle for any reason — and only
matters in the rare `closePosition()`-failure case, where a one-cycle delay in updating is
self-healing (next cycle recomputes from whatever was last persisted). Only the final `exitReason`
assignment at lines 296-303 is the actual bug location.

No existing test constrains this ordering — this is a clean, additive test target.

## Functional Requirements

FR-01: The system shall not assign the trailing-stop exit reason to a position for which an
earlier exit condition already set an exit reason in the same cycle.
FR-02: The system shall assign the trailing-stop exit reason to a position when its trailing-stop
trigger condition is true and no earlier exit condition set an exit reason this cycle.
FR-03: The system shall preserve `MEAN_REVERSION`'s existing exit-reason behavior unchanged —
its already-correct immunity to this overwrite must not be altered by this fix.
FR-04: The system shall preserve `TREND`/`TREND_PULLBACK`/`TREND_ZLE05`/`EMA_RECLAIM`'s existing
EMA50-breach exit-reason behavior unchanged when the trailing-stop condition is not also true.
FR-05: The system shall continue to update and persist `highSinceEntry`, `trailingActivated`, and
`trailingStop` every cycle a position is evaluated, regardless of whether an exit reason was
already set by an earlier check.
FR-06: The system shall preserve the trailing-stop exit-reason message text unchanged.

## Non-Functional Requirements

NFR-01: The fix shall be a single added boolean condition — no restructuring of the surrounding
control flow, function signature, or state-tracking logic.
NFR-02: The fix shall not change the number or order of `updatePositionContext()` calls.

## Constraints

C-01: This feature modifies `claude-agent.ts`, a Protected Zone file — explicitly authorized by
Amaury in the request that generated this spec, in the same file already touched by the prior
cooldown fixes this session.
C-02: This feature must not modify lines 242-295 (state-tracking and its persistence) — they
remain fully unconditional.
C-03: This feature must not modify the trailing-stop message text (`claude-agent.ts:303-306`).
C-04: This feature must not modify `MEAN_REVERSION`'s existing `!ctx?.trailingActivated` guard
(line 203).
C-05: This feature must not modify the TREND-family/EMA_RECLAIM EMA50-breach checks (lines
209-220) — they already correctly guard on `!exitReason`.
C-06: This feature must not modify `computeCooldownUntil()`, the exit-reason-to-cooldown-duration
mapping, any gate logic, or `self_flagged_disqualifying_risk` logic.
C-07: This feature must not modify any existing test file's existing assertions.

## Out of Scope

- Adding new test coverage beyond confirming the fixed behavior (a new, small test addition is
  expected, but this spec does not require broader test-suite restructuring).
- Any change to `enforceStopLosses()`'s own STOP_LOSS logic — unrelated code path, not part of
  `enforceExitRules()`.
- Retroactively relabeling any historical `agent_log`/`trade_evaluations` row whose exit reason may
  have been affected by this gap (none confirmed in the 4-case historical check performed in the
  originating diagnostic) — this spec is forward-looking code only.
- Changing the check order of the five exit conditions — only the trailing-stop block's guard is
  added; profit target, time stop, MEAN_REVERSION, TREND-family, and EMA_RECLAIM keep their
  current relative order.
