// GET  /api/users        -> lista de perfiles
// POST /api/users {..}    -> crea perfil (y siembra el peso inicial en weight_logs)
import { sql, readJson, json } from "../lib/db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const rows = await sql`
        SELECT id, name, sex, birth_year, height_cm, weight_kg, goal,
               experience, days_per_week, created_at
        FROM users
        ORDER BY created_at ASC
      `;
      return json(res, 200, { users: rows });
    }

    if (req.method === "POST") {
      const b = await readJson(req);
      if (!b.id || !b.name) {
        return json(res, 400, { error: "id y name son obligatorios" });
      }

      const rows = await sql`
        INSERT INTO users (id, name, sex, birth_year, height_cm, weight_kg,
                           goal, experience, days_per_week)
        VALUES (${b.id}, ${b.name}, ${b.sex ?? null}, ${b.birth_year ?? null},
                ${b.height_cm ?? null}, ${b.weight_kg ?? null}, ${b.goal ?? null},
                ${b.experience ?? null}, ${b.days_per_week ?? null})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name, sex = EXCLUDED.sex, birth_year = EXCLUDED.birth_year,
          height_cm = EXCLUDED.height_cm, weight_kg = EXCLUDED.weight_kg,
          goal = EXCLUDED.goal, experience = EXCLUDED.experience,
          days_per_week = EXCLUDED.days_per_week
        RETURNING id, name, sex, birth_year, height_cm, weight_kg, goal,
                  experience, days_per_week, created_at
      `;

      // Siembra el peso inicial como primer weight_log (si vino y hay id de log).
      if (b.weight_kg && b.weight_log_id) {
        await sql`
          INSERT INTO weight_logs (id, user_id, weight, logged_at)
          VALUES (${b.weight_log_id}, ${b.id}, ${b.weight_kg}, ${b.logged_at ?? new Date().toISOString()})
          ON CONFLICT (id) DO NOTHING
        `;
      }

      return json(res, 200, { user: rows[0] });
    }

    return json(res, 405, { error: "Método no permitido" });
  } catch (e) {
    return json(res, 500, { error: e.message });
  }
}
