# Requirements — Extract State-Fingerprint Helpers to Shared Module

## Background

`getAdxBucket`, `getMacdBucket`, `getZBucket`, and `computeSpxSnapshot` are
four pure, side-effect-free functions currently defined inline in
`src/lib/claude-agent.ts` (lines 781-855), used only within `runAgentCycle()`
to build state-fingerprint and SPX-snapshot data at BUY time. None are
exported. A future standalone script (the Position Health Monitor) needs to
call these same four functions without duplicating their logic or importing
from `claude-agent.ts` directly. This spec extracts them into a new shared
module, `src/lib/state-fingerprint.ts`, with no behavior change.

## Functional Requirements

FR-01: The system shall export a function `getAdxBucket` from
`src/lib/state-fingerprint.ts` with the identical signature and logic as the
current inline definition in `claude-agent.ts`.

FR-02: The system shall export a function `getMacdBucket` from
`src/lib/state-fingerprint.ts` with the identical signature and logic as the
current inline definition in `claude-agent.ts`.

FR-03: The system shall export a function `getZBucket` from
`src/lib/state-fingerprint.ts` with the identical signature and logic as the
current inline definition in `claude-agent.ts`.

FR-04: The system shall export a function `computeSpxSnapshot` from
`src/lib/state-fingerprint.ts` with the identical signature and logic as the
current inline definition in `claude-agent.ts`.

FR-05: The system shall export exactly these four names from
`src/lib/state-fingerprint.ts` — no additional functions, constants, or
re-exports.

FR-06: The system shall remove the four inline function definitions from
`src/lib/claude-agent.ts` (current lines 781-855).

FR-07: The system shall import `getAdxBucket`, `getMacdBucket`, `getZBucket`,
and `computeSpxSnapshot` into `src/lib/claude-agent.ts` from
`./state-fingerprint` via a single import statement.

FR-08: Where any of the four functions is called at an existing call site in
`claude-agent.ts` (the 1 `computeSpxSnapshot` call, 2 `getAdxBucket` calls, 2
`getMacdBucket` calls, and 4 `getZBucket` calls), the system shall preserve
the exact arguments and surrounding logic at that call site unchanged.

FR-09: The system shall produce identical output from each of the four
functions, given identical input, before and after the extraction.

## Non-Functional Requirements

NFR-01: The extraction shall not alter the runtime behavior of
`runAgentCycle()` in any observable way (identical decisions, identical
logged values, identical control flow).

NFR-02: `src/lib/state-fingerprint.ts` shall have no dependency on
`claude-agent.ts`, `db.ts`, or any Alpaca/Supabase/Anthropic client — it must
be importable standalone by a future script with no side-effecting
dependencies.

## Constraints

C-01: `src/lib/claude-agent.ts` is in the Protected Zone. Authorization for
this change is granted by Amaury as part of this spec request.

C-02: `src/lib/__tests__/compute-spx-snapshot-window.test.ts` must not be
modified — it replicates `computeSpxSnapshot` inline per the project's
decoupled-test convention and does not import from either `claude-agent.ts`
or the new module.

C-03: No other file, gate, signal-detection rule, or exit-rule logic may be
touched.

C-04: `tsc --noEmit` zero errors, `npm run build` clean, all existing tests
pass unmodified.

## Out of Scope

- Any logic change, refactor, or "improvement" to the four functions during
  the move.
- The Position Health Monitor feature itself (separate, later spec).
- Any new test file for `state-fingerprint.ts` (not requested by this spec;
  existing coverage via `runAgentCycle()`'s existing tests and
  `compute-spx-snapshot-window.test.ts` is unaffected and sufficient for a
  pure mechanical move).
- Adding `export` to any other function in `claude-agent.ts`.
