# Tasks — CHANGE docs-2: fix wrong numbers in CLAUDE.md and SDD.md (documentation only)

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: none; `config.ts` is only read)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Baseline and proof
- [x] T-01: Record the baseline: `git status`, `HEAD`, copies of `CLAUDE.md` and `SDD.md` in `.tmp/`, and their line endings.
- [x] T-02: Re-read the sources and record file and line for each fact: `config.ts` (`MAX_SPREAD_BPS`, `MAX_QUOTE_AGE_SECONDS`), `position-sizing.ts` (`MAX_POSITION_EQUITY_FRACTION`, `BUYING_POWER_FRACTION`), and the reads of `MAX_POSITION_SIZE` (grep over `src/` and `scripts/`).
- [x] T-03: Search both documents for every spread figure (`50 ?bps`, `MAX_SPREAD_BPS` lines, `(50)`, `= 50`) and confirm the occurrences are exactly E1 to E3.

### Phase 2 — Edits (CRLF preserved)
- [x] T-04: E1, E2 in `CLAUDE.md` and E3 in `SDD.md`: replace the spread value with the one read from `config.ts`.
- [x] T-05: E4 and E5 in `CLAUDE.md`: the `MAX_POSITION_SIZE` row and the one sentence naming the real caps with the values read from `position-sizing.ts`.
- [x] T-06: E6 in `CLAUDE.md`: the `claude-agent.ts` row.
- [x] T-07: E7 in `CLAUDE.md`: remove `security-audit.yml` from the "Other workflows not listed above" list.
- [x] T-08: `git diff -U0`: only the intended hunks; line endings unchanged; no other line touched.

### Phase 3 — Sweep (item D, report only)
- [x] T-09: Re-verify each disagreement in the design table against the source and add any new one found by a sweep of both documents (numbers, thresholds, caps, versions); do not edit them.
- [x] T-10: Sweep `README.md`, `AGENTS.md` and `.claude/skills/*` for the same figures (list only).

### Phase 4 — Verification
- [x] T-11: `git diff --name-only` shows only `CLAUDE.md` and `SDD.md`; no source, test, golden, workflow or settings file changed; `config.ts` untouched.
- [x] T-12: Re-grep: no `50` spread figure remains in either document; no `position sizing` claim remains in the `claude-agent.ts` row; `security-audit.yml` appears once in the workflow sentences.
- [x] T-13: Optional sanity run: `npx tsc --noEmit` and the characterization suite are unaffected (no code changed); record that they were not needed.

### Phase 5 — Report
- [x] T-14: Write `.tmp/docs-2-report.md`: every changed line (old -> new, source file and line), and the item D list (document line, documented value, source file and line, and whether it is inside or outside the two documents).

## Post-Implementation

- [ ] Run /review docs-2-numbers to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Nothing committed or pushed; commit is a separate request from Amaury

## Estimated Complexity

Low. Seven small text edits in two documents, each backed by a line in the source, plus a read-only sweep. The only judgement call is how to document a code constant next to an env table (O-2).
