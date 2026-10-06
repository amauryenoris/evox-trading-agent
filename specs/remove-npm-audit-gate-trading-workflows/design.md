# Design — Remove the npm audit Gate from the 5 Trading Workflows

## Architecture Decision

A one-step-for-one-comment substitution repeated identically across 5 existing CI files. No new
file, no application code, no change to any step's ordering besides the direct removal. The
responsibility this step carried (flagging a critical advisory) already lives in
`security-audit.yml`, deployed and approved separately — this change only stops the 5 trading
workflows from also depending on it as a hard gate.

## Data Flow

```
Before (each of the 5 files):
  checkout → setup-node → npm ci → npm audit --audit-level=critical → main command
                                     └─ on failure: step fails, job aborts, main command never runs

After (each of the 5 files):
  checkout → setup-node → npm ci → [comment only, no step] → main command
                                     └─ nothing here can fail or abort the job anymore

Unchanged, separately:
  security-audit.yml: schedule (12:00 UTC weekdays) + workflow_dispatch
    → npm audit (configurable level, default critical) → issue create/comment/close → exit 1 on failure
```

The 5 trading workflows' main commands (`npm run cycle`, `npm run exit-only`, `npm run health-check`,
`npm run daily-bars-sync`, `npm run report`) now run immediately after `npm ci`, with nothing between
them and dependency installation.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Remove the step entirely, leave a comment explaining where the audit now lives | Matches the context's literal instruction; keeps a breadcrumb for anyone reading the file later wondering why there's no audit step | None identified | **Chosen** |
| Remove the step with no comment at all | One less line | Loses the "why isn't there an audit step here" context for a future reader; not what was asked | Rejected |
| Keep the step but add `continue-on-error: true` instead of removing it | Smaller diff; audit still runs inline | Explicitly not what the context asks for (it asks for removal, since the audit now lives in a dedicated workflow) and would run the audit redundantly in 6 places instead of 1 | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `.github/workflows/agent-cron.yml` | MODIFY | `:49-50` (`- name: Security audit` / `run: npm audit --audit-level=critical`) replaced by one comment line |
| `.github/workflows/agent-exits.yml` | MODIFY | `:37-38` same substitution |
| `.github/workflows/position-health.yml` | MODIFY | `:37-38` same substitution |
| `.github/workflows/daily-bars-sync.yml` | MODIFY | `:36-37` same substitution |
| `.github/workflows/weekly-report.yml` | MODIFY | `:30-31` same substitution |

No other file. `security-audit.yml`, `keepalive.yml`, `pr-review.yml`, and every non-workflow file
are untouched.

## Protected Zone Impact

None — this feature does not require Protected Zone changes. `.github/workflows/*.yml` is not on
the Protected Zone list in `CLAUDE.md` or `SDD.md` §17.

## Database Changes

None.

## Open Questions

None. The exact lines, exact replacement text, and exact file list are all given directly in the
context with nothing left ambiguous. The one caveat noted in `requirements.md` Background (whether
`security-audit.yml`'s alert has actually been exercised end-to-end) is not an open design question
for this change — it's a precondition stated as already-satisfied by the context, flagged for
Amaury's awareness rather than left for this spec to resolve.
