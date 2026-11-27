// Gestión de usuarios (solo administradores). Las claves se guardan con scrypt + sal.
import { escribirBlob, hashClave, json, leerBlob, leerSesion, publico, RUTA_USUARIOS, type Rol, type Usuario } from "./_lib.js";

const ROLES: Rol[] = ["ADMINISTRADOR", "COORDINACION", "CONTADORA", "CONSULTA", "EMPLEADO"];

export async function GET(req: Request) {
  const s = leerSesion(req);
  if (!s || s.rol !== "ADMINISTRADOR") return json({ error: "Solo administradores" }, 403);
  const r = await leerBlob<Usuario[]>(RUTA_USUARIOS);
  return json({ usuarios: (r?.datos ?? []).map(publico) });
}

/** Crea o actualiza un usuario. Si viene `clave`, la reemplaza. */
export async function PUT(req: Request) {
  const s = leerSesion(req);
  if (!s || s.rol !== "ADMINISTRADOR") return json({ error: "Solo administradores" }, 403);
  const b = (await req.json().catch(() => ({}))) as Partial<Usuario> & { clave?: string };
  const usuario = (b.usuario ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,60}$/.test(usuario)) return json({ error: "Usuario inválido (mínimo 3 caracteres, sin espacios)" }, 400);
  if (b.rol && !ROLES.includes(b.rol)) return json({ error: "Rol inválido" }, 400);
  if (b.clave !== undefined && b.clave.length < 8) return json({ error: "La clave debe tener al menos 8 caracteres" }, 400);

  const r = await leerBlob<Usuario[]>(RUTA_USUARIOS);
  const lista = r?.datos ?? [];
  const i = lista.findIndex((u) => u.usuario === usuario);
  if (i < 0 && !b.clave) return json({ error: "Asigna una clave al usuario nuevo" }, 400);
  const base: Usuario = i >= 0 ? lista[i] : { usuario, nombre: "", rol: "CONSULTA", perfilId: "", empleadoId: "", salt: "", hash: "", activo: true, creado: new Date().toISOString() };
  const nuevo: Usuario = {
    ...base,
    nombre: b.nombre ?? base.nombre,
    rol: b.rol ?? base.rol,
    perfilId: b.perfilId ?? base.perfilId,
    empleadoId: b.empleadoId ?? base.empleadoId,
    activo: b.activo ?? base.activo,
    ...(b.clave ? hashClave(b.clave) : {}),
  };
  if (i >= 0) lista[i] = nuevo; else lista.push(nuevo);
  await escribirBlob(RUTA_USUARIOS, lista, r?.etag);
  return json({ usuarios: lista.map(publico) });
}
