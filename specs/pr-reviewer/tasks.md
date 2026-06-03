# Tasks — PR Reviewer (GitHub Actions)

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [ ] Protected Zone changes confirmed (N/A — no Protected Zone files touched)
- [ ] Database migrations drafted (N/A — no DB changes)

## Implementation Checklist

### Phase 0 — Manual Setup (Amaury does these before implementing)

- [X] T-01: In GitHub → repo → Issues → Labels, create label `needs-work`
      (suggested color: #e11d48 red) if it does not already exist.
- [X] T-02: Create label `ready-for-review` (suggested color: #16a34a green)
      if it does not already exist.

### Phase 1 — Workflow File

- [X] T-03: Create `.github/workflows/pr-review.yml` with:
      - trigger: `pull_request` events `opened`, `synchronize`, `reopened`
        targeting `branches: [main]`
      - `permissions: contents: read, pull-requests: write, issues: write`
      - single job `pr-review` on `ubuntu-latest`, `timeout-minutes: 10`

- [X] T-04: Add step `Setup Node.js` using `actions/setup-node@v4` with
      `node-version: "24"` and `cache: "npm"` (matches existing workflows).

- [X] T-05: Add step `Install dependencies` running `npm ci`.

- [X] T-06: Add step `TypeScript check` running `npx tsc --noEmit`; capture
      exit code and stderr into env vars `TS_STATUS` and `TS_OUTPUT`.
      Use `continue-on-error: true` so the job does not abort on failure.

- [X] T-07: Add step `Run tests` running `npm test`; capture exit code and
      stdout into env vars `TEST_STATUS` and `TEST_OUTPUT`.
      Use `continue-on-error: true`.

- [X] T-08: Add step `Protected Zone audit` that runs
      `git diff origin/main...HEAD --name-only` and filters the output against
      the Protected Zone list from C-04 in requirements.md.
      Store result in `PROTECTED_FILES` env var (empty string if none).

- [X] T-09: Add step `Claude review` that:
      a. Gets the full diff: `git diff origin/main...HEAD`
      b. Truncates to 12,000 characters, appending `[DIFF TRUNCATED]` if over limit
      c. Builds the JSON payload for the Anthropic API using the prompt from
         design.md (`claude-sonnet-4-6`, `max_tokens: 1024`)
      d. POSTs to `https://api.anthropic.com/v1/messages` using Python urllib
         with `ANTHROPIC_API_KEY` from secrets
      e. Extracts the `content[0].text` field and stores in `CLAUDE_VERDICT` env var
      f. Uses `continue-on-error: true` so a Claude API failure doesn't block the report

- [X] T-10: Add step `Post PR comment` using `actions/github-script@v7` that:
      a. Searches existing comments on the PR for one matching a bot-marker string
         (e.g. `<!-- pr-review-bot -->`) and deletes it if found
      b. Builds the markdown report from `TS_STATUS`, `TEST_STATUS`,
         `PROTECTED_FILES`, and `CLAUDE_VERDICT` env vars
      c. Posts the new comment with the bot-marker string embedded

- [X] T-11: Add step `Apply label` using `actions/github-script@v7` that:
      a. Checks if `CLAUDE_VERDICT` contains `VERDICT: CRITICAL`
      b. If CRITICAL: calls `github.rest.issues.addLabels` with `needs-work`,
         calls `github.rest.pulls.createReview` with `event: 'REQUEST_CHANGES'`,
         and removes `ready-for-review` label if present (ignore 404)
      c. If not CRITICAL: calls `github.rest.issues.addLabels` with
         `ready-for-review`, and removes `needs-work` label if present (ignore 404)

### Phase 2 — Verify

- [ ] T-12: Open a test PR (or use `workflow_dispatch` if added) and confirm the
      comment is posted with all four sections populated.
- [ ] T-13: Confirm the correct label is applied based on Claude's verdict.
- [ ] T-14: Confirm no secrets appear in the comment or workflow logs.

## Post-Implementation

- [X] Run `/review pr-reviewer` to verify implementation matches spec
- [X] Confirm Protected Zone files unchanged (expected: yes)

## Estimated Complexity

**Medium** — Single YAML file but requires coordinating four distinct outputs
(TypeScript, tests, git diff, Claude API) and composing them into a GitHub comment
with label management. The curl/JSON escaping for the Anthropic API call is the
trickiest part.
