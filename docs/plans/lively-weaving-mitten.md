# Plan: Todo title rules (slug: todo-title-rules)

Context: today POST /todos refuses only a missing or blank title (`title is required`), and PATCH /todos/:id validates nothing, so a blank, non-string or 5,000-character title can be stored. Titles get one shared rule: trimmed, not blank, at most 200 characters. Everything else stays as it is.

## Decisions

- The rule lives in one shared module `src/title.mjs` (`normalizeTitle`), called from both routes in `src/app.mjs`; `src/store.mjs` is unchanged. (owner, Q1)
- Length is counted in Unicode code points after trimming; 200 is accepted, 201 is refused. Trim is JS `String.prototype.trim()`. (owner, Q2)
- A non-string title gets 400 `title is required` on POST and PATCH; PATCH with no `title` key is untouched. (owner, Q3)
- Blank after trimming: 400 `{"error":"title is required"}` on both routes (POST message unchanged). Too long: 400 `{"error":"title must be 200 characters or fewer"}`. Body is `{error}` only. (owner, Q4)
- PATCH validates the title before the todo lookup: a bad title on an unknown id gives 400; an unknown id with a valid or absent title still gives 404. (owner, Q5)
- A rejected PATCH changes nothing, including `done`. (owner, Q6)
- No migration: titles already stored are left alone. One line about the rule in `README.md`; no ADR or glossary entry. (owner, Q7)
- Acceptance tests AT1 to AT5 approved at stop 1 (`docs/acceptance/todo-title-rules.md`, acceptance 86444e08). (owner)

## Acceptance tests

- AT1: Creating a todo with the title "  buy milk  " returns 201 and the todo's title is "buy milk"; fetching it again shows "buy milk".
- AT2: Creating a todo with a title that is empty or only spaces returns 400 with `{"error":"title is required"}`, and nothing is added to the list.
- AT3: A title of exactly 200 characters is accepted; a title of 201 characters is refused with 400 and `{"error":"title must be 200 characters or fewer"}`, on both creating and updating a todo.
- AT4: Updating a todo's title trims it the same way; updating it to blank, to a too-long title, or to a non-text value returns 400, and the todo (title and done flag) stays exactly as it was, even if the same request also tried to mark it done.
- AT5: Everything else behaves as before: updating only `done` still works, an unknown id still returns 404 (and 400 if the title sent with it is invalid), and one tenant still never sees another tenant's todos.

## Size and why

small. One validation rule in one new pure function, wired into two existing handlers. No new state, no new integration, nothing irreversible (the store is in-memory and the rule only refuses input), and no Critical item in the envelope. Tenancy is touched only by regression (AT5), not changed. Slug: `todo-title-rules`.

## External dependencies

n/a: Node 22 only (already required by `package.json`). No keys, accounts, inboxes or model providers. The live run starts the real server with `npm start`/`node src/server.mjs` on `PORT=0`, as the existing e2e suite does.

## Files to create or change

- `src/title.mjs` (new): exports `MAX_TITLE_LENGTH = 200` and a pure `normalizeTitle(raw)` returning `{ title }` (trimmed) or `{ error }` with one of the two messages. Non-string and blank give `title is required`; more than 200 code points (`[...trimmed].length`) gives `title must be 200 characters or fewer`. Blank is checked before length. Never mutates its input.
- `src/app.mjs`: POST replaces the inline `typeof`/`trim()` check with `normalizeTitle(body.title)`; on `error` send `400 { error }`, else `createTodo(tenant, { title: result.title })`. PATCH: when `body.title !== undefined`, call `normalizeTitle` before building the patch and before `updateTodo`; on `error` send `400 { error }` and return (no lookup, no `done` applied); else `patch.title = result.title`. `done` handling is unchanged.
- `test/title.test.mjs` (new): unit tests for `normalizeTitle`.
- `e2e/api.test.mjs`: new tests named `AT1: ...` to `AT5: ...` (see Verification). Existing tests untouched.
- `README.md`: one line stating the title rule.
- `src/store.mjs`: no change.

## Skeleton ticket

Ticket 1 is the whole feature, since it is small: `src/title.mjs` plus both routes, real at every layer (HTTP, handler, store). Happy-path live-verify scenario: `todo-title-rules-happy-path`: start the server, POST "  buy milk  " with a key, GET it back and see "buy milk", PATCH its title to " shop " and see "shop", POST a blank title and a 201-character title and see the two 400 bodies.

## Tickets and seams

| Ticket | Blocked by | Journey cases | Live items | Seams |
|---|---|---|---|---|
| T1: title rule on POST and PATCH | none | AT1 to AT5 | `todo-title-rules-happy-path`; reject paths for blank, 201 chars, non-string, PATCH on an unknown id, PATCH leaving `done` unchanged | unit: `normalizeTitle` in `test/title.test.mjs`; e2e: real server over HTTP in `e2e/api.test.mjs` (existing seam, highest available) |

Topic categories: input validation, API errors, tenancy regression.

## Skill per stage

Small path from `feature-loop`: stage 2 `behavioral-envelope` only, then `wp-loop` for the single issue (it runs the live happy path), `tdd` inside it (tests named AT1 to AT5 first and red), stage 6 `codex-review` code attack, stage 7 PR gate (owner approves, owner merges), stage 9 `retro` after the merge. No spec or ticket tree, since the envelope flags no risk. Stages 0, 1 and 3 are done from this approved plan.

## Verification

- `npm test` (unit then e2e) must pass; CI runs the same.
- AT1 to AT5: each is an e2e test whose name starts with its id (`AT1: ...`), run by `npm run test:e2e`. AT3 and AT4 include the boundary pair 200 / 201 (including a multi-code-point emoji title, 200 emoji accepted and 201 refused), and AT4 asserts via GET that the title and `done` are unchanged after a rejected PATCH that also sent `done: true`. AT5 covers a `done`-only PATCH, an unknown id with a valid and an invalid title, and the existing cross-tenant read.
- Unit tests: trim, tabs, newlines and NBSP trimmed, blank gives `title is required`, non-string (null, number, array, object, undefined) gives `title is required`, 200 ok, 201 refused, code-point counting, input not mutated.
- Live-verify scenario `todo-title-rules-happy-path` (above) against the real server process.

## Failure modes

- A client that sent a 201 to 5,000 character title, or a blank or non-string title on PATCH, now gets a 400. That is the point of the change. Todos already stored are unaffected. An existing client that PATCHes `done` together with a bad title no longer has `done` applied (decision Q6).
- Counting UTF-16 units instead of code points would refuse a 150-emoji title (300 units). Mitigation: count `[...trimmed].length`, tested with emoji.
- Checking length before trimming would refuse "200 chars + spaces". Mitigation: trim first, then count; tested.
- Doing the PATCH title check after the lookup would let a cross-tenant id probe tell 400 from 404 differently than today. Mitigation: the check runs first and touches no data, so it reveals nothing about any tenant's data (tested in AT5).
- Out of scope, existing behaviour kept: a request body of JSON `null` makes `body.title` throw and the handler returns 500 `internal error`. Not changed here.

## Time box

none. If time runs short, cut in this order: the README line, then the emoji boundary test, then the extra unit cases. Never cut AT1 to AT5.

## Concerns

`detect-packs.sh --plan` on the request selected these packs:
- core: always
- api: `POST /todos and PATCH /todos/:id trim the title and refuse a title that is empty after trimming or l...`
- data: the same line
- identity-access: the same line (the `x-api-key` tenant header); tenancy is unchanged, covered by regression in AT5

## Design challenge

pending: codex plan review

## Open questions

n/a: grilling finished inside the cap (1 round); every question was answered.

## Changes

none yet: appended during the build.
