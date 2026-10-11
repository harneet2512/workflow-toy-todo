# Todo due dates

## Decisions

- A valid `dueDate` is a string of exactly `YYYY-MM-DD` that is a real calendar date, year 0001 to 9999. No trimming; datetimes, impossible dates, empty strings and non-strings are invalid. Invalid gives 400 `{"error":"dueDate must be a valid date in YYYY-MM-DD format"}` on POST and PATCH, body is `{error}` only. (owner, Q1)
- `dueDate: null` on PATCH clears the date; on POST it means "no date". Omitting `dueDate` on PATCH leaves the stored date untouched. (owner, Q2)
- A todo with no due date has no `dueDate` key in any response, so existing response shapes do not change; clearing a date removes the key from the stored todo. (owner, Q3)
- A due date in the past is accepted on POST and PATCH. (owner, Q4)
- `GET /todos?overdue=true` returns the tenant's not-done todos whose `dueDate` is strictly before today's UTC date, in creation order, still as `{ "todos": [...] }`. Due today is not overdue; no date or `done: true` is never overdue. `overdue=false` or no parameter returns all todos. Any other value (`yes`, `1`, `TRUE`, empty) gives 400 `{"error":"overdue must be true or false"}`, exact and case-sensitive. (owner, Q5)
- "Overdue" is a pure function `isOverdue(todo, todayUtc)` with the date injected; unit tests pin the yesterday/today/tomorrow boundary, e2e tests compute dates from the real UTC clock at test time, no clock override in the server. (owner, Q6)
- The validator is a new pure module `src/dueDate.mjs`, called from both routes in `src/app.mjs`; the store only gains the field. PATCH validates `dueDate` before the todo lookup (bad date on an unknown id gives 400, otherwise unknown id gives 404). A rejected PATCH changes nothing, including `title` and `done`. No migration. (owner, Q7)
- Docs: one line in `README.md`, and a new `GLOSSARY.md` with one entry, "overdue". No ADR. (owner, Q8)
- When a request has several invalid fields, the title error wins, then the `dueDate` error; only one `{error}` is returned and all checks run before any lookup or write. (owner, Q9)
- A repeated `overdue` parameter (`?overdue=true&overdue=false`) gives the same 400 as any other bad value; unrelated unknown query parameters stay ignored. (owner, Q10)
- The existing 500 on a JSON `null` body is left alone and noted as a follow-up. (owner, Q11)
- Date validation uses explicit leap-year and days-in-month arithmetic, not `Date.parse`/`Date.UTC` (which map years 0 to 99 to 1900 to 1999). Overdue compares the `YYYY-MM-DD` strings directly. (owner, defaults)

## Acceptance tests

- AT1: Creating a todo with `dueDate` "2026-12-31" returns 201 with that `dueDate`, and fetching it shows the same; a todo created without a date, or with `dueDate: null`, has no `dueDate` field at all.
- AT2: Updating a todo's `dueDate` changes it, updating it to `null` removes it, and updating other fields without mentioning `dueDate` leaves it as it was.
- AT3: A `dueDate` that is not a real `YYYY-MM-DD` date (for example "2026-02-30", "2026-10-11T00:00:00Z", "11/10/2026", "", 42) is refused with 400 and `{"error":"dueDate must be a valid date in YYYY-MM-DD format"}` on both creating and updating; nothing is added, and a refused update leaves the todo (title, done and date) exactly as it was, even if the same request also sent a good title or `done: true`.
- AT4: `GET /todos?overdue=true` lists only my not-done todos whose due date is before today (UTC), in the order they were created: yesterday's is listed; one due today or tomorrow, one with no date, one already done, and another tenant's overdue todo are not; without the parameter or with `overdue=false` I still get every todo, and any other value ("yes", "TRUE", a repeated parameter) is refused with 400 and `{"error":"overdue must be true or false"}`.
- AT5: Everything else behaves as before: titles are still trimmed and limited, a `done`-only update still works, an unknown id still returns 404 (and 400 if the date sent with it is invalid), a missing key still returns 401, and one tenant still never sees or changes another tenant's todos.
