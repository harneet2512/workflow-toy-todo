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
