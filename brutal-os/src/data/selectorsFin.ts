import { AREAS_OPERATIVAS } from "../domain/catalogosFin";
import {
  cuentaEnFacturado, diasParaVencer, enCartera, finMes, mesFinal, nivelCobro, rangoAging, valorVigente,
  type CalculoFactura, type Cliente, type Factura, type Rango,
} from "../domain/facturacion";
import { diffDias, hoy, mesId, MESES_CORTOS, ultimosMeses } from "../domain/fechas";
import type { DB } from "../domain/types";
import { calcPeriodo } from "./selectors";
import { calcFactura } from "./storeFin";

export interface FC { f: Factura; c: CalculoFactura; cli: Cliente | undefined; }

const cache = new WeakMap<DB, FC[]>();
export function facturasCalc(db: DB): FC[] {
  const hit = cache.get(db);
  if (hit) return hit;
  const out = db.facturas.map((f) => ({ f, c: calcFactura(db, f), cli: db.clientes.find((x) => x.id === f.clienteId) }));
  cache.set(db, out);
  return out;
}

export const mesDeFecha = (s: string | null | undefined) => (s ? s.slice(0, 7) : "");
/** Mes de causación: emisión (o fecha programada si aún no se emite). */
export const mesCausado = (f: Factura) => mesDeFecha(f.emision ?? f.fechaProgramada);
/** Mes de caja: fecha real de pago; si la migración no la trae, el mes de emisión. */
export const mesCaja = (f: Factura) => mesDeFecha(f.pago?.fecha ?? f.emision);

export const TIPOS_LABEL: Record<Factura["tipo"], string> = { FIJA: "Fija", ADICIONAL: "Adicional", "ONE SHOT": "One shot", PAUTA: "Incremento pauta" };

export function serieFacturacion(db: DB, meses: string[]) {
  const fs = facturasCalc(db);
  return meses.map((m) => {
    const del = fs.filter((x) => x.f.estado !== "ANULADA" && mesCausado(x.f) === m);
    const facturado = del.filter((x) => cuentaEnFacturado(x.f));
    const programado = del.filter((x) => x.f.estado !== "EN PAUSA");
    const porTipo = { FIJA: 0, ADICIONAL: 0, "ONE SHOT": 0, PAUTA: 0 } as Record<Factura["tipo"], number>;
    for (const x of facturado) porTipo[x.f.tipo] += x.c.ingresoPropio;
    const recaudado = fs.filter((x) => x.f.estado !== "ANULADA").reduce((s, x) => {
      let v = 0;
      if (x.f.estado === "PAGADA" && mesCaja(x.f) === m) v += x.f.pago?.valorRecibido ?? 0;
      else v += x.f.abonos.filter((a) => mesDeFecha(a.fecha ?? x.f.emision) === m).reduce((t, a) => t + a.valor, 0);
      return s + v;
    }, 0);
    const fin = finMes(m);
    const vencida = fs.filter((x) => x.f.emision && x.f.emision <= fin && x.f.vencimiento && x.f.vencimiento < fin && x.f.estado !== "ANULADA" && x.f.estado !== "PROGRAMADA" && x.f.estado !== "EN PAUSA" && !(x.f.estado === "PAGADA" && (x.f.pago?.fecha ?? x.f.emision!) <= fin)).reduce((s, x) => s + x.c.netoEsperado - x.c.abonado, 0);
    return {
      mes: m,
      label: MESES_CORTOS[Number(m.slice(5, 7)) - 1],
      facturado: facturado.reduce((s, x) => s + x.c.ingresoPropio, 0),
      facturadoConIva: facturado.reduce((s, x) => s + x.c.total, 0),
      programado: programado.reduce((s, x) => s + x.c.ingresoPropio, 0),
      recaudado,
      vencida,
      ...porTipo,
    };
  });
}

export function cartera(db: DB, ref = hoy()) {
  return facturasCalc(db)
    .filter((x) => enCartera(x.f))
    .map((x) => {
      const dias = diasParaVencer(x.f, ref);
      return { ...x, dias, rango: rangoAging(dias), nivel: nivelCobro(dias) };
    })
    .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
}

export const RANGOS: Rango[] = ["AL DÍA", "1–30", "31–60", "61–90", "+90"];

export function agingTotales(db: DB) {
  const cs = cartera(db);
  return RANGOS.map((r) => ({ name: r, value: cs.filter((x) => x.rango === r).reduce((s, x) => s + x.c.saldo, 0) }));
}

/** Día promedio real de pago y días promedio de retraso por cliente. */
export function comportamientoPago(db: DB) {
  const m = new Map<string, { cli: Cliente | undefined; dias: number[]; retraso: number[] }>();
  for (const x of facturasCalc(db)) {
    if (x.f.estado !== "PAGADA" || !x.f.pago?.fecha || !x.f.emision) continue;
    const e = m.get(x.f.clienteId) ?? { cli: x.cli, dias: [], retraso: [] };
    e.dias.push(diffDias(x.f.emision, x.f.pago.fecha));
    if (x.f.vencimiento) e.retraso.push(Math.max(0, diffDias(x.f.vencimiento, x.f.pago.fecha)));
    m.set(x.f.clienteId, e);
  }
  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  return [...m.values()].map((e) => ({ name: e.cli?.nombreComercial ?? "—", diaPago: avg(e.dias), retraso: avg(e.retraso), n: e.dias.length }));
}

/** DSO: cartera actual ÷ facturado con IVA de los últimos 90 días × 90. */
export function dso(db: DB) {
  const ref = hoy();
  const desde = new Date(Date.parse(ref) - 90 * 86_400_000).toISOString().slice(0, 10);
  const fs = facturasCalc(db).filter((x) => cuentaEnFacturado(x.f) && x.f.emision && x.f.emision >= desde);
  const facturado = fs.reduce((s, x) => s + x.c.total, 0);
  const saldo = cartera(db).reduce((s, x) => s + x.c.saldo, 0);
  return facturado ? (saldo / facturado) * 90 : 0;
}

export function capitalPauta(db: DB) {
  const m = new Map<string, { name: string; adelantado: number; recuperado: number }>();
  for (const x of facturasCalc(db)) {
    if (x.f.tipo !== "PAUTA" || x.f.estado === "ANULADA" || x.f.estado === "EN PAUSA") continue;
    const e = m.get(x.f.clienteId) ?? { name: x.cli?.nombreComercial ?? "—", adelantado: 0, recuperado: 0 };
    if (x.f.estado === "PAGADA") e.recuperado += x.c.reembolsoPauta;
    else e.adelantado += x.c.reembolsoPauta;
    m.set(x.f.clienteId, e);
  }
  return [...m.values()];
}

/** Ingreso fijo asegurado por mes según contratos vigentes (programadas + emitidas de fee). */
export function ingresoAsegurado(db: DB, meses: string[]) {
  return meses.map((m) => ({
    mes: m,
    label: `${MESES_CORTOS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`,
    valor: db.contratos.filter((c) => c.estado === "ACTIVO" && c.inicio.slice(0, 7) <= m && mesFinal(c) >= m).reduce((s, c) => s + valorVigente(c, m), 0),
  }));
}

export function contratosPorVencer(db: DB, dias = 90) {
  const ref = hoy();
  return db.contratos
    .filter((c) => c.estado === "ACTIVO" && c.fin)
    .map((c) => ({ c, dias: diffDias(ref, c.fin!), cli: db.clientes.find((x) => x.id === c.clienteId), valor: valorVigente(c, ref.slice(0, 7)) }))
    .filter((x) => x.dias >= 0 && x.dias <= dias)
    .sort((a, b) => a.dias - b.dias);
}

// ---------------- Índice: estado de resultados ----------------

export type Base = "CAUSADO" | "CAJA";

export interface FilaPyG {
  mes: string;
  label: string;
  ingresos: number;
  ingresosPorTipo: Record<Factura["tipo"], number>;
  nominaOperativa: number;
  nominaAdministrativa: number;
  nominaSocios: number;
  costosGastos: Record<string, number>; // categoría → valor
  costos: number;
  gastos: number;
  socios: number;
  utilidadBruta: number;
  utilidadOperacional: number;
  utilidadFinal: number;
  margenBruto: number;
  margenOperacional: number;
  nominaRegistrada: boolean;
  headcount: number;
}

export function pyg(db: DB, meses: string[], base: Base, conIva: boolean): FilaPyG[] {
  const fs = facturasCalc(db);
  return meses.map((m) => {
    const ingresosPorTipo = { FIJA: 0, ADICIONAL: 0, "ONE SHOT": 0, PAUTA: 0 } as Record<Factura["tipo"], number>;
    for (const x of fs) {
      if (x.f.estado === "ANULADA") continue;
      const ivaFactor = conIva && x.c.subtotal ? 1 + x.c.iva / x.c.subtotal : 1;
      if (base === "CAUSADO") {
        if (cuentaEnFacturado(x.f) && mesCausado(x.f) === m) ingresosPorTipo[x.f.tipo] += x.c.ingresoPropio * ivaFactor;
      } else {
        // parte del dinero recibido que es ingreso propio (sin reembolsos de pauta ni terceros)
        const propio = x.c.netoEsperado ? (x.c.ingresoPropio * ivaFactor) / x.c.netoEsperado : 0;
        let recibido = 0;
        if (x.f.estado === "PAGADA" && mesCaja(x.f) === m) recibido = x.f.pago?.valorRecibido ?? 0;
        else recibido = x.f.abonos.filter((a) => mesDeFecha(a.fecha ?? x.f.emision) === m).reduce((s, a) => s + a.valor, 0);
        ingresosPorTipo[x.f.tipo] += recibido * propio;
      }
    }
    const ingresos = Object.values(ingresosPorTipo).reduce((s, v) => s + v, 0);
    // Nómina (costo empresa con aportes y provisiones)
    const per = db.periodos.find((p) => p.id === m);
    let nominaOperativa = 0, nominaAdministrativa = 0, nominaSocios = 0, headcount = 0;
    if (per) {
      for (const { f, c } of calcPeriodo(db, per).filas) {
        if (f.esSocio) nominaSocios += c.costoTotal;
        else {
          headcount++;
          if (AREAS_OPERATIVAS.includes(f.area)) nominaOperativa += c.costoTotal;
          else nominaAdministrativa += c.costoTotal;
        }
      }
    }
    const costosGastos: Record<string, number> = {};
    let costos = nominaOperativa, gastos = nominaAdministrativa, socios = nominaSocios;
    if (nominaOperativa) costosGastos["Nómina operativa"] = nominaOperativa;
    if (nominaAdministrativa) costosGastos["Nómina administrativa"] = nominaAdministrativa;
    for (const g of db.gastos) {
      if (g.fecha.slice(0, 7) !== m || g.tipo === "FUERA") continue;
      const v = g.valor + (conIva ? g.iva : 0);
      costosGastos[g.categoria] = (costosGastos[g.categoria] ?? 0) + v;
      if (g.tipo === "COSTO") costos += v;
      else if (g.tipo === "GASTO") gastos += v;
      else socios += v;
    }
    const utilidadBruta = ingresos - costos;
    const utilidadOperacional = utilidadBruta - gastos;
    return {
      mes: m,
      label: MESES_CORTOS[Number(m.slice(5, 7)) - 1],
      ingresos,
      ingresosPorTipo,
      nominaOperativa,
      nominaAdministrativa,
      nominaSocios,
      costosGastos,
      costos,
      gastos,
      socios,
      utilidadBruta,
      utilidadOperacional,
      utilidadFinal: utilidadOperacional - socios,
      margenBruto: ingresos ? utilidadBruta / ingresos : 0,
      margenOperacional: ingresos ? utilidadOperacional / ingresos : 0,
      nominaRegistrada: !!per,
      headcount,
    };
  });
}

export function sumarPyG(filas: FilaPyG[]) {
  const t = filas.reduce(
    (a, f) => ({ ingresos: a.ingresos + f.ingresos, costos: a.costos + f.costos, gastos: a.gastos + f.gastos, socios: a.socios + f.socios }),
    { ingresos: 0, costos: 0, gastos: 0, socios: 0 },
  );
  const ub = t.ingresos - t.costos;
  const uo = ub - t.gastos;
  return { ...t, utilidadBruta: ub, utilidadOperacional: uo, utilidadFinal: uo - t.socios, margenBruto: t.ingresos ? ub / t.ingresos : 0, margenOperacional: t.ingresos ? uo / t.ingresos : 0, margenFinal: t.ingresos ? (uo - t.socios) / t.ingresos : 0 };
}

export const mesesDelAnio = (anio: number) => Array.from({ length: 12 }, (_, i) => mesId(anio, i + 1));
export const ultimos12 = () => {
  const r = hoy();
  return ultimosMeses(Number(r.slice(0, 4)), Number(r.slice(5, 7)), 12).map((x) => mesId(x.anio, x.mes));
};

/**
 * Proyección de cierre de año en tres escenarios.
 * Conservador: real YTD + programadas de contratos firmados. Base: + promedio de adicionales/one shot/pauta
 * de los últimos N meses. Optimista: base + renovación de contratos que vencen antes de diciembre.
 */
export function proyeccionCierre(db: DB) {
  const ref = hoy();
  const anio = Number(ref.slice(0, 4));
  const mesActual = ref.slice(0, 7);
  const meses = mesesDelAnio(anio);
  const real = pyg(db, meses, "CAUSADO", false);
  const N = db.configIndice.mesesPromedio;
  const previos = real.filter((r) => r.mes < mesActual).slice(-N);
  const promVariable = previos.length ? previos.reduce((s, r) => s + r.ingresosPorTipo.ADICIONAL + r.ingresosPorTipo["ONE SHOT"] + r.ingresosPorTipo.PAUTA, 0) / previos.length : 0;
  const promGastosVar = (() => {
    const gs = db.gastos.filter((g) => !g.recurrente && g.tipo !== "FUERA" && g.fecha.slice(0, 7) < mesActual);
    const mesesG = new Set(gs.map((g) => g.fecha.slice(0, 7))).size || 1;
    return gs.reduce((s, g) => s + g.valor, 0) / Math.max(mesesG, Math.min(N, mesesG));
  })();
  const recurrentes = db.gastos.filter((g) => g.recurrente && g.tipo !== "FUERA").reduce((m, g) => m.set(g.proveedor + g.categoria, g.valor), new Map<string, number>());
  const gastoRecurrenteMes = [...recurrentes.values()].reduce((s, v) => s + v, 0);
  const ultimaNomina = [...db.periodos].sort((a, b) => b.id.localeCompare(a.id))[0];
  const nominaMes = ultimaNomina ? calcPeriodo(db, ultimaNomina).total.costoTotal : 0;
  const fs = facturasCalc(db);
  const filas = meses.map((m, i) => {
    const r = real[i];
    const futuro = m >= mesActual;
    const programadasFijas = fs.filter((x) => x.f.estado === "PROGRAMADA" && x.f.tipo === "FIJA" && mesCausado(x.f) === m).reduce((s, x) => s + x.c.ingresoPropio, 0);
    const renovaciones = db.contratos.filter((c) => c.estado === "ACTIVO" && c.fin && c.fin.slice(0, 7) < m).reduce((s, c) => s + valorVigente(c, m) * db.configIndice.pctRenovacion, 0);
    const conservador = futuro ? r.ingresos + programadasFijas : r.ingresos;
    const baseEsc = futuro ? conservador + (m > mesActual ? promVariable : 0) : r.ingresos;
    const optimista = futuro ? baseEsc + renovaciones : r.ingresos;
    const costo = futuro ? Math.max(r.costos + r.gastos + r.socios, nominaMes + gastoRecurrenteMes + (m > mesActual ? promGastosVar : 0)) : r.costos + r.gastos + r.socios;
    return { mes: m, label: r.label, real: futuro ? null : r.ingresos, conservador, base: baseEsc, optimista, costo };
  });
  const tot = (k: "conservador" | "base" | "optimista" | "costo") => filas.reduce((s, f) => s + f[k], 0);
  return {
    filas,
    conservador: tot("conservador"),
    base: tot("base"),
    optimista: tot("optimista"),
    costos: tot("costo"),
    meta: db.configIndice.metaVentasAnual,
    promVariable,
  };
}
