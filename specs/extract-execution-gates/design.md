# Design — CHANGE split-3: extract the execution-gate helpers (pure move, no behaviour change)

## Architecture Decision

Move 3 of the `claude-agent.ts` split (after `prompt-builder.ts` and `exit-cooldown.ts`). `checkLiquidity` and `checkTradingHours` are pure functions whose only hidden inputs are the global `Date` and `Intl`, both controlled by the harness (`vi.useFakeTimers`, `harness.ts:36-37`). They go to a new import-free module `src/lib/execution-gates.ts`. `guardMacroBars` is the defence of the briefing inputs, so it goes next to `isMacroBarsStale` in the existing `macro-bars-staleness.ts`, adding only a type import from `./types`. `checkOvertradingLimit` is dead code (no caller) and stays untouched. `claude-agent.ts` keeps every call site, every gate message and the `else if` order.

## What moves (HEAD `a453f8c`)

| Item | From | To | Notes |
|------|------|----|-------|
| `checkLiquidity` | `claude-agent.ts:743-745` | `execution-gates.ts` | `prevDayVolume >= 1_000_000`; call site `:2110` |
| `checkTradingHours` | `claude-agent.ts:747-761` | `execution-gates.ts` | `new Date()`, `Intl.DateTimeFormat` in `America/New_York`, window `585..930`; call site `:2127` |
| `guardMacroBars` | `claude-agent.ts:1021-1029` | `macro-bars-staleness.ts` | `new Date()`, `Date.now()`, `console.warn('[STALE_MACRO_BARS] ...')`; call sites `:1066-1070` |
| `checkOvertradingLimit` | `claude-agent.ts:763-766` | stays | No caller; ESLint already warns; deletion is a separate decision |

The section banner "EXECUTION GATES" (`claude-agent.ts:739-741`) stays, because `checkOvertradingLimit` remains under it.

## Purity audit (STEP 0 sections 2 and 3)

| Function | Hidden inputs | Imports needed | Cycle risk |
|----------|---------------|----------------|------------|
| `checkLiquidity` | none | none | none |
| `checkTradingHours` | global `Date`, `Intl` (host ICU data) | none | none |
| `guardMacroBars` | global `Date` (twice), `console.warn`, `isMacroBarsStale` (same file) | `import type { AlpacaBar } from './types'` | none: `types.ts` imports only `./setups` (`types.ts:1`); `macro-bars-staleness.ts` is imported only by `claude-agent.ts` |

## Edits to claude-agent.ts (and only these)

1. Delete `checkLiquidity`, `checkTradingHours` (with the blank lines that separate them) and `guardMacroBars`.
2. Add `import { checkLiquidity, checkTradingHours } from './execution-gates'`.
3. Change `import { isMacroBarsStale } from './macro-bars-staleness'` (`:28`) to `import { guardMacroBars } from './macro-bars-staleness'`.
4. Remove `AlpacaBar` from the type-import block (`:71`).

Steps 3 and 4 are needed because after the move `isMacroBarsStale` and `AlpacaBar` have no other use in `claude-agent.ts` (grep: `isMacroBarsStale` only at `:28` and `:1022`; `AlpacaBar` only at `:71` and `:1021`). Leaving them would add two new ESLint warnings ("nothing new" is required). This is the same kind of edit as FR-19 of move 1. `getTodayBuyExecutions` stays imported (used at `:1419` and by `checkOvertradingLimit`). A script detects the line ending and writes CRLF.

## Tests (new, independent of the harness)

Both written before the code (RED), after observing the current behaviour with a throwaway script run on the current text:

- `src/lib/__tests__/execution-gates.test.ts`: `checkLiquidity` at 999_999, 1_000_000 and 0; `checkTradingHours` at 9:44, 9:45, 15:30 and 15:31 ET in EST and in EDT; one instant around each DST change (2026-03-08 and 2026-11-01); midnight ET. UTC instants are computed in the throwaway script with `Intl` for the `America/New_York` offset; expected values are the observed ones.
- `src/lib/__tests__/guard-macro-bars.test.ts`: empty bars (`lastBar=none ageDays=-1`), fresh bars (same array reference, no warning), stale bars with data (`[]`, exact warning with the observed `lastBar` and `ageDays`), with a `console.warn` spy.
- Both use fake timers restored in `afterEach` and no mocks of other modules.
- Dependence on host data: `checkTradingHours` depends on the ICU time-zone data of Node; this is noted in the report. CI uses Node 24 (`agent-cron.yml`); local Node version is recorded in the baseline.
- The existing `macro-bars-staleness.test.ts` (inline replica of `isMacroBarsStale`) stays unchanged.

## Registration (authorized)

| File | EOL | Edit |
|------|-----|------|
| `.github/workflows/pr-review.yml` | LF | `            "src/lib/execution-gates.ts"` after `"src/lib/exit-cooldown.ts"` (`:82`) |
| `vitest.config.ts` | LF | `, 'src/lib/execution-gates.ts'` appended to `coverage.include` (`:19`) |
| `CLAUDE.md` | CRLF | File Structure row after the `exit-cooldown.ts` row (`:87`): `execution-gates.ts` — liquidity and trading-hours gate helpers (pure; clock and `Intl` are global) . "Confirm with Amaury" row after the `exit-cooldown.ts` row (`:224`): `src/lib/execution-gates.ts` — the entry gates (liquidity, trading hours) — decide whether a BUY may be placed |

No new row for `macro-bars-staleness.ts`: it has no row today and the request does not authorize one.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| `guardMacroBars` in `macro-bars-staleness.ts` | Same domain as `isMacroBarsStale`; decided in STEP 0 | The module gets one type import and a `console.warn` | Chosen |
| `guardMacroBars` in `execution-gates.ts` | One new module | It is not an execution gate | Rejected |
| Move `checkOvertradingLimit` too | Whole section out | Dead code; adds a `./db` import; hides the ESLint warning | Rejected (stays) |
| Extend the `isMacroBarsStale` import and keep it | Matches "extend" literally | Leaves an unused import and a new ESLint warning | Rejected (replace the name) |
| Inject clock into `checkTradingHours` | Easier tests | Changes signature and call site | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/execution-gates.ts` | CREATE | Two exported functions; LF; no imports |
| `src/lib/macro-bars-staleness.ts` | MODIFY | Type import and `guardMacroBars`; LF |
| `src/lib/claude-agent.ts` | MODIFY | Three deletions and import changes; CRLF; Protected Zone, authorized |
| `src/lib/__tests__/execution-gates.test.ts` | CREATE | Direct tests (LF) |
| `src/lib/__tests__/guard-macro-bars.test.ts` | CREATE | Direct tests (LF) |
| `.github/workflows/pr-review.yml` | MODIFY | One line in `PROTECTED_ZONE` |
| `vitest.config.ts` | MODIFY | One entry in `coverage.include` |
| `CLAUDE.md` | MODIFY | Two table rows (CRLF) |
| `specs/extract-execution-gates/` | CREATE | requirements, design, tasks; `review.md` at the end |

Not touched: goldens, `checkOvertradingLimit`, `exit-cooldown.ts`, `isMacroBarsStale`, `macro-bars-staleness.test.ts`, `specs/docs-5-selector-criteria/tasks.md`.

## Risks

- `claude-agent.ts` is CRLF (2514 lines, 2514 CR). Mitigation: EOL-aware script, CR-count check.
- Moving `guardMacroBars` changes where the `[STALE_MACRO_BARS]` warning is emitted from, not its text; the harness spies on `console.warn` and records nothing from it (`harness.ts:38-40`), so no golden pins it.
- In the harness every macro symbol returns `[]` (`world.ts:124`), so the real function runs only its empty-bars path in the characterization; the new tests cover the other paths.
- Host ICU data can change `checkTradingHours` results at the edges on an old Node; reported, not fixed.
- Documents citing moved line numbers: STEP 0 found none for these functions; the search is repeated at the end and any hit is listed.

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is edited (FR-17 to FR-24). The request states the owner authorization for this change only. `pr-review.yml`, `vitest.config.ts` and `CLAUDE.md` are edited as authorized. No other Protected Zone file is touched.

## Database Changes

None.

## Open Questions

- **Q-1 (unused imports):** the request says to "extend" the `./macro-bars-staleness` import, but after the move `isMacroBarsStale` and `AlpacaBar` are unused in `claude-agent.ts`. Default: replace `isMacroBarsStale` by `guardMacroBars` in that import and remove `AlpacaBar` from the type imports, so no new ESLint warning appears (FR-21, FR-22). Confirm, or say to keep them (two new warnings).
- **Q-2 (authorization name):** the request names "Jorge"; the project owner is Amaury. Same treatment as before: treated as the owner's authorization. Confirm.
- **Q-3 (CLAUDE.md wording):** default row texts are in the Registration table. Confirm or give other wording.
- **Q-4 (macro-bars-staleness coverage):** `macro-bars-staleness.ts` is not added to `coverage.include` or to the Protected Zone audit (not authorized). Confirm that is intended.
