# Design — Add mrRiskFactors Persisted Observability Tagging

## Architecture Decision

Two-file change. `src/lib/types.ts` gains one new optional field on `TechnicalIndicators`. `src/lib/claude-agent.ts`'s `runAgentCycle()` computes `mrRiskFactors` once, immediately after `meanReversionSetup` (~line 1701), following the exact ternary-array shape the CHANGE prompt specifies (reusing `hasValidAdx`, `adxValue`, `mrRangingAdxFloor`, `indicators.marketRegime`, `indicators.distanceToEma50Pct` — all already in scope, zero new computation). Because `mrRiskFactors` becomes a first-class typed field, it can be attached anywhere `indicators` flows into a persisted entry via a plain conditional-spread (`...(mrRiskFactors !== null && { mrRiskFactors })`), matching the existing pattern already used for `learning_note`/`near_miss_score`/`what_would_trigger`/`self_flagged_disqualifying_risk` at the `indicatorsWithLearning` construction (~lines 2282-2290) — no unsafe cast needed anywhere, unlike the ad-hoc `would_execute`/`errors` fields used at two other sites (see "Existing precedent" below).

## Correction / expansion of the CHANGE prompt's assumed scope

The CHANGE prompt's SCOPE item 3 says: *"find the existing object construction (do not assume a line number; locate it) and add the field there"* — phrased as if exactly one site exists. Verified directly against the current file: **`indicators` (the object looked up once per symbol from `indicatorsCache` at ~line 1581) flows into at least seven distinct `decisions.push()` / `buyQueue.push()` call sites within a single symbol's loop iteration**, depending on which gate or path that symbol's evaluation takes that cycle. This matters because `mrRiskFactors` is computed once (~line 1701) but a symbol's evaluation can exit the loop through any of several different branches afterward — and only some of those branches build their pushed `indicators:` field from a spread/copy that could carry `mrRiskFactors` forward; others use the raw, unmodified `indicators` reference, and would silently drop `mrRiskFactors` if it isn't explicitly threaded in at each site.

### The seven sites, and which are reachable when `meanReversionSignal === true`

| # | Site | Location | Current `indicators` handling | Reachable w/ `meanReversionSignal===true`? |
|---|------|----------|-------------------------------|---------------------------------------------|
| 1 | `EMA_RECLAIM_NEAR` early-exit | ~1902-1915 | plain `indicators,` (unspread) | **Rare, yes** — if `emaReclaimNearMiss` also happens to be true and this check runs before the MR gate check (sequentially earlier in the function). See analysis below. |
| 2 | `TREND_QUALITY_FAIL` early-exit | ~1917-1932 | plain `indicators,` (unspread) | **Rare, yes** — if `(isPullbackCandidate \|\| isZLE05Candidate) && !trendQualityOk` also happens to be true and runs first. See analysis below. |
| 3 | `MR_RANGING_ADX_GATE` blocked | ~1937-1951 | plain `indicators,` (unspread) | **Yes, always** (when reached) — `mrGateBlocked = meanReversionSignal && !mrRangingAdxGateOk`; this branch is unreachable with `meanReversionSignal===false`. **This is the population the Context explicitly cites as the reason for this feature.** |
| 4 | Generic "no setup" | ~1953-1964 | plain `indicators,` (unspread) | **No** — proven below: inside `if (!setup_detected)`, if `meanReversionSignal` were true, `mrRangingAdxGateOk` must be false (else `meanReversionSetup`, and therefore `setup_detected`, would be true), so site 3's `continue` always fires first. `mrRiskFactors` is `null` here regardless — no change needed. |
| 5 | `max_positions` gate (post-Claude-call) | ~2043-2059 | `{ ...indicators, would_execute: false, errors: [...] } as unknown as TechnicalIndicators` | **Yes** — only reachable once `setup_detected===true`; if the setup was MR, `meanReversionSetup` (and therefore `meanReversionSignal`) was true. |
| 6 | `max_buys` gate (post-Claude-call) | ~2061-2077 | same pattern as #5 | **Yes** — same reasoning as #5. |
| 7 | Happy-path `indicatorsWithLearning` | ~2282-2290 | `{ ...indicators, effectiveThreshold, newsAdjustment, ...(conditional spreads) }` | **Yes** — the "normal" successful-evaluation path; also covers the downstream buy-queue ranking reuse (`best.entry`/`rejected.entry` at ~2352-2471 just reuse this same `entry.indicators` — confirmed no separate site needed there). |

**Sites 1 and 2 — precise reachability analysis**: both are `if (... && !setup_detected) { ...; continue }` blocks that run *before* the `if (!setup_detected) { const mrGateBlocked = ... }` block (site 3) in the function's sequential order. `setup_detected = isAutoEntry || meanReversionSetup || trendSetup || trendZLE05Setup || emaReclaimSetup || trendPullback3DaySetup`. A symbol can have `meanReversionSignal === true` with `meanReversionSetup === false` (gate-blocked) while `setup_detected` is still false overall (no other setup type fired either) — in that state, if `emaReclaimNearMiss` (site 1) or `(isPullbackCandidate || isZLE05Candidate) && !trendQualityOk` (site 2) also happens to be true for the same symbol on the same bar, that block's `continue` fires first, and the symbol never reaches site 3's `mrGateBlocked` check at all. This is a genuine, if narrow, overlap window — not a hypothetical.

### Recommended mandatory scope vs. flagged additions

Given the size of this discovered surface, this design proposes a **minimal-but-complete mandatory scope covering sites 3 and 7** — the two the Context text itself describes (the RANGING+LOW_ADX-blocked population, and the normal path) — and flags sites 5/6 and 1/2 separately rather than silently expanding the diff beyond what the CHANGE prompt anticipated. See **Open Questions** below.

## Data Flow

1. `indicatorsCache.get(symbol)` (~line 1581) returns the shared `TechnicalIndicators` object for this symbol — read-only for this feature; **never mutated in place** (per `CLAUDE.md`'s immutability rule).
2. `meanReversionSignal` (~1682), `hasValidAdx` (~1689-1691), `adxValue` (~1649), `mrRangingAdxGateOk` (~1693-1699), and `meanReversionSetup` (~1701) are computed, in that order, using the existing logic — untouched.
3. **New**: immediately after line 1701, `mrRiskFactors` is computed as a `string[] | null` local `const`, per the CHANGE prompt's exact expression (reusing `hasValidAdx`, `adxValue`, `mrRangingAdxFloor`, `indicators.marketRegime`, `indicators.distanceToEma50Pct` — no new inputs).
4. `mrRiskFactors` stays in scope for the rest of this symbol's `try` block (same loop iteration), available at every downstream site listed in the table above.
5. At site 3 (MR_RANGING_ADX_GATE blocked, ~1940-1949) and site 7 (`indicatorsWithLearning`, ~2282-2290): the `indicators:` field changes from a plain reference (site 3) or an existing spread (site 7) to include `...(mrRiskFactors !== null && { mrRiskFactors })`, appended to the existing conditional-spread list at site 7, or wrapping the previously-plain `indicators` reference in `{ ...indicators, ...(mrRiskFactors !== null && { mrRiskFactors }) }` at site 3.
6. `insertAgentLogEntry()` (`db.ts:34-51`) persists `entry.indicators` (now potentially including `mrRiskFactors`) into the `agent_log.indicators` JSONB column, unchanged — no new column, no migration.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Add `mrRiskFactors` as a genuine typed field on `TechnicalIndicators` (per CHANGE SCOPE item 1) | No unsafe cast needed anywhere it's attached; self-documenting; matches `AgentLogEntry.indicators: TechnicalIndicators`'s existing typed-JSONB pattern | One new optional field on an already-large interface | **Chosen** — exactly what the CHANGE prompt specifies, and cleanly avoids the `as unknown as TechnicalIndicators` pattern seen at sites 5/6 |
| Follow `emaReclaimRiskFactors`'s console.log-only, pipe-joined-string convention instead | Zero schema change, matches the one existing precedent literally | Not queryable from Supabase later — defeats the Context's stated purpose ("accumulate real n for Phase 3 gate validation"); already rejected by the user's explicit decision this session (see Context) | Rejected — per user decision already recorded in the Context |
| Attach `mrRiskFactors` at all 6 relevant sites (3, 5, 6, 1, 2, 7) in one pass, for maximal completeness | Most accurate n; no silent undercounting anywhere | Expands the diff well beyond "add the field... at [one] existing object construction"; touches 2 more Protected-Zone-file locations than anticipated, some requiring restructuring a plain reference into a spread | Partially rejected — sites 3 and 7 chosen as mandatory; sites 5/6 and 1/2 deferred to an explicit Open Question rather than assumed |
| Mutate the cached `indicators` object directly (`indicators.mrRiskFactors = [...]`) instead of threading a separate `const` through each site | Fewer lines touched at each push site (no per-site spread needed) | Violates `CLAUDE.md`'s immutability rule ("return new objects, never mutate in-place"); mutates a `Map`-cached object that other code may read later in the same cycle for unrelated purposes | Rejected — matches the CHANGE prompt's own choice to write `const mrRiskFactors = ...` as a separate local, not `indicators.mrRiskFactors = ...` |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/types.ts` | MODIFY | `TechnicalIndicators` gains `mrRiskFactors?: string[] \| null`. No other field changed. |
| `src/lib/claude-agent.ts` | MODIFY | New `const mrRiskFactors = ...` immediately after `meanReversionSetup` (~1701). `indicators:` field updated at the MR_RANGING_ADX_GATE-blocked push (~1940-1949) and the `indicatorsWithLearning` construction (~2282-2290) to include `mrRiskFactors` via conditional spread. No other lines changed pending the Open Questions below. |

## Protected Zone Impact

⚠️ **`src/lib/claude-agent.ts` IS in `CLAUDE.md`'s Protected Zone.** Implementation must not begin until Amaury gives fresh, explicit, in-conversation confirmation to touch this file — this gate applies regardless of the change being observability-only and low-risk. `src/lib/types.ts` is separately listed as "Touch freely" and needs no such confirmation.

## Database Changes

None. `mrRiskFactors` rides in the already-persisted `agent_log.indicators` JSONB column — no migration, no new table, no new column.

## Open Questions

1. **Should `mrRiskFactors` also be attached at the `max_positions` (~2043-2059) and `max_buys` (~2061-2077) gate-blocked push sites?** These represent a genuine `meanReversionSetup === true` (hence `meanReversionSignal === true`) evaluation that passed the RANGING/ADX gate but was blocked by an unrelated portfolio-capacity gate afterward. Recommended: **yes, include** — same conditional-spread pattern, low incremental risk, improves n-accuracy. Needs Amaury's go-ahead since it's beyond the CHANGE prompt's literal single-site description.
2. **Should `mrRiskFactors` also be attached at the rare `EMA_RECLAIM_NEAR` (~1902-1915) and `TREND_QUALITY_FAIL` (~1917-1932) intercept sites?** These only matter for the narrow case where a `meanReversionSignal===true`, gate-blocked symbol is *also* a near-miss/quality-fail candidate for a different setup type on the same bar. Recommended: **document as an accepted gap, do not implement** — low frequency, and covering it requires restructuring two currently-plain `indicators,` references into spread objects for marginal n-accuracy gain. Needs Amaury's confirmation either way before implementation, since silently leaving it out is itself a scope decision.

Neither question blocks writing this spec, but **both must be answered before `/implement` proceeds**, since the answer changes exactly which lines in `claude-agent.ts` get touched.
