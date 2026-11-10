# Tasks — CHANGE split-5: extract the protective-order / profit-floor helpers and the two stop-retry helpers (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: two block deletions, import changes, one re-export; owner authorization in the request)
- [x] Database migrations drafted (N/A: none)
- [x] Q-1 to Q-4 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: `git status --short`; CR count and line count of `claude-agent.ts`, `CLAUDE.md`, `vitest.config.ts`, `pr-review.yml`; SHA-256 of all 61 goldens and of `specs/docs-5-selector-criteria/tasks.md`
- [x] T-02: `npx tsc --noEmit`; characterization file x3 (63/63); full `npx vitest run` (1207 in 78 files); `npx eslint src/lib/claude-agent.ts` (three known warnings)
- [x] T-03: Re-read `claude-agent.ts:441-618` and `:729-782`; save the exact text for the byte comparison; confirm `alpaca`, `db`, `protective-stop` and `types` do not import the new module

### Phase 2 — Observe current behaviour
- [x] T-04: Throwaway script on the current text: `submitStopLimitWithRetry` first-attempt success; one failure then success (3000 ms, fake timers); double failure (`failureReason`, warn/error texts); `replaceProtectiveOrder` with `ctx.quantity` 0; record values
- [x] T-05: Delete the throwaway script; `git status` shows no stray file

### Phase 3 — Tests first (RED)
- [x] T-06: Create `src/lib/__tests__/protective-orders.test.ts` (LF): `vi.hoisted` mocks of `../alpaca` and `../db`, fake timers restored in `afterEach`; expected values from T-04
- [x] T-07: Add the cancel-then-submit order case for `replaceProtectiveOrder`
- [x] T-08: Run it; confirm it fails because `../protective-orders` does not exist

### Phase 4 — Move (GREEN)
- [x] T-09: Create `src/lib/protective-orders.ts` (LF): banner, types, helpers, retry helpers with header comment, `export` added, imports per FR-12
- [x] T-10: Run the new test: all pass
- [x] T-11: Edit `claude-agent.ts` with an EOL-aware script: delete both blocks, add the import and `export { submitStopWithRetry }`, remove only the unused imports; show the final import lines
- [x] T-12: CR count equals line count; run `tsc` and note any other newly unused name

### Phase 5 — Registration
- [x] T-13: `pr-review.yml`: add `"src/lib/protective-orders.ts"`; confirm YAML parses
- [x] T-14: `vitest.config.ts`: add the `coverage.include` entry
- [x] T-15: `CLAUDE.md`: File Structure row and "Confirm with Amaury" row (CRLF kept)
- [x] T-16: CR counts before/after for the three files

### Phase 6 — Verification
- [x] T-17: `npx tsc --noEmit`
- [x] T-18: Characterization x3 identical; if any golden changes, STOP and report the diff
- [x] T-19: Full `npx vitest run`: 1207 + new tests; `ioc-fill-verification.test.ts` and `mr-profit-floor-exit-rules.test.ts` pass unchanged
- [x] T-20: `npx eslint` on `protective-orders.ts`, `claude-agent.ts` and the new test; nothing new
- [x] T-21: SHA-256 of the 61 goldens identical; `git status --short -- src/lib/__tests__/__golden__` empty
- [x] T-22: `git diff --name-only` only allowed files; `docs-5` `tasks.md` SHA unchanged
- [x] T-23: Diff review: `claude-agent.ts` diff is only the two deletions, import changes and re-export; byte-compare moved text vs HEAD (apart from `export`)
- [x] T-24: CR counts per touched file

### Phase 7 — Report
- [x] T-25: Write `specs/extract-protective-orders/review.md` in the usual format
- [x] T-26: Final report: moved symbols old/new `file:line`, test counts, golden status, line endings, docs citing moved lines (list, do not fix), observations (do not fix), anything not verified; do not commit or push

## Post-Implementation

- [x] Run /review extract-protective-orders to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged apart from the authorized edits

## Estimated Complexity

Medium — about 230 lines move and the logic places, cancels and replaces live stop orders; `claude-agent.ts` is a CRLF Protected Zone file and eight goldens pin the texts and call order. Mechanically it is a pure move with a clear safety net.
