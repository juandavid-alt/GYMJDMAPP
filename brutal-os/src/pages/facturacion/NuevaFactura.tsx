import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2, TriangleAlert } from "lucide-react";
import { useDB } from "../../data/store";
import { guardarFactura } from "../../data/storeFin";
import { facturasCalc } from "../../data/selectorsFin";
import {
  calcularFactura, descripcionAuto, normalizarNumero, pautaDesdeBase, pautaDesdeSubtotal, valorVigente, vencimientoSugerido,
  type Factura, type ItemFactura, type TipoFactura,
} from "../../domain/facturacion";
import { hoy } from "../../domain/fechas";
import { tributariosDe } from "../../data/storeFin";
import { fecha, pesos } from "../../lib/format";
import { Field, Modal, MoneyInput, Seg, useToast } from "../../components/ui";
import { ClienteSelect } from "./comun";

const PASOS = ["Tipo y cliente", "Servicios y descripción", "Valores", "Fechas y soportes"];

export default function NuevaFactura({ open, onClose, clienteInicial }: { open: boolean; onClose: () => void; clienteInicial?: string }) {
  const db = useDB();
  const toast = useToast();
  const [paso, setPaso] = useState(0);
  const [tipo, setTipo] = useState<TipoFactura>("ADICIONAL");
  const [clienteId, setClienteId] = useState(clienteInicial ?? "");
  const [proyecto, setProyecto] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [items, setItems] = useState<ItemFactura[]>([{ servicio: "", cantidad: 1, valor: 0 }]);
  const [periodo, setPeriodo] = useState(hoy().slice(0, 7));
  const [periodoTexto, setPeriodoTexto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [descEditada, setDescEditada] = useState(false);
  const [obs, setObs] = useState("");
  const [pctPauta, setPctPauta] = useState(0.08);
  const [ladoPauta, setLadoPauta] = useState<"BASE" | "SUBTOTAL">("BASE");
  const [montoPauta, setMontoPauta] = useState(0);
  const [fechaEjec, setFechaEjec] = useState(hoy());
  const [emision, setEmision] = useState(hoy());
  const [venc, setVenc] = useState("");
  const [oc, setOc] = useState("");
  const [numero, setNumero] = useState("");
  const [link, setLink] = useState("");
  const [intento, setIntento] = useState(false);

  useEffect(() => {
    if (open) {
      setPaso(0); setTipo("ADICIONAL"); setClienteId(clienteInicial ?? ""); setProyecto(""); setContratoId(""); setItems([{ servicio: "", cantidad: 1, valor: 0 }]);
      setPeriodo(hoy().slice(0, 7)); setDescEditada(false); setObs(""); setMontoPauta(0); setNumero(""); setLink(""); setOc(""); setIntento(false); setEmision(hoy());
    }
  }, [open, clienteInicial]);

  const cli = db.clientes.find((c) => c.id === clienteId);
  const contratos = db.contratos.filter((c) => c.clienteId === clienteId && c.estado === "ACTIVO");
  const contrato = db.contratos.find((c) => c.id === contratoId);
  const mesNombre = new Date(`${periodo}-15T12:00:00Z`).toLocaleDateString("es-CO", { month: "long", year: "numeric", timeZone: "UTC" });
  const textoPeriodo = periodoTexto || mesNombre;
  const disponibles = db.servicios.filter((s) => s.activo && (tipo === "PAUTA" ? s.categoria === "PAUTA" : tipo === "FIJA" ? s.categoria === "MENSUAL" : s.categoria !== "PAUTA"));

  useEffect(() => {
    if (tipo === "FIJA" && contrato) {
      setProyecto(contrato.proyecto);
      setItems([{ servicio: contrato.servicios[0]?.servicio ?? "Social Media Management", cantidad: 1, valor: valorVigente(contrato, periodo) }]);
    }
    if (tipo === "PAUTA") {
      setItems([{ servicio: "Pauta con incremento", cantidad: 1, valor: 0 }]);
      const conPct = contratos.find((c) => c.incrementoPautaPct > 0);
      if (conPct) setPctPauta(conPct.incrementoPautaPct);
    }
  }, [tipo, contratoId, periodo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!descEditada) {
      const nombres = tipo === "FIJA" && contrato ? contrato.servicios.map((s) => s.servicio) : items.map((i) => i.servicio);
      setDescripcion(descripcionAuto(nombres, proyecto, textoPeriodo));
    }
  }, [items, proyecto, textoPeriodo, descEditada, tipo, contrato]);

  useEffect(() => {
    if (cli) setVenc(vencimientoSugerido(emision, cli.plazoPago));
  }, [emision, cli]);

  const pauta = tipo === "PAUTA" ? (ladoPauta === "BASE" ? pautaDesdeBase(montoPauta, pctPauta) : pautaDesdeSubtotal(montoPauta, pctPauta)) : null;
  const borrador: Factura = {
    id: "nueva", numero: numero ? normalizarNumero(numero) : null, datoIncompleto: false, tipo, clienteId, proyecto, contratoId: contratoId || null, items,
    pauta: pauta ? { base: pauta.base, pct: pctPauta, fechaEjecucion: fechaEjec } : null, periodo, periodoTexto: textoPeriodo, descripcion, observaciones: obs,
    estado: numero ? "EMITIDA" : "PROGRAMADA", fechaProgramada: emision, emision: numero ? emision : null, vencimiento: venc, oc, link, abonos: [], pago: null,
    ajusteNC: 0, reemiteA: null, fechaPagoComprometida: null, envios: [], creadoEn: "",
  };
  const calc = calcularFactura(borrador, cli, db.servicios, tributariosDe(db, Number(emision.slice(0, 4))));

  // Validaciones
  const historial = useMemo(() => facturasCalc(db).filter((x) => x.f.clienteId === clienteId && x.f.estado !== "ANULADA" && x.f.estado !== "PROGRAMADA"), [db, clienteId]);
  const promedio = historial.length ? historial.reduce((s, x) => s + x.c.subtotal, 0) / historial.length : 0;
  const atipico = promedio && calc.subtotal ? calc.subtotal < promedio * 0.1 || calc.subtotal > promedio * 2 : false;
  const duplicada = db.facturas.find((f) => f.estado !== "ANULADA" && f.clienteId === clienteId && f.proyecto === proyecto && f.periodo === periodo && f.items[0]?.servicio === items[0]?.servicio && f.tipo === tipo);
  const numeroRepetido = numero ? db.facturas.find((f) => f.numero === normalizarNumero(numero)) : undefined;
  const faltaOC = !!cli?.requiereOC && !oc.trim() && !!numero;

  const errores: Record<number, boolean> = {
    0: !clienteId || (tipo === "FIJA" && !contratoId),
    1: tipo !== "PAUTA" && items.some((i) => !i.servicio || i.valor <= 0),
    2: tipo === "PAUTA" && montoPauta <= 0,
    3: !venc || venc < emision || !!numeroRepetido || faltaOC,
  };
  const siguiente = () => { setIntento(true); if (errores[paso]) return; setIntento(false); setPaso(paso + 1); };
  const guardar = () => {
    setIntento(true);
    if (Object.values(errores).some(Boolean)) return;
    try {
      const { id: _id, creadoEn: _c, ...resto } = borrador;
      guardarFactura(resto);
      toast(numero ? <>Factura <b>{normalizarNumero(numero)}</b> emitida</> : "Factura guardada como PROGRAMADA · emítela al registrar su número");
      onClose();
    } catch (e) { toast((e as Error).message, "error"); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nueva factura" size="wide"
      footer={<>
        {paso > 0 && <button className="btn" onClick={() => setPaso(paso - 1)}><ChevronLeft />Atrás</button>}
        {paso < 3 ? <button className="btn primary" onClick={siguiente}>Siguiente<ChevronRight /></button> : <button className="btn primary" onClick={guardar}><Check />{numero ? "Emitir factura" : "Guardar programada"}</button>}
      </>}>
      <div className="steps">{PASOS.map((p, i) => <span key={p} className={i <= paso ? "on" : ""} />)}</div>
      <div className="step-name">Paso {paso + 1} de 4</div>
      <div className="headline" style={{ fontSize: 22, marginBottom: 16 }}>{PASOS[paso]}{tipo === "PAUTA" && paso === 2 ? " · pauta con incremento" : ""}</div>

      {paso === 0 && (
        <div className="stack">
          <Field label="Tipo de factura"><Seg value={tipo} onChange={(t) => { setTipo(t); setContratoId(""); }} options={[{ value: "FIJA", label: "Fija (mensual)" }, { value: "ADICIONAL", label: "Adicional" }, { value: "ONE SHOT", label: "One shot" }, { value: "PAUTA", label: "Pauta con incremento" }]} /></Field>
          <div className="caption">{{ FIJA: "Normalmente sale sola desde el contrato. Úsala para un mes que no se programó.", ADICIONAL: "Cliente con contrato que compra un servicio extra.", "ONE SHOT": "Cliente sin contrato, servicio único.", PAUTA: "Pauta ejecutada con recursos de LA BRUTAL y reembolsada con un % de incremento." }[tipo]}</div>
          <Field label="Cliente" required><div className={intento && !clienteId ? "required-empty" : ""} style={{ borderRadius: 12 }}><ClienteSelect value={clienteId} onChange={(id) => { setClienteId(id); setContratoId(""); setProyecto(""); }} /></div></Field>
          {cli && cli.proyectos.length > 0 && tipo !== "FIJA" && (
            <Field label="Proyecto o marca"><select className="select" value={proyecto} onChange={(e) => setProyecto(e.target.value)}><option value="">Sin proyecto</option>{cli.proyectos.map((p) => <option key={p}>{p}</option>)}</select></Field>
          )}
          {tipo === "FIJA" && cli && (
            <Field label="Contrato" required error={intento && !contratoId ? "Selecciona el contrato" : undefined}>
              <select className="select" value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
                <option value="">Selecciona…</option>{contratos.map((c) => <option key={c.id} value={c.id}>{c.id}{c.proyecto ? ` · ${c.proyecto}` : ""} · {pesos(valorVigente(c, periodo))}</option>)}
              </select>
            </Field>
          )}
          {cli?.estado === "POR CONFIRMAR" && <div className="caption" style={{ color: "var(--orange)" }}><TriangleAlert size={12} /> Cliente POR CONFIRMAR.</div>}
        </div>
      )}

      {paso === 1 && (
        <div className="stack">
          {tipo !== "PAUTA" && items.map((it, i) => (
            <div className="row wrap" key={i} style={{ alignItems: "flex-end" }}>
              <Field label={i === 0 ? "Servicio" : ""}>
                <select className={`select ${intento && !it.servicio ? "required-empty" : ""}`} style={{ minWidth: 260 }} value={it.servicio} disabled={tipo === "FIJA"} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, servicio: e.target.value } : x)))}>
                  <option value="">Selecciona…</option>{disponibles.map((s) => <option key={s.nombre}>{s.nombre}</option>)}
                </select>
              </Field>
              <Field label={i === 0 ? "Cantidad" : ""}><input className="input num" style={{ width: 90 }} type="number" min={1} value={it.cantidad} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, cantidad: Math.max(1, Number(e.target.value)) } : x)))} /></Field>
              <Field label={i === 0 ? "Valor unitario antes de IVA" : ""}><div style={{ width: 200 }}><MoneyInput className={intento && it.valor <= 0 ? "required-empty" : ""} value={it.valor} onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, valor: v } : x)))} /></div></Field>
              {items.length > 1 && <button className="btn icon danger" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
            </div>
          ))}
          {tipo !== "PAUTA" && tipo !== "FIJA" && <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setItems([...items, { servicio: "", cantidad: 1, valor: 0 }])}><Plus size={14} />Agregar servicio</button>}
          <div className="form-grid">
            <Field label="Mes del servicio"><input type="month" className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></Field>
            <Field label="Periodo en texto (opcional)" hint="Ej. del 15 al 30 de septiembre"><input className="input" value={periodoTexto} placeholder={mesNombre} onChange={(e) => setPeriodoTexto(e.target.value)} /></Field>
          </div>
          <Field label="Descripción (generada, editable)" hint="[Servicios] — [Proyecto] — Periodo [mes o rango]">
            <textarea className="textarea" value={descripcion} onChange={(e) => { setDescripcion(e.target.value); setDescEditada(true); }} />
          </Field>
          <Field label="Observaciones internas (no salen en la factura)"><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></Field>
        </div>
      )}

      {paso === 2 && (
        <div className="grid g2" style={{ alignItems: "start" }}>
          <div className="stack">
            {tipo === "PAUTA" ? (
              <>
                <Field label="% de incremento" hint="Precargado del contrato, editable"><div className="row" style={{ gap: 6 }}><input className="input num" type="number" value={Math.round(pctPauta * 1000) / 10} onChange={(e) => setPctPauta(Number(e.target.value) / 100)} /><span className="muted">%</span></div></Field>
                <Field label="Digitar desde"><Seg value={ladoPauta} onChange={setLadoPauta} options={[{ value: "BASE", label: "Pauta ejecutada" }, { value: "SUBTOTAL", label: "Subtotal facturado" }]} /></Field>
                <Field label={ladoPauta === "BASE" ? "Pauta ejecutada (reembolso)" : "Subtotal facturado antes de IVA"} required><MoneyInput className={intento && montoPauta <= 0 ? "required-empty" : ""} value={montoPauta} onChange={setMontoPauta} /></Field>
                <Field label="Fecha de ejecución de la inversión"><input type="date" className="input" value={fechaEjec} onChange={(e) => setFechaEjec(e.target.value)} /></Field>
                {pauta && pauta.subtotal > 0 && (
                  <div className="list" style={{ boxShadow: "none" }}>
                    <div className="list-row flat"><span>Pauta ejecutada (reembolso)</span><b className="right num">{pesos(pauta.base)}</b></div>
                    <div className="list-row flat"><span>Incremento {Math.round(pctPauta * 1000) / 10} % (ingreso LA BRUTAL)</span><b className="right num">{pesos(pauta.incremento)}</b></div>
                    <div className="list-row flat"><b>Subtotal factura antes de IVA</b><b className="right num">{pesos(pauta.subtotal)}</b></div>
                  </div>
                )}
                <div className="caption">Solo el incremento entra a Ingresos. La base es reembolso: cuenta por cobrar, no ingreso ni costo de operación.</div>
              </>
            ) : (
              <div className="footnote">El IVA y las retenciones se calculan con el perfil tributario del cliente y el concepto de cada servicio (Configuración → Parámetros tributarios).</div>
            )}
            {atipico && <div className="card" style={{ background: "color-mix(in srgb, var(--orange) 12%, transparent)", boxShadow: "none", padding: 12 }}><TriangleAlert size={14} color="var(--orange)" /> Valor atípico: el promedio del cliente es {pesos(promedio)}.</div>}
            {duplicada && <div className="card" style={{ background: "color-mix(in srgb, var(--red) 10%, transparent)", boxShadow: "none", padding: 12 }}><TriangleAlert size={14} color="var(--red)" /> Posible duplicada: ya existe una factura de este cliente, proyecto, servicio y periodo ({duplicada.numero ?? duplicada.estado}).</div>}
          </div>
          <div className="stack">
            <div className="grid g2">
              <div className="kpi"><div className="kpi-top">Sin IVA</div><div className="kpi-value">{pesos(calc.subtotal)}</div></div>
              <div className="kpi"><div className="kpi-top">Con IVA</div><div className="kpi-value">{pesos(calc.total)}</div></div>
            </div>
            <div className="list" style={{ boxShadow: "none" }}>
              {[["IVA", calc.iva], ["ReteFuente estimada", -calc.reteFuente], ["ReteIVA estimada", -calc.reteIva], ["ReteICA estimada", -calc.reteIca]].map(([l, v]) => (
                <div className="list-row flat" key={l as string} style={{ minHeight: 36 }}><span className="footnote">{l}</span><span className="right num">{pesos(v as number)}</span></div>
              ))}
              <div className="list-row flat"><b>Neto esperado a recibir</b><b className="right num">{pesos(calc.netoEsperado)}</b></div>
            </div>
          </div>
        </div>
      )}

      {paso === 3 && (
        <div className="form-grid">
          <Field label="Fecha de emisión" hint={fecha(emision)}><input type="date" className="input" value={emision} onChange={(e) => setEmision(e.target.value)} /></Field>
          <Field label="Fecha de vencimiento" required error={venc && venc < emision ? "No puede ser anterior a la emisión" : undefined} hint={`Sugerida: emisión + ${cli?.plazoPago ?? 30} días`}><input type="date" className={`input ${intento && !venc ? "required-empty" : ""}`} value={venc} onChange={(e) => setVenc(e.target.value)} /></Field>
          <Field label="Número de factura" hint="Si aún no lo tienes, queda PROGRAMADA y se emite después" error={numeroRepetido ? `Ya existe en ${db.clientes.find((c) => c.id === numeroRepetido.clienteId)?.nombreComercial}: ${numeroRepetido.descripcion}` : undefined}>
            <input className={`input mono ${numeroRepetido ? "invalid" : ""}`} value={numero} onChange={(e) => setNumero(e.target.value)} />
          </Field>
          <Field label="Número de O.C." required={cli?.requiereOC} error={faltaOC ? "Este cliente requiere O.C. para emitir" : undefined}><input className="input" value={oc} onChange={(e) => setOc(e.target.value)} /></Field>
          <Field label="Link o PDF de la factura (opcional)" full><input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://drive.google.com/…" /></Field>
          <div className="full card" style={{ background: "var(--fill-2)", boxShadow: "none" }}>
            <div className="footnote">{cli?.nombreComercial} · {descripcion}</div>
            <div className="headline">{pesos(calc.subtotal)} sin IVA · {pesos(calc.total)} con IVA · neto {pesos(calc.netoEsperado)}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}
