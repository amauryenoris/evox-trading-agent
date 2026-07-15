# Design — Login Page UX Polish

## Architecture Decision

This feature lives entirely in the frontend, in `src/app/login/page.tsx` (a client component).
It does not touch `src/app/login/actions.ts` (the server action that calls Supabase) or any
`src/lib/` module. The rebuild adopts the design system already defined in
`src/app/globals.css` (`--color-ink`, `--color-surface`, `--color-border`, `--color-text`,
`--color-green`, `--color-red`, `Inter` font) via Tailwind classes, following the same
className-based pattern already used in `src/components/dashboard/LogoutButton.tsx`, instead of
the page's current raw inline `style={{...}}` objects.

## Data Flow

1. User loads `/login` → `LoginPage` renders a `<form>` bound to `email`/`password` state.
2. User submits (click, or Enter in either field) → `onSubmit` runs client-side required-field
   validation, then calls the unchanged `login(email, password)` server action.
3. `actions.ts` calls `supabase.auth.signInWithPassword`; on error it returns a string; on
   success it redirects server-side to `/dashboard` (unchanged).
4. On error, `LoginPage` sets `error` state, re-enables the form, and renders the message with
   the app's error color token.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Rewrite with Tailwind classes + existing design tokens | Matches rest of app, zero new deps, low effort | None significant | Chosen |
| Introduce a form library (e.g. react-hook-form) | Nicer validation API | New dependency for a 2-field form — overkill | Rejected |
| Extract a shared `<AuthCard>` component now | Reusable if more auth pages are added later | No other auth page exists yet (YAGNI) | Rejected |

## Impact on Existing Files

| File | Change Type | Description |
|------|------------|--------------|
| `src/app/login/page.tsx` | MODIFY | Replace inline styles with Tailwind classes + design tokens; wrap inputs in a `<form>`; add labels, autocomplete attributes, focus states, password visibility toggle, responsive card layout, client-side required-field check |
| `src/app/login/actions.ts` | NONE | Not modified |

## Protected Zone Impact

None — this feature does not touch `config.ts`, `claude-agent.ts`, `risk-manager.ts`, or
`indicators.ts`.

## Database Changes

None.

## Open Questions

- Should "Forgot password" be added in this pass, or is it deliberately out of scope? Assumed
  out of scope (see Requirements) since it doesn't exist in `actions.ts` today and Amaury's
  request was about the page not feeling "friendly," not about adding new auth capabilities.
- Confirm dark-only theme is fine (matches rest of the app) — no light-mode variant assumed.
