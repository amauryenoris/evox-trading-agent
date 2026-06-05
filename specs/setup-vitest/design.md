# Design — Setup Vitest

## Architecture Decision

Vitest is added as a dev-only testing layer. The test targets (`cleanupExpiredNearMisses`, `cancelRevertedMRNearMisses`) live in `src/lib/db.ts` and are pure server-side functions — no React, no DOM, no Next.js router involvement. This makes `environment: 'node'` the correct Vitest mode and avoids any conflict with the Next.js App Router.

The only non-trivial challenge is that `db.ts` uses `getClient()`, which calls `createClient()` from `@supabase/supabase-js` and reads env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) at call time. Both concerns are solved without touching `db.ts`:

1. **Env vars**: Set stub values in `vitest.config.ts`'s `test.env` block.  
2. **Client mock**: `vi.mock('@supabase/supabase-js')` intercepts `createClient` before any test runs, returning a chainable mock builder.

## Data Flow

```
npm test
  │
  └─ Vitest picks up vitest.config.ts
       │
       ├─ Sets SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY to stub values
       ├─ Runs src/lib/__tests__/db.near-miss.test.ts
       │
       └─ Test file:
            vi.mock('@supabase/supabase-js')
              └─ mockCreateClient returns chainable builder
                   └─ .from().update().eq().lt()/.gt() → all return builder
                   └─ awaiting chain → { data: null, error: null }
            │
            ├─ Test 1: call cleanupExpiredNearMisses()
            │   assert builder received .update({ status: 'EXPIRED' })
            │   assert .eq('status','ACTIVE') called
            │   assert .lt('expires_at', <timestamp>) called
            │
            ├─ Test 2: call cancelRevertedMRNearMisses(-1.0)
            │   assert builder received .update({ status: 'CANCELLED' })
            │   assert .eq('signal_type','MEAN_REVERSION') called
            │   assert .gt('latest_zscore', -1.0) called
            │
            └─ Test 3: same call — verify non-MR filter
                assert .eq('signal_type','MEAN_REVERSION') was applied
                (ensures non-MR rows are structurally excluded by the query)
```

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|---------|
| Jest | Familiar, widely documented | Slower, requires `ts-jest` or Babel transform, heavier config for ESM | Rejected |
| Vitest | Native ESM + TypeScript, Vite-powered, `vi.mock` API is ergonomic, compatible with this project's module setup | Slightly newer ecosystem | **Chosen** |
| Refactor `db.ts` to inject Supabase client (dependency injection) | Makes functions testable without mocking the module | Modifies existing source files — violates C-02 | Rejected |
| Use a real Supabase test DB | Highest fidelity | Requires network, secrets, and schema setup in test env — violates C-03 and spec constraints | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|-------------|
| `package.json` | MODIFY | Add `vitest`, `@vitest/coverage-v8` to devDependencies; add `test` and `test:coverage` scripts |
| `vitest.config.ts` | CREATE | Root-level Vitest config: Node env, stub env vars, coverage provider |
| `src/lib/__tests__/db.near-miss.test.ts` | CREATE | Three unit tests for `cleanupExpiredNearMisses` and `cancelRevertedMRNearMisses` with Supabase mock |

## Protected Zone Impact

None — this feature does not require Protected Zone changes.

## Database Changes

None.

## Supabase Mock Strategy

`getClient()` in `db.ts` calls `createClient(url, key)`. The mock intercepts at the module level:

```
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabaseClient
}))
```

`mockSupabaseClient` is a Vitest spy object where each fluent method (`.from`, `.update`, `.eq`, `.lt`, `.gt`) returns `this` (the same mock), and the final awaitable chain resolves to `{ data: null, error: null }`.

**Spy strategy for verification**: Since these are bulk UPDATE queries (not per-row), the tests verify that the correct filters were passed to the builder — not the resulting rows. The mock records all calls to `.update()` and `.eq()`, allowing `expect(mockUpdate).toHaveBeenCalledWith({ status: 'EXPIRED' })` etc.

## Open Questions

None.
