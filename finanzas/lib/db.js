import { neon } from "@neondatabase/serverless";
export const sql = neon(process.env.DATABASE_URL);

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
