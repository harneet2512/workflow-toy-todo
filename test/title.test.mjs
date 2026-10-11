import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTitle, MAX_TITLE_LENGTH } from '../src/title.mjs';

const REQUIRED = { error: 'title is required' };
const TOO_LONG = { error: 'title must be 200 characters or fewer' };
const NBSP = ' ';

test('the limit is 200', () => {
  assert.equal(MAX_TITLE_LENGTH, 200);
});

test('a plain title is returned as is', () => {
  assert.deepEqual(normalizeTitle('buy milk'), { title: 'buy milk' });
});

test('spaces, tabs, newlines and NBSP are trimmed from both ends', () => {
  assert.deepEqual(normalizeTitle('  buy milk  '), { title: 'buy milk' });
  assert.deepEqual(normalizeTitle('\t\nbuy milk\r\n'), { title: 'buy milk' });
  assert.deepEqual(normalizeTitle(`${NBSP}buy milk${NBSP}`), { title: 'buy milk' });
});

test('inner whitespace is kept', () => {
  assert.deepEqual(normalizeTitle(' buy  milk '), { title: 'buy  milk' });
});

test('empty and whitespace-only titles are refused as required', () => {
  assert.deepEqual(normalizeTitle(''), REQUIRED);
  assert.deepEqual(normalizeTitle('   '), REQUIRED);
  assert.deepEqual(normalizeTitle('\t\n '), REQUIRED);
  assert.deepEqual(normalizeTitle(NBSP + NBSP), REQUIRED);
});

test('non-string titles are refused as required', () => {
  for (const raw of [null, undefined, 42, true, [], ['a'], {}, { title: 'x' }]) {
    assert.deepEqual(normalizeTitle(raw), REQUIRED);
  }
});

test('200 characters are accepted and 201 are refused', () => {
  assert.deepEqual(normalizeTitle('a'.repeat(200)), { title: 'a'.repeat(200) });
  assert.deepEqual(normalizeTitle('a'.repeat(201)), TOO_LONG);
});

test('length is counted after trimming', () => {
  const padded = ' '.repeat(10) + 'a'.repeat(200) + ' '.repeat(10);
  assert.deepEqual(normalizeTitle(padded), { title: 'a'.repeat(200) });
  assert.deepEqual(normalizeTitle(' ' + 'a'.repeat(201) + ' '), TOO_LONG);
});

test('length is counted in code points, not UTF-16 units', () => {
  const grin = '\u{1F600}';
  assert.equal(grin.length, 2);
  assert.deepEqual(normalizeTitle(grin.repeat(200)), { title: grin.repeat(200) });
  assert.deepEqual(normalizeTitle(grin.repeat(201)), TOO_LONG);
});

test('a multi-code-point emoji counts as its real total', () => {
  const thumbs = '\u{1F44D}\u{1F3FD}'; // thumbs up + skin tone = 2 code points
  assert.deepEqual(normalizeTitle(thumbs.repeat(100)), { title: thumbs.repeat(100) });
  assert.deepEqual(normalizeTitle(thumbs.repeat(101)), TOO_LONG);
});

test('a blank title is "required", not "too long", even when huge', () => {
  assert.deepEqual(normalizeTitle(' '.repeat(500)), REQUIRED);
});

test('the input is not mutated and the result is a fresh value', () => {
  const raw = '  x  ';
  const out = normalizeTitle(raw);
  assert.equal(raw, '  x  ');
  assert.deepEqual(out, { title: 'x' });
  assert.deepEqual(normalizeTitle(raw), out);
});
