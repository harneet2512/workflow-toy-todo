# Plan: Todo due dates (slug: todo-due-dates)

Context: todos have no notion of "when". This adds an optional `dueDate` (a calendar day, `YYYY-MM-DD`) that `POST /todos` and `PATCH /todos/:id` accept and validate, and a `GET /todos?overdue=true` filter that returns the tenant's not-done todos due strictly before today (UTC). Everything else stays as it is, including the response shape of todos that have no date.

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
- Acceptance tests AT1 to AT5 approved at stop 1 (`docs/acceptance/todo-due-dates.md`, acceptance 280254299d0c). (owner)

## Acceptance tests

- AT1: Creating a todo with `dueDate` "2026-12-31" returns 201 with that `dueDate`, and fetching it shows the same; a todo created without a date, or with `dueDate: null`, has no `dueDate` field at all.
- AT2: Updating a todo's `dueDate` changes it, updating it to `null` removes it, and updating other fields without mentioning `dueDate` leaves it as it was.
- AT3: A `dueDate` that is not a real `YYYY-MM-DD` date (for example "2026-02-30", "2026-10-11T00:00:00Z", "11/10/2026", "", 42) is refused with 400 and `{"error":"dueDate must be a valid date in YYYY-MM-DD format"}` on both creating and updating; nothing is added, and a refused update leaves the todo (title, done and date) exactly as it was, even if the same request also sent a good title or `done: true`.
- AT4: `GET /todos?overdue=true` lists only my not-done todos whose due date is before today (UTC), in the order they were created: yesterday's is listed; one due today or tomorrow, one with no date, one already done, and another tenant's overdue todo are not; without the parameter or with `overdue=false` I still get every todo, and any other value ("yes", "TRUE", a repeated parameter) is refused with 400 and `{"error":"overdue must be true or false"}`.
- AT5: Everything else behaves as before: titles are still trimmed and limited, a `done`-only update still works, an unknown id still returns 404 (and 400 if the date sent with it is invalid), a missing key still returns 401, and one tenant still never sees or changes another tenant's todos.

## Size and why

normal. A user-visible behaviour with state (a new stored field on todos) and an API change (two writers plus a new query filter), and the filter depends on the clock, which makes the UTC-day boundary the one real risk. Not large: the store is in-memory and the change is additive, nothing irreversible, no money, auth or identity change (tenancy is only regression-tested, the filter reads the caller's own bucket), no external effect. Not small, because it adds persisted state and a time-dependent query. Slug: `todo-due-dates`.

## External dependencies

n/a: Node 22 only (already required by `package.json`). No keys, accounts, inboxes or model providers. The live run starts the real server with `node src/server.mjs` on `PORT=0`, as the existing e2e suite does. The system clock is the only input; no clock override exists.

## Files to create or change

- `src/dueDate.mjs` (new): pure helpers, nothing mutated.
  - `DUE_DATE_ERROR = 'dueDate must be a valid date in YYYY-MM-DD format'` and `OVERDUE_ERROR = 'overdue must be true or false'`.
  - `normalizeDueDate(raw)`: `null` gives `{ dueDate: null }`; a string matching `/^\d{4}-\d{2}-\d{2}$/` whose year is 1 to 9999, month 1 to 12 and day within that month (explicit leap-year rule: divisible by 4, not by 100 unless by 400) gives `{ dueDate: raw }`; anything else, including `undefined`, gives `{ error: DUE_DATE_ERROR }`. Callers decide "absent" with `body.dueDate !== undefined`. The JS regex `$` does not match before a trailing newline, so `"2026-10-11\n"` is refused.
  - `todayUtc(now = new Date())`: `now.toISOString().slice(0, 10)`.
  - `isOverdue(todo, today)`: `todo.done !== true && typeof todo.dueDate === 'string' && todo.dueDate < today` (plain string comparison).
  - `parseOverdue(values)`: takes `url.searchParams.getAll('overdue')`; `[]` gives `{ overdue: false }`; exactly `['true']` gives `{ overdue: true }`; exactly `['false']` gives `{ overdue: false }`; anything else (other value, empty, repeated) gives `{ error: OVERDUE_ERROR }`.
- `src/app.mjs`:
  - POST: after `normalizeTitle`, when `body.dueDate !== undefined` call `normalizeDueDate`; on `error` send `400 { error }`; pass `{ title, dueDate }` to `createTodo`.
  - PATCH: after the title check and before `updateTodo`, when `body.dueDate !== undefined` call `normalizeDueDate`; on `error` send `400 { error }` and return; else `patch.dueDate = result.dueDate` (may be `null`, meaning clear). Title error still wins (Q9). `done` handling unchanged.
  - GET list: `parseOverdue(url.searchParams.getAll('overdue'))`; on `error` send `400 { error }`; when `overdue` is true, `listTodos(tenant).filter((t) => isOverdue(t, todayUtc()))`; otherwise the list as today. `GET /todos/:id` ignores the parameter.
- `src/store.mjs`: `createTodo` accepts `{ title, dueDate }` and includes the `dueDate` key only when it is a string; `updateTodo` removes the key when the merged value is `null` (so a cleared date leaves no key) before freezing. `listTodos`, `getTodo`, `deleteTodo` unchanged; the overdue filter lives in `app.mjs`, not the store. Existing `createTodo(tenant, { title })` calls keep working.
- `test/dueDate.test.mjs` (new): unit tests for the four helpers (see Verification).
- `test/store.test.mjs`: add cases for the `dueDate` key on create, set, replace and clear (existing tests untouched).
- `e2e/api.test.mjs`: new tests named `AT1: ...` to `AT5: ...` for due dates (the existing `AT1` to `AT5` title tests keep their names; the new ones are prefixed `due dates AT<n>:` so both sets are greppable). Existing tests untouched.
- `README.md`: one line on `dueDate` and `?overdue=true`.
- `GLOSSARY.md` (new): one entry, "overdue": a todo that is not done and has a `dueDate` strictly before today's UTC date.

## Skeleton ticket

T1 is the thinnest path through the whole journey for the new field, real at every layer (HTTP, handler, store): `src/dueDate.mjs` (`normalizeDueDate`), POST and PATCH wiring, the store field, GET returning it. Happy-path live-verify scenario `todo-due-dates-happy-path`: start the server, POST with `dueDate` "2026-12-31", GET it back and see the date, PATCH it to "2027-01-15", PATCH `dueDate: null` and see the key gone, POST `"2026-02-30"` and see the 400 body.

## Tickets and seams

| Ticket | Blocked by | Journey cases | Live items | Seams |
|---|---|---|---|---|
| T1: dueDate on POST and PATCH (skeleton) | none | AT1, AT2, AT3, AT5 | `todo-due-dates-happy-path`; refused dates (impossible day, datetime, empty, number), PATCH on an unknown id with a bad date, a refused PATCH leaving title, done and date unchanged | unit: `normalizeDueDate` in `test/dueDate.test.mjs`, store field in `test/store.test.mjs`; e2e: real server over HTTP in `e2e/api.test.mjs` (existing seam, highest available) |
| T2: `GET /todos?overdue=true` | T1 | AT4, AT5 | `todo-due-dates-overdue`: create todos due yesterday, today, tomorrow, undated and done-and-late for one key and one late todo for another key; `?overdue=true` shows only yesterday's for the first key and nothing for the second; no parameter and `overdue=false` show all; `?overdue=yes` and a repeated parameter give the 400 body | unit: `isOverdue`, `todayUtc`, `parseOverdue` in `test/dueDate.test.mjs`; e2e: same real server seam |

Topic categories: input validation, date and time (UTC boundary), API errors, tenancy regression.

## Skill per stage

Normal path from `feature-loop`. Stage 0 (baseline), stage 1 (shape) and stage 3 (to-tickets) are done from this approved plan. Stage 2: `deep-engineering` against the code, then `behavioral-envelope` written from this plan's Concerns and Failure modes. Stage 3 `to-spec` with the seams confirmed here. Stage 4: `tdd` per ticket (tests named after the AT ids written first and red; T1 first with its live scenario, then T2), `code-review` per slice. Stage 5: `live-verify` for `todo-due-dates-happy-path` then `todo-due-dates-overdue`; `evals` n/a (no model output). Stage 6: `codex-review` code attack. Stage 7: PR gate (owner approves, owner merges). Stage 9: `retro` after the merge. Differs from a typical normal feature in having no `evals` and no design-challenge subagent beyond the codex plan review.

## Verification

- `npm test` (unit then e2e) must pass; CI runs the same.
- AT1 to AT5: each is an e2e test whose name carries its id (`due dates AT1: ...`), run by `npm run test:e2e`.
  - AT1: 201 with the date, GET shows it, list shows it; no date and `dueDate: null` give no `dueDate` key (checked with `'dueDate' in body`).
  - AT2: PATCH sets, replaces, and clears with `null` (key gone on GET); a `done`-only PATCH keeps the date.
  - AT3: table of refused values on POST and PATCH (`"2026-02-30"`, `"2026-13-01"`, `"2026-10-11T00:00:00Z"`, `"11/10/2026"`, `" 2026-10-11"`, `""`, `42`, `true`, `[]`, `{}`), each 400 with the exact body, nothing added on POST; on PATCH a request that also sends a good title and `done: true` leaves title, done and date unchanged (checked with GET); bad date plus bad title returns the title error; bad date on an unknown id returns 400, good date on an unknown id returns 404.
  - AT4: dates computed at test time from the real UTC clock (yesterday, today, tomorrow, plus `2000-01-01` and `9999-12-31`); overdue list order equals creation order; a done todo, an undated todo, one due today and one due tomorrow are absent; another tenant's overdue todo is absent for me and mine for them; no parameter and `overdue=false` return all; `yes`, `1`, `TRUE`, empty and `?overdue=true&overdue=false` give the exact 400 body; marking the overdue todo done removes it from the list and clearing its date removes it too.
  - AT5: the existing title and cross-tenant e2e tests stay green unchanged, and one new test covers a `done`-only PATCH, 404 for an unknown id, 401 without a key and the unchanged shape of an undated todo.
- Unit tests: `normalizeDueDate` accepts `2026-02-28`, `2028-02-29`, `2000-02-29`, `0001-01-01`, `9999-12-31`; refuses `2026-02-29`, `1900-02-29`, `2026-04-31`, `2026-00-10`, `2026-13-01`, `2026-01-00`, `0000-01-01`, `2026-1-1`, `20261011`, `2026-10-11\n`, a leading or trailing space, a datetime, non-ASCII digits, and non-strings; `null` gives `{ dueDate: null }`. `todayUtc` at `2026-10-11T23:59:59.999Z` is `2026-10-11` and at `2026-10-12T00:00:00.000Z` is `2026-10-12`. `isOverdue` is true for yesterday, false for today and tomorrow, false when done, false with no date. `parseOverdue` covers none, `true`, `false`, `yes`, `TRUE`, empty and repeated. Inputs are not mutated.
- Live-verify scenarios `todo-due-dates-happy-path` and `todo-due-dates-overdue` (above) against the real server process.

## Failure modes

- Midnight race: an e2e run that straddles 00:00 UTC computes "yesterday" before and the server computes "today" after, so a boundary assertion can flip once a day. Accepted by the owner (Q6). Mitigation: each test computes its dates once at the start, and the far dates (`2000-01-01`, `9999-12-31`) never flip.
- A client in another timezone sees "today" as the UTC day, not its local day, so a todo due "today" locally can already be overdue after local evening. This is the specified behaviour (UTC), documented in the glossary entry and the README line.
- Validating with `Date.parse` or `Date.UTC` would accept `2026-02-30` (rolled to March) or shift years 0 to 99. Mitigation: explicit calendar arithmetic, with unit tests on the impossible days and the year `0001`.
- Storing `dueDate: null` instead of removing the key would change the response shape of every cleared todo. Mitigation: `updateTodo` deletes the key on `null`; tested at the store and the HTTP layer.
- Doing the `dueDate` check after the lookup would let an id probe see 404 where it should see 400, and applying `done` before validation would break "a refused PATCH changes nothing". Mitigation: both checks run before `updateTodo`; tested with a good title and `done: true` beside a bad date.
- Cross-tenant leak through the filter: the filter must read only the caller's bucket. Mitigation: it filters the result of `listTodos(tenant)`; tested with an overdue todo under another key.
- Existing clients keep working: undated todos have the same shape, a request without `dueDate` behaves as before. The only new refusals are a bad `dueDate` and a bad `overdue` value, both new inputs.
- Out of scope, existing behaviour kept: a request body of JSON `null` makes `body.title` throw and the handler returns 500 `internal error`. Not changed here; follow-up (Q11).

## Time box

none. If time runs short, cut in this order: the README line, the extra unit cases, the `GLOSSARY.md` entry. Never cut AT1 to AT5, and T2 ships only after T1 is green.

## Concerns

`detect-packs.sh --plan docs/plans/quizzical-jumping-lerdorf.md` scanned this whole draft, so it over-selects (its patterns err toward inclusion and match incidental words in the plan's own prose). Raw selection, then the triage:

Real packs for this change:
- core: always.
- api: `plan:13` (the validator called from both routes in `src/app.mjs`): two writers and a new query parameter, new 400 bodies. Covered by AT3, AT4 and AT5.
- data: `plan:13` (the store gains the field): a new stored attribute, no migration, in-memory. Covered by AT1, AT2 and the store tests.
- jobs-time: `plan:3` (`dueDate`, `YYYY-MM-DD`, "when"): the UTC-day boundary, `Date` pitfalls for years 0 to 99, the midnight race. Covered by the dueDate unit tests, AT4 and the Failure modes.
- identity-access: `plan:3` (the tenant): the filter must stay in the caller's bucket. Regression only, tenancy is not changed. Covered by AT4 and AT5.

Selected only by incidental wording, answered N/A:
- ui-behavior (`plan:35`, "inboxes"), outbound (`plan:17`, "follow-up"), integrations-auth (`plan:35`, "accounts, keys"), llm (`plan:35`, "model providers"), retrieval (`plan:14`, "docs"), files (`plan:37`, the heading "Files to create"), personal-data (`plan:31`, "user-visible"), infra-config (`plan:75`, "CI"), dependencies (`plan:33`, the heading "External dependencies"), money (`plan:1`, the heading "Plan"): none applies. No UI, no sending, no external service, no model, no search, no upload, no personal data, no config or deploy change, no package change (`package.json` is untouched), no money.

## Design challenge

pending: codex plan review

## Open questions

n/a: grilling finished inside the cap (2 rounds, inside the 3-round and 20-minute cap); every question was answered.

## Changes

<!-- Written during the build, never before. -->
