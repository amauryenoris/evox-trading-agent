# Design — Fix Stale Line-Number References in gate-importance.ts

## Architecture Decision

This is a documentation-accuracy fix confined to a single comment block in
one non-Protected-Zone file, `src/lib/gate-importance.ts`. No architecture,
data flow, or runtime behavior is affected — `gate-importance.ts` is not
yet imported anywhere (per `gate-constants-hoist`'s design, wiring is
reserved for prompt 2/3), so this change has zero blast radius beyond the
comment's own readability/trustworthiness.

## Data Flow

Not applicable — no data flows through this change. It is a static-text
edit inside a comment block that documents (for human/future-AI readers)
where 4 unnamed gate thresholds live in `claude-agent.ts`.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Correct the 4 line numbers + date stamp in place (this spec) | Minimal, precise, zero risk; restores the comment to a trustworthy state | Will go stale again on the next edit above these lines — doesn't solve the class of problem | **Chosen** |
| Also add the "last verified against line N on DATE" self-checking convention (from `gate-constants-hoist`'s open question) now | Solves staleness permanently | Expands scope beyond "fix the 4 numbers" into designing/implementing an anti-drift mechanism — that's prompt 2/3 or its own follow-up, not this fix | Rejected (deferred) |
| Remove the line-number citations entirely, keep only the semantic description | Never goes stale | Loses a genuinely useful pointer for the next person auditing these 4 manually-verified cells | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/gate-importance.ts` | MODIFY | Update 4 stale line-number citations (1350→1355, 1359-1360→1362-1363, 1455→1456) and the "as of" date stamp inside the existing sourcing comment. No other text, code, import, or export changes. |

## Protected Zone Impact

None — `src/lib/gate-importance.ts` is not listed in `CLAUDE.md`'s file
permission matrix or `SDD.md` §17. This feature does not require Protected
Zone changes.

## Database Changes

None.

## Open Questions

None for this fix. The broader question of making this class of comment
self-verifying (raised in `gate-constants-hoist`'s design.md) remains open
for prompt 2/3 or a dedicated follow-up — not blocking this correction.
