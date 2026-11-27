import { getDB, getSesion, log, mutar, nuevoId } from "./store";
import {
  calcularFactura, normalizarNumero, programar, valorVigente,
  type Abono, type Cliente, type ConfigIndice, type Contrato, type Factura, type Gasto, type NotaCredito, type ParamsTributarios, type Servicio,
} from "../domain/facturacion";
import { addMeses, addDias, hoy } from "../domain/fechas";
import type { DB } from "../domain/types";

// Acciones del ciclo de facturación. Cada cambio queda en el Historial (quién, cuándo, antes, después).

export function tributariosDe(d: DB, anio: number): ParamsTributarios {
  return d.tributarios.find((p) => p.anio === anio) ?? [...d.tributarios].sort((a, b) => b.anio - a.anio)[0];
}

export function calcFactura(d: DB, f: Factura) {
  const anio = Number((f.emision ?? f.fechaProgramada).slice(0, 4));
  return calcularFactura(f, d.clientes.find((c) => c.id === f.clienteId), d.servicios, tributariosDe(d, anio));
}

// ---------------- Clientes ----------------

export function siguienteCodigoCliente(d: DB) {
  const max = d.clientes.reduce((m, c) => Math.max(m, Number(c.id.replace(/\D/g, "")) || 0), 0);
  return `CB${String(max + 1).padStart(6, "0")}`;
}

export function clientePorNit(nit: string) {
  const n = nit.replace(/\D/g, "");
  return n ? getDB().clientes.find((c) => c.nit === n) : undefined;
}

export function guardarCliente(c: Omit<Cliente, "id" | "creadoEn"> & { id?: string }): string {
  let id = c.id ?? "";
  mutar((d) => {
    if (c.nit && d.clientes.some((x) => x.nit === c.nit && x.id !== c.id)) throw new Error("Ya existe un cliente con ese NIT");
    if (c.id) {
      const i = d.clientes.findIndex((x) => x.id === c.id);
      const antes = d.clientes[i];
      d.clientes[i] = { ...antes, ...c } as Cliente;
      for (const k of ["estado", "ciclo", "plazoPago", "nit", "razonSocial", "requiereOC"] as const) {
        if (String(antes[k]) !== String(c[k])) log(d, { modulo: "CLIENTES", evento: "CLIENTE ACTUALIZADO", campo: `${c.id} · ${k}`, anterior: String(antes[k]), nuevo: String(c[k]) });
      }
    } else {
      id = siguienteCodigoCliente(d);
      d.clientes.push({ ...c, id, creadoEn: new Date().toISOString() } as Cliente);
      log(d, { modulo: "CLIENTES", evento: "CLIENTE CREADO", campo: id, nuevo: c.nombreComercial });
    }
  });
  return id || c.id!;
}

// ---------------- Contratos ----------------

export function guardarContrato(c: Omit<Contrato, "id"> & { id?: string }) {
  mutar((d) => {
    const fin = c.duracionMeses ? addDias(addMeses(c.inicio, c.duracionMeses), -1) : null;
    let contrato: Contrato;
    if (c.id) {
      const i = d.contratos.findIndex((x) => x.id === c.id);
      contrato = { ...d.contratos[i], ...c, fin } as Contrato;
      d.contratos[i] = contrato;
      log(d, { modulo: "CLIENTES", evento: "CONTRATO ACTUALIZADO", campo: contrato.id });
    } else {
      const n = d.contratos.reduce((m, x) => Math.max(m, Number(x.id.replace(/\D/g, "")) || 0), 0) + 1;
      contrato = { ...c, id: `CT-${String(n).padStart(4, "0")}`, fin } as Contrato;
      d.contratos.push(contrato);
      log(d, { modulo: "CLIENTES", evento: "CONTRATO CREADO", campo: contrato.id, nuevo: String(contrato.valorMensual) });
    }
    reprogramar(d, contrato);
  });
}

/** Recalcula solo las PROGRAMADAS futuras del contrato. Las emitidas no se tocan. */
function reprogramar(d: DB, c: Contrato) {
  const desde = hoy().slice(0, 7);
  d.facturas = d.facturas.filter((f) => !(f.contratoId === c.id && (f.estado === "PROGRAMADA" || f.estado === "EN PAUSA") && f.periodo >= desde && !f.numero));
  const cli = d.clientes.find((x) => x.id === c.clienteId);
  if (cli && c.estado !== "TERMINADO") d.facturas.push(...programar(c, cli, d.facturas, desde, nuevoId, d.servicios));
}

export function registrarOtrosi(contratoId: string, desde: string, valorMensual: number, nota: string) {
  mutar((d) => {
    const c = d.contratos.find((x) => x.id === contratoId)!;
    const anterior = valorVigente(c, desde.slice(0, 7));
    c.otrosies.push({ desde, valorMensual, nota });
    log(d, { modulo: "CLIENTES", evento: "OTROSÍ", campo: `${c.id} desde ${desde}`, anterior: String(anterior), nuevo: String(valorMensual), detalle: nota });
    reprogramar(d, c);
  });
}

export function cambiarEstadoContrato(contratoId: string, estado: Contrato["estado"]) {
  mutar((d) => {
    const c = d.contratos.find((x) => x.id === contratoId)!;
    log(d, { modulo: "CLIENTES", evento: "ESTADO CONTRATO", campo: c.id, anterior: c.estado, nuevo: estado });
    c.estado = estado;
    reprogramar(d, c);
  });
}

// ---------------- Facturas ----------------

export function numeroEnUso(numero: string, exceptoId?: string) {
  const n = normalizarNumero(numero);
  return getDB().facturas.find((f) => f.numero === n && f.id !== exceptoId);
}

export function guardarFactura(f: Omit<Factura, "id" | "creadoEn"> & { id?: string }): string {
  let id = f.id ?? "";
  mutar((d) => {
    if (f.numero) {
      const n = normalizarNumero(f.numero);
      const otra = d.facturas.find((x) => x.numero === n && x.id !== f.id);
      if (otra) throw new Error(`El número ${n} ya pertenece a otra factura`);
    }
    const nueva: Factura = { ...f, numero: f.numero ? normalizarNumero(f.numero) : null, id: f.id ?? nuevoId(), creadoEn: new Date().toISOString() } as Factura;
    id = nueva.id;
    const i = d.facturas.findIndex((x) => x.id === nueva.id);
    if (i >= 0) {
      const antes = d.facturas[i];
      d.facturas[i] = { ...antes, ...nueva, creadoEn: antes.creadoEn };
      log(d, { modulo: "FACTURACION", evento: "FACTURA ACTUALIZADA", campo: nueva.numero ?? nueva.id, anterior: antes.estado, nuevo: nueva.estado });
    } else {
      d.facturas.push(nueva);
      log(d, { modulo: "FACTURACION", evento: nueva.estado === "EMITIDA" ? "FACTURA EMITIDA" : "FACTURA CREADA", campo: nueva.numero ?? nueva.tipo, nuevo: nueva.descripcion });
    }
  });
  return id;
}

/** Pasa a EMITIDA: el número de factura es el único dato obligatorio y es irrepetible. */
export function emitir(items: { id: string; numero: string; emision: string; vencimiento: string; oc?: string; link?: string }[]) {
  mutar((d) => {
    const vistos = new Set<string>();
    for (const it of items) {
      const n = normalizarNumero(it.numero);
      if (!n) throw new Error("El número de factura es obligatorio");
      if (vistos.has(n) || d.facturas.some((x) => x.numero === n && x.id !== it.id)) throw new Error(`El número ${n} ya existe`);
      if (it.vencimiento < it.emision) throw new Error("El vencimiento no puede ser anterior a la emisión");
      vistos.add(n);
    }
    for (const it of items) {
      const f = d.facturas.find((x) => x.id === it.id)!;
      const antes = f.estado;
      f.numero = normalizarNumero(it.numero);
      f.emision = it.emision;
      f.vencimiento = it.vencimiento;
      if (it.oc !== undefined) f.oc = it.oc;
      if (it.link !== undefined) f.link = it.link;
      if (f.estado === "PROGRAMADA") f.estado = "EMITIDA";
      f.datoIncompleto = false;
      log(d, { modulo: "FACTURACION", evento: antes === "PROGRAMADA" ? "FACTURA EMITIDA" : "NÚMERO REGISTRADO", campo: f.numero, anterior: antes, nuevo: f.estado, detalle: f.descripcion });
    }
  });
}

export function cambiarEstadoFactura(id: string, estado: "EN PAUSA" | "PROGRAMADA") {
  mutar((d) => {
    const f = d.facturas.find((x) => x.id === id)!;
    log(d, { modulo: "FACTURACION", evento: "ESTADO FACTURA", campo: f.numero ?? f.id, anterior: f.estado, nuevo: estado });
    f.estado = estado;
  });
}

export function registrarAbono(id: string, a: Omit<Abono, "id">) {
  mutar((d) => {
    const f = d.facturas.find((x) => x.id === id)!;
    f.abonos.push({ ...a, id: nuevoId() });
    const c = calcFactura(d, f);
    const antes = f.estado;
    f.estado = c.abonado >= c.netoEsperado - 1 ? "PAGADA" : "ABONADA";
    if (f.estado === "PAGADA") f.pago = { fecha: a.fecha, valorRecibido: c.abonado, banco: a.banco, diferencia: "", retencionesReales: c.total - c.abonado };
    log(d, { modulo: "CARTERA", evento: "ABONO", campo: f.numero ?? f.id, anterior: antes, nuevo: `${f.estado} · ${a.valor}`, detalle: a.nota });
  });
}

/** Solo después de verificar y cruzar el pago en el banco. Pasa a Ingresos. */
export function marcarPagada(id: string, pago: { fecha: string; valorRecibido: number; banco: string; diferencia: string }) {
  mutar((d) => {
    const f = d.facturas.find((x) => x.id === id)!;
    const c = calcFactura(d, f);
    const recibidoTotal = pago.valorRecibido + c.abonado;
    const antes = f.estado;
    f.estado = "PAGADA";
    f.pago = { ...pago, valorRecibido: recibidoTotal, retencionesReales: Math.max(0, c.total - recibidoTotal) };
    log(d, { modulo: "CARTERA", evento: "FACTURA PAGADA", campo: f.numero ?? f.id, anterior: antes, nuevo: String(pago.valorRecibido), detalle: pago.diferencia ? `Diferencia: ${pago.diferencia} · aviso a contadora` : "Verificado en banco" });
  });
}

export function registrarCompromiso(id: string, fecha: string) {
  mutar((d) => {
    const f = d.facturas.find((x) => x.id === id)!;
    log(d, { modulo: "CARTERA", evento: "FECHA COMPROMETIDA", campo: f.numero ?? f.id, anterior: f.fechaPagoComprometida ?? "", nuevo: fecha });
    f.fechaPagoComprometida = fecha;
  });
}

export function registrarEnvio(id: string, destinatario: string, tipo: string) {
  mutar((d) => {
    const f = d.facturas.find((x) => x.id === id)!;
    f.envios.push({ fecha: new Date().toISOString(), destinatario, tipo });
    const cli = d.clientes.find((c) => c.id === f.clienteId);
    if (cli) cli.confirmadoCorreoCobro = true;
    log(d, { modulo: "CARTERA", evento: "CORREO DE COBRO", campo: f.numero ?? f.id, nuevo: destinatario, detalle: tipo });
  });
}

// ---------------- Notas crédito ----------------

export function solicitarNC(nc: Omit<NotaCredito, "id" | "estado" | "numero" | "solicitadaPor" | "solicitadaEn">) {
  mutar((d) => {
    d.notasCredito.unshift({ ...nc, id: nuevoId(), estado: "SOLICITADA", numero: null, solicitadaPor: getSesion().usuario, solicitadaEn: new Date().toISOString() });
    const f = d.facturas.find((x) => x.id === nc.facturaId);
    log(d, { modulo: "FACTURACION", evento: "NOTA CRÉDITO SOLICITADA", campo: f?.numero ?? nc.facturaId, nuevo: `${nc.alcance} · ${nc.valor}`, detalle: `${nc.motivo} · notificación a CONTADORA` });
  });
}

export function resolverNC(id: string, aprobar: boolean, numero: string, comentario: string) {
  mutar((d) => {
    const nc = d.notasCredito.find((x) => x.id === id)!;
    if (aprobar) {
      const n = normalizarNumero(numero);
      if (!n) throw new Error("El número de la nota crédito es obligatorio");
      if (d.notasCredito.some((x) => x.numero === n && x.id !== id)) throw new Error("Ese número de nota crédito ya existe");
      nc.numero = n;
      const f = d.facturas.find((x) => x.id === nc.facturaId)!;
      if (nc.alcance === "TOTAL") f.estado = "ANULADA";
      else f.ajusteNC += nc.valor;
    }
    nc.estado = aprobar ? "APROBADA" : "RECHAZADA";
    nc.resueltaPor = getSesion().usuario;
    nc.resueltaEn = new Date().toISOString();
    nc.comentario = comentario;
    log(d, { modulo: "FACTURACION", evento: `NOTA CRÉDITO ${nc.estado}`, campo: nc.numero ?? nc.id, detalle: comentario });
  });
}

/** Reemite una factura nueva vinculada a una anulada (queda PROGRAMADA para registrar su número). */
export function reemitir(anuladaId: string): string {
  const id = nuevoId();
  mutar((d) => {
    const a = d.facturas.find((x) => x.id === anuladaId)!;
    d.facturas.push({ ...structuredClone(a), id, numero: null, estado: "PROGRAMADA", emision: null, abonos: [], pago: null, ajusteNC: 0, reemiteA: anuladaId, datoIncompleto: false, envios: [], creadoEn: new Date().toISOString() });
    log(d, { modulo: "FACTURACION", evento: "REEMISIÓN", campo: a.numero ?? a.id, detalle: "Nueva factura vinculada a la anulada" });
  });
  return id;
}

// ---------------- Gastos ----------------

export function guardarGasto(g: Omit<Gasto, "id" | "creadoEn"> & { id?: string }) {
  mutar((d) => {
    if (g.id) {
      const i = d.gastos.findIndex((x) => x.id === g.id);
      d.gastos[i] = { ...d.gastos[i], ...g } as Gasto;
    } else d.gastos.push({ ...g, id: nuevoId(), creadoEn: new Date().toISOString() } as Gasto);
    log(d, { modulo: "GASTOS", evento: g.id ? "GASTO ACTUALIZADO" : "GASTO REGISTRADO", campo: g.categoria, nuevo: String(g.valor), detalle: g.proveedor });
  });
}

// ---------------- Configuración ----------------

export function guardarConfigIndice(patch: Partial<ConfigIndice>) {
  mutar((d) => {
    d.configIndice = { ...d.configIndice, ...patch };
    log(d, { modulo: "INDICE", evento: "CONFIGURACIÓN ÍNDICE", detalle: Object.keys(patch).join(", ") });
  });
}

export function guardarTributarios(p: ParamsTributarios) {
  mutar((d) => {
    const i = d.tributarios.findIndex((x) => x.anio === p.anio);
    if (i >= 0) d.tributarios[i] = p;
    else d.tributarios.push(p);
    log(d, { modulo: "CONFIGURACION", evento: "PARÁMETROS TRIBUTARIOS", campo: String(p.anio) });
  });
}

export function guardarServicio(s: Servicio, original?: string) {
  mutar((d) => {
    const i = d.servicios.findIndex((x) => x.nombre === (original ?? s.nombre));
    if (i >= 0) d.servicios[i] = s;
    else d.servicios.push(s);
    log(d, { modulo: "CONFIGURACION", evento: "CATÁLOGO DE SERVICIOS", campo: s.nombre });
  });
}

