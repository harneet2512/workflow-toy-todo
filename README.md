# todo-api

Multi-tenant todo HTTP API. `npm start`, `npm test`.

Todo titles (`POST /todos`, `PATCH /todos/:id`) are trimmed and must be non-blank and at most 200 characters (Unicode code points, counted after trimming); otherwise the API answers `400 {"error": ...}`. A refused `PATCH` changes nothing, including `done`.

Todos take an optional `dueDate`, a calendar day written `YYYY-MM-DD` (`POST /todos`, `PATCH /todos/:id`; `null` clears it, and a todo without a date has no `dueDate` field); a bad date is `400 {"error": ...}`. `GET /todos?overdue=true` lists the caller's not-done todos due before today's UTC date; `overdue=false` or no parameter lists all, any other value is a 400.
