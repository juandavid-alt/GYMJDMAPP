import { calcularFila, calcularNomina, sumar, type CalculoNomina, type Totales } from "../domain/nomina";
import { finDeMes, hoy, inicioDeMes, mesAnterior, mesId, mesSiguiente, MESES_CORTOS } from "../domain/fechas";
import type { DB, FilaNomina, Parametros, PeriodoNomina } from "../domain/types";
import { parametrosDe, salarioVigente } from "./store";

export interface FilaCalc { f: FilaNomina; c: CalculoNomina; }
export interface PeriodoCalc {
  periodo: PeriodoNomina;
  params: Parametros;
  filas: FilaCalc[];
  empleados: Totales;
  socios: Totales;
  total: Totales;
}

const cache = new WeakMap<PeriodoNomina, PeriodoCalc>();

export function calcPeriodo(db: DB, p: PeriodoNomina): PeriodoCalc {
  const hit = cache.get(p);
  if (hit) return hit;
  const params = parametrosDe(db, p.anio);
  const filas = p.filas.map((f) => ({ f, c: calcularFila(f, params) }));
  const r: PeriodoCalc = {
    periodo: p,
    params,
    filas,
    empleados: sumar(filas.filter((x) => !x.f.esSocio).map((x) => x.c)),
    socios: sumar(filas.filter((x) => x.f.esSocio).map((x) => x.c)),
    total: sumar(filas.map((x) => x.c)),
  };
  cache.set(p, r);
  return r;
}

export function periodoActual(db: DB): PeriodoNomina | undefined {
  const id = hoy().slice(0, 7);
  return db.periodos.find((p) => p.id === id) ?? db.periodos[db.periodos.length - 1];
}

export function periodoPrevio(db: DB, p: PeriodoNomina) {
  const a = mesAnterior(p.anio, p.mes);
  return db.periodos.find((x) => x.id === mesId(a.anio, a.mes));
}

export function ingresoDe(db: DB, mes: string) {
  return db.ingresos.find((i) => i.mes === mes)?.valor ?? 0;
}

/** Serie mensual del año (solo empleados, sin socios). */
export function serieNomina(db: DB, anio: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const id = mesId(anio, mes);
    const p = db.periodos.find((x) => x.id === id);
    const t = p ? calcPeriodo(db, p).empleados : null;
    const ingresos = ingresoDe(db, id);
    return {
      id,
      label: MESES_CORTOS[i],
      existe: !!p,
      estado: p?.estado,
      costo: t?.costoTotal ?? 0,
      neto: t?.neto ?? 0,
      salarios: t?.salarios ?? 0,
      auxilios: t?.auxilios ?? 0,
      seguridad: t?.aporteEmpleador ?? 0,
      provisiones: t?.totalProvisiones ?? 0,
      asumidas: t?.deduccionesAsumidas ?? 0,
      personas: t?.personas ?? 0,
      promedio: t && t.personas ? t.costoTotal / t.personas : 0,
      ingresos,
      pctIngresos: ingresos && t ? t.costoTotal / ingresos : 0,
    };
  }).map((m, i, arr) => ({
    ...m,
    variacion: i > 0 && arr[i - 1].costo ? (m.costo - arr[i - 1].costo) / arr[i - 1].costo : null,
  }));
}

/** Costo de nómina por área (solo empleados) de un periodo. */
export function porArea(pc: PeriodoCalc) {
  const m = new Map<string, number>();
  for (const { f, c } of pc.filas) if (!f.esSocio) m.set(f.area, (m.get(f.area) ?? 0) + c.costoTotal);
  return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

/** Saldo acumulado de la cuenta de provisiones vs obligaciones por pagar en cada periodo. */
export function serieProvisiones(db: DB, anio: number) {
  let saldo = db.provisiones.filter((m) => m.fecha < `${anio}-01-01`).reduce((s, m) => s + m.valor, 0);
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const ini = inicioDeMes(anio, mes);
    const fin = finDeMes(anio, mes);
    const movs = db.provisiones.filter((m) => m.fecha >= ini && m.fecha <= fin);
    const aportes = movs.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0);
    const pagos = -movs.filter((m) => m.valor < 0).reduce((s, m) => s + m.valor, 0);
    saldo += aportes - pagos;
    return { id: mesId(anio, mes), label: MESES_CORTOS[i], aportes, pagos, saldo };
  });
}

/** Obligación causada a la fecha por tipo de prestación (lo que se debe pagar). */
export function obligacionesCausadas(db: DB, anio: number) {
  const pagado = (t: string) => -db.provisiones.filter((m) => m.tipo === t && m.fecha.startsWith(String(anio))).reduce((s, m) => s + m.valor, 0);
  const t = { cesantias: 0, prima: 0, intereses: 0, vacaciones: 0 };
  for (const p of db.periodos) {
    if (p.anio !== anio || (p.estado !== "APROBADO" && p.estado !== "ENVIADO A PAGOS")) continue;
    const s = calcPeriodo(db, p).total;
    t.cesantias += s.cesantias;
    t.prima += s.prima;
    t.intereses += s.interesesCesantias;
    t.vacaciones += s.vacaciones;
  }
  return [
    { name: "Prima", causado: t.prima, pagado: pagado("PAGO PRIMA"), cuando: "Junio y diciembre" },
    { name: "Cesantías", causado: t.cesantias, pagado: pagado("PAGO CESANTÍAS"), cuando: "Consignar antes del 14 de febrero" },
    { name: "Intereses de cesantías", causado: t.intereses, pagado: pagado("PAGO INTERESES"), cuando: "Pagar antes del 31 de enero" },
    { name: "Vacaciones", causado: t.vacaciones, pagado: pagado("PAGO VACACIONES"), cuando: "Al disfrutarlas o al retiro" },
  ];
}

function paramsProyectados(db: DB, anio: number): Parametros {
  const exacto = db.parametros.find((p) => p.anio === anio);
  if (exacto) return exacto;
  let base = [...db.parametros].sort((a, b) => b.anio - a.anio)[0];
  for (let y = base.anio + 1; y <= anio; y++) {
    const inc = base.incrementoSmmlvProyeccion;
    base = { ...base, anio: y, smmlv: Math.round(base.smmlv * (1 + inc)), auxTransporte: Math.round(base.auxTransporte * (1 + inc)) };
  }
  return base;
}

/**
 * Proyección de nómina a 12 meses: empleados activos, fin de contratos FIJO, aumentos aprobados
 * con fecha futura e incremento anual del SMMLV (PARÁMETROS).
 */
export function proyeccion(db: DB, asumirRenovacion: boolean) {
  const ref = hoy();
  let cur = mesSiguiente(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)));
  const actual = [...db.parametros].sort((a, b) => b.anio - a.anio).find((p) => p.anio <= cur.anio) ?? db.parametros[0];
  const out = [];
  for (let i = 0; i < 12; i++) {
    const p = paramsProyectados(db, cur.anio);
    const ini = inicioDeMes(cur.anio, cur.mes);
    const fin = finDeMes(cur.anio, cur.mes);
    let costo = 0;
    let personas = 0;
    for (const e of db.empleados) {
      if (e.esSocio || e.estatus !== "ACTIVO") continue;
      if (e.inicioContrato > fin) continue;
      if (!asumirRenovacion && e.tipoContrato === "FIJO" && e.terminacionContrato && e.terminacionContrato < ini) continue;
      const s = salarioVigente(db, e.id, fin);
      if (!s) continue;
      let baseSal = s.base;
      if (p.anio > actual.anio) {
        baseSal = s.base <= actual.smmlv ? p.smmlv : Math.round(s.base * Math.pow(1 + actual.incrementoGeneralProyeccion, p.anio - actual.anio));
      }
      const c = calcularNomina({ base: baseSal, auxNoPrestPct: s.auxNoPrestPct, deduccionesAsumidas: s.deduccionesAsumidas, retencionModo: s.retencionModo, retencionManual: s.retencionManual, claseRiesgoArl: e.claseRiesgoArl }, p);
      costo += c.costoTotal;
      personas++;
    }
    out.push({ id: mesId(cur.anio, cur.mes), label: `${MESES_CORTOS[cur.mes - 1]} ${String(cur.anio).slice(2)}`, costo, personas });
    cur = mesSiguiente(cur.anio, cur.mes);
  }
  return out;
}
