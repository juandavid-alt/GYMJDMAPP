// Modelo de dominio de Brutal OS. Refleja 1:1 las tablas de supabase/schema.sql.

import type { Cliente, ConfigIndice, Contrato, Factura, Gasto, NotaCredito, ParamsTributarios, Servicio } from "./facturacion";

export type Rol = "ADMINISTRADOR" | "COORDINACION" | "CONTADORA" | "CONSULTA" | "EMPLEADO";

export type Estatus = "ACTIVO" | "RETIRADO";
export type TipoContrato = "FIJO" | "INDEFINIDO" | "PS";
export type TipoDocumento = "CC" | "CE" | "PPT";
export type Genero = "MASCULINO" | "FEMENINO" | "OTRO";
export type TipoCuenta = "AHORROS" | "CORRIENTE";

export type EstatusExamen =
  | "PENDIENTE CITAR"
  | "AGENDADO"
  | "REALIZADO"
  | "APROBADO"
  | "APTO CON RESTRICCIONES"
  | "NO APTO";

export type CausalRetiro =
  | "RENUNCIA"
  | "TERMINACIÓN POR VENCIMIENTO"
  | "DESPIDO CON JUSTA CAUSA"
  | "DESPIDO SIN JUSTA CAUSA"
  | "MUTUO ACUERDO"
  | "FIN DE PRESTACIÓN DE SERVICIOS"
  | "SIN REGISTRAR";

export type Subcarpeta =
  | "Documentos personales"
  | "Contrato"
  | "Exámenes médicos"
  | "Seguridad social"
  | "Retiro";

export type TipoArchivo =
  | "CEDULA"
  | "CERTIFICADO_BANCARIO"
  | "AFILIACION_EPS"
  | "AFILIACION_PENSION"
  | "AFILIACION_ARL"
  | "ANTECEDENTES"
  | "FOTO"
  | "CONTRATO_FIRMADO"
  | "EXAMEN_INGRESO"
  | "EXAMEN_EGRESO"
  | "CARTA_RETIRO"
  | "SOPORTE_LIQUIDACION";

export interface Archivo {
  id: string;
  tipo: TipoArchivo;
  /** Nombre estándar: LB0012_CEDULA.pdf */
  nombre: string;
  subcarpeta: Subcarpeta;
  mime: string;
  tamano: number;
  subidoEn: string; // ISO
  subidoPor: string;
  vence?: string; // ISO (opcional)
}

export interface Examen {
  estatus: EstatusExamen;
  desde: string; // ISO fecha en que entró al estatus actual
  citaFechaHora?: string; // ISO datetime cuando está AGENDADO
  restricciones?: string;
}

export interface Retiro {
  fechaNotificacion: string;
  causal: CausalRetiro;
  fechaSalida: string;
  valorLiquidacion: number;
  estadoLiquidacion: "PENDIENTE" | "PAGADA";
}

export interface Empleado {
  id: string; // LB0001
  estatus: Estatus;
  esSocio: boolean;
  // Contrato
  tipoContrato: TipoContrato;
  inicioContrato: string; // ISO
  duracionMeses: 6 | 12 | null; // solo FIJO
  terminacionContrato: string | null; // solo FIJO
  renovaciones: number;
  // Datos personales
  nombreCompleto: string;
  fechaNacimiento: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  genero: Genero;
  celular: string;
  correo: string;
  direccion: string;
  // Laboral
  area: string;
  cargo: string;
  claseRiesgoArl: 1 | 2 | 3 | 4 | 5;
  // Seguridad social
  eps: string;
  arl: string;
  afp: string;
  // Bancarios
  banco: string;
  tipoCuenta: TipoCuenta;
  numeroCuenta: string;
  // Emergencia
  emergenciaNombre: string;
  emergenciaParentesco: string;
  emergenciaCelular: string;
  // Examen médico
  examen: Examen;
  examenEgreso?: Examen;
  // Habeas data (Ley 1581 de 2012)
  autorizacionDatos: boolean;
  autorizacionFecha: string;
  archivos: Archivo[];
  retiro?: Retiro;
  creadoEn: string;
}

/** BBDD SALARIO NÓMINA: separada del empleado, enlazada por ID, con historial por vigencia. */
export interface Salario {
  id: string;
  empleadoId: string;
  base: number; // base prestacional
  /** % auxilio no prestacional; null = regla de PARÁMETROS (25 % mínimo / 35 % resto) */
  auxNoPrestPct: number | null;
  deduccionesAsumidas: boolean;
  retencionModo: "MANUAL" | "AUTO";
  retencionManual: number;
  vigenteDesde: string; // ISO
  motivo: string;
  propuestaId?: string;
}

export interface Historial {
  id: string;
  ts: string; // ISO datetime
  usuario: string;
  modulo: "EMPLEADOS" | "NOMINA" | "CONFIGURACION" | "FACTURACION" | "CLIENTES" | "CARTERA" | "GASTOS" | "INDICE";
  evento: string; // INGRESO, RETIRO, RENOVACIÓN, CAMBIO, ...
  empleadoId?: string;
  nombre?: string;
  campo?: string;
  anterior?: string;
  nuevo?: string;
  detalle?: string;
}

export interface FspTramo {
  desdeSmmlv: number;
  pct: number;
}

export interface Parametros {
  anio: number;
  smmlv: number;
  auxTransporte: number;
  topeAuxTransporteSmmlv: number; // 2
  uvt: number;
  auxNoPrestPctGeneral: number; // 0.35
  auxNoPrestPctMinimo: number; // 0.25
  topeNoSalarialPct: number; // 0.40 (Ley 1393 de 2010)
  saludEmpleadoPct: number; // 0.04
  pensionEmpleadoPct: number; // 0.04
  fsp: FspTramo[]; // Fondo de solidaridad pensional
  saludEmpleadorPct: number; // 0.085
  saludEmpleadorDesdeSmmlv: number; // 10
  pensionEmpleadorPct: number; // 0.12
  ccfPct: number; // 0.04
  icbfPct: number; // 0.03
  senaPct: number; // 0.02
  exoneracionIcbfSenaHastaSmmlv: number; // 10 (art. 114-1 E.T.)
  arlPct: Record<1 | 2 | 3 | 4 | 5, number>;
  cesantiasPct: number; // 0.0833
  primaPct: number; // 0.0833
  interesesCesantiasPct: number; // 0.12
  vacacionesPct: number; // 0.0417
  incapacidadPct: number; // 0.6667
  horasMes: number; // 210 (jornada 42 h)
  recargos: { hed: number; hen: number; nocturno: number; dominical: number };
  cuentaProvisiones: { banco: string; tipo: TipoCuenta; numero: string };
  diaHabilPila: number; // día hábil de vencimiento según NIT
  festivos: string[]; // ISO
  incrementoSmmlvProyeccion: number; // 0.07
  incrementoGeneralProyeccion: number; // 0
  variacionAlertaPct: number; // 0.05
}

export interface CargoPlantilla {
  cargo: string;
  area: string;
  base: number;
  auxNoPrestPct: number | null;
}

export type EstadoPropuesta = "PENDIENTE" | "APROBADA" | "RECHAZADA" | "DEVUELTA";

export interface Propuesta {
  id: string;
  tipo: "AUMENTO_PERSONA" | "AUMENTO_CARGO" | "NUEVO_CARGO";
  empleadoId?: string;
  cargo: string;
  area: string;
  baseAntes: number;
  baseDespues: number;
  justificacion: string;
  comentarios: string;
  fechaAplicacion: string;
  estado: EstadoPropuesta;
  creadoPor: string;
  creadoEn: string;
  aplicada?: boolean;
  resolucion?: { por: string; en: string; comentario: string };
}

export interface Novedades {
  diasContrato: number; // días del mes con contrato vigente (prorrateo ingreso/retiro)
  diasIncapacidad: number;
  diasLicenciaRemunerada: number;
  diasLicenciaNoRemunerada: number;
  diasVacaciones: number;
  hed: number; // horas extra diurnas
  hen: number; // horas extra nocturnas
  horasRecargoNocturno: number;
  horasDominical: number;
  bonificacionSalarial: number;
  bonificacionNoSalarial: number;
  prestamos: number;
  anticipos: number;
  otrosDescuentos: number;
  nota: string;
}

export interface FilaNomina {
  empleadoId: string;
  esSocio: boolean;
  nombre: string;
  area: string;
  cargo: string;
  tipoDocumento: TipoDocumento;
  numeroDocumento: string;
  banco: string;
  tipoCuenta: TipoCuenta;
  numeroCuenta: string;
  claseRiesgoArl: 1 | 2 | 3 | 4 | 5;
  base: number;
  auxNoPrestPct: number | null;
  deduccionesAsumidas: boolean;
  retencionModo: "MANUAL" | "AUTO";
  retencionManual: number;
  novedades: Novedades;
  cargada: boolean;
  devuelta?: { comentario: string; por: string; en: string };
}

export type EstadoNomina =
  | "BORRADOR"
  | "CARGADO"
  | "EN APROBACIÓN"
  | "APROBADO"
  | "ENVIADO A PAGOS";

export interface PeriodoNomina {
  id: string; // 2026-10
  anio: number;
  mes: number; // 1..12
  estado: EstadoNomina;
  filas: FilaNomina[];
  aprobadoPor?: string;
  aprobadoEn?: string;
  reaperturas: { por: string; en: string; motivo: string }[];
}

export interface CuentaPorPagar {
  id: string;
  periodoId: string;
  tipo: "NOMINA" | "PROVISIONES" | "PLANILLA" | "PRESTACIONES";
  beneficiario: string;
  empleadoId?: string;
  banco: string;
  tipoCuenta: TipoCuenta | "";
  numeroCuenta: string;
  valor: number;
  fechaLimite: string;
  estado: "PENDIENTE" | "PAGADO" | "RECHAZADO";
  fechaPago?: string;
}

export interface MovimientoProvision {
  id: string;
  fecha: string;
  periodoId?: string;
  tipo: "APORTE" | "PAGO PRIMA" | "PAGO CESANTÍAS" | "PAGO INTERESES" | "PAGO VACACIONES";
  valor: number; // positivo aporte, negativo pago
  detalle: string;
}

export interface IngresoMensual {
  mes: string; // 2026-01
  valor: number;
}

export interface Otp {
  codigo: string;
  proposito: string;
  expira: number;
}

export interface DB {
  version: number;
  empleados: Empleado[];
  salarios: Salario[];
  historial: Historial[];
  parametros: Parametros[];
  plantilla: CargoPlantilla[];
  propuestas: Propuesta[];
  periodos: PeriodoNomina[];
  cuentasPorPagar: CuentaPorPagar[];
  provisiones: MovimientoProvision[];
  ingresos: IngresoMensual[];
  listas: ListasMaestras;
  // Ciclo de facturación e Índice
  clientes: Cliente[];
  contratos: Contrato[];
  facturas: Factura[];
  notasCredito: NotaCredito[];
  servicios: Servicio[];
  tributarios: ParamsTributarios[];
  gastos: Gasto[];
  configIndice: ConfigIndice;
  notasMigracion: string[];
}

export interface ListasMaestras {
  areas: string[];
  cargos: { cargo: string; area: string }[];
  eps: string[];
  afp: string[];
  arl: string[];
  bancos: string[];
  tiposCuenta: TipoCuenta[];
  tiposContrato: { valor: TipoContrato; etiqueta: string; activo: boolean }[];
  tiposDocumento: TipoDocumento[];
  estatus: Estatus[];
  estatusExamen: EstatusExamen[];
  parentescos: string[];
  causalesRetiro: CausalRetiro[];
}
