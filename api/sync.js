// GET  /api/sync?userId=&since=ISO   -> filas del usuario cambiadas desde `since`
// POST /api/sync {userId, workout_logs[], supplement_logs[], weight_logs[], deletions{}}
//   -> upsert por id + tombstones. Idempotente.
//
// Formato de fila del cliente (mismo que localStorage):
//   workout_logs:    { id, exercise, weight, reps, date }
//   supplement_logs: { id, type, amount, date }
//   weight_logs:     { id, weight, date }
import { sql, readJson, json } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const userId = req.query.userId;
      const since = req.query.since || "1970-01-01T00:00:00Z";
      if (!userId) return json(res, 400, { error: "userId es obligatorio" });

      const [workout, supps, weights] = await Promise.all([
        sql`SELECT id, exercise, weight, reps, logged_at AS date, deleted, updated_at
            FROM workout_logs WHERE user_id = ${userId} AND updated_at > ${since}`,
        sql`SELECT id, type, amount, logged_at AS date, deleted, updated_at
            FROM supplement_logs WHERE user_id = ${userId} AND updated_at > ${since}`,
        sql`SELECT id, weight, logged_at AS date, deleted, updated_at
            FROM weight_logs WHERE user_id = ${userId} AND updated_at > ${since}`,
      ]);

      return json(res, 200, {
        serverTime: new Date().toISOString(),
        workout_logs: workout,
        supplement_logs: supps,
        weight_logs: weights,
      });
    }

    if (req.method === "POST") {
      const b = await readJson(req);
      const userId = b.userId;
      if (!userId) return json(res, 400, { error: "userId es obligatorio" });

      for (const l of b.workout_logs || []) {
        await sql`
          INSERT INTO workout_logs (id, user_id, exercise, weight, reps, logged_at, deleted, updated_at)
          VALUES (${l.id}, ${userId}, ${l.exercise}, ${l.weight}, ${l.reps}, ${l.date}, false, now())
          ON CONFLICT (id) DO UPDATE SET
            exercise = EXCLUDED.exercise, weight = EXCLUDED.weight,
            reps = EXCLUDED.reps, logged_at = EXCLUDED.logged_at,
            deleted = false, updated_at = now()
        `;
      }
      for (const l of b.supplement_logs || []) {
        await sql`
          INSERT INTO supplement_logs (id, user_id, type, amount, logged_at, deleted, updated_at)
          VALUES (${l.id}, ${userId}, ${l.type}, ${l.amount}, ${l.date}, false, now())
          ON CONFLICT (id) DO UPDATE SET
            type = EXCLUDED.type, amount = EXCLUDED.amount,
            logged_at = EXCLUDED.logged_at, deleted = false, updated_at = now()
        `;
      }
      for (const l of b.weight_logs || []) {
        await sql`
          INSERT INTO weight_logs (id, user_id, weight, logged_at, deleted, updated_at)
          VALUES (${l.id}, ${userId}, ${l.weight}, ${l.date}, false, now())
          ON CONFLICT (id) DO UPDATE SET
            weight = EXCLUDED.weight, logged_at = EXCLUDED.logged_at,
            deleted = false, updated_at = now()
        `;
      }

      const d = b.deletions || {};
      for (const id of d.workout_logs || [])
        await sql`UPDATE workout_logs SET deleted = true, updated_at = now() WHERE id = ${id} AND user_id = ${userId}`;
      for (const id of d.supplement_logs || [])
        await sql`UPDATE supplement_logs SET deleted = true, updated_at = now() WHERE id = ${id} AND user_id = ${userId}`;
      for (const id of d.weight_logs || [])
        await sql`UPDATE weight_logs SET deleted = true, updated_at = now() WHERE id = ${id} AND user_id = ${userId}`;

      return json(res, 200, { ok: true, serverTime: new Date().toISOString() });
    }

    return json(res, 405, { error: "Método no permitido" });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}
