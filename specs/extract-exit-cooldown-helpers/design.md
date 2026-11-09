# Design — CHANGE split-2: extract the exit/cooldown helpers from claude-agent.ts (pure move, no behaviour change)

## Architecture Decision

Move 2 of the `claude-agent.ts` split (move 1 was `prompt-builder.ts`, commit `2d96902`). The three helpers are pure or depend only on global state that the characterization harness already controls (`Date.now()` through `vi.useFakeTimers`, `console.warn` through `vi.spyOn`, `harness.ts:36-40`). They move to one new module, `src/lib/exit-cooldown.ts`, whose only import is `import type { ExitReason } from './types'`. `types.ts` imports only from `./setups` (`types.ts:1`), so there is no import cycle. `claude-agent.ts` keeps all call sites and imports the three names. Nothing else moves.

## What moves (line numbers at HEAD e0fe38d; re-verified in the implementation phase)

| Item | Where | Lines | Notes |
|------|-------|-------|-------|
| `getTradingDaysOpen` | `claude-agent.ts` | 91-97 | Uses `Date.now()` |
| EDT/EST comment block | `claude-agent.ts` | 99-102 | Moves with `computeCooldownUntil` |
| `computeCooldownUntil` | `claude-agent.ts` | 103-125 | Pure `switch` on `ExitReason` |
| `toExitReason` | `claude-agent.ts` | 137-153 | Nested in `enforceExitRules` (127-488); captures nothing; two `console.warn` |
| `COOLDOWN_UNKNOWN_EXIT_REASON` | `claude-agent.ts` | 859-861 | Stays (only consumer: `:1509`) |

Call sites that stay untouched: `:247`, `:455` (`enforceExitRules`), `:1318` (cooldown persistence block), `:1387` (ghost-close loop), `:1509` (flag). `enforceStopLosses` (`:822-857`) uses none of the helpers.

## Purity audit (STEP 0, sections 2 and 3)

| Helper | Hidden inputs | Needs a parameter to stay identical |
|--------|---------------|--------------------------------------|
| `getTradingDaysOpen` | `Date.now()` | No: the fake clock is global |
| `computeCooldownUntil` | None | No |
| `toExitReason` | `console.warn` at `:139`, `:151` | No: the console spy is global |

`toExitReason` uses only its parameter `reason`, `console.warn` and the `ExitReason` type; it captures no variable of `enforceExitRules`, so it hoists verbatim.

## "Byte for byte" (the one mechanical deviation)

`toExitReason` is nested, so its lines carry a two-space indent that a top-level function does not have, and the other two need `export`. The comparison in the diff review is therefore: new text equals old text after removing exactly two leading spaces from the `toExitReason` lines and the `export ` prefix from the three declarations, and after normalising CRLF to LF. Any other difference is a failure. (Open question Q-1.)

## Data flow (unchanged)

`enforceExitRules` -> `getTradingDaysOpen` (time stop at `daysOpen >= 20`) and `toExitReason` (exit string -> `ExitReason` -> `exitReasons` map) -> `runAgentCycle` -> `computeCooldownUntil` -> `upsertSymbolCooldown`. The ghost-close loop calls `getTradingDaysOpen` for its log text. All of it behaves as before; only the definition site changes.

## Edits to claude-agent.ts (and only these)

1. Delete lines 91-97 (`getTradingDaysOpen`), with the blank line that follows.
2. Delete lines 99-125 (comment block and `computeCooldownUntil`), with the blank line that follows.
3. Delete lines 137-153 (`toExitReason`), with the blank line that follows.
4. Add one import line after the `./sma5-exit` import (`:50`): `import { getTradingDaysOpen, computeCooldownUntil, toExitReason } from './exit-cooldown'`.

The `ExitReason` type import (`:78`) stays: it is still used at `:134`, `:1307` and `:1503`. A script detects the line ending per file and writes every touched line in CRLF.

## Tests (new file, independent of the harness)

`src/lib/__tests__/exit-cooldown.test.ts`, written before the module (RED, failing on the missing import), after observing current behaviour with a throwaway script that is deleted afterwards:

- `getTradingDaysOpen`: fake timers; 0 days; about 1.4 days; 28 calendar days (float behaviour observed, not assumed: `28 * (5/7)` may land just above or below 20); invalid timestamp (observed result is pinned; `NaN` is the expected observation, to be confirmed).
- `computeCooldownUntil`: three distinct `Date` objects; every branch; `default` via cast; assertions with `toBe`.
- `toExitReason`: eight mappings, normalization, empty/null/undefined/whitespace with exact `[EXIT_REASON_EMPTY]` text, unmatched with exact `[EXIT_REASON_UNMATCHED]` text.

Existing coverage, for reference: the characterization scenario (g) and the unit tests of `mr-profit-floor`, `trend-3day` and `orphaned-position` exercise `toExitReason` and `getTradingDaysOpen` through the real `enforceExitRules`; goldens mask dates (`record.ts:11`), so no golden pins any cooldown date. The new test closes those gaps for the three pure functions.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One module with three helpers | One import, same domain | — | Chosen |
| Two modules (time helper, reason helpers) | Finer split | More files for 40 lines | Rejected |
| Also move `COOLDOWN_UNKNOWN_EXIT_REASON` | One more constant out | Its only consumer stays; the new module would export a flag it never reads | Rejected |
| Inject clock and logger | Easier to test | Changes signatures and call sites; not a pure move | Rejected |
| Add a new harness scenario for the ghost-close loop first | Fixes the coverage gap | The loop does not move; goldens mask dates anyway | Rejected (not needed for this move) |
| Leave `toExitReason` nested, export the other two | Smaller diff | `toExitReason` is the one with the testable branches | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/exit-cooldown.ts` | CREATE | Three exported functions and the EDT/EST comment; LF |
| `src/lib/claude-agent.ts` | MODIFY | Remove three definitions, add one import; CRLF kept (Protected Zone, authorized) |
| `src/lib/__tests__/exit-cooldown.test.ts` | CREATE | Direct unit tests of the three functions; LF |
| `specs/extract-exit-cooldown-helpers/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, `.github/workflows/*`, `vitest.config.ts`, `CLAUDE.md`, `specs/docs-5-selector-criteria/tasks.md`.

## Risks

- `claude-agent.ts` is CRLF (2564 lines, 2564 CR at STEP 0); a wrong write mixes line endings. Mitigation: EOL-aware script and the CR-count check.
- Line numbers in other files that cite `claude-agent.ts` shift by about 50 lines: `gate-importance.ts` (comments at `:10`, `:20-31`), `CLAUDE.md`, `.claude/agents/*`, specs. Listed only, as the request says.
- The working tree already contains an uncommitted change to `specs/docs-5-selector-criteria/tasks.md`; it must not be included or reverted.
- Moving `toExitReason` changes the stack frame of its `console.warn` calls; no test or golden reads it.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (FR-17 to FR-22). The request states the owner authorization for this change only. No other Protected Zone file is touched.

## Database Changes

None.

## Open Questions

- **Q-1 (byte for byte):** the nested `toExitReason` cannot be byte-identical after hoisting (two-space indent) and `export` is added. Default: accept exactly these two mechanical differences, verified in the diff review. Confirm.
- **Q-2 (authorization name):** the request names "Jorge" as the authorizer, while this project's owner is Amaury. Default: treat the message as the owner's explicit authorization for this change. Confirm.
- **Q-3 (import position):** default is one line after the `./sma5-exit` import. Confirm or give another place.
- **Q-4 (coverage and CI lists):** `vitest.config.ts` `coverage.include` and the `pr-review.yml` Protected Zone list were updated for `prompt-builder.ts` in move 1. They are out of scope here (not authorized). Default: report as a follow-up decision. Confirm.
