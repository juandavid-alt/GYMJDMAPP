// POST: iniciar sesión · GET: sesión actual · DELETE: cerrar sesión
import { borrarCookie, crearCookie, igualSeguro, json, leerSesion, leerUsuarios, verificarClave } from "./_lib.js";

export async function GET(req: Request) {
  const s = leerSesion(req);
  return json({ nube: true, sesion: s });
}

export async function POST(req: Request) {
  const { usuario, clave } = (await req.json().catch(() => ({}))) as { usuario?: string; clave?: string };
  const u = (usuario ?? "").trim().toLowerCase();
  if (!u || !clave) return json({ error: "Escribe usuario y clave" }, 400);
  await new Promise((r) => setTimeout(r, 400)); // frena intentos por fuerza bruta

  // Acceso de respaldo del administrador (variables de entorno cifradas en Vercel)
  const admin = (process.env.BRUTAL_ADMIN_USUARIO ?? "").toLowerCase();
  const claveAdmin = process.env.BRUTAL_ADMIN_CLAVE ?? "";
  if (admin && claveAdmin && u === admin && igualSeguro(clave, claveAdmin)) {
    const s = { usuario: u, nombre: process.env.BRUTAL_ADMIN_NOMBRE ?? "Administrador", rol: "ADMINISTRADOR" as const, perfilId: process.env.BRUTAL_ADMIN_PERFIL ?? "", empleadoId: "" };
    return json({ sesion: s }, 200, { "set-cookie": crearCookie(s) });
  }

  const x = (await leerUsuarios()).find((y) => y.usuario === u && y.activo);
  if (!x || !verificarClave(clave, x.salt, x.hash)) return json({ error: "Usuario o clave incorrectos" }, 401);
  const s = { usuario: x.usuario, nombre: x.nombre, rol: x.rol, perfilId: x.perfilId, empleadoId: x.empleadoId };
  return json({ sesion: s }, 200, { "set-cookie": crearCookie(s) });
}

export async function DELETE() {
  return json({ ok: true }, 200, { "set-cookie": borrarCookie() });
}
