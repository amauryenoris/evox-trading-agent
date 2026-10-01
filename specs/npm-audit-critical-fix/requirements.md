# Requirements — Clear the Critical npm audit Finding Blocking CI

## Background

**Empirically confirmed live** (2026-09-30, this session) via the GitHub Actions API: `agent-cron.yml` run #909 (`2026-09-30T14:50:05Z`) succeeded; runs #910, #911, #912 (`17:31:12Z`, `18:54:41Z`, `19:07:34Z`) all failed. Each failing run's job breakdown shows `Security audit` (`.github/workflows/agent-cron.yml:49-50`, `run: npm audit --audit-level=critical`) as the failing step, with `Run agent cycle` skipped immediately after — matching the context's claim exactly. The identical `npm audit --audit-level=critical` gate exists in 5 workflows total (`agent-cron.yml`, `agent-exits.yml`, `daily-bars-sync.yml`, `position-health.yml`, `weekly-report.yml`) — all are equally blocked right now, not just the trading cycle. All 5 use `npm ci`, so committing an updated `package.json`/`package-lock.json` is sufficient for every one of them to install the patched versions on their next run — no workflow file changes needed.

**Live `npm audit` output** (run this session, read-only):

| Package | Severity | Fix |
|---|---|---|
| `next` | **critical** | `npm audit fix` (no `--force`) |
| `brace-expansion` | high | `npm audit fix` (no `--force`) |
| `@anthropic-ai/sdk` | moderate | `npm audit fix --force` → **0.130.0, `isSemVerMajor: true`** |
| `vitest` | moderate | `npm audit fix` (no `--force`, per npm's own text) |
| `@vitest/mocker` | moderate | `npm audit fix` (no `--force`, per npm's own text) |
| `@vitest/coverage-v8` | moderate | `npm audit fix` (no `--force`, per npm's own text) |
| `esbuild` | **low** | `npm audit fix` (no `--force`, per npm's own text) |

One correction to the context's framing, confirmed via live `npm audit --json`: `esbuild`'s finding is **low** severity, not moderate as grouped in the original request. This doesn't change any ALLOWED/FORBIDDEN boundary — it's still non-major and not the SDK — noted here only for accuracy.

**Currently installed** (`npm ls`, live): `next@16.3.4`, `@anthropic-ai/sdk@0.80.0`, `vitest@4.1.8`, `esbuild@0.27.4` (via `tsx`→and `vitest`→`vite`, deduped), `brace-expansion@5.0.9` (via `eslint-config-next`→`typescript-eslint`→`minimatch`) and `brace-expansion@1.1.18` (via `eslint`→`minimatch`).

**`npm audit fix --dry-run` output** (run this session, read-only — confirmed zero file changes via before/after SHA-256 of `package.json`/`package-lock.json`):

```
change brace-expansion 5.0.9 => 5.0.12
change @next/swc-win32-x64-msvc 16.3.4 => 16.3.8
change @next/env 16.3.4 => 16.3.8
change next 16.3.4 => 16.3.8
change brace-expansion 1.1.18 => 1.1.21
```

This is the critical finding for this spec: **the real dry-run only touches `next` (16.3.4→16.3.8, patch) and the two `brace-expansion` instances (both patch bumps).** `@anthropic-ai/sdk`, `vitest`, `@vitest/mocker`, `@vitest/coverage-v8`, and `esbuild` are **not** changed by a plain `npm audit fix`, despite npm's advisory text saying a non-`--force` fix is "available" for them — in practice, applying no-`--force` `npm audit fix` resolves only `next` and `brace-expansion`. All 4 moderate findings and the 1 low finding will **remain** after this fix. This is acceptable: the CI gate is `--audit-level=critical` specifically, and none of the remaining findings are critical.

No prior spec exists for this exact incident, but `CLAUDE.md`'s own workflow docs reference a near-identical precedent: the request's own context cites a previous `next 16.2.1 → 16.3.4` incident where `--force` bumped `@anthropic-ai/sdk` and had to be reverted — this spec's entire structure (dry-run first, forbid `--force`, forbid any SDK change) exists specifically to not repeat that.

---

## Functional Requirements

FR-01: The system shall record the currently installed versions of `next`, `@anthropic-ai/sdk`, `vitest`, `esbuild`, and `brace-expansion` before making any change.

FR-02: The system shall run `npm audit fix --dry-run` and report exactly which packages and version transitions it would apply.

FR-03: Where every planned change from FR-02 is a non-major version bump and does not include `@anthropic-ai/sdk`, the system shall apply `npm audit fix` without `--force`.

FR-04: Where FR-02's dry-run includes a major version bump or includes `@anthropic-ai/sdk`, the system shall stop without applying any fix and report the available patched versions instead.

FR-05: The system shall not pass `--force` to `npm audit fix` under any circumstance in this change.

FR-06: The system shall leave `@anthropic-ai/sdk`'s installed version identical before and after this change.

FR-07: The system shall verify `npm audit --audit-level=critical` exits 0 after the fix is applied.

FR-08: The system shall report which non-critical findings (if any) remain after the fix, with their severities.

FR-09: The system shall verify `npx tsc --noEmit` reports zero errors after the fix.

FR-10: The system shall verify the full test suite passes with no regressions after the fix.

FR-11: The system shall verify `npm run build` completes successfully after the fix.

FR-12: The system shall report the before/after version of `next`, `@anthropic-ai/sdk`, `vitest`, `esbuild`, and `brace-expansion`.

FR-13: Where locally verifiable, the system shall confirm an unauthenticated request to `/api/*` still returns 401 and a request to `/dashboard` still redirects, after the fix.

---

## Non-Functional Requirements

NFR-01: The change shall not introduce any new npm dependency.

NFR-02: The change shall not alter any file's runtime logic — this is a dependency-version-only change.

---

## Constraints

C-01: Only `package.json` and `package-lock.json` may change.

C-02: No `--force` flag on any `npm audit fix` invocation.

C-03: `@anthropic-ai/sdk`'s version must be byte-identical before and after (confirmed currently `0.80.0`; its only available fix is the forbidden `--force` bump to `0.130.0`).

C-04: No edits to `src/`, `scripts/`, any `.github/workflows/*.yml` file, or the audit gate itself (`npm audit --audit-level=critical`).

C-05: No Protected Zone file (`config.ts`, `claude-agent.ts`, `risk-manager.ts`, `indicators.ts`) shall be touched — none of them are npm-dependency-related, so none are expected to change.

C-06: If the live dry-run (re-run at implementation time) differs from the one captured in this spec's Background — e.g. a new advisory publishes and shifts what `npm audit fix` would touch — implementation must re-check FR-04's condition against the fresh dry-run before proceeding, not against this document's captured snapshot.

---

## Out of Scope

- Fixing the 4 moderate findings (`@anthropic-ai/sdk`, `vitest`, `@vitest/mocker`, `@vitest/coverage-v8`) or the 1 low finding (`esbuild`) — none require `--force` per npm's own text, but the live dry-run shows plain `npm audit fix` does not actually change any of them; leaving them for a separate, deliberate change (especially `@anthropic-ai/sdk`, which needs a breaking-change migration plan)
- Any workflow YAML change, including changing the audit gate's threshold or command
- Any change to `src/`, `scripts/`, or Protected Zone files
- Investigating why npm's advisory text claims a non-`--force` fix exists for `vitest`/`@vitest/mocker`/`@vitest/coverage-v8`/`esbuild` when the dry-run shows otherwise — noted as a fact, not resolved here
- Planning the eventual `@anthropic-ai/sdk` 0.130.0 migration
