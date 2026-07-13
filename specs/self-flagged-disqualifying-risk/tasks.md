# Tasks — Self-Flagged Disqualifying Risk Observability Field

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Open Question resolved — placement of detailed TRUE/FALSE scoping criteria (system-prompt-unconditional vs. LEARN-mode-only as literally specified)
- [X] Protected Zone changes confirmed (`src/lib/claude-agent.ts`)
- [X] Database migrations drafted (if applicable) — N/A, none required

## Implementation Checklist

### Phase 1 — Verify (re-confirm no drift immediately before editing)
- [x] T-01: Re-read `claude-agent.ts:87-94`, `:612-624`, and `:1888-1896` verbatim immediately before editing to confirm no further drift since this spec was written. Confirmed — byte-identical to STEP 0.

### Phase 2 — Type
- [x] T-02: In `src/lib/types.ts`, add `self_flagged_disqualifying_risk?: boolean` to the `AgentDecision` interface, after `what_would_trigger?: string` (line 155).

### Phase 3 — Prompt
- [x] T-03: In the `SYSTEM_PROMPT` response schema (`claude-agent.ts:87-94`), add `"self_flagged_disqualifying_risk": false` as a new line in the JSON schema block.
- [x] T-04: Per the Open Question resolution (add to system prompt, unconditional), added a new `SELF_FLAGGED_DISQUALIFYING_RISK` section directly after the RESPONSE SCHEMA block in `SYSTEM_PROMPT` (reaches every call) with the full 5-bullet criteria below, plus a lightweight one-line reinforcement in the existing LEARN-mode field list (`claude-agent.ts:620-624`, referencing the system-prompt criteria rather than duplicating all 5 bullets there):
  - Set to TRUE only when your reasoning explicitly names either (i) a specific prior loss for this symbol or an analogous setup, with a percentage, or (ii) an aggregate negative historical outcome statistic (e.g. "0% win rate", "has not been sufficient to generate profitable entries") for the same setup shape.
  - Set to FALSE when your reasoning does not explicitly identify one of these two disqualifying patterns. Do not infer this from general caution, market uncertainty, or elevated-risk language alone (e.g. high ATR, negative MACD) unless tied to a specific named historical loss or negative statistic as described above.
  - Do NOT set true merely because your reasoning cites historical evidence in general — a trade that cites a POSITIVE precedent (a past win for this setup/symbol) is not a disqualifying-risk case, even if it also mentions a loss elsewhere for contrast; only set true if the negative/disqualifying pattern is what your reasoning is actually weighing as a reason for concern.
  - Determine this value after you have formed your reasoning and conclusion — it should reflect what your finished analysis actually relied on, not a prediction made before reasoning it through.
  - This field is for logging/learning only — it does not block or approve the trade (consistent with the existing "You do NOT decide whether to trade" framing already in the system prompt).

### Phase 4 — Persistence
- [x] T-05: In `claude-agent.ts` (now lines 1897-1901 after the prompt additions shifted line numbers), added the validated local variable exactly as specified.
- [x] T-06: Added the conditional spread to `indicatorsWithLearning`, matching the existing 3-field idiom exactly.
- [x] T-07: Confirmed no other line in the `indicatorsWithLearning` block or surrounding function changed — `git diff` shows only additive lines in this block.

### Phase 5 — Testing
- [x] T-08: Unit test — a decision object with `self_flagged_disqualifying_risk: true` produces `selfFlaggedRisk === true` and the spread includes the key with value `true`. (`self-flagged-disqualifying-risk.test.ts`)
- [x] T-09: Unit test — a decision object with `self_flagged_disqualifying_risk: false` produces `selfFlaggedRisk === false` and the spread includes the key with value `false` (not omitted — false is distinct from absent).
- [x] T-10: Unit test — a decision object with the field omitted entirely produces `selfFlaggedRisk === undefined` and the spread does not add the key to the resulting object.
- [x] T-11: Unit test — a decision object with a non-boolean value (string `"true"`, number `1`, `null`) produces `selfFlaggedRisk === undefined` (falls through the `typeof` guard) and the key is not added — matching the omitted-field behavior from T-10.
- [x] T-12: Confirmed by inspection: `decision.action = 'HOLD'` at `claude-agent.ts:1652` (unchanged, still the exact same unconditional single-line assignment, no new branch added before it) plus a documenting test replicating the override across `true`/`false`/`undefined` risk values.
- [x] T-13: Run `npx tsc --noEmit` — passes (no output, clean exit).
- [x] T-14: Run `npm run build` — passes (compiled successfully, all routes generated).
- [x] T-15: Run full existing test suite (`npm test`) — 236/236 tests passing across 22 files (227 pre-existing + 9 new), no existing test broke.

## Post-Implementation

- [x] Run `/review self-flagged-disqualifying-risk` to verify implementation matches spec — see `review.md`, APPROVED WITH WARNINGS (1 MEDIUM: stale schema docs in CLAUDE.md + claude-api-patterns.md, non-blocking)
- [x] Confirm Protected Zone diff in `claude-agent.ts` is limited to the 3 additive edits described in `design.md` — no gate/sizing/action-override logic touched. `git diff --stat`: 17 insertions, 2 deletions across `claude-agent.ts` (2 deletions are just the schema block's closing brace/backtick being pushed down to accommodate new content, not logic removed) + `types.ts` 1 insertion.
- [x] Confirm `git diff` shows zero lines removed from any gate/setup-detection/exit-rule block — confirmed, the 3 diff hunks are exactly the SYSTEM_PROMPT schema block, the LEARN-mode field list, and the `indicatorsWithLearning` construction — none overlap any gate/setup-detection/exit-rule code.

## Estimated Complexity

**Low** — one new optional interface field, two prompt-text additions (one unconditional line, one conditional-block instruction pending the Open Question), and a 6-line persistence addition mirroring an exact existing pattern. No new files, no DB migration, no execution-path risk since the field is provably unread by any conditional. The only non-trivial part is resolving the Open Question about where the detailed scoping guidance actually needs to live for the feature to capture the cases it's designed to capture.
