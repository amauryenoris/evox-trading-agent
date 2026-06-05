# Requirements — Portfolio History Debug Logging

## Functional Requirements

FR-01: The system shall emit a single `console.log` statement after the Supabase query in `GET /api/portfolio-history` returns, regardless of whether the result set is empty or populated.

FR-02: The system shall include the following fields in the debug log output: raw row count (`data?.length`), the configured limit constant (`CURRENT_LIMIT`), a boolean flag indicating whether the row count equals the limit (`hitLimit`), the `created_at` value of the first row, and the `created_at` value of the last row.

FR-03: The system shall prefix the log line with the string `[API DEBUG]` to allow filtering in server logs.

FR-04: The system shall define `CURRENT_LIMIT` as a named constant equal to the current `.limit()` value in the Supabase query, placed immediately before the `console.log` call.

FR-05: The system shall not alter the Supabase query, the `.limit()` value, the `byDay` aggregation logic, the `history` array construction, or the JSON response shape.

## Non-Functional Requirements

NFR-01: The debug log shall have no measurable effect on response latency — it must not perform any additional I/O, computation, or external calls.

NFR-02: The log must be readable in Vercel Function Logs without any additional tooling or log parser.

## Constraints

C-01: This feature must not modify the Protected Zone without explicit confirmation from Amaury.
C-02: No query logic, filter logic, or limit value may be changed as part of this task.
C-03: No new dependencies may be introduced.
C-04: The change is diagnostic and temporary in intent — it must be removable in a single-line deletion.

## Out of Scope

- Changing the `.limit()` value
- Fixing the truncation root cause
- Adding structured logging or a logging library
- Adding debug logging to any other API route
- Frontend changes of any kind
