import { addDias, diffDias, finDeMes, hoy, mesId, mesSiguiente } from "./fechas";

// Ciclo de facturación: CLIENTE (código) → CONTRATO → FACTURA PROGRAMADA → EMITIDA → CARTERA → PAGADA → INGRESO.
// Todo valor se registra ANTES de IVA; IVA y retenciones salen de PARÁMETROS TRIBUTARIOS.

export type EstadoCliente = "ACTIVO" | "EN PAUSA" | "RETIRADO" | "POR CONFIRMAR";

export interface PerfilTributario {
  granContribuyente: boolean;
  autorretenedor: boolean;
  agenteReteIcaBogota: boolean;
  regimenSimple: boolean;
  entidadPublica: boolean;
}

export interface Cliente {
  id: string; // código interno único: CB000001
  nombreComercial: string;
  razonSocial: string;
  nit: string; // sin DV
  dv: string;
  alias: string[];
  correosFacturacion: string[];
  correoCartera: string;
  contacto: { nombre: string; cargo: string; celular: string };
  representanteLegal: string;
  direccion: string;
  perfil: PerfilTributario;
  requiereOC: boolean;
  ciclo: 1 | 15;
  plazoPago: number; // días
  estado: EstadoCliente;
  proyectos: string[];
  rutCargado: boolean;
  certificadoRetencion: Record<string, boolean>; // año → recibido
  confirmadoCorreoCobro: boolean;
  creadoEn: string;
}

export interface ServicioContrato {
  servicio: string;
  entregables: string;
}

export interface Otrosi {
  desde: string; // ISO, primer día de vigencia
  valorMensual: number;
  nota: string;
}

export interface Contrato {
  id: string; // CT-0001
  clienteId: string;
  proyecto: string;
  inicio: string;
  duracionMeses: number | null; // null = duración por definir
  fin: string | null;
  renovacionAuto: boolean;
  valorMensual: number; // valor inicial antes de IVA
  servicios: ServicioContrato[];
  incrementoPautaPct: number; // 0.08 = 8 %
  oc: { numero: string; valor: number; vigencia: string } | null;
  otrosies: Otrosi[];
  estado: "ACTIVO" | "EN PAUSA" | "TERMINADO";
  contratoCargado: boolean;
  nota: string;
}

export type TipoFactura = "FIJA" | "ADICIONAL" | "ONE SHOT" | "PAUTA";
export type EstadoFactura = "PROGRAMADA" | "EMITIDA" | "ABONADA" | "PAGADA" | "EN PAUSA" | "ANULADA";

export interface ItemFactura {
  servicio: string;
  cantidad: number;
  valor: number; // unitario antes de IVA
}

export interface Abono {
  id: string;
  fecha: string | null;
  valor: number;
  banco: string;
  nota: string;
}

export interface Factura {
  id: string;
  numero: string | null; // normalizado, único
  datoIncompleto: boolean; // histórica sin número (migración)
  tipo: TipoFactura;
  clienteId: string;
  proyecto: string;
  contratoId: string | null;
  items: ItemFactura[];
  pauta: { base: number; pct: number; fechaEjecucion: string } | null;
  periodo: string; // AAAA-MM del servicio
  periodoTexto: string;
  descripcion: string;
  observaciones: string;
  estado: EstadoFactura;
  fechaProgramada: string;
  emision: string | null;
  vencimiento: string | null;
  oc: string;
  link: string;
  abonos: Abono[];
  pago: { fecha: string | null; valorRecibido: number; banco: string; diferencia: string; retencionesReales: number } | null;
  ajusteNC: number; // reducción del subtotal por notas crédito parciales
  reemiteA: string | null;
  fechaPagoComprometida: string | null;
  envios: { fecha: string; destinatario: string; tipo: string }[];
  creadoEn: string;
}

export interface NotaCredito {
  id: string;
  facturaId: string;
  motivo: "ERROR EN VALOR" | "ERROR EN DATOS" | "SERVICIO NO PRESTADO" | "DESCUENTO" | "DUPLICADA" | "OTRO";
  alcance: "TOTAL" | "PARCIAL";
  valor: number; // antes de IVA
  detalle: string;
  estado: "SOLICITADA" | "APROBADA" | "RECHAZADA";
  numero: string | null;
  solicitadaPor: string;
  solicitadaEn: string;
  resueltaPor?: string;
  resueltaEn?: string;
  comentario?: string;
}

export type CategoriaServicio = "MENSUAL" | "ADICIONAL" | "PAUTA" | "TERCEROS";

export interface Servicio {
  nombre: string;
  categoria: CategoriaServicio;
  conceptoRetencion: "SERVICIOS" | "HONORARIOS" | "PUBLICIDAD";
  baseIva: "TOTAL" | "INCREMENTO";
  activo: boolean;
}

export interface ParamsTributarios {
  anio: number;
  ivaPct: number;
  reteIvaPct: number; // sobre el IVA
  reteFuente: Record<Servicio["conceptoRetencion"], { pct: number; baseUvt: number }>;
  reteIcaPorMil: number;
  reteIcaBaseUvt: number;
  uvt: number;
}

export type TipoGasto = "COSTO" | "GASTO" | "SOCIOS" | "FUERA";

export interface Gasto {
  id: string;
  fecha: string;
  proveedor: string;
  valor: number; // antes de IVA
  iva: number;
  tipo: TipoGasto;
  categoria: string;
  subcategoria: string;
  recurrente: boolean;
  clienteId: string | null;
  area: string;
  soporte: string;
  creadoEn: string;
}

export interface ConfigIndice {
  metaVentasAnual: number;
  metaMargenBruto: number;
  metaMargenOperacional: number;
  metaNominaPctIngresos: number;
  presupuesto: Record<string, { ingresos: number; costos: number; gastos: number }>; // AAAA-MM
  umbralSobrecosto: number;
  topeGastoAbrupto: number;
  umbralConcentracion: number;
  topeCapitalPauta: number;
  mesesPromedio: number;
  pctRenovacion: number;
  notas: { id: string; texto: string; por: string; en: string }[];
  plantillaCorreo: { asunto: string; cuerpo: string };
  correoBrutal: string;
  telefonoBrutal: string;
}

// ---------------- Utilidades ----------------

/** Normaliza el número de factura: sin espacios y en mayúsculas ("fv 42a" = "FV42A"). */
export function normalizarNumero(s: string): string {
  return s.replace(/\s+/g, "").toUpperCase();
}

/** Dígito de verificación del NIT (algoritmo DIAN, módulo 11). */
export function calcularDV(nit: string): string {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const d = nit.replace(/\D/g, "").split("").reverse();
  const suma = d.reduce((s, c, i) => s + Number(c) * pesos[i], 0);
  const r = suma % 11;
  return String(r > 1 ? 11 - r : r);
}

export function validarNit(nit: string, dv: string): boolean {
  return /^\d{6,10}$/.test(nit) && calcularDV(nit) === dv;
}

export const normTexto = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9 ]/gi, " ").replace(/\b(S A S|SAS|S A|SA|LTDA|LIMITADA|LLC)\b/gi, "").replace(/\s+/g, " ").trim().toUpperCase();

/** Busca un cliente por código, nombre, razón social, alias o NIT. */
export function coincide(c: Cliente, q: string): boolean {
  const t = normTexto(q);
  if (!t) return true;
  const nit = q.replace(/\D/g, "");
  return (
    c.id.includes(q.toUpperCase()) ||
    (nit.length >= 5 && c.nit.startsWith(nit)) ||
    [c.nombreComercial, c.razonSocial, ...c.alias, ...c.proyectos].some((x) => normTexto(x).includes(t))
  );
}

export type Conciliacion = { nivel: "EXACTA" | "PROBABLE" | "NINGUNA"; cliente?: Cliente };

/** Conciliación de nombres del histórico contra la BBDD de clientes. */
export function conciliar(nombre: string, clientes: Cliente[]): Conciliacion {
  const t = normTexto(nombre);
  const exacta = clientes.find((c) => [c.nombreComercial, c.razonSocial, ...c.alias].some((x) => normTexto(x) === t) || (c.nit && nombre.replace(/\D/g, "").startsWith(c.nit)));
  if (exacta) return { nivel: "EXACTA", cliente: exacta };
  const palabras = t.split(" ").filter((w) => w.length > 3);
  const probable = clientes.find((c) => [c.nombreComercial, c.razonSocial, ...c.alias].some((x) => {
    const n = normTexto(x);
    return n && (n.includes(t) || t.includes(n) || palabras.some((w) => n.split(" ").includes(w)));
  }));
  return probable ? { nivel: "PROBABLE", cliente: probable } : { nivel: "NINGUNA" };
}

// ---------------- Cálculo de factura ----------------

export interface CalculoFactura {
  subtotal: number; // antes de IVA, neto de notas crédito
  baseGravable: number;
  iva: number;
  total: number;
  reteFuente: number;
  reteIva: number;
  reteIca: number;
  retenciones: number;
  netoEsperado: number;
  ingresoPropio: number; // lo único que entra a Ingresos (pauta: solo el incremento)
  reembolsoPauta: number;
  terceros: number;
  abonado: number;
  saldo: number;
}

export function subtotalBruto(f: Pick<Factura, "items" | "pauta">): number {
  if (f.pauta) return f.pauta.base + f.pauta.base * f.pauta.pct;
  return f.items.reduce((s, i) => s + i.valor * i.cantidad, 0);
}

export function calcularFactura(f: Factura, cliente: Cliente | undefined, servicios: Servicio[], p: ParamsTributarios): CalculoFactura {
  const bruto = subtotalBruto(f);
  const factor = bruto ? Math.max(0, bruto - f.ajusteNC) / bruto : 0;
  const subtotal = bruto * factor;
  const perfil = cliente?.perfil;
  let baseGravable = 0;
  let reteFuente = 0;
  let reteIca = 0;
  let ingresoPropio = 0;
  let reembolsoPauta = 0;
  let terceros = 0;
  const lineas = f.pauta
    ? [{ servicio: f.items[0]?.servicio ?? "Pauta con incremento", base: f.pauta.base * factor, incremento: f.pauta.base * f.pauta.pct * factor }]
    : f.items.map((i) => ({ servicio: i.servicio, base: i.valor * i.cantidad * factor, incremento: 0 }));
  for (const l of lineas) {
    const s = servicios.find((x) => x.nombre === l.servicio);
    const total = l.base + l.incremento;
    const gravable = f.pauta && s?.baseIva === "INCREMENTO" ? l.incremento : total;
    baseGravable += gravable;
    const rf = p.reteFuente[s?.conceptoRetencion ?? "SERVICIOS"];
    if (perfil && !perfil.regimenSimple && gravable >= rf.baseUvt * p.uvt) reteFuente += gravable * rf.pct;
    if (perfil?.agenteReteIcaBogota && gravable >= p.reteIcaBaseUvt * p.uvt) reteIca += (gravable * p.reteIcaPorMil) / 1000;
    if (f.pauta) {
      ingresoPropio += l.incremento;
      reembolsoPauta += l.base;
    } else if (s?.categoria === "TERCEROS") terceros += total;
    else ingresoPropio += total;
  }
  const iva = baseGravable * p.ivaPct;
  const reteIva = perfil && (perfil.granContribuyente || perfil.entidadPublica) ? iva * p.reteIvaPct : 0;
  const total = subtotal + iva;
  const retenciones = f.pago?.retencionesReales ?? reteFuente + reteIva + reteIca;
  const netoEsperado = total - (reteFuente + reteIva + reteIca);
  const abonado = f.abonos.reduce((s, a) => s + a.valor, 0);
  const saldo = f.estado === "PAGADA" || f.estado === "ANULADA" || f.estado === "PROGRAMADA" || f.estado === "EN PAUSA" ? 0 : Math.max(0, netoEsperado - abonado);
  return { subtotal, baseGravable, iva, total, reteFuente, reteIva, reteIca, retenciones, netoEsperado, ingresoPropio, reembolsoPauta, terceros, abonado, saldo };
}

/** Pauta con incremento: se puede digitar la pauta ejecutada o el subtotal facturado. */
export function pautaDesdeBase(base: number, pct: number) {
  return { base, incremento: base * pct, subtotal: base + base * pct };
}
export function pautaDesdeSubtotal(subtotal: number, pct: number) {
  const base = subtotal / (1 + pct);
  return { base, incremento: subtotal - base, subtotal };
}

export function descripcionAuto(servicios: string[], proyecto: string, periodoTexto: string) {
  return [servicios.filter(Boolean).join(", "), proyecto, periodoTexto ? `Periodo ${periodoTexto}` : ""].filter(Boolean).join(" — ");
}

export function vencimientoSugerido(emision: string, plazo: number) {
  return addDias(emision, plazo);
}

/** Valor mensual vigente del contrato en un mes según sus otrosíes. */
export function valorVigente(c: Contrato, mes: string): number {
  const fecha = `${mes}-28`;
  const vig = [...c.otrosies].filter((o) => o.desde <= fecha).sort((a, b) => a.desde.localeCompare(b.desde)).pop();
  return vig ? vig.valorMensual : c.valorMensual;
}

/** Último mes que cubre el contrato (o diciembre del año en curso si la duración está por definir). */
export function mesFinal(c: Contrato): string {
  if (c.fin) return c.fin.slice(0, 7);
  return `${hoy().slice(0, 4)}-12`;
}

/**
 * Facturas programadas del contrato desde `desde` (AAAA-MM) hasta el fin, en el ciclo del cliente.
 * No duplica meses que ya tienen factura de ese contrato.
 */
export function programar(c: Contrato, cliente: Cliente, existentes: Factura[], desde: string, nuevoId: () => string, servicios: Servicio[]): Factura[] {
  const out: Factura[] = [];
  const ultimo = mesFinal(c);
  let cur = { anio: Number(desde.slice(0, 4)), mes: Number(desde.slice(5, 7)) };
  const inicioMes = c.inicio.slice(0, 7);
  if (inicioMes > desde) cur = { anio: Number(inicioMes.slice(0, 4)), mes: Number(inicioMes.slice(5, 7)) };
  while (mesId(cur.anio, cur.mes) <= ultimo) {
    const mes = mesId(cur.anio, cur.mes);
    if (!existentes.some((f) => f.contratoId === c.id && f.periodo === mes && f.estado !== "ANULADA")) {
      const fecha = `${mes}-${String(cliente.ciclo).padStart(2, "0")}`;
      const nombres = c.servicios.map((s) => s.servicio);
      const mesNombre = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
      out.push({
        id: nuevoId(),
        numero: null,
        datoIncompleto: false,
        tipo: "FIJA",
        clienteId: c.clienteId,
        proyecto: c.proyecto,
        contratoId: c.id,
        items: [{ servicio: nombres[0] ?? servicios.find((s) => s.categoria === "MENSUAL")?.nombre ?? "Social Media Management", cantidad: 1, valor: valorVigente(c, mes) }],
        pauta: null,
        periodo: mes,
        periodoTexto: mesNombre,
        descripcion: descripcionAuto(nombres, c.proyecto, mesNombre),
        observaciones: "",
        estado: c.estado === "EN PAUSA" ? "EN PAUSA" : "PROGRAMADA",
        fechaProgramada: fecha,
        emision: null,
        vencimiento: vencimientoSugerido(fecha, cliente.plazoPago),
        oc: c.oc?.numero ?? "",
        link: "",
        abonos: [],
        pago: null,
        ajusteNC: 0,
        reemiteA: null,
        fechaPagoComprometida: null,
        envios: [],
        creadoEn: new Date().toISOString(),
      });
    }
    cur = mesSiguiente(cur.anio, cur.mes);
  }
  return out;
}

// ---------------- Cartera ----------------

export type Rango = "AL DÍA" | "1–30" | "31–60" | "61–90" | "+90";

export function diasParaVencer(f: Factura, ref = hoy()) {
  return f.vencimiento ? diffDias(ref, f.vencimiento) : null;
}

export function rangoAging(dias: number | null): Rango {
  if (dias === null || dias >= 0) return "AL DÍA";
  const v = -dias;
  if (v <= 30) return "1–30";
  if (v <= 60) return "31–60";
  if (v <= 90) return "61–90";
  return "+90";
}

export type NivelCobro = "COBRO" | "COBRO CLIENTE" | "URGENCIA" | null;

/** 10 días antes: cobro (amarillo) · 3 días antes: cobro + correo al cliente (naranja) · vencida: urgencia (rojo, cada 5 días). */
export function nivelCobro(dias: number | null): NivelCobro {
  if (dias === null) return null;
  if (dias < 0) return "URGENCIA";
  if (dias <= 3) return "COBRO CLIENTE";
  if (dias <= 10) return "COBRO";
  return null;
}

export function enCartera(f: Factura) {
  return f.estado === "EMITIDA" || f.estado === "ABONADA";
}

export function cuentaEnFacturado(f: Factura) {
  return f.estado === "EMITIDA" || f.estado === "ABONADA" || f.estado === "PAGADA";
}

export function correoCobro(plantilla: { asunto: string; cuerpo: string }, datos: Record<string, string>) {
  const r = (s: string) => s.replace(/\[([^\]]+)\]/g, (m, k) => datos[k] ?? m);
  return { asunto: r(plantilla.asunto), cuerpo: r(plantilla.cuerpo) };
}

export function mesesHasta(desde: string, hasta: string) {
  const out: string[] = [];
  let cur = { anio: Number(desde.slice(0, 4)), mes: Number(desde.slice(5, 7)) };
  while (mesId(cur.anio, cur.mes) <= hasta) {
    out.push(mesId(cur.anio, cur.mes));
    cur = mesSiguiente(cur.anio, cur.mes);
  }
  return out;
}

export const finMes = (mes: string) => finDeMes(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)));
