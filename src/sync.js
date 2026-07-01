// Motor de datos local-first: guarda todo en localStorage (por usuario) y sincroniza
// con Neon vía /api/sync cuando hay conexión. Diseñado para funcionar offline en el gym.

export const ACTIVE_KEY = "jd-active-user";
const USERS_CACHE = "jd-users-cache";
const USERS_PENDING = "jd-users-pending";

// kind interno -> { store: prefijo localStorage, cat: categoría del API }
const KINDS = {
  logs: { store: "jd-workout-logs", cat: "workout_logs" },
  supps: { store: "jd-supplement-logs", cat: "supplement_logs" },
  weights: { store: "jd-weight-logs", cat: "weight_logs" },
};

// ---- utilidades base ----

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* almacenamiento lleno o no disponible */
  }
}

// Normaliza fechas del servidor (timestamptz) a ISO para que Safari las parsee.
function toIso(d) {
  if (!d) return new Date().toISOString();
  if (typeof d === "string" && d.includes(" ") && !d.includes("T")) {
    d = d.replace(" ", "T");
  }
  const t = new Date(d);
  return isNaN(t) ? String(d) : t.toISOString();
}

// ---- perfil activo ----

export function getActiveUserId() {
  try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
}
export function setActiveUserId(id) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* noop */ }
}
export function clearActiveUser() {
  try { localStorage.removeItem(ACTIVE_KEY); } catch { /* noop */ }
}

// ---- datos por usuario ----

export function loadUserData(userId) {
  return {
    logs: read(`${KINDS.logs.store}:${userId}`, []),
    supps: read(`${KINDS.supps.store}:${userId}`, []),
    weights: read(`${KINDS.weights.store}:${userId}`, []),
  };
}

export function saveUserKind(userId, kind, arr) {
  write(`${KINDS[kind].store}:${userId}`, arr);
}

// ---- cola de sincronización (pendientes de subir) ----

function queueKey(userId) { return `jd-sync-queue:${userId}`; }
function emptyQueue() {
  return { workout_logs: {}, supplement_logs: {}, weight_logs: {},
           deletions: { workout_logs: [], supplement_logs: [], weight_logs: [] } };
}
function getQueue(userId) { return read(queueKey(userId), emptyQueue()); }
function setQueue(userId, q) { write(queueKey(userId), q); }

// Registra un upsert pendiente para una fila.
export function enqueueUpsert(userId, kind, row) {
  const q = getQueue(userId);
  q[KINDS[kind].cat][row.id] = row;
  setQueue(userId, q);
  schedulePush(userId);
}

// Registra un borrado pendiente.
export function enqueueDeletion(userId, kind, id) {
  const q = getQueue(userId);
  const cat = KINDS[kind].cat;
  delete q[cat][id];
  if (!q.deletions[cat].includes(id)) q.deletions[cat].push(id);
  setQueue(userId, q);
  schedulePush(userId);
}

// ---- since (cursor de última sincronización) ----

function sinceKey(userId) { return `jd-sync-since:${userId}`; }
function getSince(userId) { try { return localStorage.getItem(sinceKey(userId)) || null; } catch { return null; } }
function setSince(userId, iso) { try { localStorage.setItem(sinceKey(userId), iso); } catch { /* noop */ } }

// ---- red ----

let pushTimers = {};
function schedulePush(userId) {
  clearTimeout(pushTimers[userId]);
  pushTimers[userId] = setTimeout(() => { pushSync(userId).catch(() => {}); }, 1200);
}

export async function pushSync(userId) {
  await flushPendingUsers();
  const q = getQueue(userId);
  const hasUpserts =
    Object.keys(q.workout_logs).length || Object.keys(q.supplement_logs).length || Object.keys(q.weight_logs).length;
  const hasDeletions =
    q.deletions.workout_logs.length || q.deletions.supplement_logs.length || q.deletions.weight_logs.length;
  if (!hasUpserts && !hasDeletions) return;

  const body = {
    userId,
    workout_logs: Object.values(q.workout_logs),
    supplement_logs: Object.values(q.supplement_logs),
    weight_logs: Object.values(q.weight_logs),
    deletions: q.deletions,
  };
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("push falló");
  setQueue(userId, emptyQueue()); // enviado con éxito
}

// Descarga cambios del servidor y los mezcla en local. Devuelve los datos mezclados.
export async function pullSync(userId) {
  const since = getSince(userId);
  const url = `/api/sync?userId=${encodeURIComponent(userId)}${since ? `&since=${encodeURIComponent(since)}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("pull falló");
  const data = await res.json();

  const merged = {};
  for (const kind of Object.keys(KINDS)) {
    const cat = KINDS[kind].cat;
    const local = read(`${KINDS[kind].store}:${userId}`, []);
    const map = new Map(local.map((r) => [r.id, r]));
    for (const row of data[cat] || []) {
      if (row.deleted) {
        map.delete(row.id);
      } else {
        const clean = { ...row, date: toIso(row.date) };
        delete clean.deleted;
        delete clean.updated_at;
        // Neon devuelve NUMERIC como string: forzar a número.
        if (clean.weight != null) clean.weight = Number(clean.weight);
        if (clean.reps != null) clean.reps = Number(clean.reps);
        if (clean.amount != null) clean.amount = Number(clean.amount);
        map.set(row.id, clean);
      }
    }
    const arr = Array.from(map.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
    saveUserKind(userId, kind, arr);
    merged[kind] = arr;
  }
  if (data.serverTime) setSince(userId, data.serverTime);
  return merged;
}

// Sube pendientes y luego baja cambios. Silencioso si no hay red.
export async function fullSync(userId) {
  try {
    await pushSync(userId);
    return await pullSync(userId);
  } catch {
    return null; // offline: seguimos con lo local
  }
}

// ---- perfiles ----

export function getCachedUsers() { return read(USERS_CACHE, []); }
function cacheUsers(list) { write(USERS_CACHE, list); }

export async function fetchUsers() {
  const cached = getCachedUsers();
  try {
    const res = await fetch("/api/users");
    if (!res.ok) throw new Error("fetch users falló");
    const { users } = await res.json();
    // Une con perfiles locales aún no subidos.
    const pending = read(USERS_PENDING, []);
    const byId = new Map(users.map((u) => [u.id, u]));
    for (const p of pending) if (!byId.has(p.id)) byId.set(p.id, p);
    const merged = Array.from(byId.values());
    cacheUsers(merged);
    return merged;
  } catch {
    return cached;
  }
}

export async function createUser(profile) {
  // Cachea de inmediato para que el flujo local no dependa de la red.
  const users = getCachedUsers();
  if (!users.find((u) => u.id === profile.id)) { users.push(profile); cacheUsers(users); }
  try {
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    if (!res.ok) throw new Error("create user falló");
  } catch {
    const pending = read(USERS_PENDING, []);
    if (!pending.find((u) => u.id === profile.id)) { pending.push(profile); write(USERS_PENDING, pending); }
  }
  return profile;
}

async function flushPendingUsers() {
  const pending = read(USERS_PENDING, []);
  if (!pending.length) return;
  const remain = [];
  for (const p of pending) {
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw new Error("retry user falló");
    } catch {
      remain.push(p);
    }
  }
  write(USERS_PENDING, remain);
}

// ---- migración de datos legacy (single-user) al nuevo perfil ----

export function hasLegacyData() {
  for (const k of Object.values(KINDS)) {
    const v = read(k.store, null);
    if (Array.isArray(v) && v.length) return true;
  }
  return false;
}

// Copia los datos legacy al namespace del usuario y los encola para subir.
export function migrateLegacyTo(userId) {
  for (const kind of Object.keys(KINDS)) {
    const legacy = read(KINDS[kind].store, []);
    if (!Array.isArray(legacy) || !legacy.length) continue;
    const existing = read(`${KINDS[kind].store}:${userId}`, []);
    const byId = new Map(existing.map((r) => [r.id, r]));
    for (const row of legacy) {
      byId.set(row.id, row);
      enqueueUpsert(userId, kind, row);
    }
    saveUserKind(userId, kind, Array.from(byId.values()));
    try { localStorage.removeItem(KINDS[kind].store); } catch { /* noop */ }
  }
}

// Reintenta la sincronización cuando vuelve la conexión.
export function registerOnlineRetry(getUserId) {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    const id = getUserId();
    if (id) fullSync(id).catch(() => {});
  });
}
