import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createTodo, listTodos, updateTodo, deleteTodo, resetStore } from '../src/store.mjs';

beforeEach(() => resetStore());

test('todos are scoped to their tenant', () => {
  createTodo('a', { title: 'one' });
  createTodo('b', { title: 'two' });
  assert.deepEqual(listTodos('a').map((t) => t.title), ['one']);
});

test('update returns a new frozen value and keeps the id', () => {
  const t = createTodo('a', { title: 'one' });
  const u = updateTodo('a', t.id, { done: true });
  assert.equal(u.id, t.id);
  assert.equal(u.done, true);
  assert.equal(t.done, false);
  assert.ok(Object.isFrozen(u));
});

test('delete removes only from its tenant', () => {
  const t = createTodo('a', { title: 'one' });
  assert.equal(deleteTodo('b', t.id), false);
  assert.equal(deleteTodo('a', t.id), true);
});

// ---- dueDate field (docs/acceptance/todo-due-dates.md) -------------------------------------
test('a todo created with a dueDate keeps it, and one without has no dueDate key', () => {
  const dated = createTodo('a', { title: 'one', dueDate: '2026-12-31' });
  assert.equal(dated.dueDate, '2026-12-31');
  assert.ok(Object.isFrozen(dated));
  const plain = createTodo('a', { title: 'two' });
  assert.equal('dueDate' in plain, false);
  assert.deepEqual(Object.keys(plain).sort(), ['createdAt', 'done', 'id', 'title']);
});

test('a null or missing dueDate on create adds no key', () => {
  assert.equal('dueDate' in createTodo('a', { title: 'one', dueDate: null }), false);
  assert.equal('dueDate' in createTodo('a', { title: 'two', dueDate: undefined }), false);
});

test('update sets and replaces dueDate on a new frozen value', () => {
  const t = createTodo('a', { title: 'one' });
  const set = updateTodo('a', t.id, { dueDate: '2026-12-31' });
  assert.equal(set.dueDate, '2026-12-31');
  assert.equal('dueDate' in t, false);
  const replaced = updateTodo('a', t.id, { dueDate: '2027-01-15' });
  assert.equal(replaced.dueDate, '2027-01-15');
  assert.equal(set.dueDate, '2026-12-31');
  assert.ok(Object.isFrozen(replaced));
});

test('update with dueDate null removes the key without touching the old value', () => {
  const t = createTodo('a', { title: 'one', dueDate: '2026-12-31' });
  const cleared = updateTodo('a', t.id, { dueDate: null });
  assert.equal('dueDate' in cleared, false);
  assert.ok(Object.isFrozen(cleared));
  assert.equal(t.dueDate, '2026-12-31');
  assert.equal(listTodos('a')[0], cleared);
});

test('clearing the date of a todo that never had one leaves its shape alone', () => {
  const t = createTodo('a', { title: 'one' });
  const cleared = updateTodo('a', t.id, { dueDate: null });
  assert.equal('dueDate' in cleared, false);
  assert.equal(cleared.title, 'one');
  assert.equal(cleared.done, false);
});

test('an update that does not mention dueDate keeps it', () => {
  const t = createTodo('a', { title: 'one', dueDate: '2026-12-31' });
  assert.equal(updateTodo('a', t.id, { done: true }).dueDate, '2026-12-31');
  assert.equal(updateTodo('a', t.id, { title: 'renamed' }).dueDate, '2026-12-31');
});

test("another tenant cannot set or clear a tenant's dueDate", () => {
  const t = createTodo('a', { title: 'one', dueDate: '2026-12-31' });
  assert.equal(updateTodo('b', t.id, { dueDate: null }), null);
  assert.equal(updateTodo('b', t.id, { dueDate: '2030-01-01' }), null);
  assert.equal(listTodos('a')[0].dueDate, '2026-12-31');
});
