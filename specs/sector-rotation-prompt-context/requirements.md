# Requirements — Sector Rotation Prompt Context

## Functional Requirements

FR-01: The system shall compute the 20-trading-day relative-strength percentage of GDX, XLE, and XLK against SPY once per agent cycle.

FR-02: The system shall compute relative strength as (sector's 20-day % return) minus (SPY's 20-day % return), independently for each of GDX, XLE, and XLK.

FR-03: The system shall use the second-to-last bar (`bars.length - 2`) as the current reference close when computing 20-day returns, excluding the current-day partial bar from the calculation.

FR-04: The system shall return `null` for a sector's relative strength when that sector's bar history contains fewer than 22 bars (20-day lookback + 2).

FR-05: The system shall return `null` for all three sectors' relative strength when SPY's own 20-day return cannot be computed.

FR-06: The system shall format the sector rotation snapshot as a plain-text, multi-line string listing GDX, XLE, and XLK, following the same construction and empty-data-handling conventions already used for `macroContext`.

FR-07: Where a sector's relative strength is `null`, the system shall render that sector's line as "no data" rather than omitting the sector from the text.

FR-08: The system shall fetch daily bars for GDX, XLE, and XLK once per cycle, using the same `getBars(symbol, '1Day', 400)` call shape already used for SPY.

FR-09: The system shall continue the cycle using an empty bars array for any of GDX, XLE, XLK, or SPY whose fetch fails, without throwing or aborting the cycle.

FR-10: The system shall log the computed sector rotation snapshot once per cycle for observability.

FR-11: The system shall pass the formatted sector rotation text into `buildEnrichedPrompt()` as a new, optional, trailing parameter that defaults to an empty string.

FR-12: The system shall render a "SECTOR ROTATION" section in the per-symbol prompt only when the sector rotation text is non-empty, following the same non-empty conditional convention already used for `watchlistContext`.

FR-13: Where the sector rotation section is rendered, the system shall place it between the "MACRO & MARKET CONTEXT" section and the "RECENT NEWS FOR {symbol}" section of the prompt template.

FR-14: The system shall NOT use sector rotation data to block, filter, or alter any deterministic execution gate, signal-detection condition, or position-sizing calculation — it shall only appear as prompt text for Claude's reasoning.

## Non-Functional Requirements

NFR-01: The sector rotation calculation functions shall be pure (no I/O, no side effects) and unit-testable in isolation, matching the precedent set by `computeSpxSnapshot()`.

NFR-02: The new `src/lib/sector-rotation.ts` module shall not import from or modify `state-fingerprint.ts`, preserving that file's existing narrow scope.

NFR-03: The change shall not alter the argument list, order, or types of any existing call site of `buildEnrichedPrompt()` beyond appending one new optional parameter.

## Constraints

C-01: This feature modifies `src/lib/claude-agent.ts`, a Protected Zone file. Amaury has already authorized this change explicitly for this feature (per the originating request).

C-02: `src/lib/sector-rotation.ts` is a new file outside the Protected Zone list and may be created freely.

C-03: No deterministic/blocking logic may be introduced anywhere as part of this feature — confirmed scope is prompt-text-only influence.

C-04: The new `sectorRotationContext` parameter must be optional with a safe default, so the single existing call site of `buildEnrichedPrompt()` continues to compile and behave identically if left unmodified.

## Out of Scope

- Adding GDX/XLE/XLK relative strength to `trade_evaluations` / `state_fingerprint` persistence (the precedent `spx_regime` field uses a different, indirect injection path via `buildLearningContext()` and is not being replicated here).
- Any dashboard/UI surface for sector rotation data.
- Using sector rotation as an input to `learning.ts` pattern evaluation.
- Configurable lookback period (hardcoded at 20 trading days) or configurable sector list (hardcoded at GDX/XLE/XLK).
- Backfilling or caching sector bars across cycles — bars are fetched fresh each cycle, same as SPY.
