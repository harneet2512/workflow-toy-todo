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

// ---- Due dates (docs/acceptance/todo-due-dates.md) ----------------------------------------
// Each test uses its own tenant key (prefix `dd-`) so tests do not see each other's todos.
const BAD_DATE = { error: 'dueDate must be a valid date in YYYY-MM-DD format' };
const BAD_DATES = [
  '2026-02-30', '2026-13-01', '2026-10-11T00:00:00Z', '11/10/2026', ' 2026-10-11', '2026-10-11\n',
  '', 42, true, [], {}, ['2026-10-11'],
];
const createDated = async (key, body) => call('POST', '/todos', { key, body });

test('due dates AT1: a todo created with a dueDate returns it, fetch and list show it', async () => {
  const key = 'dd-at1';
  const res = await createDated(key, { title: 'ship', dueDate: '2026-12-31' });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.dueDate, '2026-12-31');
  assert.equal((await fetchTodo(key, created.id)).dueDate, '2026-12-31');
  assert.deepEqual((await listAll(key)).map((t) => t.dueDate), ['2026-12-31']);
});

test('due dates AT1: a todo created without a date, or with null, has no dueDate field', async () => {
  const key = 'dd-at1b';
  const plain = await (await createDated(key, { title: 'plain' })).json();
  const nulled = await (await createDated(key, { title: 'nulled', dueDate: null })).json();
  assert.equal('dueDate' in plain, false);
  assert.equal('dueDate' in nulled, false);
  assert.deepEqual(Object.keys(plain).sort(), ['createdAt', 'done', 'id', 'title']);
  assert.equal('dueDate' in (await fetchTodo(key, nulled.id)), false);
  for (const t of await listAll(key)) assert.equal('dueDate' in t, false);
});

test('due dates AT1: a date in the past is accepted', async () => {
  const res = await createDated('dd-at1c', { title: 'late', dueDate: '2000-01-01' });
  assert.equal(res.status, 201);
  assert.equal((await res.json()).dueDate, '2000-01-01');
});

test('due dates AT2: update sets, replaces and clears the date; other updates keep it', async () => {
  const key = 'dd-at2';
  const todo = await create(key, 'task');
  assert.equal('dueDate' in todo, false);

  const set = await call('PATCH', `/todos/${todo.id}`, { key, body: { dueDate: '2026-12-31' } });
  assert.equal(set.status, 200);
  assert.equal((await set.json()).dueDate, '2026-12-31');

  const replaced = await call('PATCH', `/todos/${todo.id}`, { key, body: { dueDate: '2027-01-15' } });
  assert.equal((await replaced.json()).dueDate, '2027-01-15');
  assert.equal((await fetchTodo(key, todo.id)).dueDate, '2027-01-15');

  const doneOnly = await (await call('PATCH', `/todos/${todo.id}`, { key, body: { done: true } })).json();
  assert.equal(doneOnly.dueDate, '2027-01-15');
  assert.equal(doneOnly.done, true);
  const titleOnly = await (await call('PATCH', `/todos/${todo.id}`, { key, body: { title: 'renamed' } })).json();
  assert.equal(titleOnly.dueDate, '2027-01-15');
  const empty = await (await call('PATCH', `/todos/${todo.id}`, { key, body: {} })).json();
  assert.equal(empty.dueDate, '2027-01-15');

  const cleared = await call('PATCH', `/todos/${todo.id}`, { key, body: { dueDate: null } });
  assert.equal(cleared.status, 200);
  const clearedBody = await cleared.json();
  assert.equal('dueDate' in clearedBody, false);
  assert.equal(clearedBody.title, 'renamed');
  assert.equal(clearedBody.done, true);
  assert.equal('dueDate' in (await fetchTodo(key, todo.id)), false);
});

test('due dates AT2: clearing the date of a todo that never had one is a no-op', async () => {
  const key = 'dd-at2b';
  const todo = await create(key, 'never dated');
  const res = await call('PATCH', `/todos/${todo.id}`, { key, body: { dueDate: null } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal('dueDate' in body, false);
  assert.equal(body.title, 'never dated');
  assert.equal(body.done, false);
});

test('due dates AT3: a bad dueDate is refused on create and nothing is added', async () => {
  const key = 'dd-at3';
  for (const dueDate of BAD_DATES) {
    const res = await createDated(key, { title: 'x', dueDate });
    assert.equal(res.status, 400, JSON.stringify(dueDate));
    assert.deepEqual(await res.json(), BAD_DATE, JSON.stringify(dueDate));
  }
  assert.deepEqual(await listAll(key), []);
});

test('due dates AT3: a bad dueDate is refused on update and the todo is unchanged, even with a good title and done', async () => {
  const key = 'dd-at3b';
  const todo = await (await createDated(key, { title: 'keep me', dueDate: '2026-12-31' })).json();
  for (const dueDate of BAD_DATES) {
    const res = await call('PATCH', `/todos/${todo.id}`, { key, body: { dueDate, title: 'changed', done: true } });
    assert.equal(res.status, 400, JSON.stringify(dueDate));
    assert.deepEqual(await res.json(), BAD_DATE, JSON.stringify(dueDate));
    const after = await fetchTodo(key, todo.id);
    assert.equal(after.title, 'keep me');
    assert.equal(after.done, false);
    assert.equal(after.dueDate, '2026-12-31');
  }
});

test('due dates AT3: error order: title error wins; bad date on an unknown id is 400, good date is 404', async () => {
  const key = 'dd-at3c';
  const todo = await create(key, 'task');
  const both = await call('PATCH', `/todos/${todo.id}`, { key, body: { title: '   ', dueDate: '2026-02-30' } });
  assert.equal(both.status, 400);
  assert.deepEqual(await both.json(), REQUIRED);
  const bothCreate = await createDated(key, { title: '', dueDate: '2026-02-30' });
  assert.equal(bothCreate.status, 400);
  assert.deepEqual(await bothCreate.json(), REQUIRED);

  const badUnknown = await call('PATCH', '/todos/does-not-exist', { key, body: { dueDate: '2026-02-30' } });
  assert.equal(badUnknown.status, 400);
  assert.deepEqual(await badUnknown.json(), BAD_DATE);
  const goodUnknown = await call('PATCH', '/todos/does-not-exist', { key, body: { dueDate: '2026-12-31' } });
  assert.equal(goodUnknown.status, 404);
});

test('due dates AT5: titles, done-only update, 404 and 401 behave as before', async () => {
  const key = 'dd-at5';
  const todo = await createDated(key, { title: '  trimmed  ', dueDate: '2026-12-31' }).then((r) => r.json());
  assert.equal(todo.title, 'trimmed');
  const tooLong = await createDated(key, { title: 'a'.repeat(201), dueDate: '2026-12-31' });
  assert.deepEqual(await tooLong.json(), TOO_LONG);

  const doneOnly = await call('PATCH', `/todos/${todo.id}`, { key, body: { done: true } });
  assert.equal(doneOnly.status, 200);
  assert.equal((await doneOnly.json()).done, true);
  assert.equal((await call('PATCH', '/todos/does-not-exist', { key, body: { done: true } })).status, 404);
  assert.equal((await call('GET', '/todos/does-not-exist', { key })).status, 404);
  assert.equal((await fetch(base + '/todos', { method: 'POST', body: '{}' })).status, 401);
  assert.equal((await fetch(base + `/todos/${todo.id}`, { method: 'PATCH', body: '{}' })).status, 401);
});

test('due dates AT5: another tenant cannot read, set or clear the dueDate of a todo it does not own', async () => {
  const todo = await (await createDated('dd-owner', { title: 'secret', dueDate: '2026-12-31' })).json();
  const intruder = 'dd-intruder';
  assert.equal((await call('GET', `/todos/${todo.id}`, { key: intruder })).status, 404);
  const set = await call('PATCH', `/todos/${todo.id}`, { key: intruder, body: { dueDate: '2030-01-01' } });
  assert.equal(set.status, 404);
  const clear = await call('PATCH', `/todos/${todo.id}`, { key: intruder, body: { dueDate: null } });
  assert.equal(clear.status, 404);
  assert.deepEqual(await listAll(intruder), []);
  assert.equal((await fetchTodo('dd-owner', todo.id)).dueDate, '2026-12-31');
});

// ---- overdue filter (T2). Dates come from the real UTC clock when the test runs; no clock override exists. ----

const OVERDUE_BAD = { error: 'overdue must be true or false' };
const utcDay = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
const overdueIds = async (key, query = '?overdue=true') =>
  (await (await call('GET', `/todos${query}`, { key })).json()).todos.map((t) => t.id);

test('due dates AT4: overdue lists only my not-done todos due before today UTC, in creation order', async () => {
  const key = 'dd-at4-main';
  const [yesterday, today, tomorrow] = [utcDay(-1), utcDay(0), utcDay(1)];
  const mk = async (body) => (await (await createDated(key, body)).json());
  const ancient = await mk({ title: 'ancient', dueDate: '2000-01-01' });
  const late = await mk({ title: 'late', dueDate: yesterday });
  const dueToday = await mk({ title: 'today', dueDate: today });
  await mk({ title: 'tomorrow', dueDate: tomorrow });
  await mk({ title: 'far future', dueDate: '9999-12-31' });
  await mk({ title: 'undated' });
  const doneLate = await mk({ title: 'late but done', dueDate: yesterday });
  await call('PATCH', `/todos/${doneLate.id}`, { key, body: { done: true } });

  const res = await call('GET', '/todos?overdue=true', { key });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['todos']);
  assert.deepEqual(body.todos.map((t) => t.title), ['ancient', 'late'], 'creation order, only the overdue ones');
  assert.deepEqual(body.todos.map((t) => t.id), [ancient.id, late.id]);
  assert.equal(body.todos[1].dueDate, yesterday, 'listed todos keep their date');
  assert.ok(!body.todos.map((t) => t.id).includes(dueToday.id), 'due today is not overdue');
});

test('due dates AT4: without the parameter, or with overdue=false, every todo is listed', async () => {
  const key = 'dd-at4-all';
  await createDated(key, { title: 'late', dueDate: utcDay(-1) });
  await createDated(key, { title: 'undated' });
  await createDated(key, { title: 'future', dueDate: utcDay(1) });
  for (const query of ['', '?overdue=false', '?other=1', '?overdue=false&other=1']) {
    const res = await call('GET', `/todos${query}`, { key });
    assert.equal(res.status, 200, query);
    assert.deepEqual((await res.json()).todos.map((t) => t.title), ['late', 'undated', 'future'], query);
  }
});

test('due dates AT4: any other overdue value, or a repeated one, is a 400 with the exact body', async () => {
  const key = 'dd-at4-bad';
  await createDated(key, { title: 'late', dueDate: utcDay(-1) });
  const queries = [
    '?overdue=yes', '?overdue=1', '?overdue=0', '?overdue=TRUE', '?overdue=True', '?overdue=FALSE', '?overdue=',
    '?overdue', '?overdue=%20true', '?overdue=true%0A', '?overdue=true&overdue=false', '?overdue=false&overdue=true',
    '?overdue=true&overdue=true',
  ];
  for (const query of queries) {
    const res = await call('GET', `/todos${query}`, { key });
    assert.equal(res.status, 400, query);
    assert.deepEqual(await res.json(), OVERDUE_BAD, query);
  }
  assert.equal((await call('GET', '/todos?overdue=true&unrelated=x', { key })).status, 200, 'unrelated parameters stay ignored');
});

test('due dates AT4: another tenant never sees my overdue todos, and I never see theirs', async () => {
  const mine = await (await createDated('dd-at4-a', { title: 'mine', dueDate: utcDay(-3) })).json();
  const theirs = await (await createDated('dd-at4-b', { title: 'theirs', dueDate: utcDay(-3) })).json();
  assert.deepEqual(await overdueIds('dd-at4-a'), [mine.id]);
  assert.deepEqual(await overdueIds('dd-at4-b'), [theirs.id]);
  assert.deepEqual(await overdueIds('dd-at4-nobody'), []);
  assert.equal((await fetch(base + '/todos?overdue=true')).status, 401);
});

test('due dates AT4: marking done, clearing the date or moving it forward takes a todo off the overdue list', async () => {
  const key = 'dd-at4-life';
  const a = await (await createDated(key, { title: 'a', dueDate: utcDay(-2) })).json();
  const b = await (await createDated(key, { title: 'b', dueDate: utcDay(-2) })).json();
  const c = await (await createDated(key, { title: 'c', dueDate: utcDay(-2) })).json();
  assert.deepEqual(await overdueIds(key), [a.id, b.id, c.id]);

  await call('PATCH', `/todos/${a.id}`, { key, body: { done: true } });
  assert.deepEqual(await overdueIds(key), [b.id, c.id]);
  await call('PATCH', `/todos/${b.id}`, { key, body: { dueDate: null } });
  assert.deepEqual(await overdueIds(key), [c.id]);
  await call('PATCH', `/todos/${c.id}`, { key, body: { dueDate: utcDay(0) } });
  assert.deepEqual(await overdueIds(key), [], 'moved to today');
  await call('PATCH', `/todos/${a.id}`, { key, body: { done: false } });
  assert.deepEqual(await overdueIds(key), [a.id], 'reopened and still late');
  await call('PATCH', `/todos/${c.id}`, { key, body: { dueDate: '2000-01-01' } });
  assert.deepEqual(await overdueIds(key), [a.id, c.id], 'back in creation order');
});

test('due dates AT4: the overdue parameter is ignored on a single todo and on create', async () => {
  const key = 'dd-at4-ignored';
  const todo = await (await createDated(key, { title: 'late', dueDate: utcDay(-1) })).json();
  const one = await call('GET', `/todos/${todo.id}?overdue=yes`, { key });
  assert.equal(one.status, 200);
  assert.equal((await one.json()).id, todo.id);
  const made = await call('POST', '/todos?overdue=yes', { key, body: { title: 'x' } });
  assert.equal(made.status, 201);
});
