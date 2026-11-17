// GET  /api/state          -> { data, updatedAt, inbox: [...pendientes] }
// PUT  /api/state { data, consumed: [ids] } -> guarda tu estado y marca la bandeja como leída
// Respaldo en la nube (Neon) para no perder nada si cambias de teléfono.
import { sql, readBody, json, authorized } from "../lib/db.js";

export default async function handler(req, res) {
  if (!authorized(req)) return json(res, 401, { error: "token inválido" });
  if (req.method === "GET") {
    const [row] = await sql`SELECT data, updated_at FROM fin_state WHERE id = 'me'`;
    const inbox = await sql`SELECT id, raw, parsed, created_at FROM fin_inbox WHERE consumed = false ORDER BY id`;
    return json(res, 200, { data: row?.data || null, updatedAt: row?.updated_at || null, inbox });
  }
  if (req.method === "PUT") {
    const b = await readBody(req);
    if (b.data) {
      await sql`INSERT INTO fin_state (id, data, updated_at) VALUES ('me', ${JSON.stringify(b.data)}, now())
                ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    }
    const ids = (b.consumed || []).map(Number).filter(Boolean);
    if (ids.length) await sql`UPDATE fin_inbox SET consumed = true WHERE id = ANY(${ids})`;
    return json(res, 200, { ok: true });
  }
  return json(res, 405, { error: "método no soportado" });
}
