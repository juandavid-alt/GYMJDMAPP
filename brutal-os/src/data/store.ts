import { useSyncExternalStore } from "react";
import { crearSeed } from "./seed";
import { ARCHIVOS } from "../domain/catalogos";
import {
  calcularTerminacion,
  diffEmpleado,
  nombreArchivo,
  prorrogasAutomaticas,
  renovar as calcularRenovacion,
  siguienteId,
} from "../domain/empleados";
import { diaHabil, diasVigentesEnMes, finDeMes, hoy, mesAnterior, mesId, mesSiguiente } from "../domain/fechas";
import { calcularFila, NOVEDADES_VACIAS, sumar } from "../domain/nomina";
import type {
  Archivo,
  CargoPlantilla,
  CausalRetiro,
  CuentaPorPagar,
  DB,
  Empleado,
  EstatusExamen,
  FilaNomina,
  Historial,
  Novedades,
  Parametros,
  PeriodoNomina,
  Propuesta,
  Rol,
  Salario,
  TipoArchivo,
} from "../domain/types";
import { borrarArchivo, guardarArchivo } from "./files";

// Repositorio de datos del modo demostración. Persiste en el navegador para que la demo sea
// navegable sin backend. En producción estas mismas operaciones se ejecutan contra
// PostgreSQL (Supabase) — ver supabase/schema.sql — con RLS por rol.

const KEY = "brutal-os-db-v1";
const KEY_SESION = "brutal-os-sesion-v1";

export interface Sesion {
  rol: Rol;
  usuario: string;
  empleadoId: string; // perfil propio cuando rol = EMPLEADO
}

let contador = Date.now();
export const nuevoId = () => (++contador).toString(36);

let db: DB = cargar();
let sesion: Sesion = cargarSesion();
const subs = new Set<() => void>();

function cargar(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DB;
  } catch {
    /* sin almacenamiento disponible */
  }
  return inicializar();
}

function cargarSesion(): Sesion {
  try {
    const raw = localStorage.getItem(KEY_SESION);
    if (raw) return JSON.parse(raw) as Sesion;
  } catch {
    /* noop */
  }
  return { rol: "ADMINISTRADOR", usuario: "Administrador", empleadoId: "LB0018" };
}

function persistir() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    localStorage.setItem(KEY_SESION, JSON.stringify(sesion));
  } catch {
    /* noop */
  }
}

function emitir() {
  persistir();
  subs.forEach((f) => f());
}

function mutar(fn: (d: DB) => void) {
  const copia = structuredClone(db);
  fn(copia);
  db = copia;
  emitir();
}

export function subscribe(f: () => void) {
  subs.add(f);
  return () => subs.delete(f);
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, () => db);
}

export function useSesion(): Sesion {
  return useSyncExternalStore(subscribe, () => sesion);
}

export function getDB() {
  return db;
}

export function setSesion(s: Partial<Sesion>) {
  sesion = { ...sesion, ...s };
  emitir();
}

function log(d: DB, h: Omit<Historial, "id" | "ts" | "usuario">) {
  d.historial.unshift({ id: nuevoId(), ts: new Date().toISOString(), usuario: sesion.usuario, ...h });
}

// ---------------- Parámetros ----------------

export function parametrosDe(d: DB, anio: number): Parametros {
  return d.parametros.find((p) => p.anio === anio) ?? [...d.parametros].sort((a, b) => b.anio - a.anio)[0];
}

export function guardarParametros(p: Parametros) {
  mutar((d) => {
    const i = d.parametros.findIndex((x) => x.anio === p.anio);
    const antes = i >= 0 ? d.parametros[i] : undefined;
    if (i >= 0) d.parametros[i] = p;
    else d.parametros.push(p);
    for (const k of ["smmlv", "auxTransporte", "uvt"] as const) {
      if (!antes || antes[k] !== p[k])
        log(d, { modulo: "CONFIGURACION", evento: "PARÁMETRO", campo: `${k} ${p.anio}`, anterior: String(antes?.[k] ?? ""), nuevo: String(p[k]) });
    }
    if (!antes) log(d, { modulo: "CONFIGURACION", evento: "PARÁMETROS", detalle: `Nuevo año ${p.anio}` });
  });
}

export function agregarALista(lista: "areas" | "eps" | "afp" | "arl" | "bancos" | "parentescos", valor: string) {
  const v = valor.trim().toUpperCase();
  if (!v) return;
  mutar((d) => {
    if (!d.listas[lista].includes(v)) {
      d.listas[lista].push(v);
      log(d, { modulo: "CONFIGURACION", evento: "LISTA MAESTRA", campo: lista, nuevo: v });
    }
  });
}

export function agregarCargo(cargo: string, area: string) {
  mutar((d) => {
    const c = cargo.trim().toUpperCase();
    if (!d.listas.cargos.some((x) => x.cargo === c)) {
      d.listas.cargos.push({ cargo: c, area });
      log(d, { modulo: "CONFIGURACION", evento: "LISTA MAESTRA", campo: "cargos", nuevo: `${c} (${area})` });
    }
  });
}

/** Marca "Prestación de servicios" como obsoleto: conserva históricos y bloquea nuevos registros. */
export function toggleTipoContrato(valor: string) {
  mutar((d) => {
    const t = d.listas.tiposContrato.find((x) => x.valor === valor);
    if (t) {
      t.activo = !t.activo;
      log(d, { modulo: "CONFIGURACION", evento: "TIPO DE CONTRATO", campo: valor, anterior: t.activo ? "OBSOLETO" : "ACTIVO", nuevo: t.activo ? "ACTIVO" : "OBSOLETO" });
    }
  });
}

// ---------------- Empleados ----------------

export type NuevoEmpleado = Omit<
  Empleado,
  "id" | "estatus" | "esSocio" | "renovaciones" | "terminacionContrato" | "examen" | "archivos" | "creadoEn" | "autorizacionFecha"
>;

export function buscarPorDocumento(numero: string) {
  return db.empleados.find((e) => e.numeroDocumento === numero);
}

export async function crearEmpleado(
  data: NuevoEmpleado,
  archivos: Partial<Record<TipoArchivo, File>>,
): Promise<string> {
  const id = siguienteId(db.empleados);
  const metas = await subirVarios(id, archivos);
  const pl = db.plantilla.find((p) => p.cargo === data.cargo);
  mutar((d) => {
    const e: Empleado = {
      ...data,
      id,
      estatus: "ACTIVO",
      esSocio: false,
      renovaciones: 0,
      terminacionContrato:
        data.tipoContrato === "FIJO" && data.duracionMeses ? calcularTerminacion(data.inicioContrato, data.duracionMeses) : null,
      examen: { estatus: "PENDIENTE CITAR", desde: hoy() },
      archivos: metas,
      autorizacionFecha: hoy(),
      creadoEn: new Date().toISOString(),
    };
    d.empleados.push(e);
    log(d, { modulo: "EMPLEADOS", evento: "INGRESO", empleadoId: id, nombre: e.nombreCompleto, campo: "estatus", anterior: "", nuevo: "ACTIVO", detalle: `${e.cargo} · ${e.tipoContrato}` });
    if (pl) {
      d.salarios.push({
        id: nuevoId(),
        empleadoId: id,
        base: pl.base,
        auxNoPrestPct: pl.auxNoPrestPct,
        deduccionesAsumidas: false,
        retencionModo: "MANUAL",
        retencionManual: 0,
        vigenteDesde: e.inicioContrato,
        motivo: "Salario de ingreso (plantilla por cargo)",
      });
    }
  });
  return id;
}

async function subirVarios(id: string, archivos: Partial<Record<TipoArchivo, File>>): Promise<Archivo[]> {
  const out: Archivo[] = [];
  for (const [tipo, file] of Object.entries(archivos) as [TipoArchivo, File][]) {
    if (!file) continue;
    out.push(await subirArchivoMeta(id, tipo, file));
  }
  return out;
}

async function subirArchivoMeta(id: string, tipo: TipoArchivo, file: File, vence?: string): Promise<Archivo> {
  const meta: Archivo = {
    id: `${id}-${tipo}-${nuevoId()}`,
    tipo,
    nombre: nombreArchivo(id, tipo, file.name),
    subcarpeta: ARCHIVOS[tipo].subcarpeta,
    mime: file.type || "application/octet-stream",
    tamano: file.size,
    subidoEn: new Date().toISOString(),
    subidoPor: sesion.usuario,
    vence,
  };
  await guardarArchivo(meta.id, file);
  return meta;
}

export async function subirArchivo(empleadoId: string, tipo: TipoArchivo, file: File, vence?: string) {
  const meta = await subirArchivoMeta(empleadoId, tipo, file, vence);
  mutar((d) => {
    const e = d.empleados.find((x) => x.id === empleadoId)!;
    const previo = e.archivos.find((a) => a.tipo === tipo);
    e.archivos = e.archivos.filter((a) => a.tipo !== tipo);
    e.archivos.push(meta);
    if (previo) void borrarArchivo(previo.id);
    log(d, { modulo: "EMPLEADOS", evento: previo ? "DOCUMENTO ACTUALIZADO" : "DOCUMENTO CARGADO", empleadoId, nombre: e.nombreCompleto, campo: ARCHIVOS[tipo].etiqueta, nuevo: meta.nombre });
  });
}

export function actualizarEmpleado(id: string, patch: Partial<Empleado>) {
  mutar((d) => {
    const i = d.empleados.findIndex((e) => e.id === id);
    const antes = d.empleados[i];
    const despues = { ...antes, ...patch };
    if (despues.tipoContrato === "FIJO" && despues.duracionMeses && (patch.inicioContrato || patch.duracionMeses || patch.tipoContrato)) {
      despues.terminacionContrato = calcularTerminacion(despues.inicioContrato, despues.duracionMeses);
    }
    if (despues.tipoContrato !== "FIJO") {
      despues.terminacionContrato = null;
      despues.duracionMeses = null;
    }
    d.empleados[i] = despues;
    d.historial.unshift(...diffEmpleado(antes, despues, sesion.usuario, nuevoId));
  });
}

export async function retirarEmpleado(
  id: string,
  r: { fechaNotificacion: string; causal: CausalRetiro; fechaSalida: string; valorLiquidacion: number; estadoLiquidacion: "PENDIENTE" | "PAGADA" },
  carta?: File,
  soporte?: File,
) {
  const metas: Archivo[] = [];
  if (carta) metas.push(await subirArchivoMeta(id, "CARTA_RETIRO", carta));
  if (soporte) metas.push(await subirArchivoMeta(id, "SOPORTE_LIQUIDACION", soporte));
  mutar((d) => {
    const e = d.empleados.find((x) => x.id === id)!;
    e.estatus = "RETIRADO";
    e.retiro = r;
    e.archivos.push(...metas);
    e.examenEgreso = { estatus: "PENDIENTE CITAR", desde: hoy() };
    log(d, { modulo: "EMPLEADOS", evento: "RETIRO", empleadoId: id, nombre: e.nombreCompleto, campo: "estatus", anterior: "ACTIVO", nuevo: "RETIRADO", detalle: `${r.causal} · salida ${r.fechaSalida}` });
    log(d, { modulo: "EMPLEADOS", evento: "EXAMEN DE EGRESO", empleadoId: id, nombre: e.nombreCompleto, nuevo: "PENDIENTE CITAR" });
  });
}

export function actualizarLiquidacion(id: string, estado: "PENDIENTE" | "PAGADA") {
  mutar((d) => {
    const e = d.empleados.find((x) => x.id === id)!;
    if (!e.retiro) return;
    log(d, { modulo: "EMPLEADOS", evento: "LIQUIDACIÓN", empleadoId: id, nombre: e.nombreCompleto, campo: "estadoLiquidacion", anterior: e.retiro.estadoLiquidacion, nuevo: estado });
    e.retiro.estadoLiquidacion = estado;
  });
}

export function reactivarEmpleado(id: string, cambios: Partial<Empleado>) {
  mutar((d) => {
    const e = d.empleados.find((x) => x.id === id)!;
    const antes = { ...e };
    Object.assign(e, cambios, { estatus: "ACTIVO", retiro: undefined, renovaciones: 0, examen: { estatus: "PENDIENTE CITAR", desde: hoy() } });
    if (e.tipoContrato === "FIJO" && e.duracionMeses) e.terminacionContrato = calcularTerminacion(e.inicioContrato, e.duracionMeses);
    log(d, { modulo: "EMPLEADOS", evento: "REACTIVACIÓN", empleadoId: id, nombre: e.nombreCompleto, campo: "estatus", anterior: antes.estatus, nuevo: "ACTIVO", detalle: `Reingreso ${e.inicioContrato}` });
  });
}

export function renovarContrato(id: string, meses: 6 | 12) {
  mutar((d) => {
    const e = d.empleados.find((x) => x.id === id)!;
    const r = calcularRenovacion(e, meses);
    const anterior = e.terminacionContrato;
    e.terminacionContrato = r.hasta;
    e.duracionMeses = meses;
    e.renovaciones = r.numero;
    log(d, { modulo: "EMPLEADOS", evento: "RENOVACIÓN", empleadoId: id, nombre: e.nombreCompleto, campo: "terminacionContrato", anterior: anterior ?? "", nuevo: r.hasta, detalle: `Renovación #${r.numero} por ${meses} meses` });
  });
}

export async function cambiarExamen(
  id: string,
  cual: "examen" | "examenEgreso",
  estatus: EstatusExamen,
  extra: { citaFechaHora?: string; restricciones?: string; certificado?: File },
) {
  let meta: Archivo | undefined;
  if (extra.certificado) meta = await subirArchivoMeta(id, cual === "examen" ? "EXAMEN_INGRESO" : "EXAMEN_EGRESO", extra.certificado);
  mutar((d) => {
    const e = d.empleados.find((x) => x.id === id)!;
    const anterior = e[cual]?.estatus ?? "";
    e[cual] = {
      estatus,
      desde: hoy(),
      citaFechaHora: estatus === "AGENDADO" ? extra.citaFechaHora : e[cual]?.citaFechaHora,
      restricciones: estatus === "APTO CON RESTRICCIONES" ? extra.restricciones : undefined,
    };
    if (meta) {
      e.archivos = e.archivos.filter((a) => a.tipo !== meta!.tipo);
      e.archivos.push(meta);
    }
    log(d, { modulo: "EMPLEADOS", evento: cual === "examen" ? "EXAMEN DE INGRESO" : "EXAMEN DE EGRESO", empleadoId: id, nombre: e.nombreCompleto, campo: "estatus examen", anterior, nuevo: estatus, detalle: extra.citaFechaHora ? `Cita ${extra.citaFechaHora.replace("T", " ")}` : undefined });
  });
}

/** Tarea diaria: prórroga automática de contratos FIJO vencidos sin retiro ni renovación. */
export function ejecutarProrrogasAutomaticas() {
  const pendientes = db.empleados.map((e) => [e, prorrogasAutomaticas(e)] as const).filter(([, r]) => r.length);
  if (!pendientes.length) return 0;
  mutar((d) => {
    for (const [emp, renov] of pendientes) {
      const e = d.empleados.find((x) => x.id === emp.id)!;
      for (const r of renov) {
        d.historial.unshift({
          id: nuevoId(),
          ts: new Date().toISOString(),
          usuario: "Sistema",
          modulo: "EMPLEADOS",
          evento: "RENOVACIÓN AUTOMÁTICA",
          empleadoId: e.id,
          nombre: e.nombreCompleto,
          campo: "terminacionContrato",
          anterior: e.terminacionContrato ?? "",
          nuevo: r.hasta,
          detalle: `Renovación automática por falta de preaviso (#${r.numero}, ${r.meses} meses)`,
        });
        e.terminacionContrato = r.hasta;
        e.duracionMeses = r.meses;
        e.renovaciones = r.numero;
      }
    }
  });
  return pendientes.length;
}

// ---------------- Salarios ----------------

export function salarioVigente(d: DB, empleadoId: string, fecha: string): Salario | undefined {
  return d.salarios
    .filter((s) => s.empleadoId === empleadoId && s.vigenteDesde <= fecha)
    .sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : -1))[0];
}

export function actualizarCondicionesSalario(
  empleadoId: string,
  patch: Partial<Pick<Salario, "auxNoPrestPct" | "deduccionesAsumidas" | "retencionModo" | "retencionManual">>,
) {
  mutar((d) => {
    const s = salarioVigente(d, empleadoId, hoy());
    if (!s) return;
    const e = d.empleados.find((x) => x.id === empleadoId)!;
    for (const [k, v] of Object.entries(patch)) {
      log(d, { modulo: "NOMINA", evento: "CONDICIÓN SALARIAL", empleadoId, nombre: e.nombreCompleto, campo: k, anterior: String(s[k as keyof Salario] ?? ""), nuevo: String(v) });
    }
    Object.assign(s, patch);
    // refleja en la nómina abierta del mes
    for (const p of d.periodos) {
      if (p.estado === "BORRADOR" || p.estado === "CARGADO") {
        const f = p.filas.find((x) => x.empleadoId === empleadoId);
        if (f) Object.assign(f, patch);
      }
    }
  });
}

// ---------------- Plantilla y propuestas ----------------

export function crearPropuesta(p: Omit<Propuesta, "id" | "estado" | "creadoPor" | "creadoEn">) {
  mutar((d) => {
    const nueva: Propuesta = { ...p, id: nuevoId(), estado: "PENDIENTE", creadoPor: sesion.usuario, creadoEn: new Date().toISOString() };
    d.propuestas.unshift(nueva);
    log(d, { modulo: "NOMINA", evento: "PROPUESTA CREADA", empleadoId: p.empleadoId, campo: p.tipo, anterior: String(p.baseAntes), nuevo: String(p.baseDespues), detalle: `${p.cargo} · aplica ${p.fechaAplicacion}` });
  });
}

export function resolverPropuesta(id: string, estado: "APROBADA" | "RECHAZADA" | "DEVUELTA", comentario: string) {
  mutar((d) => {
    const p = d.propuestas.find((x) => x.id === id)!;
    p.estado = estado;
    p.resolucion = { por: sesion.usuario, en: new Date().toISOString(), comentario };
    log(d, { modulo: "NOMINA", evento: `PROPUESTA ${estado}`, empleadoId: p.empleadoId, campo: p.tipo, anterior: String(p.baseAntes), nuevo: String(p.baseDespues), detalle: comentario });
    if (estado !== "APROBADA") return;
    p.aplicada = true;
    if (p.tipo === "NUEVO_CARGO") {
      d.plantilla.push({ cargo: p.cargo, area: p.area, base: p.baseDespues, auxNoPrestPct: null });
      if (!d.listas.cargos.some((c) => c.cargo === p.cargo)) d.listas.cargos.push({ cargo: p.cargo, area: p.area });
    } else if (p.tipo === "AUMENTO_CARGO") {
      const c = d.plantilla.find((x) => x.cargo === p.cargo);
      if (c) c.base = p.baseDespues;
    } else if (p.empleadoId) {
      const prev = salarioVigente(d, p.empleadoId, p.fechaAplicacion) ?? salarioVigente(d, p.empleadoId, "9999-12-31");
      d.salarios.push({
        id: nuevoId(),
        empleadoId: p.empleadoId,
        base: p.baseDespues,
        auxNoPrestPct: prev?.auxNoPrestPct ?? null,
        deduccionesAsumidas: prev?.deduccionesAsumidas ?? false,
        retencionModo: prev?.retencionModo ?? "MANUAL",
        retencionManual: prev?.retencionManual ?? 0,
        vigenteDesde: p.fechaAplicacion,
        motivo: p.justificacion,
        propuestaId: p.id,
      });
      // si la nómina del mes de aplicación está abierta, se actualiza la base
      for (const per of d.periodos) {
        if ((per.estado === "BORRADOR" || per.estado === "CARGADO") && p.fechaAplicacion <= finDeMes(per.anio, per.mes)) {
          const f = per.filas.find((x) => x.empleadoId === p.empleadoId);
          if (f) {
            f.base = p.baseDespues;
            f.cargada = false;
            per.estado = "BORRADOR";
          }
        }
      }
    }
  });
}

export function guardarPlantilla(cargo: string, patch: Partial<CargoPlantilla>) {
  mutar((d) => {
    const c = d.plantilla.find((x) => x.cargo === cargo);
    if (c) Object.assign(c, patch);
  });
}

// ---------------- Nómina mensual ----------------

function construirFilas(d: DB, anio: number, mes: number): FilaNomina[] {
  const fin = finDeMes(anio, mes);
  const filas: FilaNomina[] = [];
  for (const e of d.empleados) {
    const salida = e.retiro?.fechaSalida ?? null;
    const dias = diasVigentesEnMes(anio, mes, e.inicioContrato, salida);
    if (dias <= 0) continue;
    const s = salarioVigente(d, e.id, fin);
    if (!s) continue;
    filas.push({
      empleadoId: e.id,
      esSocio: e.esSocio,
      nombre: e.nombreCompleto,
      area: e.area,
      cargo: e.cargo,
      tipoDocumento: e.tipoDocumento,
      numeroDocumento: e.numeroDocumento,
      banco: e.banco,
      tipoCuenta: e.tipoCuenta,
      numeroCuenta: e.numeroCuenta,
      claseRiesgoArl: e.claseRiesgoArl,
      base: s.base,
      auxNoPrestPct: s.auxNoPrestPct,
      deduccionesAsumidas: s.deduccionesAsumidas,
      retencionModo: s.retencionModo,
      retencionManual: s.retencionManual,
      novedades: { ...NOVEDADES_VACIAS, diasContrato: dias },
      // las filas de socios las gestiona el ADMINISTRADOR; entran cargadas por defecto
      cargada: e.esSocio,
    });
  }
  return filas.sort((a, b) => (a.esSocio === b.esSocio ? a.empleadoId.localeCompare(b.empleadoId) : a.esSocio ? 1 : -1));
}

export function generarPeriodo(anio: number, mes: number) {
  mutar((d) => {
    const id = mesId(anio, mes);
    if (d.periodos.some((p) => p.id === id)) return;
    d.periodos.push({ id, anio, mes, estado: "BORRADOR", filas: construirFilas(d, anio, mes), reaperturas: [] });
    d.periodos.sort((a, b) => a.id.localeCompare(b.id));
    log(d, { modulo: "NOMINA", evento: "NÓMINA GENERADA", detalle: id });
  });
}

/** Sincroniza la nómina abierta con la BBDD de empleados (nuevos ingresos, retiros, datos bancarios). */
export function sincronizarPeriodo(id: string) {
  mutar((d) => {
    const p = d.periodos.find((x) => x.id === id)!;
    if (p.estado !== "BORRADOR" && p.estado !== "CARGADO") return;
    const nuevas = construirFilas(d, p.anio, p.mes);
    p.filas = nuevas.map((n) => {
      const vieja = p.filas.find((f) => f.empleadoId === n.empleadoId);
      if (!vieja) return n;
      const cambioDias = vieja.novedades.diasContrato !== n.novedades.diasContrato;
      return {
        ...n,
        novedades: { ...vieja.novedades, diasContrato: n.novedades.diasContrato },
        cargada: vieja.cargada && !cambioDias && vieja.base === n.base,
        devuelta: vieja.devuelta,
      };
    });
    p.estado = p.filas.length && p.filas.every((f) => f.cargada) ? "CARGADO" : "BORRADOR";
  });
}

function periodo(d: DB, id: string) {
  return d.periodos.find((x) => x.id === id)!;
}

export function actualizarNovedades(periodoId: string, empleadoId: string, n: Partial<Novedades>) {
  mutar((d) => {
    const p = periodo(d, periodoId);
    if (p.estado !== "BORRADOR" && p.estado !== "CARGADO") return;
    const f = p.filas.find((x) => x.empleadoId === empleadoId)!;
    for (const [k, v] of Object.entries(n)) {
      const anterior = f.novedades[k as keyof Novedades];
      if (String(anterior) !== String(v))
        log(d, { modulo: "NOMINA", evento: "NOVEDAD", empleadoId, nombre: f.nombre, campo: `${periodoId} · ${k}`, anterior: String(anterior), nuevo: String(v) });
    }
    f.novedades = { ...f.novedades, ...n };
    f.cargada = false;
    p.estado = "BORRADOR";
  });
}

export function cargarFila(periodoId: string, empleadoId: string, cargada = true) {
  mutar((d) => {
    const p = periodo(d, periodoId);
    const f = p.filas.find((x) => x.empleadoId === empleadoId)!;
    f.cargada = cargada;
    if (cargada) f.devuelta = undefined;
    p.estado = p.filas.every((x) => x.cargada) ? "CARGADO" : "BORRADOR";
    log(d, { modulo: "NOMINA", evento: cargada ? "FILA CARGADA" : "FILA DESCARGADA", empleadoId, nombre: f.nombre, detalle: periodoId });
  });
}

export function cargarTodas(periodoId: string) {
  mutar((d) => {
    const p = periodo(d, periodoId);
    p.filas.forEach((f) => {
      f.cargada = true;
      f.devuelta = undefined;
    });
    p.estado = "CARGADO";
    log(d, { modulo: "NOMINA", evento: "TODAS LAS FILAS CARGADAS", detalle: periodoId });
  });
}

export function enviarAprobacion(periodoId: string) {
  mutar((d) => {
    const p = periodo(d, periodoId);
    if (p.estado !== "CARGADO") throw new Error("Todas las filas deben estar cargadas");
    p.estado = "EN APROBACIÓN";
    log(d, { modulo: "NOMINA", evento: "ENVIADA A APROBACIÓN", detalle: `${periodoId} · notificación enviada al ADMINISTRADOR` });
  });
}

export function devolverFilas(periodoId: string, filas: { empleadoId: string; comentario: string }[]) {
  mutar((d) => {
    const p = periodo(d, periodoId);
    for (const x of filas) {
      const f = p.filas.find((y) => y.empleadoId === x.empleadoId)!;
      f.cargada = false;
      f.devuelta = { comentario: x.comentario, por: sesion.usuario, en: new Date().toISOString() };
      log(d, { modulo: "NOMINA", evento: "FILA DEVUELTA", empleadoId: f.empleadoId, nombre: f.nombre, detalle: x.comentario });
    }
    p.estado = "BORRADOR";
  });
}

// --- OTP de un solo uso (demo: se muestra en pantalla; producción: correo o SMS) ---
let otpActual: { codigo: string; proposito: string; expira: number } | null = null;

export function solicitarOtp(proposito: string): string {
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  otpActual = { codigo, proposito, expira: Date.now() + 5 * 60_000 };
  return codigo;
}

export function verificarOtp(proposito: string, codigo: string): boolean {
  const ok = !!otpActual && otpActual.proposito === proposito && otpActual.codigo === codigo && Date.now() < otpActual.expira;
  if (ok) otpActual = null; // un solo uso
  return ok;
}

function generarPagos(d: DB, p: PeriodoNomina) {
  const params = parametrosDe(d, p.anio);
  const sig = mesSiguiente(p.anio, p.mes);
  const limiteNomina = finDeMes(p.anio, p.mes);
  const limitePila = diaHabil(sig.anio, sig.mes, params.diaHabilPila, params.festivos);
  const calcs = p.filas.map((f) => ({ f, c: calcularFila(f, params) }));
  const cuentas: CuentaPorPagar[] = calcs.map(({ f, c }) => ({
    id: nuevoId(),
    periodoId: p.id,
    tipo: "NOMINA",
    beneficiario: f.nombre,
    empleadoId: f.empleadoId,
    banco: f.banco,
    tipoCuenta: f.tipoCuenta,
    numeroCuenta: f.numeroCuenta,
    valor: Math.round(c.neto),
    fechaLimite: limiteNomina,
    estado: "PENDIENTE",
  }));
  const t = sumar(calcs.map((x) => x.c));
  cuentas.push({
    id: nuevoId(),
    periodoId: p.id,
    tipo: "PROVISIONES",
    beneficiario: "Cuenta de ahorros de provisiones",
    banco: params.cuentaProvisiones.banco,
    tipoCuenta: params.cuentaProvisiones.tipo,
    numeroCuenta: params.cuentaProvisiones.numero,
    valor: Math.round(t.totalProvisiones),
    fechaLimite: limiteNomina,
    estado: "PENDIENTE",
  });
  cuentas.push({
    id: nuevoId(),
    periodoId: p.id,
    tipo: "PLANILLA",
    beneficiario: "Planilla de seguridad social (PILA)",
    banco: "",
    tipoCuenta: "",
    numeroCuenta: "",
    valor: Math.round(t.totalPlanilla),
    fechaLimite: limitePila,
    estado: "PENDIENTE",
  });
  d.cuentasPorPagar = d.cuentasPorPagar.filter((c) => c.periodoId !== p.id).concat(cuentas);
  d.provisiones = d.provisiones.filter((m) => !(m.periodoId === p.id && m.tipo === "APORTE"));
  d.provisiones.push({ id: nuevoId(), fecha: limiteNomina, periodoId: p.id, tipo: "APORTE", valor: Math.round(t.totalProvisiones), detalle: `Provisión ${p.id}` });
}

export function aprobarPeriodo(periodoId: string, codigo: string) {
  if (!verificarOtp(`aprobar-${periodoId}`, codigo)) throw new Error("Código inválido o vencido");
  mutar((d) => {
    const p = periodo(d, periodoId);
    p.estado = "APROBADO";
    p.aprobadoPor = sesion.usuario;
    p.aprobadoEn = new Date().toISOString();
    log(d, { modulo: "NOMINA", evento: "NÓMINA APROBADA", detalle: `${periodoId} · código verificado` });
    generarPagos(d, p);
    p.estado = "ENVIADO A PAGOS";
    log(d, { modulo: "NOMINA", evento: "ENVIADA A PAGOS", detalle: `${periodoId} · ${p.filas.length} pagos + provisiones + planilla` });
  });
}

export function reabrirPeriodo(periodoId: string, codigo: string, motivo: string) {
  if (!verificarOtp(`reabrir-${periodoId}`, codigo)) throw new Error("Código inválido o vencido");
  mutar((d) => {
    const p = periodo(d, periodoId);
    p.estado = "BORRADOR";
    p.filas.forEach((f) => (f.cargada = false));
    p.reaperturas.push({ por: sesion.usuario, en: new Date().toISOString(), motivo });
    d.cuentasPorPagar = d.cuentasPorPagar.filter((c) => !(c.periodoId === periodoId && c.estado === "PENDIENTE"));
    d.provisiones = d.provisiones.filter((m) => !(m.periodoId === periodoId && m.tipo === "APORTE"));
    log(d, { modulo: "NOMINA", evento: "NÓMINA REABIERTA", detalle: `${periodoId} · ${motivo}` });
  });
}

export function marcarPago(id: string, estado: "PAGADO" | "RECHAZADO" | "PENDIENTE") {
  mutar((d) => {
    const c = d.cuentasPorPagar.find((x) => x.id === id)!;
    c.estado = estado;
    c.fechaPago = estado === "PAGADO" ? hoy() : undefined;
  });
}

export function registrarPagoPrestaciones(tipo: "PAGO PRIMA" | "PAGO CESANTÍAS" | "PAGO INTERESES" | "PAGO VACACIONES", valor: number, fecha: string) {
  mutar((d) => {
    d.provisiones.push({ id: nuevoId(), fecha, tipo, valor: -Math.abs(valor), detalle: `${tipo} desde cuenta de provisiones` });
    log(d, { modulo: "NOMINA", evento: tipo, nuevo: String(valor), detalle: "Descontado del saldo de provisiones" });
  });
}

export function guardarIngreso(mes: string, valor: number) {
  mutar((d) => {
    const i = d.ingresos.findIndex((x) => x.mes === mes);
    const anterior = i >= 0 ? d.ingresos[i].valor : 0;
    if (i >= 0) d.ingresos[i].valor = valor;
    else d.ingresos.push({ mes, valor });
    d.ingresos.sort((a, b) => a.mes.localeCompare(b.mes));
    log(d, { modulo: "NOMINA", evento: "INGRESO MENSUAL", campo: mes, anterior: String(anterior), nuevo: String(valor) });
  });
}

export function restablecerDemo() {
  db = inicializar();
  emitir();
}

// ---------------- Inicialización de la demo ----------------

function inicializar(): DB {
  const d = crearSeed();
  const ref = hoy();
  const { anio, mes } = { anio: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) };
  // Meses cerrados del año: generados, cargados, aprobados y pagados
  let cur = { anio, mes: 1 };
  while (cur.anio < anio || cur.mes < mes) {
    const per: PeriodoNomina = { id: mesId(cur.anio, cur.mes), anio: cur.anio, mes: cur.mes, estado: "ENVIADO A PAGOS", filas: construirFilas(d, cur.anio, cur.mes), reaperturas: [], aprobadoPor: "Administrador", aprobadoEn: `${finDeMes(cur.anio, cur.mes)}T16:00:00.000Z` };
    per.filas.forEach((f, i) => {
      f.cargada = true;
      if ((i + cur.mes) % 9 === 0) f.novedades.hed = 6;
      if ((i + cur.mes) % 13 === 0) f.novedades.diasIncapacidad = 2;
      if ((i * cur.mes) % 17 === 5) f.novedades.bonificacionNoSalarial = 300_000;
    });
    d.periodos.push(per);
    generarPagos(d, per);
    d.cuentasPorPagar.filter((c) => c.periodoId === per.id).forEach((c) => {
      c.estado = "PAGADO";
      c.fechaPago = c.fechaLimite;
    });
    cur = mesSiguiente(cur.anio, cur.mes);
  }
  // Prima del primer semestre pagada en junio desde la cuenta de provisiones
  const primaSem1 = d.periodos
    .filter((p) => p.anio === anio && p.mes <= 6)
    .reduce((s, p) => s + sumar(p.filas.map((f) => calcularFila(f, parametrosDe(d, p.anio)))).prima, 0);
  if (mes > 6) d.provisiones.push({ id: nuevoId(), fecha: `${anio}-06-30`, tipo: "PAGO PRIMA", valor: -Math.round(primaSem1), detalle: "Prima de servicios junio" });
  // Mes en curso: borrador con algunas novedades
  const per: PeriodoNomina = { id: mesId(anio, mes), anio, mes, estado: "BORRADOR", filas: construirFilas(d, anio, mes), reaperturas: [] };
  per.filas.forEach((f, i) => {
    if (i % 4 === 0) f.cargada = true;
    if (i === 5) f.novedades.hed = 8;
    if (i === 9) f.novedades.diasIncapacidad = 3;
    if (i === 12) f.novedades.diasVacaciones = 5;
    if (i === 14) f.novedades.prestamos = 150_000;
  });
  d.periodos.push(per);
  const prev = mesAnterior(anio, mes);
  d.historial.unshift({ id: nuevoId(), ts: new Date().toISOString(), usuario: "Sistema", modulo: "NOMINA", evento: "NÓMINA GENERADA", detalle: `${mesId(anio, mes)} (mes anterior ${mesId(prev.anio, prev.mes)} cerrado)` });
  d.historial.sort((a, b) => (a.ts < b.ts ? 1 : -1));
  return d;
}

// ---------------- Importador desde Excel ----------------

/** Inserta o actualiza por ID (sin duplicar). Los salarios iniciales salen de la plantilla por cargo. */
export function importarEmpleados(filas: Empleado[]) {
  mutar((d) => {
    let nuevos = 0;
    let actualizados = 0;
    for (const e of filas) {
      const i = d.empleados.findIndex((x) => x.id === e.id || x.numeroDocumento === e.numeroDocumento);
      if (i >= 0) {
        const antes = d.empleados[i];
        const despues = { ...e, id: antes.id, archivos: antes.archivos, examen: antes.examen };
        d.empleados[i] = despues;
        d.historial.unshift(...diffEmpleado(antes, despues, sesion.usuario, nuevoId));
        actualizados++;
      } else {
        d.empleados.push(e);
        nuevos++;
        log(d, { modulo: "EMPLEADOS", evento: "INGRESO", empleadoId: e.id, nombre: e.nombreCompleto, campo: "estatus", anterior: "", nuevo: e.estatus, detalle: "Importado desde Excel" });
        if (e.retiro) log(d, { modulo: "EMPLEADOS", evento: "RETIRO", empleadoId: e.id, nombre: e.nombreCompleto, campo: "estatus", anterior: "ACTIVO", nuevo: "RETIRADO", detalle: `Migrado: ${e.retiro.fechaSalida}` });
        const pl = d.plantilla.find((p) => p.cargo === e.cargo);
        if (pl && !d.salarios.some((s) => s.empleadoId === e.id)) {
          d.salarios.push({ id: nuevoId(), empleadoId: e.id, base: pl.base, auxNoPrestPct: pl.auxNoPrestPct, deduccionesAsumidas: false, retencionModo: "MANUAL", retencionManual: 0, vigenteDesde: e.inicioContrato, motivo: "Importación: base de la plantilla por cargo" });
        }
      }
    }
    log(d, { modulo: "EMPLEADOS", evento: "IMPORTACIÓN", detalle: `${nuevos} nuevos · ${actualizados} actualizados` });
  });
}
