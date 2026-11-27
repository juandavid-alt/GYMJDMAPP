import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Printer } from "lucide-react";
import { proyeccionCierre, sumarPyG, TIPOS_LABEL, type FilaPyG } from "../../data/selectorsFin";
import type { Factura } from "../../domain/facturacion";
import { hoy, MESES } from "../../domain/fechas";
import { fecha, pct, pesos, pesosCortos } from "../../lib/format";
import { Badge, Card, ChartTip, Legend, Modal, PALETA } from "../../components/ui";

const ax = (n: number) => pesosCortos(n).replace("$ ", "");

export interface AlertaIndice { grupo: "Comerciales" | "Costos y gastos" | "Caja y cartera" | "Personas" | "Cumplimiento"; nivel: "rojo" | "amarillo" | "azul"; texto: string; ruta: string; }

export function Alertas({ alertas, nav, compacto }: { alertas: AlertaIndice[]; nav: (r: string) => void; compacto?: boolean }) {
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

export function Donut({ titulo, sub, data }: { titulo: string; sub: string; data: { name: string; value: number }[] }) {
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

export function PyGTabla({ filas, presupuesto, catCostos }: { filas: FilaPyG[]; presupuesto: Record<string, { ingresos: number; costos: number; gastos: number }>; catCostos: string[] }) {
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

export function Reporte({ onClose, mes, fila, ytd, proy, resumen, alertas, rentabilidad, filas }: {
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
