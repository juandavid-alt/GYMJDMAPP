import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlarmClock, BadgeCheck, CircleDollarSign, Clock, Search, TriangleAlert, Wallet } from "lucide-react";
import { useDB } from "../../data/store";
import { agingTotales, capitalPauta, cartera, comportamientoPago, dso, serieFacturacion, ultimos12 } from "../../data/selectorsFin";
import { coincide } from "../../domain/facturacion";
import { fecha, pesos, pesosCortos } from "../../lib/format";
import { Badge, BarList, Card, ChartTip, Empty, Kpi, Seg } from "../../components/ui";
import { EstadoFactura, FacturaSheet } from "../facturacion/comun";

const ax = (n: number) => pesosCortos(n).replace("$ ", "");
const NIVEL: Record<string, { color: string; label: string }> = {
  COBRO: { color: "yellow", label: "Cobro (10 días)" },
  "COBRO CLIENTE": { color: "orange", label: "Cobro + correo al cliente (3 días)" },
  URGENCIA: { color: "red", label: "Urgencia: vencida" },
};

export default function Cartera() {
  const db = useDB();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [vista, setVista] = useState<"tabla" | "verificar">("tabla");
  const [q, setQ] = useState("");
  const [rango, setRango] = useState("");
  const cs = cartera(db);
  const lista = cs.filter((x) => (!q || (x.cli && coincide(x.cli, q)) || (x.f.numero ?? "").includes(q.toUpperCase())) && (!rango || x.rango === rango));
  const total = cs.reduce((s, x) => s + x.c.saldo, 0);
  const vencida = cs.filter((x) => (x.dias ?? 0) < 0).reduce((s, x) => s + x.c.saldo, 0);
  const alertas = cs.filter((x) => x.nivel);
  const aging = agingTotales(db);
  const comp = comportamientoPago(db);
  const meses = ultimos12();
  const serie = useMemo(() => serieFacturacion(db, meses), [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const pauta = capitalPauta(db);
  const top5 = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of cs) if ((x.dias ?? 0) < 0) m.set(x.cli?.nombreComercial ?? "—", (m.get(x.cli?.nombreComercial ?? "—") ?? 0) + x.c.saldo);
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5);
  }, [cs]);

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Cartera</h1>
          <p className="subtitle" style={{ margin: 0 }}>Toda factura emitida con saldo pendiente. Alertas a 10 días, 3 días (con correo al cliente) y vencidas cada 5 días.</p>
        </div>
      </div>
      <div className="grid g4">
        <Kpi label="Cartera total" value={pesosCortos(total)} icon={<Wallet />} color="var(--blue)" foot={<span>{cs.length} facturas · neto esperado</span>} />
        <Kpi label="Vencida" value={pesosCortos(vencida)} icon={<TriangleAlert />} color="var(--red)" foot={<span>{cs.filter((x) => (x.dias ?? 0) < 0).length} facturas</span>} />
        <Kpi label="DSO" value={`${Math.round(dso(db))} días`} icon={<Clock />} color="var(--orange)" foot={<span>días promedio de cobro</span>} />
        <Kpi label="Alertas de cobro" value={alertas.length} icon={<AlarmClock />} color="var(--yellow)" foot={<span>{alertas.filter((a) => a.nivel === "URGENCIA").length} urgentes</span>} />
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Antigüedad de cartera" sub="Saldo por rango">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={aging} margin={{ left: 0, right: 4, top: 8 }}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="value" name="Saldo" radius={[8, 8, 0, 0]}>{aging.map((_, i) => <Cell key={i} fill={["#30C759", "#FFCC00", "#FF9500", "#FF6B35", "#FF3B30"][i]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Alertas de cobro" sub="Priorizadas" className="span2" style={{ padding: 12 }}>
          <div style={{ maxHeight: 230, overflow: "auto" }}>
            {!alertas.length && <div className="footnote" style={{ padding: 12 }}>Sin alertas de cobro.</div>}
            {alertas.map((x) => (
              <div key={x.f.id} className="alert-row" onClick={() => setAbierta(x.f.id)}>
                <span className="alert-dot" style={{ background: `var(--${NIVEL[x.nivel!].color})` }}><AlarmClock /></span>
                <div className="grow">
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{x.cli?.nombreComercial} · {x.f.numero ?? "sin número"} · {pesos(x.c.saldo)}</div>
                  <div className="caption">{NIVEL[x.nivel!].label} · {(x.dias ?? 0) < 0 ? `vencida hace ${-(x.dias ?? 0)} días${-(x.dias ?? 0) % 5 === 0 ? " · recordatorio hoy" : ""}` : `vence en ${x.dias} días`}{x.f.fechaPagoComprometida ? ` · compromiso ${fecha(x.f.fechaPagoComprometida)}` : ""}</div>
                </div>
                {x.nivel === "COBRO CLIENTE" && !x.f.envios.length && <Badge color="orange">Enviar correo</Badge>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="section-title">Cartera</div>
      <div className="row wrap" style={{ marginBottom: 12 }}>
        <Seg value={vista} onChange={setVista} options={[{ value: "tabla", label: "Detalle" }, { value: "verificar", label: "Facturas por verificar" }]} />
        <div className="search grow" style={{ maxWidth: 320 }}><Search /><input placeholder="Cliente, alias, NIT o número" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Seg value={rango} onChange={setRango} options={[{ value: "", label: "Todo" }, ...aging.map((a) => ({ value: a.name, label: a.name }))]} />
      </div>
      {!lista.length ? <Empty icon={<BadgeCheck />} title="Sin cartera pendiente" text="Las facturas emitidas con saldo aparecen aquí." /> : vista === "verificar" ? (
        <div className="list">
          {lista.map((x) => (
            <div key={x.f.id} className="list-row flat">
              <div className="grow"><b>{x.cli?.nombreComercial}</b> <span className="mono caption">{x.f.numero ?? "sin número"}</span><div className="caption">Vence {fecha(x.f.vencimiento)}</div></div>
              <b className="num" style={{ marginRight: 12 }}>{pesos(x.c.saldo)}</b>
              <button className="btn sm success" onClick={() => setAbierta(x.f.id)}><CircleDollarSign size={14} />Marcar pagada</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-wrap" style={{ maxHeight: "62vh" }}>
          <table className="t">
            <thead><tr><th>Cliente</th><th>N.º</th><th>Emisión</th><th>Vence</th><th className="r">Días</th><th className="r">Con IVA</th><th className="r">Retenciones</th><th className="r">Neto esperado</th><th className="r">Abonos</th><th className="r">Saldo</th><th>Compromiso</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.map((x) => (
                <tr key={x.f.id} className="click" onClick={() => setAbierta(x.f.id)}>
                  <td><b style={{ fontWeight: 600 }}>{x.cli?.nombreComercial}</b><div className="caption">{x.cli?.id}{x.f.proyecto ? ` · ${x.f.proyecto}` : ""}</div></td>
                  <td className="mono">{x.f.numero ?? "—"}</td>
                  <td className="num">{fecha(x.f.emision)}</td><td className="num">{fecha(x.f.vencimiento)}</td>
                  <td className="r"><Badge color={(x.dias ?? 0) < 0 ? "red" : (x.dias ?? 99) <= 3 ? "orange" : (x.dias ?? 99) <= 10 ? "yellow" : "green"}>{(x.dias ?? 0) < 0 ? `${-(x.dias ?? 0)} vencida` : `${x.dias} para vencer`}</Badge></td>
                  <td className="r">{pesos(x.c.total)}</td><td className="r">{pesos(x.c.reteFuente + x.c.reteIva + x.c.reteIca)}</td><td className="r">{pesos(x.c.netoEsperado)}</td>
                  <td className="r">{x.c.abonado ? pesos(x.c.abonado) : "—"}</td><td className="r"><b>{pesos(x.c.saldo)}</b></td>
                  <td className="num">{fecha(x.f.fechaPagoComprometida)}</td><td><EstadoFactura f={x.f} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Día promedio real de pago" sub="Días desde la emisión, por cliente">
          {comp.length ? <BarList data={comp.map((c) => ({ name: c.name, value: Math.round(c.diaPago) }))} color="var(--teal)" format={(n) => `${n} d`} /> : <div className="footnote">Aún no hay pagos con fecha registrada.</div>}
        </Card>
        <Card title="Días promedio de retraso" sub="Ranking frente al vencimiento">
          {comp.length ? <BarList data={comp.map((c) => ({ name: c.name, value: Math.round(c.retraso) })).sort((a, b) => b.value - a.value)} color="var(--red)" format={(n) => `${n} d`} /> : <div className="footnote">Sin datos.</div>}
        </Card>
        <Card title="Top 5 deudores" sub="Saldo vencido">
          {top5.length ? <BarList data={top5} color="var(--red)" format={(n) => pesosCortos(n).replace("$ ", "")} /> : <div className="footnote">Sin cartera vencida.</div>}
        </Card>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Cartera vencida" sub="Evolución 12 meses">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={serie} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} />
                <Line dataKey="vencida" name="Vencida al cierre" stroke="var(--red)" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Capital adelantado en pauta" sub={`Tope configurado ${pesosCortos(db.configIndice.topeCapitalPauta)}`}>
          {pauta.length ? (
            <div className="list" style={{ boxShadow: "none" }}>
              {pauta.map((p) => (
                <div key={p.name} className="list-row flat">
                  <span className="grow">{p.name}</span>
                  <span className="caption" style={{ marginRight: 10 }}>recuperado {pesosCortos(p.recuperado)}</span>
                  <Badge color={p.adelantado > db.configIndice.topeCapitalPauta ? "red" : "orange"}>por recuperar {pesosCortos(p.adelantado)}</Badge>
                </div>
              ))}
            </div>
          ) : <div className="footnote">Sin pauta con incremento.</div>}
        </Card>
      </div>
      <FacturaSheet id={abierta} onClose={() => setAbierta(null)} />
    </div>
  );
}
