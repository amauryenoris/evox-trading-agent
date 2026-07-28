# Requirements — Soften self_flagged_disqualifying_risk Instruction Wording

## Context

`SELF_FLAGGED_DISQUALIFYING_RISK`'s instruction block now lives at
`claude-agent.ts:102-107` (drifted +5 lines from the original diagnostic's
97-102, due to `gate-constants-hoist`'s module-scope insertion — content
unchanged, only shifted; re-confirmed live this session).

Line 103's parenthetical gives Claude two literal quoted examples —
`"0% win rate"` and `"has not been sufficient to generate profitable
entries"` — for what an "aggregate negative historical outcome statistic"
looks like. This session's diagnostic found NFLX's real reasoning output
echoing this phrasing almost verbatim ("documents a 0% win rate across
three exact analog patterns... a documented negative historical outcome
statistic"), independent of what the underlying retrieval actually
supported — evidence the instruction itself invites overconfident
statistical framing rather than merely describing a category.

Confirmed this session: aggregate performance deteriorated in the 2 weeks
before this fix (54.7% WR / +$4,242 before 07-14 vs. 29.4% WR / -$1,022 in
the 14 days since). This wording is one contributing factor among several
already being addressed — `gate-relevance-context` (cross-setup relevance
annotations) is the other, already merged. This spec is the wording-only
counterpart: independent of that code, touching only instructional text on
nearby lines of the same file.

Re-confirmed live this session: no test in `src/lib/__tests__/` asserts on
this block's literal wording (`self-flagged-disqualifying-risk.test.ts`
tests only the persistence/typeof-guard logic downstream of Claude's
response, not the SYSTEM_PROMPT text itself).

## Functional Requirements

FR-01: The system shall remove the two literal quoted example phrases
       (`"0% win rate"` and `"has not been sufficient to generate
       profitable entries"`) from the TRUE-condition bullet of the
       `SELF_FLAGGED_DISQUALIFYING_RISK` instruction block.

FR-02: The system shall replace the removed examples with an instruction
       that Claude describe the specific number or outcome exactly as it
       appears in the provided context, without inventing or rounding to a
       more precise-sounding figure than what was actually given.

FR-03: The system shall preserve the TRUE-condition bullet's existing
       two-part structure — (i) a specific prior loss with a percentage,
       or (ii) an aggregate negative historical outcome statistic for the
       same setup shape — unchanged in meaning.

FR-04: The system shall add, immediately after the existing "Do NOT set
       true merely because..." bullet, a new bullet instructing Claude to
       use the gate-importance context (hard-gated / soft-referenced /
       not-gated per setup) provided alongside a cross-signal-type lesson
       to judge its genuine applicability, rather than treating it as
       directly binding.

FR-05: The system shall add a second new bullet instructing Claude not to
       infer population-level conclusions from a single historical trade,
       and to describe only the evidence actually present in the provided
       context.

FR-06: The system shall leave the 4 other bullets/lines of this
       instruction block (the schema block above it, the FALSE-condition
       bullet, the "Do NOT set true merely because..." bullet, the
       "Determine this value after..." bullet, and the closing
       "logging/learning only" bullet) byte-identical to their pre-change
       state.

## Non-Functional Requirements

NFR-01: The change shall introduce zero TypeScript compilation errors
        (`npx tsc --noEmit`).

NFR-02: `npm run build` shall pass with no new errors.

NFR-03: The change shall require zero test file modifications — confirmed
        no existing test asserts on this block's literal wording.

NFR-04: The field's TRUE/FALSE decision logic, persistence mechanism
        (`self-flagged-disqualifying-risk.test.ts`'s covered code path),
        and `typeof` validation shall be unaffected — this is a
        prompt-text-only change.

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, which is Protected
      Zone per `CLAUDE.md` / `SDD.md` §17. Pre-authorized per the driving
      prompt's own framing ("Protected Zone — authorized by Amaury"); still
      flagged here per `specs/README.md` rule 3, and re-confirmed via a
      `tasks.md` checkbox before implementation.

C-02: No gate condition, signal-detection logic, or trade-execution path
      may be touched — this is prompt instructional text only.

C-03: `gate-importance.ts`, `DIMENSION_IMPORTANCE`, and any code from
      `gate-relevance-context` are read-only references from this
      instruction text — no modification to how that context is computed
      or rendered.

C-04: If implementation discovers a test asserting on this block's literal
      wording that this spec's verification pass missed, implementation
      must stop and report rather than modify the test silently.

## Out of Scope

- Any change to `gate-importance.ts`, `DIMENSION_IMPORTANCE`, or the
  `gate-relevance-context` comparison logic (already merged, independent)
- Any change to the field's TRUE/FALSE decision, persistence, or
  validation logic
- Any change to gate conditions, signal detection, or order execution
- Any change to lines 102, 104, 106, or 107 of the instruction block
- Any change to any other part of `claude-agent.ts`
