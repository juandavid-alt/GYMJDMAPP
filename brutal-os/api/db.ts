// GET: lee la base de datos · PUT: la guarda con control de concurrencia (If-Match = ETag)
import { BlobPreconditionFailedError, head } from "@vercel/blob";
import { escribirBlob, json, leerBlob, leerSesion, ROLES_ESCRITURA, RUTA_DB } from "./_lib.js";

export async function GET(req: Request) {
  const s = leerSesion(req);
  if (!s) return json({ error: "Sesión vencida" }, 401);
  const r = await leerBlob<unknown>(RUTA_DB);
  return json({ db: r?.datos ?? null, etag: r?.etag ?? null });
}

export async function PUT(req: Request) {
  const s = leerSesion(req);
  if (!s) return json({ error: "Sesión vencida" }, 401);
  if (!ROLES_ESCRITURA.includes(s.rol)) return json({ error: "Tu perfil es de solo consulta" }, 403);
  const etag = req.headers.get("if-match") ?? undefined;
  const cuerpo = (await req.json().catch(() => null)) as { db?: { version?: number } } | null;
  if (!cuerpo?.db || typeof cuerpo.db !== "object" || !cuerpo.db.version) return json({ error: "Datos inválidos" }, 400);
  if (!etag) {
    // Solo se crea sin ETag cuando la base aún no existe (carga inicial del administrador)
    if (s.rol !== "ADMINISTRADOR") return json({ error: "Solo un administrador inicializa la base" }, 403);
    if (await head(RUTA_DB).catch(() => null)) return json({ error: "La base ya existe" }, 409);
  }
  try {
    const nuevo = await escribirBlob(RUTA_DB, cuerpo.db, etag);
    // Respaldo diario (el primero de cada día queda como copia de seguridad)
    const dia = new Date().toISOString().slice(0, 10);
    const ruta = `brutal/respaldos/${dia}.json`;
    if (!(await head(ruta).catch(() => null))) await escribirBlob(ruta, cuerpo.db).catch(() => undefined);
    return json({ etag: nuevo });
  } catch (e) {
    if (e instanceof BlobPreconditionFailedError) {
      const actual = await leerBlob<unknown>(RUTA_DB);
      return json({ error: "Otra persona guardó cambios antes", db: actual?.datos ?? null, etag: actual?.etag ?? null }, 409);
    }
    throw e;
  }
}
