# Design — CHANGE docs-6: close the three LOW findings of move 2 (docs + config + one warn log; no trading behaviour change)

## Architecture Decision

Three independent follow-ups to move 2 (commit `43c8e67`). L-1 and the `CLAUDE.md` rows are documentation. L-2 adds `exit-cooldown.ts` to two lists, exactly as `2d96902` did for `prompt-builder.ts`. L-3 adds one log-only guard in `enforceExitRules`; it cannot change an exit decision because it has no branch effect. Nothing moves, nothing is renamed, no golden should change (the harness spies on `console.warn`, `harness.ts:39`, and no scenario has an invalid `buyTimestamp`).

## L-1 — citations (current positions, re-read at implementation)

Every `claude-agent.ts:\d` hit outside `specs/` and `.tmp/` today (grep over `SDD.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`, `.claude`, `src`, `scripts`):

| File:line | Citation | What it points to now | Proposed replacement |
|-----------|----------|-----------------------|----------------------|
| `SDD.md:284` | `claude-agent.ts:945-982` | `resolveIocFinalState`, `claude-agent.ts:893` | `(`resolveIocFinalState` in `claude-agent.ts`)` |
| `SDD.md:284` | `claude-agent.ts:2227-2243` | The 0-fill `IOC_NOT_FILLED` branch of the buy path (`claude-agent.ts:2182-2183`; the ranking path has the same at `:2374`) | `(the `IOC_NOT_FILLED` branch of the buy path in `runAgentCycle`)` |
| `SDD.md:290` | `claude-agent.ts:1612-1624` | `positions.splice(0, positions.length, ...rotatedPositions)`, `claude-agent.ts:1571` | `(the `positions.splice(...)` call in the rotation block of `runAgentCycle`)` |
| `SDD.md:290` | `:1468`, `:2100`, `:1483` | `let openPositionsCount = positions.length` (`:1415`), `if (openPositionsCount >= maxPositions)` (`:2047`), `const slotsAvailable = maxPositions - openPositionsCount` (`:1430`) | `(`openPositionsCount` in `runAgentCycle`)`, `(`if (openPositionsCount >= maxPositions)`)`, `(`slotsAvailable`)` |
| `gate-importance.ts:10` | `claude-agent.ts:1711-1728` | `trendPullback3DayUptrendOk`, `trendPullback3DayStreakOk` (`claude-agent.ts:1662-1675`) | `claude-agent.ts `trendPullback3DayUptrendOk`/`trendPullback3DayStreakOk`` |
| `self-flagged-disqualifying-risk.test.ts:72` | `claude-agent.ts:1652` | The unconditional `decision.action = 'HOLD'` (`claude-agent.ts:2040`) | `claude-agent.ts's unconditional `decision.action = 'HOLD'` override` |

The `:1652` citation was already stale before move 2; the identification rests on the comment text ("unconditional override ... plain assignment") matching the only unconditional assignment, `:2040`. Exact replacement wording is fixed at implementation after re-reading each place; any citation that cannot be tied to a symbol is left and listed.

## L-2 — config and docs

| File | EOL | Edit |
|------|-----|------|
| `vitest.config.ts` | LF | `include: [..., 'src/lib/prompt-builder.ts']` becomes `[..., 'src/lib/prompt-builder.ts', 'src/lib/exit-cooldown.ts']` |
| `.github/workflows/pr-review.yml` | LF | One line `            "src/lib/exit-cooldown.ts"` after `"src/lib/prompt-builder.ts"` (`:79` today), same indentation |
| `CLAUDE.md` | CRLF | File Structure table: new row after `protective-stop.ts` (`:86`): `exit-cooldown.ts` — trading-day count, exit-reason mapping and cooldown date rules (pure helpers used by `claude-agent.ts`). "Confirm with Amaury" table: new row after `prompt-builder.ts` (`:222`): `src/lib/exit-cooldown.ts` — "Exit reason mapping and cooldown rules — decides when a symbol can be re-entered" |

Effect of the `pr-review.yml` edit: a PR that changes `exit-cooldown.ts` is flagged by the Protected Zone audit, as for `prompt-builder.ts`. Effect of the `vitest.config.ts` edit: `exit-cooldown.ts` is included in coverage reports; no test result changes.

## L-3 — guard

Current code (`claude-agent.ts:192-208`): `daysOpen = ctx ? getTradingDaysOpen(ctx.buyTimestamp) : 0` (`:194`), then the time stop `if (!exitReason && daysOpen >= 20) { ... }` (`:207-209`). The new guard goes directly before `:207`:

```ts
    if (!exitReason && !Number.isFinite(daysOpen)) {
      console.warn('[TIME_STOP_SKIPPED_INVALID_TIMESTAMP] symbol=' + position.symbol + ' buyTimestamp=' + ctx.buyTimestamp)
    }
```

Why this form:
- `!exitReason` mirrors the time-stop condition, so the message only appears when the time stop would actually have been evaluated (not when a profit target already fired).
- It uses `position.symbol` and `ctx.buyTimestamp`; `ctx` is non-null here because `:176-245` `continue`s when it is missing. The concatenation form follows the request text.
- It has no `return`, `continue` or assignment: for every finite `daysOpen` the condition is false and execution is the same instruction sequence as before; for `NaN`, `daysOpen >= 20` stays false, so there is still no time stop.
- Exactly three lines are added, all CRLF; `getTradingDaysOpen` and `exit-cooldown.ts` are untouched.

Test (`src/lib/__tests__/time-stop-invalid-timestamp.test.ts`, new, LF), with the mock setup pattern of `mr-profit-floor-exit-rules.test.ts` (real `enforceExitRules`, mocked `alpaca`, `db`, `learning`):
- invalid `buyTimestamp` ("not-a-date"): `console.warn` called with the exact text; no `closePosition` call; the result has no SELL decision for the symbol.
- finite `buyTimestamp`: no `[TIME_STOP_SKIPPED_INVALID_TIMESTAMP]` call.
- RED first: the invalid-timestamp assertion fails before the guard exists.

## Data flow (unchanged)

`enforceExitRules` -> `getTradingDaysOpen` -> `daysOpen` -> (new: warn if not finite) -> time-stop check -> signal exits -> `toExitReason` -> `exitReasons`. Nothing downstream reads the guard.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Guard with `!exitReason &&` | Message only when the time stop was reachable | Slightly longer condition | Chosen |
| Guard on `daysOpen` alone | Shorter | Logs "skipped" even when a profit target already exited | Rejected |
| Make an invalid timestamp trigger the time stop | Safer exit | Behaviour change; outside this change | Rejected (out of scope) |
| Fix `getTradingDaysOpen` to throw or clamp | Removes the `NaN` | Changes the pinned behaviour and the call sites | Rejected |
| Replace citations with symbol names | Survives code moves | Slightly longer text | Chosen |
| Delete the citations | Shortest | Loses the pointer | Rejected |
| Update citations to new line numbers | Smallest text change | Breaks again on the next move | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `SDD.md` | MODIFY | Lines 284 and 290: citations to symbol names (CRLF) |
| `src/lib/gate-importance.ts` | MODIFY | Comment at line 10 (LF) |
| `src/lib/__tests__/self-flagged-disqualifying-risk.test.ts` | MODIFY | Comment at line 72 (LF) |
| `vitest.config.ts` | MODIFY | One entry in `coverage.include` (LF) |
| `.github/workflows/pr-review.yml` | MODIFY | One line in `PROTECTED_ZONE` (LF) |
| `CLAUDE.md` | MODIFY | Two table rows (CRLF) |
| `src/lib/claude-agent.ts` | MODIFY | Three-line guard (CRLF); Protected Zone, authorized |
| `src/lib/__tests__/time-stop-invalid-timestamp.test.ts` | CREATE | Guard test (LF) |
| `specs/docs-6-move2-followups/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, `exit-cooldown.ts`, `getTradingDaysOpen`, any file under `specs/` outside the new folder, `specs/docs-5-selector-criteria/tasks.md` (still modified and uncommitted from docs-5b).

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (the three-line guard only). The request states the owner authorization for this change only. `.github/workflows/pr-review.yml` and `vitest.config.ts` are edited as authorized. `CLAUDE.md` is edited in two table rows (task 4c). No other Protected Zone file is touched.

## Database Changes

None.

## Open Questions

- **Q-1 (truncated request):** the text of task 5 ends in "Keep CRLF in". Default reading: "Keep CRLF in claude-agent.ts" (FR-31/FR-32). Confirm.
- **Q-2 (test for the guard):** the request does not list a test, but FR-33 to FR-35 and TDD call for one. Default: add `time-stop-invalid-timestamp.test.ts` (new file, no source change beyond the guard). Confirm, or say to skip it.
- **Q-3 (guard condition):** default is `!exitReason && !Number.isFinite(daysOpen)` (mirrors the time-stop condition). The request says only "when the value is not finite". Confirm.
- **Q-4 (bare citations):** `SDD.md:290` also has bare `:1468`, `:2100`, `:1483` that the request does not list but that moved the same way. Default: replace them too. Confirm.
- **Q-5 (`:1652` identification):** the self-flagged test comment cites `:1652`, which was already wrong before move 2. Default: map it to the unconditional `decision.action = 'HOLD'` (`:2040`). Confirm.
- **Q-6 (authorization name):** the request names "Jorge"; the project owner is Amaury. Same treatment as in move 2: treated as the owner's authorization. Confirm.
