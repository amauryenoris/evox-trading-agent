# Design — mean-reversion-exit-std-config

## Architecture Decision

This establishes `config.ts` as the home for one new env-driven trading parameter, `MEAN_REVERSION_EXIT_STD`, and threads it into `indicators.ts`'s `calculateKalman()` as the new default for `exitStd`. This is a narrow, single-value promotion from a buried default-parameter literal to a named, environment-configurable constant — it does not touch the Kalman computation itself, `calculateAllIndicators()`, or any caller. Notably, this does **not** mirror `STOP_LOSS_PCT`'s actual existing pattern (inline `process.env` reads repeated at each call site, confirmed via diagnostic to have zero centralization) — it instead follows `config.ts`'s own stated intent ("Single source of truth for trading parameters") as a genuinely new, first-of-its-kind pattern in this codebase: an env-driven value living in `config.ts` rather than read inline. This distinction is deliberate per the user's explicit instruction to add it to `config.ts`, not to literally replicate `STOP_LOSS_PCT`'s inline pattern.

## Data Flow

1. `config.ts` evaluates `MEAN_REVERSION_EXIT_STD = parseFloat(process.env.MEAN_REVERSION_EXIT_STD ?? '0.8')` once, at module load.
2. `indicators.ts` imports `MEAN_REVERSION_EXIT_STD` from `./config` (new import — first cross-file import in this file).
3. `calculateKalman()`'s `exitStd` parameter default becomes `MEAN_REVERSION_EXIT_STD` instead of the literal `0.5`.
4. `calculateAllIndicators()` continues calling `calculateKalman(bars)` with no explicit override, so every symbol's `kalman.signal` computation now uses the new default.
5. `enforceExitRules()` (already reading `ind.kalman.signal === 'EXIT_LONG'` per the recently-merged fix) is unaffected in code — only the value it observes at runtime changes, from an effective `-0.5` threshold back to `-0.8`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `MEAN_REVERSION_EXIT_STD` to `config.ts`, import into `indicators.ts` | Matches `config.ts`'s stated "single source of truth" intent; env-configurable without a code change going forward | First env-driven value in `config.ts` — a new pattern, not an extension of `STOP_LOSS_PCT`'s inline convention | **Chosen** (explicit user instruction) |
| Mirror `STOP_LOSS_PCT` literally — inline `parseFloat(process.env.MEAN_REVERSION_EXIT_STD ?? '0.8')` directly at `indicators.ts:145` | True fidelity to the only existing env-var convention in this codebase (confirmed via diagnostic); no new cross-file import | Doesn't give `config.ts` a role; the value stays buried in a function signature rather than centralized | Rejected (user explicitly chose the `config.ts` route in this prompt) |
| Retroactively centralize `STOP_LOSS_PCT`/`RISK_PCT` into `config.ts` too, for consistency | Would make `config.ts`'s header comment fully true | Far larger, unrelated change touching 6 call sites across 2 files; explicitly out of scope | Rejected (out of scope) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/config.ts` | MODIFY | Add one new exported constant, `MEAN_REVERSION_EXIT_STD`, positioned after the 3 existing individual exports and before `INSTRUMENT_BLACKLIST`. |
| `src/lib/indicators.ts` | MODIFY | Add one new import (`from './config'`); change `calculateKalman()`'s `exitStd` default parameter from `0.5` to `MEAN_REVERSION_EXIT_STD`. No other line changes. |

## Protected Zone Impact

⚠️ **Both `src/lib/config.ts` and `src/lib/indicators.ts` are in the Protected Zone.** Per `CLAUDE.md`'s explicit table, both require Amaury's confirmation before touching — "changes affect all live trades" (config.ts) and "Signal calculation — Kalman filter" (indicators.ts). The source prompt's claim that neither file needs special authorization is incorrect and is not relied upon. A dedicated Protected Zone confirmation checkbox (covering both files) is required in `tasks.md`, separate from normal spec approval — same handling as the three Protected-Zone-touching features earlier this session.

## Database Changes

None.

## Open Questions

None — the default value (0.8, restoring the pre-fix effective threshold), the naming (`MEAN_REVERSION_EXIT_STD`), and the placement (`config.ts`, not inline) were all explicitly specified by the user in the source prompt.
