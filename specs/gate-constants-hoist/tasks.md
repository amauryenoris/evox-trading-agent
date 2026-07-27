# Tasks — Hoist 3 Named Gate Constants + gate-importance.ts

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [ x] Protected Zone change (claude-agent.ts hoist) reconfirmed at
      implementation time — re-verify lines 1354 / 1380 / 1398 have not
      drifted since this spec was written (2026-07-24)
- [ x] Confirmed `src/lib/gate-importance.ts` does not already exist
      (verified clean at spec time)

## Implementation Checklist

### Phase 1 — Hoist constants (claude-agent.ts)
- [x] T-01: Locate the current declarations of `lowAdxMacdBoost` (~line 1354),
      `mrRangingAdxFloor` (~line 1380), `trendPullbackMacdFloor` (~line 1398)
      inside `runAgentCycle()`. If any line has drifted, locate by name match
      instead and report the actual lines found — do not guess.
      Re-verified live before editing: all 3 lines unchanged (1354/1380/1398).
- [x] T-02: Add, at module scope near the file's existing top-level
      imports/exports:
      `export const mrRangingAdxFloor = 18`
      `export const trendPullbackMacdFloor = -2.0`
      `export const lowAdxMacdBoost = 0.25`
      Placed immediately after the `from './types'` import block (line 57),
      before the `SYSTEM_PROMPT` section header — the natural end of the
      file's import/export preamble.
- [x] T-03: Remove the 3 original function-local declarations from inside
      `runAgentCycle()`. Every existing reference to these 3 identifiers
      inside the function must continue to resolve via the module-level
      export — no in-file import needed.
- [x] T-04: Grep the file for all 3 identifiers to confirm no other
      function-local shadowing declaration exists and every reference still
      resolves correctly.

### Phase 2 — New observability table (gate-importance.ts)
- [x] T-05: Create `src/lib/gate-importance.ts` importing the 3 newly-exported
      constants from `./claude-agent`.
- [x] T-06: Define and export `type GateImportance = 'hard-gated' |
      'soft-referenced' | 'not-gated'`.
- [x] T-07: Define and export `DIMENSION_IMPORTANCE` with the exact per-signal
      classification given in the driving prompt (MEAN_REVERSION,
      TREND_PULLBACK, TREND_ZLE05, EMA_RECLAIM rows, byte-identical to spec).
- [x] T-08: Add the sourcing comment block documenting which cells are backed
      by an imported constant vs. manually verified against a specific
      `claude-agent.ts` line/date, exactly as worded in the driving prompt.
      NOTE: the prompt's exact wording was preserved verbatim (line refs
      1350/1359-1360/1455, "as of 2026-07-24"), per the driving prompt's
      "exactly this content" instruction. Those line numbers describe the
      file's state *before* the Phase 1 hoist. After hoisting (+5 lines from
      the new module-scope exports, -4 from removing the 3 function-local
      declarations), the equivalent lines are now 1355, 1362-1363, and 1456
      respectively (re-verified live). Flagging per spec's own open
      question — the 4 manually-verified comment references will drift
      again on any future edit above them; not fixed here since the prompt
      required this exact text and fixing it wasn't part of this task's
      scope.

### Phase 3 — Verification
- [x] T-09: Grep the full repo for `mrRangingAdxFloor`, `trendPullbackMacdFloor`,
      `lowAdxMacdBoost` — confirm every reference resolves to the same 3
      values as before the move.
      Result: only 3 declaration sites now (claude-agent.ts:60-62, all
      module-scope exports). All 5 in-function references + the 3 test
      files' independently-declared local copies (mr-gate-rejection-message,
      mr-ranging-adx-gate, trend-zle05-setup — pre-existing decoupled test
      pattern per CLAUDE.md) are unaffected and still resolve to 18/-2.0/0.25.
- [x] T-10: Confirm no circular import exists between `gate-importance.ts`
      and `claude-agent.ts`. Result: no circular import — grep for
      `from './gate-importance'` across src/ returns zero matches, so
      claude-agent.ts does not import gate-importance.ts.
- [x] T-11: Run `npx tsc --noEmit` — confirm zero errors. Result: clean,
      zero output/errors.
- [x] T-12: Run `npm run build` — confirm it passes. Result: passed,
      "Compiled successfully", all routes generated.
- [x] T-13: Run the existing test suite — confirm 100% pass, zero new
      failures, zero skipped tests. Result: 27 test files, 286 tests,
      all passed, zero skipped. No test file was modified.

## Post-Implementation

- [x] Confirm `claude-agent.ts`'s diff is limited to the 3 relocated
      declarations plus `export` keywords — no other lines changed
      (inspected via the edits applied: 1 insertion block after the import
      section, 3 single-line removals inside `runAgentCycle()`; no logic,
      condition, or ordering changed)
- [x] Confirm `src/lib/gate-importance.ts` is the only new file
- [x] Run `/review gate-constants-hoist` to verify implementation matches spec
      Result: APPROVED — see specs/gate-constants-hoist/review.md

## Estimated Complexity

**Low** — mechanical relocation of 3 existing single-line `const`
declarations plus one small new static-data file with no runtime wiring;
zero logic changes, zero new runtime dependencies, zero test impact.
