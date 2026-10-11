# todo-api

Multi-tenant todo HTTP API. `npm start`, `npm test`.

Todo titles (`POST /todos`, `PATCH /todos/:id`) are trimmed and must be non-blank and at most 200 characters (Unicode code points, counted after trimming); otherwise the API answers `400 {"error": ...}`. A refused `PATCH` changes nothing, including `done`.
