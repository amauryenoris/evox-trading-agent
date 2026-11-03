# Requirements — Security CHANGE 2: move actions to Node 24 versions and pin by SHA

## Functional Requirements

### A. Breaking-change gate
FR-01: The system shall read the release notes of `actions/checkout` between v4 and v7.0.1 before editing any workflow.
FR-02: The system shall read the release notes of `actions/setup-node` between v4 and v7.1.0 before editing any workflow.
FR-03: The system shall read the release notes of `actions/github-script` between v7 and v9.0.0 before editing any workflow.
FR-04: The system shall list, per action, each breaking change that affects an input, default or behaviour we use.
FR-05: The system shall check every inline `github-script` script (4 steps: `pr-review.yml` x2, `security-audit.yml` x2) against the v8 and v9 changes.
FR-06: If a script needs an edit, the system shall make the smallest edit and list it in the report.
FR-07: If the system is unsure whether a change breaks a workflow, it shall stop and report instead of editing.

### B. Version bump and SHA pinning
FR-08: The system shall set every `actions/checkout` reference to v7.0.1.
FR-09: The system shall set every `actions/setup-node` reference to v7.1.0.
FR-10: The system shall set every `actions/github-script` reference to v9.0.0.
FR-11: The system shall pin each of those references by the full 40-character commit SHA.
FR-12: The system shall add the version tag as a trailing comment on each pinned `uses:` line.
FR-13: The system shall resolve each SHA from the official `actions/*` repository.
FR-14: The system shall resolve an annotated tag to the commit it points to, not to the tag object.
FR-15: If a SHA cannot be resolved or verified, the system shall leave that action unchanged and report it.
FR-16: The system shall use the same SHA for the same action and version in every workflow.

### C. keepalive-workflow (report only)
FR-17: The system shall not change, replace or remove `gautamkrishnar/keepalive-workflow`.
FR-18: The system shall report where it is used and with which permissions.
FR-19: The system shall report the last 3 runs of the workflow that uses it, or state why they could not be retrieved.

### D. security-audit.yml input handling
FR-20: The system shall pass `inputs.audit_level` to the audit step through an environment variable named `AUDIT_LEVEL`.
FR-21: The system shall reference the value in the shell as `"$AUDIT_LEVEL"`.
FR-22: The system shall not interpolate `${{ inputs.audit_level }}` inside a `run:` script.
FR-23: The system shall validate `AUDIT_LEVEL` against `low`, `moderate`, `high`, `critical` before running `npm audit`.
FR-24: If `AUDIT_LEVEL` is not one of those values, the system shall fail the step with an error message that names the allowed values.
FR-25: The system shall use `critical` when the workflow is triggered by schedule (no input).
FR-26: The system shall keep the audit output capture and the issue open/close/fail logic identical.

### E. Unchanged behaviour
FR-27: The system shall keep every `permissions:` block unchanged.
FR-28: The system shall keep every trigger and cron schedule unchanged.
FR-29: The system shall keep every concurrency group unchanged.
FR-30: The system shall keep every secret reference and `env:` mapping unchanged.
FR-31: The system shall keep `node-version`, `cache` and all other action inputs unchanged unless the breaking-change review proves a rename.

### F. Validation and report
FR-32: The system shall validate the syntax of every changed workflow file with `actionlint`, or with a YAML parse if `actionlint` is unavailable.
FR-33: The system shall confirm with `git diff --name-only` that only files under `.github/workflows/` changed.
FR-34: The system shall write the report to `.tmp/security-change2-report.md`.
FR-35: The report shall contain breaking-change findings per action, a table (workflow, action, old ref, new ref + SHA), unchanged items with reasons, keepalive findings and validation results.
FR-36: The system shall leave all changes uncommitted in the working tree.

## Non-Functional Requirements

NFR-01: The change shall print no secret value.
NFR-02: Every SHA in the report shall be traceable to a command result or API response.
NFR-03: Claims that could not be verified shall be labelled as unverified in the report.
NFR-04: The change shall trigger no workflow run (no push, no `workflow_dispatch`).

## Constraints

C-01: The system shall edit only files under `.github/workflows/` (the report in `.tmp/` is the permitted deliverable).
C-02: The change shall not touch any Protected Zone file.
C-03: The change shall not touch source code, `package.json` or `package-lock.json`.
C-04: The change shall not change cron schedules, triggers, secrets usage, permissions or job logic beyond the items above.
C-05: The change shall not guess a SHA or a version.
C-06: The change shall not commit, push, branch or open a PR.

## Out of Scope

- Replacing, pinning or removing `gautamkrishnar/keepalive-workflow` (owner decision).
- Dependabot configuration for `github-actions`.
- Changing the `node-version: "24"` inputs used to run our scripts.
- Changing the Claude review script in `pr-review.yml` or its diff truncation.
- Running any workflow, in CI or locally.
