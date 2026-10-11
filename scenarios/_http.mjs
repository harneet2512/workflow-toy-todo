// Helper for scenarios: one tenant per scenario, JSON in and out over the real server.
export function client(ctx) {
  const key = ctx.uid('lv-');
  const call = async (method, path, body, headers = { 'x-api-key': key }) => {
    const res = await fetch(ctx.app.url + path, {
      method,
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text === '' ? undefined : JSON.parse(text) };
  };
  return { key, call };
}
