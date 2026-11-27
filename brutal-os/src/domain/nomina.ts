import type { FilaNomina, Novedades, Parametros } from "./types";

// Motor de nómina. Replica las fórmulas validadas de la hoja "BBDD SALARIOS NOMINA":
//   ingreso bruto        = base prestacional + aux no prestacional + aux transporte
//   aux no prestacional  = 35 % de la base (25 % para quienes ganan el mínimo) — PARÁMETROS
//   aux transporte       = valor PARÁMETROS si base < 2 SMMLV            (=IF(C<SMMLV*2, AUX, 0))
//   deducciones          = salud 4 % + pensión 4 % + FSP 1 % desde 4 SMMLV + retención
//   neto                 = ingreso bruto − deducciones
//   cesantías = prima    = (base + aux transporte) × 8,33 %
//   intereses cesantías  = cesantías × 12 %
//   vacaciones           = base × 4,17 %
//   aporte empleador     = salud (solo desde 10 SMMLV) + pensión 12 % + CCF 4 % + ARL riesgo 1 0,522 %
//   total planilla       = aporte empleador + salud y pensión del empleado (+ FSP)
//   costo total          = ingreso bruto + aporte empleador + provisiones (+ deducciones asumidas)
// Sobre esa base se agregan las novedades del mes (prorrateo, incapacidades, licencias,
// vacaciones, horas extra, bonificaciones y descuentos). Ningún valor legal está quemado:
// todo sale de Parametros.

export const NOVEDADES_VACIAS: Novedades = {
  diasContrato: 30,
  diasIncapacidad: 0,
  diasLicenciaRemunerada: 0,
  diasLicenciaNoRemunerada: 0,
  diasVacaciones: 0,
  hed: 0,
  hen: 0,
  horasRecargoNocturno: 0,
  horasDominical: 0,
  bonificacionSalarial: 0,
  bonificacionNoSalarial: 0,
  prestamos: 0,
  anticipos: 0,
  otrosDescuentos: 0,
  nota: "",
};

export interface CalculoNomina {
  // Devengados
  salarioOrdinario: number;
  vacacionesDisfrutadas: number;
  licenciaRemunerada: number;
  incapacidad: number;
  horasExtra: number;
  bonificacionSalarial: number;
  auxNoPrestacional: number;
  bonificacionNoSalarial: number;
  auxTransporte: number;
  ingresoBruto: number;
  // IBC y deducciones
  ibc: number;
  excesoNoSalarial: number;
  saludEmpleado: number;
  pensionEmpleado: number;
  fsp: number;
  retencion: number;
  totalDeducciones: number;
  descuentos: number;
  neto: number;
  // Provisiones
  cesantias: number;
  prima: number;
  interesesCesantias: number;
  vacaciones: number;
  totalProvisiones: number;
  netoConProvisiones: number;
  // Planilla
  saludEmpleador: number;
  pensionEmpleador: number;
  ccf: number;
  arl: number;
  icbf: number;
  sena: number;
  aporteEmpleador: number;
  totalPlanilla: number;
  // Costo
  deduccionesAsumidas: number;
  costoTotal: number;
  // Validaciones
  alertas: string[];
}

export function auxNoPrestPct(base: number, override: number | null, p: Parametros): number {
  if (override !== null && override !== undefined) return override;
  return base <= p.smmlv ? p.auxNoPrestPctMinimo : p.auxNoPrestPctGeneral;
}

export function fspPct(ibc: number, p: Parametros): number {
  let pct = 0;
  for (const t of p.fsp) if (ibc >= t.desdeSmmlv * p.smmlv) pct = t.pct;
  return pct;
}

/** Retención en la fuente — Procedimiento 1 (art. 383 y 388 E.T.). Redondeo a miles. */
export function retencionProcedimiento1(
  ingresosLaborales: number,
  incr: number,
  p: Parametros,
): number {
  const subtotal = Math.max(0, ingresosLaborales - incr);
  const exenta25 = Math.min(subtotal * 0.25, (790 * p.uvt) / 12);
  const limite40 = Math.min(subtotal * 0.4, (1340 * p.uvt) / 12);
  const base = subtotal - Math.min(exenta25, limite40);
  const b = base / p.uvt;
  let uvts = 0;
  if (b > 2300) uvts = (b - 2300) * 0.39 + 770;
  else if (b > 945) uvts = (b - 945) * 0.37 + 268;
  else if (b > 640) uvts = (b - 640) * 0.35 + 162;
  else if (b > 360) uvts = (b - 360) * 0.33 + 69;
  else if (b > 150) uvts = (b - 150) * 0.28 + 10;
  else if (b > 95) uvts = (b - 95) * 0.19;
  return Math.round((uvts * p.uvt) / 1000) * 1000;
}

export interface EntradaCalculo {
  base: number;
  auxNoPrestPct: number | null;
  deduccionesAsumidas: boolean;
  retencionModo: "MANUAL" | "AUTO";
  retencionManual: number;
  claseRiesgoArl: 1 | 2 | 3 | 4 | 5;
  novedades?: Partial<Novedades>;
}

export function calcularNomina(e: EntradaCalculo, p: Parametros): CalculoNomina {
  const n = { ...NOVEDADES_VACIAS, ...(e.novedades ?? {}) };
  const alertas: string[] = [];
  const base = e.base;
  const diario = base / 30;

  if (base < p.smmlv) alertas.push(`Base inferior al SMMLV (${p.smmlv.toLocaleString("es-CO")})`);

  const diasContrato = clamp(n.diasContrato, 0, 30);
  const ausencias = n.diasIncapacidad + n.diasLicenciaRemunerada + n.diasLicenciaNoRemunerada + n.diasVacaciones;
  if (ausencias > diasContrato) alertas.push("Las novedades suman más días que los días de contrato");
  const diasEfectivos = Math.max(0, diasContrato - ausencias);
  const diasPagados = Math.max(0, diasContrato - n.diasLicenciaNoRemunerada);

  // Devengados salariales
  const salarioOrdinario = diario * diasEfectivos;
  const vacacionesDisfrutadas = diario * n.diasVacaciones;
  const licenciaRemunerada = diario * n.diasLicenciaRemunerada;
  const incapacidad = Math.max(diario * p.incapacidadPct, p.smmlv / 30) * n.diasIncapacidad;
  const hora = base / p.horasMes;
  const r = p.recargos;
  const horasExtra =
    hora * (1 + r.hed) * n.hed +
    hora * (1 + r.hen) * n.hen +
    hora * r.nocturno * n.horasRecargoNocturno +
    hora * r.dominical * n.horasDominical;
  const salarial = salarioOrdinario + vacacionesDisfrutadas + licenciaRemunerada + incapacidad + horasExtra + n.bonificacionSalarial;

  // No salariales
  const pctNoPrest = auxNoPrestPct(base, e.auxNoPrestPct, p);
  const auxNoPrestacional = base * pctNoPrest * (diasPagados / 30);
  const noSalarial = auxNoPrestacional + n.bonificacionNoSalarial;
  const auxTransporte =
    base < p.smmlv * p.topeAuxTransporteSmmlv ? (p.auxTransporte / 30) * diasEfectivos : 0;

  const ingresoBruto = salarial + noSalarial + auxTransporte;

  // Ley 1393 de 2010: lo no salarial que exceda el 40 % de la remuneración total entra al IBC
  const remuneracion = salarial + noSalarial;
  const excesoNoSalarial = Math.max(0, noSalarial - p.topeNoSalarialPct * remuneracion);
  if (excesoNoSalarial > 0) alertas.push("Pagos no salariales superan el 40 % de la remuneración");
  const ibc = salarial + excesoNoSalarial;

  // Deducciones al empleado
  const saludEmpleado = ibc * p.saludEmpleadoPct;
  const pensionEmpleado = ibc * p.pensionEmpleadoPct;
  const fsp = ibc * fspPct(ibc, p);
  const retencion =
    e.retencionModo === "AUTO"
      ? retencionProcedimiento1(salarial + noSalarial, saludEmpleado + pensionEmpleado + fsp, p)
      : e.retencionManual;
  const totalDeducciones = saludEmpleado + pensionEmpleado + fsp + retencion;
  const descuentos = n.prestamos + n.anticipos + n.otrosDescuentos;
  const neto = ingresoBruto - totalDeducciones - descuentos;
  if (neto < 0) alertas.push("El neto a pagar es negativo");

  // Provisiones
  const basePrestaciones = salarial - vacacionesDisfrutadas + auxTransporte;
  const cesantias = basePrestaciones * p.cesantiasPct;
  const prima = basePrestaciones * p.primaPct;
  const interesesCesantias = cesantias * p.interesesCesantiasPct;
  const vacaciones = (salarioOrdinario + vacacionesDisfrutadas + licenciaRemunerada + incapacidad) * p.vacacionesPct;
  const totalProvisiones = cesantias + prima + interesesCesantias + vacaciones;

  // Planilla de seguridad social (aportes del empleador)
  const altoIngreso = ibc >= p.saludEmpleadorDesdeSmmlv * p.smmlv;
  const exonerado = ibc < p.exoneracionIcbfSenaHastaSmmlv * p.smmlv;
  const saludEmpleador = altoIngreso ? ibc * p.saludEmpleadorPct : 0;
  const pensionEmpleador = ibc * p.pensionEmpleadorPct;
  const ccf = ibc * p.ccfPct;
  const arl = ibc * p.arlPct[e.claseRiesgoArl];
  const icbf = exonerado ? 0 : ibc * p.icbfPct;
  const sena = exonerado ? 0 : ibc * p.senaPct;
  const aporteEmpleador = saludEmpleador + pensionEmpleador + ccf + arl + icbf + sena;
  const totalPlanilla = aporteEmpleador + saludEmpleado + pensionEmpleado + fsp;

  const deduccionesAsumidas = e.deduccionesAsumidas ? totalDeducciones : 0;
  const costoTotal = ingresoBruto + aporteEmpleador + totalProvisiones + deduccionesAsumidas;

  return {
    salarioOrdinario,
    vacacionesDisfrutadas,
    licenciaRemunerada,
    incapacidad,
    horasExtra,
    bonificacionSalarial: n.bonificacionSalarial,
    auxNoPrestacional,
    bonificacionNoSalarial: n.bonificacionNoSalarial,
    auxTransporte,
    ingresoBruto,
    ibc,
    excesoNoSalarial,
    saludEmpleado,
    pensionEmpleado,
    fsp,
    retencion,
    totalDeducciones,
    descuentos,
    neto,
    cesantias,
    prima,
    interesesCesantias,
    vacaciones,
    totalProvisiones,
    netoConProvisiones: neto + totalProvisiones,
    saludEmpleador,
    pensionEmpleador,
    ccf,
    arl,
    icbf,
    sena,
    aporteEmpleador,
    totalPlanilla,
    deduccionesAsumidas,
    costoTotal,
    alertas,
  };
}

export function calcularFila(f: FilaNomina, p: Parametros): CalculoNomina {
  return calcularNomina(
    {
      base: f.base,
      auxNoPrestPct: f.auxNoPrestPct,
      deduccionesAsumidas: f.deduccionesAsumidas,
      retencionModo: f.retencionModo,
      retencionManual: f.retencionManual,
      claseRiesgoArl: f.claseRiesgoArl,
      novedades: f.novedades,
    },
    p,
  );
}

export interface Totales {
  personas: number;
  ingresoBruto: number;
  totalDeducciones: number;
  descuentos: number;
  neto: number;
  totalProvisiones: number;
  aporteEmpleador: number;
  totalPlanilla: number;
  costoTotal: number;
  salarios: number;
  auxilios: number;
  deduccionesAsumidas: number;
  cesantias: number;
  prima: number;
  interesesCesantias: number;
  vacaciones: number;
}

export function sumar(calcs: CalculoNomina[]): Totales {
  const t: Totales = {
    personas: calcs.length,
    ingresoBruto: 0,
    totalDeducciones: 0,
    descuentos: 0,
    neto: 0,
    totalProvisiones: 0,
    aporteEmpleador: 0,
    totalPlanilla: 0,
    costoTotal: 0,
    salarios: 0,
    auxilios: 0,
    deduccionesAsumidas: 0,
    cesantias: 0,
    prima: 0,
    interesesCesantias: 0,
    vacaciones: 0,
  };
  for (const c of calcs) {
    t.ingresoBruto += c.ingresoBruto;
    t.totalDeducciones += c.totalDeducciones;
    t.descuentos += c.descuentos;
    t.neto += c.neto;
    t.totalProvisiones += c.totalProvisiones;
    t.aporteEmpleador += c.aporteEmpleador;
    t.totalPlanilla += c.totalPlanilla;
    t.costoTotal += c.costoTotal;
    t.salarios += c.ingresoBruto - c.auxNoPrestacional - c.auxTransporte - c.bonificacionNoSalarial;
    t.auxilios += c.auxNoPrestacional + c.auxTransporte + c.bonificacionNoSalarial;
    t.deduccionesAsumidas += c.deduccionesAsumidas;
    t.cesantias += c.cesantias;
    t.prima += c.prima;
    t.interesesCesantias += c.interesesCesantias;
    t.vacaciones += c.vacaciones;
  }
  return t;
}

/** Rubros mostrados en el comparativo ANTES vs DESPUÉS del simulador y en la plantilla. */
export const RUBROS: { key: keyof CalculoNomina; label: string; grupo: string }[] = [
  { key: "salarioOrdinario", label: "Base prestacional", grupo: "Ingresos" },
  { key: "auxNoPrestacional", label: "Aux. no prestacional", grupo: "Ingresos" },
  { key: "auxTransporte", label: "Aux. transporte", grupo: "Ingresos" },
  { key: "ingresoBruto", label: "Ingreso bruto", grupo: "Ingresos" },
  { key: "saludEmpleado", label: "Salud empleado", grupo: "Deducciones" },
  { key: "pensionEmpleado", label: "Pensión empleado", grupo: "Deducciones" },
  { key: "fsp", label: "Fondo solidaridad", grupo: "Deducciones" },
  { key: "retencion", label: "Retención", grupo: "Deducciones" },
  { key: "totalDeducciones", label: "Total deducciones", grupo: "Deducciones" },
  { key: "neto", label: "Neto al empleado", grupo: "Neto" },
  { key: "cesantias", label: "Cesantías", grupo: "Provisiones" },
  { key: "prima", label: "Prima", grupo: "Provisiones" },
  { key: "interesesCesantias", label: "Intereses cesantías", grupo: "Provisiones" },
  { key: "vacaciones", label: "Vacaciones", grupo: "Provisiones" },
  { key: "totalProvisiones", label: "Total provisiones", grupo: "Provisiones" },
  { key: "netoConProvisiones", label: "Mensual con provisiones", grupo: "Provisiones" },
  { key: "saludEmpleador", label: "Salud empleador", grupo: "Planilla" },
  { key: "pensionEmpleador", label: "Pensión empleador", grupo: "Planilla" },
  { key: "ccf", label: "Caja de compensación", grupo: "Planilla" },
  { key: "arl", label: "ARL", grupo: "Planilla" },
  { key: "aporteEmpleador", label: "Aporte empleador", grupo: "Planilla" },
  { key: "totalPlanilla", label: "Total planilla", grupo: "Planilla" },
  { key: "costoTotal", label: "Costo total empleado", grupo: "Costo" },
];

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v || 0));
}
