# Design — CHANGE 0c: docs matrix update + non-default-env scenario (no production code)

## Architecture Decision

Two independent pieces of documentation and test work, with no production code. First, `CLAUDE.md` and `SDD.md` are brought in line with what the repository does after CHANGE 0b and CHANGE 1: the new `prompt-builder.ts` module joins the permission matrix and the file table, the `npm audit` statement is corrected, and the z <= -2 sizing override is described as disabled. Second, one more scenario in the characterization harness closes review finding M-2: the harness runs with default-equal env values, so a call that passes `{}` instead of `process.env` into `buildEnrichedPrompt` would not change any golden. A scenario with non-default env values makes that regression visible. A read-only check of the hook configuration reports whether the new module is guarded.

## Findings from the spec phase (verified against the files)

| Topic | Finding |
|---|---|
| `CLAUDE.md` matrix (lines 199-211) | lists 7 files plus `.env`, `vercel.json` and migrations; no `prompt-builder.ts` |
| `CLAUDE.md` File Structure `src/lib/` table (lines 80-96) | lacks `prompt-builder.ts`, `position-sizing.ts` and `protective-stop.ts` (all three missing) |
| `CLAUDE.md:179` Position sizing | says "x confidence multiplier (floor 50%)"; does not mention the override or its state |
| `CLAUDE.md:253` | "All workflows run `npm ci` + `npm audit --audit-level=critical` before executing." |
| Workflows today | all 8 run `npm ci` and use Node 24; **only `security-audit.yml` runs `npm audit`** (`--audit-level="$AUDIT_LEVEL"`, default `critical`, weekdays 12:00 UTC, opens or closes a GitHub issue); six workflows carry a comment saying the audit does not gate them |
| `SDD.md:88` | "= baseShares if zScore <= -2.0 (extreme edge override)" in the sizing diagram |
| `SDD.md:261` | repeats the stale "All workflows run ... `npm audit --audit-level=critical`" |
| `SDD.md:178` | ranking priority "z-score <= -2.0 wins over all": still true, the comparator does not read the sizing flag |
| `.claude/settings.json` (project) | top-level keys: `mcpServers` only; **no `hooks` key**; no `settings.local.json`; no `.claude/settings.json` in the workspace root. STEP 0 also found no `hooks` key in the user settings and no hook script naming `config.ts` in plugins |
| Env use in the cycle | `MAX_POSITIONS`, `MAX_POSITION_SIZE`, `STOP_LOSS_PCT` reach the prompt through `process.env` at the call site; `STOP_LOSS_PCT` also feeds sizing and the stop price in `claude-agent.ts`; `MAX_POSITIONS` also sets the slot count |

## Part 1 — documentation edits

`CLAUDE.md` (line endings preserved, no other line touched):

1. Matrix: add `| src/lib/prompt-builder.ts | Builds the exact text Claude receives — changes alter analyst input |`.
2. File Structure table: add rows for `prompt-builder.ts` (pure module building the system prompt and the per-symbol user prompt; env values passed as an argument), `position-sizing.ts` (BUY quantity: Kovner formula, regime multipliers, caps, confidence factor; `Z_SIZING_OVERRIDE_ENABLED`) and `protective-stop.ts` (profit-floor and trailing-stop calculations). Descriptions are checked against each source file at implementation time.
3. Line 253: replace with a statement of the facts in the table above (Node 24 and `npm ci` everywhere; `npm audit` only in `security-audit.yml`; trading workflows not gated by it).
4. Line 179: add that the z <= -2 override is disabled (`Z_SIZING_OVERRIDE_ENABLED = false` in `position-sizing.ts`, code path dormant) and that the confidence factor `max(0.5, confidence)` applies to every entry.

`SDD.md`:

1. Diagram line 88: replace with text stating that the override is disabled and dormant, and that the confidence step applies to every entry.
2. Line 261: same correction as CLAUDE.md (O-1).
3. §15 60-day note and §9 ranking text: unchanged.

## Part 2 — the non-default-env scenario

A new test `(m)` in `claude-agent.characterization.test.ts`, built on scenario (a) (MEAN_REVERSION BUY, confidence 0.32, z -2.4) with the three variables set inside the test body after the harness `beforeEach` (the harness `afterEach` already restores those three keys). Expected effects, derived from the code:

| Env value | Effect on the recorded output |
|---|---|
| `MAX_POSITIONS=7` | prompt `Open Positions: 0/7` and `Max Simultaneous Positions: 7`; 7 free slots instead of 5 |
| `MAX_POSITION_SIZE=0.20` | prompt `Max Position Value Allowed: $20000.00` and `Max Position Size: 20% of equity ($20000.00)`; **no effect on the order**: sizing uses the fixed `MAX_POSITION_EQUITY_FRACTION` 0.10 (an observation to report, not to fix) |
| `STOP_LOSS_PCT=0.07` | prompt `Stop Loss: 7% below entry`; sizing risk per share, the quantity and the GTC stop price (1 - 0.07) |

Recorded: the usual record as `m-non-default-env-buy.json`, and the prompt (with the Claude call params header, same format as scenarios a and b) as `m-non-default-env-buy.prompt.txt`. Independent assertions pin the five prompt lines (FR-35) so the intent does not rest on the golden alone. The scenario count goes from 14 to 15; the characterization test count from 22 to 23.

Proving the scenario bites without touching production code: a temporary, uncommitted test file mocks `../prompt-builder` with a wrapper that forwards every argument except `env`, which it replaces with `{}`, then runs the new scenario against its golden; it must fail. The file is deleted afterwards. A second sanity check changes one env value and expects a failure.

## Part 3 — hook check (read-only)

Re-run the STEP 0 search at implementation time: parse the project and user settings listing keys only (no values), search workspace `.claude/` and plugin hook files for the Protected Zone path names, and report. Expected result from the spec-phase evidence: no hook exists, so `prompt-builder.ts` is not covered by any hook I can see. The report states that explicitly and does not infer coverage; the CI audit in `pr-review.yml` already lists the module (CHANGE 1).

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| New scenario based on (a) with three env overrides (chosen) | One scenario covers the prompt, the stop price and the slot count; reuses fixtures | Golden also records sizing effects | Chosen |
| Only a unit test of `buildEnrichedPrompt` | Simple | Does not test the call site, which is the gap | Rejected |
| Change the harness default env to non-default values | Every golden would exercise it | Regenerates all existing goldens; forbidden | Rejected |
| Parameterize the harness `ENV` per scenario | Cleaner for future scenarios | Edits support code and risks the existing goldens; not needed for one scenario | Rejected |
| Fix only `CLAUDE.md` and leave `SDD.md:261` | Narrower diff | Leaves the same false statement in the second document | See O-1 |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `CLAUDE.md` | MODIFY | Matrix row, three file-table rows, workflow sentence, sizing paragraph |
| `SDD.md` | MODIFY | Sizing diagram line, §15 audit sentence |
| `src/lib/__tests__/claude-agent.characterization.test.ts` | MODIFY | One new scenario `(m)` |
| `src/lib/__tests__/__golden__/claude-agent/m-non-default-env-buy.json` | CREATE | New golden |
| `src/lib/__tests__/__golden__/claude-agent/m-non-default-env-buy.prompt.txt` | CREATE | New prompt golden |
| `.tmp/change-0c-report.md` | CREATE | Deliverable (gitignored) |

No file under `src/lib` other than tests, no existing golden, no workflow and no settings file changes.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `CLAUDE.md` and `SDD.md` are documentation, not Protected Zone files; `CLAUDE.md` defines the matrix and the edit only adds a restriction.

## Database Changes

None.

## Open Questions

- **O-1** `SDD.md:261` repeats the same stale audit statement. The request names `CLAUDE.md` for that sentence and only the override lines for `SDD.md`. Default: correct it in `SDD.md` too (same facts, same risk). Say if you want `SDD.md` limited to the override lines.
- **O-2** Add `position-sizing.ts` and `protective-stop.ts` to the permission matrix as well? STEP 0 proposed them (they decide money). The request adds them only to the File Structure table. Default: matrix gets `prompt-builder.ts` only.
- **O-3** The `CLAUDE.md` schedule block lists only three of the eight workflows. Default: add one sentence after the corrected audit statement naming the other workflows (`daily-bars-sync`, `earnings-calendar-sync`, `position-health`, `security-audit`, `pr-review`) and pointing to `.github/workflows/`, without inventing schedules.
- **O-4** Other stale facts seen and left alone: `MAX_SPREAD_BPS = 50` in `CLAUDE.md` and `SDD.md` (the code has 100), and the `claude-agent.ts` row of the file table still says it does position sizing. Default: report them, do not edit.
- **O-5** The hook search stops at the locations STEP 0 named plus plugin hook files; managed or enterprise settings cannot be read from here. If nothing is found the report says "no hook found", not "covered" and not "not covered by policy".
- **O-6** The env values for the scenario (7, 0.20, 0.07). Default as in FR-32.
- **O-7** The scenario will record that `MAX_POSITION_SIZE=0.20` changes the prompt but not the order quantity (sizing cap is fixed at 10%). Default: capture as-is and mention in the report; do not fix.
- **O-8** The `{}`-regression check uses an uncommitted temporary test with a module mock instead of editing `claude-agent.ts`; if you prefer to keep a permanent version of that check, it would be a separate request.
