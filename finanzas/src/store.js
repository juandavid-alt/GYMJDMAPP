// Estado local-first (localStorage) + respaldo/bandeja en la nube si hay token.
import { merchantKey } from "./categories.js";

const KEY = "finanzas.v1";
export const emptyState = () => ({
  txs: [],
  rules: {}, // merchantKey -> { scope, category }
  budgets: { personal: 0, casa: 0 },
  settings: { token: "", usdRate: 4000, lastSync: null },
});

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s) return { ...emptyState(), ...s, settings: { ...emptyState().settings, ...s.settings } };
  } catch {}
  return emptyState();
}
export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {}
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const copValue = (tx, rate) => (tx.currency === "USD" ? tx.amount * (rate || 4000) : tx.amount);

// Convierte un resultado del parser en movimiento, aplicando reglas aprendidas.
export function txFromParsed(p, rules, id = uid()) {
  const rule = rules[merchantKey(p.merchant)];
  return {
    id, amount: p.amount, currency: p.currency || "COP", type: p.type, merchant: p.merchant,
    category: rule?.category || p.category, method: p.method, last4: p.last4, bank: p.bank,
    date: p.date, raw: p.raw || "",
    scope: p.type === "gasto" ? rule?.scope || null : null,
    auto: !!rule?.scope, u: Date.now(),
  };
}

// Une dos listas de movimientos por id; gana la versión editada más recientemente.
export function mergeTxs(a, b) {
  const m = new Map();
  for (const t of [...a, ...b]) {
    const cur = m.get(t.id);
    if (!cur || (t.u || 0) > (cur.u || 0)) m.set(t.id, t);
  }
  return [...m.values()];
}

async function api(path, token, opts = {}) {
  const r = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", "x-token": token, ...(opts.headers || {}) },
  });
  if (!r.ok) throw new Error(r.status === 401 ? "Token inválido" : `Error ${r.status}`);
  return r.json();
}

// Trae la nube, mezcla, importa la bandeja de notificaciones y sube el resultado.
export async function sync(state) {
  const token = state.settings.token;
  if (!token) return { state, imported: 0 };
  const remote = await api("/api/state", token);
  const rd = remote.data || {};
  const rules = { ...(rd.rules || {}), ...state.rules };
  let txs = mergeTxs(rd.txs || [], state.txs);
  const known = new Set(txs.map((t) => t.id));
  const fresh = remote.inbox
    .filter((i) => i.parsed && !known.has(`in-${i.id}`))
    .map((i) => txFromParsed(i.parsed, rules, `in-${i.id}`));
  txs = [...txs, ...fresh];
  const next = {
    ...state,
    txs,
    rules,
    budgets: state.budgets.personal || state.budgets.casa ? state.budgets : rd.budgets || state.budgets,
    settings: { ...state.settings, lastSync: new Date().toISOString() },
  };
  await push(next, remote.inbox.map((i) => i.id));
  return { state: next, imported: fresh.length };
}

export async function push(state, consumed = []) {
  if (!state.settings.token) return;
  const { token, ...settings } = state.settings; // el token nunca se sube
  await api("/api/state", token, {
    method: "PUT",
    body: JSON.stringify({ data: { ...state, settings }, consumed }),
  });
}
