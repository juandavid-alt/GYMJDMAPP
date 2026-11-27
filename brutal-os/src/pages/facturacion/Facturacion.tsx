import { useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Plus, Receipt, Search, TriangleAlert, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";
import { useDB, useSesion } from "../../data/store";
import { emitir, guardarCliente, guardarFactura, resolverNC } from "../../data/storeFin";
import { contratosPorVencer, facturasCalc, ingresoAsegurado, mesCausado, serieFacturacion, TIPOS_LABEL } from "../../data/selectorsFin";
import { coincide, conciliar, normalizarNumero, type Factura } from "../../domain/facturacion";
import { hoy, iso, MESES, mesSiguiente, mesAnterior, mesId } from "../../domain/fechas";
import { fecha, fechaHora, pct, pesos, pesosCortos } from "../../lib/format";
import { Badge, BarList, Card, ChartTip, Empty, Field, Kpi, Legend, Modal, Seg, useToast } from "../../components/ui";
import { ESTADO_COLOR, EstadoFactura, FacturaSheet, nombreCliente } from "./comun";
import NuevaFactura from "./NuevaFactura";

type Tab = "resumen" | "facturas" | "calendario" | "lote" | "notas" | "migracion";
const ax = (n: number) => pesosCortos(n).replace("$ ", "");
const COLORES_TIPO: Record<Factura["tipo"], string> = { FIJA: "#30C759", ADICIONAL: "#0A7AFF", "ONE SHOT": "#AF52DE", PAUTA: "#FF9500" };

export default function Facturacion() {
  const db = useDB();
  const sesion = useSesion();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "resumen";
  const setTab = (t: Tab) => setSp((s) => { s.set("tab", t); return s; });
  const nueva = sp.get("nueva") === "1";
  const [abierta, setAbierta] = useState<string | null>(null);
  const sinNumero = db.facturas.filter((f) => f.datoIncompleto && f.estado !== "ANULADA").length;
  const ncPend = db.notasCredito.filter((n) => n.estado === "SOLICITADA").length;
  const porEmitir = db.facturas.filter((f) => f.estado === "PROGRAMADA" && f.fechaProgramada <= hoy()).length;
  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Facturación</h1>
          <p className="subtitle" style={{ margin: 0 }}>Contrato → programada → emitida → cartera → pagada → ingreso. Valores antes de IVA; el sistema calcula el resto.</p>
        </div>
        <div className="toolbar">
          {sinNumero > 0 && <button className="btn glass-btn" onClick={() => setTab("migracion")}><TriangleAlert color="var(--orange)" />{sinNumero} facturas sin número</button>}
          {sesion.rol !== "CONTADORA" && sesion.rol !== "CONSULTA" && <button className="btn primary" onClick={() => setSp((s) => { s.set("nueva", "1"); return s; })}><Plus />Nueva factura</button>}
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <Seg glassy value={tab} onChange={setTab} options={[
          { value: "resumen", label: "Resumen" },
          { value: "facturas", label: "Facturas", count: db.facturas.length },
          { value: "calendario", label: "Calendario" },
          { value: "lote", label: "Emitir lote", count: porEmitir || undefined },
          { value: "notas", label: "Notas crédito", count: ncPend || undefined },
          { value: "migracion", label: "Migración", count: sinNumero || undefined },
        ]} />
      </div>
      {tab === "resumen" && <Resumen onAbrir={setAbierta} />}
      {tab === "facturas" && <Lista onAbrir={setAbierta} />}
      {tab === "calendario" && <Calendario onAbrir={setAbierta} />}
      {tab === "lote" && <Lote />}
      {tab === "notas" && <Notas onAbrir={setAbierta} />}
      {tab === "migracion" && <Migracion onAbrir={setAbierta} />}
      <NuevaFactura open={nueva} clienteInicial={sp.get("cliente") ?? undefined} onClose={() => setSp((s) => { s.delete("nueva"); s.delete("cliente"); return s; })} />
      <FacturaSheet id={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}

function Resumen({ onAbrir }: { onAbrir: (id: string) => void }) {
  const db = useDB();
  const nav = useNavigate();
  const anio = Number(hoy().slice(0, 4));
  const mesAct = hoy().slice(0, 7);
  const meses = Array.from({ length: 12 }, (_, i) => mesId(anio, i + 1));
  const serie = useMemo(() => serieFacturacion(db, meses), [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const actual = serie.find((s) => s.mes === mesAct)!;
  const fs = facturasCalc(db);
  const porCliente = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of fs) if (x.f.estado !== "ANULADA" && x.f.estado !== "PROGRAMADA" && x.f.estado !== "EN PAUSA" && x.f.emision?.startsWith(String(anio))) m.set(x.f.clienteId, (m.get(x.f.clienteId) ?? 0) + x.c.ingresoPropio);
    return [...m.entries()].map(([id, value]) => ({ name: nombreCliente(db, id), value })).sort((a, b) => b.value - a.value);
  }, [fs, db, anio]);
  const totalAnio = porCliente.reduce((s, x) => s + x.value, 0);
  const top3 = porCliente.slice(0, 3).reduce((s, x) => s + x.value, 0);
  const proximos = Array.from({ length: 12 }, (_, i) => { let c = { anio, mes: Number(mesAct.slice(5, 7)) }; for (let k = 0; k < i; k++) c = mesSiguiente(c.anio, c.mes); return mesId(c.anio, c.mes); });
  const asegurado = ingresoAsegurado(db, proximos);
  const vencen = contratosPorVencer(db, 365);
  const vencenPorMes = proximos.map((m) => ({ label: asegurado.find((a) => a.mes === m)!.label, valor: vencen.filter((v) => v.c.fin!.slice(0, 7) === m).reduce((s, v) => s + v.valor, 0), n: vencen.filter((v) => v.c.fin!.slice(0, 7) === m).length }));
  const sinDuracion = db.contratos.filter((c) => c.estado === "ACTIVO" && !c.fin).length;
  const porEmitir = fs.filter((x) => x.f.estado === "PROGRAMADA" && x.f.fechaProgramada <= hoy());

  return (
    <>
      <div className="grid g4">
        <Kpi label={`Facturado ${MESES[Number(mesAct.slice(5, 7)) - 1].toLowerCase()}`} value={pesosCortos(actual.facturado)} icon={<Receipt />} color="var(--teal)" foot={<span>ingreso propio sin IVA</span>} />
        <Kpi label="Programado del mes" value={pesosCortos(actual.programado)} icon={<CalendarDays />} color="var(--blue)" foot={<span>{actual.programado ? pct(actual.facturado / actual.programado, 0) : "—"} cumplido</span>} />
        <Kpi label="Por emitir hoy" value={porEmitir.length} icon={<TriangleAlert />} color="var(--orange)" foot={<span>{pesosCortos(porEmitir.reduce((s, x) => s + x.c.subtotal, 0))} sin IVA</span>} onClick={() => nav("/facturacion?tab=lote")} />
        <Kpi label="Concentración top 3" value={totalAnio ? pct(top3 / totalAnio, 0) : "—"} icon={<Receipt />} color="var(--purple)" foot={<span>{porCliente.slice(0, 3).map((x) => x.name).join(", ")}</span>} />
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Facturado vs. programado" sub="¿Cumplimos lo proyectado?">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ left: 0, right: 4, top: 8 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="programado" name="Programado" fill="var(--fill-3)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="facturado" name="Facturado" fill="var(--teal)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Programado", color: "var(--fill-3)" }, { label: "Facturado (emitido)", color: "var(--teal)" }]} />
        </Card>
        <Card title="Facturación por tipo" sub="¿Qué tanto dependemos del fee?">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                {(Object.keys(COLORES_TIPO) as Factura["tipo"][]).map((t, i, arr) => <Bar key={t} dataKey={t} name={TIPOS_LABEL[t]} stackId="a" fill={COLORES_TIPO[t]} radius={i === arr.length - 1 ? [6, 6, 0, 0] : undefined} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={(Object.keys(COLORES_TIPO) as Factura["tipo"][]).map((t) => ({ label: TIPOS_LABEL[t], color: COLORES_TIPO[t] }))} />
        </Card>
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Top 10 clientes" sub={`¿Quién pesa más? · ${anio}`}>
          <BarList data={porCliente.slice(0, 10)} color="var(--indigo)" format={(n) => pesosCortos(n).replace("$ ", "")} />
        </Card>
        <Card title="Concentración" sub="¿Qué tan expuestos estamos?">
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={[{ name: "Top 3", value: top3 }, { name: "Resto", value: totalAnio - top3 }]} dataKey="value" innerRadius={52} outerRadius={78} paddingAngle={3} cornerRadius={6} stroke="none">
                  <Cell fill="var(--purple)" /><Cell fill="var(--fill-3)" />
                </Pie>
                <Tooltip content={<ChartTip money />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="footnote" style={{ textAlign: "center" }}>Top 3: <b>{totalAnio ? pct(top3 / totalAnio, 0) : "—"}</b> de la facturación del año</div>
        </Card>
        <Card title="Ingreso fijo asegurado" sub={`¿Cuánto tenemos firmado? · 6 m ${pesosCortos(asegurado.slice(0, 6).reduce((s, a) => s + a.valor, 0))} · 12 m ${pesosCortos(asegurado.reduce((s, a) => s + a.valor, 0))}`}>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <BarChart data={asegurado} margin={{ left: 0, right: 4, top: 8 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} interval={1} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="valor" name="Fee contratado" fill="var(--green)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          {sinDuracion > 0 && <div className="caption" style={{ color: "var(--orange)" }}>{sinDuracion} contratos sin duración definida: se proyectan solo hasta diciembre.</div>}
        </Card>
      </div>
      <Card title="Contratos que vencen por mes" sub="¿Qué ingreso se puede caer?" style={{ marginTop: 16 }}>
        {vencen.length === 0 ? <div className="footnote">Ningún contrato con fecha de fin en los próximos 12 meses. {sinDuracion > 0 && `Define la duración de ${sinDuracion} contratos para ver el valor en riesgo.`}</div> : (
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={vencenPorMes} margin={{ left: 0, right: 4, top: 8 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} />
                <Bar dataKey="valor" name="Valor mensual en riesgo" fill="var(--red)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      {porEmitir.length > 0 && (
        <Card title="Facturas por emitir" sub="Ciclo en curso" style={{ marginTop: 16 }}>
          {porEmitir.slice(0, 8).map((x) => (
            <div key={x.f.id} className="alert-row" onClick={() => onAbrir(x.f.id)}>
              <div className="grow"><b>{x.cli?.nombreComercial}</b>{x.f.proyecto && ` · ${x.f.proyecto}`}<div className="caption">{x.f.descripcion}</div></div>
              <span className="num">{pesos(x.c.subtotal)}</span>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}

function Lista({ onAbrir }: { onAbrir: (id: string) => void }) {
  const db = useDB();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [tipo, setTipo] = useState("");
  const [mes, setMes] = useState("");
  const [conIva, setConIva] = useState(false);
  const fs = facturasCalc(db).filter((x) =>
    (!q || (x.cli && coincide(x.cli, q)) || (x.f.numero ?? "").includes(q.toUpperCase()) || x.f.descripcion.toLowerCase().includes(q.toLowerCase())) &&
    (!estado || (estado === "DATO INCOMPLETO" ? x.f.datoIncompleto : x.f.estado === estado)) && (!tipo || x.f.tipo === tipo) && (!mes || mesCausado(x.f) === mes),
  ).sort((a, b) => (b.f.emision ?? b.f.fechaProgramada).localeCompare(a.f.emision ?? a.f.fechaProgramada));
  const exportar = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fs.map(({ f, c, cli }) => ({
      CÓDIGO: cli?.id, CLIENTE: cli?.nombreComercial, PROYECTO: f.proyecto, TIPO: f.tipo, "N.º FACTURA": f.numero ?? "", DESCRIPCIÓN: f.descripcion, EMISIÓN: fecha(f.emision), VENCIMIENTO: fecha(f.vencimiento),
      "SUBTOTAL SIN IVA": Math.round(c.subtotal), IVA: Math.round(c.iva), "TOTAL CON IVA": Math.round(c.total), RETENCIONES: Math.round(c.retenciones), "NETO ESPERADO": Math.round(c.netoEsperado), SALDO: Math.round(c.saldo), ESTADO: f.estado, "DATO INCOMPLETO": f.datoIncompleto ? "SÍ" : "",
    }))), "FACTURAS");
    XLSX.writeFile(wb, `FACTURAS_${hoy()}.xlsx`);
  };
  const total = fs.reduce((s, x) => s + (conIva ? x.c.total : x.c.subtotal), 0);
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <div className="search grow" style={{ maxWidth: 340 }}><Search /><input placeholder="Cliente, alias, NIT, número o descripción" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="select" style={{ width: 180 }} value={estado} onChange={(e) => setEstado(e.target.value)}><option value="">Todo estado</option>{["PROGRAMADA", "EMITIDA", "ABONADA", "PAGADA", "EN PAUSA", "ANULADA", "DATO INCOMPLETO"].map((x) => <option key={x}>{x}</option>)}</select>
        <select className="select" style={{ width: 160 }} value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todo tipo</option>{["FIJA", "ADICIONAL", "ONE SHOT", "PAUTA"].map((x) => <option key={x}>{x}</option>)}</select>
        <input type="month" className="input" style={{ width: 170 }} value={mes} onChange={(e) => setMes(e.target.value)} />
        <Seg value={conIva ? "con" : "sin"} onChange={(v) => setConIva(v === "con")} options={[{ value: "sin", label: "Sin IVA" }, { value: "con", label: "Con IVA" }]} />
        <button className="btn glass-btn right" onClick={exportar}><Download />Excel</button>
      </div>
      <div className="footnote" style={{ marginBottom: 8 }}>{fs.length} facturas · {pesos(total)} {conIva ? "con" : "sin"} IVA</div>
      <div className="table-wrap" style={{ maxHeight: "68vh" }}>
        <table className="t">
          <thead><tr><th>N.º</th><th>Cliente</th><th>Tipo</th><th>Descripción</th><th>Emisión</th><th>Vence</th><th className="r">{conIva ? "Con IVA" : "Sin IVA"}</th><th className="r">Neto esperado</th><th className="r">Saldo</th><th>Estado</th></tr></thead>
          <tbody>
            {fs.map(({ f, c, cli }) => (
              <tr key={f.id} className="click" onClick={() => onAbrir(f.id)}>
                <td className="mono">{f.numero ?? "—"}</td>
                <td><b style={{ fontWeight: 600 }}>{cli?.nombreComercial}</b>{f.proyecto && <div className="caption">{f.proyecto}</div>}</td>
                <td>{f.tipo}</td>
                <td style={{ whiteSpace: "normal", minWidth: 240 }} className="footnote">{f.descripcion}</td>
                <td className="num">{fecha(f.emision ?? f.fechaProgramada)}</td>
                <td className="num">{fecha(f.vencimiento)}</td>
                <td className="r">{pesos(conIva ? c.total : c.subtotal)}</td>
                <td className="r">{pesos(c.netoEsperado)}</td>
                <td className="r">{c.saldo ? pesos(c.saldo) : "—"}</td>
                <td><EstadoFactura f={f} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Calendario({ onAbrir }: { onAbrir: (id: string) => void }) {
  const db = useDB();
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const fs = facturasCalc(db).filter((x) => x.f.estado !== "ANULADA" && (x.f.fechaProgramada.slice(0, 7) === mes || (x.f.emision ?? "").slice(0, 7) === mes));
  const ciclo = (c: 1 | 15) => fs.filter((x) => Number((x.f.emision ?? x.f.fechaProgramada).slice(8, 10)) < 15 === (c === 1));
  const a = mesAnterior(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)));
  const s = mesSiguiente(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)));
  const conteo = (est: string) => fs.filter((x) => x.f.estado === est).length;
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <button className="btn glass-btn icon" onClick={() => setMes(mesId(a.anio, a.mes))}><ChevronLeft /></button>
        <div className="headline" style={{ fontSize: 24, minWidth: 210, textAlign: "center" }}>{MESES[Number(mes.slice(5, 7)) - 1]} {mes.slice(0, 4)}</div>
        <button className="btn glass-btn icon" onClick={() => setMes(mesId(s.anio, s.mes))}><ChevronRight /></button>
        <div className="row right" style={{ gap: 6 }}>{["PROGRAMADA", "EMITIDA", "PAGADA", "EN PAUSA"].map((e) => <Badge key={e} color={ESTADO_COLOR[e]} dot>{conteo(e)} {e.toLowerCase()}</Badge>)}</div>
      </div>
      <div className="grid g2">
        {([1, 15] as const).map((c) => (
          <Card key={c} title={c === 1 ? "Ciclo 1 · día 1" : "Ciclo 2 · día 15"} sub={`${ciclo(c).length} facturas · ${pesos(ciclo(c).reduce((t, x) => t + x.c.subtotal, 0))} sin IVA`}>
            <div className="stack" style={{ gap: 6 }}>
              {ciclo(c).map((x) => (
                <div key={x.f.id} className="alert-row" style={{ padding: "8px 10px" }} onClick={() => onAbrir(x.f.id)}>
                  <span style={{ width: 8, height: 36, borderRadius: 4, background: `var(--${ESTADO_COLOR[x.f.estado] === "gray" ? "gray" : ESTADO_COLOR[x.f.estado]})`, flex: "none" }} />
                  <div className="grow" style={{ minWidth: 0 }}><b style={{ fontWeight: 600 }}>{x.cli?.nombreComercial}</b>{x.f.proyecto && <span className="caption"> · {x.f.proyecto}</span>}<div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.f.tipo} · {x.f.descripcion}</div></div>
                  <div style={{ textAlign: "right" }}><div className="num">{pesos(x.c.subtotal)}</div><EstadoFactura f={x.f} /></div>
                </div>
              ))}
              {!ciclo(c).length && <div className="footnote">Sin facturas en este ciclo.</div>}
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

function Lote() {
  const db = useDB();
  const toast = useToast();
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const [ciclo, setCiclo] = useState<"1" | "15">(Number(hoy().slice(8, 10)) >= 15 ? "15" : "1");
  const [nums, setNums] = useState<Record<string, string>>({});
  const [emision, setEmision] = useState(hoy());
  const fs = facturasCalc(db).filter((x) => x.f.estado === "PROGRAMADA" && x.f.fechaProgramada.slice(0, 7) === mes && (Number(x.f.fechaProgramada.slice(8, 10)) >= 15) === (ciclo === "15"));
  const listos = fs.filter((x) => nums[x.f.id]?.trim());
  const repetidos = (id: string) => {
    const n = normalizarNumero(nums[id] ?? "");
    return !!n && (db.facturas.some((f) => f.numero === n) || Object.entries(nums).some(([k, v]) => k !== id && normalizarNumero(v) === n));
  };
  const faltaOC = (x: (typeof fs)[number]) => !!x.cli?.requiereOC && !x.f.oc;
  const emitirLote = () => {
    try {
      emitir(listos.map((x) => ({ id: x.f.id, numero: nums[x.f.id], emision, vencimiento: x.f.vencimiento && x.f.vencimiento >= emision ? x.f.vencimiento : iso(new Date(Date.parse(emision) + (x.cli?.plazoPago ?? 30) * 86_400_000)) })));
      toast(<><b>{listos.length}</b> facturas emitidas · entran a cartera</>);
      setNums({});
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <input type="month" className="input" style={{ width: 170 }} value={mes} onChange={(e) => setMes(e.target.value)} />
        <Seg value={ciclo} onChange={setCiclo} options={[{ value: "1", label: "Ciclo 1 (día 1)" }, { value: "15", label: "Ciclo 2 (día 15)" }]} />
        <Field label=""><input type="date" className="input" value={emision} onChange={(e) => setEmision(e.target.value)} title="Fecha de emisión del lote" /></Field>
        <button className="btn primary right" disabled={!listos.length || listos.some((x) => repetidos(x.f.id) || faltaOC(x))} onClick={emitirLote}><Check />Emitir {listos.length || ""} facturas</button>
      </div>
      {!fs.length ? <Empty icon={<Receipt />} title="Nada por emitir en este ciclo" text="Las facturas programadas de los contratos aparecen aquí al iniciar cada ciclo." /> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Cliente</th><th>Descripción</th><th>O.C.</th><th className="r">Sin IVA</th><th className="r">Con IVA</th><th>N.º de factura</th></tr></thead>
            <tbody>
              {fs.map((x) => (
                <tr key={x.f.id}>
                  <td><b style={{ fontWeight: 600 }}>{x.cli?.nombreComercial}</b>{x.f.proyecto && <div className="caption">{x.f.proyecto}</div>}</td>
                  <td className="footnote" style={{ whiteSpace: "normal", minWidth: 240 }}>{x.f.descripcion}</td>
                  <td>{x.f.oc || (x.cli?.requiereOC ? <Badge color="red">Falta O.C.</Badge> : "—")}</td>
                  <td className="r">{pesos(x.c.subtotal)}</td><td className="r">{pesos(x.c.total)}</td>
                  <td><input className={`input sm mono ${repetidos(x.f.id) ? "invalid" : ""}`} style={{ width: 140 }} placeholder="FV…" value={nums[x.f.id] ?? ""} onChange={(e) => setNums({ ...nums, [x.f.id]: e.target.value })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Notas({ onAbrir }: { onAbrir: (id: string) => void }) {
  const db = useDB();
  const sesion = useSesion();
  const toast = useToast();
  const [resolver, setResolver] = useState<{ id: string; aprobar: boolean } | null>(null);
  const [numero, setNumero] = useState("");
  const [comentario, setComentario] = useState("");
  const puede = sesion.rol === "CONTADORA" || sesion.rol === "ADMINISTRADOR";
  if (!db.notasCredito.length) return <Empty icon={<Receipt />} title="Sin notas crédito" text="COORDINACIÓN solicita la nota crédito desde la factura; la CONTADORA la aprueba con su número." />;
  return (
    <>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Solicitada</th><th>Factura</th><th>Cliente</th><th>Motivo</th><th>Alcance</th><th className="r">Valor</th><th>N.º NC</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {db.notasCredito.map((n) => {
              const f = db.facturas.find((x) => x.id === n.facturaId);
              return (
                <tr key={n.id}>
                  <td className="num">{fechaHora(n.solicitadaEn)}<div className="caption">{n.solicitadaPor}</div></td>
                  <td className="mono click" onClick={() => f && onAbrir(f.id)}>{f?.numero ?? "—"}</td>
                  <td>{f ? nombreCliente(db, f.clienteId) : "—"}</td>
                  <td>{n.motivo}<div className="caption">{n.detalle}</div></td>
                  <td>{n.alcance}</td><td className="r">{pesos(n.valor)}</td><td className="mono">{n.numero ?? "—"}</td>
                  <td><Badge color={ESTADO_COLOR[n.estado]} dot>{n.estado}</Badge>{n.comentario && <div className="caption">{n.comentario}</div>}</td>
                  <td>{n.estado === "SOLICITADA" && puede && <div className="row" style={{ gap: 6 }}><button className="btn sm success" onClick={() => setResolver({ id: n.id, aprobar: true })}>Aprobar</button><button className="btn sm danger" onClick={() => setResolver({ id: n.id, aprobar: false })}>Rechazar</button></div>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!puede && <div className="caption" style={{ marginTop: 8 }}>Solo la CONTADORA (o el ADMINISTRADOR) aprueba notas crédito.</div>}
      <Modal open={!!resolver} onClose={() => setResolver(null)} size="narrow" title={resolver?.aprobar ? "Aprobar nota crédito" : "Rechazar nota crédito"}
        footer={<><button className="btn" onClick={() => setResolver(null)}>Cancelar</button><button className={`btn primary ${resolver?.aprobar ? "" : "danger"}`} disabled={resolver?.aprobar ? !numero.trim() : !comentario.trim()} onClick={() => {
          try { resolverNC(resolver!.id, resolver!.aprobar, numero, comentario); toast(resolver!.aprobar ? "Nota crédito aprobada · factura ajustada en todos los módulos" : "Nota crédito rechazada"); setResolver(null); setNumero(""); setComentario(""); } catch (e) { toast((e as Error).message, "error"); }
        }}>Confirmar</button></>}>
        <div className="stack">
          {resolver?.aprobar && <Field label="Número de la nota crédito" required hint="Obligatorio y único"><input className="input mono" value={numero} onChange={(e) => setNumero(e.target.value)} /></Field>}
          <Field label="Comentario" required={!resolver?.aprobar}><textarea className="textarea" value={comentario} onChange={(e) => setComentario(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}

// ---------------- Migración: facturas sin número + importador con conciliación ----------------

function Migracion({ onAbrir }: { onAbrir: (id: string) => void }) {
  const db = useDB();
  const toast = useToast();
  const [nums, setNums] = useState<Record<string, string>>({});
  const [importar, setImportar] = useState(false);
  const incompletas = facturasCalc(db).filter((x) => x.f.datoIncompleto && x.f.estado !== "ANULADA").sort((a, b) => (a.f.emision ?? "").localeCompare(b.f.emision ?? ""));
  const guardar = (id: string) => {
    const f = db.facturas.find((x) => x.id === id)!;
    try { emitir([{ id, numero: nums[id], emision: f.emision ?? hoy(), vencimiento: f.vencimiento ?? f.emision ?? hoy() }]); toast("Número registrado"); setNums({ ...nums, [id]: "" }); } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label="Facturas sin número" value={incompletas.length} icon={<TriangleAlert />} color="var(--orange)" foot={<span>alerta cada 2 días hábiles hasta completar</span>} />
        <Kpi label="Valor sin número" value={pesosCortos(incompletas.reduce((s, x) => s + x.c.subtotal, 0))} icon={<Receipt />} color="var(--blue)" foot={<span>sí cuentan en reportes</span>} />
        <Kpi label="Clientes" value={db.clientes.length} icon={<FileSpreadsheet />} color="var(--indigo)" foot={<button className="btn sm" onClick={() => setImportar(true)}><Upload size={14} />Importar Excel</button>} />
      </div>
      {db.notasMigracion.length > 0 && (
        <Card title="Notas de la migración (septiembre y octubre 2026)" style={{ marginBottom: 16 }}>
          <div className="stack" style={{ gap: 6 }}>{db.notasMigracion.map((n) => <div key={n} className="footnote">• {n}</div>)}</div>
        </Card>
      )}
      {!incompletas.length ? <Empty icon={<Check />} title="Todas las facturas tienen número" /> : (
        <div className="table-wrap" style={{ maxHeight: "60vh" }}>
          <table className="t">
            <thead><tr><th>Cliente</th><th>Concepto</th><th>Emisión</th><th className="r">Sin IVA</th><th>Estado</th><th>Link anterior</th><th>Registrar número</th></tr></thead>
            <tbody>
              {incompletas.map((x) => (
                <tr key={x.f.id}>
                  <td className="click" onClick={() => onAbrir(x.f.id)}><b style={{ fontWeight: 600 }}>{x.cli?.nombreComercial}</b><div className="caption">{x.cli?.id}</div></td>
                  <td className="footnote" style={{ whiteSpace: "normal", minWidth: 240 }}>{x.f.descripcion}</td>
                  <td className="num">{fecha(x.f.emision)}</td>
                  <td className="r">{pesos(x.c.subtotal)}</td>
                  <td><Badge color={ESTADO_COLOR[x.f.estado]} dot>{x.f.estado}</Badge></td>
                  <td>{x.f.link ? <a href={x.f.link} target="_blank" rel="noreferrer">Ver</a> : "—"}</td>
                  <td><div className="row" style={{ gap: 6 }}><input className="input sm mono" style={{ width: 120 }} placeholder="FV…" value={nums[x.f.id] ?? ""} onChange={(e) => setNums({ ...nums, [x.f.id]: e.target.value })} /><button className="btn sm" disabled={!nums[x.f.id]?.trim()} onClick={() => guardar(x.f.id)}>Guardar</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Importador open={importar} onClose={() => setImportar(false)} />
    </>
  );
}

interface FilaImp { fila: number; nombre: string; tipo: string; concepto: string; valor: number; numero: string; emision: string; vencimiento: string; estado: string; recibido: number; fechaPago: string; clienteId: string; nivel: "EXACTA" | "PROBABLE" | "NINGUNA"; }

function Importador({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const ref = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<FilaImp[]>([]);
  const toISO = (v: unknown) => (v instanceof Date ? iso(new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))) : typeof v === "string" && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v) ? v.split("/").reverse().map((p) => p.padStart(2, "0")).join("-") : "");
  const leer = async (file: File) => {
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const hoja = wb.SheetNames.find((n) => n.toUpperCase().includes("FACTURA")) ?? wb.SheetNames[0];
    const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1, raw: true, defval: "" });
    const h = m.findIndex((r) => r.some((c) => String(c).toUpperCase().includes("CONCEPTO")));
    if (h < 0) { toast("No encontramos la fila de encabezados (CLIENTE, TIPO, CONCEPTO, VALOR…)", "error"); return; }
    const head = m[h].map((x) => String(x).toUpperCase().trim());
    const col = (k: string) => head.findIndex((x) => x.includes(k));
    const out: FilaImp[] = [];
    m.slice(h + 1).forEach((r, i) => {
      const nombre = String(r[col("CLIENTE")] ?? "").trim();
      if (!nombre) return;
      const conc = conciliar(nombre, db.clientes);
      out.push({
        fila: h + i + 2, nombre, tipo: String(r[col("TIPO")] ?? ""), concepto: String(r[col("CONCEPTO")] ?? ""), valor: Number(r[col("VALOR (ANTES")] ?? r[col("VALOR")] ?? 0) || 0,
        numero: String(r[col("FACTURA")] ?? "").trim(), emision: toISO(r[col("EMISIÓN")]), vencimiento: toISO(r[col("LÍMITE")]), estado: String(r[col("ESTADO")] ?? ""),
        recibido: Number(r[col("RECIBIDO")] ?? 0) || 0, fechaPago: toISO(r[col("FECHA DE PAGO")]), clienteId: conc.cliente?.id ?? "", nivel: conc.nivel,
      });
    });
    setFilas(out);
  };
  const listas = filas.filter((f) => f.clienteId && f.valor > 0);
  const importarFilas = () => {
    let n = 0;
    for (const r of listas) {
      const estado = /pagad/i.test(r.estado) ? "PAGADA" : /parcial/i.test(r.estado) ? "ABONADA" : /pausa/i.test(r.estado) ? "EN PAUSA" : /por facturar/i.test(r.estado) ? "PROGRAMADA" : "EMITIDA";
      const tipo = /pauta/i.test(r.tipo) ? "PAUTA" : /fij/i.test(r.tipo) ? "FIJA" : db.contratos.some((c) => c.clienteId === r.clienteId) ? "ADICIONAL" : "ONE SHOT";
      try {
        guardarFactura({
          numero: r.numero || null, datoIncompleto: !r.numero && estado !== "PROGRAMADA" && estado !== "EN PAUSA", tipo, clienteId: r.clienteId, proyecto: "", contratoId: null,
          items: [{ servicio: tipo === "PAUTA" ? "Pauta con incremento" : "Estrategia por proyecto / lanzamiento", cantidad: 1, valor: tipo === "PAUTA" ? 0 : r.valor }],
          pauta: tipo === "PAUTA" ? { base: r.valor / 1.08, pct: 0.08, fechaEjecucion: "" } : null, periodo: (r.emision || hoy()).slice(0, 7), periodoTexto: "", descripcion: r.concepto,
          observaciones: `Importado (fila ${r.fila})`, estado, fechaProgramada: r.emision || hoy(), emision: estado === "PROGRAMADA" ? null : r.emision || null, vencimiento: r.vencimiento || null, oc: "", link: "",
          abonos: estado === "ABONADA" ? [{ id: `imp${r.fila}`, fecha: r.fechaPago || null, valor: r.recibido, banco: "", nota: "Importado" }] : [],
          pago: estado === "PAGADA" ? { fecha: r.fechaPago || null, valorRecibido: r.recibido, banco: "", diferencia: "", retencionesReales: Math.max(0, r.valor * 1.19 - r.recibido) } : null,
          ajusteNC: 0, reemiteA: null, fechaPagoComprometida: null, envios: [],
        });
        n++;
      } catch (e) { toast(`Fila ${r.fila}: ${(e as Error).message}`, "error"); }
    }
    toast(<><b>{n}</b> facturas importadas · {filas.length - n} sin código de cliente no se importaron</>);
    setFilas([]);
    onClose();
  };
  const crearRapido = (r: FilaImp) => {
    const id = guardarCliente({ nombreComercial: r.nombre.toUpperCase(), razonSocial: "", nit: "", dv: "", alias: [r.nombre.toUpperCase()], correosFacturacion: [], correoCartera: "", contacto: { nombre: "", cargo: "", celular: "" }, representanteLegal: "", direccion: "", perfil: { granContribuyente: false, autorretenedor: false, agenteReteIcaBogota: false, regimenSimple: false, entidadPublica: false }, requiereOC: false, ciclo: 1, plazoPago: 30, estado: "ACTIVO", proyectos: [], rutCargado: false, certificadoRetencion: {}, confirmadoCorreoCobro: false });
    setFilas(filas.map((x) => (normTexto(x.nombre) === normTexto(r.nombre) ? { ...x, clienteId: id, nivel: "EXACTA" } : x)));
  };
  return (
    <Modal open={open} onClose={onClose} title="Importar facturas con conciliación" size="wide"
      footer={filas.length ? <><button className="btn" onClick={() => setFilas([])}><X />Otro archivo</button><button className="btn primary" disabled={!listas.length} onClick={importarFilas}>Importar {listas.length}</button></> : undefined}>
      {!filas.length ? (
        <Empty icon={<FileSpreadsheet />} title="Cruza cada fila contra la BBDD de clientes" text="Usa el formato de la hoja BBDD FACTURACIÓN (MES, CLIENTE, TIPO, CONCEPTO, VALOR, N.º FACTURA, FECHA EMISIÓN, FECHA LÍMITE, ESTADO, VALOR RECIBIDO, FECHA DE PAGO). Verde: coincidencia exacta · amarillo: probable, confirma · rojo: asigna o crea. Nada se importa sin código de cliente."
          action={<><button className="btn primary" onClick={() => ref.current?.click()}><Upload />Elegir archivo</button><input ref={ref} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} /></>} />
      ) : (
        <div className="table-wrap" style={{ maxHeight: "60vh" }}>
          <table className="t">
            <thead><tr><th>Fila</th><th>Nombre en el Excel</th><th>Conciliación</th><th>Cliente asignado</th><th>Concepto</th><th className="r">Valor</th><th>Estado</th></tr></thead>
            <tbody>
              {filas.map((r, i) => (
                <tr key={i}>
                  <td>{r.fila}</td><td>{r.nombre}</td>
                  <td><Badge color={r.nivel === "EXACTA" ? "green" : r.nivel === "PROBABLE" ? "yellow" : "red"} dot>{r.nivel === "EXACTA" ? "Exacta" : r.nivel === "PROBABLE" ? "Probable" : "Sin coincidencia"}</Badge></td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <select className="select sm" style={{ width: 210 }} value={r.clienteId} onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, clienteId: e.target.value, nivel: e.target.value ? "EXACTA" : "NINGUNA" } : x)))}>
                        <option value="">Asignar…</option>{db.clientes.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.nombreComercial}</option>)}
                      </select>
                      {!r.clienteId && <button className="btn sm" onClick={() => crearRapido(r)}>Crear</button>}
                    </div>
                  </td>
                  <td className="footnote" style={{ whiteSpace: "normal", minWidth: 200 }}>{r.concepto}</td>
                  <td className="r">{pesos(r.valor)}</td><td>{r.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

const normTexto = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

