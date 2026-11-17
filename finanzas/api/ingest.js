// POST /api/ingest  { text }   (header x-token: FIN_TOKEN)
// Lo llama el Atajo de iPhone cada vez que llega un SMS/correo del banco.
// Guarda la notificación en la bandeja; la app la convierte en movimiento y te pregunta
// "¿Personal o Casa?" la próxima vez que la abras.
import { sql, readBody, json, authorized, ensureTables } from "../lib/db.js";
import { parseNotification } from "../src/parser.js";

export default async function handler(req, res) {
  if (!authorized(req)) return json(res, 401, { error: "token inválido" });
  await ensureTables();
  if (req.method !== "POST") return json(res, 405, { error: "usa POST" });
  const b = await readBody(req);
  const text = (b.text || b.mensaje || "").toString().slice(0, 4000);
  const parsed = parseNotification(text);
  if (!parsed) return json(res, 200, { ok: false, reason: "No parece un movimiento (no encontré un monto)" });
  await sql`INSERT INTO fin_inbox (raw, parsed) VALUES (${text}, ${JSON.stringify(parsed)})`;
  return json(res, 200, { ok: true, parsed });
}
