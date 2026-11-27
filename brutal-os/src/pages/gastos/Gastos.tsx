import { useState } from "react";
import { Plus, Receipt, Repeat } from "lucide-react";
import { useDB } from "../../data/store";
import { guardarGasto } from "../../data/storeFin";
import { CATEGORIAS_GASTO } from "../../domain/catalogosFin";
import type { Gasto, TipoGasto } from "../../domain/facturacion";
import { hoy } from "../../domain/fechas";
import { fecha, pesos, pesosCortos, titulo } from "../../lib/format";
import { Badge, BarList, Card, Empty, Field, Kpi, Modal, MoneyInput, Seg, Switch, useToast } from "../../components/ui";

const TIPO_LABEL: Record<TipoGasto, string> = { COSTO: "Costo", GASTO: "Gasto", SOCIOS: "Compensación socios", FUERA: "Fuera del P&L" };

export default function Gastos() {
  const db = useDB();
  const [form, setForm] = useState<Gasto | "nuevo" | null>(null);
  const [mes, setMes] = useState(hoy().slice(0, 7));
  const delMes = db.gastos.filter((g) => !mes || g.fecha.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const suma = (t: TipoGasto) => delMes.filter((g) => g.tipo === t).reduce((s, g) => s + g.valor, 0);
  const porCat = Object.entries(delMes.filter((g) => g.tipo !== "FUERA").reduce((m, g) => ({ ...m, [g.categoria]: (m[g.categoria] ?? 0) + g.valor }), {} as Record<string, number>)).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Gastos y costos</h1>
          <p className="subtitle" style={{ margin: 0 }}>Todo pago que no es nómina, con categoría. Alimenta el Índice, la proyección y la rentabilidad por cliente.</p>
        </div>
        <div className="toolbar">
          <input type="month" className="input" style={{ width: 170 }} value={mes} onChange={(e) => setMes(e.target.value)} />
          <button className="btn primary" onClick={() => setForm("nuevo")}><Plus />Registrar gasto</button>
        </div>
      </div>
      <div className="grid g4">
        {(Object.keys(TIPO_LABEL) as TipoGasto[]).map((t) => <Kpi key={t} label={TIPO_LABEL[t]} value={pesosCortos(suma(t))} foot={<span>{delMes.filter((g) => g.tipo === t).length} registros · sin IVA</span>} />)}
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Por categoría" sub="Costos, gastos y socios">{porCat.length ? <BarList data={porCat} format={(n) => pesosCortos(n).replace("$ ", "")} /> : <div className="footnote">Sin registros en el periodo.</div>}</Card>
        <Card title="Recurrentes" sub="Se programan como las facturas fijas y alimentan la proyección" className="span2">
          {db.gastos.filter((g) => g.recurrente).length ? (
            <div className="list" style={{ boxShadow: "none" }}>
              {Object.values(db.gastos.filter((g) => g.recurrente).reduce((m, g) => ({ ...m, [g.proveedor + g.categoria]: g }), {} as Record<string, Gasto>)).map((g) => (
                <div key={g.id} className="list-row flat"><Repeat size={16} color="var(--blue)" /><span className="grow">{g.proveedor} <span className="caption">· {g.categoria}</span></span><b className="num">{pesos(g.valor)}</b></div>
              ))}
            </div>
          ) : <div className="footnote">Marca arriendo, software y contador como recurrentes al registrarlos.</div>}
        </Card>
      </div>
      <div className="section-title">Registros</div>
      {!delMes.length ? <Empty icon={<Receipt />} title="Sin gastos registrados" text="Registra el primero: el Índice necesita costos y gastos para calcular la utilidad real." action={<button className="btn primary" onClick={() => setForm("nuevo")}><Plus />Registrar gasto</button>} /> : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Fecha</th><th>Proveedor</th><th>Tipo</th><th>Categoría</th><th>Área</th><th>Cliente</th><th className="r">Valor sin IVA</th><th className="r">IVA</th><th /></tr></thead>
            <tbody>
              {delMes.map((g) => (
                <tr key={g.id} className="click" onClick={() => setForm(g)}>
                  <td className="num">{fecha(g.fecha)}</td><td>{g.proveedor}{g.recurrente && <Badge color="blue">Recurrente</Badge>}</td>
                  <td><Badge color={g.tipo === "COSTO" ? "orange" : g.tipo === "GASTO" ? "purple" : g.tipo === "SOCIOS" ? "yellow" : "gray"}>{TIPO_LABEL[g.tipo]}</Badge></td>
                  <td>{g.categoria}{g.subcategoria && <div className="caption">{g.subcategoria}</div>}</td><td>{titulo(g.area)}</td>
                  <td>{db.clientes.find((c) => c.id === g.clienteId)?.nombreComercial ?? "—"}</td>
                  <td className="r">{pesos(g.valor)}</td><td className="r">{pesos(g.iva)}</td><td />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {form && <GastoForm gasto={form === "nuevo" ? null : form} onClose={() => setForm(null)} />}
    </div>
  );
}

function GastoForm({ gasto, onClose }: { gasto: Gasto | null; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const [g, setG] = useState<Omit<Gasto, "id" | "creadoEn"> & { id?: string }>(gasto ?? { fecha: hoy(), proveedor: "", valor: 0, iva: 0, tipo: "GASTO", categoria: CATEGORIAS_GASTO.GASTO[0], subcategoria: "", recurrente: false, clienteId: null, area: "ADMINISTRATIVA", soporte: "" });
  const set = <K extends keyof Gasto>(k: K, v: Gasto[K]) => setG((s) => ({ ...s, [k]: v }));
  const ok = g.proveedor.trim() && g.valor > 0;
  const abrupto = !g.recurrente && g.valor > db.configIndice.topeGastoAbrupto;
  return (
    <Modal open onClose={onClose} title={gasto ? "Editar gasto" : "Registrar gasto"} size="wide"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!ok} onClick={() => { guardarGasto(g); toast("Gasto guardado · el Índice se actualiza"); onClose(); }}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Fecha"><input type="date" className="input" value={g.fecha} onChange={(e) => set("fecha", e.target.value)} /></Field>
        <Field label="Proveedor" required><input className="input" value={g.proveedor} onChange={(e) => set("proveedor", e.target.value)} /></Field>
        <Field label="Valor antes de IVA" required><MoneyInput value={g.valor} onChange={(v) => set("valor", v)} /></Field>
        <Field label="IVA"><MoneyInput value={g.iva} onChange={(v) => set("iva", v)} /></Field>
        <Field label="Clasificación" full><Seg value={g.tipo} onChange={(t) => { set("tipo", t); set("categoria", CATEGORIAS_GASTO[t][0]); }} options={(Object.keys(TIPO_LABEL) as TipoGasto[]).map((t) => ({ value: t, label: TIPO_LABEL[t] }))} /></Field>
        <Field label="Categoría"><select className="select" value={g.categoria} onChange={(e) => set("categoria", e.target.value)}>{CATEGORIAS_GASTO[g.tipo].map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Subcategoría"><input className="input" value={g.subcategoria} onChange={(e) => set("subcategoria", e.target.value)} placeholder="Ej. locaciones, alquiler de equipos" /></Field>
        <Field label="Área"><select className="select" value={g.area} onChange={(e) => set("area", e.target.value)}>{db.listas.areas.map((a) => <option key={a}>{a}</option>)}</select></Field>
        <Field label="Cliente asociado (rentabilidad por cliente)"><select className="select" value={g.clienteId ?? ""} onChange={(e) => set("clienteId", e.target.value || null)}><option value="">Ninguno</option>{db.clientes.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.nombreComercial}</option>)}</select></Field>
        <Field label="Soporte (link)"><input className="input" value={g.soporte} onChange={(e) => set("soporte", e.target.value)} /></Field>
        <div className="row between"><span>¿Recurrente? (arriendo, software, contador)</span><Switch on={g.recurrente} onChange={(v) => set("recurrente", v)} /></div>
      </div>
      {abrupto && <div className="caption" style={{ color: "var(--orange)", marginTop: 10 }}>Gasto no recurrente por encima del tope configurado ({pesos(db.configIndice.topeGastoAbrupto)}): aparecerá como incremento abrupto en el Índice.</div>}
    </Modal>
  );
}
