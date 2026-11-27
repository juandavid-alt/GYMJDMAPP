import { describe, expect, it } from "vitest";
import { SERVICIOS_INICIALES, TRIBUTARIOS_2026 as T } from "./catalogosFin";
import {
  calcularDV, calcularFactura, conciliar, nivelCobro, normalizarNumero, pautaDesdeBase, pautaDesdeSubtotal, programar, rangoAging, valorVigente,
  type Cliente, type Contrato, type Factura,
} from "./facturacion";

const cliente = (perfil: Partial<Cliente["perfil"]> = {}, extra: Partial<Cliente> = {}): Cliente => ({
  id: "CB000001", nombreComercial: "BEENA", razonSocial: "VARGAS CASTILLO HOLDINGS S.A.S.", nit: "901761819", dv: "8", alias: ["BEENA"],
  correosFacturacion: [], correoCartera: "", contacto: { nombre: "", cargo: "", celular: "" }, representanteLegal: "", direccion: "",
  perfil: { granContribuyente: false, autorretenedor: false, agenteReteIcaBogota: false, regimenSimple: false, entidadPublica: false, ...perfil },
  requiereOC: false, ciclo: 1, plazoPago: 30, estado: "ACTIVO", proyectos: [], rutCargado: false, certificadoRetencion: {}, confirmadoCorreoCobro: false, creadoEn: "", ...extra,
});

const factura = (extra: Partial<Factura> = {}): Factura => ({
  id: "f1", numero: null, datoIncompleto: false, tipo: "FIJA", clienteId: "CB000001", proyecto: "", contratoId: null,
  items: [{ servicio: "Social Media Management", cantidad: 1, valor: 10_000_000 }], pauta: null, periodo: "2026-10", periodoTexto: "", descripcion: "",
  observaciones: "", estado: "EMITIDA", fechaProgramada: "2026-10-01", emision: "2026-10-01", vencimiento: "2026-10-31", oc: "", link: "", abonos: [],
  pago: null, ajusteNC: 0, reemiteA: null, fechaPagoComprometida: null, envios: [], creadoEn: "", ...extra,
});

describe("facturación", () => {
  it("normaliza el número de factura", () => {
    expect(normalizarNumero(" fv 42a ")).toBe("FV42A");
  });

  it("calcula el dígito de verificación del NIT", () => {
    expect(calcularDV("901761819")).toBe("8");
    expect(calcularDV("800078482")).toBe("4");
    expect(calcularDV("900234308")).toBe("2");
    expect(calcularDV("890304099")).toBe("3");
  });

  it("calcula IVA, retenciones y neto según el perfil tributario", () => {
    const c = calcularFactura(factura(), cliente({ granContribuyente: true, agenteReteIcaBogota: true }), SERVICIOS_INICIALES, T);
    expect(c.subtotal).toBe(10_000_000);
    expect(c.iva).toBeCloseTo(1_900_000);
    expect(c.total).toBeCloseTo(11_900_000);
    expect(c.reteFuente).toBeCloseTo(400_000);
    expect(c.reteIva).toBeCloseTo(285_000);
    expect(c.reteIca).toBeCloseTo(96_600);
    expect(c.netoEsperado).toBeCloseTo(11_900_000 - 400_000 - 285_000 - 96_600);
    expect(c.ingresoPropio).toBe(10_000_000);
  });

  it("régimen simple no practica retención en la fuente", () => {
    expect(calcularFactura(factura(), cliente({ regimenSimple: true }), SERVICIOS_INICIALES, T).reteFuente).toBe(0);
  });

  it("pauta con incremento: solo el incremento es ingreso propio", () => {
    expect(pautaDesdeBase(30_000_000, 0.08)).toEqual({ base: 30_000_000, incremento: 2_400_000, subtotal: 32_400_000 });
    const d = pautaDesdeSubtotal(32_400_000, 0.08);
    expect(d.base).toBeCloseTo(30_000_000);
    expect(d.incremento).toBeCloseTo(2_400_000);
    const c = calcularFactura(factura({ tipo: "PAUTA", items: [{ servicio: "Pauta con incremento", cantidad: 1, valor: 0 }], pauta: { base: 30_000_000, pct: 0.08, fechaEjecucion: "" } }), cliente(), SERVICIOS_INICIALES, T);
    expect(c.subtotal).toBeCloseTo(32_400_000);
    expect(c.ingresoPropio).toBeCloseTo(2_400_000);
    expect(c.reembolsoPauta).toBeCloseTo(30_000_000);
  });

  it("nota crédito parcial ajusta el valor y la total anula el saldo", () => {
    const c = calcularFactura(factura({ ajusteNC: 2_000_000 }), cliente(), SERVICIOS_INICIALES, T);
    expect(c.subtotal).toBe(8_000_000);
    expect(calcularFactura(factura({ estado: "ANULADA" }), cliente(), SERVICIOS_INICIALES, T).saldo).toBe(0);
  });

  it("abonos reducen el saldo", () => {
    const c = calcularFactura(factura({ estado: "ABONADA", abonos: [{ id: "a", fecha: "2026-10-05", valor: 5_000_000, banco: "", nota: "" }] }), cliente(), SERVICIOS_INICIALES, T);
    expect(c.saldo).toBeCloseTo(c.netoEsperado - 5_000_000);
  });
});

describe("contratos y programación", () => {
  const contrato: Contrato = {
    id: "CT-0001", clienteId: "CB000001", proyecto: "", inicio: "2026-09-01", duracionMeses: 6, fin: "2027-02-28", renovacionAuto: false,
    valorMensual: 2_250_000, servicios: [{ servicio: "Performance", entregables: "" }], incrementoPautaPct: 0, oc: null,
    otrosies: [{ desde: "2026-12-01", valorMensual: 2_500_000, nota: "" }], estado: "ACTIVO", contratoCargado: false, nota: "",
  };
  it("aplica otrosíes desde su vigencia", () => {
    expect(valorVigente(contrato, "2026-11")).toBe(2_250_000);
    expect(valorVigente(contrato, "2026-12")).toBe(2_500_000);
  });
  it("programa una factura por mes hasta el fin, sin duplicar", () => {
    let n = 0;
    const ex = [factura({ contratoId: "CT-0001", periodo: "2026-10" })];
    const out = programar(contrato, cliente({}, { ciclo: 15 }), ex, "2026-10", () => `p${++n}`, SERVICIOS_INICIALES);
    expect(out.map((f) => f.periodo)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(out[0].fechaProgramada).toBe("2026-11-15");
    expect(out[1].items[0].valor).toBe(2_500_000);
  });
});

describe("cartera", () => {
  it("clasifica antigüedad y nivel de cobro", () => {
    expect(rangoAging(5)).toBe("AL DÍA");
    expect(rangoAging(-45)).toBe("31–60");
    expect(rangoAging(-120)).toBe("+90");
    expect(nivelCobro(9)).toBe("COBRO");
    expect(nivelCobro(2)).toBe("COBRO CLIENTE");
    expect(nivelCobro(-1)).toBe("URGENCIA");
    expect(nivelCobro(20)).toBe(null);
  });
  it("concilia por alias y razón social", () => {
    const cs = [cliente({}, { alias: ["BEENA"] }), cliente({}, { id: "CB000013", nombreComercial: "LE GRAND", razonSocial: "FIOREZONAG SAS", alias: ["LEGRAND"] })];
    expect(conciliar("BEENA ", cs).nivel).toBe("EXACTA");
    expect(conciliar("Fiorezonag S.A.S.", cs).cliente?.id).toBe("CB000013");
    expect(conciliar("PANGEA", cs).nivel).toBe("NINGUNA");
  });
});
