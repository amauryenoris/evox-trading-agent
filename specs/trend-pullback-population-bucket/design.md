# Design — TREND_PULLBACK Population Bucket Attribution

## Architecture Decision

This is a pure observability change within the per-symbol analysis loop in `claude-agent.ts`. The `populationBucket` variable lives alongside `zBucket` — both are ephemeral classifications derived from `zScore` at the same point in the loop, and neither escapes the scope. The change adds one `const` declaration and extends one `console.log` call. No new modules, no new types exported, no data layer touched.

## Data Flow

```
Per-symbol loop iteration
  │
  ├─ zScore computed (already exists)
  │
  ├─ zBucket declared (line 1166 — unchanged)
  │   deep_pullback / standard_pullback / shallow_pullback / invalid_z
  │
  ├─ populationBucket declared (NEW — immediately after zBucket)
  │   CONTINUATION (z >= 1.0) / CHOP (0 <= z < 1.0) / PULLBACK (z < 0)
  │
  ├─ trendSetup evaluated (unchanged)
  │
  └─ if trendSetup → [TREND_PULLBACK_ENTRY] log emitted
       symbol=  population=(NEW)  macd=  z=  zBucket=  adx=  regime=
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Add `population=` to `[TREND_PULLBACK_ENTRY]` only | Minimal surface, exact observability goal | None | **Chosen** |
| Add `population=` to `[TREND_PULLBACK_BLOCKED_MACD]` as well | Richer blocked-entry data | Out of scope for this phase; broadens change | Rejected — deferred |
| Export `PopulationBucket` as a named type in `types.ts` | Better TypeScript ergonomics | Adds a type for three log-only strings; over-engineering | Rejected — plain `const` string sufficient |
| Use `zBucket` instead of a new variable | Zero new code | `zBucket` thresholds (deep/standard/shallow) don't align with population buckets | Rejected — different semantics |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | Add `populationBucket` const after `zBucket`; extend `[TREND_PULLBACK_ENTRY]` log |

## Protected Zone Impact

⚠️ `src/lib/claude-agent.ts` is in the Protected Zone.

Change is additive and non-behavioral (logging only), but the file requires Amaury confirmation before `/implement` runs.

## Database Changes

None.

## Open Questions

None — spec is complete and self-contained.
