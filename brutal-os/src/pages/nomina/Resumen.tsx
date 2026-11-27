import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Crown, PiggyBank, Receipt, Send, ShieldCheck, Users } from "lucide-react";
import { useDB, useSesion } from "../../data/store";
import { calcPeriodo, obligacionesCausadas, periodoActual, periodoPrevio, porArea, proyeccion, serieNomina, serieProvisiones } from "../../data/selectors";
import { MESES } from "../../domain/fechas";
import { enmascarar, pct, pesos, pesosCortos, titulo } from "../../lib/format";
import { BarList, Card, ChartTip, Empty, EstatusBadge, Kpi, Legend, Seg, Switch } from "../../components/ui";

const ax = (n: number) => pesosCortos(n).replace("$ ", "");

export default function Resumen() {
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const actual = periodoActual(db);
  const [periodoId, setPeriodoId] = useState(actual?.id ?? "");
  const [vista, setVista] = useState<"mes" | "anio">("mes");
  const [renov, setRenov] = useState(true);
  const per = db.periodos.find((p) => p.id === periodoId) ?? actual;
  const anios = [...new Set(db.periodos.map((p) => p.anio))];
  const [anio, setAnio] = useState(per?.anio ?? new Date().getFullYear());

  const pc = per ? calcPeriodo(db, per) : null;
  const prev = per ? periodoPrevio(db, per) : undefined;
  const pcPrev = prev ? calcPeriodo(db, prev) : null;
  const serie = useMemo(() => serieNomina(db, anio), [db, anio]);
  const conDatos = serie.filter((s) => s.existe);
  const prov = useMemo(() => serieProvisiones(db, anio), [db, anio]);
  const oblig = useMemo(() => obligacionesCausadas(db, anio), [db, anio]);
  const proy = useMemo(() => proyeccion(db, renov), [db, renov]);

  if (!per || !pc) return <Empty icon={<Receipt />} title="Aún no hay nóminas" text="Genera la nómina del mes desde Nómina mensual." />;

  const anual = conDatos.reduce(
    (a, m) => ({ costo: a.costo + m.costo, ingresos: a.ingresos + m.ingresos, neto: a.neto + m.neto, provisiones: a.provisiones + m.provisiones }),
    { costo: 0, ingresos: 0, neto: 0, provisiones: 0 },
  );
  const d = (a: number, b?: number) => (b ? (a - b) / b : null);
  const desglose = vista === "mes"
    ? [{ label: MESES[per.mes - 1], salarios: pc.empleados.salarios, auxilios: pc.empleados.auxilios, seguridad: pc.empleados.aporteEmpleador, provisiones: pc.empleados.totalProvisiones, asumidas: pc.empleados.deduccionesAsumidas }]
    : conDatos;
  const saldoProv = db.provisiones.reduce((s, m) => s + m.valor, 0);

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Seg value={vista} onChange={setVista} options={[{ value: "mes", label: "Por mes" }, { value: "anio", label: "Por año" }]} />
        {vista === "mes" ? (
          <select className="select" style={{ width: 220 }} value={per.id} onChange={(e) => setPeriodoId(e.target.value)}>
            {[...db.periodos].reverse().map((p) => <option key={p.id} value={p.id}>{MESES[p.mes - 1]} {p.anio}</option>)}
          </select>
        ) : (
          <select className="select" style={{ width: 140 }} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
            {anios.map((a) => <option key={a}>{a}</option>)}
          </select>
        )}
        <span className="right"><EstatusBadge estatus={per.estado} /></span>
      </div>

      <div className="grid g2">
        <div className="hero" style={{ ["--tint" as string]: "#30C759" }}>
          <div className="hero-eyebrow">Total a consignar · {MESES[per.mes - 1]} {per.anio}</div>
          <div className="hero-value">{pesos(pc.total.neto)}</div>
          <div className="hero-sub">Neto después de deducciones · {pc.total.personas} personas</div>
          <div className="hero-chips">
            <span className="hero-chip">Empleados {pesosCortos(pc.empleados.neto)}</span>
            <span className="hero-chip"><Crown size={12} /> Socios {pesosCortos(pc.socios.neto)}</span>
          </div>
        </div>
        <div className="hero" style={{ ["--tint" as string]: "#5856D6" }}>
          <div className="hero-eyebrow">Total a guardar en provisiones</div>
          <div className="hero-value">{pesos(pc.total.totalProvisiones)}</div>
          <div className="hero-sub">Prima, cesantías, intereses y vacaciones · cuenta {pc.params.cuentaProvisiones.banco} {enmascarar(pc.params.cuentaProvisiones.numero)}</div>
          <div className="hero-chips">
            <span className="hero-chip">Saldo acumulado {pesosCortos(saldoProv)}</span>
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginTop: 16 }}>
        <Kpi label="Planilla seguridad social" value={pesosCortos(pc.total.totalPlanilla)} icon={<ShieldCheck />} color="var(--teal)" delta={d(pc.total.totalPlanilla, pcPrev?.total.totalPlanilla)} invert deltaLabel="vs mes ant." />
        <Kpi label="Costo total empresa" value={pesosCortos(pc.total.costoTotal)} icon={<PiggyBank />} color="var(--green)" delta={d(pc.total.costoTotal, pcPrev?.total.costoTotal)} invert deltaLabel="vs mes ant." />
        <Kpi label="Costo promedio por empleado" value={pesosCortos(pc.empleados.personas ? pc.empleados.costoTotal / pc.empleados.personas : 0)} icon={<Users />} color="var(--blue)" foot={<span>{pc.empleados.personas} empleados · sin socios</span>} />
        <Kpi label="Estado del mes" value={<span style={{ fontSize: 20 }}>{per.estado}</span>} icon={<Send />} color="var(--purple)" onClick={() => nav(`/nomina/mes/${per.id}`)} foot={<span>{per.filas.filter((f) => f.cargada).length}/{per.filas.length} filas cargadas</span>} />
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Neto a consignar por persona" sub="Datos bancarios desde la BBDD de empleados" className="span2">
          <div className="table-wrap" style={{ boxShadow: "none", maxHeight: 360 }}>
            <table className="t">
              <thead><tr><th>ID</th><th>Nombre</th><th>Banco · tipo</th><th>Cuenta</th><th className="r">Neto</th></tr></thead>
              <tbody>
                {pc.filas.filter((x) => !x.f.esSocio).map(({ f, c }) => (
                  <tr key={f.empleadoId} className="click" onClick={() => nav(`/empleados/${f.empleadoId}`)}>
                    <td className="mono">{f.empleadoId}</td><td>{titulo(f.nombre)}</td><td>{titulo(f.banco)} · {titulo(f.tipoCuenta)}</td>
                    <td className="mono">{enmascarar(f.numeroCuenta)}</td><td className="r"><b>{pesos(c.neto)}</b></td>
                  </tr>
                ))}
                <tr className="total"><td colSpan={4}>Total empleados</td><td className="r">{pesos(pc.empleados.neto)}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Nómina socios" sub={sesion.rol === "ADMINISTRADOR" ? "Fuera de los totales de empleados" : "Visible solo para ADMINISTRADOR"} action={<Crown color="var(--yellow)" />}>
          {sesion.rol === "ADMINISTRADOR" ? (
            <div className="list" style={{ boxShadow: "none" }}>
              {pc.filas.filter((x) => x.f.esSocio).map(({ f, c }) => (
                <div className="list-row flat" key={f.empleadoId}><span className="grow">{titulo(f.nombre)}</span><b className="num" style={{ whiteSpace: "nowrap" }}>{pesos(c.neto)}</b></div>
              ))}
              <div className="list-row flat"><b>Total neto socios</b><b className="right num">{pesos(pc.socios.neto)}</b></div>
              <div className="list-row flat"><span className="muted">Costo total socios</span><span className="right num">{pesos(pc.socios.costoTotal)}</span></div>
            </div>
          ) : <div className="restricted" style={{ height: 160, borderRadius: 14 }} />}
        </Card>
      </div>

      <div className="section-title">Indicadores <small>Solo empleados · sin socios · {vista === "mes" ? `${MESES[per.mes - 1]} ${per.anio}` : anio}</small></div>
      {vista === "anio" && (
        <div className="grid g4" style={{ marginBottom: 16 }}>
          <Kpi label="Costo nómina del año" value={pesosCortos(anual.costo)} color="var(--green)" icon={<PiggyBank />} />
          <Kpi label="Ingresos del año" value={pesosCortos(anual.ingresos)} color="var(--blue)" icon={<Receipt />} />
          <Kpi label="Nómina / ingresos" value={anual.ingresos ? pct(anual.costo / anual.ingresos) : "—"} color="var(--orange)" icon={<Users />} />
          <Kpi label="Provisiones del año" value={pesosCortos(anual.provisiones)} color="var(--purple)" icon={<ShieldCheck />} />
        </div>
      )}

      <div className="grid g2">
        <Card title="Total nómina mes a mes" sub="¿Cuánto crece el costo y a qué ritmo?">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <ComposedChart data={conDatos} margin={{ left: 0, right: 0, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis yAxisId="a" axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <YAxis yAxisId="b" orientation="right" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={40} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="tt"><div className="tt-title">{label}</div>
                    <div className="tt-row"><span>Costo</span><b>{pesos(payload[0].payload.costo)}</b></div>
                    <div className="tt-row"><span>Variación</span><b>{payload[0].payload.variacion === null ? "—" : pct(payload[0].payload.variacion)}</b></div>
                  </div>) : null} />
                <Bar yAxisId="a" dataKey="costo" name="Costo" fill="var(--green)" radius={[8, 8, 0, 0]} />
                <Line yAxisId="b" dataKey="variacion" name="Variación" stroke="var(--orange)" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Costo total empleados", color: "var(--green)" }, { label: "Variación vs mes anterior", color: "var(--orange)" }]} />
        </Card>
        <Card title="Ingresos vs. nómina" sub="¿Qué parte de lo que facturamos se va en nómina?">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <ComposedChart data={conDatos} margin={{ left: 0, right: 0, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis yAxisId="a" axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <YAxis yAxisId="b" orientation="right" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} width={40} domain={[0, "auto"]} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="tt"><div className="tt-title">{label}</div>
                    <div className="tt-row"><span>Ingresos</span><b>{pesos(payload[0].payload.ingresos)}</b></div>
                    <div className="tt-row"><span>Nómina</span><b>{pesos(payload[0].payload.costo)}</b></div>
                    <div className="tt-row"><span>Nómina / ingresos</span><b>{payload[0].payload.pctIngresos ? pct(payload[0].payload.pctIngresos) : "—"}</b></div>
                  </div>) : null} />
                <Bar yAxisId="a" dataKey="ingresos" fill="var(--blue)" radius={[8, 8, 0, 0]} />
                <Bar yAxisId="a" dataKey="costo" fill="var(--green)" radius={[8, 8, 0, 0]} />
                <Line yAxisId="b" dataKey="pctIngresos" stroke="var(--pink)" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Ingresos", color: "var(--blue)" }, { label: "Nómina", color: "var(--green)" }, { label: "Nómina % ingresos", color: "var(--pink)" }]} />
        </Card>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Costo total empresa desglosado" sub="¿En qué se va cada peso?" className="span2">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={desglose} margin={{ left: 0, right: 0, top: 8 }} barSize={vista === "mes" ? 80 : undefined}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="salarios" name="Salarios" stackId="a" fill="#30C759" />
                <Bar dataKey="auxilios" name="Auxilios" stackId="a" fill="#00C7BE" />
                <Bar dataKey="seguridad" name="Seguridad social" stackId="a" fill="#0A7AFF" />
                <Bar dataKey="provisiones" name="Provisiones" stackId="a" fill="#5856D6" />
                <Bar dataKey="asumidas" name="Deducciones asumidas" stackId="a" fill="#FF9500" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Salarios", color: "#30C759" }, { label: "Auxilios", color: "#00C7BE" }, { label: "Seguridad social", color: "#0A7AFF" }, { label: "Provisiones", color: "#5856D6" }, { label: "Deducciones asumidas", color: "#FF9500" }]} />
        </Card>
        <Card title="Nómina por área" sub="Costo total del mes">
          <BarList data={porArea(pc).map((x) => ({ ...x, name: titulo(x.name) }))} format={(n) => pesosCortos(n).replace("$ ", "")} color="var(--green)" />
        </Card>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Costo promedio por empleado" sub="¿Sube el costo por persona?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={conDatos} margin={{ left: 0, right: 4, top: 8 }}>
                <defs><linearGradient id="prom" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--blue)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--blue)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTip money />} />
                <Area dataKey="promedio" name="Promedio" stroke="var(--blue)" strokeWidth={2.5} fill="url(#prom)" type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Provisiones: saldo vs. pagos" sub="¿Alcanza lo ahorrado para prima y cesantías?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <ComposedChart data={prov} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} />
                <Bar dataKey="pagos" name="Pagos del periodo" fill="var(--red)" radius={[6, 6, 0, 0]} />
                <Line dataKey="saldo" name="Saldo acumulado" stroke="var(--indigo)" strokeWidth={2.5} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="caption">Causado y pendiente: {pesos(oblig.reduce((s, o) => s + o.causado - o.pagado, 0))}</div>
        </Card>
        <Card title="Proyección 12 meses" sub="Activos, fin de contratos FIJO, aumentos futuros e incremento SMMLV" action={<div className="row" style={{ gap: 6 }}><span className="caption">Renovar FIJO</span><Switch on={renov} onChange={setRenov} /></div>}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={proy} margin={{ left: 0, right: 4, top: 8 }}>
                <defs><linearGradient id="proy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--purple)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--purple)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} interval={1} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} domain={["auto", "auto"]} />
                <Tooltip content={<ChartTip money />} />
                <Area dataKey="costo" name="Costo proyectado" stroke="var(--purple)" strokeWidth={2.5} strokeDasharray="6 4" fill="url(#proy)" type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="caption">Total 12 meses: {pesos(proy.reduce((s, p) => s + p.costo, 0))}</div>
        </Card>
      </div>
    </>
  );
}
