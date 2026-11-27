import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BadgeDollarSign, Download, Percent, Receipt, Ticket } from "lucide-react";
import * as XLSX from "xlsx";
import { useDB } from "../../data/store";
import { guardarCliente } from "../../data/storeFin";
import { facturasCalc, mesCaja, TIPOS_LABEL } from "../../data/selectorsFin";
import { diffDias, hoy, mesId, MESES_CORTOS } from "../../domain/fechas";
import type { Factura } from "../../domain/facturacion";
import { fecha, pesos, pesosCortos } from "../../lib/format";
import { BarList, Card, ChartTip, Empty, Kpi, Legend, Switch } from "../../components/ui";
import { FacturaSheet } from "../facturacion/comun";

const ax = (n: number) => pesosCortos(n).replace("$ ", "");
const COLOR: Record<Factura["tipo"], string> = { FIJA: "#30C759", ADICIONAL: "#0A7AFF", "ONE SHOT": "#AF52DE", PAUTA: "#FF9500" };

export default function Ingresos() {
  const db = useDB();
  const [abierta, setAbierta] = useState<string | null>(null);
  const anio = Number(hoy().slice(0, 4));
  const meses = Array.from({ length: 12 }, (_, i) => mesId(anio, i + 1));
  const pagadas = facturasCalc(db).filter((x) => x.f.estado === "PAGADA").sort((a, b) => (b.f.pago?.fecha ?? "").localeCompare(a.f.pago?.fecha ?? ""));
  const delAnio = pagadas.filter((x) => mesCaja(x.f).startsWith(String(anio)));
  const porMes = meses.map((m) => {
    const r: Record<string, number | string> = { mes: m, label: MESES_CORTOS[Number(m.slice(5, 7)) - 1], reteFuente: 0, reteIva: 0, reteIca: 0, reales: 0 };
    for (const t of Object.keys(COLOR)) r[t] = 0;
    for (const x of pagadas.filter((p) => mesCaja(p.f) === m)) {
      (r[x.f.tipo] as number) += x.c.ingresoPropio;
      (r.reteFuente as number) += x.c.reteFuente; (r.reteIva as number) += x.c.reteIva; (r.reteIca as number) += x.c.reteIca;
      (r.reales as number) += x.f.pago?.retencionesReales ?? 0;
    }
    return r;
  });
  const propio = delAnio.reduce((s, x) => s + x.c.ingresoPropio, 0);
  const fuera = delAnio.reduce((s, x) => s + x.c.reembolsoPauta + x.c.terceros, 0);
  const estimadas = delAnio.reduce((s, x) => s + x.c.reteFuente + x.c.reteIva + x.c.reteIca, 0);
  const reales = delAnio.reduce((s, x) => s + (x.f.pago?.retencionesReales ?? 0), 0);
  const porCliente = useMemo(() => {
    const m = new Map<string, { name: string; total: number; adicional: number; meses: Set<string>; porMes: Record<string, number> }>();
    for (const x of delAnio) {
      const e = m.get(x.f.clienteId) ?? { name: x.cli?.nombreComercial ?? "—", total: 0, adicional: 0, meses: new Set<string>(), porMes: {} };
      e.total += x.c.ingresoPropio;
      if (x.f.tipo !== "FIJA") e.adicional += x.c.ingresoPropio;
      const mm = mesCaja(x.f);
      e.meses.add(mm);
      e.porMes[mm] = (e.porMes[mm] ?? 0) + x.c.ingresoPropio;
      m.set(x.f.clienteId, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [delAnio]);
  const maxCelda = Math.max(1, ...porCliente.flatMap((c) => Object.values(c.porMes)));
  const exportarContadora = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(delAnio.map(({ f, c, cli }) => ({
      CÓDIGO: cli?.id, CLIENTE: cli?.razonSocial || cli?.nombreComercial, NIT: cli?.nit ? `${cli.nit}-${cli.dv}` : "", "N.º FACTURA": f.numero ?? "", "FECHA PAGO": fecha(f.pago?.fecha),
      "BASE SIN IVA": Math.round(c.subtotal), IVA: Math.round(c.iva), "RETEFUENTE EST.": Math.round(c.reteFuente), "RETEIVA EST.": Math.round(c.reteIva), "RETEICA EST.": Math.round(c.reteIca),
      "RETENCIONES REALES": Math.round(f.pago?.retencionesReales ?? 0), "NETO RECIBIDO": Math.round(f.pago?.valorRecibido ?? 0),
    }))), "RETENCIONES");
    XLSX.writeFile(wb, `RETENCIONES_${anio}.xlsx`);
  };
  const anioStr = String(anio);
  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Ingresos</h1>
          <p className="subtitle" style={{ margin: 0 }}>Solo facturas PAGADAS (verificadas en banco). Reembolsos de pauta y recursos de terceros se reportan aparte.</p>
        </div>
        <button className="btn glass-btn" onClick={exportarContadora}><Download />Reporte para la contadora</button>
      </div>
      <div className="grid g4">
        <Kpi label={`Ingreso propio ${anio}`} value={pesosCortos(propio)} icon={<BadgeDollarSign />} color="var(--green)" foot={<span>{delAnio.length} facturas pagadas</span>} />
        <Kpi label="Fuera de ingresos" value={pesosCortos(fuera)} icon={<Receipt />} color="var(--gray)" foot={<span>reembolsos de pauta y terceros</span>} />
        <Kpi label="Retenciones (reales)" value={pesosCortos(reales)} icon={<Percent />} color="var(--orange)" foot={<span>estimadas {pesosCortos(estimadas)}</span>} />
        <Kpi label="Ticket promedio mensual" value={pesosCortos(porCliente.length ? porCliente.reduce((s, c) => s + c.total / Math.max(1, c.meses.size), 0) / porCliente.length : 0)} icon={<Ticket />} color="var(--blue)" foot={<span>por cliente</span>} />
      </div>
      {!pagadas.length ? <div style={{ marginTop: 16 }}><Empty icon={<BadgeDollarSign />} title="Aún no hay ingresos" text="Marca facturas como pagadas en Cartera después de verificarlas en el banco." /></div> : (
        <>
          <div className="grid g2" style={{ marginTop: 16 }}>
            <Card title="Ingresos por categoría" sub="Por mes de pago">
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={porMes} margin={{ left: 0, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                    <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                    {(Object.keys(COLOR) as Factura["tipo"][]).map((t, i, a) => <Bar key={t} dataKey={t} name={t === "FIJA" ? "Servicios mensuales" : TIPOS_LABEL[t]} stackId="a" fill={COLOR[t]} radius={i === a.length - 1 ? [6, 6, 0, 0] : undefined} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legend items={(Object.keys(COLOR) as Factura["tipo"][]).map((t) => ({ label: t === "FIJA" ? "Servicios mensuales" : TIPOS_LABEL[t], color: COLOR[t] }))} />
            </Card>
            <Card title="Retenciones acumuladas" sub="Estimadas por tipo vs. reales practicadas">
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <BarChart data={porMes} margin={{ left: 0, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                    <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                    <Bar dataKey="reteFuente" name="ReteFuente" stackId="e" fill="#5856D6" />
                    <Bar dataKey="reteIva" name="ReteIVA" stackId="e" fill="#AF52DE" />
                    <Bar dataKey="reteIca" name="ReteICA" stackId="e" fill="#FF2D55" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="reales" name="Reales" fill="var(--orange)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legend items={[{ label: "ReteFuente", color: "#5856D6" }, { label: "ReteIVA", color: "#AF52DE" }, { label: "ReteICA", color: "#FF2D55" }, { label: "Reales (diferencia recibida)", color: "var(--orange)" }]} />
            </Card>
          </div>
          <div className="grid g3" style={{ marginTop: 16 }}>
            <Card title="Ingresos adicionales por cliente" sub="¿A quién le vendemos más allá del fee?">
              <BarList data={porCliente.filter((c) => c.adicional).map((c) => ({ name: c.name, value: c.adicional }))} color="var(--blue)" format={(n) => pesosCortos(n).replace("$ ", "")} />
            </Card>
            <Card title="Ingresos por cliente y mes" sub="Mapa de calor" className="span2">
              <div className="table-wrap" style={{ boxShadow: "none" }}>
                <table className="t">
                  <thead><tr><th>Cliente</th>{meses.map((m) => <th key={m} className="r">{MESES_CORTOS[Number(m.slice(5, 7)) - 1]}</th>)}<th className="r">Total</th></tr></thead>
                  <tbody>
                    {porCliente.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        {meses.map((m) => <td key={m} className="r" style={{ background: c.porMes[m] ? `color-mix(in srgb, var(--green) ${Math.round((c.porMes[m] / maxCelda) * 60) + 8}%, transparent)` : undefined }}>{c.porMes[m] ? ax(c.porMes[m]) : ""}</td>)}
                        <td className="r"><b>{ax(c.total)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <Card title="Comparativo año contra año" sub={`${anio - 1} vs ${anio}`} style={{ marginTop: 16 }}>
            <div className="footnote">El histórico del sistema empieza en septiembre de {anio}: el comparativo se activa cuando haya datos de {anio - 1} o del mismo mes del año anterior.</div>
          </Card>
          <div className="section-title">Certificados de retención {anioStr}</div>
          <div className="list">
            {db.clientes.filter((c) => c.estado !== "RETIRADO" && delAnio.some((x) => x.f.clienteId === c.id && x.f.pago?.retencionesReales)).map((c) => (
              <div className="list-row flat" key={c.id}><span className="grow">{c.nombreComercial} <span className="caption">{c.id}</span></span><span className="caption" style={{ marginRight: 8 }}>Certificado recibido</span><Switch on={!!c.certificadoRetencion[anioStr]} onChange={(v) => guardarCliente({ ...c, certificadoRetencion: { ...c.certificadoRetencion, [anioStr]: v } })} /></div>
            ))}
          </div>
          <div className="section-title">Pagos recibidos</div>
          <div className="table-wrap" style={{ maxHeight: 460 }}>
            <table className="t">
              <thead><tr><th>Fecha pago</th><th>Cliente</th><th>N.º</th><th>Categoría</th><th className="r">Base sin IVA</th><th className="r">IVA</th><th className="r">Ingreso propio</th><th className="r">Retenciones reales</th><th className="r">Neto recibido</th><th className="r">Días de retraso</th></tr></thead>
              <tbody>
                {pagadas.map(({ f, c, cli }) => (
                  <tr key={f.id} className="click" onClick={() => setAbierta(f.id)}>
                    <td className="num">{f.pago?.fecha ? fecha(f.pago.fecha) : <span className="caption">sin fecha</span>}</td>
                    <td>{cli?.nombreComercial}</td><td className="mono">{f.numero ?? "—"}</td><td>{f.tipo === "FIJA" ? "Mensual" : TIPOS_LABEL[f.tipo]}</td>
                    <td className="r">{pesos(c.subtotal)}</td><td className="r">{pesos(c.iva)}</td><td className="r"><b>{pesos(c.ingresoPropio)}</b></td>
                    <td className="r">{pesos(f.pago?.retencionesReales ?? 0)}</td><td className="r">{pesos(f.pago?.valorRecibido ?? 0)}</td>
                    <td className="r">{f.pago?.fecha && f.vencimiento ? Math.max(0, diffDias(f.vencimiento, f.pago.fecha)) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <FacturaSheet id={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}
