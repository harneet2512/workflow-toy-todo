# Todo title rules

## Decisions

- Rule lives in one shared module `src/title.mjs` (`normalizeTitle`), called from both routes in `app.mjs`; the store is unchanged. (owner: yes, Q1)
- Length is counted in Unicode code points after trimming; 200 is accepted, 201 is refused. Trim is JS `String.prototype.trim()`. (owner: yes, Q2)
- A non-string title gets 400 `title is required` on POST and PATCH; PATCH with no `title` key is untouched. (owner: yes, Q3)
- Blank after trimming: 400 `{"error":"title is required"}` on both routes (POST message unchanged). Too long: 400 `{"error":"title must be 200 characters or fewer"}`. Body is `{error}` only. (owner: yes, Q4, with the earlier answer to keep the existing message)
- PATCH validates the title before the todo lookup: bad title on an unknown id gives 400; unknown id with a valid or absent title still gives 404. (owner: yes, Q5)
- A rejected PATCH changes nothing, including `done`. (owner: yes, Q6)
- No migration: titles already stored are left alone. One line about the rule in `README.md`; no ADR or glossary entry. (owner: yes, Q7)

## Acceptance tests

- AT1: Creating a todo with the title "  buy milk  " returns 201 and the todo's title is "buy milk"; fetching it again shows "buy milk".
- AT2: Creating a todo with a title that is empty or only spaces returns 400 with `{"error":"title is required"}`, and nothing is added to the list.
- AT3: A title of exactly 200 characters is accepted; a title of 201 characters is refused with 400 and `{"error":"title must be 200 characters or fewer"}`, on both creating and updating a todo.
- AT4: Updating a todo's title trims it the same way; updating it to blank, to a too-long title, or to a non-text value returns 400, and the todo (title and done flag) stays exactly as it was, even if the same request also tried to mark it done.
- AT5: Everything else behaves as before: updating only `done` still works, an unknown id still returns 404 (and 400 if the title sent with it is invalid), and one tenant still never sees another tenant's todos.
