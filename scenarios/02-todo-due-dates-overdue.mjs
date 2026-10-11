import { client } from './_http.mjs';

export const meta = {
  name: 'todo-due-dates-overdue',
  journey: ['J4.overdue-list', 'J5.no-regression'],
  concerns: ['JOB-05', 'JOB-07', 'API-05', 'ID-01'],
};

const OVERDUE_BAD = { error: 'overdue must be true or false' };
// Dates come from the real UTC clock when the scenario runs; the server has no clock override.
const utcDay = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export default async function (ctx) {
  const mine = client(ctx);
  const theirs = client(ctx);
  const titles = (res) => res.body.todos.map((t) => t.title);

  ctx.step('J4: one tenant has late, due today, due tomorrow, undated and done-and-late todos');
  const make = (c, body) => c.call('POST', '/todos', body).then((r) => r.body);
  await make(mine, { title: 'ancient', dueDate: '2000-01-01' });
  await make(mine, { title: 'yesterday', dueDate: utcDay(-1) });
  await make(mine, { title: 'today', dueDate: utcDay(0) });
  await make(mine, { title: 'tomorrow', dueDate: utcDay(1) });
  await make(mine, { title: 'far future', dueDate: '9999-12-31' });
  await make(mine, { title: 'undated' });
  const doneLate = await make(mine, { title: 'late but done', dueDate: utcDay(-1) });
  await mine.call('PATCH', `/todos/${doneLate.id}`, { done: true });
  const hisLate = await make(theirs, { title: 'his late one', dueDate: utcDay(-5) });

  ctx.step('J4: the overdue list');
  const mineOverdue = await mine.call('GET', '/todos?overdue=true');
  ctx.expect('overdue=true is 200', mineOverdue.status, 200);
  ctx.expect('only the late, not-done todos, in creation order', titles(mineOverdue), ['ancient', 'yesterday']);
  const theirsOverdue = await theirs.call('GET', '/todos?overdue=true');
  ctx.expect('the other tenant sees only its own late todo', titles(theirsOverdue), ['his late one']);
  ctx.expect('and its id is its own', theirsOverdue.body.todos[0].id, hisLate.id);

  ctx.step('J4: no parameter and overdue=false list everything');
  const all = ['ancient', 'yesterday', 'today', 'tomorrow', 'far future', 'undated', 'late but done'];
  ctx.expect('no parameter lists all', titles(await mine.call('GET', '/todos')), all);
  ctx.expect('overdue=false lists all', titles(await mine.call('GET', '/todos?overdue=false')), all);

  ctx.step('J4: refused values');
  for (const query of ['?overdue=yes', '?overdue=1', '?overdue=TRUE', '?overdue=', '?overdue=true&overdue=false']) {
    const r = await mine.call('GET', `/todos${query}`);
    ctx.expect(`${query} is 400 with the exact body`, [r.status, r.body], [400, OVERDUE_BAD]);
  }

  ctx.step('J4: finishing a todo or clearing its date takes it off the list');
  const list = (await mine.call('GET', '/todos?overdue=true')).body.todos;
  await mine.call('PATCH', `/todos/${list[0].id}`, { done: true });
  ctx.expect('after marking the oldest done', titles(await mine.call('GET', '/todos?overdue=true')), ['yesterday']);
  await mine.call('PATCH', `/todos/${list[1].id}`, { dueDate: null });
  ctx.expect('after clearing the other date', titles(await mine.call('GET', '/todos?overdue=true')), []);

  ctx.step('J5: no key is 401');
  const noKey = await mine.call('GET', '/todos?overdue=true', undefined, {});
  ctx.expect('a missing key is 401', noKey.status, 401);
}
