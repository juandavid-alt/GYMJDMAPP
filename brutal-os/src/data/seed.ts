import { LISTAS_INICIALES, PARAMETROS_2026, PLANTILLA_INICIAL, ARCHIVOS_OBLIGATORIOS, ARCHIVOS } from "../domain/catalogos";
import { calcularTerminacion, nombreArchivo } from "../domain/empleados";
import { addDias } from "../domain/fechas";
import type { Archivo, CausalRetiro, DB, Empleado, Genero, Historial, Salario, TipoContrato } from "../domain/types";

// Datos de DEMOSTRACIÓN. Todos los nombres, documentos, cuentas y montos son ficticios.
// (Los socios se identifican por nombre porque las reglas de la hoja los excluyen por nombre.)

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

type Def = {
  nombre: string;
  genero: Genero;
  area: string;
  cargo: string;
  contrato: TipoContrato;
  inicio: string;
  meses?: 6 | 12;
  renovaciones?: number;
  terminacion?: string;
  retiro?: { salida: string; causal: CausalRetiro; liquidacion: number; estado: "PENDIENTE" | "PAGADA" };
  socio?: boolean;
  nacimiento: string;
  base?: number;
  docsFaltantes?: number;
};

const DEFS: Def[] = [
  { nombre: "JUAN DAVID MONTAÑA SANCHEZ", genero: "MASCULINO", area: "ADMINISTRATIVA", cargo: "DIRECTOR ADMINISTRATIVO Y COMERCIAL", contrato: "INDEFINIDO", inicio: "2026-01-01", socio: true, nacimiento: "1990-03-12" },
  { nombre: "JUAN SEBASTIAN LONDOÑO CONTRERAS", genero: "MASCULINO", area: "MARKETING", cargo: "DIRECTOR DE MARKETING", contrato: "INDEFINIDO", inicio: "2026-01-01", socio: true, nacimiento: "1989-07-03" },
  { nombre: "FELIPE VARGAS PAOLINI", genero: "MASCULINO", area: "DISEÑO", cargo: "DIRECTOR DISEÑO", contrato: "INDEFINIDO", inicio: "2026-01-01", socio: true, nacimiento: "1991-11-21" },
  { nombre: "VALERIA OSPINA CÁRDENAS", genero: "FEMENINO", area: "ADMINISTRATIVA", cargo: "COORDINADOR ADMINISTRATIVO", contrato: "FIJO", inicio: "2026-04-01", meses: 6, terminacion: "2026-09-30", nacimiento: "1996-10-17" },
  { nombre: "MARÍA JOSÉ RESTREPO AYALA", genero: "FEMENINO", area: "ADMINISTRATIVA", cargo: "AUXILIAR ADMINISTRATIVO", contrato: "FIJO", inicio: "2026-05-15", meses: 6, nacimiento: "2002-02-08" },
  { nombre: "SANTIAGO HERRERA BLANCO", genero: "MASCULINO", area: "MARKETING", cargo: "EJECUTIVA DE CUENTAS SR", contrato: "INDEFINIDO", inicio: "2026-01-12", nacimiento: "1994-05-30" },
  { nombre: "LAURA CAMILA PEÑA ROJAS", genero: "FEMENINO", area: "MARKETING", cargo: "EJECUTIVA DE CUENTAS", contrato: "FIJO", inicio: "2026-03-01", meses: 12, nacimiento: "1998-10-02" },
  { nombre: "DANIELA FORERO MEJÍA", genero: "FEMENINO", area: "MARKETING", cargo: "EJECUTIVA DE CUENTAS JR", contrato: "FIJO", inicio: "2026-05-20", meses: 6, nacimiento: "2000-12-14", docsFaltantes: 2 },
  { nombre: "ANDRÉS FELIPE CASTRO NIÑO", genero: "MASCULINO", area: "MARKETING", cargo: "CONTENT MANAGER SR", contrato: "PS", inicio: "2026-02-01", nacimiento: "1995-08-25" },
  { nombre: "ISABELLA GÓMEZ TORRES", genero: "FEMENINO", area: "MARKETING", cargo: "CONTENT MANAGER", contrato: "PS", inicio: "2026-03-01", nacimiento: "1999-04-11" },
  { nombre: "MARIANA SALAZAR VÉLEZ", genero: "FEMENINO", area: "MARKETING", cargo: "COMMUNITY MANAGER SR", contrato: "FIJO", inicio: "2026-02-01", meses: 12, nacimiento: "1997-10-28" },
  { nombre: "TOMÁS RAMÍREZ PULIDO", genero: "MASCULINO", area: "MARKETING", cargo: "COMMUNITY MANAGER", contrato: "PS", inicio: "2026-06-09", nacimiento: "2001-06-19" },
  { nombre: "NATALIA BELTRÁN ACOSTA", genero: "FEMENINO", area: "MARKETING", cargo: "COMMUNITY MANAGER", contrato: "PS", inicio: "2026-05-19", nacimiento: "2000-01-05" },
  { nombre: "SARA LUCÍA MORENO DÍAZ", genero: "FEMENINO", area: "MARKETING", cargo: "COMMUNITY MANAGER JR", contrato: "FIJO", inicio: "2026-08-18", meses: 6, nacimiento: "2003-03-27", docsFaltantes: 3 },
  { nombre: "GABRIELA ORTIZ LEÓN", genero: "FEMENINO", area: "MARKETING", cargo: "COMMUNITY MANAGER JR", contrato: "PS", inicio: "2026-08-25", nacimiento: "2002-09-09" },
  { nombre: "PAULA ANDREA ROMERO SILVA", genero: "FEMENINO", area: "MARKETING", cargo: "PQRS", contrato: "PS", inicio: "2026-08-11", nacimiento: "1999-10-21" },
  { nombre: "JUANITA PARRA QUINTERO", genero: "FEMENINO", area: "MARKETING", cargo: "COPY CREATIVO", contrato: "FIJO", inicio: "2026-09-01", meses: 6, nacimiento: "1998-07-15", docsFaltantes: 1 },
  { nombre: "EMILIANO DUQUE ARANGO", genero: "MASCULINO", area: "DISEÑO", cargo: "DISEÑADOR SR", contrato: "INDEFINIDO", inicio: "2026-01-15", nacimiento: "1993-12-01" },
  { nombre: "CAROLINA VILLAMIZAR ROA", genero: "FEMENINO", area: "DISEÑO", cargo: "DISEÑADOR SEMI SR", contrato: "INDEFINIDO", inicio: "2026-08-01", nacimiento: "1996-02-22" },
  { nombre: "NICOLÁS JARAMILLO PINTO", genero: "MASCULINO", area: "DISEÑO", cargo: "DISEÑADOR", contrato: "PS", inicio: "2026-03-01", nacimiento: "1995-05-05" },
  { nombre: "ANTONIA RUIZ BERNAL", genero: "FEMENINO", area: "DISEÑO", cargo: "DISEÑADOR JR", contrato: "FIJO", inicio: "2026-04-16", meses: 6, terminacion: "2026-10-15", nacimiento: "2003-10-30" },
  { nombre: "MATÍAS CORREA LOZANO", genero: "MASCULINO", area: "DISEÑO", cargo: "DISEÑADOR JR", contrato: "PS", inicio: "2026-04-01", nacimiento: "2002-08-08" },
  { nombre: "LUCÍA FERNANDA PRIETO", genero: "FEMENINO", area: "DISEÑO", cargo: "DISEÑADOR SEMI JR", contrato: "PS", inicio: "2026-07-06", nacimiento: "2001-01-17" },
  { nombre: "DAVID ESTEBAN MUÑOZ", genero: "MASCULINO", area: "DISEÑO", cargo: "DISEÑADOR SEMI JR", contrato: "FIJO", inicio: "2026-09-01", meses: 6, nacimiento: "2000-11-03" },
  { nombre: "ALEJANDRO CÁRDENAS VEGA", genero: "MASCULINO", area: "PAUTA", cargo: "TRAFFICKER", contrato: "FIJO", inicio: "2026-10-01", meses: 6, nacimiento: "1998-03-15", docsFaltantes: 4 },
  { nombre: "SEBASTIÁN ACEVEDO MORA", genero: "MASCULINO", area: "PAUTA", cargo: "TRAFFICKER JR", contrato: "PS", inicio: "2026-05-06", nacimiento: "2001-09-12" },
  { nombre: "CAMILO ANDRÉS ROJAS", genero: "MASCULINO", area: "INFLUENCER MARKETING", cargo: "INFLUENCER MARKETING", contrato: "PS", inicio: "2026-06-27", nacimiento: "1997-06-06" },
  { nombre: "FELIPE ANDRÉS LEMUS", genero: "MASCULINO", area: "AUDIOVISUAL", cargo: "FOTÓGRAFO BRUTAL", contrato: "PS", inicio: "2026-05-12", nacimiento: "1994-10-10" },
  { nombre: "ELENA MARGARITA SUÁREZ", genero: "FEMENINO", area: "CONTABLE", cargo: "AUXILIAR CONTABLE", contrato: "FIJO", inicio: "2026-02-16", meses: 12, nacimiento: "1992-04-04" },
  // Retirados
  { nombre: "ANA MARÍA BOTERO GIL", genero: "FEMENINO", area: "ADMINISTRATIVA", cargo: "AUXILIAR ADMINISTRATIVO", contrato: "PS", inicio: "2026-01-01", retiro: { salida: "2026-02-28", causal: "FIN DE PRESTACIÓN DE SERVICIOS", liquidacion: 0, estado: "PAGADA" }, nacimiento: "2002-05-29" },
  { nombre: "KAREN TATIANA LIZARAZO", genero: "FEMENINO", area: "MARKETING", cargo: "COMMUNITY MANAGER", contrato: "PS", inicio: "2026-01-05", retiro: { salida: "2026-03-10", causal: "RENUNCIA", liquidacion: 0, estado: "PAGADA" }, nacimiento: "2001-06-21" },
  { nombre: "PABLO ANDRÉS ZAMORA", genero: "MASCULINO", area: "MARKETING", cargo: "CONTENT MANAGER JR", contrato: "PS", inicio: "2026-03-01", retiro: { salida: "2026-07-31", causal: "MUTUO ACUERDO", liquidacion: 1_250_000, estado: "PAGADA" }, nacimiento: "2002-10-02" },
  { nombre: "VALENTINA ESPITIA RUBIO", genero: "FEMENINO", area: "MARKETING", cargo: "EJECUTIVA DE CUENTAS JR", contrato: "FIJO", inicio: "2026-02-01", meses: 6, retiro: { salida: "2026-04-10", causal: "RENUNCIA", liquidacion: 980_000, estado: "PAGADA" }, nacimiento: "2004-02-10" },
  { nombre: "JHON FREDY CALDERÓN", genero: "MASCULINO", area: "ADMINISTRATIVA", cargo: "AUXILIAR ADMINISTRATIVO", contrato: "PS", inicio: "2026-04-17", retiro: { salida: "2026-05-07", causal: "DESPIDO CON JUSTA CAUSA", liquidacion: 0, estado: "PAGADA" }, nacimiento: "1999-08-14" },
  { nombre: "DIANA PATRICIA MONTOYA", genero: "FEMENINO", area: "MARKETING", cargo: "COMMUNITY MANAGER SR", contrato: "FIJO", inicio: "2026-03-01", meses: 6, retiro: { salida: "2026-09-11", causal: "DESPIDO SIN JUSTA CAUSA", liquidacion: 3_480_000, estado: "PENDIENTE" }, nacimiento: "1993-10-14" },
];

const EPS = LISTAS_INICIALES.eps;
const AFP = LISTAS_INICIALES.afp;
const BANCOS = LISTAS_INICIALES.bancos;
const PARENTESCOS = ["MADRE", "PADRE", "PAREJA", "HERMANO"];
const NOMBRES_EMERG = ["CLAUDIA", "MARTHA", "JORGE", "LUIS", "PATRICIA", "CARLOS", "GLORIA", "RICARDO"];
const CALLES = ["Calle", "Carrera", "Avenida", "Transversal", "Diagonal"];

export function crearSeed(): DB {
  const r = rng(20261009);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const num = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");
  const historial: Historial[] = [];
  const salarios: Salario[] = [];
  let hid = 0;
  const empleados: Empleado[] = DEFS.map((d, i) => {
    const id = `LB${String(i + 1).padStart(4, "0")}`;
    const faltan = d.docsFaltantes ?? 0;
    const tipos = ARCHIVOS_OBLIGATORIOS.slice(0, ARCHIVOS_OBLIGATORIOS.length - faltan);
    const archivos: Archivo[] = tipos.map((t, k) => ({
      id: `${id}-${t}`,
      tipo: t,
      nombre: nombreArchivo(id, t, t === "FOTO" ? "foto.jpg" : "doc.pdf"),
      subcarpeta: ARCHIVOS[t].subcarpeta,
      mime: t === "FOTO" ? "image/jpeg" : "application/pdf",
      tamano: 120_000 + k * 7_000,
      subidoEn: addDias(d.inicio, 1),
      subidoPor: "Coordinación",
      vence: t === "ANTECEDENTES" && i === 9 ? "2026-09-30" : undefined,
    }));
    const examenEstatus = d.retiro || i < 3 ? "APROBADO" : pick(["APROBADO", "APROBADO", "REALIZADO", "AGENDADO", "PENDIENTE CITAR", "APTO CON RESTRICCIONES"] as const);
    const terminacion = d.contrato === "FIJO" ? d.terminacion ?? calcularTerminacion(d.inicio, d.meses ?? 6) : null;
    const e: Empleado = {
      id,
      estatus: d.retiro ? "RETIRADO" : "ACTIVO",
      esSocio: !!d.socio,
      tipoContrato: d.contrato,
      inicioContrato: d.inicio,
      duracionMeses: d.contrato === "FIJO" ? d.meses ?? 6 : null,
      terminacionContrato: terminacion,
      renovaciones: d.renovaciones ?? 0,
      nombreCompleto: d.nombre,
      fechaNacimiento: d.nacimiento,
      tipoDocumento: i === 24 ? "PPT" : i === 12 ? "CE" : "CC",
      numeroDocumento: "10" + num(8),
      genero: d.genero,
      celular: "3" + num(9),
      correo: d.nombre.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "." + num(3) + "@correo-demo.co",
      direccion: `${pick(CALLES)} ${10 + Math.floor(r() * 150)} # ${Math.floor(r() * 90)}-${Math.floor(r() * 99)}`,
      area: d.area,
      cargo: d.cargo,
      claseRiesgoArl: d.area === "AUDIOVISUAL" ? 2 : 1,
      eps: pick(EPS),
      arl: "SURA",
      afp: pick(AFP),
      banco: pick(BANCOS),
      tipoCuenta: r() > 0.85 ? "CORRIENTE" : "AHORROS",
      numeroCuenta: num(11),
      emergenciaNombre: `${pick(NOMBRES_EMERG)} ${d.nombre.split(" ").slice(-1)[0]}`,
      emergenciaParentesco: pick(PARENTESCOS),
      emergenciaCelular: "3" + num(9),
      examen: {
        estatus: examenEstatus,
        desde: examenEstatus === "PENDIENTE CITAR" ? addDias("2026-10-09", -6) : addDias(d.inicio, 3),
        citaFechaHora: examenEstatus === "AGENDADO" ? "2026-10-05T08:30" : undefined,
        restricciones: examenEstatus === "APTO CON RESTRICCIONES" ? "Evitar levantar cargas superiores a 10 kg." : undefined,
      },
      examenEgreso: d.retiro
        ? { estatus: d.retiro.estado === "PENDIENTE" ? "PENDIENTE CITAR" : "APROBADO", desde: d.retiro.salida }
        : undefined,
      autorizacionDatos: true,
      autorizacionFecha: d.inicio,
      archivos,
      retiro: d.retiro
        ? {
            fechaNotificacion: addDias(d.retiro.salida, -15),
            causal: d.retiro.causal,
            fechaSalida: d.retiro.salida,
            valorLiquidacion: d.retiro.liquidacion,
            estadoLiquidacion: d.retiro.estado,
          }
        : undefined,
      creadoEn: d.inicio,
    };
    // Historial de ingreso / retiro (fuente de las gráficas mensuales)
    historial.push({ id: `h${++hid}`, ts: `${d.inicio}T09:00:00.000Z`, usuario: "Coordinación", modulo: "EMPLEADOS", evento: "INGRESO", empleadoId: id, nombre: d.nombre, campo: "estatus", anterior: "", nuevo: "ACTIVO", detalle: `${d.cargo} · ${d.contrato}` });
    if (d.retiro) {
      historial.push({ id: `h${++hid}`, ts: `${d.retiro.salida}T17:00:00.000Z`, usuario: "Coordinación", modulo: "EMPLEADOS", evento: "RETIRO", empleadoId: id, nombre: d.nombre, campo: "estatus", anterior: "ACTIVO", nuevo: "RETIRADO", detalle: d.retiro.causal });
    }
    // Salario vigente desde el ingreso, tomado de la plantilla por cargo
    const pl = PLANTILLA_INICIAL.find((p) => p.cargo === d.cargo)!;
    salarios.push({
      id: `s-${id}-1`,
      empleadoId: id,
      base: d.base ?? pl.base,
      auxNoPrestPct: pl.auxNoPrestPct,
      deduccionesAsumidas: d.cargo === "COORDINADOR ADMINISTRATIVO",
      retencionModo: "MANUAL",
      retencionManual: d.socio ? 650_000 : 0,
      vigenteDesde: d.inicio,
      motivo: "Salario de ingreso (plantilla por cargo)",
    });
    return e;
  });

  // Aumentos aprobados durante el año (para mostrar variación > 5 %)
  const aumentos: [string, number, string][] = [
    ["LB0006", 3_800_000, "2026-07-01"],
    ["LB0011", 2_350_000, "2026-09-01"],
  ];
  for (const [eid, base, desde] of aumentos) {
    const prev = salarios.filter((s) => s.empleadoId === eid).pop()!;
    salarios.push({ ...prev, id: `s-${eid}-2`, base, vigenteDesde: desde, motivo: "Aumento aprobado por desempeño" });
    const emp = empleados.find((e) => e.id === eid)!;
    historial.push({ id: `h${++hid}`, ts: `${desde}T10:00:00.000Z`, usuario: "Administrador", modulo: "NOMINA", evento: "CAMBIO SALARIAL", empleadoId: eid, nombre: emp.nombreCompleto, campo: "base", anterior: String(prev.base), nuevo: String(base), detalle: "Propuesta aprobada" });
  }

  return {
    version: 1,
    empleados,
    salarios,
    historial,
    parametros: [
      { ...PARAMETROS_2026, anio: 2025, smmlv: 1_423_500, auxTransporte: 200_000, uvt: 49_799, recargos: { ...PARAMETROS_2026.recargos, dominical: 0.8 }, horasMes: 220, festivos: [] },
      PARAMETROS_2026,
    ],
    plantilla: PLANTILLA_INICIAL,
    propuestas: [
      {
        id: "p1",
        tipo: "AUMENTO_PERSONA",
        empleadoId: "LB0018",
        cargo: "DISEÑADOR SR",
        area: "DISEÑO",
        baseAntes: 2_500_000,
        baseDespues: 2_750_000,
        justificacion: "Lidera la cuenta principal de retail y asumió la dirección de arte del Q4.",
        comentarios: "Alineado con la banda salarial del cargo.",
        fechaAplicacion: "2026-11-01",
        estado: "PENDIENTE",
        creadoPor: "Coordinación",
        creadoEn: "2026-10-06T15:20:00.000Z",
      },
      {
        id: "p0",
        tipo: "AUMENTO_PERSONA",
        empleadoId: "LB0011",
        cargo: "COMMUNITY MANAGER SR",
        area: "MARKETING",
        baseAntes: 2_150_000,
        baseDespues: 2_350_000,
        justificacion: "Cumplimiento de objetivos del semestre.",
        comentarios: "",
        fechaAplicacion: "2026-09-01",
        estado: "APROBADA",
        aplicada: true,
        creadoPor: "Coordinación",
        creadoEn: "2026-08-20T11:00:00.000Z",
        resolucion: { por: "Administrador", en: "2026-08-22T09:10:00.000Z", comentario: "Aprobado." },
      },
    ],
    periodos: [],
    cuentasPorPagar: [],
    provisiones: [],
    ingresos: [
      ["2026-01", 182_400_000], ["2026-02", 176_900_000], ["2026-03", 198_300_000],
      ["2026-04", 205_100_000], ["2026-05", 214_800_000], ["2026-06", 221_500_000],
      ["2026-07", 229_000_000], ["2026-08", 236_700_000], ["2026-09", 241_200_000],
    ].map(([mes, valor]) => ({ mes: mes as string, valor: valor as number })),
    listas: LISTAS_INICIALES,
  };
}
