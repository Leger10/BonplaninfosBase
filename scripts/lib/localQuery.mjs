export const API_BASE = process.env.LOGIN_URL || process.env.API_BASE || "http://127.0.0.1:8888";

async function query(body) {
  const res = await fetch(`${API_BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`query ${res.status}`);
  return res.json();
}

export function localQuery(table) {
  let selectCols = "*";
  const filters = [];
  let orderArr = null;
  let limitN = null;
  const build = () => ({
    table,
    method: "select",
    select: selectCols,
    filters,
    order: orderArr,
    limit: limitN,
  });
  const client = {
    select(cols) {
      selectCols = cols;
      return client;
    },
    eq(column, value) {
      filters.push({ column, op: "eq", value });
      return client;
    },
    order(column, { ascending = true } = {}) {
      orderArr = { column, ascending };
      return client;
    },
    limit(n) {
      limitN = n;
      return client;
    },
    then(onFulfilled, onRejected) {
      return query(build()).then(
        (json) => onFulfilled({ data: json.data, error: json.error }),
        onRejected
      );
    },
  };
  return client;
}