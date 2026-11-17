// Crea las tablas en Neon:  DATABASE_URL=... node scripts/db-setup.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
await sql`CREATE TABLE IF NOT EXISTS fin_state (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS fin_inbox (id serial PRIMARY KEY, raw text NOT NULL, parsed jsonb, consumed boolean DEFAULT false, created_at timestamptz DEFAULT now())`;
console.log("✓ Tablas fin_state y fin_inbox listas");
