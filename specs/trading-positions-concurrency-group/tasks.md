# Tasks — Serialize the trading cycle and the exit sweeps with one shared concurrency group

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Open Questions 1-2 in `design.md` answered
- [x] Protected Zone changes confirmed — N/A, none required
- [x] Database migrations drafted — N/A, none needed

## Implementation Checklist

### Phase 0 — Read-only pre-checks
- [x] T-01: Re-read the `concurrency:` block and the `workflow_dispatch:` line of both files; confirm the working tree is clean.
- [x] T-02: Re-confirm in `claude-agent.ts` that the cycle calls `enforceExitRules` (step 4e) and in `run-cycle.ts` that the sweep does; quote the lines in the report.

### Phase 1 — Edit (YAML only)
- [x] T-03: `.github/workflows/agent-cron.yml`: set `group: trading-positions`, keep `cancel-in-progress: false`, add the comment (three lines or fewer). Touch nothing else.
- [x] T-04: `.github/workflows/agent-exits.yml`: same change.

### Phase 2 — Verification
- [x] T-05: Parse both files with `npx js-yaml` and print the parsed `concurrency` object of each; they must be identical.
- [x] T-06: `git diff --stat` shows exactly the two workflow files; show the full diff and confirm no line outside the `concurrency:` region changed (FR-10, FR-11).
- [x] T-07: Confirm `workflow_dispatch:` is still present in both files and no other workflow contains a `concurrency:` change.
- [x] T-08: Write the plain-language report required by FR-17 to FR-23: one running and one pending per group, a newer pending replaces an older one, a queued sweep or cycle can be dropped, the cycle covers a dropped sweep, what could not be tested, what to check on the first trading day.

## Post-Implementation

- [x] Run /review trading-positions-concurrency-group to verify implementation matches spec
- [x] Confirm Protected Zone files unchanged
- [ ] After the first trading day: review the Actions tab as listed in `design.md` and record any "Canceled" run

## Estimated Complexity

Low — two small edits in two YAML files with no code, schema or Protected Zone impact; the care is in the queuing
behavior, which can only be observed once the workflows run.
