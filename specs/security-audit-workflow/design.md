# Design — Add a Standalone Daily Security-Audit Workflow (Additive Only)

## Architecture Decision

This lives entirely in CI configuration — one new file, `.github/workflows/security-audit.yml` — with
no application code, no new module, and no runtime dependency. It reuses two patterns already present
in this repo's `pr-review.yml` rather than inventing new ones: (1) `actions/github-script@v7` calling
`github.rest.issues.*` with the default `GITHUB_TOKEN`, and (2) capturing a shell step's output into
`GITHUB_ENV` via a heredoc delimiter so a later `github-script` step can read it from
`process.env.*` without touching the filesystem from inside the sandboxed script context.

## Data Flow

```
cron "0 12 * * 1-5" (12:00 UTC weekdays, before the 13:30 UTC market-open exit check)
  or workflow_dispatch
         │
         ▼
checkout@v4 → setup-node@v4 (node 24) → npm ci
         │
         ▼
id: audit, continue-on-error: true
  set -o pipefail
  npm audit --audit-level=critical 2>&1 | tee audit.txt
  (capture first ~60 lines of audit.txt into $GITHUB_ENV as AUDIT_EXCERPT, heredoc-delimited,
   same technique as pr-review.yml's TS_OUTPUT/TEST_OUTPUT capture)
         │
         ├─ outcome == 'failure' ───────────────────────────────────────┐
         │                                                               │
         │   github-script@v7:                                          │
         │     list open issues, find one whose title ===                │
         │     "Security audit: critical advisory detected"              │
         │       found?  → add a comment with AUDIT_EXCERPT              │
         │       not found? → create a new issue with that exact title   │
         │                     and AUDIT_EXCERPT as the body             │
         │                                                               │
         │   exit 1   (job now marked failed → GitHub's own              │
         │             run-failure notification fires on top of          │
         │             the issue)                                        │
         │                                                               │
         └─ outcome == 'success' ──────────────────────────────────────┐
                                                                         │
             github-script@v7:                                         │
               list open issues, find one whose title ===               │
               "Security audit: critical advisory detected"             │
                 found?  → close it, add a "audit is clean" comment     │
                 not found? → do nothing                                │
                                                                         │
             job succeeds normally                                     │
```

**What happens in plain words** (restated at `/implement` time per the change's VERIFY instruction,
established here so the implementation has a single source of truth to restate from):
- **On audit success with no prior alert open**: nothing visible happens — the run is green, no issue
  touched.
- **On audit failure (first time)**: a new GitHub Issue appears titled "Security audit: critical
  advisory detected" with the relevant `npm audit` output, and the workflow run itself shows as
  failed (triggering whatever GitHub-side notification the owner's account is configured for).
- **On audit failure again the next day, same unresolved advisory**: no second issue is created — the
  existing open issue (found by its exact title) gets a new comment with that day's output instead.
  The run fails again each day until the advisory is resolved.
- **On audit success after one or more failure days**: the open issue is closed with a comment saying
  the audit is clean again — no manual cleanup needed.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Capture audit output into `GITHUB_ENV` via heredoc, read from `process.env` in `github-script` | Matches `pr-review.yml`'s existing, proven convention exactly; no filesystem access needed inside the sandboxed script | None identified | **Chosen** |
| Have the `github-script` step read `audit.txt` directly via Node `fs` | Slightly less shell scripting | `actions/github-script`'s script context is not guaranteed to have unrestricted `fs` access the same way across versions/configs; diverges from this repo's established pattern for no benefit | Rejected |
| Find an existing open issue via `github.rest.search.issuesAndPullRequests` (title-qualified search query) | One API call instead of list+filter | Query-string escaping of a title containing a colon adds fragility; `pr-review.yml`'s existing list+`.find()` pattern already solves the identical "does a marker already exist" problem and is simpler to get right | Rejected |
| Find an existing open issue via `github.rest.issues.listForRepo({ state: 'open' })` + exact-title `.find()` | Mirrors `pr-review.yml`'s own `listComments` + `.find(c => ...)` dedup pattern directly | Lists all open issues (fine at this repo's scale; not designed for a repo with hundreds of open issues) | **Chosen** |
| One combined `github-script` step handling both outcomes internally via an `if/else` on `process.env` | Fewer YAML steps | The spec's own enumeration (steps 5 and 6) already specifies two separate `if:`-gated steps; splitting them is also clearer to read in the Actions UI (two distinctly-named steps, each only runs on its relevant outcome) | **Chosen** (two steps, matching the spec) |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `.github/workflows/security-audit.yml` | CREATE | New workflow: scheduled `npm audit` + issue-based alerting, as specified above |

No other file — new or existing — changes. `agent-cron.yml`, `agent-exits.yml`, `position-health.yml`,
`daily-bars-sync.yml`, `weekly-report.yml`, `keepalive.yml`, `pr-review.yml`, `package.json`, any
lockfile, and any secret are all untouched by this change.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `.github/workflows/*.yml` is not on the
Protected Zone list in `CLAUDE.md` or `SDD.md` §17.

## Database Changes

None.

## Open Questions

**Is the GitHub repository's standalone Issues feature enabled?** This cannot be verified from
repository files — it's a GitHub Settings → Features → "Issues" toggle, not git-tracked content.
`pr-review.yml`'s existing `github.rest.issues.createComment`/`addLabels` calls do **not** prove this:
those operate on a pull request's conversation, which rides the Issues REST API internally even when
the standalone Issues tab is switched off for a repository. This new workflow's `issues.create` call
(FR-14, creating a free-standing issue not attached to any PR) will fail at runtime if that feature is
off. **Amaury must confirm Issues are enabled (github.com/.../settings → Features → Issues checkbox)
before `/implement` proceeds** — this is the spec's own FAIL FAST condition for "repo has issues
disabled," and it genuinely cannot be resolved by reading files, only by checking GitHub's UI.
