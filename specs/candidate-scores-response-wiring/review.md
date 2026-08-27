# Review Report — Wire Per-Candidate Scores into selectStocksForAnalysis()

**Date**: 2026-08-27
**Reviewer**: Claude (automated)
**Status**: APPROVED

---

## Requirements Verification

| ID | Requirement (summary) | Status | Notes |
|----|----------------------|--------|-------|
| FR-01 | `SELECTION_SYSTEM_PROMPT` requests a `scores` array, one object per rendered candidate | ✅ SATISFIED | `stock-selector.ts:49-63` — includes `{symbol, score, regime, risks, thesis}` and explicitly says "one object for EVERY candidate shown in Pool A and Pool B above, not just your 6-8 selected symbols" |
| FR-02 | `max_tokens` set to `3000` | ✅ SATISFIED | `stock-selector.ts:168`; verified by test `sets max_tokens to 3000 on the Claude API call` against the actual `client.messages.create()` call params |
| FR-03 | `scores` parsed and assigned to `candidateScores` | ✅ SATISFIED | `stock-selector.ts:177,184`; verified by test `parses a full scores array into candidateScores and persists it` |
| FR-04 | Missing `scores` → `candidateScores` undefined, no throw | ✅ SATISFIED | `parsed.scores` is optional in the cast, no default substitution applied; verified by test `completes successfully with candidateScores undefined when Claude omits the scores field` |
| FR-05 | Returned watchlist derived exclusively from `parsed.selected`, unaffected by `scores` | ✅ SATISFIED | `stock-selector.ts:189-190` byte-identical to pre-change; verified by test `does not let scores content influence the returned watchlist` using a deliberately misleading `scores` array (low score for the selected symbol, high score for a non-candidate symbol) |

## Non-Functional Requirements

| ID | Requirement | Status | Notes |
|----|-------------|--------|-------|
| NFR-01 | `db.ts` not touched | ✅ SATISFIED | Confirmed absent from `git diff --stat` |
| NFR-02 | No second `./types` import statement | ✅ SATISFIED | `CandidateScore` added to the existing type-only import block (`stock-selector.ts:2-10`) |

## Constraints Verification

| ID | Constraint | Status | Notes |
|----|-----------|--------|-------|
| C-01 | Protected Zone untouched | ✅ SATISFIED | Confirmed via `git diff --stat` — none of the 7 files appear |
| C-02 | Only `stock-selector.ts` (+ test file) modified | ✅ SATISFIED | Confirmed — the only other pending change (`specs/gate-constants-hoist/review.md`, a pre-existing trailing-newline diff) predates this session and is unrelated |
| C-03 | Final two lines of the function byte-identical | ✅ SATISFIED | `stock-selector.ts:189-190` — `allSymbolSet` construction and `return parsed.selected.filter(...)` match the pre-change version exactly |
| C-04 | Steps 1-5 and `allCandidates` construction unchanged | ✅ SATISFIED | `stock-selector.ts:76-117` — identical content to pre-change, only shifted down by the new prompt lines inserted earlier in the file |
| C-05 | `recordSelectionOutcome()` unchanged | ✅ SATISFIED | `stock-selector.ts:193-220` — byte-identical |
| C-06 | No existing test assertions modified | ✅ SATISFIED | First two `describe` blocks (lines 48-154) and the `candidatesOffered truncation fix` block (lines 207-243) are byte-identical; `mockClaudeSelection`'s new optional second parameter is backward-compatible — existing single-argument calls behave identically |
| C-07 | `tsc --noEmit` and `npm run build` pass | ✅ SATISFIED | Both verified clean; full suite 360/360 passing (40 files, up from 356 pre-change) |

## Protected Zone Audit

| File | Status | Notes |
|------|--------|-------|
| src/lib/config.ts | UNTOUCHED | — |
| src/lib/claude-agent.ts | UNTOUCHED | — |
| src/lib/risk-manager.ts | UNTOUCHED | — |
| src/lib/indicators.ts | UNTOUCHED | — |
| src/lib/news-intelligence.ts | UNTOUCHED | — |
| src/lib/watchlist-monitor.ts | UNTOUCHED | — |
| src/lib/learning.ts | UNTOUCHED | — |

## Pattern Compliance

| Check | Status | Notes |
|-------|--------|-------|
| Analyst purity (claude-agent.ts) | ➖ N/A | File not touched by this fix; note this is `stock-selector.ts`'s own screening-selection prompt, a distinct call from the per-symbol analyst prompt in `claude-agent.ts` — no overlap with the analyst-purity rules (action field, BUY/SELL/HOLD language) that specifically govern that other call |
| Supabase patterns | ➖ N/A | No DB queries added or modified in this prompt (Prompt 2a already wired `db.ts`) |
| TypeScript quality | ✅ | No `any` anywhere in the diff (confirmed via grep); immutable patterns preserved (`decision` built via a fresh object literal, no mutation); `stock-selector.ts` 220 lines, test file 315 lines — both well under 800; no magic numbers introduced (`max_tokens: 3000` is a literal API parameter value, consistent with how `max_tokens: 512/1024/256` are written as literals elsewhere in this codebase, not named constants) |
| Security | ✅ | No secrets, no hardcoded credentials; no sensitive data in prompts or logs; `candidateScores` content is Claude-generated text/numbers persisted as-is, same trust boundary as `reasoning` already was |

## Task Checklist

- Completed: 11/11 implementation tasks, 3/3 applicable pre-implementation checks, 4/5 post-implementation checks — the remaining unchecked item is "Run `/review`" itself, fulfilled by this report.

## Findings

### CRITICAL (blocks merge)
None

### HIGH (should fix)
None

### MEDIUM (consider fixing)
None

### LOW (optional)
- `max_tokens: 3000` remains an explicitly unvalidated estimate, as the spec itself acknowledges (no prior precedent in this codebase for a ~25-32-item structured array response — the previous ceiling for any single-item response was 1024). Not a defect in this implementation; worth monitoring actual response completeness/truncation once this runs against live Claude responses in production, per the spec's own "Out of Scope" note that recalibration is a separate, future concern.
- This completes Buy Scanner Fase 4's full 3-part sequence (candidates-offered-truncation-fix → candidate-scores-data-layer → candidate-scores-response-wiring). No further action needed for this spec, but worth confirming in a future session that `candidateScores` data is actually arriving well-formed from Claude in production before building any analysis on top of it.

---

## Decision

**APPROVED** — No CRITICAL or HIGH findings. Ready to commit.
