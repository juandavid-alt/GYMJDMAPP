// Crea el esquema en Neon (idempotente). Ejecuta:  node scripts/db-setup.mjs
// Requiere DATABASE_URL en el entorno (o en .env.local).
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

// Carga .env.local de forma simple si DATABASE_URL no está en el entorno.
function loadEnvLocal() {
  if (process.env.DATABASE_URL) return;
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/i);
      if (m) {
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[m[1]]) process.env[m[1]] = v;
      }
    }
  } catch {
    /* sin .env.local */
  }
}

loadEnvLocal();

if (!process.env.DATABASE_URL) {
  console.error("✗ Falta DATABASE_URL (ponla en .env.local o en el entorno).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      sex           TEXT,
      birth_year    INT,
      height_cm     NUMERIC,
      weight_kg     NUMERIC,
      goal          TEXT,
      experience    TEXT,
      days_per_week INT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise   TEXT NOT NULL,
      weight     NUMERIC NOT NULL,
      reps       INT NOT NULL,
      logged_at  TIMESTAMPTZ NOT NULL,
      deleted    BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS supplement_logs (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type       TEXT NOT NULL,
      amount     NUMERIC NOT NULL,
      logged_at  TIMESTAMPTZ NOT NULL,
      deleted    BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      weight     NUMERIC NOT NULL,
      logged_at  TIMESTAMPTZ NOT NULL,
      deleted    BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_workout_user ON workout_logs(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supp_user ON supplement_logs(user_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_weight_user ON weight_logs(user_id)`;

  const [{ count }] = await sql`SELECT count(*)::int AS count FROM users`;
  console.log(`✓ Esquema listo en Neon. Perfiles existentes: ${count}`);
}

main().catch((e) => {
  console.error("✗ Error creando el esquema:", e.message);
  process.exit(1);
});
