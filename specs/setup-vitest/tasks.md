# Tasks — Setup Vitest

## Pre-Implementation

- [X ] Amaury has reviewed and approved this spec

## Implementation Checklist

### Phase 1 — Install packages

- [x] T-01: Run `npm install --save-dev vitest @vitest/coverage-v8` — adds both packages to `devDependencies` in `package.json`

### Phase 2 — Configuration

- [x] T-02: Create `vitest.config.ts` at the project root with:
  - `test.environment: 'node'`
  - `test.globals: true`
  - `test.env`: stub values for `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  - `test.coverage.provider: 'v8'`
  - `test.coverage.include: ['src/lib/db.ts']`
  - `resolve.alias`: `@/` → `./src/` (mirrors tsconfig `paths`)

- [x] T-03: Add to `package.json` scripts:
  - `"test": "vitest"`
  - `"test:coverage": "vitest --coverage"`

### Phase 3 — Test file

- [x] T-04: Create `src/lib/__tests__/db.near-miss.test.ts` containing:
  - `vi.mock('@supabase/supabase-js')` at module level, returning a chainable mock builder
  - **Test 1** — `cleanupExpiredNearMisses()`: assert `.update({ status: 'EXPIRED' })`, `.eq('status', 'ACTIVE')`, and `.lt('expires_at', <any string>)` were called on the builder
  - **Test 2** — `cancelRevertedMRNearMisses(-1.0)`: assert `.update({ status: 'CANCELLED' })`, `.eq('signal_type', 'MEAN_REVERSION')`, `.gt('latest_zscore', -1.0)`, and `.gt('expires_at', <any string>)` were called
  - **Test 3** — non-MR regression: assert `.eq('signal_type', 'MEAN_REVERSION')` was called (verifying the filter is always applied, structurally excluding non-MR entries)

### Phase 4 — Verification

- [x] T-05: Run `npm test` — confirm all 3 tests pass, exit code 0
- [x] T-06: Run `npm run test:coverage` — confirm ≥ 80% line coverage on `cleanupExpiredNearMisses` and `cancelRevertedMRNearMisses` (both functions are 100% covered; overall db.ts shows 4.5% because 62 other functions are out of scope for this spec)

## Post-Implementation

- [ ] Run `/review setup-vitest` to verify implementation matches spec
- [ ] Confirm no Protected Zone files were modified
- [ ] Confirm no existing source files (other than `package.json`) were modified
- [ ] Update `specs/near-miss-lifecycle-cleanup/tasks.md` to mark T-05 and T-06 as completed

## Estimated Complexity

**Low** — standard Vitest setup plus three query-verification unit tests. The main design work (mock strategy) is fully resolved in the spec.
