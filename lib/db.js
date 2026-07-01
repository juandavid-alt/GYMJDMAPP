// Cliente Neon compartido para las funciones serverless de Vercel.
import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL);

// Helper: lee el body JSON de una request de Vercel (Node runtime).
export async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

// Helper: responde JSON con status.
export function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}
