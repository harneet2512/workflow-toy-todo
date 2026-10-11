// End to end: starts the real server process on a free port and talks HTTP to it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

let proc;
let base;

before(async () => {
  proc = spawn(process.execPath, ['src/server.mjs'], { env: { ...process.env, PORT: '0' } });
  base = await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => {
      const m = String(d).match(/listening on (\d+)/);
      if (m) resolve(`http://127.0.0.1:${m[1]}`);
    });
    proc.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
});

after(() => proc.kill('SIGTERM'));

const call = (method, path, { key = 'k1', body } = {}) =>
  fetch(base + path, {
    method,
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: body && JSON.stringify(body),
  });

test('create, read, update and delete a todo', async () => {
  const created = await (await call('POST', '/todos', { body: { title: 'buy milk' } })).json();
  assert.equal(created.title, 'buy milk');
  assert.equal((await call('GET', `/todos/${created.id}`)).status, 200);
  const patched = await (await call('PATCH', `/todos/${created.id}`, { body: { done: true } })).json();
  assert.equal(patched.done, true);
  assert.equal((await call('DELETE', `/todos/${created.id}`)).status, 204);
});

test('requests without an api key are refused', async () => {
  const res = await fetch(base + '/todos');
  assert.equal(res.status, 401);
});

test("one tenant cannot read another tenant's todo", async () => {
  const created = await (await call('POST', '/todos', { key: 'owner', body: { title: 'secret' } })).json();
  assert.equal((await call('GET', `/todos/${created.id}`, { key: 'intruder' })).status, 404);
});

// ---- Title rules (docs/acceptance/todo-title-rules.md) -------------------------------------
// Each test uses its own tenant key so tests do not see each other's todos.
const REQUIRED = { error: 'title is required' };
const TOO_LONG = { error: 'title must be 200 characters or fewer' };
const GRIN = '\u{1F600}'; // 1 code point, 2 UTF-16 units

const create = async (key, title) => (await call('POST', '/todos', { key, body: { title } })).json();
const fetchTodo = async (key, id) => (await call('GET', `/todos/${id}`, { key })).json();
const listAll = async (key) => (await (await call('GET', '/todos', { key })).json()).todos;

test('AT1: creating a todo trims its title, and it reads back trimmed', async () => {
  const key = 'at1';
  const res = await call('POST', '/todos', { key, body: { title: '  buy milk  ' } });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.title, 'buy milk');
  assert.equal((await fetchTodo(key, created.id)).title, 'buy milk');
  assert.deepEqual((await listAll(key)).map((t) => t.title), ['buy milk']);
});

test('AT2: a blank title is refused with 400 and nothing is added', async () => {
  const key = 'at2';
  for (const title of ['', '   ', '\t\n ', ' ']) {
    const res = await call('POST', '/todos', { key, body: { title } });
    assert.equal(res.status, 400, JSON.stringify(title));
    assert.deepEqual(await res.json(), REQUIRED);
  }
  for (const body of [{}, { title: null }, { title: 42 }, { title: ['a'] }, { title: { a: 1 } }]) {
    const res = await call('POST', '/todos', { key, body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.deepEqual(await res.json(), REQUIRED);
  }
  assert.deepEqual(await listAll(key), []);
});

test('AT3: 200 characters are accepted and 201 refused, on create and on update', async () => {
  const key = 'at3';
  const ok200 = await call('POST', '/todos', { key, body: { title: 'a'.repeat(200) } });
  assert.equal(ok200.status, 201);
  const todo = await ok200.json();
  assert.equal(todo.title.length, 200);

  const long = await call('POST', '/todos', { key, body: { title: 'a'.repeat(201) } });
  assert.equal(long.status, 400);
  assert.deepEqual(await long.json(), TOO_LONG);
  assert.equal((await listAll(key)).length, 1);

  const upOk = await call('PATCH', `/todos/${todo.id}`, { key, body: { title: 'b'.repeat(200) } });
  assert.equal(upOk.status, 200);
  assert.equal((await upOk.json()).title, 'b'.repeat(200));

  const upLong = await call('PATCH', `/todos/${todo.id}`, { key, body: { title: 'c'.repeat(201) } });
  assert.equal(upLong.status, 400);
  assert.deepEqual(await upLong.json(), TOO_LONG);
  assert.equal((await fetchTodo(key, todo.id)).title, 'b'.repeat(200));
});

test('AT3: length is counted after trimming and in code points', async () => {
  const key = 'at3b';
  const padded = await call('POST', '/todos', { key, body: { title: ' '.repeat(10) + 'a'.repeat(200) + ' '.repeat(10) } });
  assert.equal(padded.status, 201);
  assert.equal((await padded.json()).title, 'a'.repeat(200));

  const emoji200 = await call('POST', '/todos', { key, body: { title: GRIN.repeat(200) } });
  assert.equal(emoji200.status, 201);
  assert.equal((await emoji200.json()).title, GRIN.repeat(200));

  const emoji201 = await call('POST', '/todos', { key, body: { title: GRIN.repeat(201) } });
  assert.equal(emoji201.status, 400);
  assert.deepEqual(await emoji201.json(), TOO_LONG);
});

test('AT4: updating a title trims it', async () => {
  const key = 'at4';
  const todo = await create(key, 'old');
  const res = await call('PATCH', `/todos/${todo.id}`, { key, body: { title: ' shop ' } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).title, 'shop');
  assert.equal((await fetchTodo(key, todo.id)).title, 'shop');
});

test('AT4: a refused update changes nothing, even when it also sets done', async () => {
  const key = 'at4b';
  const todo = await create(key, 'keep me');
  const cases = [
    [{ title: '   ', done: true }, REQUIRED],
    [{ title: '', done: true }, REQUIRED],
    [{ title: 'a'.repeat(201), done: true }, TOO_LONG],
    [{ title: null, done: true }, REQUIRED],
    [{ title: 42, done: true }, REQUIRED],
    [{ title: ['x'], done: true }, REQUIRED],
    [{ title: { a: 1 }, done: true }, REQUIRED],
  ];
  for (const [body, error] of cases) {
    const res = await call('PATCH', `/todos/${todo.id}`, { key, body });
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    assert.deepEqual(await res.json(), error);
    const after = await fetchTodo(key, todo.id);
    assert.equal(after.title, 'keep me');
    assert.equal(after.done, false);
  }
});

test('AT5: everything else behaves as before', async () => {
  const key = 'at5';
  const todo = await create(key, 'task');

  const doneOnly = await call('PATCH', `/todos/${todo.id}`, { key, body: { done: true } });
  assert.equal(doneOnly.status, 200);
  const updated = await doneOnly.json();
  assert.equal(updated.done, true);
  assert.equal(updated.title, 'task');

  const missing = await call('PATCH', '/todos/does-not-exist', { key, body: { title: 'fine' } });
  assert.equal(missing.status, 404);
  const missingBad = await call('PATCH', '/todos/does-not-exist', { key, body: { title: '   ' } });
  assert.equal(missingBad.status, 400);
  assert.deepEqual(await missingBad.json(), REQUIRED);
  const missingDone = await call('PATCH', '/todos/does-not-exist', { key, body: { done: true } });
  assert.equal(missingDone.status, 404);

  assert.equal((await call('GET', '/todos', { key })).status, 200);
  assert.equal((await call('DELETE', `/todos/${todo.id}`, { key })).status, 204);
  assert.equal((await fetch(base + '/todos')).status, 401);
});

test('AT5: a PATCH from another tenant never touches or reveals the owner todo', async () => {
  const todo = await create('at5-owner', 'secret');
  const valid = await call('PATCH', `/todos/${todo.id}`, { key: 'at5-intruder', body: { title: 'hacked', done: true } });
  assert.equal(valid.status, 404);
  const invalid = await call('PATCH', `/todos/${todo.id}`, { key: 'at5-intruder', body: { title: '  ', done: true } });
  assert.equal(invalid.status, 400);
  assert.deepEqual(await invalid.json(), REQUIRED);

  const after = await fetchTodo('at5-owner', todo.id);
  assert.equal(after.title, 'secret');
  assert.equal(after.done, false);
  assert.deepEqual(await listAll('at5-intruder'), []);
});

test('AT5: markup in a title is stored as plain text', async () => {
  const key = 'at5-text';
  const title = `<script>alert("x")</script> 'q'`;
  const todo = await create(key, title);
  assert.equal(todo.title, title);
  assert.equal((await fetchTodo(key, todo.id)).title, title);
});
