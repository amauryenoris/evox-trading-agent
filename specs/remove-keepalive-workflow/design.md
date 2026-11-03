# Design — Remove the Keepalive workflow

## Architecture Decision

The change is a file deletion plus two documentation edits; no code, schedule or other workflow changes. `keepalive.yml` ran weekly (Monday 12:00 UTC) with `contents: write` and relied on `gautamkrishnar/keepalive-workflow@v2`, whose repository GitHub has disabled; its last 3 runs failed at "Set up job". The owner chose to remove it because the repo receives frequent commits. Removing it also drops the only job with write access to repository contents. A short note in the workflows documentation replaces the safeguard with a human check.

## Reference search (done during spec; to be repeated at implementation)

Search for "keepalive" excluding `node_modules`, `.next`, `.git`, `.tmp`, `package-lock.json`:

| Location | Kind | Planned action |
|---|---|---|
| `.github/workflows/keepalive.yml` (lines 1, 9, 15, 16, 17) | the workflow itself | DELETE the file |
| `CLAUDE.md:252` (block `# .github/workflows/keepalive.yml`, 3 lines incl. schedule) | live doc reference | REMOVE the block |
| `SDD.md:258` (workflows table row "Keepalive") | live doc reference | REMOVE the row; add the 60-day note below the table |
| `specs/pin-workflow-runners-ubuntu-24-04/*`, `specs/position-health-workflow/*`, `specs/remove-npm-audit-gate-trading-workflows/*`, `specs/security-audit-workflow/*`, `specs/trading-positions-concurrency-group/*`, `specs/security-change2-actions-sha/*` | historical spec records | LEAVE unchanged |
| `README.md`, `AGENTS.md`, `.claude/`, `scripts/`, `src/`, other workflows | no match | none |

Dependency check done in the spec phase: `needs:` and `workflow_run` appear in no workflow, so nothing depends on Keepalive.

## Data Flow

1. Re-run the search; confirm the table above (stop and report if new live references appear).
2. Confirm no `needs:`/`workflow_run` dependency.
3. Delete `.github/workflows/keepalive.yml`.
4. Edit `CLAUDE.md` (remove the keepalive block) and `SDD.md` (remove the row, add the note).
5. Validate: YAML-parse the 8 remaining workflows, confirm they are byte-identical to `HEAD`, re-search for "keepalive" in live files, `git status`.
6. Write `.tmp/remove-keepalive-report.md`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Delete the workflow (requested) | Removes a failing job and the only `contents: write` job; no dead dependency | Loses the 60-day inactivity safeguard | Chosen |
| Replace with an inline step | Keeps the safeguard | Explicitly forbidden; new code to maintain | Rejected |
| Keep it failing | No edit | Red run every Monday; relies on a disabled third-party repo | Rejected |
| Edit historical specs too | No stale mentions | Rewrites history of past changes | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `.github/workflows/keepalive.yml` | DELETE | The workflow |
| `CLAUDE.md` | MODIFY | Remove the keepalive block from the GitHub Actions schedule section |
| `SDD.md` | MODIFY | Remove the Keepalive table row (section 15); add the 60-day note |
| `.tmp/remove-keepalive-report.md` | CREATE | Deliverable (gitignored) |

No other file changes. `README.md` does not mention keepalive and gets no edit. No new documentation file is created.

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None.

## Open Questions

- **O-1** Historical specs mention `keepalive.yml`. Default: leave them untouched (they record what was true when written).
- **O-2** Where the 60-day note goes. Default: one note in `SDD.md` section 15 (the section that describes the workflows), directly under the table. `CLAUDE.md` gets only the block removal, not a second copy of the note. Say if you prefer it in `CLAUDE.md`, `README.md` or both.
- **O-3** `CLAUDE.md` and `SDD.md` both still say "All workflows run `npm ci` + `npm audit`". That is stale (an earlier change removed the audit gate from the trading workflows) but unrelated to Keepalive. Default: leave it and mention it in the report.
- **O-4** After deletion, the old runs stay in the GitHub Actions history and the workflow may still appear in the Actions sidebar until its history ages out. This is GitHub-side, not fixable from the repo; no action planned.
- **O-5** Editing `CLAUDE.md` changes a project-instructions file. Default: only the 3-line keepalive block is removed, nothing else in the file.
