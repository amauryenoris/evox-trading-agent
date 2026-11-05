# Review Report — CHANGE 0c: docs matrix update + non-default-env scenario (no production code)

**Date**: 2026-11-05
**Reviewer**: Claude (automated)
**Status**: APPROVED

Re-verified at review time: `git status` and `git diff --name-only` (only `CLAUDE.md`, `SDD.md` and the characterization test changed; two new untracked goldens), that none of the 16 existing goldens shows any change against `HEAD`, the exact document hunks, the line endings of both documents (CRLF preserved, no LF-only line), the new rows and sentences, the workflow facts behind the documents (all 8 workflows run `npm ci` and use Node 24; only `security-audit.yml` runs `npm audit`), `npx tsc --noEmit` (clean), ESLint on the touched test (clean), the full suite (**73 files, 1,046/1,046**), the characterization suite three times in file order plus once with `--sequence.shuffle` (23/23 each) and the new scenario alone via `-t` (passes), that the two new goldens are byte-identical to when they were generated, and the hook check (re-run, structure and counts only). The `env = {}` regression proof (only scenario (m) failed, 22 others passed) comes from the implementation run and was not repeated here. Nothing is committed; the baseline is `2d96902`.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Add a `prompt-builder.ts` row to the CLAUDE.md matrix | ✅ | Line 212. |
| FR-02 | Row says it builds the exact text Claude receives and that changes alter analyst input | ✅ | "Builds the exact text Claude receives — changes alter analyst input". |
| FR-03 | Add `prompt-builder.ts` to the `src/lib/` file table | ✅ | Line 84. |
| FR-04 | Add `position-sizing.ts` if missing | ✅ | Line 85; it was missing. |
| FR-05 | Add `protective-stop.ts` if missing | ✅ | Line 86; it was missing. |
| FR-06 | Descriptions match the source | ✅ | Checked against the exports: Kovner formula, regime multipliers, Kalman halving, caps, confidence factor and `Z_SIZING_OVERRIDE_ENABLED` (false) for sizing; profit target, profit-floor, trailing activation and stop calculations for `protective-stop`. |
| FR-07 | Check every workflow before editing the statement | ✅ | Per-workflow check recorded; re-done here. |
| FR-08 | Replace the stale `npm audit` sentence | ✅ | No match for the old text remains in either document. |
| FR-09 | State `npm ci` on Node 24 for every workflow | ✅ | 8 of 8. |
| FR-10 | `npm audit` only in `security-audit.yml`, weekdays, level `critical` unless a manual run chooses another | ✅ | Matches the workflow (cron `0 12 * * 1-5`, `AUDIT_LEVEL` default). |
| FR-11 | Other workflows do not run it | ✅ | "no other workflow runs it"; grep: 0 audit commands elsewhere. |
| FR-12 | No claim the files do not show | ✅ | "opens or closes a GitHub issue" matches `security-audit.yml`. |
| FR-13 | Position sizing paragraph says the override is disabled | ✅ | |
| FR-14 | Names `Z_SIZING_OVERRIDE_ENABLED` and `false` in `position-sizing.ts` | ✅ | |
| FR-15 | Confidence factor `max(0.5, confidence)` applies to every entry | ✅ | "including z <= -2". |
| FR-16 | Code path kept dormant | ✅ | |
| FR-17 | Rest of the formula unchanged | ✅ | The original sentences are intact; text only appended. |
| FR-18 | SDD diagram no longer describes the override as active | ✅ | |
| FR-19 | Disabled, dormant, confidence applies to every entry | ✅ | Two lines in the diagram. |
| FR-20 | Keep the 60-day note | ✅ | 1 occurrence, unchanged. |
| FR-21 | Leave the ranking text unchanged | ✅ | `z-score ≤ -2.0 (extreme edge) — wins over all` still at line 179. |
| FR-22 | Correct the repeated audit statement in SDD | ✅ | §15 line corrected (design O-1). |
| FR-23 | Preserve line endings | ✅ | CRLF only, both files. |
| FR-24 | Change no other line | ✅ | Hunks: CLAUDE.md `+84,3`, `179->182`, `+212`, `253->257,2`; SDD.md `88->88,2`, `261->262`. |
| FR-25 | Inspect project `settings.json` for hooks | ✅ | Keys: `mcpServers` only. |
| FR-26 | Inspect the other hook locations | ✅ | Workspace `.claude/`, user settings (keys only), plugin hook files. |
| FR-27 | Report whether `prompt-builder.ts` is covered | ✅ | Not covered by any hook found. |
| FR-28 | Say "no hook found" explicitly, no inferred coverage | ✅ | Stated, with what could not be checked. |
| FR-29 | No settings edit | ✅ | No `.claude` path in the diff. |
| FR-30 | No secrets printed | ✅ | Keys, event counts and rule counts only. |
| FR-31 | One scenario with non-default env | ✅ | `(m)`. |
| FR-32 | Values 7, 0.20, 0.07 | ✅ | |
| FR-33 | Prompt golden | ✅ | `m-non-default-env-buy.prompt.txt` (params header plus user prompt). |
| FR-34 | Record golden | ✅ | `m-non-default-env-buy.json`. |
| FR-35 | Five independent prompt assertions | ✅ | `Open Positions: 0/7`, `$20000.00`, `20%`, `7% below entry`, `Max Simultaneous Positions: 7`. |
| FR-36 | Goldens generated once | ✅ | Hashes unchanged since generation. |
| FR-37 | Existing goldens unchanged | ✅ | 0 modified paths under `__golden__/`. |
| FR-38 | Show that `{}` instead of `process.env` would fail it, without a production edit | ✅ | Shown during implementation with an uncommitted module-mock test (only scenario (m) failed); not repeated in this review. |
| FR-39 | Restore env after the scenario | ✅ | The harness `afterEach` restores the three keys; the suite also passes in shuffled order, so no leakage between tests. |
| FR-40 | Report explains the golden | ✅ | Quantity 100 -> 71, stop 47.5 -> 46.5, prompt lines. |
| FR-41 | `tsc` passes | ✅ | |
| FR-42 | Full Vitest passes | ✅ | 1,046/1,046 (was 1,045). |
| FR-43 | ESLint on the touched test | ✅ | |
| FR-44 | Three identical characterization runs | ✅ | Re-run here. |
| FR-45 | Only docs and test files changed | ✅ | |
| FR-46 | Report at `.tmp/change-0c-report.md` | ✅ | |
| FR-47 | Report contents | ✅ | Doc diffs, hook finding, scenario and golden, results. |
| FR-48 | Uncommitted | ✅ | |
| NFR-01 | No file under `src/lib` except tests | ✅ | |
| NFR-02 | No secret printed | ✅ | |
| NFR-03 | No network or live call | ✅ | |
| NFR-04 | Unverified claims labelled | ✅ | Managed settings and plugin hooks not naming the paths are listed as unverifiable. |
| C-01 | Edit only the allowed files | ✅ | |
| C-02 | No Protected Zone file | ✅ | |
| C-03 | No existing golden regenerated | ✅ | |
| C-04 | No threshold, flag or logic change | ✅ | |
| C-05 | No `.claude/settings.json` or hook edit | ✅ | |
| C-06 | No commit/push | ✅ | |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | Only executed by the test. |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`.env*`, `vercel.json`, `package.json`, the workflows and every settings file are also untouched. `CLAUDE.md` and `SDD.md` are documentation; the `CLAUDE.md` edit adds one restriction (the matrix row) and corrects statements.

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | N/A, `claude-agent.ts` untouched; the matrix row now states that prompt changes alter analyst input. |
| Supabase patterns | ✅ | N/A. |
| TypeScript quality | ✅ | The new test block is 18 lines, no `any`, no `console.log`; env mutation is restored by the harness. |
| Security | ✅ | No secrets; the hook check printed structure only. |

## Task Checklist

- Implementation tasks: 16/16 completed (T-01 to T-16), plus the 4 pre-implementation boxes = 20 `[x]`.
- 3 unchecked boxes remain under Post-Implementation (this review, Protected Zone confirmation, "nothing committed"). They close with this review and your commit decision; not implementation gaps.

## Findings

### CRITICAL (blocks merge)
- None.

### HIGH (should fix)
- None.

### MEDIUM (consider fixing)
- **M-1** `CLAUDE.md` still says `MAX_SPREAD_BPS = 50` in its Protected Zone block, and `SDD.md` repeats it in the execution gates, while `config.ts` has 100. This is a wrong figure for a live trading gate in the file that defines the permission matrix. It was seen and deliberately left alone (design O-4), but it deserves a short follow-up edit.
- **M-2** There is no machine enforcement of the matrix in the configuration I can read: no hook exists, and the user permission rules (30 `allow`, none on `src/lib`) do not guard those paths. The "Confirm with Amaury" table, including the new `prompt-builder.ts` row, is a convention backed only by the CI audit in `pr-review.yml`. Managed settings and plugin hooks that do not name the paths could not be checked, so this is a reading of what is visible, not proof that nothing guards the files.
- **M-3** The `CLAUDE.md` Risk Parameters table still describes `MAX_POSITION_SIZE` as "Max position as % of equity", while the new scenario (and its code comment) shows it only changes the prompt text, the order size being capped by a fixed 10% constant. The table is now contradicted by a documented quirk. Same follow-up as M-1.

### LOW (optional)
- **L-1** The `claude-agent.ts` row of the file table still lists "position sizing" and "signal detection, exit rules" even though sizing and the prompt now live in their own modules (left alone by design O-4).
- **L-2** The workflow sentence names `security-audit.yml` twice (once as the only audit workflow, once in the list of workflows not shown above). Harmless wording.
- **L-3** The `env = {}` regression proof is not kept in the repository; the scenario's golden is what detects it from now on. A permanent version of the proof would need a separate request.
- **L-4** The new goldens are LF in the repository and will be CRLF in Windows working copies; verified earlier that vitest still passes with CRLF goldens.
- **L-5** The new scenario has only run on this Windows host, like the rest of the harness; the first CI run on Linux is still untested.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit. Suggested follow-up: one small docs CHANGE for M-1 and M-3 (the `MAX_SPREAD_BPS` figure and the `MAX_POSITION_SIZE` description), since both are statements about live trading parameters.
