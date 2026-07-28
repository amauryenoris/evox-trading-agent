# Design — Soften self_flagged_disqualifying_risk Instruction Wording

## Architecture Decision

This is a pure prompt-text edit confined to 3 lines within the
`SELF_FLAGGED_DISQUALIFYING_RISK` instruction block of `SYSTEM_PROMPT` in
`claude-agent.ts`: one existing line reworded (103) and two new lines
inserted after line 105. No architecture, data flow, or code logic is
affected — this changes only what instructional text is sent to Claude as
part of the static system prompt, never a runtime value, gate condition,
or execution path.

## Data Flow

Not applicable in the traditional sense — this edits static prompt text
that is compiled into `SYSTEM_PROMPT` at module load and sent verbatim to
Claude on every analysis call (`callClaudeWithRetry`). No data moves
differently as a result of this change; only Claude's instructions for
populating one JSON field (`self_flagged_disqualifying_risk`) in its
response change in wording.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Remove the 2 literal examples, replace with "describe exactly what's in context" instruction + 2 new anti-overgeneralization bullets (this spec) | Directly targets the confirmed mechanism (Claude echoing the example phrasing near-verbatim regardless of real evidence); adds explicit guidance to use the newly-merged gate-importance context; minimal, surgical diff | Slightly longer instruction block | **Chosen** |
| Remove the field/instruction entirely | Eliminates the mechanism completely | `self_flagged_disqualifying_risk` is a deliberate observability field (logging/learning only, per SDD) with its own tested persistence path — removing it discards a working, unrelated piece of infrastructure to fix a wording problem | Rejected |
| Leave wording as-is, rely solely on `gate-relevance-context`'s cross-setup annotations (already merged) to reduce over-generalization | Zero further Protected Zone touch | Confirmed root-cause evidence (NFLX echoing the example phrasing near-verbatim) is specific to this instruction's wording, not to the relevance-context gap that Part A/`gate-relevance-context` already addressed — leaving it unfixed ships a known, diagnosed contributing factor | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Line 103 reworded (remove 2 literal example phrases, add "describe exactly as it appears" instruction); 2 new bullets inserted immediately after line 105. Lines 102, 104, 106, 107 byte-identical. No other line in the file changes. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is Protected Zone** per `CLAUDE.md`'s file
permission matrix and `SDD.md` §17. The driving prompt states this is
pre-authorized by Amaury; per `specs/README.md` rule 3 and this project's
established pattern (`gate-constants-hoist`, `gate-relevance-context`),
still flagged here and re-confirmed via an explicit `tasks.md` checkbox
before `/implement` proceeds. The touch is strictly confined to
instructional prose inside `SYSTEM_PROMPT` — no gate condition,
signal-detection logic, decision schema, or execution path is modified.

## Database Changes

None.

## Open Questions

None.
