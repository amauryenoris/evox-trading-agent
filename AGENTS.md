<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

**Version in use: 16.2.1** — This is not Next.js 14 or 15. There are breaking changes.
APIs, conventions, router behavior, and file structure may all differ from your training data.

**Before writing any Next.js code:**
1. Check `node_modules/next/dist/docs/` for the relevant guide
2. Heed all deprecation notices — do not use patterns from older versions
3. This project uses the App Router (`src/app/`) — Pages Router patterns do not apply

**Known differences to watch for:**
- Middleware behavior changed in 15+ — check `middleware.ts` before editing
- Server Actions, Server Components, and `use client` directives follow App Router conventions
- `next/image`, `next/link`, `next/font` APIs may differ from pre-15 versions
- Caching model is different from Pages Router — no implicit page-level caching
<!-- END:nextjs-agent-rules -->
