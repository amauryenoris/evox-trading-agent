# Design — Hoist 3 Named Gate Constants + gate-importance.ts

## Architecture Decision

This is a pure refactor confined to `src/lib/`. Three existing
function-scoped `const` declarations inside `runAgentCycle()`
(`claude-agent.ts`) are promoted to module scope with `export`, byte-identical
in value. A new standalone file, `src/lib/gate-importance.ts`, is added as a
static, read-only per-setup importance table: it imports the 3 newly-exported
constants for the cells they back, and documents (via comment, not code) the
4 gate thresholds that have no named constant to import. No runtime code path
consumes `gate-importance.ts` yet — this prompt only lays the foundation that
prompt 2/3 will wire into `buildLearningContext()`.

## Data Flow

1. Module load: `claude-agent.ts` evaluates and exports
   `mrRangingAdxFloor = 18`, `trendPullbackMacdFloor = -2.0`,
   `lowAdxMacdBoost = 0.25` at module scope, before `runAgentCycle()` is ever
   invoked.
2. `runAgentCycle()`'s per-symbol loop references the same 3 identifiers as
   before — now resolved via the module-scope closure instead of a
   function-local declaration. No behavior difference: the loop's lexical
   access to these identifiers is unchanged, only their declaration site
   moved outward.
3. Independently, `gate-importance.ts` imports the 3 exported constants and
   defines the static `DIMENSION_IMPORTANCE` table. Nothing in the trading
   cycle imports `gate-importance.ts` at the end of this prompt — it exists
   but is inert.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Hoist the 3 already-named consts to module scope + new static table (this spec) | Minimal Protected Zone touch; zero behavior risk (pure relocation); establishes a real single source of truth for the 3 nameable thresholds | The other 4 table cells remain manually-verified literals, not imports — can silently drift if gate code changes without the table being updated | **Chosen** |
| Also name + extract the 4 currently-unnamed inline thresholds | Every table cell becomes a real import — no manual-verification gap at all | Expands Protected Zone touch well beyond what this prompt authorizes; explicitly out of scope per the instructions driving this series | Rejected |
| Leave the 3 constants function-local; have `gate-importance.ts` duplicate their values as its own literals | Zero `claude-agent.ts` changes at all | Not a genuine shared source of truth — a duplicated literal can silently diverge from the real gate value, defeating the whole point of this step | Rejected |
| Anti-drift via parsing `claude-agent.ts` source text instead of importing | No export/hoist needed | Fragile — breaks on reformatting or comment changes, and was already rejected earlier in this project's diagnostic work as not a "real named constant" import | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Relocate 3 `const` declarations (`mrRangingAdxFloor`, `trendPullbackMacdFloor`, `lowAdxMacdBoost`) from inside `runAgentCycle()` to module scope; add `export` to each. No other line changes. |
| `src/lib/gate-importance.ts` | CREATE | New file: `GateImportance` type, `DIMENSION_IMPORTANCE` table, imports the 3 exported constants, documents the 4 non-importable values via comment exactly as specified in the driving prompt. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` is Protected Zone** per `SDD.md` §17
("Decision pipeline, signal detection, exit rules, position sizing formula")
and `CLAUDE.md`'s file permission matrix. This change touches code adjacent to
signal detection (the declarations feeding the MEAN_REVERSION, TREND_PULLBACK,
and TREND_ZLE05 gates) but is restricted to pure relocation — no condition,
value, or evaluation order changes.

The driving prompt states this specific hoist is pre-authorized by Amaury
("Protected Zone — authorized by Amaury, hoist only"). Per `specs/README.md`
rule 3, Protected Zone touches are still declared here and should get an
explicit go-ahead at `/implement` time — in particular, re-confirming that
the 3 line numbers (1354 / 1380 / 1398, verified live at spec-writing time)
have not drifted, per this prompt's own FAIL FAST clause.

## Database Changes

None.

## Open Questions

- `DIMENSION_IMPORTANCE` mixes 3 cells backed by real imports with 4 cells
  that are manually-verified literals (documented only via comment). Should
  the 4 manual cells eventually get a lightweight "last verified against
  line N on DATE" convention enforced by a test, so future gate-logic changes
  are caught even without extracting them? Relevant to prompt 2/3's
  anti-drift test design — not blocking for this prompt.
- The driving prompt says to place the 3 new exports "near other existing
  module-level exports/imports" without naming an exact anchor line.
  Implementer should choose the least disruptive existing location (e.g.
  near the top-of-file import block) and report exactly where in the
  implementation output.
