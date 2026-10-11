// In-memory store, one map of todos per tenant (API key). Values are frozen; updates replace them.
let nextId = 1;
const tenants = new Map();

const bucket = (tenant) => {
  if (!tenants.has(tenant)) tenants.set(tenant, new Map());
  return tenants.get(tenant);
};

// A todo has a `dueDate` key only when it has a date; callers pass values from normalizeDueDate.
export function createTodo(tenant, { title, dueDate }) {
  const base = { id: String(nextId++), title, done: false, createdAt: new Date().toISOString() };
  const todo = Object.freeze(typeof dueDate === 'string' ? { ...base, dueDate } : base);
  bucket(tenant).set(todo.id, todo);
  return todo;
}

export function listTodos(tenant) {
  return [...bucket(tenant).values()];
}

export function getTodo(tenant, id) {
  return bucket(tenant).get(id) ?? null;
}

export function updateTodo(tenant, id, patch) {
  const current = getTodo(tenant, id);
  if (!current) return null;
  // `dueDate: null` clears the date: build a new value without the key (frozen values cannot be deleted from).
  const { dueDate, ...merged } = { ...current, ...patch };
  const next = Object.freeze(typeof dueDate === 'string' ? { ...merged, dueDate } : merged);
  bucket(tenant).set(id, next);
  return next;
}

export function deleteTodo(tenant, id) {
  return bucket(tenant).delete(id);
}

export function resetStore() {
  tenants.clear();
  nextId = 1;
}
