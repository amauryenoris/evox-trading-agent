# Design — CHANGE split-4: extract the legacy signal classifier and the rotation chooser (pure move, no behaviour change)

## Architecture Decision

Move 4 of the `claude-agent.ts` split. `generateSignalType` and `evaluateRotation` are, in effect, pure: their only outside input is the `ZSCORE_ENTRY_THRESHOLD` binding of `./config` (read at call time, so the harness mock `ZSCORE_ENTRY_THRESHOLD = -1.3`, `mocks.ts:78-83`, applies equally inside a new module). They are coupled by the `SignalResult` type, so they move together, with their two interfaces, into one module `src/lib/signal-rotation.ts`. The call site in `runAgentCycle` (the `[SIGNAL]` log, the trigger, `closePosition`, `decisions.push`, the `splice`, the `[ROTATION]` logs) stays in `claude-agent.ts` because it mutates cycle state. The same change closes follow-up P-a of the split-3 review: it registers `macro-bars-staleness.ts` in `coverage.include` and in the Protected Zone audit.

## What moves (HEAD `97584b5`)

| Item | Lines | Notes |
|------|-------|-------|
| "SIGNAL TYPE DETECTOR" banner | `claude-agent.ts:620-622` | Moves with the code |
| `interface SignalResult` | `:624-627` | Becomes `export interface` |
| `generateSignalType` | `:629-660` | Becomes `export function`; reads `ZSCORE_ENTRY_THRESHOLD` (`:635`) |
| "POSITION ROTATION" banner | about `:663-664` | Moves with the code |
| `interface RotationDecision` | `:666-670` | Becomes `export interface` |
| `evaluateRotation` | `:672-707` | Becomes `export async function`; contains no `await` |
| Delete range | `:620-708` | Includes the blank line before the next banner (`CLAUDE API`, `:709-711`) |

The call site (`:1523-1549`) is not touched. `signalResult` has no other use: it feeds only the `[SIGNAL]` log and the rotation trigger.

## Purity audit (STEP 0, sections 1 and 2)

| Function | Hidden inputs | Imports needed | Cycle risk |
|----------|---------------|----------------|------------|
| `generateSignalType` | `ZSCORE_ENTRY_THRESHOLD` (config) | `./config`, type `TechnicalIndicators` | none: `config.ts` has no imports |
| `evaluateRotation` | none; `parseFloat` of `unrealized_plpc` | types `AlpacaPosition`, `TechnicalIndicators`, plus `SignalResult` (same module) | none: `types.ts` imports only `./setups` |

In `claude-agent.ts`, `ZSCORE_ENTRY_THRESHOLD` stays used (`:1165`, `:1559-1560`), and `TechnicalIndicators` and `AlpacaPosition` are used in many other places, so no import should become unused. If `tsc` or ESLint show one, only that name is removed and it is listed in the report.

## Edits to claude-agent.ts (and only these)

1. Delete `:620-708` (banners, interfaces, both functions, trailing blank line).
2. Add `import { generateSignalType, evaluateRotation } from './signal-rotation'` directly after the `./execution-gates` import (`:29`).

A script detects the line ending and writes CRLF.

## Tests (new, independent of the harness)

`src/lib/__tests__/signal-rotation.test.ts` (LF), written before the module (RED), after a throwaway script is run on the current text and its observed values are recorded:

- `generateSignalType`: MEAN_REVERSION (RANGING; z just below and exactly at the threshold; RSI 44 / 45 / null; %B 0.19 / 0.2; confidence `min(|z|/3, 1)` and its cap); TREND_FOLLOWING (TRENDING; ADX 25 / 25.01; MACD histogram 0 and positive; `macdLine` against `signalLine`; price against `sma50` null / below / above; RSI 50 / 50.01 / 74.99 / 75; confidence `min(adx/50, 1)` and its cap); NO_SIGNAL; `kalman` null; `macd` null.
- `evaluateRotation`: confidence 0.69 / 0.70; priority 1 at z = -0.8 / -0.81 with the exact reason text; priority 2 at P&L 0.05 / 0.0501 with confidence 0.80 / 0.81; no candidates; position without `kalman`; tie of two priority-1 candidates (first in the array wins); priority 1 beating priority 2; empty `openPositions`.
- The module is imported as is, so the `ZSCORE_ENTRY_THRESHOLD` used is the real one from `config.ts` (outside the harness); the test reads it from the same import instead of hardcoding it.
- No fake timers, no mocks, no network.

Existing coverage: golden `h-rotation-close.json` runs the real functions once (MEAN_REVERSION, confidence 0.80, priority-1 candidate P1 at z -0.2) and pins the reason prefix `Rotation: z-score -0.200 reverted to fair value`. No test or golden pins the `[SIGNAL]` or `[ROTATION]` console lines.

## Registration (authorized)

| File | EOL | Edit |
|------|-----|------|
| `.github/workflows/pr-review.yml` | LF | Two lines after `"src/lib/execution-gates.ts"` (`:83`): `"src/lib/signal-rotation.ts"` and `"src/lib/macro-bars-staleness.ts"`, same indent |
| `vitest.config.ts` | LF | `'src/lib/signal-rotation.ts', 'src/lib/macro-bars-staleness.ts'` appended to `coverage.include` (`:19`) |
| `CLAUDE.md` | CRLF | File Structure row after the `execution-gates.ts` row (`:88`): ``| `signal-rotation.ts` | Legacy signal classifier (RANGING/TRENDING criteria) and position-rotation chooser — used only for the `[SIGNAL]` log and the rotation trigger, NOT the live setup detection |`` . "Confirm with Amaury" row after the `execution-gates.ts` row (`:226`): ``| `src/lib/signal-rotation.ts` | Rotation trigger and rotation candidate choice — can close a live position |`` |

`pr-review.yml` is checked for YAML validity after the edit. If no YAML parser is installed locally, the check is done with a Node-based parser or reported as not verified.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| One module for both functions and both interfaces | `SignalResult` stays with its only consumers | One module with two concerns | Chosen |
| Two modules (classifier, rotation) | Finer split | `evaluateRotation` depends on `SignalResult`; 75 lines total | Rejected |
| Also move the call-site block | Bigger reduction of `runAgentCycle` | Mutates cycle state; not a pure move | Rejected |
| Drop `async` from `evaluateRotation` | Honest signature | Changes the return type and the `await` at the call site | Rejected (pure move) |
| Name `rotation.ts` | Short | `generateSignalType` is not rotation | Rejected for `signal-rotation.ts` |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/signal-rotation.ts` | CREATE | Two functions, two interfaces; LF |
| `src/lib/claude-agent.ts` | MODIFY | Block deletion and one import line; CRLF; Protected Zone, authorized |
| `src/lib/__tests__/signal-rotation.test.ts` | CREATE | Direct tests (LF) |
| `.github/workflows/pr-review.yml` | MODIFY | Two lines in `PROTECTED_ZONE` |
| `vitest.config.ts` | MODIFY | Two entries in `coverage.include` |
| `CLAUDE.md` | MODIFY | Two table rows (CRLF) |
| `specs/extract-signal-rotation/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, `config.ts`, the call-site block, `specs/docs-5-selector-criteria/tasks.md` (still modified and uncommitted; SHA-256 recorded before and after).

## Risks

- `claude-agent.ts` is CRLF (2484 lines, 2484 CR). Mitigation: EOL-aware script, CR-count check.
- `h-rotation-close.json` pins the reason prefix; any change in the text breaks the golden. Mitigation: byte copy and the exact-text assertion in the new test.
- A rotation closes a live position. The change must not alter the trigger or the candidate choice; both are copied unchanged and pinned by direct tests.
- Registering `macro-bars-staleness.ts` makes the `pr-review` audit flag future changes to it; that is the intent.
- Documents citing moved lines: STEP 0 found none for these functions; `SDD.md` §8 (`:165-177`) and `:289-290` describe the rotation in prose only. The search is repeated at the end and any hit is listed.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (FR-20 to FR-24). The request states the owner authorization for this change only. `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` are edited as authorized. No other Protected Zone file is touched; `config.ts` is only imported from.

## Database Changes

None.

## Open Questions

- **Q-1 (authorization name):** the request names "Jorge"; the project owner is Amaury. Same treatment as before: treated as the owner's authorization. Confirm.
- **Q-2 (delete range):** the request says "~lines 621-707". At HEAD the block, including its leading banner, is `:620-708` (banner at `:620-622`, trailing blank at `:708`). Default: delete exactly that, so that one blank line remains between the previous function and the `CLAUDE API` banner. Confirm.
- **Q-3 (`export async`):** `evaluateRotation` becomes `export async function`, with `async` kept and no `await` added or removed. Confirm.
- **Q-4 (test threshold):** the new test reads `ZSCORE_ENTRY_THRESHOLD` from `./config` instead of hardcoding `-1.3`, so it follows the real value (the harness pins `-1.3` only in its own mock). Confirm.
- **Q-5 (YAML check):** if no YAML parser is available locally, the validity check of `pr-review.yml` is done with a Node parser, or reported as not verified. Confirm.
