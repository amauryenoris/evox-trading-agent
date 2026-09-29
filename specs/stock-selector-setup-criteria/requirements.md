# Requirements — Wire ACTIVE_SETUPS into stock-selector.ts's Prompt

## Background

`src/lib/setups.ts` (created 2026-09-25, CHANGE 1) exports `ACTIVE_SETUPS` — 5 objects (`{ name, criteria, active }`) — and a derived `SetupName` type. Verified against the live codebase (2026-09-28), line numbers unchanged since CHANGE 1:

- `selectStocksForAnalysis()`'s system prompt is `SELECTION_SYSTEM_PROMPT`, a module-level template literal at `stock-selector.ts:46-74`. Its `CRITERIA` block (lines 50-58) lists: high volume, momentum, a `MANDATORY` sector-coverage rule, past-selection performance, and correlation avoidance. No setup name, z-score, ADX, or MACD is mentioned anywhere in it.
- The user prompt is built per-call inside `selectStocksForAnalysis()` at `stock-selector.ts:162-178`. It carries per-cycle data: portfolio state, optional market briefing, Pool A (screener) and Pool B (sector watchlist) candidate lines, and past-selection learning lines.
- Neither prompt references any of the 5 live setups' entry criteria today.
- The response schema Claude must return (`{ "selected": [...], "reasoning": "...", "scores": [...] }`, `stock-selector.ts:60-74`) has no field for which setup a pick maps to.

Setup detection itself happens independently and per-symbol, later, in `claude-agent.ts`'s main loop (`claude-agent.ts:1864` `setup_detected = ...`) — nothing downstream of `selectStocksForAnalysis()` depends on the Buy Scanner having pre-identified a setup. This change is additive prompt guidance only: it gives Claude's stock-picking pass one more signal to weigh (does this candidate plausibly resemble one of the active setups?), without creating a new gate, a new schema field, or any coupling between the two Claude calls.

No test in `src/lib/__tests__/stock-selector.test.ts` asserts on `SELECTION_SYSTEM_PROMPT`'s exact content — the closest is `buildPromptSkeleton()`, which replicates only the user prompt's `briefingNarrative` section, not the `CRITERIA` block. Adding to `SELECTION_SYSTEM_PROMPT` does not conflict with any existing test's expectations.

---

## Functional Requirements

FR-01: The system shall import `ACTIVE_SETUPS` from `src/lib/setups.ts` into `stock-selector.ts`.

FR-02: The system shall generate the setup-criteria text shown to Claude by iterating `ACTIVE_SETUPS` at runtime (e.g. `.filter()`/`.map()`), not by a separately hand-written string.

FR-03: The system shall include only entries where `active` is `true` in the generated setup-criteria text.

FR-04: Where an entry is included in the setup-criteria text, the system shall render both its `name` and its `criteria` field.

FR-05: The system shall insert the generated setup-criteria text into `SELECTION_SYSTEM_PROMPT`'s existing `CRITERIA` list, as an additional bullet alongside the existing volume/momentum/sector/performance/correlation criteria.

FR-06: The system shall phrase the setup-criteria bullet as additive guidance (e.g. "also weigh whether a candidate plausibly fits one of these setups"), not as a `MANDATORY` or otherwise hard-requirement clause.

FR-07: The system shall leave the response JSON schema (`selected`, `reasoning`, `scores`) unchanged — Claude is not asked to report which setup a candidate maps to.

---

## Non-Functional Requirements

NFR-01: `npx tsc --noEmit` shall report zero errors after the change.

NFR-02: The existing test suite (`npm test`) shall pass with no regressions.

NFR-03: With all 5 `ACTIVE_SETUPS` entries at `active: true` (current state), the generated setup-criteria text shall list all 5 setups — i.e. this change's behavior is indistinguishable from "always include all 5" until a future toggle sets any entry's `active` to `false`.

---

## Constraints

C-01: This feature must not modify the Protected Zone (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`). Neither this feature's files nor its requirements touch them.

C-02: `src/lib/setups.ts`, `src/lib/types.ts`, and `src/lib/gate-importance.ts` shall not be modified — this change only touches `stock-selector.ts`.

C-03: No on/off filtering or gating logic beyond the `active === true` check (FR-03) shall be added.

C-04: No second `MANDATORY` clause shall be added to `SELECTION_SYSTEM_PROMPT` — the existing sector-coverage rule remains the prompt's only hard requirement.

C-05: `DEFAULT_SECTOR_WATCHLIST`, `MAX_POOL_A_CANDIDATES`, `applyPoolQualityFilters()`, and all other existing selection logic shall remain unchanged.

C-06: `risk-manager.ts` and `indicators.ts` shall not be touched.

---

## Out of Scope

- Any change to `claude-agent.ts`'s setup-detection logic
- Any change to `setups.ts`, `types.ts`, or `gate-importance.ts`
- Adding a `scores[].setup` (or similar) field to the response schema
- A separate pre-scoring pass or hard filter based on setup fit
- On/off setup toggling itself (future `/settings` feature — this change only makes the existing `active` field's filter already-correct for when that feature ships)
