import type { ConfigIndice, ParamsTributarios, Servicio } from "./facturacion";

// Catálogo de servicios (editable en Configuración). Concepto de retención y base de IVA:
// valores iniciales a validar por la contadora.
const s = (nombre: string, categoria: Servicio["categoria"], conceptoRetencion: Servicio["conceptoRetencion"] = "SERVICIOS", baseIva: Servicio["baseIva"] = "TOTAL"): Servicio => ({ nombre, categoria, conceptoRetencion, baseIva, activo: true });

export const SERVICIOS_INICIALES: Servicio[] = [
  s("Estrategia", "MENSUAL"),
  s("Implementación de estrategia", "MENSUAL"),
  s("Social Media Management", "MENSUAL"),
  s("Producción", "MENSUAL"),
  s("Diseño", "MENSUAL"),
  s("Performance", "MENSUAL"),
  s("Automatización de pauta", "MENSUAL"),
  s("Gestión UGC", "MENSUAL"),
  s("E-mail marketing", "MENSUAL"),
  s("Creatividad", "MENSUAL"),
  s("Gestión TikTok", "MENSUAL"),
  s("PQRS / atención de comunidad", "MENSUAL"),
  s("Respuesta de mensajes (incluye Google)", "MENSUAL"),
  s("Respuesta en horario extendido", "MENSUAL"),
  s("Producción audiovisual", "ADICIONAL"),
  s("Postproducción fotográfica", "ADICIONAL"),
  s("Estrategia por proyecto / lanzamiento", "ADICIONAL"),
  s("Diseño puntual", "ADICIONAL"),
  s("Jingle / producción sonora", "ADICIONAL"),
  s("Chatbot", "ADICIONAL"),
  s("Shopify / e-commerce", "ADICIONAL"),
  s("Desarrollo web", "ADICIONAL"),
  s("Gestión de influencers", "ADICIONAL"),
  s("Eventos y activaciones", "ADICIONAL"),
  s("Consultoría", "ADICIONAL", "HONORARIOS"),
  s("Pauta con incremento", "PAUTA", "PUBLICIDAD", "TOTAL"),
  s("Pago a influencers", "TERCEROS"),
];

// Tarifas iniciales 2026 — LA CONTADORA DEBE VALIDARLAS antes de operar.
export const TRIBUTARIOS_2026: ParamsTributarios = {
  anio: 2026,
  ivaPct: 0.19,
  reteIvaPct: 0.15,
  reteFuente: {
    SERVICIOS: { pct: 0.04, baseUvt: 4 },
    HONORARIOS: { pct: 0.11, baseUvt: 0 },
    PUBLICIDAD: { pct: 0.04, baseUvt: 4 },
  },
  reteIcaPorMil: 9.66,
  reteIcaBaseUvt: 4,
  uvt: 52_374,
};

export const CONFIG_INDICE_INICIAL: ConfigIndice = {
  metaVentasAnual: 0,
  metaMargenBruto: 0.45,
  metaMargenOperacional: 0.2,
  metaNominaPctIngresos: 0.4,
  presupuesto: {},
  umbralSobrecosto: 0.15,
  topeGastoAbrupto: 5_000_000,
  umbralConcentracion: 0.2,
  topeCapitalPauta: 50_000_000,
  mesesPromedio: 6,
  pctRenovacion: 0.8,
  notas: [],
  plantillaCorreo: {
    asunto: "Recordatorio de pago — Factura [N.º FACTURA] — LA BRUTAL",
    cuerpo:
      "Hola, equipo de [RAZÓN SOCIAL]:\n\nLes recordamos que la factura [N.º FACTURA] por valor de [VALOR TOTAL], correspondiente a [DESCRIPCIÓN], vence el [FECHA DE VENCIMIENTO].\n\nAgradecemos programar el pago a tiempo para mantener la operación de sus servicios al día. Si el pago ya está programado, por favor confírmennos la fecha estimada en que se realizará respondiendo este correo.\n\nGracias,\nEquipo administrativo — LA BRUTAL\n[correo] · [teléfono]",
  },
  correoBrutal: "facturacion@labrutal.co",
  telefonoBrutal: "",
};

export const CATEGORIAS_GASTO: Record<"COSTO" | "GASTO" | "SOCIOS" | "FUERA", string[]> = {
  COSTO: ["Freelancers y proveedores de producción", "Herramientas de producción ligadas a clientes"],
  GASTO: ["Arriendo y servicios", "Software y suscripciones", "Honorarios profesionales", "Gastos bancarios y financieros", "Marketing propio y comercial", "Impuestos no descontables", "Otros"],
  SOCIOS: ["Compensación socios"],
  FUERA: ["Pauta adelantada", "Recursos de terceros"],
};

/** Áreas cuya nómina es costo (operativa); el resto es gasto (administrativa). */
export const AREAS_OPERATIVAS = ["DISEÑO", "MARKETING", "AUDIOVISUAL", "PAUTA", "INFLUENCER MARKETING"];
