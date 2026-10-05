# Requirements — TREND_ZLE05 Exits: Drop EMA50 Break, Add Z-Score Exhaustion Exit, 5% Profit Target

## Background

STEP 0 diagnostic (2026-10-05, this session) confirmed `enforceExitRules()` (`src/lib/claude-agent.ts:159-553`),
first-match-wins evaluation order: universal profit target `pnlPct >= 0.10` (`:283-285`), universal
20-day time stop (`:286-288`), then signal-specific rules — rule "Trend — EMA50 break"
(`ind.ema50 !== null && ind.currentPrice < ind.ema50`, `:298-302`) currently applies to `TREND`,
`TREND_PULLBACK`, and `TREND_ZLE05`.

Evidence cited for this trial: 9 historical TREND_ZLE05 exits via EMA50 break averaged -2.66% (1
winner) — entries sit only 0-5% above EMA50, so the rule cuts on noise before the trend has room to
work. The TREND_ZLE05 entry ceiling is `zScore <= 1.25` (confirmed live this session at
`claude-agent.ts:1895`, inside `trendZLE05Setup`). Hourly-snapshot replay of 27 TREND_ZLE05 trades
shows an exit at first `zScore >= 1.25` would have fired in 14 trades at +2.53% average (vs +1.60%
if held), and a 5% profit target would have fired in 7 at +5.40%. In 25 TREND_ZLE05 entries, the
10-day maximum reached +5% in 20 but +10% in only 1 — the current 10% target almost never triggers
for this setup.

This is an explicit trial: reviewed after 15-20 new TREND_ZLE05 trades, reverted if it underperforms.
Changes apply **only** to TREND_ZLE05. No other signal type's exit behavior changes.

**Verified this session, re-confirmed live against current code** (line numbers current as of this
session, after the `macro-bars-truncation-fix` commit — they differ slightly from the STEP 0
diagnostic's approximate citations):
- EMA50-break rule: `claude-agent.ts:297-302`
- TREND_ZLE05 entry ceiling: `claude-agent.ts:1895` (`zScore > 0 && zScore <= 1.25`, inside `trendZLE05Setup`, `:1889-1899`)
- `zScore` is already extracted as a plain `number` local variable at `claude-agent.ts:202` (`const zScore = ind.kalman.zScore`), guarded by an earlier `if (!ind?.kalman) { ...; continue }` at `:186-200` — so by the time any exit rule runs, `ind.kalman` is guaranteed non-null and `zScore` is in scope as a `number`. The type (`types.ts:114`) declares `zScore: number` (never `null`), so the only realistic non-finite case is a `NaN` produced by the Kalman math itself, not a missing field.
- The universal profit-target exit's message hardcodes the threshold in text: `` `Exit rule: profit target reached (${(pnlPct * 100).toFixed(1)}% >= 10%)` `` (`:284`) — this must become dynamic once the threshold varies by signal type, or TREND_ZLE05 exits would print a self-contradictory message (e.g. "5.2% >= 10%").
- No other code in `claude-agent.ts` hardcodes the "10%" profit-target value elsewhere (checked: the only other "10%" is an unrelated position-sizing comment at `:925`, "never exceed 10% of total equity" — not a profit target, out of scope).
- The TREND_ZLE05 entry-side prompt text sent to Claude (`:791-793`) describes only entry conditions, not exit rules — unaffected by this change, no edit needed there.

**FAIL FAST checks performed this session — both resolved, neither blocks this spec**:
- "kalman zScore not available at that point" — resolved: it is available (see above), already a local `number`.
- "EMA50 rule cannot be changed for TREND_ZLE05 without altering TREND/TREND_PULLBACK" — resolved: the three signal types are checked by name in a single `||` condition (`:298`); removing `TREND_ZLE05` from that condition is a one-line, isolated change that cannot affect `TREND` or `TREND_PULLBACK`.

**One real, non-blocking gap found this session, surfaced in `design.md`'s Open Questions rather than
decided silently**: the new z-score-exhaustion exit's required message text does not contain any
substring that `toExitReason()` (`:169-183`) currently matches, so it would classify as `'UNKNOWN'`
and — per `computeCooldownUntil()`'s switch (`:135-157`) — receive **no same-day cooldown**, unlike
every other deterministic exit reason. Fixing this by adding a new `ExitReason` enum value would
require editing `types.ts`, which conflicts with this change's explicit scope (`claude-agent.ts` and
one test file only). See `design.md` Open Questions for the two non-file-touching options.

---

## Functional Requirements

FR-01: The system shall exclude `TREND_ZLE05` from the EMA50-break exit rule in `enforceExitRules()`.

FR-02: The system shall continue to apply the EMA50-break exit rule to `TREND` and `TREND_PULLBACK` positions, unchanged.

FR-03: The system shall close a `TREND_ZLE05` position when its Kalman z-score is a finite number greater than or equal to `TREND_ZLE05_Z_EXIT`.

FR-04: Where the Kalman z-score is `null`, `undefined`, or `NaN`, the system shall not trigger the z-score exhaustion exit.

FR-05: The system shall not apply the z-score exhaustion exit rule to any signal type other than `TREND_ZLE05`.

FR-06: The system shall evaluate the z-score exhaustion exit rule after the universal profit-target and time-stop checks and before the trailing-stop rule, in the evaluation-order position currently occupied by the EMA50-break rule for `TREND_ZLE05`.

FR-07: The system shall define `TREND_ZLE05_Z_EXIT` as a named constant equal to `1.25`.

FR-08: The system shall apply a profit-target threshold of `0.05` (5%) to `TREND_ZLE05` positions.

FR-09: The system shall apply a profit-target threshold of `0.10` (10%) to every signal type other than `TREND_ZLE05`, including legacy positions where `signal_type` is `null`.

FR-10: The system shall define `PROFIT_TARGET_PCT` as a named constant map keyed by signal type, containing `TREND_ZLE05: 0.05` and a `default: 0.10` entry used for every other key.

FR-11: The profit-target exit's reason message shall state the threshold that was actually applied for that position's signal type, not a fixed "10%" string.

FR-12: The z-score exhaustion exit's reason message shall read exactly `"Exit rule: z-score X.XX reached 1.25 (entry ceiling) — move exhausted"`, with `X.XX` being the position's actual z-score formatted to two decimal places.

FR-13: The `TREND_ZLE05_Z_EXIT` constant's definition shall carry a comment stating that it mirrors the entry ceiling `zScore <= 1.25` and must be revisited if that entry literal changes.

---

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero errors after the change.

NFR-02: The full existing test suite shall pass with no regressions, plus new tests covering this change's behavior.

NFR-03: The change shall not alter the TREND_ZLE05 entry conditions, including the `zScore <= 1.25` literal inside `trendZLE05Setup` (`:1889-1899`).

NFR-04: The change shall not alter any other signal type's entry conditions.

NFR-05: The change shall not alter trailing-stop math, `ACTIVATION_PCT`, `ATR_MULT`, `STOP_LOSS_PCT`, the 20-day time stop, rotation logic (`evaluateRotation()`), or `runExitOnly()`.

---

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. **⚠️ Requires Amaury's explicit, fresh, in-conversation confirmation before implementation**, separate from spec approval, per `CLAUDE.md`'s File Permission Matrix and this project's established Protected Zone rule (a `tasks.md` checkbox alone does not satisfy this).

C-02: No file changes other than `src/lib/claude-agent.ts` and one test file.

C-03: `risk-manager.ts`, `indicators.ts`, `config.ts`, and `learning.ts` shall not be touched.

C-04: No DB or migration changes.

C-05: `types.ts` (the `ExitReason` type) shall not be touched — see Open Questions for how the new exit reason is classified without a new enum value.

C-06: `gate-importance.ts` shall not be touched.

C-07: The TREND_ZLE05 entry-side prompt text sent to Claude (`:791-793`) shall not be touched (it describes entry conditions only and is already accurate).

---

## Out of Scope

- TREND_ZLE05 entry conditions (the `1.25` ceiling in `trendZLE05Setup`) and every other setup's entry conditions
- Trailing-stop math, `ACTIVATION_PCT`, `ATR_MULT` for any signal type
- `STOP_LOSS_PCT`, the 20-day time stop, rotation logic, `runExitOnly()`
- Any other signal type's exit rules or profit-target threshold besides the `default: 0.10` fallback
- `SDD.md` (its signal-type and "universal exits" tables will become stale for TREND_ZLE05 after this change — a known, deliberate documentation gap, not fixed here)
- `gate-importance.ts` registration of `TREND_ZLE05_Z_EXIT`
- Adding a new `ExitReason` enum value / touching `types.ts` for cooldown classification of the new exit reason (see `design.md` Open Questions)
- Updating `trailing-stop-exit-reason-guard.test.ts`'s replica (its EMA50-break condition still lists `TREND_ZLE05`, matching pre-change behavior; no existing test case in that file exercises `signalType: 'TREND_ZLE05'`, so no assertion breaks — but the replica becomes one line out of sync with the real code). Accepted as out of scope to honor this change's explicit "one test file" diff constraint.
