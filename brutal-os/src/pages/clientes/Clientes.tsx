import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Building2, CalendarClock, Copy, FilePlus2, Mail, Pause, Phone, Play, Plus, Search, TriangleAlert } from "lucide-react";
import { useDB, useSesion } from "../../data/store";
import { calcFactura, cambiarEstadoContrato, clientePorNit, guardarCliente, guardarContrato, registrarOtrosi } from "../../data/storeFin";
import { contratosPorVencer } from "../../data/selectorsFin";
import { calcularDV, coincide, enCartera, mesFinal, validarNit, valorVigente, type Cliente, type Contrato } from "../../domain/facturacion";
import { hoy } from "../../domain/fechas";
import { fecha, pesos, pesosCortos } from "../../lib/format";
import { Badge, Card, Empty, Field, Kpi, Modal, MoneyInput, Seg, Switch, useToast } from "../../components/ui";
import { ESTADO_COLOR, EstadoFactura, FacturaSheet } from "../facturacion/comun";

type Tab = "clientes" | "contratos";

export function checklistCliente(c: Cliente, contratos: Contrato[]) {
  const falta: string[] = [];
  if (!c.nit) falta.push("NIT");
  if (!c.razonSocial) falta.push("Razón social");
  if (!c.correoCartera) falta.push("Correo de cartera");
  if (!c.correosFacturacion.length) falta.push("Correo de facturación");
  if (contratos.some((k) => k.clienteId === c.id && k.estado !== "TERMINADO" && !k.contratoCargado)) falta.push("Contrato firmado");
  if (!c.rutCargado) falta.push("RUT");
  return falta;
}

export default function Clientes() {
  const db = useDB();
  const nav = useNavigate();
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "clientes";
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("");
  const [nuevo, setNuevo] = useState(false);
  const [contrato, setContrato] = useState<Contrato | "nuevo" | null>(null);
  const activos = db.clientes.filter((c) => c.estado === "ACTIVO");
  const feeMes = db.contratos.filter((c) => c.estado === "ACTIVO").reduce((s, c) => s + valorVigente(c, hoy().slice(0, 7)), 0);
  const vencen = contratosPorVencer(db, 90);
  const incompletos = db.clientes.filter((c) => c.estado !== "RETIRADO" && checklistCliente(c, db.contratos).length).length;
  const lista = db.clientes.filter((c) => (!estado || c.estado === estado) && coincide(c, q));
  if (id) return <FichaCliente id={id} onContrato={setContrato} contratoAbierto={contrato} cerrarContrato={() => setContrato(null)} />;

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Clientes y contratos</h1>
          <p className="subtitle" style={{ margin: 0 }}>El código del cliente es la llave de contratos, facturas, cartera e ingresos. Nunca se relaciona por nombre.</p>
        </div>
        <div className="toolbar">
          <button className="btn glass-btn" onClick={() => setContrato("nuevo")}><FilePlus2 />Nuevo contrato</button>
          <button className="btn primary" onClick={() => setNuevo(true)}><Plus />Nuevo cliente</button>
        </div>
      </div>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <Kpi label="Clientes activos" value={activos.length} icon={<Building2 />} color="var(--indigo)" foot={<span>{db.clientes.filter((c) => c.estado === "POR CONFIRMAR").length} por confirmar</span>} />
        <Kpi label="Fee mensual contratado" value={pesosCortos(feeMes)} icon={<CalendarClock />} color="var(--green)" foot={<span>{db.contratos.filter((c) => c.estado === "ACTIVO").length} contratos activos · antes de IVA</span>} />
        <Kpi label="Contratos por vencer" value={vencen.length} icon={<TriangleAlert />} color="var(--orange)" foot={<span>próximos 90 días</span>} />
        <Kpi label="Fichas incompletas" value={incompletos} icon={<TriangleAlert />} color="var(--yellow)" foot={<span>NIT, correos, contrato o RUT</span>} />
      </div>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Seg glassy value={tab} onChange={(t) => setSp((s) => { s.set("tab", t); return s; })} options={[{ value: "clientes", label: "Clientes", count: db.clientes.length }, { value: "contratos", label: "Contratos", count: db.contratos.length }]} />
        <div className="search grow" style={{ maxWidth: 380 }}><Search /><input placeholder="Código, nombre, razón social, alias o NIT" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {tab === "clientes" && <Seg value={estado} onChange={setEstado} options={[{ value: "", label: "Todos" }, { value: "ACTIVO", label: "Activos" }, { value: "POR CONFIRMAR", label: "Por confirmar" }, { value: "EN PAUSA", label: "En pausa" }, { value: "RETIRADO", label: "Retirados" }]} />}
      </div>

      {tab === "clientes" ? (
        lista.length === 0 ? <Empty icon={<Building2 />} title="Sin clientes" text="Crea el primero o ajusta la búsqueda." action={<button className="btn primary" onClick={() => setNuevo(true)}><Plus />Nuevo cliente</button>} /> : (
          <>
            {["ACTIVO", "POR CONFIRMAR", "EN PAUSA", "RETIRADO"].filter((e) => lista.some((c) => c.estado === e)).map((e) => (
              <div key={e} style={{ marginBottom: 22 }}>
                <div className="list-header" style={{ padding: "0 4px 10px" }}>{e === "ACTIVO" ? "Activos" : e === "POR CONFIRMAR" ? "Por confirmar" : e === "EN PAUSA" ? "En pausa" : "Retirados"}</div>
                <div className="people" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                  {lista.filter((c) => c.estado === e).map((c) => {
                    const falta = checklistCliente(c, db.contratos);
                    const fee = db.contratos.filter((k) => k.clienteId === c.id && k.estado === "ACTIVO").reduce((s, k) => s + valorVigente(k, hoy().slice(0, 7)), 0);
                    return (
                      <div key={c.id} className="person" style={{ textAlign: "left" }} onClick={() => nav(`/clientes/${c.id}`)}>
                        <div className="row" style={{ alignItems: "flex-start" }}>
                          <div className="avatar md" style={{ background: "linear-gradient(160deg,#7D7AFF,#3634A3)", borderRadius: 14 }}>{c.nombreComercial.slice(0, 2)}</div>
                          <div className="grow" style={{ minWidth: 0 }}>
                            <div className="person-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombreComercial}</div>
                            <div className="caption">{c.id} · {c.razonSocial || "Razón social pendiente"}</div>
                          </div>
                        </div>
                        <div className="row between" style={{ marginTop: 12 }}>
                          <span className="footnote">{fee ? `Fee ${pesosCortos(fee)}` : "Sin fee"} · ciclo día {c.ciclo}</span>
                          <Badge color={ESTADO_COLOR[c.estado]}>{c.estado}</Badge>
                        </div>
                        {c.proyectos.length > 0 && <div className="caption" style={{ marginTop: 6 }}>{c.proyectos.join(" · ")}</div>}
                        {falta.length > 0 && <div className="caption" style={{ marginTop: 6, color: "var(--orange)" }}>Falta: {falta.join(", ")}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )
      ) : (
        <TablaContratos q={q} onAbrir={setContrato} />
      )}
      <ClienteForm open={nuevo} onClose={() => setNuevo(false)} onCreado={(cid) => nav(`/clientes/${cid}`)} />
      {contrato && <ContratoForm contrato={contrato === "nuevo" ? null : contrato} onClose={() => setContrato(null)} />}
    </div>
  );
}

function TablaContratos({ q, onAbrir, clienteId }: { q: string; onAbrir: (c: Contrato) => void; clienteId?: string }) {
  const db = useDB();
  const ref = hoy();
  const lista = db.contratos.filter((k) => (!clienteId || k.clienteId === clienteId) && (!q || coincide(db.clientes.find((c) => c.id === k.clienteId)!, q) || k.proyecto.toLowerCase().includes(q.toLowerCase())));
  if (!lista.length) return <div className="footnote">Sin contratos.</div>;
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th>Contrato</th><th>Cliente · proyecto</th><th>Inicio</th><th>Fin</th><th className="r">Valor mensual</th><th>Servicios</th><th>O.C.</th><th>Estado</th></tr></thead>
        <tbody>
          {lista.map((k) => {
            const cli = db.clientes.find((c) => c.id === k.clienteId);
            const dias = k.fin ? Math.round((Date.parse(k.fin) - Date.parse(ref)) / 86_400_000) : null;
            return (
              <tr key={k.id} className="click" onClick={() => onAbrir(k)}>
                <td className="mono">{k.id}</td>
                <td><b style={{ fontWeight: 600 }}>{cli?.nombreComercial}</b>{k.proyecto && <span className="caption"> · {k.proyecto}</span>}</td>
                <td className="num">{fecha(k.inicio)}</td>
                <td className="num">{k.fin ? fecha(k.fin) : <Badge color="yellow">Por definir</Badge>}{dias !== null && dias <= 90 && dias >= 0 && <Badge color={dias <= 30 ? "red" : dias <= 60 ? "orange" : "yellow"}>{dias} días</Badge>}</td>
                <td className="r"><b>{pesos(valorVigente(k, ref.slice(0, 7)))}</b>{k.otrosies.length > 0 && <div className="caption">{k.otrosies.length} otrosí</div>}</td>
                <td className="footnote" style={{ whiteSpace: "normal", minWidth: 200 }}>{k.servicios.map((s) => s.servicio).join(", ") || "—"}</td>
                <td>{k.oc?.numero ?? "—"}</td>
                <td><Badge color={ESTADO_COLOR[k.estado]} dot>{k.estado}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FichaCliente({ id, onContrato, contratoAbierto, cerrarContrato }: { id: string; onContrato: (c: Contrato | "nuevo") => void; contratoAbierto: Contrato | "nuevo" | null; cerrarContrato: () => void }) {
  const db = useDB();
  const nav = useNavigate();
  const toast = useToast();
  const sesion = useSesion();
  const c = db.clientes.find((x) => x.id === id);
  const [editar, setEditar] = useState(false);
  const [factura, setFactura] = useState<string | null>(null);
  if (!c) return <Empty icon={<Building2 />} title="Cliente no encontrado" />;
  const falta = checklistCliente(c, db.contratos);
  const facturas = db.facturas.filter((f) => f.clienteId === c.id).sort((a, b) => (b.emision ?? b.fechaProgramada).localeCompare(a.emision ?? a.fechaProgramada));
  const saldo = facturas.filter(enCartera).reduce((s, f) => s + calcFactura(db, f).saldo, 0);
  const facturado = facturas.filter((f) => f.estado !== "ANULADA" && f.estado !== "PROGRAMADA" && f.estado !== "EN PAUSA").reduce((s, f) => s + calcFactura(db, f).ingresoPropio, 0);
  const copiar = (t: string) => navigator.clipboard?.writeText(t).then(() => toast("Copiado"), () => toast(t, "info"));
  const anio = hoy().slice(0, 4);
  return (
    <div className="fade-in">
      <div className="profile-hero glass">
        <div className="avatar xl" style={{ background: "linear-gradient(160deg,#7D7AFF,#3634A3)", borderRadius: 30 }}>{c.nombreComercial.slice(0, 2)}</div>
        <div className="grow">
          <div className="caption mono">{c.id}</div>
          <h1 className="large-title" style={{ margin: "2px 0" }}>{c.nombreComercial}</h1>
          <div className="muted" style={{ fontSize: 17 }}>{c.razonSocial || "Razón social pendiente"}{c.nit ? ` · NIT ${c.nit}-${c.dv}` : ""}</div>
          <div className="meta">
            <Badge color={ESTADO_COLOR[c.estado]} dot>{c.estado}</Badge>
            <Badge color="blue">Ciclo día {c.ciclo}</Badge>
            <Badge color="gray">Plazo {c.plazoPago} días</Badge>
            {c.requiereOC && <Badge color="orange">Requiere O.C.</Badge>}
            {c.alias.filter((a) => a !== c.nombreComercial).map((a) => <Badge key={a} color="gray">Alias: {a}</Badge>)}
          </div>
        </div>
        <div className="toolbar" style={{ alignSelf: "flex-start" }}>
          <button className="btn glass-btn" onClick={() => setEditar(true)}>Editar</button>
          <button className="btn primary" onClick={() => onContrato("nuevo")}><FilePlus2 />Contrato</button>
          <button className="btn glass-btn" onClick={() => nav(`/facturacion?nueva=1&cliente=${c.id}`)}>Nueva factura</button>
        </div>
      </div>
      {falta.length > 0 && (
        <div className="card" style={{ marginTop: 16, background: "color-mix(in srgb, var(--yellow) 16%, var(--bg-elev))" }}>
          <div className="row wrap"><TriangleAlert color="var(--orange)" /><b>Datos faltantes:</b>{falta.map((x) => <Badge key={x} color="yellow">{x}</Badge>)}</div>
        </div>
      )}
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Kpi label="Facturado (ingreso propio)" value={pesosCortos(facturado)} />
        <Kpi label="Saldo en cartera" value={pesosCortos(saldo)} />
        <Kpi label="Contratos activos" value={db.contratos.filter((k) => k.clienteId === c.id && k.estado === "ACTIVO").length} />
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Contacto y facturación">
          <div className="list" style={{ boxShadow: "none" }}>
            {[
              ["Correo facturación electrónica", c.correosFacturacion.join(", ")],
              ["Correo cartera / tesorería", c.correoCartera],
              ["Contacto comercial", [c.contacto.nombre, c.contacto.cargo].filter(Boolean).join(" · ")],
              ["Celular", c.contacto.celular],
              ["Representante legal", c.representanteLegal],
              ["Dirección", c.direccion],
            ].map(([k, v]) => (
              <div className="list-row flat" key={k} style={{ alignItems: "flex-start" }}>
                <div className="grow" style={{ minWidth: 0 }}><div className="caption">{k}</div><div style={{ overflowWrap: "anywhere" }}>{v || <span className="muted">Pendiente</span>}</div></div>
                {v && <button className="btn icon sm plain" onClick={() => copiar(v)} aria-label="Copiar"><Copy size={14} /></button>}
              </div>
            ))}
          </div>
        </Card>
        <Card title="Perfil tributario" sub="Define las retenciones automáticas">
          <div className="stack" style={{ gap: 10 }}>
            {([["granContribuyente", "Gran contribuyente"], ["autorretenedor", "Autorretenedor"], ["agenteReteIcaBogota", "Agente retenedor de ICA Bogotá"], ["regimenSimple", "Régimen simple"], ["entidadPublica", "Entidad pública"]] as const).map(([k, l]) => (
              <div className="row between" key={k}><span>{l}</span><Switch on={c.perfil[k]} onChange={(v) => guardarCliente({ ...c, perfil: { ...c.perfil, [k]: v } })} /></div>
            ))}
            <div className="divider" style={{ margin: "6px 0" }} />
            <div className="row between"><span>Certificado de retención {anio}</span><Switch on={!!c.certificadoRetencion[anio]} onChange={(v) => guardarCliente({ ...c, certificadoRetencion: { ...c.certificadoRetencion, [anio]: v } })} /></div>
            <div className="row between"><span>RUT cargado</span><Switch on={c.rutCargado} onChange={(v) => guardarCliente({ ...c, rutCargado: v })} /></div>
          </div>
        </Card>
        <Card title="Proyectos y marcas" sub="Sub-cuentas facturadas por separado">
          <div className="row wrap" style={{ gap: 6 }}>{c.proyectos.length ? c.proyectos.map((p) => <Badge key={p} color="purple">{p}</Badge>) : <span className="footnote">Sin proyectos</span>}</div>
          <ProyectoNuevo c={c} />
          {sesion.rol === "ADMINISTRADOR" && (
            <div style={{ marginTop: 16 }}>
              <div className="caption" style={{ marginBottom: 6 }}>Estado del cliente</div>
              <Seg value={c.estado} onChange={(v) => { guardarCliente({ ...c, estado: v }); toast(`Cliente ${v.toLowerCase()}`); }} options={[{ value: "ACTIVO", label: "Activo" }, { value: "EN PAUSA", label: "En pausa" }, { value: "POR CONFIRMAR", label: "Por confirmar" }, { value: "RETIRADO", label: "Retirado" }]} />
            </div>
          )}
        </Card>
      </div>
      <div className="section-title">Contratos</div>
      <TablaContratos q="" clienteId={c.id} onAbrir={onContrato} />
      <div className="section-title">Facturas <small>{facturas.length}</small></div>
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table className="t">
          <thead><tr><th>N.º</th><th>Tipo</th><th>Descripción</th><th>Emisión</th><th>Vence</th><th className="r">Antes de IVA</th><th className="r">Saldo</th><th>Estado</th></tr></thead>
          <tbody>
            {facturas.map((f) => {
              const k = calcFactura(db, f);
              return (
                <tr key={f.id} className="click" onClick={() => setFactura(f.id)}>
                  <td className="mono">{f.numero ?? "—"}</td><td>{f.tipo}</td>
                  <td style={{ whiteSpace: "normal", minWidth: 260 }}>{f.descripcion}</td>
                  <td className="num">{fecha(f.emision ?? f.fechaProgramada)}</td><td className="num">{fecha(f.vencimiento)}</td>
                  <td className="r">{pesos(k.subtotal)}</td><td className="r">{k.saldo ? pesos(k.saldo) : "—"}</td>
                  <td><EstadoFactura f={f} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ClienteForm open={editar} cliente={c} onClose={() => setEditar(false)} onCreado={() => undefined} />
      {contratoAbierto && <ContratoForm contrato={contratoAbierto === "nuevo" ? null : contratoAbierto} clienteFijo={c.id} onClose={cerrarContrato} />}
      <FacturaSheet id={factura} onClose={() => setFactura(null)} />
    </div>
  );
}

function ProyectoNuevo({ c }: { c: Cliente }) {
  const [p, setP] = useState("");
  return (
    <div className="row" style={{ marginTop: 10 }}>
      <input className="input sm" placeholder="Nuevo proyecto o marca" value={p} onChange={(e) => setP(e.target.value)} />
      <button className="btn sm" disabled={!p.trim()} onClick={() => { guardarCliente({ ...c, proyectos: [...c.proyectos, p.trim().toUpperCase()] }); setP(""); }}><Plus size={14} /></button>
    </div>
  );
}

const CLIENTE_VACIO: Omit<Cliente, "id" | "creadoEn"> = {
  nombreComercial: "", razonSocial: "", nit: "", dv: "", alias: [], correosFacturacion: [], correoCartera: "", contacto: { nombre: "", cargo: "", celular: "" },
  representanteLegal: "", direccion: "", perfil: { granContribuyente: false, autorretenedor: false, agenteReteIcaBogota: false, regimenSimple: false, entidadPublica: false },
  requiereOC: false, ciclo: 1, plazoPago: 30, estado: "ACTIVO", proyectos: [], rutCargado: false, certificadoRetencion: {}, confirmadoCorreoCobro: false,
};

export function ClienteForm({ open, onClose, onCreado, cliente }: { open: boolean; onClose: () => void; onCreado: (id: string) => void; cliente?: Cliente }) {
  const toast = useToast();
  const nav = useNavigate();
  const [f, setF] = useState<Omit<Cliente, "id" | "creadoEn"> & { id?: string }>(cliente ?? CLIENTE_VACIO);
  const [intento, setIntento] = useState(false);
  useEffect(() => { if (open) { setF(cliente ?? CLIENTE_VACIO); setIntento(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Cliente>(k: K, v: Cliente[K]) => setF((s) => ({ ...s, [k]: v }));
  const dup = f.nit ? clientePorNit(f.nit) : undefined;
  const duplicado = dup && dup.id !== f.id ? dup : undefined;
  const nitOk = !f.nit || validarNit(f.nit, f.dv);
  const guardar = () => {
    setIntento(true);
    if (!f.nombreComercial.trim() || duplicado || !nitOk) return;
    try {
      const id = guardarCliente({ ...f, nombreComercial: f.nombreComercial.trim().toUpperCase(), razonSocial: f.razonSocial.trim().toUpperCase(), alias: Array.from(new Set([f.nombreComercial.trim().toUpperCase(), ...f.alias])) });
      toast(cliente ? "Cliente actualizado" : <>Cliente <b>{id}</b> creado</>);
      onClose();
      onCreado(id);
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <Modal open={open} onClose={onClose} title={cliente ? `Editar ${cliente.id}` : "Nuevo cliente"} size="wide" footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={guardar}>Guardar</button></>}>
      {duplicado && (
        <div className="card" style={{ background: "color-mix(in srgb, var(--red) 10%, transparent)", boxShadow: "none", padding: 12, marginBottom: 12 }}>
          <div className="row wrap"><TriangleAlert color="var(--red)" />Ya existe un cliente con ese NIT: <b>{duplicado.id} · {duplicado.nombreComercial}</b><button className="btn sm right" onClick={() => { onClose(); nav(`/clientes/${duplicado.id}`); }}>Ver cliente</button></div>
        </div>
      )}
      <div className="form-grid">
        <Field label="Nombre comercial" required><input className={`input ${intento && !f.nombreComercial.trim() ? "required-empty" : ""}`} value={f.nombreComercial} onChange={(e) => set("nombreComercial", e.target.value.toUpperCase())} /></Field>
        <Field label="Razón social"><input className="input" value={f.razonSocial} onChange={(e) => set("razonSocial", e.target.value.toUpperCase())} /></Field>
        <Field label="NIT (sin dígito)" error={f.nit && !nitOk ? `El dígito de verificación debería ser ${calcularDV(f.nit)}` : undefined}>
          <div className="row" style={{ gap: 6 }}>
            <input className={`input mono ${f.nit && !nitOk ? "invalid" : ""}`} value={f.nit} onChange={(e) => { const n = e.target.value.replace(/\D/g, ""); set("nit", n); if (!f.dv || f.dv === calcularDV(f.nit)) set("dv", n ? calcularDV(n) : ""); }} />
            <span className="muted">-</span>
            <input className="input mono" style={{ width: 56 }} maxLength={1} value={f.dv} onChange={(e) => set("dv", e.target.value.replace(/\D/g, ""))} />
          </div>
        </Field>
        <Field label="Alias (separados por coma)" hint="Formas en que aparece en el histórico"><input className="input" value={f.alias.join(", ")} onChange={(e) => set("alias", e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean))} /></Field>
        <Field label="Correos de facturación electrónica" full><input className="input" value={f.correosFacturacion.join(", ")} onChange={(e) => set("correosFacturacion", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))} /></Field>
        <Field label="Correo de cartera / tesorería / contabilidad" hint="Destino de los correos de cobro"><input className="input" value={f.correoCartera} onChange={(e) => set("correoCartera", e.target.value.trim())} /></Field>
        <Field label="Contacto comercial"><input className="input" value={f.contacto.nombre} onChange={(e) => set("contacto", { ...f.contacto, nombre: e.target.value })} /></Field>
        <Field label="Cargo del contacto"><input className="input" value={f.contacto.cargo} onChange={(e) => set("contacto", { ...f.contacto, cargo: e.target.value })} /></Field>
        <Field label="Celular del contacto"><input className="input" value={f.contacto.celular} onChange={(e) => set("contacto", { ...f.contacto, celular: e.target.value.replace(/\D/g, "") })} /></Field>
        <Field label="Ciclo de facturación"><Seg value={String(f.ciclo) as "1" | "15"} onChange={(v) => set("ciclo", Number(v) as 1 | 15)} options={[{ value: "1", label: "Ciclo 1 (día 1)" }, { value: "15", label: "Ciclo 2 (día 15)" }]} /></Field>
        <Field label="Plazo de pago (días)"><select className="select" value={[30, 45, 60].includes(f.plazoPago) ? f.plazoPago : 0} onChange={(e) => set("plazoPago", Number(e.target.value) || f.plazoPago)}><option value={30}>30 días</option><option value={45}>45 días</option><option value={60}>60 días</option><option value={0}>Otro…</option></select></Field>
        {![30, 45, 60].includes(f.plazoPago) && <Field label="Otro plazo"><input className="input num" type="number" value={f.plazoPago} onChange={(e) => set("plazoPago", Number(e.target.value))} /></Field>}
        <div className="row between full"><span>¿Requiere orden de compra (O.C.)?</span><Switch on={f.requiereOC} onChange={(v) => set("requiereOC", v)} /></div>
      </div>
    </Modal>
  );
}

const CONTRATO_VACIO = (clienteId = ""): Omit<Contrato, "id"> => ({
  clienteId, proyecto: "", inicio: hoy().slice(0, 8) + "01", duracionMeses: 12, fin: null, renovacionAuto: false, valorMensual: 0, servicios: [],
  incrementoPautaPct: 0, oc: null, otrosies: [], estado: "ACTIVO", contratoCargado: false, nota: "",
});

export function ContratoForm({ contrato, clienteFijo, onClose }: { contrato: Contrato | null; clienteFijo?: string; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const [f, setF] = useState<Omit<Contrato, "id"> & { id?: string }>(contrato ?? CONTRATO_VACIO(clienteFijo));
  const [otrosi, setOtrosi] = useState({ desde: `${hoy().slice(0, 7)}-01`, valor: 0, nota: "" });
  const set = <K extends keyof Contrato>(k: K, v: Contrato[K]) => setF((s) => ({ ...s, [k]: v }));
  const cli = db.clientes.find((c) => c.id === f.clienteId);
  const mensuales = db.servicios.filter((s) => s.activo && (s.categoria === "MENSUAL" || s.categoria === "PAUTA"));
  const toggle = (nombre: string) => set("servicios", f.servicios.some((s) => s.servicio === nombre) ? f.servicios.filter((s) => s.servicio !== nombre) : [...f.servicios, { servicio: nombre, entregables: "" }]);
  const ok = f.clienteId && f.valorMensual > 0 && f.inicio;
  return (
    <Modal open onClose={onClose} title={contrato ? `Contrato ${contrato.id}` : "Nuevo contrato"} size="wide"
      footer={<>
        {contrato && contrato.estado !== "TERMINADO" && <button className="btn" style={{ marginRight: "auto" }} onClick={() => { cambiarEstadoContrato(contrato.id, contrato.estado === "EN PAUSA" ? "ACTIVO" : "EN PAUSA"); toast(contrato.estado === "EN PAUSA" ? "Contrato reactivado: sus programadas vuelven a la proyección" : "Contrato en pausa: programadas congeladas"); onClose(); }}>{contrato.estado === "EN PAUSA" ? <><Play />Reactivar</> : <><Pause />Pausar</>}</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={!ok} onClick={() => { guardarContrato(f); toast(contrato ? "Contrato actualizado · programadas futuras recalculadas" : "Contrato creado · facturas programadas generadas"); onClose(); }}>Guardar</button>
      </>}>
      <div className="form-grid">
        <Field label="Cliente" required>
          <select className="select" disabled={!!clienteFijo || !!contrato} value={f.clienteId} onChange={(e) => set("clienteId", e.target.value)}>
            <option value="">Selecciona…</option>
            {db.clientes.filter((c) => c.estado !== "RETIRADO").map((c) => <option key={c.id} value={c.id}>{c.id} · {c.nombreComercial}</option>)}
          </select>
        </Field>
        <Field label="Proyecto o marca">
          <select className="select" value={f.proyecto} onChange={(e) => set("proyecto", e.target.value)}>
            <option value="">Sin proyecto</option>{cli?.proyectos.map((p) => <option key={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Fecha de inicio" hint={fecha(f.inicio)}><input type="date" className="input" value={f.inicio} onChange={(e) => set("inicio", e.target.value)} /></Field>
        <Field label="Duración (meses)" hint={f.duracionMeses ? undefined : "Por definir: se programa hasta diciembre"}>
          <select className="select" value={f.duracionMeses ?? 0} onChange={(e) => set("duracionMeses", Number(e.target.value) || null)}>
            <option value={0}>Por definir</option>{[1, 2, 3, 4, 6, 12, 18, 24].map((m) => <option key={m} value={m}>{m} meses</option>)}
          </select>
        </Field>
        <Field label="Valor mensual antes de IVA" required><MoneyInput value={f.valorMensual} onChange={(v) => set("valorMensual", v)} /></Field>
        <Field label="% de incremento sobre pauta" hint="Ej. 8 % para pauta con incremento"><div className="row" style={{ gap: 6 }}><input className="input num" type="number" value={Math.round(f.incrementoPautaPct * 1000) / 10} onChange={(e) => set("incrementoPautaPct", Number(e.target.value) / 100)} /><span className="muted">%</span></div></Field>
        <Field label="Alcance: servicios incluidos" full>
          <div className="row wrap" style={{ gap: 6 }}>{mensuales.map((s) => <button key={s.nombre} type="button" className={`chip-btn ${f.servicios.some((x) => x.servicio === s.nombre) ? "on" : ""}`} onClick={() => toggle(s.nombre)}>{s.nombre}</button>)}</div>
        </Field>
        {f.servicios.map((s, i) => (
          <Field key={s.servicio} label={`Entregables por mes · ${s.servicio}`}><input className="input" placeholder="Ej. 12 posts, 4 reels, 1 producción" value={s.entregables} onChange={(e) => set("servicios", f.servicios.map((x, j) => (j === i ? { ...x, entregables: e.target.value } : x)))} /></Field>
        ))}
        <Field label="O.C. número"><input className="input" value={f.oc?.numero ?? ""} onChange={(e) => set("oc", e.target.value ? { numero: e.target.value, valor: f.oc?.valor ?? 0, vigencia: f.oc?.vigencia ?? "" } : null)} /></Field>
        <Field label="O.C. vigencia"><input type="date" className="input" value={f.oc?.vigencia ?? ""} disabled={!f.oc} onChange={(e) => set("oc", f.oc ? { ...f.oc, vigencia: e.target.value } : null)} /></Field>
        <div className="row between"><span>Renovación automática</span><Switch on={f.renovacionAuto} onChange={(v) => set("renovacionAuto", v)} /></div>
        <div className="row between"><span>Contrato firmado cargado</span><Switch on={f.contratoCargado} onChange={(v) => set("contratoCargado", v)} /></div>
      </div>
      {contrato && (
        <>
          <div className="section-title" style={{ fontSize: 17, marginTop: 22 }}>Otrosíes <small>Solo recalculan las programadas futuras</small></div>
          {contrato.otrosies.map((o, i) => <div key={i} className="footnote">Desde {fecha(o.desde)}: {pesos(o.valorMensual)} · {o.nota}</div>)}
          <div className="row wrap" style={{ marginTop: 10 }}>
            <input type="date" className="input" style={{ width: 170 }} value={otrosi.desde} onChange={(e) => setOtrosi({ ...otrosi, desde: e.target.value })} />
            <div style={{ width: 190 }}><MoneyInput value={otrosi.valor} onChange={(v) => setOtrosi({ ...otrosi, valor: v })} placeholder="Nuevo valor mensual" /></div>
            <input className="input grow" placeholder="Detalle del otrosí" value={otrosi.nota} onChange={(e) => setOtrosi({ ...otrosi, nota: e.target.value })} />
            <button className="btn" disabled={!otrosi.valor} onClick={() => { registrarOtrosi(contrato.id, otrosi.desde, otrosi.valor, otrosi.nota); toast("Otrosí registrado"); onClose(); }}>Registrar otrosí</button>
          </div>
          <div className="caption" style={{ marginTop: 10 }}>Facturas hasta {mesFinal(contrato)} · {db.facturas.filter((x) => x.contratoId === contrato.id && x.estado === "PROGRAMADA").length} programadas pendientes</div>
        </>
      )}
      {!cli?.correoCartera && f.clienteId && <div className="caption" style={{ marginTop: 12, color: "var(--orange)" }}><Mail size={12} /> El cliente no tiene correo de cartera. <Phone size={12} /> Complétalo en su ficha.</div>}
    </Modal>
  );
}
