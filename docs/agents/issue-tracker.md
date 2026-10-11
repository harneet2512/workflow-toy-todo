# Issue tracker: local markdown

Issues live as markdown files under `.scratch/<feature-slug>/` (no remote tracker).

- `to-spec` writes the spec to `.scratch/<feature-slug>/spec.md`.
- `to-tickets` writes one file per ticket to `.scratch/<feature-slug>/tickets/NN-<ticket-slug>.md`, each with a `Blocked by:` line.
- A ticket is closed by setting `Status: done` on its second line.
