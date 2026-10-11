// In-memory store, one map of todos per tenant (API key). Values are frozen; updates replace them.
let nextId = 1;
const tenants = new Map();

const bucket = (tenant) => {
  if (!tenants.has(tenant)) tenants.set(tenant, new Map());
  return tenants.get(tenant);
};

export function createTodo(tenant, { title }) {
  const todo = Object.freeze({ id: String(nextId++), title, done: false, createdAt: new Date().toISOString() });
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
  const next = Object.freeze({ ...current, ...patch });
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
