# Design — Disable the z <= -2 sizing override

## Architecture Decision

The override switch is a module constant in the pure sizing module `src/lib/position-sizing.ts` (line 4: `export const Z_SIZING_OVERRIDE_ENABLED = true`), **not** in `src/lib/config.ts`. It is read in one place, inside `computeBuyQuantity`, as the default of the optional `zOverrideEnabled` input. The only production caller (`claude-agent.ts:2424`) does not pass `zOverrideEnabled`, so changing the constant to `false` changes live sizing with no edit to any Protected Zone file. The change is therefore one line in `position-sizing.ts` plus the test updates needed so the existing tests keep describing the intended behaviour. The override code path stays dormant, as the owner asked.

## Where the flag is defined and read (verified in the spec phase)

| Location | Role |
|---|---|
| `src/lib/position-sizing.ts:4` | Definition: `export const Z_SIZING_OVERRIDE_ENABLED = true` (comment on line 3 says "true ... (current behavior)") |
| `src/lib/position-sizing.ts:76` | Only read: `(input.zOverrideEnabled ?? Z_SIZING_OVERRIDE_ENABLED) && input.zScore <= Z_OVERRIDE_THRESHOLD` |
| `src/lib/position-sizing.ts:77` | Effect: `adjustedShares = isZOverrideApplied ? baseShares : Math.round(baseShares * confidenceFactor)` |
| `src/lib/__tests__/position-sizing.test.ts:6, 54` | Imported and asserted `toBe(true)` |
| `src/lib/claude-agent.ts:2424-2435` | Caller; does not pass `zOverrideEnabled`; destructures `baseShares`, `adjustedShares`, `confidenceFactor` only (`zOverrideApplied` is not logged or stored) |

No other file reads the flag (grep across `src/`, `scripts/`, `.github/`).

## Effect on sizing

With the flag false, for z <= -2 the quantity becomes `round(cappedBase x max(0.5, min(confidence, 1)))` where `cappedBase` is unchanged (regime multiplier, Kalman halving, buying-power cap, equity cap). Illustration from the request: INTC (confidence 0.32) and AAPL (confidence 0.42) would both use the 0.5 floor, so roughly half of the ~$10k equity-capped size (about $5k), unverified against exact inputs. Any entry with confidence <= 0.5 gets half size; 0.80 gets 80%.

## Tests that depend on the default (all in `position-sizing.test.ts`)

| Test | Today | Needed |
|---|---|---|
| `constants` (line 51-56) | asserts the flag is `true` | assert `false`; keep the 10% cap assertion |
| `golden quantities ... (switch true)` (58-80); 8 of the 13 golden entries have z <= -2 | relies on the default | pass `zOverrideEnabled: true` so production quantities are still proven |
| `differential check against the frozen pre-refactor code (switch true)` (82-124); the frozen legacy code always applies the override | relies on the default | pass `zOverrideEnabled: true` in the `computeBuyQuantity` call |
| `breakdown ... MP 2026-10-13` (219-237) | expects `zOverrideApplied: true`, `adjustedShares: 250` | pass `zOverrideEnabled: true` to keep it as the "override on" breakdown, and add a default-flag breakdown (see below) |
| `switch false` (126-142) | passes `zOverrideEnabled: false` explicitly | unchanged (still valid) |
| other tests | `zScore: 0` or assert `baseShares` only (computed before the flag) | unchanged |

New tests (default flag, no `zOverrideEnabled` passed):
1. Default is false (in the `constants` test).
2. z -2.13, confidence 0.32: `confidenceFactor` 0.5, quantity `round(base x 0.5)`, `zOverrideApplied` false.
3. z -2.13, confidence 0.80: `confidenceFactor` 0.8, quantity `round(base x 0.8)`.
4. MP 2026-10-13 breakdown with the default flag: base 250, factor 0.5, adjusted 125, `zOverrideApplied` false.
5. Explicit `zOverrideEnabled: true` at confidence 0.32: quantity equals `baseShares` (old behaviour still tested; the golden test also covers it).

Other test files that import `../claude-agent` (4 of them per the STEP 0 report) may run `runAgentCycle` with z <= -2 and assert a quantity; the full Vitest run decides. If one fails only because of the new default, it is reported, not silently edited (it may fall outside the two files this change may edit).

## Logs, snapshot, prompt and docs (to report at implementation)

| Item | Finding in the spec phase |
|---|---|
| `[BUY SIZING]` log (`claude-agent.ts:2441`) | Prints `baseShares`, `multiplier` (the confidence factor), `adjustedShares`. With the override on it showed e.g. `multiplier=0.50` but `adjustedShares=baseShares` (misleading); with the flag off the three values agree. No text claims full size. |
| Snapshot / agent_log fields | `zOverrideApplied` is not read by `claude-agent.ts`, so it is not persisted by the caller (to confirm at implementation). |
| Prompt text | `claude-agent.ts:906` (regime multiplier) and `:932` ("Max Position Size: 10% of equity") describe caps, not an override. No mention of z <= -2 sizing found. |
| `SDD.md:88` | Describes `= baseShares if zScore <= -2.0 (extreme edge override)`: becomes inaccurate. Reported, not edited (outside the authorized files). |
| `CLAUDE.md:179` | Already describes the normal formula with the confidence multiplier (floor 50%): consistent with the new state. |
| Ranking comparator (`claude-agent.ts:2628-2629`, `SDD.md:178`) | Prefers z <= -2 candidates when only one slot is free. Independent of the flag; unchanged. |

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Set the constant to `false` (requested) | One line; reversible; no Protected Zone edit | Tests that assume `true` need explicit flags | Chosen |
| Pass `zOverrideEnabled: false` from `claude-agent.ts` | Explicit at the call site | Edits a Protected Zone file; not needed | Rejected |
| Delete the override path | Less code | Not reversible; owner asked to keep it dormant | Rejected |
| Make the flag an env variable | Switchable without a commit | New configuration surface; not requested | Rejected |
| Lower `MAX_POSITION_EQUITY_FRACTION` | Smaller sizes | Changes another constant; forbidden | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/position-sizing.ts` | MODIFY | Line 4: `true` -> `false` (and the line 3 comment, see O-1) |
| `src/lib/__tests__/position-sizing.test.ts` | MODIFY | Default-dependent tests made explicit; new default-flag tests |
| `.tmp/z-override-off-report.md` | CREATE | Deliverable (gitignored) |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. The flag is not in `config.ts`; `claude-agent.ts` is only read, not edited. The "one-line Protected Zone authorization" in the request is not needed.

## Database Changes

None. Open positions are not touched.

## Open Questions

- **O-1** The comment on line 3 says "With true, z <= -2.0 discards the confidence step (current behavior)". After the change "current behavior" is wrong. Default: update that comment minimally (same file, not Protected). Say if you prefer to leave it.
- **O-2** `SDD.md:88` will describe the override as active. Default: report it only (not edited, outside the authorized files). Say if you want it updated in this change.
- **O-3** If another test file (one that imports `../claude-agent`) fails because of the new default, the authorization covers only the two files above. Default: stop and report that test instead of editing it.
- **O-4** Timing: the cron workflows check out `main`, so sizing changes at the first cycle after the change reaches `main`. Default: no action here; the commit and push are a separate request.
