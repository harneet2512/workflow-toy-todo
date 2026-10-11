import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDueDate, DUE_DATE_ERROR } from '../src/dueDate.mjs';

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
