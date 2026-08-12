# Requirements — mean-reversion-exit-std-config

## Functional Requirements

FR-01: The system shall expose a `MEAN_REVERSION_EXIT_STD` constant in `config.ts`, sourced from `process.env.MEAN_REVERSION_EXIT_STD`, defaulting to `0.8` when unset.
FR-02: The system shall use `MEAN_REVERSION_EXIT_STD` as `calculateKalman()`'s `exitStd` default parameter value, replacing the current hardcoded `0.5` literal.
FR-03: The system shall continue computing `ind.kalman.signal === 'EXIT_LONG'` as `zScore >= -exitStd`, unchanged in formula — only the value feeding `exitStd` changes.
FR-04: Where `calculateAllIndicators()` calls `calculateKalman(bars)` with no explicit `exitStd` override, the system shall rely on the new default, producing an effective `EXIT_LONG` threshold of `zScore >= -0.8` (restoring the value `enforceExitRules()` used before the recent MEAN_REVERSION exit fix switched to reading `kalman.signal`).

## Non-Functional Requirements

NFR-01: `entryStd` shall remain an unchanged hardcoded `1.3` default — out of scope for this feature.
NFR-02: `calculateKalman()`'s function body (the computation itself, lines ~147-201) shall remain byte-for-byte unchanged — only the `exitStd` parameter's default-value expression changes.
NFR-03: No validation, bounds-checking, or NaN-handling shall be added beyond what `parseFloat(... ?? '0.8')` already provides, matching the existing `STOP_LOSS_PCT`-style rigor level elsewhere in the codebase — not a new, stricter bar.
NFR-04: `npx tsc --noEmit` and `npm run build` shall pass with no new type errors.
NFR-05: All existing tests shall pass unmodified.
NFR-06: The completion report shall state the resulting effective threshold explicitly (confirming `EXIT_LONG` now fires at `zScore >= -0.8`, not `-0.5`).

## Constraints

C-01: **Both `config.ts` and `indicators.ts` are in the Protected Zone** per `CLAUDE.md`'s "Confirm with Amaury before touching" table (`config.ts`: "Trading parameters — changes affect all live trades"; `indicators.ts`: "Signal calculation — Kalman filter"). The source prompt claimed neither file needed special authorization — that claim is incorrect and is disregarded; both require Amaury's explicit confirmation before implementation, separate from and in addition to normal spec approval, via a dedicated checkbox in `tasks.md`.
C-02: `calculateAllIndicators()` and its call site (`indicators.ts:349`) must not be modified — it continues calling `calculateKalman(bars)` with no explicit overrides.
C-03: `STOP_LOSS_PCT`, `RISK_PCT`, and their existing inline call sites in `claude-agent.ts`/`risk-manager.ts` must not be touched, consolidated, or migrated as part of this change — that inconsistency is explicitly out of scope.
C-04: `ZSCORE_ENTRY_THRESHOLD`, `MAX_SPREAD_BPS`, `MAX_QUOTE_AGE_SECONDS`, and `INSTRUMENT_BLACKLIST` in `config.ts` must remain unchanged.
C-05: `claude-agent.ts`, `db.ts`, `alpaca.ts`, `risk-manager.ts`, `learning.ts`, and `types.ts` must not be modified.
C-06: If an env var named `MEAN_REVERSION_EXIT_STD` is already set anywhere in the repo's checked-in env files with a conflicting value, implementation must stop and report rather than silently overriding it. (Verified during spec authoring: no such variable exists anywhere in the repo, including `.env.local` — this constraint is confirmed satisfiable, not merely aspirational.)

## Out of Scope

- Consolidating or "cleaning up" `STOP_LOSS_PCT`/`RISK_PCT`'s existing inline-read pattern elsewhere in the codebase.
- Changing `entryStd` or any other part of `calculateKalman()`'s computation.
- Adding validation beyond the existing `parseFloat(... ?? default)` convention.
