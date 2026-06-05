# Requirements — Setup Vitest

## Functional Requirements

FR-01: The project shall have `vitest` and `@vitest/coverage-v8` installed as devDependencies in `package.json`.

FR-02: The project shall have a `vitest.config.ts` file at the project root that configures Vitest for a Node execution environment with TypeScript support.

FR-03: The `package.json` scripts section shall contain a `"test"` script that runs `vitest`.

FR-04: The `package.json` scripts section shall contain a `"test:coverage"` script that runs `vitest --coverage`.

FR-05: The test suite shall contain a test case that verifies `cleanupExpiredNearMisses()` marks an ACTIVE entry as `EXPIRED` when that entry's `expires_at` is earlier than the current time.

FR-06: The test suite shall contain a test case that verifies `cancelRevertedMRNearMisses(threshold)` marks an ACTIVE `MEAN_REVERSION` entry as `CANCELLED` when that entry's `latest_zscore` is greater than `threshold` and `expires_at` is later than the current time.

FR-07: The test suite shall contain a test case that verifies `cancelRevertedMRNearMisses(threshold)` does not mark an ACTIVE non-`MEAN_REVERSION` entry as `CANCELLED` when that entry's `latest_zscore` is greater than `threshold`.

FR-08: The test suite shall use a mock Supabase client — no real Supabase connections shall be made during test execution.

FR-09: `npm test` shall exit with code 0 (all tests pass) after implementation.

## Non-Functional Requirements

NFR-01: Each test case shall follow the Arrange-Act-Assert pattern.

NFR-02: `npm run test:coverage` shall report ≥ 80% line coverage on `cleanupExpiredNearMisses` and `cancelRevertedMRNearMisses` in `src/lib/db.ts`.

NFR-03: The Vitest configuration shall not conflict with the existing `next build` or `tsc --noEmit` commands.

## Constraints

C-01: This feature must not modify any Protected Zone file.

C-02: No existing source files shall be modified except `package.json` (to add scripts and devDependencies).

C-03: The Supabase mock shall use Vitest's `vi.mock()` — no real `@supabase/supabase-js` client instantiation shall occur in tests.

C-04: Environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` required by `getClient()` shall be satisfied in the test environment without modifying `src/lib/db.ts`.

## Out of Scope

- Tests for any `db.ts` functions other than `cleanupExpiredNearMisses` and `cancelRevertedMRNearMisses`.
- Tests for `watchlist-monitor.ts` or any other source file.
- Integration or end-to-end tests against a real database.
- CI/CD pipeline changes (`.github/workflows/`).
- Coverage enforcement via CI gates.
