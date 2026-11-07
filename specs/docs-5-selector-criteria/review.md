# Review Report — docs-5: Close the docs thread + align the selector's setup criteria with the code

**Date**: 2026-11-07
**Reviewer**: Claude (automated)
**Status**: APPROVED

Method: `git diff` of the five modified files, re-reading the cited code lines, byte-level line-ending count, and re-running the new tests, the characterization file and `git status` on the goldens.

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | Replace the universal exit block in test-agent.md | ✅ | Block now "Exit conditions by setup" |
| FR-02 | MR exit z >= -0.8 (EXIT_LONG) | ✅ | `indicators.ts:195`, exit std 0.8 (`config.ts:5`) |
| FR-03 | PULLBACK / RECLAIM exit below EMA50 | ✅ | `claude-agent.ts:272-290` |
| FR-04 | ZLE05 exit z >= 1.25 | ✅ | `claude-agent.ts:278-283` |
| FR-05 | 3DAY exit price > SMA5 | ✅ | `claude-agent.ts:292-297` |
| FR-06 | Targets 5% ZLE05 / 10% others | ✅ | `protective-stop.ts:27-30` |
| FR-07 | MR floor 5/3/3 pp | ✅ | `protective-stop.ts:12-14` |
| FR-08 | Time stop `>= 20` | ✅ | `claude-agent.ts:260` |
| FR-09 | -5% stop, two layers | ✅ | `claude-agent.ts:185,823` (STOP_LOSS_PCT 0.05) |
| FR-10 | ZLE05 comment matches ceiling | ✅ | `0 < z <= 1.25 (entry ceiling)` |
| FR-11 | 3DAY in `SignalType` example | ✅ | `typescript-patterns.md:102` |
| FR-12 | 8 workflows in SDD §15 | ✅ | 8 rows |
| FR-13 | Names/files/crons from the workflow files | ✅ | Names and crons match the `.yml` lines read |
| FR-14 | UTC + EDT/EST per cron | ✅ | Conversions checked (UTC-4 / UTC-5) |
| FR-15 | pr-review described by its trigger | ✅ | opened, synchronize, reopened on `main` |
| FR-16 | MR text states the entry rule | ✅ | `claude-agent.ts:1684-1703` |
| FR-17 | RSI/%B/regime-required removed | ✅ | No match in `src/` |
| FR-18 | PULLBACK: ADX may be unavailable | ✅ | `:1661` |
| FR-19 | PULLBACK: MACD > -2.0 | ✅ | `:1744-1757`, `:84` |
| FR-20 | 3DAY: previous close vs SMA200 | ✅ | `:1715-1718` |
| FR-21 | 3DAY: SMA5 condition | ✅ | `:1733-1742` |
| FR-22 | 3DAY: no "exactly" | ✅ | `:1720-1727` |
| FR-23 | ZLE05 compared, changed only if different | ✅ | Unchanged; matches `:1665-1670,1791-1801` |
| FR-24 | RECLAIM compared, changed only if different | ✅ | Unchanged; matches `:1822-1829` |
| FR-25 | Same style and length | ✅ | One sentence each; MR 98 vs 91 chars, PULLBACK +40, 3DAY about equal |
| FR-26 | No added instructions | ✅ | Only conditions |
| FR-27 | Only `criteria` values change | ✅ | Diff: 3 lines replaced |
| FR-28 | Test pins the 5 strings | ✅ | `ACTIVE_SETUPS` pin test |
| FR-29 | Test checks prompt contains each line | ✅ | `it.each` over `system` sent to `messages.create` |
| FR-30 | Absence of `RSI < 45` | ✅ | |
| FR-31 | Absence of `%B < 0.2` | ✅ | |
| FR-32 | Characterization 3 runs, goldens reported | ✅ | Re-run now: 1 file, 23 tests passed; `__golden__` clean |
| FR-33 | Stop if a golden changes | ✅ | None changed |
| FR-34 | No golden touched | ✅ | Not in `git status` |
| FR-35 | `tsc --noEmit` | ✅ | Clean |
| FR-36 | Full Vitest | ✅ | 1053 passed (baseline 1046 + 7) |
| FR-37 | ESLint on touched files | ✅ | Clean |
| FR-38 | Only allowed files in diff | ✅ | Five files + untracked spec folder |
| FR-39 | Line endings preserved | ✅ | CR count = line count in CRLF files (350/350, 308/308); 0 CR in the three LF files |
| FR-40 | Report old -> new with `file:line` | ✅ | `.tmp/docs-5-report.md` section 1 |
| FR-41 | Exact old/new text of all 5 setups | ✅ | Section 2, includes the two unchanged |
| FR-42 | Test results in report | ✅ | Sections 3-4 |
| FR-43 | Unverified list | ✅ | Section 5 |
| FR-44 | No commit or push | ✅ | Working tree modified, nothing committed |
| NFR-01 | Numbers read from source | ✅ | Spot-checked 12 values against the code |
| NFR-02 | Existing test patterns | ✅ | `vi.hoisted` mocks reused, AAA |
| NFR-03 | No network/keys | ✅ | Mocked Anthropic, test key |
| NFR-04 | Coverage not reduced | ✅ | No executable `src/` code added |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | read only |
| src/lib/claude-agent.ts | UNTOUCHED | read only |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | read only |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

`stock-selector.ts` also untouched (C-02).

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity | ✅ | `claude-agent.ts` not touched; selector criteria stay a soft factor ("not a requirement") |
| Supabase patterns | ✅ | Not applicable |
| TypeScript quality | ✅ | No `any` (one `as string` on a mock call argument); `it.each` with `as const` |
| Security | ✅ | No secrets; test key is a placeholder |

## Task Checklist

- Completed: 26/26 implementation tasks. The two unchecked boxes are Post-Implementation (this review and the Protected Zone confirmation).

## Findings

### CRITICAL (blocks merge)
- None

### HIGH (should fix)
- None

### MEDIUM (consider fixing)
- None

### LOW (optional)
- **L-1** `SDD.md:14-15` (§2 diagram) still names `trading-cycle.yml` and `exit-only.yml`. Left on purpose (Q-4) and listed in the report; it now disagrees with §15.
- **L-2** The report, section 5, has a garbled bullet ("The 5 `momentum confirmed` wording"). It means: "momentum confirmed" is implied by "EMA50 slope rising" in the code and was left as in the old text. The report is not versioned.
- **L-3** The 3DAY text omits the SMA5 gate fail-open when SMA5 is unusable (`claude-agent.ts:1736-1738`); stated in the report as a deliberate length choice.
- **L-4** Live effect on the next cycle with at least 10 screener candidates is not measurable statically (stated in the report).

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
