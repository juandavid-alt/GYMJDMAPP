// Utilidades del backend de Brutal OS: sesión firmada, usuarios y acceso a Vercel Blob (privado).
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { get, put } from "@vercel/blob";

export type Rol = "ADMINISTRADOR" | "COORDINACION" | "CONTADORA" | "CONSULTA" | "EMPLEADO";

export interface Usuario {
  usuario: string;
  nombre: string;
  rol: Rol;
  perfilId: string;
  empleadoId: string;
  salt: string;
  hash: string;
  activo: boolean;
  creado: string;
}
export type UsuarioPublico = Omit<Usuario, "salt" | "hash">;
export interface SesionToken { usuario: string; nombre: string; rol: Rol; perfilId: string; empleadoId: string; exp: number }

export const RUTA_DB = "brutal/db.json";
export const RUTA_USUARIOS = "brutal/usuarios.json";
export const ROLES_ESCRITURA: Rol[] = ["ADMINISTRADOR", "COORDINACION", "CONTADORA"];
const COOKIE = "brutal_sesion";
const DURACION = 1000 * 60 * 60 * 24 * 7;

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

// Llave de firma de sesiones: BRUTAL_SESSION_SECRET si existe; si no, se deriva del token
// privado de la base (BLOB_READ_WRITE_TOKEN) o, en su defecto, de la clave del administrador.
function secreto() {
  const s = process.env.BRUTAL_SESSION_SECRET;
  if (s && s.length >= 32) return s;
  const t = process.env.BLOB_READ_WRITE_TOKEN || process.env.BRUTAL_ADMIN_CLAVE;
  if (!t) throw new Error("Faltan las variables de entorno de Brutal OS en Vercel");
  return createHash("sha256").update(`brutal-os-sesion:${t}`).digest("hex");
}

const firmar = (datos: string) => createHmac("sha256", secreto()).update(datos).digest("base64url");

export function crearCookie(s: Omit<SesionToken, "exp">) {
  const datos = Buffer.from(JSON.stringify({ ...s, exp: Date.now() + DURACION })).toString("base64url");
  return `${COOKIE}=${datos}.${firmar(datos)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DURACION / 1000}`;
}
export const borrarCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function leerSesion(req: Request): SesionToken | null {
  const c = req.headers.get("cookie") ?? "";
  const m = c.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [datos, firma] = m[1].split(".");
  if (!datos || !firma) return null;
  const esperada = Buffer.from(firmar(datos));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const s = JSON.parse(Buffer.from(datos, "base64url").toString()) as SesionToken;
    return s.exp > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function hashClave(clave: string, salt = randomBytes(16).toString("hex")) {
  return { salt, hash: scryptSync(clave, salt, 64).toString("hex") };
}
export function verificarClave(clave: string, salt: string, hash: string) {
  const a = scryptSync(clave, salt, 64);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function igualSeguro(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function leerBlob<T>(ruta: string): Promise<{ datos: T; etag: string } | null> {
  const r = await get(ruta, { access: "private", useCache: false });
  if (!r || r.statusCode !== 200) return null;
  const texto = await new Response(r.stream).text();
  return { datos: JSON.parse(texto) as T, etag: r.blob.etag };
}

export async function escribirBlob(ruta: string, datos: unknown, ifMatch?: string) {
  const r = await put(ruta, JSON.stringify(datos), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
    ...(ifMatch ? { ifMatch } : {}),
  });
  return r.etag;
}

export async function leerUsuarios(): Promise<Usuario[]> {
  return (await leerBlob<Usuario[]>(RUTA_USUARIOS))?.datos ?? [];
}

export const publico = ({ salt: _s, hash: _h, ...u }: Usuario): UsuarioPublico => u;
