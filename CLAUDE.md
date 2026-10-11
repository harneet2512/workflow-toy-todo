# todo-api

A small multi-tenant todo HTTP API (Node 22, no dependencies). `npm test` runs unit and end-to-end tests. CI runs `npm test` on every push.

- Tenancy: the `x-api-key` header is the tenant; a tenant never sees another tenant's data.
- Values are immutable (frozen); updates replace them.

## Agent skills

### Issue tracker

Local markdown under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
