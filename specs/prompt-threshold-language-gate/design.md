# Design — Gate MEAN_REVERSION-Specific Threshold Language Behind signalType (Part B)

## Architecture Decision

This lives entirely inside the prompt-construction layer already touched by Part A: `src/lib/claude-agent.ts`. Two independent pieces of shared prompt text — the Kalman `Z-Score:` threshold annotation and the `NEWS-ADJUSTED THRESHOLD` block — both currently render unconditionally regardless of `signalType`, even though the thresholds they describe (`ZSCORE_ENTRY_THRESHOLD`, `effectiveThreshold`) only govern `MEAN_REVERSION`'s actual entry gate. The fix keeps `kalmanLabel()` a pure data-formatting function (no knowledge of setup types) by giving it a new optional parameter for the annotation text, with the caller (`buildEnrichedPrompt()`) deciding — based on `signalType`, which it already has in scope — whether to supply it. The news-adjusted-threshold block gets a second condition added directly at its existing ternary.

## Data Flow

1. `runAgentCycle()` computes `signalType` and `effectiveThreshold` (already shipped; out of scope here).
2. Both are passed into `buildEnrichedPrompt(..., effectiveThreshold, signalType, ...)` as parameters #9 and #10.
3. At line 734, the call becomes `kalmanLabel(indicators.kalman, signalType === 'MEAN_REVERSION' ? \`entry threshold: < ${ZSCORE_ENTRY_THRESHOLD} | exit threshold: >= -0.8\` : undefined)`.
4. Inside `kalmanLabel()`, the new `zscoreAnnotation?: string` parameter is appended to the `Z-Score:` line only if truthy: `` `Z-Score: ${kalman.zScore.toFixed(3)}${zscoreAnnotation ? ` (${zscoreAnnotation})` : ''}` ``. The other 4 lines (`Fair Value Estimate`, `Forecast Error e(t)`, `Error Std Dev Q(t)`, `Signal`) are untouched.
5. At lines 774-777, the existing ternary condition `effectiveThreshold !== undefined && effectiveThreshold !== ZSCORE_ENTRY_THRESHOLD` gains a leading `signalType === 'MEAN_REVERSION' &&` clause.
6. Both edits are independent of Part A's ACTIVE SETUP TYPE chain (lines 778-798), which is unaffected and unread by either change.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Optional `zscoreAnnotation` parameter on `kalmanLabel()`, caller decides via `signalType` (as specified) | Keeps `kalmanLabel()` setup-agnostic (single responsibility: format raw Kalman facts); annotation placement stays exactly where it is today, attached to the `Z-Score:` line; minimal diff | `kalmanLabel()`'s signature grows by one parameter | Chosen — matches the explicit user-approved design decision; correct separation of concerns (data formatting vs. signalType-aware business logic) |
| Move the `signalType` check inside `kalmanLabel()` itself (pass `signalType` directly) | Slightly shorter call site | `kalmanLabel()` would need to know what `'MEAN_REVERSION'` means — couples a pure formatting function to signal-type business logic, the opposite of Part B's goal | Rejected |
| Leave `kalmanLabel()` unchanged; post-process/string-replace the annotation out of its output at the call site for non-MR setups | No signature change | Fragile string surgery on a formatted block; harder to verify correctness than a parameter; against NFR-01's spirit | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/claude-agent.ts` | MODIFY | (1) `kalmanLabel()` signature (lines 675-690): add optional `zscoreAnnotation?: string` parameter, used only in the `Z-Score:` line. (2) Call site (line 734): pass the annotation conditionally on `signalType === 'MEAN_REVERSION'`. (3) News-adjusted-threshold block (lines 774-777): add `signalType === 'MEAN_REVERSION' &&` to the existing condition. No other line changes. |

## Protected Zone Impact

⚠️ **Requires Amaury confirmation before implementation.** `src/lib/claude-agent.ts` is listed in `CLAUDE.md` under "Confirm with Amaury before touching." As with Part A, the task description's claimed authorization ("authorized by Jorge, confirmed this session") does not substitute for Amaury's own confirmation given directly in this conversation — see [[feedback_protected_zone_authorization]], which specifically notes that Part A's authorization does not carry over to Part B, a separate change to the same file. `/implement` should not proceed until that confirmation is obtained here.

## Database Changes

None.

## Open Questions

- Confirm with Amaury: same as Part A — is the "authorized by Jorge, confirmed this session" claim acceptable as-is, or does Amaury want to confirm this specific change directly before `/implement` runs?
- None on the technical approach — the design decision was pre-approved in the task description itself and is low-ambiguity: extend `kalmanLabel()` with one optional parameter, add one `&&` clause to one existing ternary.
