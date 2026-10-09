import { ARCHIVOS, ARCHIVOS_OBLIGATORIOS } from "./catalogos";
import { addDias, addMeses, diffDias, edad, finDeMes, hoy, inicioDeMes, mesId, parse } from "./fechas";
import type { Empleado, Historial, TipoArchivo } from "./types";

// ---------- Contratos FIJO ----------

/** Fecha de terminación: inicio + duración − 1 día (01/10/2026 + 6 meses = 31/03/2027). */
export function calcularTerminacion(inicio: string, meses: number): string {
  return addDias(addMeses(inicio, meses), -1);
}

/** Máximo 3 renovaciones de 6 meses; desde la 4.ª la duración mínima es 12 meses. */
export function duracionesPermitidas(renovacionesHechas: number): (6 | 12)[] {
  return renovacionesHechas >= 3 ? [12] : [6, 12];
}

export interface Renovacion {
  desde: string;
  hasta: string;
  meses: 6 | 12;
  numero: number;
}

export function renovar(e: Empleado, meses: 6 | 12): Renovacion {
  if (e.tipoContrato !== "FIJO" || !e.terminacionContrato) throw new Error("Solo los contratos FIJO se renuevan");
  if (!duracionesPermitidas(e.renovaciones).includes(meses))
    throw new Error("Desde la cuarta renovación la duración mínima es de 12 meses");
  const desde = addDias(e.terminacionContrato, 1);
  return { desde, hasta: calcularTerminacion(desde, meses), meses, numero: e.renovaciones + 1 };
}

/**
 * Prórroga automática: si llega la fecha de terminación sin retiro ni renovación, el contrato se
 * prorroga por el mismo periodo (si aún no hay 3 renovaciones) o por 12 meses. Devuelve las
 * renovaciones aplicadas para registrarlas en el Historial.
 */
export function prorrogasAutomaticas(e: Empleado, ref = hoy()): Renovacion[] {
  const out: Renovacion[] = [];
  if (e.estatus !== "ACTIVO" || e.tipoContrato !== "FIJO" || !e.terminacionContrato) return out;
  let fin = e.terminacionContrato;
  let n = e.renovaciones;
  let meses = (e.duracionMeses ?? 6) as 6 | 12;
  while (fin < ref) {
    meses = n >= 3 ? 12 : meses;
    const desde = addDias(fin, 1);
    const hasta = calcularTerminacion(desde, meses);
    n += 1;
    out.push({ desde, hasta, meses, numero: n });
    fin = hasta;
  }
  return out;
}

// ---------- Documentos ----------

export type Semaforo = "verde" | "amarillo" | "rojo";

export function estadoDocumentos(e: Empleado, ref = hoy()) {
  const tiene = new Set(e.archivos.map((a) => a.tipo));
  const faltantes = ARCHIVOS_OBLIGATORIOS.filter((t) => !tiene.has(t));
  const vencidos = e.archivos.filter((a) => a.vence && a.vence < ref);
  const total = ARCHIVOS_OBLIGATORIOS.length;
  const completos = total - faltantes.length;
  const semaforo: Semaforo = vencidos.length ? "rojo" : faltantes.length ? "amarillo" : "verde";
  return { faltantes, vencidos, completos, total, semaforo, pct: completos / total };
}

export function nombreArchivo(id: string, tipo: TipoArchivo, original: string) {
  const ext = (original.split(".").pop() || "pdf").toLowerCase();
  return `${id}_${ARCHIVOS[tipo].sufijo}.${ext}`;
}

export function siguienteId(empleados: Empleado[]): string {
  const max = empleados.reduce((m, e) => Math.max(m, Number(e.id.replace(/\D/g, "")) || 0), 0);
  return `LB${String(max + 1).padStart(4, "0")}`;
}

// ---------- Validaciones del formulario ----------

export const soloDigitos = (s: string) => s.replace(/\D/g, "");

export function validarCelular(s: string) {
  return /^\d{10}$/.test(s);
}

export function validarCorreo(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// ---------- Alertas ----------

export type Nivel = "rojo" | "amarillo" | "verde" | "azul";

export interface Alerta {
  id: string;
  nivel: Nivel;
  tipo: "CONTRATO" | "DOCUMENTOS" | "LIQUIDACION" | "CUMPLEAÑOS" | "EXAMEN";
  empleadoId: string;
  titulo: string;
  detalle: string;
  dias?: number;
}

export function alertasEmpleados(empleados: Empleado[], ref = hoy()): Alerta[] {
  const out: Alerta[] = [];
  const mesActual = Number(ref.slice(5, 7));
  for (const e of empleados) {
    if (e.estatus === "ACTIVO") {
      // Contratos FIJO que vencen en 45 días o menos
      if (e.tipoContrato === "FIJO" && e.terminacionContrato) {
        const dias = diffDias(ref, e.terminacionContrato);
        if (dias <= 45 && dias >= 0) {
          const min = duracionesPermitidas(e.renovaciones)[0];
          out.push({
            id: `c-${e.id}`,
            nivel: dias <= 30 ? "rojo" : "amarillo",
            tipo: "CONTRATO",
            empleadoId: e.id,
            titulo: `Contrato vence en ${dias} días`,
            detalle: `Va en la renovación ${e.renovaciones}. Mínimo para la siguiente: ${min} meses. Preaviso legal: 30 días.`,
            dias,
          });
        }
      }
      // Documentos obligatorios pendientes 5 días después del ingreso
      const doc = estadoDocumentos(e, ref);
      const diasIngreso = diffDias(e.inicioContrato, ref);
      if (doc.faltantes.length && diasIngreso > 5) {
        out.push({
          id: `d-${e.id}`,
          nivel: "amarillo",
          tipo: "DOCUMENTOS",
          empleadoId: e.id,
          titulo: doc.faltantes.length === 1 ? "1 documento pendiente" : `${doc.faltantes.length} documentos pendientes`,
          detalle: doc.faltantes.map((t) => ARCHIVOS[t].etiqueta).join(", "),
        });
      }
      if (doc.vencidos.length) {
        out.push({
          id: `v-${e.id}`,
          nivel: "rojo",
          tipo: "DOCUMENTOS",
          empleadoId: e.id,
          titulo: doc.vencidos.length === 1 ? "Documento vencido" : `${doc.vencidos.length} documentos vencidos`,
          detalle: doc.vencidos.map((a) => ARCHIVOS[a.tipo].etiqueta).join(", "),
        });
      }
    }
    // Exámenes
    for (const [ex, etiqueta] of [
      [e.estatus === "ACTIVO" ? e.examen : undefined, "ingreso"],
      [e.examenEgreso, "egreso"],
    ] as const) {
      if (!ex) continue;
      if (ex.estatus === "PENDIENTE CITAR" && diffDias(ex.desde, ref) > 3) {
        out.push({
          id: `x-${etiqueta}-${e.id}`,
          nivel: "amarillo",
          tipo: "EXAMEN",
          empleadoId: e.id,
          titulo: `Examen de ${etiqueta} sin citar`,
          detalle: `Lleva ${diffDias(ex.desde, ref)} días en PENDIENTE CITAR`,
        });
      }
      if (ex.estatus === "AGENDADO" && ex.citaFechaHora && ex.citaFechaHora.slice(0, 10) < ref) {
        out.push({
          id: `y-${etiqueta}-${e.id}`,
          nivel: "rojo",
          tipo: "EXAMEN",
          empleadoId: e.id,
          titulo: `Cita de examen de ${etiqueta} vencida`,
          detalle: "La fecha de la cita pasó y sigue en AGENDADO",
        });
      }
    }
    // Liquidaciones pendientes
    if (e.estatus === "RETIRADO" && e.retiro?.estadoLiquidacion === "PENDIENTE") {
      out.push({
        id: `l-${e.id}`,
        nivel: "rojo",
        tipo: "LIQUIDACION",
        empleadoId: e.id,
        titulo: "Liquidación pendiente",
        detalle: `Retiro el ${e.retiro.fechaSalida.split("-").reverse().join("/")}`,
      });
    }
    // Cumpleaños del mes
    if (e.estatus === "ACTIVO" && Number(e.fechaNacimiento.slice(5, 7)) === mesActual) {
      out.push({
        id: `b-${e.id}`,
        nivel: "azul",
        tipo: "CUMPLEAÑOS",
        empleadoId: e.id,
        titulo: `Cumpleaños el ${e.fechaNacimiento.slice(8, 10)}`,
        detalle: `Cumple ${edad(e.fechaNacimiento, ref) + (e.fechaNacimiento.slice(5) > ref.slice(5) ? 1 : 0)} años`,
      });
    }
  }
  const orden: Record<Nivel, number> = { rojo: 0, amarillo: 1, azul: 2, verde: 3 };
  return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

// ---------- Estadísticas (solo empleados: los socios se excluyen) ----------

export function salidaDe(e: Empleado): string | null {
  return e.estatus === "RETIRADO" && e.retiro ? e.retiro.fechaSalida : null;
}

export function activoEn(e: Empleado, fecha: string) {
  const salida = salidaDe(e);
  return e.inicioContrato <= fecha && (!salida || salida >= fecha);
}

export function serieMensual(empleados: Empleado[], meses: { anio: number; mes: number }[]) {
  const emps = empleados.filter((e) => !e.esSocio);
  return meses.map(({ anio, mes }) => {
    const ini = inicioDeMes(anio, mes);
    const fin = finDeMes(anio, mes);
    const activos = emps.filter((e) => activoEn(e, fin)).length;
    const retiradosAcum = emps.filter((e) => {
      const s = salidaDe(e);
      return s && s <= fin;
    }).length;
    const ingresos = emps.filter((e) => e.inicioContrato >= ini && e.inicioContrato <= fin).length;
    const retiros = emps.filter((e) => {
      const s = salidaDe(e);
      return s && s >= ini && s <= fin;
    }).length;
    const activosInicio = emps.filter((e) => activoEn(e, ini)).length;
    const promedio = (activosInicio + activos) / 2 || 1;
    return {
      id: mesId(anio, mes),
      anio,
      mes,
      activos,
      retirados: retiradosAcum,
      ingresos,
      retiros,
      rotacion: (retiros / promedio) * 100,
    };
  });
}

export function antiguedadMeses(e: Empleado, ref = hoy()) {
  const fin = salidaDe(e) ?? ref;
  return Math.max(0, diffDias(e.inicioContrato, fin) / 30.4375);
}

export function contar<T>(items: T[], key: (t: T) => string) {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it) || "SIN DATO";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function rangoEdad(n: number) {
  if (n < 25) return "18–24";
  if (n < 30) return "25–29";
  if (n < 35) return "30–34";
  if (n < 40) return "35–39";
  return "40+";
}

/** Eventos del historial que provienen de cambios de campos del empleado. */
export function diffEmpleado(
  antes: Empleado,
  despues: Empleado,
  usuario: string,
  nuevoId: () => string,
): Historial[] {
  const campos: (keyof Empleado)[] = [
    "estatus", "cargo", "area", "tipoContrato", "nombreCompleto", "celular", "correo", "direccion",
    "eps", "arl", "afp", "banco", "tipoCuenta", "numeroCuenta", "emergenciaNombre",
    "emergenciaParentesco", "emergenciaCelular", "inicioContrato", "duracionMeses",
    "terminacionContrato", "claseRiesgoArl", "fechaNacimiento", "genero",
  ];
  const ts = new Date().toISOString();
  const out: Historial[] = [];
  for (const c of campos) {
    const a = antes[c];
    const b = despues[c];
    if (String(a ?? "") !== String(b ?? "")) {
      const sensible = c === "numeroCuenta";
      out.push({
        id: nuevoId(),
        ts,
        usuario,
        modulo: "EMPLEADOS",
        evento: ["estatus", "cargo", "area", "tipoContrato"].includes(c) ? `CAMBIO DE ${String(c).toUpperCase()}` : "ACTUALIZACIÓN",
        empleadoId: despues.id,
        nombre: despues.nombreCompleto,
        campo: String(c),
        anterior: sensible ? "••••" : String(a ?? ""),
        nuevo: sensible ? "••••" : String(b ?? ""),
      });
    }
  }
  return out;
}

export const mesTexto = (s: string) => parse(s).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
