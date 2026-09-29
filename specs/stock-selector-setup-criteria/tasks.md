# Tasks — Wire ACTIVE_SETUPS into stock-selector.ts's Prompt

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed — **None required.** The only touched file (`stock-selector.ts`) is outside the Protected Zone and outside the broader "confirm before touching" list.
- [x] Database migrations drafted — N/A, none required

## Implementation Checklist

### Phase 1 — Import and generate setup-criteria text

- [x] T-01: In `src/lib/stock-selector.ts`, add `import { ACTIVE_SETUPS } from './setups'` alongside the existing imports.
- [x] T-02: Add a module-level constant (e.g. `ACTIVE_SETUP_CRITERIA_TEXT`) computed via `ACTIVE_SETUPS.filter((s) => s.active).map((s) => \`    * ${s.name}: ${s.criteria}\`).join('\n')`, declared before `SELECTION_SYSTEM_PROMPT`.

### Phase 2 — Extend the system prompt

- [x] T-03: In `SELECTION_SYSTEM_PROMPT`'s `CRITERIA` block (`stock-selector.ts:50-58`), add one new bullet after the existing "Avoid selecting highly correlated stocks" line: additive guidance introducing the setup list, followed by `${ACTIVE_SETUP_CRITERIA_TEXT}` — not phrased as `MANDATORY`, not a second hard-requirement clause.
- [x] T-04: Leave the `RESPOND ONLY with valid JSON` block (`stock-selector.ts:60-74`) byte-for-byte unchanged.

### Phase 3 — Verification

- [x] T-05: Run `npx tsc --noEmit` — must be clean.
- [x] T-06: Run `git diff --stat` — confirm it touches exactly `src/lib/stock-selector.ts`. No other file.
- [x] T-07: Print the final `SELECTION_SYSTEM_PROMPT` value in full (e.g. via a quick one-off script or by reading the file) in the implementation report, so the complete system prompt — old criteria plus the new setup-criteria bullet — can be read end-to-end.
- [x] T-08: Confirm in the report that `ACTIVE_SETUP_CRITERIA_TEXT` is produced via `.filter()`/`.map()` over the imported `ACTIVE_SETUPS`, with no setup name or criteria string retyped by hand anywhere in `stock-selector.ts`.
- [x] T-09: Run `npm test` — confirm no regressions, in particular `src/lib/__tests__/stock-selector.test.ts` (48 files / 448 tests baseline as of the last shipped change on this branch).

## Post-Implementation

- [x] Run `/review stock-selector-setup-criteria` to verify implementation matches spec
- [x] Confirm Protected Zone files (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) unchanged

## Estimated Complexity

**Low** — one new import, one new derived constant, one new prompt bullet in an existing template literal. No logic, schema, or gate changes; no new file.
