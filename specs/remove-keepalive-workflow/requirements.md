# Requirements — Remove the Keepalive workflow

## Functional Requirements

### A. Reference search
FR-01: The system shall search the whole repository for the word "keepalive" (case-insensitive) before deleting anything.
FR-02: The search shall cover workflows, `README.md`, `CLAUDE.md`, `SDD.md`, `AGENTS.md`, `.claude/`, `scripts/`, `src/` and `specs/`, and shall exclude `node_modules`, `.next`, `.git` and `.tmp`.
FR-03: The system shall list every match with file and line in the report.
FR-04: The system shall classify each match as the workflow itself, a live documentation reference, or a historical spec record.

### B. Dependency check
FR-05: The system shall confirm that no workflow uses `needs:` or `workflow_run` to depend on the Keepalive workflow.
FR-06: If any workflow depends on Keepalive, the system shall stop and report before deleting the file.

### C. Deletion
FR-07: The system shall delete `.github/workflows/keepalive.yml`.
FR-08: The system shall not add a replacement keepalive step, workflow or action.

### D. Documentation references
FR-09: The system shall remove the `keepalive.yml` entry (its three lines) from the GitHub Actions schedule block in `CLAUDE.md`.
FR-10: The system shall remove the Keepalive row from the workflows table in `SDD.md` section 15.
FR-11: The system shall add one note to `SDD.md` section 15 reading: "Scheduled workflows can be disabled by GitHub after 60 days without repo activity; check Actions if the repo goes quiet."
FR-12: The system shall not create a new documentation file for that note.
FR-13: The system shall leave historical records under `specs/` unchanged.
FR-14: The system shall leave statements in the documentation that are unrelated to Keepalive unchanged.

### E. No other behaviour change
FR-15: The system shall leave every remaining workflow file byte-identical.
FR-16: The system shall leave every cron schedule, trigger, permission and secret reference of the remaining workflows unchanged.
FR-17: The system shall leave all source files, `package.json` and `package-lock.json` unchanged.

### F. Validation and report
FR-18: The system shall parse every remaining workflow file as YAML and report the result.
FR-19: The system shall confirm with `git status` that the only changes are the deleted workflow and the edited documentation files (plus the spec folder).
FR-20: The system shall confirm that a search for "keepalive" in live files (workflows, `CLAUDE.md`, `SDD.md`, `README.md`) returns no match after the change.
FR-21: The system shall write the report to `.tmp/remove-keepalive-report.md`.
FR-22: The report shall state files deleted, files edited, references found, validation results, and where the 60-day note was added.
FR-23: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The change shall print no secret value.
NFR-02: The change shall trigger no workflow run (no push, no `workflow_dispatch`).
NFR-03: Claims in the report that could not be verified shall be labelled as unverified.

## Constraints

C-01: The change shall not touch any Protected Zone file.
C-02: The change shall edit only the deleted workflow and documentation files that reference it.
C-03: The change shall not change any other workflow, schedule, permission, secret or source file.
C-04: The change shall not commit, push, branch or open a PR.

## Out of Scope

- Replacing Keepalive with another mechanism (the owner decided to remove it).
- Correcting other stale statements in `CLAUDE.md` and `SDD.md` (for example "All workflows run `npm audit`", no longer true after an earlier change).
- Editing past specs and reviews that mention `keepalive.yml`.
- Deleting the workflow's run history on GitHub or the GitHub-side setting for scheduled workflows.
- Re-reading or changing `security-audit.yml` or any other workflow.
