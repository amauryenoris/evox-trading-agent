---
name: check-pr
description: Check the status of a GitHub PR (open PRs, or a specific PR number) for this repo using the GitHub REST API directly. Use whenever the user asks to "check the PR", "chequea el PR", "revisa el PR #N", or wants a PR status summary. Optimized for low token usage — no gh CLI, no jq required, no raw JSON dumps.
---

# Check PR — low-token GitHub PR status

## Why this exists

`gh` CLI and `jq` are NOT installed on this machine (verified 2026-06-24). Do not attempt
`gh pr ...` — it will fail. Do not pipe to `jq` — also unavailable. Use `curl` against the
GitHub REST API directly, parsed with a single `python3 -c` (available in Git Bash).

The point of this skill is to avoid the token-wasteful pattern of N separate Bash calls
(list → details → diff → check-runs → comments → reviews) each dumping full JSON. Do it in
**at most 2 Bash calls** and print only a compact summary — never the full PR body, never the
raw diff, never the full `user` object.

## Steps

1. **Get owner/repo from git remote** (don't hardcode, don't rely on GITHUB_OWNER/GITHUB_REPO env vars — those are for the CI workflow, not guaranteed to match the current checkout):
   ```bash
   cd <repo_root> && git remote get-url origin
   ```
   Parse `owner/repo` out of the URL (works for both `https://github.com/owner/repo.git` and `git@github.com:owner/repo.git`).

2. **Pick the target**:
   - If the user gave a PR number → fetch that PR directly: `GET /repos/{owner}/{repo}/pulls/{number}`
   - Otherwise → fetch open PRs: `GET /repos/{owner}/{repo}/pulls?state=open&per_page=10`
   - If `GITHUB_TOKEN` is set in the environment, pass `-H "Authorization: Bearer $GITHUB_TOKEN"` to avoid the 60 req/hr unauthenticated rate limit. Otherwise proceed unauthenticated (fine for public repos, low volume).

3. **One combined fetch + parse**, in a single Bash command using `&&` to chain `curl` calls into temp files, then one `python3 -c` to print the report. Example for a known PR number:

   ```bash
   curl -s -o /tmp/pr.json "https://api.github.com/repos/$OWNER/$REPO/pulls/$N" && \
   curl -s -o /tmp/checks.json "https://api.github.com/repos/$OWNER/$REPO/commits/$(python3 -c "import json;print(json.load(open('/tmp/pr.json'))['head']['sha'])")/check-runs" && \
   curl -s -o /tmp/reviews.json "https://api.github.com/repos/$OWNER/$REPO/pulls/$N/reviews" && \
   curl -s -o /tmp/files.json "https://api.github.com/repos/$OWNER/$REPO/pulls/$N/files" && \
   python3 -c "
import json
pr = json.load(open('/tmp/pr.json'))
checks = json.load(open('/tmp/checks.json')).get('check_runs', [])
reviews = json.load(open('/tmp/reviews.json'))
files = json.load(open('/tmp/files.json'))

print(f\"#{pr['number']} {pr['title']}\")
print(f\"  {pr['head']['ref']} -> {pr['base']['ref']} | {pr['state']} | by {pr['user']['login']}\")
print(f\"  mergeable={pr.get('mergeable')} ({pr.get('mergeable_state')})\")
print(f\"  +{pr['additions']}/-{pr['deletions']} in {pr['changed_files']} files\")
for c in checks:
    print(f\"  CI: {c['name']} -> {c.get('conclusion')}\")
print(f\"  human reviews: {len(reviews)}\" + (': ' + ', '.join(r['state'] for r in reviews) if reviews else ''))
print('  files:', ', '.join(f['filename'] for f in files))
"
   ```

   For an open-PR list instead of one number, fetch `pulls?state=open` once and print number/title/branch/updated_at for each — skip the check-runs/reviews/files calls unless the user wants detail on a specific one.

4. **Cross-reference Protected Zone**: compare the `files` list against the Protected Zone table in `CLAUDE.md` (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`, `news-intelligence.ts`, `watchlist-monitor.ts`, `learning.ts`, `.env*`, `vercel.json`, any DB migration). If any match, flag it: `⚠️ touches Protected Zone: <file> — confirm before merge`.

5. **Report format** — short, no headers walls, no raw JSON ever shown to the user:
   ```
   PR #6 — feat: propagate SPX snapshot + state_fingerprint to trade_evaluations
   feat/sf-c-d-spx-fingerprint-pipeline -> main | open | by JDnoris03
   CI: ✅ all green | mergeable: clean | reviews: none yet
   Files: src/lib/db.ts, src/lib/learning.ts, src/lib/types.ts
   ⚠️ touches Protected Zone: learning.ts — confirm before merge
   ```

6. **Only fetch the diff** (`.diff` URL or `/files` patch field) if the user explicitly asks to see the code changes or asks for a full review. Never fetch it by default.

## Don't

- Don't try `gh` — not installed.
- Don't pipe to `jq` — not installed.
- Don't pretty-print full JSON objects (especially `user`, `_links`, `head.repo`) — extract only the needed fields.
- Don't make more than ~2 Bash tool calls for a single-PR status check.
- Don't dump the PR body or diff unless asked.
