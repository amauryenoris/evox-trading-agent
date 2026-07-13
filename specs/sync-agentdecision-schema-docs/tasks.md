# Tasks — Sync Documentation with Actual AgentDecision Response Schema

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (if applicable) — N/A, neither file is Protected-Zone-listed
- [x] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Verify (re-confirm no drift immediately before editing)
- [x] T-01: Re-read `CLAUDE.md:44-53`, `.claude/skills/claude-api-patterns.md:26-39`, and `claude-agent.ts:87-95` verbatim immediately before editing to confirm no drift since this spec was written. Confirmed — byte-identical.

### Phase 2 — CLAUDE.md
- [x] T-02: In `CLAUDE.md`'s output schema JSON block, add `"self_flagged_disqualifying_risk": false` as a new line after `"what_would_trigger": "..."`, matching the existing JSON formatting (comma placement, indentation).

### Phase 3 — claude-api-patterns.md
- [x] T-03: In `.claude/skills/claude-api-patterns.md`'s `AgentDecision` interface block, add `self_flagged_disqualifying_risk?: boolean` as a new line after `what_would_trigger: string`, with a short trailing `//` comment matching the file's existing comment style and column alignment (e.g. `// optional, observability-only — see claude-agent.ts SYSTEM_PROMPT`).

### Phase 4 — Verification
- [x] T-04: `git diff CLAUDE.md` shows only the one added line plus the required comma addition on the preceding line — no other content changed. Confirmed.
- [x] T-05: `git diff .claude/skills/claude-api-patterns.md` shows only the one added line — no other content changed. Confirmed.
- [x] T-06: Visually confirmed both new lines describe the field consistently with its actual behavior (optional boolean, observability/logging-only) and do not restate the 5-bullet TRUE/FALSE scoping criteria — `CLAUDE.md` shows the JSON default `false`, `claude-api-patterns.md` shows the TS type plus a pointer comment to the SYSTEM_PROMPT for full criteria.

## Post-Implementation

- [x] Run `/review sync-agentdecision-schema-docs` to verify implementation matches spec — see `review.md`, APPROVED (0 findings)
- [x] Confirm Protected Zone files unchanged — N/A, no Protected Zone file in scope. `git status --short` confirms zero source files touched — only `CLAUDE.md`, `.claude/skills/claude-api-patterns.md`, and the new spec directory.
- [x] Note: no `tsc`/`build`/test run needed — markdown-only change, per spec's VERIFY section.

## Estimated Complexity

**Low** — two single-line additive edits to markdown documentation, no code, no Protected Zone, no test surface. The only real risk is scope creep (touching unrelated doc content), guarded by the diff-only verification in Phase 4.
