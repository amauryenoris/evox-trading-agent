# Tasks — CHANGE 1: extract the prompt-builder from claude-agent.ts (pure move, no behaviour change)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (`claude-agent.ts`: removal of the moved blocks, one import, one call argument, unused-name removals; owner authorization given in the request)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-10 answered or defaults accepted (O-1: CHANGE 0b committed first, recommended)

## Implementation Checklist

### Phase 1 — Baseline
- [x] T-01: Record the baseline: `git status`, golden file hashes (`md5sum` of `__golden__/claude-agent/*`), characterization suite result, full `npx vitest run` count, `wc -l src/lib/claude-agent.ts`, and the line endings of `claude-agent.ts`.
- [x] T-02: Re-confirm the moved line ranges (91-132 area, 806-857, 859-981) and that no other file imports `SYSTEM_PROMPT`, `buildEnrichedPrompt` or the labels from `claude-agent.ts` (grep).
- [x] T-03: Re-confirm the impure inputs of the moved code (env occurrences, no `Date.now` / `Math.random`, no network or database). STOP and report if anything new appears.

### Phase 2 — Tests first (RED)
- [x] T-04: Create `fixtures/legacy-prompt.ts`: verbatim copy of the original blocks from the current `claude-agent.ts` (reads `process.env` as the original did).
- [x] T-05: Create `prompt-builder.test.ts` with the exact-string tests (labels, prompt cases, optional sections, env argument, `SYSTEM_PROMPT`) and the differential test; run it and confirm it fails because the module does not exist.

### Phase 3 — Move (GREEN)
- [x] T-06: Create `src/lib/prompt-builder.ts` with the moved code, `export` on the moved names, the `PromptEnv` type and the five `process.env.X` -> `env.X` renames; nothing else changed.
- [x] T-07: Run the new unit tests (all pass, including the differential test).
- [x] T-08: Edit `claude-agent.ts`: delete the three blocks and their headers, add the import, add `process.env` to the call, remove the names that became unused from existing imports. Preserve the file's line endings.
- [x] T-09: Run the characterization suite: **zero golden changes** (STOP and report any diff; do not edit code to "fix" it and do not touch goldens).

### Phase 4 — CI and config
- [x] T-10: `.github/workflows/pr-review.yml`: add `"src/lib/prompt-builder.ts"` to the `PROTECTED_ZONE` array; no other line changes.
- [x] T-11: `vitest.config.ts`: add `'src/lib/prompt-builder.ts'` to `coverage.include`.

### Phase 5 — Verification
- [x] T-12: `npx tsc --noEmit`.
- [x] T-13: Full `npx vitest run` (existing tests unchanged and passing, new tests added).
- [x] T-14: `npm run build`.
- [x] T-15: ESLint on every touched file (no new warning).
- [x] T-16: Characterization suite three times: identical results; golden hashes equal to T-01.
- [x] T-17: Coverage of `prompt-builder.ts` from its own tests (at least 80%).
- [x] T-18: `git diff` review: `claude-agent.ts` shows only removed blocks, one added import, the import-name removals, one added call argument; `git diff --name-only` lists no Protected Zone file other than `claude-agent.ts`, no golden and no harness file. Record line counts before and after.

### Phase 6 — Report
- [x] T-19: Write `.tmp/prompt-builder-extraction-report.md`: what moved (function, original lines, new location), `claude-agent.ts` line count before and after, golden status (0 changes), new tests, verification results, the `pr-review.yml` change, and the env argument (the only value that needed an argument instead of a closure).

## Post-Implementation

- [ ] Run /review extract-prompt-builder to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged except the authorized `claude-agent.ts` edit
- [ ] Nothing committed or pushed; commit is a separate request from Amaury; merge outside the cron windows

## Estimated Complexity

Low to Medium. About 220 lines move with five mechanical env renames, and the characterization goldens plus a differential test prove identity. The risk is concentrated in two places: the Protected file edit and the unnoticed impure input; the STOP rules cover both.
