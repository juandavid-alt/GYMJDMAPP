import { neon } from "@neondatabase/serverless";
// Acepta los nombres que crea la integración de Neon en Vercel (con o sin prefijo).
const url = process.env.DATABASE_URL || process.env.DATABASE_POSTGRES_URL || process.env.POSTGRES_URL;
export const sql = neon(url);

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return safe(req.body);
  return await new Promise((r) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => r(safe(d)));
  });
}
const safe = (d) => { try { return d ? JSON.parse(d) : {}; } catch { return { text: d }; } };

export function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

// Uso personal: una sola llave secreta (FIN_TOKEN) protege todo.
export function authorized(req) {
  const t = req.headers["x-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || req.query.token;
  return !!process.env.FIN_TOKEN && t === process.env.FIN_TOKEN;
}

// Crea las tablas la primera vez (así no hay que correr ningún script).
let ready;
export function ensureTables() {
  ready ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS fin_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())`;
    await sql`CREATE TABLE IF NOT EXISTS fin_inbox (id serial PRIMARY KEY, raw text NOT NULL, parsed jsonb, consumed boolean DEFAULT false, created_at timestamptz DEFAULT now())`;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}
