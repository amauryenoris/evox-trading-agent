# Design — Security CHANGE 2: move actions to Node 24 versions and pin by SHA

## Architecture Decision

The change lives only in `.github/workflows/` (9 files). Three official actions move from floating major tags (`@v4`, `@v4`, `@v7`, which run on Node 20) to their newest releases (checkout v7.0.1, setup-node v7.1.0, github-script v9.0.0, all declared `node24` in `action.yml`), each pinned by full commit SHA with a version comment so a moved or hijacked tag cannot change what runs. A separate small edit hardens `security-audit.yml`: the `workflow_dispatch` input `audit_level` stops being interpolated into the shell and is passed through `env:` and validated. Nothing else in the workflows changes. `gautamkrishnar/keepalive-workflow@v2` is reported on, not touched.

Current usage (from the step 0 audit, re-verified at implementation time):

| Action | Current | Files |
|---|---|---|
| actions/checkout | `@v4` | all 9 workflows |
| actions/setup-node | `@v4` | 8 (all except keepalive) |
| actions/github-script | `@v7` | `pr-review.yml` (2 steps), `security-audit.yml` (2 steps) |
| gautamkrishnar/keepalive-workflow | `@v2` | `keepalive.yml` (unchanged) |

## Data Flow

1. Read release notes for each action across the version gap; record breaking changes affecting our inputs (`fetch-depth`, `node-version`, `cache`, `script`) and the inline scripts (`github.rest.issues.*`, `github.rest.pulls.*`, `context`, `require('fs')`).
2. Gate: if any script or input needs more than a minimal edit, or the effect is unclear, stop and report.
3. Resolve each target tag to its commit SHA from the official repo; for annotated tags, take the peeled commit. Cross-check with a second source (API and `git ls-remote`) and confirm the tag's `action.yml` declares `node24`.
4. Replace every `uses:` line with `owner/action@<sha> # vX.Y.Z`.
5. Edit `security-audit.yml`: add `env: AUDIT_LEVEL: ${{ inputs.audit_level || 'critical' }}` to the audit step, add an allow-list check, run `npm audit --audit-level="$AUDIT_LEVEL"`.
6. Collect keepalive findings (usage, permissions, last 3 runs).
7. Validate YAML (`actionlint` if present, else a YAML parse), diff-check only `.github/workflows/` changed, write the report.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Newest versions, pinned by SHA (requested) | Removes Node 20 warning; tags can't be moved under us | Several majors jumped at once; cannot be run before push | Chosen |
| Move to major tags only (`@v7`, no SHA) | Smaller diff; auto patch updates | Mutable tag; does not meet the pinning goal | Rejected |
| Intermediate majors (checkout v6, setup-node v6, github-script v8) | Smaller jump, also node24 | Not the newest; another bump later | Rejected unless the notes show a break in the newest |
| Pin only third-party actions | Less churn | Leaves Node 20 deprecation | Rejected |
| Leave `inputs.audit_level` as is | No edit | Direct shell interpolation (low risk: choice input, write access needed) | Rejected, requested |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `.github/workflows/agent-cron.yml` | MODIFY | checkout, setup-node -> pinned |
| `.github/workflows/agent-exits.yml` | MODIFY | checkout, setup-node -> pinned |
| `.github/workflows/daily-bars-sync.yml` | MODIFY | checkout, setup-node -> pinned |
| `.github/workflows/earnings-calendar-sync.yml` | MODIFY | checkout, setup-node -> pinned |
| `.github/workflows/position-health.yml` | MODIFY | checkout, setup-node -> pinned |
| `.github/workflows/weekly-report.yml` | MODIFY | checkout, setup-node -> pinned |
| `.github/workflows/pr-review.yml` | MODIFY | checkout, setup-node, github-script x2 -> pinned |
| `.github/workflows/security-audit.yml` | MODIFY | checkout, setup-node, github-script x2 -> pinned; `AUDIT_LEVEL` env + validation |
| `.github/workflows/keepalive.yml` | MODIFY (checkout only) | `actions/checkout` pinned; `gautamkrishnar/keepalive-workflow@v2` and its TODO comment left as is |
| `.tmp/security-change2-report.md` | CREATE | Deliverable (gitignored) |

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `pr-review.yml` contains the list of protected paths (lines ~72-92) but that list and the job logic are not edited.

## Database Changes

None.

## Open Questions

- **O-1** `gh` was not installed in the earlier audit (`gh: command not found`); the unauthenticated GitHub API worked for the public `actions/*` repos. Default: resolve SHAs with `git ls-remote` plus the REST API (both read-only), no `gh` needed. For `gh run list` (FR-19), the repo may be private: default is to try the REST API without a token, and if it returns 404/401 report "could not retrieve runs" rather than ask for a token. If you prefer, install/auth `gh` or paste the three runs.
- **O-2** Jumping checkout v4 -> v7 and setup-node v4 -> v7 skips v5/v6. Default: read every intermediate release note; if a change affects caching, credentials persistence or `fetch-depth` (`pr-review.yml` uses `fetch-depth: 0` and `git diff origin/<base>...HEAD`), stop and report.
- **O-3** Invalid `audit_level` handling (FR-24). Default: print `::error::` with the allowed values and `exit 1`; because the existing `continue-on-error: true` on that step would turn an invalid input into the "audit failed" branch (opening a false "critical advisory" issue), the validation should run as its own earlier step without `continue-on-error`. This adds a step; it is the minimal way to keep behaviour identical for valid input. Confirm.
- **O-4** `actionlint` availability: unknown on this Windows host. Default: use it if present (or via a pinned download is NOT allowed here), otherwise a YAML parse with Node (`yaml` is not a direct dependency, so use one already in `node_modules`, or Python `yaml` if available) and say that expression/shellcheck checks were not run.
- **O-5** None of this can be exercised before push: the first real check is `workflow_dispatch` on the changed workflows after the commit. Default: list the manual run order in the report (security-audit with `critical` and an invalid value is not possible via the UI choice, so only valid values are testable).
