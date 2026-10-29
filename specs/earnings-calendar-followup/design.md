# Design — Earnings Calendar Follow-up: Snapshot Wiring (T-17) + Migration File Alignment

## Architecture Decision

`learning-context.ts` already accepts an optional `earnings` flag, writes it into the snapshot and builds the prompt line (tested in `learning-context-earnings.test.ts`). The only missing link is the plumbing between the cycle and that function: the type that `buildLearningContext` receives in `learning.ts` has no `earnings` property, and the call at `claude-agent.ts:2256` does not pass the flag that the gate computed a few lines earlier (`earningsFlag`, `claude-agent.ts` just above the `signalType === null` check). `buildLearningContext` already spreads its input into `buildSetupLearningBlock`, so adding the optional type property is enough to forward the value. No new logic is added.

## Data Flow

1. The earnings gate evaluates `earningsFlag` for the symbol. A blocked symbol stops there; any other symbol continues.
2. The cycle calls `buildLearningContext({ setup, symbol, indicators, asOf, earnings: earningsFlag })`.
3. `buildLearningContext` spreads the input into `buildSetupLearningBlock`.
4. `buildSetupLearningBlock` adds the prompt line (status `OK`, within 5 trading days) and stores `earnings` in the snapshot.
5. The snapshot is saved in `indicators_at_buy.learningContext` by both BUY paths (single and ranked best), unchanged.

`earningsFlag` always exists at this point because the gate runs for every symbol that reaches the learning context. When the cache is unavailable the context already returns `UNKNOWN` or `STALE` with null fields and never throws (`earnings-gate-context.ts` catches the loader errors), so no extra guard is needed.

## The Two Protected Zone Lines

```diff
 // src/lib/claude-agent.ts (call at ~2256)
         asOf: timestamp,
+        earnings: earningsFlag,
       })

 // src/lib/learning.ts (LearningContextInput)
   asOf: string
+  earnings?: EarningsFlag
 }
```

`learning.ts` also needs `import type { EarningsFlag } from './earnings-window'` for the property to compile (see O-1).

## Migration File

`specs/earnings-calendar/migration.sql` becomes the DDL the owner applied (the schema-qualified table, `session` with default `'UNKNOWN'`, index, RLS on with no policy, grants to `anon`, `authenticated` and `service_role`). The earlier draft's `CREATE POLICY` is removed, which closes review finding M-3 (the table is now deny-all for the Data API, like the other tables).

Column and type check against the code (static read of `db-earnings.ts` and the sync script):

| Column | DDL type | Code writes / reads |
|---|---|---|
| `symbol` | text | trimmed, upper-cased string |
| `report_date` | date | `YYYY-MM-DD` string; filters `eq`, `gte`, `lt`, `order` |
| `session` | text, check BMO/AMC/UNKNOWN | `BMO`, `AMC` or `UNKNOWN`, always set by the sync |
| `fetched_at` | timestamptz | ISO-8601 string on write; read back as a timestamp string |

The sync always sends all four columns, so the new `DEFAULT 'UNKNOWN'` is not used by the code; it only protects manual inserts. No code change is expected; the check is repeated in the implementation report.

## Tests

- **Wiring through `buildLearningContext`** (`learning.ts`, with `getTradeEvaluations` mocked as in `pattern-library-min-sample-gate.test.ts`): the `earnings` input appears in the returned snapshot and, for `OK` within 5 days, as the prompt line; for `UNKNOWN`/`STALE` there is no line and no throw; without `earnings` the text and keys are as before.
- **Chain from the pure gate**: `evaluateEarningsGate` result for each status fed to `buildLearningContext`.
- **Call-site mapping** in `claude-agent.ts` cannot be unit tested without running a full cycle. The coverage is the one-line diff, `tsc` (the property type must match `EarningsFlag`) and the first-live-day checklist (snapshot carries `earnings`). This is stated, not hidden.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Optional `earnings` on `LearningContextInput` | One property per file; matches authorization | Needs a type import in `learning.ts` | Chosen |
| Re-evaluate the gate inside `buildLearningContext` | No call-site change | Second DB read; duplicates the gate | Rejected |
| Append the earnings line in `claude-agent.ts` after the block is built | No `learning.ts` edit | More logic in the engine; line could be trimmed or duplicated; snapshot not updated | Rejected |
| Bump snapshot to version 4 | Explicit schema | Readers and `buildPatternIds` change; not requested | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `src/lib/learning.ts` | MODIFY ⚠️ | Optional `earnings` property on `LearningContextInput`, plus its type import |
| `src/lib/claude-agent.ts` | MODIFY ⚠️ | `earnings: earningsFlag` at the `buildLearningContext` call |
| `src/lib/__tests__/learning-context-earnings.test.ts` | MODIFY | Add wiring tests (or a new `learning-earnings-wiring.test.ts` if mocking needs its own file) |
| `specs/earnings-calendar/migration.sql` | MODIFY | Replace with the applied DDL |
| `specs/earnings-calendar/tasks.md` | MODIFY | Untick/annotate migration line; tick T-17 |

## Protected Zone Impact

⚠️ Authorized by Amaury in the CHANGE text (O-3 = yes), limited to:
- `learning.ts`: one optional property on the input type.
- `claude-agent.ts`: one property at the existing `buildLearningContext` call.
Other Protected Zone files: untouched.

## Database Changes

None. The migration file is aligned to what is already applied; nothing is applied by this change.

## Open Questions

- **O-1** The property needs a `import type { EarningsFlag } from './earnings-window'` line in `learning.ts`, which is a second line in a Protected file. Default: **allowed** as part of the one property (a type-only import, no runtime effect). If not allowed, the alternative is an inline structural type, which duplicates the shape.
- **O-2** The `earnings-calendar` tasks file marks `migration.sql` as reviewed and applied. Default: untick and annotate as requested, then tick T-17 once done.
