import { client } from './_http.mjs';

export const meta = {
  name: 'todo-due-dates-happy-path',
  journey: ['J1.set-on-create', 'J2.update-date', 'J3.refuse-bad-date', 'J5.no-regression'],
  concerns: ['ID-01', 'CORE-02', 'API-02', 'API-04'],
};

const BAD_DATE_BODY = { error: 'dueDate must be a valid date in YYYY-MM-DD format' };

export default async function (ctx) {
  const { call } = client(ctx);

  ctx.step('J1: create with a due date, read it back');
  const created = await call('POST', '/todos', { title: 'file taxes', dueDate: '2026-12-31' });
  ctx.expect('POST with dueDate is 201', created.status, 201);
  ctx.expect('the response carries the date', created.body.dueDate, '2026-12-31');
  const id = created.body.id;
  const fetched = await call('GET', `/todos/${id}`);
  ctx.expect('GET one shows the date', fetched.body.dueDate, '2026-12-31');
  const listed = await call('GET', '/todos');
  ctx.expect('the list shows the date', listed.body.todos.map((t) => t.dueDate), ['2026-12-31']);

  ctx.step('J1: no date and null leave no dueDate key');
  const undated = await call('POST', '/todos', { title: 'no date' });
  ctx.ok('undated todo has no dueDate key', undated.status === 201 && !('dueDate' in undated.body), undated.body);
  const nullDated = await call('POST', '/todos', { title: 'null date', dueDate: null });
  ctx.ok('null on create leaves no dueDate key', nullDated.status === 201 && !('dueDate' in nullDated.body), nullDated.body);

  ctx.step('J2: replace, keep, clear');
  const replaced = await call('PATCH', `/todos/${id}`, { dueDate: '2027-01-15' });
  ctx.expect('PATCH replaces the date', [replaced.status, replaced.body.dueDate], [200, '2027-01-15']);
  const doneOnly = await call('PATCH', `/todos/${id}`, { done: true });
  ctx.expect('a done-only PATCH keeps the date', [doneOnly.status, doneOnly.body.dueDate, doneOnly.body.done], [200, '2027-01-15', true]);
  const cleared = await call('PATCH', `/todos/${id}`, { dueDate: null });
  ctx.ok('null clears: the key is gone', cleared.status === 200 && !('dueDate' in cleared.body), cleared.body);
  const afterClear = await call('GET', `/todos/${id}`);
  ctx.ok('GET after clearing has no dueDate key', !('dueDate' in afterClear.body), afterClear.body);

  ctx.step('J3: refused dates');
  const impossible = await call('POST', '/todos', { title: 'x', dueDate: '2026-02-30' });
  ctx.expect('POST 2026-02-30 is refused with the exact body', [impossible.status, impossible.body], [400, BAD_DATE_BODY]);
  for (const bad of ['2026-10-11T00:00:00Z', '', 42]) {
    const r = await call('POST', '/todos', { title: 'x', dueDate: bad });
    ctx.expect(`POST ${JSON.stringify(bad)} is 400 with the exact body`, [r.status, r.body], [400, BAD_DATE_BODY]);
  }
  const refusedCount = (await call('GET', '/todos')).body.todos.length;
  ctx.expect('nothing was added by refused POSTs', refusedCount, 3);

  ctx.step('J3: a refused PATCH changes nothing');
  const target = (await call('POST', '/todos', { title: 'keep me', dueDate: '2026-06-01' })).body;
  const refused = await call('PATCH', `/todos/${target.id}`, { title: 'new title', done: true, dueDate: '2026-13-01' });
  ctx.expect('PATCH with a bad date and good title and done is 400', [refused.status, refused.body], [400, BAD_DATE_BODY]);
  const unchanged = await call('GET', `/todos/${target.id}`);
  ctx.expect('the todo is exactly as it was', unchanged.body, target);

  ctx.step('J3: unknown ids');
  const unknownBad = await call('PATCH', '/todos/does-not-exist', { dueDate: 'tomorrow' });
  ctx.expect('bad date on an unknown id is 400', [unknownBad.status, unknownBad.body], [400, BAD_DATE_BODY]);
  const unknownGood = await call('PATCH', '/todos/does-not-exist', { dueDate: '2026-06-01' });
  ctx.expect('good date on an unknown id is 404', unknownGood.status, 404);

  ctx.step('J5: no key is 401, another tenant sees nothing');
  const noKey = await call('GET', '/todos', undefined, {});
  ctx.expect('a missing key is 401', noKey.status, 401);
  const other = client(ctx);
  const otherList = await other.call('GET', '/todos');
  ctx.expect('another tenant sees no todos', otherList.body.todos, []);
  const otherPatch = await other.call('PATCH', `/todos/${target.id}`, { dueDate: null });
  ctx.expect('another tenant cannot clear my date (404)', otherPatch.status, 404);
  const still = await call('GET', `/todos/${target.id}`);
  ctx.expect('my date is intact', still.body.dueDate, '2026-06-01');
}
