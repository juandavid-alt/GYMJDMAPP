import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter,
  ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { BellRing, Briefcase, FileBarChart, Pin, Printer, Sparkles, Target, Trash2, TrendingUp, Users, Wallet } from "lucide-react";
import { useDB, useSesion } from "../../data/store";
import { guardarConfigIndice } from "../../data/storeFin";
import {
  cartera, contratosPorVencer, facturasCalc, ingresoAsegurado, mesCausado, mesesDelAnio, proyeccionCierre, pyg, serieFacturacion, sumarPyG, TIPOS_LABEL, type Base, type FilaPyG,
} from "../../data/selectorsFin";
import { alertasEmpleados, estadoDocumentos, serieMensual } from "../../domain/empleados";
import { cuentaEnFacturado, valorVigente, type Factura } from "../../domain/facturacion";
import { hoy, MESES, mesAnterior, mesId, mesSiguiente } from "../../domain/fechas";
import { fecha, pct, pesos, pesosCortos } from "../../lib/format";
import { Badge, Card, ChartTip, Kpi, Legend, Modal, PALETA, Progress, Seg, useToast } from "../../components/ui";

const ax = (n: number) => pesosCortos(n).replace("$ ", "");
const COLOR_TIPO: Record<Factura["tipo"], string> = { FIJA: "#30C759", ADICIONAL: "#0A7AFF", "ONE SHOT": "#AF52DE", PAUTA: "#FF9500" };

interface AlertaIndice { grupo: "Comerciales" | "Costos y gastos" | "Caja y cartera" | "Personas" | "Cumplimiento"; nivel: "rojo" | "amarillo" | "azul"; texto: string; ruta: string; }

export default function Indice() {
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const toast = useToast();
  const ref = hoy();
  const [mes, setMes] = useState(ref.slice(0, 7));
  const [base, setBase] = useState<Base>("CAUSADO");
  const [conIva, setConIva] = useState(false);
  const [comparar, setComparar] = useState<"ANTERIOR" | "ANIO" | "PRESUPUESTO">("ANTERIOR");
  const [nota, setNota] = useState("");
  const [reporte, setReporte] = useState(false);
  const anio = Number(mes.slice(0, 4));
  const meses = mesesDelAnio(anio);
  const filas = useMemo(() => pyg(db, meses, base, conIva), [db, base, conIva, anio]); // eslint-disable-line react-hooks/exhaustive-deps
  const fila = filas.find((f) => f.mes === mes)!;
  const ant = mesAnterior(anio, Number(mes.slice(5, 7)));
  const filaComp: Partial<FilaPyG> | undefined = useMemo(() => {
    if (comparar === "PRESUPUESTO") {
      const p = db.configIndice.presupuesto[mes];
      return p ? { ingresos: p.ingresos, costos: p.costos, gastos: p.gastos, utilidadBruta: p.ingresos - p.costos, utilidadOperacional: p.ingresos - p.costos - p.gastos } : undefined;
    }
    const m = comparar === "ANTERIOR" ? mesId(ant.anio, ant.mes) : `${anio - 1}${mes.slice(4)}`;
    return pyg(db, [m], base, conIva)[0];
  }, [comparar, mes, db, base, conIva]); // eslint-disable-line react-hooks/exhaustive-deps
  const ytd = sumarPyG(filas.filter((f) => f.mes <= mes));
  const proy = useMemo(() => proyeccionCierre(db), [db]);
  const cs = cartera(db);
  const vencida = cs.filter((x) => (x.dias ?? 0) < 0).reduce((s, x) => s + x.c.saldo, 0);
  const serieF = useMemo(() => serieFacturacion(db, meses), [db, anio]); // eslint-disable-line react-hooks/exhaustive-deps
  const recaudadoMes = serieF.find((s) => s.mes === mes)?.recaudado ?? 0;
  const porRecaudar = cs.reduce((s, x) => s + x.c.saldo, 0);
  const d = (a?: number, b?: number) => (b ? ((a ?? 0) - b) / Math.abs(b) : null);
  const fs = facturasCalc(db);
  const meta = db.configIndice.metaVentasAnual;
  const empleados = db.empleados.filter((e) => !e.esSocio);
  const activos = empleados.filter((e) => e.estatus === "ACTIVO");

  // ---------- Alertas ----------
  const alertas = useMemo<AlertaIndice[]>(() => {
    const out: AlertaIndice[] = [];
    for (const v of contratosPorVencer(db, 90)) out.push({ grupo: "Comerciales", nivel: v.dias <= 30 ? "rojo" : v.dias <= 60 ? "amarillo" : "azul", texto: `${v.cli?.nombreComercial} vence en ${v.dias} días · ${pesosCortos(v.valor)} mensuales en riesgo`, ruta: `/clientes/${v.c.clienteId}` });
    const sinFin = db.contratos.filter((c) => c.estado === "ACTIVO" && !c.fin);
    if (sinFin.length) out.push({ grupo: "Comerciales", nivel: "amarillo", texto: `${sinFin.length} contratos sin duración definida: no se puede alertar su vencimiento`, ruta: "/clientes?tab=contratos" });
    const pausados = db.clientes.filter((c) => c.estado === "EN PAUSA" || c.estado === "POR CONFIRMAR");
    if (pausados.length) out.push({ grupo: "Comerciales", nivel: "azul", texto: `${pausados.length} clientes en pausa o por confirmar: ${pausados.map((c) => c.nombreComercial).join(", ")}`, ruta: "/clientes" });
    const congelado = db.contratos.filter((c) => c.estado === "EN PAUSA").reduce((s, c) => s + valorVigente(c, mes), 0);
    if (congelado) out.push({ grupo: "Comerciales", nivel: "amarillo", texto: `${pesosCortos(congelado)} mensuales congelados en contratos en pausa`, ruta: "/clientes?tab=contratos" });
    const ingCli = new Map<string, number>();
    for (const x of fs) if (cuentaEnFacturado(x.f) && mesCausado(x.f) === mes) ingCli.set(x.cli?.nombreComercial ?? "—", (ingCli.get(x.cli?.nombreComercial ?? "—") ?? 0) + x.c.ingresoPropio);
    for (const [n, v] of ingCli) if (fila.ingresos && v / fila.ingresos > db.configIndice.umbralConcentracion) out.push({ grupo: "Comerciales", nivel: "amarillo", texto: `${n} concentra ${pct(v / fila.ingresos, 0)} del ingreso del mes`, ruta: "/facturacion" });
    // Costos y gastos
    const prev3 = filas.filter((f) => f.mes < mes).slice(-3);
    for (const [cat, v] of Object.entries(fila.costosGastos)) {
      const prom = prev3.length ? prev3.reduce((s, f) => s + (f.costosGastos[cat] ?? 0), 0) / prev3.length : 0;
      if (prom && (v - prom) / prom > db.configIndice.umbralSobrecosto) out.push({ grupo: "Costos y gastos", nivel: "rojo", texto: `Sobrecosto en ${cat}: +${pct((v - prom) / prom, 0)} frente al promedio de 3 meses`, ruta: "/gastos" });
    }
    for (const g of db.gastos.filter((x) => x.fecha.startsWith(mes) && !x.recurrente && x.valor > db.configIndice.topeGastoAbrupto)) out.push({ grupo: "Costos y gastos", nivel: "amarillo", texto: `Gasto abrupto: ${g.proveedor} por ${pesosCortos(g.valor)}`, ruta: "/gastos" });
    if (fila.ingresos && (fila.nominaOperativa + fila.nominaAdministrativa) / fila.ingresos > db.configIndice.metaNominaPctIngresos) out.push({ grupo: "Costos y gastos", nivel: "amarillo", texto: `Nómina en ${pct((fila.nominaOperativa + fila.nominaAdministrativa) / fila.ingresos, 0)} del ingreso (meta ${pct(db.configIndice.metaNominaPctIngresos, 0)})`, ruta: "/nomina" });
    if (fila.ingresos && fila.margenOperacional < db.configIndice.metaMargenOperacional) out.push({ grupo: "Costos y gastos", nivel: "amarillo", texto: `Margen operacional ${pct(fila.margenOperacional, 0)} por debajo de la meta (${pct(db.configIndice.metaMargenOperacional, 0)})`, ruta: "/" });
    if (!fila.nominaRegistrada) out.push({ grupo: "Costos y gastos", nivel: "azul", texto: `${MESES[Number(mes.slice(5, 7)) - 1]} no tiene nómina registrada: la utilidad no incluye el costo del equipo`, ruta: "/nomina" });
    if (!db.gastos.length) out.push({ grupo: "Costos y gastos", nivel: "azul", texto: "Aún no hay gastos registrados: la utilidad solo descuenta nómina", ruta: "/gastos" });
    // Caja y cartera
    if (vencida) {
      const top = new Map<string, number>();
      for (const x of cs) if ((x.dias ?? 0) < 0) top.set(x.cli?.nombreComercial ?? "—", (top.get(x.cli?.nombreComercial ?? "—") ?? 0) + x.c.saldo);
      out.push({ grupo: "Caja y cartera", nivel: "rojo", texto: `Cartera vencida ${pesosCortos(vencida)} · top: ${[...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => `${n} ${pesosCortos(v)}`).join(", ")}`, ruta: "/cartera" });
    }
    const pauta = fs.filter((x) => x.f.tipo === "PAUTA" && x.f.estado !== "PAGADA" && x.f.estado !== "ANULADA" && x.f.estado !== "EN PAUSA").reduce((s, x) => s + x.c.reembolsoPauta, 0);
    if (pauta > db.configIndice.topeCapitalPauta) out.push({ grupo: "Caja y cartera", nivel: "rojo", texto: `Capital adelantado en pauta ${pesosCortos(pauta)} supera el tope`, ruta: "/cartera" });
    const sinEmitir = db.facturas.filter((f) => f.estado === "PROGRAMADA" && f.fechaProgramada <= ref).length;
    if (sinEmitir) out.push({ grupo: "Caja y cartera", nivel: "amarillo", texto: `${sinEmitir} facturas del ciclo sin emitir`, ruta: "/facturacion?tab=lote" });
    const sinNum = db.facturas.filter((f) => f.datoIncompleto && f.estado !== "ANULADA").length;
    if (sinNum) out.push({ grupo: "Caja y cartera", nivel: "amarillo", texto: `${sinNum} facturas sin número (migración)`, ruta: "/facturacion?tab=migracion" });
    // Personas
    const al = alertasEmpleados(empleados);
    const contratos = al.filter((a) => a.tipo === "CONTRATO").length;
    if (contratos) out.push({ grupo: "Personas", nivel: "amarillo", texto: `${contratos} contratos laborales por vencer`, ruta: "/empleados" });
    const pendNomina = db.periodos.filter((p) => p.estado === "EN APROBACIÓN").length;
    if (pendNomina) out.push({ grupo: "Personas", nivel: "rojo", texto: "Nómina pendiente de aprobación", ruta: "/nomina/mes" });
    const mov = serieMensual(db.empleados, [{ anio, mes: Number(mes.slice(5, 7)) }])[0];
    if (mov.ingresos || mov.retiros) out.push({ grupo: "Personas", nivel: "azul", texto: `${mov.ingresos} ingresos y ${mov.retiros} retiros en el mes`, ruta: "/empleados" });
    // Cumplimiento
    const docs = activos.filter((e) => estadoDocumentos(e).semaforo === "rojo").length;
    if (docs) out.push({ grupo: "Cumplimiento", nivel: "rojo", texto: `${docs} empleados con documentos vencidos`, ruta: "/empleados" });
    out.push({ grupo: "Cumplimiento", nivel: "azul", texto: "Obligaciones tributarias de los próximos 15 días: disponible cuando se active el módulo Impuestos", ruta: "/modulo/impuestos" });
    const orden = { rojo: 0, amarillo: 1, azul: 2 };
    return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
  }, [db, mes, fila]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Resumen ejecutivo ----------
  const resumen = useMemo(() => {
    const out: string[] = [];
    const nm = MESES[Number(mes.slice(5, 7)) - 1].toLowerCase();
    const dv = d(fila.ingresos, filaComp?.ingresos);
    out.push(`Los ingresos propios de ${nm} suman ${pesosCortos(fila.ingresos)}${dv !== null ? `, ${pct(Math.abs(dv), 0)} ${dv >= 0 ? "más" : "menos"} que ${comparar === "ANTERIOR" ? "el mes anterior" : comparar === "ANIO" ? "el mismo mes del año pasado" : "el presupuesto"}` : ""}.`);
    out.push(`La utilidad operacional es ${pesosCortos(fila.utilidadOperacional)} (margen ${pct(fila.margenOperacional, 0)})${fila.nominaRegistrada ? "" : ", sin nómina registrada en el mes"}${db.gastos.length ? "" : " y sin gastos no salariales registrados"}.`);
    if (vencida) out.push(`La cartera vencida es ${pesosCortos(vencida)} y queda ${pesosCortos(porRecaudar)} por recaudar.`);
    const v = contratosPorVencer(db, 90);
    if (v.length) out.push(`${v.length} contratos por ${pesosCortos(v.reduce((s, x) => s + x.valor, 0))} mensuales vencen en los próximos 90 días.`);
    else if (db.contratos.some((c) => !c.fin)) out.push(`${db.contratos.filter((c) => !c.fin && c.estado === "ACTIVO").length} contratos no tienen duración definida; la proyección los cubre solo hasta diciembre.`);
    out.push(`En el escenario base, ${anio} cierra con ${pesosCortos(proy.base)} en ingresos propios${meta ? ` (${pct(proy.base / meta, 0)} de la meta)` : ""}.`);
    return out.slice(0, 6);
  }, [fila, filaComp, vencida, porRecaudar, proy, db, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Datos de gráficas ----------
  const cascada = [
    { name: "Ingresos", base: 0, valor: fila.ingresos, color: "#30C759" },
    { name: "Costos", base: fila.ingresos - fila.costos, valor: fila.costos, color: "#FF9500" },
    { name: "Gastos", base: fila.utilidadBruta - fila.gastos, valor: fila.gastos, color: "#AF52DE" },
    { name: "Socios", base: fila.utilidadOperacional - fila.socios, valor: fila.socios, color: "#FFCC00" },
    { name: "Utilidad", base: 0, valor: fila.utilidadFinal, color: fila.utilidadFinal >= 0 ? "#0A7AFF" : "#FF3B30" },
  ].map((x) => ({ ...x, base: Math.max(0, x.base) }));
  let acum = 0;
  const acumulado = filas.map((f, i) => { if (f.mes <= mes) acum += f.ingresos; return { label: f.label, real: f.mes <= mes ? acum : null, meta: meta ? (meta / 12) * (i + 1) : null }; });
  const compCostos = Object.entries(fila.costosGastos).filter(([k]) => k === "Nómina operativa" || db.gastos.some((g) => g.categoria === k && g.tipo === "COSTO")).map(([name, value]) => ({ name, value }));
  const compGastos = Object.entries(fila.costosGastos).filter(([k]) => k === "Nómina administrativa" || db.gastos.some((g) => g.categoria === k && g.tipo === "GASTO")).map(([name, value]) => ({ name, value }));
  const prev3 = filas.filter((f) => f.mes < mes).slice(-3);
  const variacion = Object.entries(fila.costosGastos).map(([name, v]) => { const p = prev3.length ? prev3.reduce((s, f) => s + (f.costosGastos[name] ?? 0), 0) / prev3.length : 0; return { name, value: p ? (v - p) / p : 0 }; }).filter((x) => x.value).sort((a, b) => b.value - a.value);
  const rentabilidad = useMemo(() => {
    const m = new Map<string, { name: string; ingresos: number; costos: number }>();
    for (const x of fs) if (cuentaEnFacturado(x.f) && mesCausado(x.f).startsWith(String(anio))) { const e = m.get(x.f.clienteId) ?? { name: x.cli?.nombreComercial ?? "—", ingresos: 0, costos: 0 }; e.ingresos += x.c.ingresoPropio; m.set(x.f.clienteId, e); }
    for (const g of db.gastos) if (g.clienteId && g.fecha.startsWith(String(anio)) && g.tipo === "COSTO") { const e = m.get(g.clienteId) ?? { name: db.clientes.find((c) => c.id === g.clienteId)?.nombreComercial ?? "—", ingresos: 0, costos: 0 }; e.costos += g.valor; m.set(g.clienteId, e); }
    return [...m.values()].map((e) => ({ ...e, margen: e.ingresos - e.costos, pctMargen: e.ingresos ? (e.ingresos - e.costos) / e.ingresos : 0 })).sort((a, b) => b.margen - a.margen);
  }, [fs, db, anio]);
  const proximos = Array.from({ length: 12 }, (_, i) => { let c = { anio: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) }; for (let k = 0; k < i; k++) c = mesSiguiente(c.anio, c.mes); return mesId(c.anio, c.mes); });
  const asegurado = ingresoAsegurado(db, proximos);
  const equipo = filas.map((f) => ({ label: f.label, headcount: f.headcount || null, ingresoPorEmpleado: f.headcount ? f.ingresos / f.headcount : null, nominaPct: f.ingresos && f.nominaRegistrada ? (f.nominaOperativa + f.nominaAdministrativa) / f.ingresos : null }));
  // Rotación anual = retiros del año ÷ promedio de activos al cierre de cada mes transcurrido
  const serieAnio = serieMensual(db.empleados, meses.filter((m) => m <= ref.slice(0, 7)).map((m) => ({ anio, mes: Number(m.slice(5, 7)) })));
  const promActivos = serieAnio.length ? serieAnio.reduce((s, x) => s + x.activos, 0) / serieAnio.length : 0;
  const rotacion = promActivos ? (serieAnio.reduce((s, x) => s + x.retiros, 0) / promActivos) * 100 : 0;

  if (sesion.rol === "COORDINACION") {
    const operativas = alertas.filter((a) => a.grupo !== "Costos y gastos" && !a.texto.includes("concentra"));
    return (
      <div className="fade-in">
        <h1 className="large-title">Índice</h1>
        <p className="subtitle">Alertas operativas de hoy. Las cifras financieras son visibles para el ADMINISTRADOR.</p>
        <Alertas alertas={operativas} nav={nav} />
      </div>
    );
  }

  const nombreMes = MESES[Number(mes.slice(5, 7)) - 1];
  const tit = (label: string, v: number, comp?: number, extra?: string, invert = false, ruta = "/") => (
    <Kpi label={label} value={pesosCortos(v)} delta={d(v, comp)} invert={invert} deltaLabel={comp !== undefined ? (comparar === "ANTERIOR" ? "vs mes ant." : comparar === "ANIO" ? "vs año ant." : "vs presupuesto") : undefined} foot={extra ? <span>{extra}</span> : undefined} onClick={() => nav(ruta)} />
  );

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <div className="caption" style={{ textTransform: "capitalize" }}>{new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1 className="large-title">Índice</h1>
          <p className="subtitle" style={{ margin: 0 }}>¿Estamos ganando plata este mes? ¿Cómo vamos a cerrar el año? ¿Qué hay que atender hoy?</p>
        </div>
        <div className="toolbar">
          <button className="btn glass-btn" onClick={() => setReporte(true)}><FileBarChart />Reporte del mes</button>
        </div>
      </div>
      <div className="card glass row wrap" style={{ padding: 12, marginBottom: 18, gap: 10 }}>
        <input type="month" className="input" style={{ width: 170 }} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        <Seg value={base} onChange={setBase} options={[{ value: "CAUSADO", label: "Causado" }, { value: "CAJA", label: "Caja" }]} />
        <Seg value={conIva ? "con" : "sin"} onChange={(v) => setConIva(v === "con")} options={[{ value: "sin", label: "Sin IVA" }, { value: "con", label: "Con IVA" }]} />
        <Seg value={comparar} onChange={setComparar} options={[{ value: "ANTERIOR", label: "vs mes anterior" }, { value: "ANIO", label: "vs año anterior" }, { value: "PRESUPUESTO", label: "vs presupuesto" }]} />
        <span className="caption right">{base === "CAUSADO" ? "Causado: ingresos = facturado emitido (rentabilidad real)" : "Caja: ingresos = recaudado (liquidez real)"}</span>
      </div>

      {/* Bloque 1 */}
      <div className="section-title" style={{ marginTop: 0 }}>Titulares de {nombreMes.toLowerCase()}</div>
      <div className="grid g4">
        {tit("Ingresos propios", fila.ingresos, filaComp?.ingresos, undefined, false, "/facturacion")}
        {tit("Costos", fila.costos, filaComp?.costos, fila.nominaRegistrada ? "nómina operativa + directos" : "sin nómina registrada", true, "/gastos")}
        {tit("Gastos", fila.gastos, filaComp?.gastos, "nómina administrativa + operación", true, "/gastos")}
        {tit("Utilidad bruta", fila.utilidadBruta, filaComp?.utilidadBruta, `margen ${pct(fila.margenBruto, 0)}`)}
        {tit("Utilidad operacional", fila.utilidadOperacional, filaComp?.utilidadOperacional, `margen ${pct(fila.margenOperacional, 0)}`)}
        {tit("Después de socios", fila.utilidadFinal, filaComp?.utilidadFinal, `margen ${fila.ingresos ? pct(fila.utilidadFinal / fila.ingresos, 0) : "—"}`)}
        <Kpi label="Recaudado vs por recaudar" value={pesosCortos(recaudadoMes)} foot={<span>por recaudar {pesosCortos(porRecaudar)}</span>} onClick={() => nav("/cartera")} />
        <Kpi label="Cartera vencida" value={pesosCortos(vencida)} foot={<span>{cs.filter((x) => (x.dias ?? 0) < 0).length} facturas</span>} onClick={() => nav("/cartera")} />
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        {/* Bloque 2 */}
        <Card title={`Acumulado ${anio}`} sub={`Enero a ${nombreMes.toLowerCase()}`} action={<Target color="var(--tint)" />}>
          <div className="list" style={{ boxShadow: "none" }}>
            {[["Ingresos propios", ytd.ingresos], ["Costos", ytd.costos], ["Gastos", ytd.gastos], ["Utilidad bruta", ytd.utilidadBruta], ["Utilidad operacional", ytd.utilidadOperacional], ["Después de socios", ytd.utilidadFinal]].map(([l, v]) => (
              <div className="list-row flat" key={l as string} style={{ minHeight: 38 }}><span className="footnote">{l}</span><b className="right num">{pesos(v as number)}</b></div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="row between caption"><span>Cumplimiento meta anual</span><span>{meta ? pct(ytd.ingresos / meta, 0) : "Define la meta en Configuración"}</span></div>
            <Progress value={meta ? ytd.ingresos / meta : 0} />
          </div>
        </Card>
        {/* Bloque 3 */}
        <Card title="Proyección de cierre" sub="Tres escenarios" className="span2" action={<TrendingUp color="var(--tint)" />}>
          <div className="grid g3" style={{ marginBottom: 10 }}>
            {[["Conservador", proy.conservador, "solo contratos firmados"], ["Base", proy.base, `+ promedio adicionales ${pesosCortos(proy.promVariable)}/mes`], ["Optimista", proy.optimista, `+ renovación ${pct(db.configIndice.pctRenovacion, 0)}`]].map(([l, v, s]) => (
              <div key={l as string} className="card" style={{ background: "var(--fill-2)", boxShadow: "none", padding: 14 }}>
                <div className="caption">{l}</div><div className="kpi-value" style={{ fontSize: 22, marginTop: 4 }}>{pesosCortos(v as number)}</div>
                <div className="caption">utilidad {pesosCortos((v as number) - proy.costos)} · {s}</div>
              </div>
            ))}
          </div>
          <div style={{ height: 170 }}>
            <ResponsiveContainer>
              <AreaChart data={proy.filas} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} />
                <Area dataKey="optimista" name="Optimista" stroke="#30C759" fill="#30C759" fillOpacity={0.12} strokeWidth={2} type="monotone" />
                <Area dataKey="base" name="Base" stroke="#0A7AFF" fill="#0A7AFF" fillOpacity={0.15} strokeWidth={2.5} type="monotone" />
                <Area dataKey="conservador" name="Conservador" stroke="#FF9500" fill="#FF9500" fillOpacity={0.12} strokeWidth={2} type="monotone" />
                <Line dataKey="costo" name="Costos y gastos" stroke="var(--red)" strokeDasharray="5 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="caption">{meta ? (proy.base >= meta ? `El escenario base supera la meta anual de ${pesosCortos(meta)}.` : `Faltan ${pesosCortos(meta - proy.base)} en ventas para cumplir la meta de ${pesosCortos(meta)}.`) : "Define la meta anual en Configuración → Índice para ver la brecha."}</div>
        </Card>
      </div>

      {/* Bloque 4 */}
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Resumen ejecutivo" sub="Generado automáticamente" action={<Sparkles color="var(--tint)" />}>
          {db.configIndice.notas.map((n) => (
            <div key={n.id} className="row" style={{ alignItems: "flex-start", marginBottom: 8 }}>
              <Pin size={14} color="var(--orange)" style={{ marginTop: 3, flex: "none" }} />
              <div className="grow footnote" style={{ color: "var(--label)" }}>{n.texto}<div className="caption">{n.por} · {fecha(n.en.slice(0, 10))}</div></div>
              {sesion.rol === "ADMINISTRADOR" && <button className="btn icon sm plain" onClick={() => guardarConfigIndice({ notas: db.configIndice.notas.filter((x) => x.id !== n.id) })}><Trash2 size={14} /></button>}
            </div>
          ))}
          <div className="stack" style={{ gap: 8 }}>{resumen.map((r, i) => <div key={i} className="footnote" style={{ color: "var(--label)", fontSize: 14 }}>{r}</div>)}</div>
          {sesion.rol === "ADMINISTRADOR" && (
            <div className="row" style={{ marginTop: 12 }}>
              <input className="input sm" placeholder="Fijar una nota manual…" value={nota} onChange={(e) => setNota(e.target.value)} />
              <button className="btn sm" disabled={!nota.trim()} onClick={() => { guardarConfigIndice({ notas: [{ id: String(Date.now()), texto: nota.trim(), por: sesion.usuario, en: new Date().toISOString() }, ...db.configIndice.notas] }); setNota(""); toast("Nota fijada"); }}><Pin size={14} /></button>
            </div>
          )}
        </Card>
        <Card title="Notas y alertas" sub={`${alertas.filter((a) => a.nivel === "rojo").length} urgentes`} className="span2" style={{ padding: 12 }} action={<BellRing color="var(--red)" />}>
          <Alertas alertas={alertas} nav={nav} compacto />
        </Card>
      </div>

      {/* Gráficas */}
      <div className="section-title">Panorama</div>
      <div className="grid g2">
        <Card title="Ingresos vs. costos + gastos" sub="¿Ganamos o perdimos cada mes?">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <ComposedChart data={filas.map((f) => ({ ...f, egresos: f.costos + f.gastos + f.socios }))} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#30C759" radius={[6, 6, 0, 0]} />
                <Bar dataKey="egresos" name="Costos + gastos + socios" fill="#FF9500" radius={[6, 6, 0, 0]} />
                <Line dataKey="utilidadFinal" name="Utilidad" stroke="#0A7AFF" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Ingresos", color: "#30C759" }, { label: "Costos + gastos + socios", color: "#FF9500" }, { label: "Utilidad", color: "#0A7AFF" }]} />
        </Card>
        <Card title={`Cascada de ${nombreMes.toLowerCase()}`} sub="¿Dónde se va la plata?">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <BarChart data={cascada} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="tt"><div className="tt-title">{payload[0].payload.name}</div><b>{pesos(payload[0].payload.valor)}</b></div> : null} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="base" stackId="w" fill="transparent" />
                <Bar dataKey="valor" stackId="w" radius={[6, 6, 6, 6]}>{cascada.map((c) => <Cell key={c.name} fill={c.color} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Márgenes" sub="¿Somos más o menos eficientes?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={filas.filter((f) => f.ingresos)} margin={{ left: -10, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="tt"><div className="tt-title">{label}</div>{payload.map((p) => <div className="tt-row" key={p.name}><span>{p.name}</span><b>{pct(p.value as number, 0)}</b></div>)}</div> : null} />
                <Line dataKey="margenBruto" name="Bruto" stroke="#30C759" strokeWidth={2.5} type="monotone" />
                <Line dataKey="margenOperacional" name="Operacional" stroke="#0A7AFF" strokeWidth={2.5} type="monotone" />
                <ReferenceLine y={db.configIndice.metaMargenOperacional} stroke="var(--label-3)" strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Acumulado vs. meta" sub="¿Vamos a cumplir?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={acumulado} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} />
                <Line dataKey="real" name="Acumulado real" stroke="#0A7AFF" strokeWidth={3} dot={false} />
                <Line dataKey="meta" name="Meta" stroke="var(--label-3)" strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Ingresos por tipo" sub="¿Qué tan estable es el ingreso?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={filas.map((f) => ({ label: f.label, ...f.ingresosPorTipo }))} margin={{ left: 0, right: 4, top: 8 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                {(Object.keys(COLOR_TIPO) as Factura["tipo"][]).map((t, i, a) => <Bar key={t} dataKey={t} name={TIPOS_LABEL[t]} stackId="t" fill={COLOR_TIPO[t]} radius={i === a.length - 1 ? [6, 6, 0, 0] : undefined} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Donut titulo="Composición de costos" sub="¿Qué pesa más en el costo?" data={compCostos} />
        <Donut titulo="Composición de gastos" sub="¿Qué pesa más en el gasto?" data={compGastos} />
        <Card title="Variación por categoría" sub="vs promedio 3 meses · ¿qué se está disparando?">
          {variacion.length ? (
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <BarChart data={variacion} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                  <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={120} />
                  <ReferenceLine x={0} stroke="var(--separator)" />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="tt"><b>{payload[0].payload.name}</b> {pct(payload[0].payload.value, 0)}</div> : null} />
                  <Bar dataKey="value" radius={4}>{variacion.map((v) => <Cell key={v.name} fill={v.value > 0 ? "#FF3B30" : "#30C759"} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="footnote">Se necesitan al menos dos meses con costos y gastos para comparar.</div>}
        </Card>
      </div>
      <div className="grid g2" style={{ marginTop: 16 }}>
        <Card title="Rentabilidad por cliente" sub={`${anio} · ingresos − costos asignados`}>
          <div style={{ height: Math.max(200, rentabilidad.length * 22) }}>
            <ResponsiveContainer>
              <BarChart data={rentabilidad} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={ax} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={150} interval={0} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="margen" name="Margen" radius={4}>{rentabilidad.map((r) => <Cell key={r.name} fill={r.margen >= 0 ? "#30C759" : "#FF3B30"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="caption">La nómina operativa se asignará por cliente cuando exista el % de dedicación por persona.</div>
        </Card>
        <div className="stack">
          <Card title="Ingresos vs. margen por cliente" sub="¿Clientes grandes que dejan poco?">
            <div style={{ height: 200 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ left: 0, right: 10, top: 8 }}>
                  <CartesianGrid stroke="var(--separator)" />
                  <XAxis type="number" dataKey="ingresos" name="Ingresos" axisLine={false} tickLine={false} tickFormatter={ax} />
                  <YAxis type="number" dataKey="pctMargen" name="Margen" axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                  <ZAxis range={[60, 60]} />
                  <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="tt"><div className="tt-title">{payload[0].payload.name}</div>{pesos(payload[0].payload.ingresos)} · margen {pct(payload[0].payload.pctMargen, 0)}</div> : null} />
                  <Scatter data={rentabilidad} fill="#5856D6" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Ingreso fijo asegurado" sub="Próximos 12 meses · ¿qué tenemos firmado?">
            <div style={{ height: 150 }}>
              <ResponsiveContainer>
                <BarChart data={asegurado} margin={{ left: 0, right: 4, top: 8 }}>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} interval={1} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                  <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                  <Bar dataKey="valor" name="Fee contratado" fill="#30C759" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Facturado vs. recaudado" sub="¿Lo facturado se convierte en caja?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={serieF} margin={{ left: 0, right: 4, top: 8 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="facturadoConIva" name="Facturado con IVA" fill="#30B0C7" radius={[6, 6, 0, 0]} />
                <Bar dataKey="recaudado" name="Recaudado" fill="#30C759" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Nómina % sobre ingresos" sub="¿El equipo es sostenible para lo que facturamos?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <LineChart data={equipo} margin={{ left: -10, right: 4, top: 8 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <ReferenceLine y={db.configIndice.metaNominaPctIngresos} stroke="var(--label-3)" strokeDasharray="4 4" />
                <Tooltip content={({ active, payload, label }) => active && payload?.length && payload[0].value !== null ? <div className="tt"><b>{label}</b> {pct(payload[0].value as number, 0)}</div> : null} />
                <Line dataKey="nominaPct" name="Nómina %" stroke="#AF52DE" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Headcount vs. ingreso por empleado" sub="¿Crecemos en equipo sin crecer en productividad?">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <ComposedChart data={equipo} margin={{ left: 0, right: 0, top: 8 }}>
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis yAxisId="a" axisLine={false} tickLine={false} width={28} allowDecimals={false} />
                <YAxis yAxisId="b" orientation="right" axisLine={false} tickLine={false} tickFormatter={ax} width={48} />
                <Tooltip content={<ChartTip />} />
                <Bar yAxisId="a" dataKey="headcount" name="Headcount" fill="var(--fill-3)" radius={[6, 6, 0, 0]} />
                <Line yAxisId="b" dataKey="ingresoPorEmpleado" name="Ingreso por empleado" stroke="#0A7AFF" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
      <Card title="Comparativo año contra año" sub={`Ingresos y utilidad · ${anio - 1} vs ${anio}`} style={{ marginTop: 16 }}>
        <div className="footnote">El histórico del sistema empieza en septiembre de {anio}. El comparativo se llena solo cuando existan datos de {anio - 1}.</div>
      </Card>

      {/* Bloque 5 */}
      <div className="section-title">Estado de resultados {anio} <small>{base === "CAUSADO" ? "causado" : "caja"} · {conIva ? "con" : "sin"} IVA</small></div>
      <PyGTabla filas={filas} presupuesto={db.configIndice.presupuesto} catCostos={["Nómina operativa", ...db.gastos.filter((g) => g.tipo === "COSTO").map((g) => g.categoria)]} />

      {/* Bloque 6 */}
      <div className="section-title">Equipo</div>
      <div className="grid g4">
        <Kpi label="Headcount activo" value={activos.length} icon={<Users />} color="var(--purple)" foot={<span>sin socios</span>} onClick={() => nav("/empleados")} />
        <Kpi label="Nómina % sobre ingresos" value={fila.ingresos && fila.nominaRegistrada ? pct((fila.nominaOperativa + fila.nominaAdministrativa) / fila.ingresos, 0) : "—"} icon={<Briefcase />} color="var(--green)" foot={<span>costo {pesosCortos(fila.nominaOperativa + fila.nominaAdministrativa)}</span>} onClick={() => nav("/nomina")} />
        <Kpi label="Ingreso por empleado" value={fila.headcount ? pesosCortos(fila.ingresos / fila.headcount) : "—"} icon={<Wallet />} color="var(--blue)" foot={<span>costo promedio {fila.headcount ? pesosCortos((fila.nominaOperativa + fila.nominaAdministrativa) / fila.headcount) : "—"}</span>} />
        <Kpi label="Rotación del año" value={`${rotacion.toFixed(1)} %`} icon={<Users />} color="var(--orange)" foot={<span>retiros ÷ promedio de activos</span>} onClick={() => nav("/nomina/provisiones")} />
      </div>

      {reporte && <Reporte onClose={() => setReporte(false)} mes={mes} fila={fila} ytd={ytd} proy={proy} resumen={resumen} alertas={alertas} rentabilidad={rentabilidad} filas={filas} />}
    </div>
  );
}

function Alertas({ alertas, nav, compacto }: { alertas: AlertaIndice[]; nav: (r: string) => void; compacto?: boolean }) {
  const grupos = ["Comerciales", "Costos y gastos", "Caja y cartera", "Personas", "Cumplimiento"] as const;
  const color = { rojo: "var(--red)", amarillo: "var(--orange)", azul: "var(--blue)" };
  return (
    <div style={compacto ? { maxHeight: 420, overflow: "auto" } : undefined}>
      {grupos.filter((g) => alertas.some((a) => a.grupo === g)).map((g) => (
        <div key={g} style={{ marginBottom: 8 }}>
          <div className="list-header" style={{ padding: "6px 10px" }}>{g}</div>
          {alertas.filter((a) => a.grupo === g).map((a, i) => (
            <div key={i} className="alert-row" style={{ padding: "8px 10px" }} onClick={() => nav(a.ruta)}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: color[a.nivel], marginTop: 5, flex: "none" }} />
              <div className="footnote" style={{ color: "var(--label)" }}>{a.texto}</div>
            </div>
          ))}
        </div>
      ))}
      {!alertas.length && <div className="footnote">Todo al día.</div>}
    </div>
  );
}

function Donut({ titulo, sub, data }: { titulo: string; sub: string; data: { name: string; value: number }[] }) {
  return (
    <Card title={titulo} sub={sub}>
      {data.length ? (
        <>
          <div style={{ height: 160 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={3} cornerRadius={6} stroke="none">{data.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}</Pie>
                <Tooltip content={<ChartTip money />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <Legend items={data.map((d, i) => ({ label: `${d.name} ${pesosCortos(d.value)}`, color: PALETA[i % PALETA.length] }))} />
        </>
      ) : <div className="footnote">Sin datos en el mes.</div>}
    </Card>
  );
}

function PyGTabla({ filas, presupuesto, catCostos }: { filas: FilaPyG[]; presupuesto: Record<string, { ingresos: number; costos: number; gastos: number }>; catCostos: string[] }) {
  const cats = Array.from(new Set(filas.flatMap((f) => Object.keys(f.costosGastos))));
  const tot = sumarPyG(filas);
  const pres = Object.entries(presupuesto).filter(([m]) => filas.some((f) => f.mes === m)).reduce((a, [, p]) => ({ ingresos: a.ingresos + p.ingresos, costos: a.costos + p.costos, gastos: a.gastos + p.gastos }), { ingresos: 0, costos: 0, gastos: 0 });
  const filaT = (label: string, get: (f: FilaPyG) => number, total: number, b = false, presu?: number) => (
    <tr className={b ? "total" : ""}>
      <td className="sticky-col" style={b ? { fontWeight: 700 } : undefined}>{label}</td>
      {filas.map((f) => <td key={f.mes} className="r">{get(f) ? ax(get(f)) : "—"}</td>)}
      <td className="r"><b>{ax(total)}</b></td>
      <td className="r">{presu ? ax(presu) : "—"}</td>
      <td className="r">{presu ? pct((total - presu) / presu, 0) : "—"}</td>
    </tr>
  );
  return (
    <div className="table-wrap">
      <table className="t">
        <thead><tr><th className="sticky-col">Concepto</th>{filas.map((f) => <th key={f.mes} className="r">{f.label}{!f.nominaRegistrada && f.ingresos ? " *" : ""}</th>)}<th className="r">Total</th><th className="r">Presupuesto</th><th className="r">Var.</th></tr></thead>
        <tbody>
          {(Object.keys(TIPOS_LABEL) as Factura["tipo"][]).map((t) => filaT(`Ingresos · ${TIPOS_LABEL[t]}`, (f) => f.ingresosPorTipo[t], filas.reduce((s, f) => s + f.ingresosPorTipo[t], 0)))}
          {filaT("Ingresos propios", (f) => f.ingresos, tot.ingresos, true, pres.ingresos)}
          {cats.filter((c) => catCostos.includes(c)).map((c) => filaT(`· ${c}`, (f) => f.costosGastos[c] ?? 0, filas.reduce((s, f) => s + (f.costosGastos[c] ?? 0), 0)))}
          {filaT("Costos", (f) => f.costos, tot.costos, true, pres.costos)}
          {filaT("Utilidad bruta", (f) => f.utilidadBruta, tot.utilidadBruta, true)}
          {cats.filter((c) => !catCostos.includes(c)).map((c) => filaT(`· ${c}`, (f) => f.costosGastos[c] ?? 0, filas.reduce((s, f) => s + (f.costosGastos[c] ?? 0), 0)))}
          {filaT("Gastos", (f) => f.gastos, tot.gastos, true, pres.gastos)}
          {filaT("Utilidad operacional", (f) => f.utilidadOperacional, tot.utilidadOperacional, true)}
          {filaT("Compensación socios", (f) => f.socios, tot.socios)}
          {filaT("Utilidad final", (f) => f.utilidadFinal, tot.utilidadFinal, true)}
        </tbody>
      </table>
      <div className="caption" style={{ padding: "8px 12px" }}>* Mes sin nómina registrada en el sistema. Gastos de categorías no salariales vienen del módulo Gastos y costos.</div>
    </div>
  );
}

function Reporte({ onClose, mes, fila, ytd, proy, resumen, alertas, rentabilidad, filas }: {
  onClose: () => void; mes: string; fila: FilaPyG; ytd: ReturnType<typeof sumarPyG>; proy: ReturnType<typeof proyeccionCierre>; resumen: string[];
  alertas: AlertaIndice[]; rentabilidad: { name: string; ingresos: number; costos: number; margen: number; pctMargen: number }[]; filas: FilaPyG[];
}) {
  const nm = `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
  return (
    <Modal open onClose={onClose} title={`Reporte · ${nm}`} size="wide" footer={<><span className="caption" style={{ marginRight: "auto" }}>Para PDF: Imprimir → Guardar como PDF (en la app desplegada).</span><button className="btn" onClick={onClose}>Cerrar</button><button className="btn primary" onClick={() => window.print()}><Printer />Imprimir</button></>}>
      <div className="print-area">
        <div className="payslip">
          <h2>LA BRUTAL · Reporte mensual de resultados</h2>
          <div style={{ color: "#666" }}>{nm} · generado {fecha(hoy())}</div>
          <h3 style={{ marginTop: 16 }}>Resumen ejecutivo</h3>
          {resumen.map((r, i) => <p key={i} style={{ margin: "4px 0" }}>{r}</p>)}
          <h3>Titulares del mes</h3>
          <table><tbody>
            {[["Ingresos propios", fila.ingresos], ["Costos", fila.costos], ["Gastos", fila.gastos], ["Utilidad bruta", fila.utilidadBruta], ["Utilidad operacional", fila.utilidadOperacional], ["Después de socios", fila.utilidadFinal]].map(([l, v]) => <tr key={l as string}><td>{l}</td><td className="r">{pesos(v as number)}</td></tr>)}
          </tbody></table>
          <h3>Acumulado del año</h3>
          <table><tbody>
            {[["Ingresos", ytd.ingresos], ["Utilidad operacional", ytd.utilidadOperacional], ["Margen operacional", null]].map(([l, v]) => <tr key={l as string}><td>{l}</td><td className="r">{v === null ? pct(ytd.margenOperacional, 0) : pesos(v as number)}</td></tr>)}
          </tbody></table>
          <h3>Proyección de cierre</h3>
          <table><tbody>
            <tr><td>Conservador</td><td className="r">{pesos(proy.conservador)}</td></tr><tr><td>Base</td><td className="r">{pesos(proy.base)}</td></tr><tr><td>Optimista</td><td className="r">{pesos(proy.optimista)}</td></tr>
            {proy.meta > 0 && <tr className="tot"><td>Brecha vs meta</td><td className="r">{pesos(proy.meta - proy.base)}</td></tr>}
          </tbody></table>
          <h3>Estado de resultados</h3>
          <table><tbody>
            {filas.filter((f) => f.ingresos || f.costos).map((f) => <tr key={f.mes}><td>{f.label}</td><td className="r">{pesos(f.ingresos)}</td><td className="r">{pesos(f.utilidadOperacional)}</td></tr>)}
          </tbody></table>
          <h3>Rentabilidad por cliente</h3>
          <table><tbody>{rentabilidad.slice(0, 15).map((r) => <tr key={r.name}><td>{r.name}</td><td className="r">{pesos(r.ingresos)}</td><td className="r">{pct(r.pctMargen, 0)}</td></tr>)}</tbody></table>
          <h3>Alertas</h3>
          {alertas.filter((a) => a.nivel !== "azul").map((a, i) => <p key={i} style={{ margin: "3px 0" }}>• [{a.grupo}] {a.texto}</p>)}
        </div>
      </div>
      <Badge color="gray">Vista previa</Badge>
    </Modal>
  );
}
