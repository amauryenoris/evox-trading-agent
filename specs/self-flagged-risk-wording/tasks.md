# Tasks — Soften self_flagged_disqualifying_risk Instruction Wording

## Pre-Implementation

- [ x] Amaury has reviewed and approved this spec
- [ x] Protected Zone change (`claude-agent.ts` instruction-text edit)
      explicitly re-confirmed at implementation time
- [ x] Database migrations drafted: N/A — no schema change

## Implementation Checklist

### Phase 1 — Verify current state (claude-agent.ts)
- [x] T-01: Re-read `claude-agent.ts` lines 100-109 live to confirm no
      drift since this spec's verification pass (currently: block at
      102-107, target text on 103, unchanged).
      Confirmed unchanged (identical to spec-writing-time read).
- [x] T-02: Grep `src/lib/__tests__/` for any test asserting on this
      block's literal wording — confirm none exists (already confirmed
      pre-spec; re-confirm before editing). If one is found, stop and
      report rather than modify it.
      Confirmed: zero matches for the target phrases or block header.

### Phase 2 — Edit the instruction block
- [x] T-03: Reword line 103 only: remove the parenthetical
      `(e.g. "0% win rate", "has not been sufficient to generate
      profitable entries")`, replacing the TRUE-condition bullet's ending
      with an instruction to describe the specific number or outcome
      exactly as it appears in the provided context, without inventing or
      rounding to a more precise-sounding figure than what was actually
      given. Preserve the existing (i)/(ii) two-part structure (FR-03).
- [x] T-04: Insert two new bullets immediately after the existing line 105
      ("Do NOT set true merely because..."):
      1. Instructing Claude to use the gate-importance context
         (hard-gated / soft-referenced / not-gated per setup) provided
         alongside a cross-signal-type lesson to judge genuine
         applicability rather than treating it as directly binding.
      2. Instructing Claude not to infer population-level conclusions
         from a single historical trade, and to describe only the
         evidence actually present in the provided context.
- [x] T-05: Confirm lines 102, 104, 106, 107 (now shifted by however many
      lines T-03/T-04 add) are byte-identical in content to their
      pre-change text — diff should show only line 103 changed plus 2
      new inserted lines.
      Confirmed via re-read: line 102 (header) and 104 (FALSE bullet)
      unchanged in place; the "Determine..." and "logging/learning only"
      bullets shifted from 106/107 to 108/109 but are byte-identical in
      content.

### Phase 3 — Verification
- [x] T-06: Grep the updated block to confirm the literal strings
      `"0% win rate"` and `"has not been sufficient to generate
      profitable entries"` no longer appear.
      Confirmed: zero matches in claude-agent.ts.
- [x] T-07: Confirm the 2 new bullets are present with substantively the
      meaning specified in T-04.
      Confirmed via re-read (lines 106-107).
- [x] T-08: `git diff` on `claude-agent.ts` — confirm the only changes are
      the reworded line 103 and the 2 newly inserted lines; zero other
      lines touched (including no drift into the field's TRUE/FALSE
      decision logic, persistence code, or any gate/signal-detection code
      elsewhere in the file).
      Confirmed: diff shows exactly 1 changed line + 2 inserted lines,
      nothing else in the 2149-line file touched.
- [x] T-09: Run `npx tsc --noEmit` — confirm zero errors. Clean.
- [x] T-10: Run `npm run build` — confirm it passes. "Compiled successfully."
- [x] T-11: Run the full test suite — confirm 100% pass, zero new
      failures, zero skipped tests; specifically confirm
      `self-flagged-disqualifying-risk.test.ts` passes unmodified
      (NFR-03/NFR-04).
      Result: 297/297 passed (29 files), including
      self-flagged-disqualifying-risk.test.ts unmodified.

## Post-Implementation

- [x] Confirm `git status` shows only `src/lib/claude-agent.ts` modified
- [x] Run `/review self-flagged-risk-wording` to verify implementation
      matches spec
      Result: APPROVED — see specs/self-flagged-risk-wording/review.md

## Estimated Complexity

**Low** — a 1-line rewording plus 2 new inserted lines inside a single
static prompt-text block; zero code logic, zero test impact, zero
Protected Zone risk beyond the text itself (no gate/decision/execution
path touched).
