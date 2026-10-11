// HTTP handler. Every request needs an `x-api-key` header; the key is the tenant.
import { createTodo, deleteTodo, getTodo, listTodos, updateTodo } from './store.mjs';
import { normalizeDueDate } from './dueDate.mjs';
import { normalizeTitle } from './title.mjs';

const MAX_BODY_BYTES = 64 * 1024;

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

async function readJson(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

async function route(req, res, tenant) {
  const url = new URL(req.url, 'http://localhost');
  const match = url.pathname.match(/^\/todos(?:\/([^/]+))?$/);
  if (!match) return send(res, 404, { error: 'not found' });
  const id = match[1];
  if (!id && req.method === 'GET') return send(res, 200, { todos: listTodos(tenant) });
  if (!id && req.method === 'POST') {
    const body = await readJson(req);
    const checked = normalizeTitle(body.title);
    if (checked.error) return send(res, 400, { error: checked.error });
    let dueDate = null;
    if (body.dueDate !== undefined) {
      const date = normalizeDueDate(body.dueDate);
      if (date.error) return send(res, 400, { error: date.error });
      dueDate = date.dueDate;
    }
    return send(res, 201, createTodo(tenant, { title: checked.title, dueDate }));
  }
  if (id && req.method === 'GET') {
    const todo = getTodo(tenant, id);
    return todo ? send(res, 200, todo) : send(res, 404, { error: 'not found' });
  }
  if (id && req.method === 'PATCH') {
    const body = await readJson(req);
    // Validate first: a refused title must not apply `done` or reach the lookup.
    const patch = {};
    if (body.title !== undefined) {
      const checked = normalizeTitle(body.title);
      if (checked.error) return send(res, 400, { error: checked.error });
      patch.title = checked.title;
    }
    // The date check comes after the title check and before the lookup and the write; no await below.
    if (body.dueDate !== undefined) {
      const date = normalizeDueDate(body.dueDate);
      if (date.error) return send(res, 400, { error: date.error });
      patch.dueDate = date.dueDate; // null clears the date
    }
    if (body.done !== undefined) patch.done = Boolean(body.done);
    const todo = updateTodo(tenant, id, patch);
    return todo ? send(res, 200, todo) : send(res, 404, { error: 'not found' });
  }
  if (id && req.method === 'DELETE') return deleteTodo(tenant, id) ? send(res, 204) : send(res, 404, { error: 'not found' });
  return send(res, 405, { error: 'method not allowed' });
}

export async function handle(req, res) {
  const tenant = req.headers['x-api-key'];
  if (!tenant) return send(res, 401, { error: 'x-api-key header is required' });
  try {
    await route(req, res, tenant);
  } catch (err) {
    send(res, err.status ?? 500, { error: err.status ? err.message : 'internal error' });
  }
}
