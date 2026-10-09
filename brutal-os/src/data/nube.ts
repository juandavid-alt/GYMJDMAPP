// Conexión con el backend en Vercel (funciones /api + Blob privado).
// Si /api no responde (desarrollo local o vista previa), la plataforma sigue en modo demostración.
import type { DB, Rol } from "../domain/types";

export interface SesionNube { usuario: string; nombre: string; rol: Rol; perfilId: string; empleadoId: string }
export interface UsuarioNube extends SesionNube { activo: boolean; creado: string }

async function api<T>(ruta: string, init?: RequestInit): Promise<{ ok: boolean; status: number; datos: T }> {
  const r = await fetch(`/api/${ruta}`, { credentials: "same-origin", ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const tipo = r.headers.get("content-type") ?? "";
  if (!tipo.includes("application/json")) throw new Error("sin-api");
  return { ok: r.ok, status: r.status, datos: (await r.json()) as T };
}

/** ¿Hay backend? Devuelve la sesión si la hay. */
export async function detectarNube(): Promise<{ nube: false } | { nube: true; sesion: SesionNube | null }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await api<{ nube?: boolean; sesion: SesionNube | null }>("sesion", { signal: ctrl.signal });
    clearTimeout(t);
    return r.datos.nube ? { nube: true, sesion: r.datos.sesion } : { nube: false };
  } catch {
    return { nube: false };
  }
}

export async function entrar(usuario: string, clave: string) {
  const r = await api<{ sesion?: SesionNube; error?: string }>("sesion", { method: "POST", body: JSON.stringify({ usuario, clave }) });
  if (!r.ok || !r.datos.sesion) throw new Error(r.datos.error ?? "No se pudo iniciar sesión");
  return r.datos.sesion;
}

export async function salir() {
  await api("sesion", { method: "DELETE" }).catch(() => undefined);
}

export async function leerDB() {
  const r = await api<{ db: DB | null; etag: string | null; error?: string }>("db");
  if (!r.ok) throw Object.assign(new Error(r.datos.error ?? "No se pudo leer la base"), { status: r.status });
  return r.datos;
}

export type ResultadoGuardar = { tipo: "ok"; etag: string } | { tipo: "conflicto"; db: DB; etag: string } | { tipo: "error"; status: number; mensaje: string };

export async function escribirDB(db: DB, etag: string | null): Promise<ResultadoGuardar> {
  const r = await api<{ etag?: string; db?: DB; error?: string }>("db", { method: "PUT", body: JSON.stringify({ db }), headers: etag ? { "if-match": etag } : {} });
  if (r.ok && r.datos.etag) return { tipo: "ok", etag: r.datos.etag };
  if (r.status === 409 && r.datos.db && r.datos.etag) return { tipo: "conflicto", db: r.datos.db, etag: r.datos.etag };
  return { tipo: "error", status: r.status, mensaje: r.datos.error ?? "Error al guardar" };
}

export async function listarUsuarios() {
  const r = await api<{ usuarios?: UsuarioNube[]; error?: string }>("usuarios");
  if (!r.ok) throw new Error(r.datos.error ?? "No se pudo leer usuarios");
  return r.datos.usuarios ?? [];
}

export async function guardarUsuario(u: Partial<UsuarioNube> & { usuario: string; clave?: string }) {
  const r = await api<{ usuarios?: UsuarioNube[]; error?: string }>("usuarios", { method: "PUT", body: JSON.stringify(u) });
  if (!r.ok) throw new Error(r.datos.error ?? "No se pudo guardar el usuario");
  return r.datos.usuarios ?? [];
}
