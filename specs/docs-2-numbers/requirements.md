# Requirements — CHANGE docs-2: fix wrong numbers in CLAUDE.md and SDD.md (documentation only)

## Functional Requirements

### A. MAX_SPREAD_BPS
FR-01: The system shall read the value of `MAX_SPREAD_BPS` in `src/lib/config.ts` before editing any document.
FR-02: The system shall replace the value `50` with that value in the Protected Zone code block of `CLAUDE.md`.
FR-03: The system shall replace the value `50bps` with that value in the "Execution gates" sentence of `CLAUDE.md`.
FR-04: The system shall replace the value `(50)` with that value in the execution-gates list of `SDD.md`.
FR-05: The system shall search both documents for every other occurrence of the old spread figure and correct each one.
FR-06: The system shall keep the comparison wording of each corrected line (`≤`) unless the code shows a different operator.

### B. MAX_POSITION_SIZE and the real position cap
FR-07: The system shall verify in `claude-agent.ts`, `position-sizing.ts` and `prompt-builder.ts` which code reads `MAX_POSITION_SIZE` before editing the table.
FR-08: The system shall change the `MAX_POSITION_SIZE` row of the Risk Parameters table in `CLAUDE.md` to state that it only feeds the prompt text.
FR-09: The row shall name the prompt lines it feeds.
FR-10: The row shall state that it does not limit the order quantity.
FR-11: The system shall document the real per-position cap `MAX_POSITION_EQUITY_FRACTION` in `CLAUDE.md`.
FR-12: The documented cap shall carry the value read from `position-sizing.ts`.
FR-13: The documentation shall state that this cap is a constant in code and not an environment variable.
FR-14: The system shall document the buying-power cap `BUYING_POWER_FRACTION` with its value read from `position-sizing.ts` next to the equity cap.
FR-15: The system shall leave the default value `0.10` of the `MAX_POSITION_SIZE` row unchanged (it is the prompt default in `prompt-builder.ts`).

### C. File Structure table and workflow sentence
FR-16: The system shall change the `claude-agent.ts` row of the File Structure table so that it no longer claims position sizing.
FR-17: The changed row shall say that the BUY quantity comes from `position-sizing.ts` and the prompt from `prompt-builder.ts`.
FR-18: The changed row shall keep the claims that remain true (agent loop, signal detection, exit rules).
FR-19: The system shall remove the duplicate mention of `security-audit.yml` from the sentence that lists the other workflows in `CLAUDE.md`.
FR-20: The system shall keep the sentence that describes where `npm audit` runs unchanged.

### D. Listing other disagreements (report only)
FR-21: The system shall search `CLAUDE.md` and `SDD.md` for numbers that disagree with `config.ts`, `position-sizing.ts` and the other source files that define the documented behaviour.
FR-22: The search shall cover thresholds, maximum positions, spread, quote age, caps, exit rules and version numbers.
FR-23: The system shall list every disagreement found in the report with the document line, the documented value and the source file and line that disagrees.
FR-24: The system shall not edit any disagreement found by FR-21 that is outside items A, B and C.
FR-25: The system shall also list disagreements found in files outside the two documents (for example `README.md`, `AGENTS.md`, skills) without editing them.

### E. Evidence, preservation and report
FR-26: The system shall give, for every changed line, the old text, the new text, and the source file and line that proves the new text.
FR-27: The system shall not change a documented number without having read its source.
FR-28: The system shall preserve the line endings of `CLAUDE.md` and `SDD.md`.
FR-29: The system shall change no line of either document other than those named in FR-02 to FR-20.
FR-30: The system shall write the report to `.tmp/docs-2-report.md`.
FR-31: The system shall show with `git diff --name-only` that only `CLAUDE.md` and `SDD.md` changed.
FR-32: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The change shall modify no source, test, golden, workflow or settings file.
NFR-02: The change shall print no secret value.
NFR-03: The documented numbers shall agree with the code at the commit the change is made on.
NFR-04: Claims in the report that could not be verified shall be labelled as such.

## Constraints

C-01: The change shall edit only `CLAUDE.md` and `SDD.md`.
C-02: The change shall not modify any Protected Zone file, including `config.ts`.
C-03: The change shall not change any threshold, flag or logic.
C-04: The change shall not commit, push, branch or open a PR.

## Out of Scope

- Fixing the disagreements of item D (to be proposed as a separate change).
- Editing `README.md`, `AGENTS.md`, `.claude/skills/*` or any file other than the two documents.
- Changing `MAX_POSITION_SIZE` behaviour, wiring it into sizing, or removing it.
- Changing the spread limit.
- Reordering or rewriting sections of the documents.
