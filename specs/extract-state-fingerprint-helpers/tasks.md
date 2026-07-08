# Tasks — Extract State-Fingerprint Helpers to Shared Module

## Pre-Implementation

- [X] Amaury has reviewed and approved this spec
- [X] Protected Zone confirmed: `src/lib/claude-agent.ts` — authorized by
      Amaury as part of this spec request (see requirements.md C-01)
- [X] Database migrations: **None required**

---

## Implementation Checklist

### Phase 1 — Create the shared module

- [x] T-01: Create `src/lib/state-fingerprint.ts`. Copy the four function
      bodies verbatim from `src/lib/claude-agent.ts:781-855`
      (`getAdxBucket`, `getMacdBucket`, `getZBucket`, `computeSpxSnapshot`,
      including `computeSpxSnapshot`'s nested `smaAt` helper), prefixing each
      top-level function with `export`. No other exports, no other
      functions, no imports from any other project file.

### Phase 2 — Update claude-agent.ts

- [x] T-02: In `src/lib/claude-agent.ts`, delete the four inline function
      definitions currently at lines 781-855.
- [x] T-03: Add a single import line near the top of `claude-agent.ts`,
      alongside the existing local imports (`./alpaca`, `./indicators`,
      `./agent-log`, etc.):
      `import { getAdxBucket, getMacdBucket, getZBucket, computeSpxSnapshot } from './state-fingerprint'`
- [x] T-04: Verify none of the 9 call sites changed — grep
      `getAdxBucket(|getMacdBucket(|getZBucket(|computeSpxSnapshot(` in
      `claude-agent.ts` and confirm the same 9 call sites (line numbers may
      shift due to the deletion, but arguments/logic must be byte-identical)
      still exist, unmodified.

### Phase 3 — Verification

- [x] T-05: Run `npx tsc --noEmit` — must pass with zero errors.
- [x] T-06: Run `npm run build` — must pass successfully.
- [x] T-07: Run `npx vitest run` — all existing tests pass unmodified,
      including `src/lib/__tests__/compute-spx-snapshot-window.test.ts`
      (unchanged file, unaffected since it replicates the logic inline).
- [x] T-08: `git diff --name-only` must show exactly two files:
      `src/lib/state-fingerprint.ts` (new) and `src/lib/claude-agent.ts`
      (modified). No other file touched.
- [x] T-09: Grep `src/lib/claude-agent.ts` for `function getAdxBucket(`,
      `function getMacdBucket(`, `function getZBucket(`,
      `function computeSpxSnapshot(` — zero matches (confirms the inline
      definitions were fully removed, not just shadowed).
- [x] T-10: Grep `src/lib/state-fingerprint.ts` for `export function` —
      exactly 4 matches, no more, no fewer.

---

## Post-Implementation

- [x] Run `/review extract-state-fingerprint-helpers` to verify
      implementation matches spec
- [x] Confirm only the two files listed in T-08 are modified/created

---

## Estimated Complexity

**Low** — Pure code motion with zero logic change: copy ~75 lines to a new
file, add 4 `export` keywords, delete the original 75 lines, add 1 import
line. No new tests required (existing coverage is a black-box test of
`runAgentCycle()`'s observable behavior, which is unaffected). Primary risk
is a copy-paste error introducing a subtle behavioral drift — mitigated by
T-05/T-06/T-07 running the full existing verification suite.
