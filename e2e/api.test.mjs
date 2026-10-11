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
