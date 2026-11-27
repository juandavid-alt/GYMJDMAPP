import { useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, PiggyBank, Plus, Wallet } from "lucide-react";
import * as XLSX from "xlsx";
import { guardarIngreso, marcarPago, registrarPagoPrestaciones, useDB, useSesion } from "../../data/store";
import { obligacionesCausadas, serieNomina, serieProvisiones } from "../../data/selectors";
import { hoy, MESES, MESES_CORTOS, mesId } from "../../domain/fechas";
import { enmascarar, fecha, pct, pesos, pesosCortos, titulo } from "../../lib/format";
import { Badge, Card, ChartTip, Empty, EstatusBadge, Field, Kpi, Legend, Modal, MoneyInput, Seg, useToast } from "../../components/ui";

const ax = (n: number) => pesosCortos(n).replace("$ ", "");

export function Provisiones() {
  const db = useDB();
  const sesion = useSesion();
  const toast = useToast();
  const anio = Number(hoy().slice(0, 4));
  const serie = useMemo(() => serieProvisiones(db, anio), [db, anio]);
  const oblig = useMemo(() => obligacionesCausadas(db, anio), [db, anio]);
  const saldo = db.provisiones.reduce((s, m) => s + m.valor, 0);
  const [nuevo, setNuevo] = useState(false);
  const [tipo, setTipo] = useState<"PAGO PRIMA" | "PAGO CESANTÍAS" | "PAGO INTERESES" | "PAGO VACACIONES">("PAGO PRIMA");
  const [valor, setValor] = useState(0);
  const [f, setF] = useState(hoy());
  const cuenta = db.parametros[db.parametros.length - 1].cuentaProvisiones;
  return (
    <>
      <div className="grid g4">
        <Kpi label="Saldo cuenta de provisiones" value={pesosCortos(saldo)} icon={<PiggyBank />} color="var(--indigo)" foot={<span>{cuenta.banco} {enmascarar(cuenta.numero)}</span>} />
        <Kpi label="Aportado en el año" value={pesosCortos(serie.reduce((s, m) => s + m.aportes, 0))} color="var(--green)" icon={<Plus />} />
        <Kpi label="Pagado en el año" value={pesosCortos(serie.reduce((s, m) => s + m.pagos, 0))} color="var(--red)" icon={<Wallet />} />
        <Kpi label="Causado pendiente" value={pesosCortos(oblig.reduce((s, o) => s + o.causado - o.pagado, 0))} color="var(--orange)" icon={<PiggyBank />} foot={<span>lo que se debe pagar</span>} />
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Saldo acumulado vs. pagos" sub={`Año ${anio}`} className="span2">
          <div style={{ height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={serie} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="aportes" name="Aportes" fill="var(--green)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pagos" name="Pagos" fill="var(--red)" radius={[6, 6, 0, 0]} />
                <Line dataKey="saldo" name="Saldo" stroke="var(--indigo)" strokeWidth={3} dot={false} type="monotone" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Aportes", color: "var(--green)" }, { label: "Pagos", color: "var(--red)" }, { label: "Saldo acumulado", color: "var(--indigo)" }]} />
        </Card>
        <Card title="Por prestación" sub="Causado en nóminas aprobadas vs. pagado" action={sesion.rol === "ADMINISTRADOR" && <button className="btn sm primary" onClick={() => setNuevo(true)}><Plus size={14} />Registrar pago</button>}>
          <div className="list" style={{ boxShadow: "none" }}>
            {oblig.map((o) => (
              <div className="list-row flat" key={o.name} style={{ alignItems: "flex-start" }}>
                <div className="grow"><div className="list-label">{o.name}</div><div className="caption">{o.cuando}</div></div>
                <div style={{ textAlign: "right" }}><b className="num">{pesos(o.causado - o.pagado)}</b><div className="caption">pagado {pesos(o.pagado)}</div></div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="section-title">Movimientos</div>
      <div className="table-wrap" style={{ maxHeight: 420 }}>
        <table className="t">
          <thead><tr><th>Fecha</th><th>Tipo</th><th>Detalle</th><th className="r">Valor</th></tr></thead>
          <tbody>
            {[...db.provisiones].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((m) => (
              <tr key={m.id}><td className="num">{fecha(m.fecha)}</td><td><Badge color={m.valor < 0 ? "red" : "green"} dot>{m.tipo}</Badge></td><td>{m.detalle}</td><td className="r" style={{ color: m.valor < 0 ? "var(--red)" : "var(--green)" }}>{pesos(m.valor)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Pago desde la cuenta de provisiones" size="narrow"
        footer={<><button className="btn" onClick={() => setNuevo(false)}>Cancelar</button><button className="btn primary" disabled={!valor} onClick={() => { registrarPagoPrestaciones(tipo, valor, f); toast("Pago registrado y descontado del saldo"); setNuevo(false); setValor(0); }}>Registrar</button></>}>
        <div className="stack">
          <Field label="Concepto">
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
              <option>PAGO PRIMA</option><option>PAGO CESANTÍAS</option><option>PAGO INTERESES</option><option>PAGO VACACIONES</option>
            </select>
          </Field>
          <Field label="Valor" hint={`Causado pendiente: ${pesos((() => { const o = oblig.find((x) => x.name === ({ "PAGO PRIMA": "Prima", "PAGO CESANTÍAS": "Cesantías", "PAGO INTERESES": "Intereses de cesantías", "PAGO VACACIONES": "Vacaciones" } as const)[tipo]); return o ? o.causado - o.pagado : 0; })())}`}><MoneyInput value={valor} onChange={setValor} /></Field>
          <Field label="Fecha"><input type="date" className="input" value={f} onChange={(e) => setF(e.target.value)} /></Field>
        </div>
      </Modal>
    </>
  );
}

export function Pagos() {
  const db = useDB();
  const sesion = useSesion();
  const periodos = [...new Set(db.cuentasPorPagar.map((c) => c.periodoId))].sort().reverse();
  const [pid, setPid] = useState(periodos[0] ?? "");
  const lista = db.cuentasPorPagar.filter((c) => c.periodoId === pid);
  const esAdmin = sesion.rol === "ADMINISTRADOR";
  if (!periodos.length) return <Empty icon={<Wallet />} title="Aún no hay pagos" text="Al aprobar una nómina se crean automáticamente las cuentas por pagar." />;
  const nomina = lista.filter((c) => c.tipo === "NOMINA");
  const dispersion = () => {
    const filas = nomina.map((c) => {
      const e = db.empleados.find((x) => x.id === c.empleadoId);
      return { "TIPO DOCUMENTO": e?.tipoDocumento ?? "", DOCUMENTO: e?.numeroDocumento ?? "", NOMBRE: c.beneficiario, BANCO: c.banco, "TIPO DE CUENTA": c.tipoCuenta, "NUMERO DE CUENTA": esAdmin ? c.numeroCuenta : enmascarar(c.numeroCuenta), VALOR: c.valor, REFERENCIA: `NOMINA ${pid}` };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "DISPERSION");
    XLSX.writeFile(wb, `DISPERSION_NOMINA_${pid}.xlsx`);
  };
  const [y, m] = pid.split("-").map(Number);
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 220 }} value={pid} onChange={(e) => setPid(e.target.value)}>
          {periodos.map((p) => { const [a, b] = p.split("-").map(Number); return <option key={p} value={p}>{MESES[b - 1]} {a}</option>; })}
        </select>
        <span className="footnote">Estas cuentas alimentarán el módulo Pagos (próximamente). Archivo de dispersión listo para la banca empresarial.</span>
        <button className="btn primary right" onClick={dispersion}><Download />Archivo de dispersión</button>
      </div>
      <div className="grid g3" style={{ marginBottom: 16 }}>
        <Kpi label={`Nómina ${MESES_CORTOS[m - 1]} ${y}`} value={pesosCortos(nomina.reduce((s, c) => s + c.valor, 0))} foot={<span>{nomina.length} pagos</span>} color="var(--green)" icon={<Wallet />} />
        <Kpi label="Provisiones" value={pesosCortos(lista.filter((c) => c.tipo === "PROVISIONES").reduce((s, c) => s + c.valor, 0))} color="var(--indigo)" icon={<PiggyBank />} />
        <Kpi label="Planilla PILA" value={pesosCortos(lista.filter((c) => c.tipo === "PLANILLA").reduce((s, c) => s + c.valor, 0))} foot={<span>vence {fecha(lista.find((c) => c.tipo === "PLANILLA")?.fechaLimite)}</span>} color="var(--teal)" icon={<Wallet />} />
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Tipo</th><th>Beneficiario</th><th>Banco</th><th>Cuenta</th><th>Fecha límite</th><th className="r">Valor</th><th>Estado</th><th /></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>{c.tipo}</td><td>{titulo(c.beneficiario)}</td><td>{titulo(c.banco) || "—"}</td><td className="mono">{c.numeroCuenta ? enmascarar(c.numeroCuenta) : "—"}</td>
                <td className="num">{fecha(c.fechaLimite)}</td><td className="r"><b>{pesos(c.valor)}</b></td><td><EstatusBadge estatus={c.estado} /></td>
                <td>{esAdmin && c.estado === "PENDIENTE" && <button className="btn sm success" onClick={() => marcarPago(c.id, "PAGADO")}>Marcar pagado</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Ingresos() {
  const db = useDB();
  const toast = useToast();
  const [anio, setAnio] = useState(Number(hoy().slice(0, 4)));
  const [vista, setVista] = useState<"tabla" | "grafica">("tabla");
  const serie = serieNomina(db, anio);
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 120 }} value={anio} onChange={(e) => setAnio(Number(e.target.value))}>
          {[anio - 1, anio, anio + 1].map((a) => <option key={a}>{a}</option>)}
        </select>
        <Seg value={vista} onChange={setVista} options={[{ value: "tabla", label: "Tabla" }, { value: "grafica", label: "Gráfica" }]} />
        <span className="footnote">Hoja INGRESOS MENSUALES: se registra a mano mientras se construye Facturación; luego se conectará a ese módulo.</span>
      </div>
      {vista === "tabla" ? (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Mes</th><th className="r" style={{ width: 240 }}>Ingresos de la agencia</th><th className="r">Costo nómina (empleados)</th><th className="r">Nómina / ingresos</th></tr></thead>
            <tbody>
              {serie.map((s, i) => (
                <tr key={s.id}>
                  <td>{MESES[i]}</td>
                  <td className="r"><IngresoInput valor={s.ingresos} onGuardar={(v) => { guardarIngreso(mesId(anio, i + 1), v); toast(`Ingresos de ${MESES[i]} guardados`); }} /></td>
                  <td className="r">{s.costo ? pesos(s.costo) : "—"}</td>
                  <td className="r">{s.ingresos && s.costo ? pct(s.pctIngresos) : "—"}</td>
                </tr>
              ))}
              <tr className="total"><td>Total</td><td className="r">{pesos(serie.reduce((a, s) => a + s.ingresos, 0))}</td><td className="r">{pesos(serie.reduce((a, s) => a + s.costo, 0))}</td><td /></tr>
            </tbody>
          </table>
        </div>
      ) : (
        <Card title="Ingresos vs. nómina">
          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <ComposedChart data={serie} margin={{ left: 0, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="var(--blue)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="costo" name="Nómina" fill="var(--green)" radius={[6, 6, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
      <div className="caption" style={{ marginTop: 8 }}>Se guarda al salir del campo y queda en el Historial.</div>
    </>
  );
}

function IngresoInput({ valor, onGuardar }: { valor: number; onGuardar: (v: number) => void }) {
  const [v, setV] = useState(valor);
  return (
    <div onBlur={() => v !== valor && onGuardar(v)}>
      <MoneyInput value={v} onChange={setV} />
    </div>
  );
}
