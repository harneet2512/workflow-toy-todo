import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDueDate, DUE_DATE_ERROR, OVERDUE_ERROR, todayUtc, isOverdue, overdueTodos, parseOverdue,
} from '../src/dueDate.mjs';

const ERROR = { error: 'dueDate must be a valid date in YYYY-MM-DD format' };

test('the error text is the one the API promises', () => {
  assert.equal(DUE_DATE_ERROR, 'dueDate must be a valid date in YYYY-MM-DD format');
});

test('real calendar days are accepted and returned as given', () => {
  const real = [
    '2026-12-31', '2026-02-28', '2028-02-29', '2000-02-29', '2026-01-31', '2026-04-30',
    '0001-01-01', '9999-12-31', '0004-02-29', '2026-10-11',
  ];
  for (const raw of real) assert.deepEqual(normalizeDueDate(raw), { dueDate: raw }, raw);
});

test('impossible days are refused, not rolled into the next month', () => {
  const impossible = [
    '2026-02-29', '2026-02-30', '2026-02-31', '1900-02-29', '2100-02-29', '2026-04-31',
    '2026-06-31', '2026-09-31', '2026-11-31', '2026-01-32', '2026-00-10', '2026-13-01',
    '2026-01-00', '0000-01-01', '0000-12-31',
  ];
  for (const raw of impossible) assert.deepEqual(normalizeDueDate(raw), ERROR, raw);
});

test('only the exact YYYY-MM-DD shape is accepted', () => {
  const wrongShape = [
    '2026-1-1', '2026-10-1', '26-10-11', '20261011', '2026/10/11', '11/10/2026', '11-10-2026',
    '2026-10-11T00:00:00Z', '2026-10-11T00:00:00', '2026-10-11 00:00', '2026-10-11Z',
    ' 2026-10-11', '2026-10-11 ', '2026-10-11\n', '\n2026-10-11', '2026-10-11\t',
    '', ' ', 'tomorrow', '+2026-10-11', '-2026-10-11', '12026-10-11',
    '２０２６-１０-１１', // full-width digits
    '٢٠٢٦-١٠-١١', // Arabic-Indic digits
  ];
  for (const raw of wrongShape) assert.deepEqual(normalizeDueDate(raw), ERROR, JSON.stringify(raw));
});

test('non-strings are refused', () => {
  for (const raw of [42, 20261011, true, false, [], ['2026-10-11'], {}, { dueDate: '2026-10-11' }, NaN]) {
    assert.deepEqual(normalizeDueDate(raw), ERROR, JSON.stringify(raw));
  }
  assert.deepEqual(normalizeDueDate(new Date('2026-10-11')), ERROR);
});

test('null means no date', () => {
  assert.deepEqual(normalizeDueDate(null), { dueDate: null });
});

test('undefined is an error, so callers must decide "absent" themselves', () => {
  assert.deepEqual(normalizeDueDate(undefined), ERROR);
});

test('the result is a fresh value and the error object is not shared', () => {
  const a = normalizeDueDate('2026-10-11');
  const b = normalizeDueDate('2026-10-11');
  assert.notEqual(a, b);
  const e1 = normalizeDueDate('nope');
  e1.error = 'changed';
  assert.deepEqual(normalizeDueDate('nope'), ERROR);
});

// ---- overdue (T2) ----

const OVERDUE_BAD = { error: 'overdue must be true or false' };

test('the overdue error text is the one the API promises', () => {
  assert.equal(OVERDUE_ERROR, 'overdue must be true or false');
});

test('todayUtc is the UTC calendar day, whatever the local zone', () => {
  assert.equal(todayUtc(new Date('2026-10-11T23:59:59.999Z')), '2026-10-11');
  assert.equal(todayUtc(new Date('2026-10-12T00:00:00.000Z')), '2026-10-12');
  assert.equal(todayUtc(new Date('2026-12-31T23:30:00-05:00')), '2027-01-01');
  assert.equal(todayUtc(new Date('2026-01-01T01:00:00+14:00')), '2025-12-31');
});

test('todayUtc without an argument reads the real clock', () => {
  assert.match(todayUtc(), /^\d{4}-\d{2}-\d{2}$/);
});

test('isOverdue: strictly before today, not done, with a date', () => {
  const today = '2026-10-11';
  assert.equal(isOverdue({ done: false, dueDate: '2026-10-10' }, today), true);
  assert.equal(isOverdue({ done: false, dueDate: '2000-01-01' }, today), true);
  assert.equal(isOverdue({ done: false, dueDate: '0001-01-01' }, today), true);
  assert.equal(isOverdue({ done: false, dueDate: '2026-10-11' }, today), false, 'due today is not overdue');
  assert.equal(isOverdue({ done: false, dueDate: '2026-10-12' }, today), false);
  assert.equal(isOverdue({ done: false, dueDate: '9999-12-31' }, today), false);
  assert.equal(isOverdue({ done: true, dueDate: '2026-10-10' }, today), false, 'done is never overdue');
  assert.equal(isOverdue({ done: false }, today), false, 'no date is never overdue');
  assert.equal(isOverdue({ done: false, dueDate: null }, today), false);
});

test('isOverdue compares calendar days across month and year boundaries', () => {
  assert.equal(isOverdue({ done: false, dueDate: '2026-12-31' }, '2027-01-01'), true);
  assert.equal(isOverdue({ done: false, dueDate: '2026-02-28' }, '2026-03-01'), true);
  assert.equal(isOverdue({ done: false, dueDate: '2026-09-30' }, '2026-10-01'), true);
  assert.equal(isOverdue({ done: false, dueDate: '2026-10-01' }, '2026-09-30'), false);
});

test('overdueTodos keeps creation order and only the overdue ones', () => {
  const todos = [
    { id: '1', done: false, dueDate: '2026-10-10' },
    { id: '2', done: false },
    { id: '3', done: false, dueDate: '2026-10-11' },
    { id: '4', done: true, dueDate: '2026-01-01' },
    { id: '5', done: false, dueDate: '2000-01-01' },
    { id: '6', done: false, dueDate: '2026-10-12' },
  ];
  const clock = () => new Date('2026-10-11T08:00:00Z');
  assert.deepEqual(overdueTodos(todos, clock).map((t) => t.id), ['1', '5']);
});

test('overdueTodos reads the clock exactly once, so a midnight crossing cannot split a response', () => {
  const twoDue = [
    { id: 'a', done: false, dueDate: '2026-10-11' },
    { id: 'b', done: false, dueDate: '2026-10-11' },
  ];
  let before = 0;
  const beforeMidnight = () => (before++ === 0 ? new Date('2026-10-11T23:59:59.999Z') : new Date('2026-10-12T00:00:00.000Z'));
  assert.deepEqual(overdueTodos(twoDue, beforeMidnight), [], 'judged on the first reading: today is the 11th');
  assert.equal(before, 1);

  let after = 0;
  const afterMidnight = () => (after++ === 0 ? new Date('2026-10-12T00:00:00.000Z') : new Date('2026-10-11T23:59:59.999Z'));
  assert.deepEqual(overdueTodos(twoDue, afterMidnight).map((t) => t.id), ['a', 'b'], 'judged on the first reading: today is the 12th');
  assert.equal(after, 1);
});

test('overdueTodos reads the clock once even for an empty list, and does not mutate its input', () => {
  let reads = 0;
  assert.deepEqual(overdueTodos([], () => { reads += 1; return new Date(); }), []);
  assert.equal(reads, 1);
  const todos = Object.freeze([Object.freeze({ id: '1', done: false, dueDate: '2000-01-01' })]);
  const out = overdueTodos(todos, () => new Date('2026-10-11T00:00:00Z'));
  assert.equal(out.length, 1);
  assert.notEqual(out, todos);
  assert.equal(todos.length, 1);
});

test('parseOverdue: absent and false list everything, true filters', () => {
  assert.deepEqual(parseOverdue([]), { overdue: false });
  assert.deepEqual(parseOverdue(['false']), { overdue: false });
  assert.deepEqual(parseOverdue(['true']), { overdue: true });
});

test('parseOverdue: anything else is refused, exactly and case-sensitively', () => {
  const bad = [
    ['yes'], ['1'], ['0'], ['TRUE'], ['True'], ['FALSE'], [''], [' true'], ['true '], ['true\n'], ['null'], ['undefined'],
    ['true', 'false'], ['false', 'true'], ['true', 'true'], ['', ''],
  ];
  for (const values of bad) assert.deepEqual(parseOverdue(values), OVERDUE_BAD, JSON.stringify(values));
});

test('parseOverdue does not share its error object and does not mutate its input', () => {
  const e1 = parseOverdue(['yes']);
  e1.error = 'changed';
  assert.deepEqual(parseOverdue(['yes']), OVERDUE_BAD);
  const input = Object.freeze(['true']);
  assert.deepEqual(parseOverdue(input), { overdue: true });
});
