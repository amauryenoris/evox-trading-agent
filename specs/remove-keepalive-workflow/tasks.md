# Tasks — Remove the Keepalive workflow

## Pre-Implementation

- [x] Amaury has reviewed and approved this spec
- [x] Protected Zone changes confirmed (N/A: none)
- [x] Database migrations drafted (N/A: none)
- [x] O-1 to O-5 answered or defaults accepted

## Implementation Checklist

### Phase 1 — Search and dependency check
- [x] T-01: Search the repo for "keepalive" (case-insensitive; exclude `node_modules`, `.next`, `.git`, `.tmp`, `package-lock.json`); list every match and classify it (workflow / live doc / historical spec).
- [x] T-02: Confirm no workflow uses `needs:` or `workflow_run` on Keepalive. STOP and report if one does.
- [x] T-03: Snapshot the remaining 8 workflow files (hash or copy in `.tmp/`) to prove they stay byte-identical.

### Phase 2 — Delete and edit
- [x] T-04: Delete `.github/workflows/keepalive.yml`.
- [x] T-05: `CLAUDE.md`: remove the `# .github/workflows/keepalive.yml` block (comment lines and the `schedule:` line) from the GitHub Actions schedule section; nothing else.
- [x] T-06: `SDD.md` section 15: remove the Keepalive table row; add the note "Scheduled workflows can be disabled by GitHub after 60 days without repo activity; check Actions if the repo goes quiet."

### Phase 3 — Validation
- [x] T-07: YAML-parse the 8 remaining workflows; confirm each is byte-identical to its snapshot.
- [x] T-08: Re-search "keepalive" in live files (`.github/`, `CLAUDE.md`, `SDD.md`, `README.md`, `AGENTS.md`, `.claude/`, `src/`, `scripts/`); expect no match.
- [x] T-09: `git status` / `git diff --stat`: only the deleted workflow, `CLAUDE.md` and `SDD.md` (plus the spec folder) changed; Protected Zone, source, `package*.json` untouched.

### Phase 4 — Report
- [x] T-10: Write `.tmp/remove-keepalive-report.md` (files deleted/edited, references found, validation results, where the note was added, the stale-audit observation from O-3).

## Post-Implementation

- [ ] Run /review remove-keepalive-workflow to verify the implementation matches the spec
- [ ] Confirm Protected Zone files unchanged
- [ ] Nothing committed or pushed; commit is a separate request from Amaury

## Estimated Complexity

Low. One file deleted and two small documentation edits; the only risk is a hidden dependency on the workflow, already checked (none found).
