import { useMemo, useState } from "react";
import { Ban, Check, CircleDollarSign, FileText, Link as LinkIcon, Pause, Play, Receipt, RotateCcw, Search, Send } from "lucide-react";
import { useDB, useSesion } from "../../data/store";
import {
  cambiarEstadoFactura, calcFactura, emitir, marcarPagada, reemitir, registrarAbono, registrarCompromiso, registrarEnvio, solicitarNC,
} from "../../data/storeFin";
import { coincide, correoCobro, diasParaVencer, nivelCobro, normalizarNumero, vencimientoSugerido, type Cliente, type Factura, type NotaCredito } from "../../domain/facturacion";
import { hoy } from "../../domain/fechas";
import { fecha, fechaHora, pesos, titulo } from "../../lib/format";
import { Badge, Field, Modal, MoneyInput, Seg, useToast } from "../../components/ui";
import type { DB } from "../../domain/types";

export const ESTADO_COLOR: Record<string, string> = {
  PROGRAMADA: "gray", EMITIDA: "blue", ABONADA: "orange", PAGADA: "green", "EN PAUSA": "purple", ANULADA: "red",
  ACTIVO: "green", "POR CONFIRMAR": "yellow", RETIRADO: "red", TERMINADO: "gray", SOLICITADA: "yellow", APROBADA: "green", RECHAZADA: "red",
};

export function EstadoFactura({ f }: { f: Factura }) {
  return (
    <span className="row" style={{ gap: 4, display: "inline-flex" }}>
      <Badge color={ESTADO_COLOR[f.estado]} dot>{f.estado}</Badge>
      {f.datoIncompleto && <Badge color="yellow">DATO INCOMPLETO</Badge>}
    </span>
  );
}

export function ClienteSelect({ value, onChange, incluir = "activos" }: { value: string; onChange: (id: string) => void; incluir?: "activos" | "todos" }) {
  const db = useDB();
  const [q, setQ] = useState("");
  const [abierto, setAbierto] = useState(false);
  const actual = db.clientes.find((c) => c.id === value);
  const lista = db.clientes.filter((c) => (incluir === "todos" || c.estado !== "RETIRADO") && coincide(c, q)).slice(0, 8);
  return (
    <div style={{ position: "relative" }}>
      <div className="search">
        <Search />
        <input
          className="input"
          style={{ paddingLeft: 34, width: "100%" }}
          placeholder="Código, nombre, razón social, alias o NIT"
          value={abierto ? q : actual ? `${actual.id} · ${actual.nombreComercial}` : q}
          onFocus={() => { setAbierto(true); setQ(""); }}
          onBlur={() => setTimeout(() => setAbierto(false), 180)}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {abierto && (
        <div className="list" style={{ position: "absolute", zIndex: 20, left: 0, right: 0, top: 44, boxShadow: "var(--shadow)" }}>
          {lista.map((c) => (
            <div key={c.id} className="list-row click flat" onMouseDown={() => { onChange(c.id); setAbierto(false); }}>
              <div className="grow"><b style={{ fontWeight: 600 }}>{c.nombreComercial}</b> <span className="caption">{c.id}</span><div className="caption">{c.razonSocial || "Razón social pendiente"}{c.nit ? ` · NIT ${c.nit}-${c.dv}` : ""}</div></div>
              <Badge color={ESTADO_COLOR[c.estado]}>{c.estado}</Badge>
            </div>
          ))}
          {!lista.length && <div className="list-row flat footnote">Sin coincidencias. Crea el cliente desde el módulo Clientes.</div>}
        </div>
      )}
    </div>
  );
}

export function nombreCliente(db: DB, id: string) {
  return db.clientes.find((c) => c.id === id)?.nombreComercial ?? id;
}

export function Desglose({ f }: { f: Factura }) {
  const db = useDB();
  const c = calcFactura(db, f);
  const fila = (l: string, v: number, b = false, neg = false) => (
    <div className="list-row flat" style={{ minHeight: 36, padding: "6px 16px" }}>
      <span className={b ? "" : "footnote"} style={b ? { fontWeight: 600 } : undefined}>{l}</span>
      <span className="right num" style={b ? { fontWeight: 700 } : undefined}>{neg ? "− " : ""}{pesos(v)}</span>
    </div>
  );
  return (
    <div className="list" style={{ boxShadow: "none" }}>
      {f.pauta && fila("Pauta ejecutada (reembolso, no es ingreso)", c.reembolsoPauta)}
      {f.pauta && fila(`Incremento ${Math.round(f.pauta.pct * 100)} % (ingreso LA BRUTAL)`, c.ingresoPropio)}
      {f.ajusteNC > 0 && fila("Ajuste por nota crédito", f.ajusteNC, false, true)}
      {fila("Subtotal antes de IVA", c.subtotal, true)}
      {fila("IVA", c.iva)}
      {fila("Total con IVA", c.total, true)}
      {c.reteFuente > 0 && fila("ReteFuente estimada", c.reteFuente, false, true)}
      {c.reteIva > 0 && fila("ReteIVA estimada", c.reteIva, false, true)}
      {c.reteIca > 0 && fila("ReteICA estimada", c.reteIca, false, true)}
      {fila("Neto esperado a recibir", c.netoEsperado, true)}
      {c.abonado > 0 && fila("Abonos", c.abonado, false, true)}
      {c.saldo > 0 && fila("Saldo en cartera", c.saldo, true)}
      {f.pago && fila(`Recibido${f.pago.fecha ? ` el ${fecha(f.pago.fecha)}` : ""}`, f.pago.valorRecibido, true)}
      {f.pago && f.pago.retencionesReales > 0 && fila("Retenciones reales (diferencia)", f.pago.retencionesReales)}
    </div>
  );
}

/** Ficha de factura con todas las acciones del ciclo. */
export function FacturaSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const db = useDB();
  const sesion = useSesion();
  const toast = useToast();
  const f = db.facturas.find((x) => x.id === id);
  const [accion, setAccion] = useState<null | "emitir" | "abono" | "pagar" | "nc" | "correo" | "compromiso">(null);
  if (!f) return null;
  const cli = db.clientes.find((c) => c.id === f.clienteId);
  const c = calcFactura(db, f);
  const ncs = db.notasCredito.filter((n) => n.facturaId === f.id);
  const historial = db.historial.filter((h) => h.campo === f.numero || h.campo === f.id).slice(0, 12);
  const puedeOperar = sesion.rol === "ADMINISTRADOR" || sesion.rol === "COORDINACION";
  return (
    <Modal open onClose={onClose} title={f.numero ? `Factura ${f.numero}` : f.estado === "PROGRAMADA" ? "Factura programada" : "Factura sin número"} size="wide"
      footer={puedeOperar ? (
        <div className="row wrap" style={{ gap: 8, width: "100%" }}>
          {(f.estado === "PROGRAMADA" || f.datoIncompleto) && <button className="btn primary" onClick={() => setAccion("emitir")}><Receipt />{f.estado === "PROGRAMADA" ? "Emitir" : "Registrar número"}</button>}
          {(f.estado === "EMITIDA" || f.estado === "ABONADA") && <>
            <button className="btn success" onClick={() => setAccion("pagar")}><Check />Marcar pagada</button>
            <button className="btn" onClick={() => setAccion("abono")}><CircleDollarSign />Abono</button>
            <button className="btn" onClick={() => setAccion("correo")}><Send />Correo de cobro</button>
            <button className="btn" onClick={() => setAccion("compromiso")}>Fecha comprometida</button>
          </>}
          {f.estado === "PROGRAMADA" && <button className="btn" onClick={() => { cambiarEstadoFactura(f.id, "EN PAUSA"); toast("Factura en pausa"); }}><Pause />Pausar</button>}
          {f.estado === "EN PAUSA" && <button className="btn" onClick={() => { cambiarEstadoFactura(f.id, "PROGRAMADA"); toast("Factura reactivada"); }}><Play />Reactivar</button>}
          {(f.estado === "EMITIDA" || f.estado === "ABONADA" || f.estado === "PAGADA") && <button className="btn danger" onClick={() => setAccion("nc")}><Ban />Nota crédito</button>}
          {f.estado === "ANULADA" && <button className="btn" onClick={() => { reemitir(f.id); toast("Factura nueva vinculada creada como PROGRAMADA"); onClose(); }}><RotateCcw />Reemitir</button>}
        </div>
      ) : undefined}>
      <div className="row wrap" style={{ marginBottom: 14, gap: 8 }}>
        <EstadoFactura f={f} />
        <Badge color="blue">{f.tipo}</Badge>
        <span className="footnote">{cli?.id} · <b>{cli?.nombreComercial}</b>{f.proyecto ? ` · ${f.proyecto}` : ""}</span>
      </div>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="footnote" style={{ fontSize: 15, color: "var(--label)" }}>{f.descripcion}</div>
          <div className="list" style={{ boxShadow: "none" }}>
            {[
              ["Servicios", f.items.map((i) => `${i.servicio}${i.cantidad > 1 ? ` × ${i.cantidad}` : ""}`).join(", ")],
              ["Periodo", f.periodoTexto || f.periodo],
              ["Programada", fecha(f.fechaProgramada)],
              ["Emisión", fecha(f.emision)],
              ["Vencimiento", `${fecha(f.vencimiento)}${diasParaVencer(f) !== null && (f.estado === "EMITIDA" || f.estado === "ABONADA") ? ` · ${diasParaVencer(f)! >= 0 ? `faltan ${diasParaVencer(f)} días` : `vencida hace ${-diasParaVencer(f)!} días`}` : ""}`],
              ["O.C.", f.oc || (cli?.requiereOC ? "⚠︎ El cliente requiere O.C." : "—")],
              ["Fecha de pago comprometida", fecha(f.fechaPagoComprometida)],
              ["Observaciones internas", f.observaciones || "—"],
            ].map(([k, v]) => <div className="list-row flat" key={k} style={{ minHeight: 38 }}><span className="muted" style={{ width: 170, flex: "none" }}>{k}</span><span>{v}</span></div>)}
          </div>
          {f.link && <a className="btn sm" href={f.link} target="_blank" rel="noreferrer"><LinkIcon size={14} />Ver factura (Drive)</a>}
          {f.abonos.length > 0 && <div className="footnote">Abonos: {f.abonos.map((a) => `${pesos(a.valor)}${a.fecha ? ` el ${fecha(a.fecha)}` : " (sin fecha)"}`).join(" · ")}</div>}
          {ncs.length > 0 && <div className="footnote">Notas crédito: {ncs.map((n) => `${n.numero ?? "sin número"} · ${n.alcance} · ${n.estado}`).join(" · ")}</div>}
          {f.envios.length > 0 && <div className="footnote">Correos: {f.envios.map((e) => `${fechaHora(e.fecha)} a ${e.destinatario}`).join(" · ")}</div>}
        </div>
        <div className="stack">
          <Desglose f={f} />
          {historial.length > 0 && (
            <div>
              <div className="list-header" style={{ padding: "4px 0" }}>Historial</div>
              {historial.map((h) => <div key={h.id} className="caption">{fechaHora(h.ts)} · {h.usuario} · {h.evento}{h.anterior ? ` · ${h.anterior} → ${h.nuevo}` : h.nuevo ? ` · ${h.nuevo}` : ""}</div>)}
            </div>
          )}
        </div>
      </div>
      {accion === "emitir" && <EmitirSheet f={f} cli={cli} onClose={() => setAccion(null)} />}
      {accion === "pagar" && <PagarSheet f={f} neto={c.netoEsperado - c.abonado} onClose={() => setAccion(null)} />}
      {accion === "abono" && <AbonoSheet f={f} onClose={() => setAccion(null)} />}
      {accion === "nc" && <NCSheet f={f} subtotal={c.subtotal} onClose={() => setAccion(null)} />}
      {accion === "correo" && <CorreoSheet f={f} cli={cli} total={c.total} onClose={() => setAccion(null)} />}
      {accion === "compromiso" && <CompromisoSheet f={f} onClose={() => setAccion(null)} />}
    </Modal>
  );
}

function EmitirSheet({ f, cli, onClose }: { f: Factura; cli?: Cliente; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const [numero, setNumero] = useState("");
  const [emision, setEmision] = useState(f.emision ?? hoy());
  const [venc, setVenc] = useState(f.vencimiento ?? vencimientoSugerido(f.emision ?? hoy(), cli?.plazoPago ?? 30));
  const [oc, setOc] = useState(f.oc);
  const [link, setLink] = useState(f.link);
  const n = normalizarNumero(numero);
  const repetida = n ? db.facturas.find((x) => x.numero === n && x.id !== f.id) : undefined;
  const faltaOC = cli?.requiereOC && !oc.trim();
  const ok = n && !repetida && venc >= emision && !faltaOC;
  return (
    <Modal open onClose={onClose} title={f.estado === "PROGRAMADA" ? "Emitir factura" : "Registrar número"} size="narrow"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!ok} onClick={() => { try { emitir([{ id: f.id, numero, emision, vencimiento: venc, oc, link }]); toast(<>Factura <b>{n}</b> emitida · entra a cartera</>); onClose(); } catch (e) { toast((e as Error).message, "error"); } }}>Emitir</button></>}>
      <div className="stack">
        <Field label="Número de factura" required hint="Único e irrepetible. Se guarda sin espacios y en mayúsculas." error={repetida ? `Ya existe: ${repetida.descripcion} (${nombreCliente(db, repetida.clienteId)})` : undefined}>
          <input className={`input mono ${!n ? "required-empty" : repetida ? "invalid" : ""}`} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="FV123" autoFocus />
        </Field>
        <div className="form-grid">
          <Field label="Fecha de emisión" hint={fecha(emision)}><input type="date" className="input" value={emision} onChange={(e) => { setEmision(e.target.value); setVenc(vencimientoSugerido(e.target.value, cli?.plazoPago ?? 30)); }} /></Field>
          <Field label="Vencimiento" required error={venc < emision ? "No puede ser anterior a la emisión" : undefined} hint={`Plazo pactado ${cli?.plazoPago ?? 30} días`}><input type="date" className="input" value={venc} onChange={(e) => setVenc(e.target.value)} /></Field>
        </div>
        <Field label="Número de O.C." required={cli?.requiereOC} error={faltaOC ? "Este cliente requiere O.C. vigente" : undefined}><input className="input" value={oc} onChange={(e) => setOc(e.target.value)} /></Field>
        <Field label="Link de la factura (opcional)"><input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" /></Field>
      </div>
    </Modal>
  );
}

function PagarSheet({ f, neto, onClose }: { f: Factura; neto: number; onClose: () => void }) {
  const toast = useToast();
  const [fechaPago, setFecha] = useState(hoy());
  const [valor, setValor] = useState(Math.round(neto));
  const [banco, setBanco] = useState("");
  const [dif, setDif] = useState("");
  const distinto = Math.abs(valor - neto) > 1;
  return (
    <Modal open onClose={onClose} title="Marcar pagada" size="narrow"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn success" disabled={!valor || (distinto && !dif)} onClick={() => { marcarPagada(f.id, { fecha: fechaPago, valorRecibido: valor, banco, diferencia: distinto ? dif : "" }); toast(distinto ? "Pago registrado · diferencia enviada a la contadora" : "Pago verificado · pasa a Ingresos"); onClose(); }}>Confirmar pago</button></>}>
      <p className="footnote" style={{ marginTop: 0 }}>Márcala solo después de verificar y cruzar el pago en el banco. Neto esperado: <b>{pesos(neto)}</b>.</p>
      <div className="stack">
        <Field label="Fecha real de pago"><input type="date" className="input" value={fechaPago} onChange={(e) => setFecha(e.target.value)} /></Field>
        <Field label="Valor recibido"><MoneyInput value={valor} onChange={setValor} /></Field>
        <Field label="Banco / cuenta"><input className="input" value={banco} onChange={(e) => setBanco(e.target.value)} /></Field>
        {distinto && (
          <Field label="¿A qué se debe la diferencia?" required hint={`Diferencia ${pesos(neto - valor)}`}>
            <select className={`select ${!dif ? "required-empty" : ""}`} value={dif} onChange={(e) => setDif(e.target.value)}>
              <option value="">Selecciona…</option><option>Retención no prevista</option><option>Pago parcial</option><option>Descuento</option>
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function AbonoSheet({ f, onClose }: { f: Factura; onClose: () => void }) {
  const toast = useToast();
  const [fechaA, setFecha] = useState(hoy());
  const [valor, setValor] = useState(0);
  const [banco, setBanco] = useState("");
  const [nota, setNota] = useState("");
  return (
    <Modal open onClose={onClose} title="Registrar abono" size="narrow"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!valor} onClick={() => { registrarAbono(f.id, { fecha: fechaA, valor, banco, nota }); toast("Abono registrado · el saldo sigue en cartera"); onClose(); }}>Registrar</button></>}>
      <div className="stack">
        <Field label="Fecha"><input type="date" className="input" value={fechaA} onChange={(e) => setFecha(e.target.value)} /></Field>
        <Field label="Valor"><MoneyInput value={valor} onChange={setValor} /></Field>
        <Field label="Banco / cuenta"><input className="input" value={banco} onChange={(e) => setBanco(e.target.value)} /></Field>
        <Field label="Nota"><input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. cruce contra pago parcial anterior" /></Field>
      </div>
    </Modal>
  );
}

function NCSheet({ f, subtotal, onClose }: { f: Factura; subtotal: number; onClose: () => void }) {
  const toast = useToast();
  const [motivo, setMotivo] = useState<NotaCredito["motivo"]>("ERROR EN VALOR");
  const [alcance, setAlcance] = useState<NotaCredito["alcance"]>("TOTAL");
  const [valor, setValor] = useState(Math.round(subtotal));
  const [detalle, setDetalle] = useState("");
  return (
    <Modal open onClose={onClose} title="Solicitar nota crédito" size="narrow"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn danger primary" disabled={!detalle.trim() || !valor} onClick={() => { solicitarNC({ facturaId: f.id, motivo, alcance, valor: alcance === "TOTAL" ? subtotal : valor, detalle }); toast("Solicitud enviada a la CONTADORA"); onClose(); }}>Enviar a contadora</button></>}>
      <div className="stack">
        <Field label="Motivo">
          <select className="select" value={motivo} onChange={(e) => setMotivo(e.target.value as NotaCredito["motivo"])}>
            {["ERROR EN VALOR", "ERROR EN DATOS", "SERVICIO NO PRESTADO", "DESCUENTO", "DUPLICADA", "OTRO"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </Field>
        <Field label="Alcance"><Seg value={alcance} onChange={setAlcance} options={[{ value: "TOTAL", label: "Total (anula)" }, { value: "PARCIAL", label: "Parcial" }]} /></Field>
        {alcance === "PARCIAL" && <Field label="Valor antes de IVA"><MoneyInput value={valor} onChange={setValor} /></Field>}
        <Field label="Detalle" required><textarea className="textarea" value={detalle} onChange={(e) => setDetalle(e.target.value)} /></Field>
        <div className="caption">La contadora aprueba o rechaza y registra el número de la nota crédito. Al aprobar, la factura sale de ingresos, proyecciones, cartera, retenciones y gráficas.</div>
      </div>
    </Modal>
  );
}

function CorreoSheet({ f, cli, total, onClose }: { f: Factura; cli?: Cliente; total: number; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const [dest, setDest] = useState(cli?.correoCartera || cli?.correosFacturacion[0] || "");
  const correo = useMemo(() => correoCobro(db.configIndice.plantillaCorreo, {
    "N.º FACTURA": f.numero ?? "(sin número)", "RAZÓN SOCIAL": cli?.razonSocial || cli?.nombreComercial || "", "VALOR TOTAL": pesos(total),
    DESCRIPCIÓN: f.descripcion, "FECHA DE VENCIMIENTO": fecha(f.vencimiento), correo: db.configIndice.correoBrutal, teléfono: db.configIndice.telefonoBrutal,
  }), [db.configIndice, f, cli, total]);
  const nivel = nivelCobro(diasParaVencer(f));
  return (
    <Modal open onClose={onClose} title="Correo de cobro" size="wide"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!dest.includes("@")} onClick={() => { registrarEnvio(f.id, dest, nivel === "COBRO CLIENTE" ? "Automático 3 días antes" : "Manual"); toast(<>Correo registrado para <b>{dest}</b></>); onClose(); }}><Send />Enviar</button></>}>
      {!cli?.confirmadoCorreoCobro && <div className="card" style={{ background: "color-mix(in srgb, var(--orange) 12%, transparent)", boxShadow: "none", padding: 12, marginBottom: 12 }}><b>Primer envío a este cliente:</b> confirma el destinatario.</div>}
      <div className="stack">
        <Field label="Para (cartera / tesorería / contabilidad)"><input className="input" value={dest} onChange={(e) => setDest(e.target.value)} /></Field>
        <div className="caption">Copia a {db.configIndice.correoBrutal}{f.link ? " · adjunta la factura" : ""}. Modo demostración: el envío queda registrado en el historial de la factura; el envío real se activa al conectar el servidor de correo.</div>
        <div className="card" style={{ background: "var(--fill-2)", boxShadow: "none" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>{correo.asunto}</div>
          <div className="instructions" style={{ color: "var(--label)" }}>{correo.cuerpo}</div>
        </div>
      </div>
    </Modal>
  );
}

function CompromisoSheet({ f, onClose }: { f: Factura; onClose: () => void }) {
  const toast = useToast();
  const [fc, setFc] = useState(f.fechaPagoComprometida ?? hoy());
  return (
    <Modal open onClose={onClose} title="Fecha de pago comprometida" size="narrow"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={() => { registrarCompromiso(f.id, fc); toast("Fecha comprometida registrada"); onClose(); }}>Guardar</button></>}>
      <Field label="Fecha que confirmó el cliente"><input type="date" className="input" value={fc} onChange={(e) => setFc(e.target.value)} /></Field>
    </Modal>
  );
}

export function iconoTipo() {
  return <FileText />;
}

export const tituloCliente = (c?: Cliente) => (c ? titulo(c.nombreComercial) : "—");
