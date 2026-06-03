# Design — PR Reviewer (GitHub Actions)

## Architecture Decision

This feature lives entirely in CI — a single new file
`.github/workflows/pr-review.yml`. It has no impact on the application source
tree. The workflow runs on GitHub-hosted `ubuntu-latest` runners and uses only
tools already available: Node.js (from `actions/setup-node`), `curl` (built-in),
and `actions/github-script` for GitHub API calls. No new npm dependencies are
added to the project.

## Data Flow

```
PR opened / pushed
        │
        ▼
  1. Checkout PR branch (actions/checkout, fetch-depth: 0 for full history)
        │
        ▼
  2. npm ci  →  npx tsc --noEmit
        │          exit 0 → TS_STATUS=pass
        │          exit N → TS_STATUS=fail + capture stderr
        ▼
  3. npm test
        │          exit 0 → TEST_STATUS=pass
        │          exit N → TEST_STATUS=fail + capture output
        ▼
  4. git diff origin/main...HEAD --name-only
        │  filter against PROTECTED_ZONE list
        │          matches → PROTECTED_FILES="file1 file2 …"
        │          no match → PROTECTED_FILES=""
        ▼
  5. git diff origin/main...HEAD (full diff, truncated to 12 000 chars)
        │  + build Claude prompt (see Prompt Design below)
        │  + curl POST https://api.anthropic.com/v1/messages
        │          → CLAUDE_VERDICT (text with CRITICAL / WARNING / OK prefix)
        ▼
  6. actions/github-script
        │  a. Find existing bot comment on the PR (if any) — replace it
        │  b. Build markdown report from all captured vars
        │  c. Post / update comment
        │  d. If CRITICAL in verdict → createReview(event: REQUEST_CHANGES)
        │                              + addLabels(['needs-work'])
        │                              + removeLabel('ready-for-review') if present
        │     Else → addLabels(['ready-for-review'])
        │             + removeLabel('needs-work') if present
        ▼
  Done — Amaury merges manually
```

## Prompt Design

The Claude prompt sent in step 5 follows the analyst-pure contract already
established in `CLAUDE.md`. It does **not** ask Claude to make a merge decision.

```
You are a code reviewer for a Next.js trading agent (Paquito / EVOX).
Evaluate the following pull request diff and respond with a structured report.

ARCHITECTURE RULES:
- Claude is a pure analyst. It must never decide to BUY, SELL, or HOLD.
- The action field in claude-agent.ts must always be forced to HOLD after parsing.
- Protected Zone files (config.ts, claude-agent.ts, risk-manager.ts,
  indicators.ts, news-intelligence.ts, watchlist-monitor.ts, learning.ts)
  require explicit owner confirmation before modification.
- No hardcoded secrets. No console.log with sensitive data.
- Functions < 50 lines, files < 800 lines, no deep nesting.

RESPOND with exactly this format:
VERDICT: CRITICAL | WARNING | OK
SUMMARY: <1-2 sentences>
FINDINGS:
- [CRITICAL|HIGH|MEDIUM|LOW] <finding>
(repeat for each finding, or write "None" if clean)

DIFF:
<diff content>
```

The model is `claude-sonnet-4-6` with `max_tokens: 1024`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Inline bash + curl for all GitHub API calls | No extra actions, fully transparent | Verbose, error-prone JSON escaping for comments | Rejected |
| `actions/github-script` for GitHub API, `curl` for Anthropic | Clean JS for GitHub API, minimal curl for Anthropic | Two styles in one workflow | **Chosen** |
| Dedicated Node.js review script in `scripts/` | Testable, reusable | Violates C-01 (would add a source file) | Rejected |
| Third-party Claude Actions (marketplace) | Zero implementation effort | External dependency, opaque behavior, trust risk | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|-------------|-------------|
| `.github/workflows/pr-review.yml` | CREATE | New workflow — the only file created by this feature |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## GitHub Permissions Required

The workflow job needs these permissions (declared explicitly):

```yaml
permissions:
  contents: read
  pull-requests: write   # post comments, request changes
  issues: write          # add/remove labels
```

## Labels Setup (manual pre-condition)

The labels `needs-work` and `ready-for-review` must exist in the GitHub repo
before the workflow runs. If they don't exist, the `addLabels` call will fail
silently (GitHub returns 404). **Amaury must create these labels manually once**
via GitHub → Issues → Labels before merging this workflow.

## Database Changes

None.

## Open Questions

- **Diff size**: If a PR diff exceeds 12,000 characters, the workflow truncates it
  and adds a note to the comment. Should the truncation threshold be lower (e.g.,
  8,000) to stay well within Claude's useful context? Recommend 12,000 as a
  starting point — adjust if Claude responses degrade on large PRs.
- **Label creation**: Should the workflow auto-create the labels if they don't
  exist, or rely on Amaury creating them manually? Auto-creation is cleaner but
  adds API calls. Recommend manual (documented in T-01 of tasks.md).
