import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart,
} from "recharts";
import {
  CalendarClock, Download, FileWarning, Filter, Info, LayoutGrid, List, Search, Stethoscope, Upload, UserMinus, UserPlus, Users, Crown, History, X,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useDB, useSesion } from "../../data/store";
import {
  alertasEmpleados, antiguedadMeses, contar, estadoDocumentos, rangoEdad, serieMensual,
} from "../../domain/empleados";
import { edad, hoy, MESES_CORTOS, mesDe, ultimosMeses } from "../../domain/fechas";
import type { Empleado } from "../../domain/types";
import { enmascarar, fecha, fechaHora, nombreCorto, numero, titulo } from "../../lib/format";
import { Avatar, Badge, BarList, Card, ChartTip, Empty, EstatusBadge, Kpi, Legend, Modal, PALETA, Seg } from "../../components/ui";
import NuevoEmpleado from "./NuevoEmpleado";
import Importar from "./Importar";
import { RetirarSheet } from "./Acciones";
import { ALERTA_ICONO, NIVEL_COLOR } from "./alertasUi";

type Tab = "resumen" | "directorio" | "retirados" | "socios" | "historial";

export default function Empleados() {
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get("tab") as Tab) || "resumen";
  const setTab = (t: Tab) => setSp((s) => { s.set("tab", t); return s; });
  const nuevo = sp.get("nuevo") === "1";
  const [importar, setImportar] = useState(false);
  const [retirar, setRetirar] = useState<string | null>(null);
  const [ayuda, setAyuda] = useState(false);
  const esAdmin = sesion.rol === "ADMINISTRADOR";

  // Filtros
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [cargo, setCargo] = useState("");
  const [contrato, setContrato] = useState("");
  const [estatus, setEstatus] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [verFiltros, setVerFiltros] = useState(false);
  const filtrosActivos = [area, cargo, contrato, estatus, desde, hasta].filter(Boolean).length;

  const empleados = db.empleados.filter((e) => !e.esSocio);
  const filtrados = useMemo(() => {
    const s = q.trim().toUpperCase();
    return empleados.filter((e) =>
      (!s || e.nombreCompleto.includes(s) || e.id.includes(s) || e.numeroDocumento.includes(s)) &&
      (!area || e.area === area) && (!cargo || e.cargo === cargo) && (!contrato || e.tipoContrato === contrato) &&
      (!estatus || e.estatus === estatus) && (!desde || e.inicioContrato >= desde) && (!hasta || e.inicioContrato <= hasta),
    );
  }, [empleados, q, area, cargo, contrato, estatus, desde, hasta]);

  const activos = filtrados.filter((e) => e.estatus === "ACTIVO");
  const retirados = filtrados.filter((e) => e.estatus === "RETIRADO");
  const socios = db.empleados.filter((e) => e.esSocio);

  const exportar = () => {
    const filas = filtrados.map((e) => ({
      ESTATUS: e.estatus, "TIPO DE CONTRATO": e.tipoContrato, "INICIO DEL CONTRATO": fecha(e.inicioContrato),
      "TERMINACION DEL CONTRATO": fecha(e.terminacionContrato), "DURACIÓN DEL CONTRATO": e.duracionMeses ? `${e.duracionMeses} MESES` : "N/A",
      RENOVACIONES: e.renovaciones, "ID unico de empleado": e.id, "NOMBRE COMPLETO": e.nombreCompleto, "F. NACIMIENTO": fecha(e.fechaNacimiento),
      "TIPO DE DOCUMENTO": e.tipoDocumento, "# DE DOCUMENTO": esAdmin ? e.numeroDocumento : enmascarar(e.numeroDocumento), AREA: e.area, CARGO: e.cargo,
      CELULAR: e.celular, GENERO: e.genero, "CORREO PERSONAL": e.correo, DIRECCION: e.direccion, EPS: e.eps, ARL: e.arl, "FONDO DE PENSIONES": e.afp,
      BANCO: e.banco, "TIPO DE CUENTA": e.tipoCuenta, "NUMERO DE CUENTA": esAdmin ? e.numeroCuenta : enmascarar(e.numeroCuenta),
      "CONTACTO DE EMERGENCIA": e.emergenciaNombre, PARENTESCO: e.emergenciaParentesco, "CELULAR CONTACTO EMERGENCIA": e.emergenciaCelular,
      "ESTATUS EXAMEN MEDICO": e.examen.estatus, "FECHA DE RETIRO": fecha(e.retiro?.fechaSalida), "CAUSAL DE RETIRO": e.retiro?.causal ?? "",
      "ESTADO LIQUIDACIÓN": e.retiro?.estadoLiquidacion ?? "",
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), "BBDD EMPLEADOS");
    XLSX.writeFile(wb, `BBDD_EMPLEADOS_${hoy()}.xlsx`);
  };

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Empleados</h1>
          <p className="subtitle" style={{ margin: 0 }}>Base de datos maestra · {empleados.filter((e) => e.estatus === "ACTIVO").length} activos · el ID conecta todos los módulos</p>
        </div>
        <div className="toolbar">
          <button className="btn glass-btn icon" onClick={() => setAyuda(true)} aria-label="Cómo funciona"><Info /></button>
          <button className="btn glass-btn" onClick={() => setImportar(true)}><Upload />Importar</button>
          <button className="btn glass-btn" onClick={exportar}><Download />Excel</button>
          <button className="btn primary" onClick={() => setSp((s) => { s.set("nuevo", "1"); return s; })}><UserPlus />Nuevo empleado</button>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 18, gap: 10 }}>
        <Seg<Tab>
          glassy
          value={tab}
          onChange={setTab}
          options={[
            { value: "resumen", label: "Resumen" },
            { value: "directorio", label: "Directorio", count: activos.length },
            { value: "retirados", label: "Retirados", count: retirados.length },
            ...(esAdmin ? [{ value: "socios" as Tab, label: <><Crown size={14} />Socios</> }] : []),
            { value: "historial", label: <><History size={14} />Historial</> },
          ]}
        />
        <div className="search grow" style={{ maxWidth: 360 }}>
          <Search />
          <input placeholder="Buscar por nombre, ID o documento" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <button className={`btn ${filtrosActivos ? "primary" : "glass-btn"}`} onClick={() => setVerFiltros((v) => !v)}>
          <Filter />Filtros{filtrosActivos ? ` · ${filtrosActivos}` : ""}
        </button>
      </div>

      {verFiltros && (
        <div className="card glass fade-in" style={{ marginBottom: 18 }}>
          <div className="grid g6" style={{ gap: 10 }}>
            <select className="select" value={area} onChange={(e) => { setArea(e.target.value); setCargo(""); }}>
              <option value="">Todas las áreas</option>
              {db.listas.areas.map((a) => <option key={a}>{a}</option>)}
            </select>
            <select className="select" value={cargo} onChange={(e) => setCargo(e.target.value)}>
              <option value="">Todos los cargos</option>
              {db.listas.cargos.filter((c) => !area || c.area === area).map((c) => <option key={c.cargo}>{c.cargo}</option>)}
            </select>
            <select className="select" value={contrato} onChange={(e) => setContrato(e.target.value)}>
              <option value="">Todo contrato</option>
              {db.listas.tiposContrato.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
            <select className="select" value={estatus} onChange={(e) => setEstatus(e.target.value)}>
              <option value="">Todo estatus</option>
              <option>ACTIVO</option>
              <option>RETIRADO</option>
            </select>
            <input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} title="Ingreso desde" />
            <input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} title="Ingreso hasta" />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <span className="caption">El rango de fechas filtra por fecha de ingreso y define la ventana de las gráficas mensuales.</span>
            <button className="btn plain sm right" onClick={() => { setArea(""); setCargo(""); setContrato(""); setEstatus(""); setDesde(""); setHasta(""); }}><X size={14} />Limpiar</button>
          </div>
        </div>
      )}

      {tab === "resumen" && <Resumen lista={filtrados} desde={desde} hasta={hasta} onRetirar={setRetirar} />}
      {tab === "directorio" && <Directorio lista={activos} onRetirar={setRetirar} vacio={!empleados.length} onNuevo={() => setSp((s) => { s.set("nuevo", "1"); return s; })} />}
      {tab === "retirados" && <Retirados lista={retirados} />}
      {tab === "socios" && esAdmin && <Socios lista={socios} />}
      {tab === "historial" && <HistorialView filtro={q} />}

      <NuevoEmpleado open={nuevo} onClose={() => setSp((s) => { s.delete("nuevo"); return s; })} onCreado={(id) => nav(`/empleados/${id}`)} />
      <Importar open={importar} onClose={() => setImportar(false)} />
      <RetirarSheet id={retirar} onClose={() => setRetirar(null)} />
      <AyudaEmpleados open={ayuda} onClose={() => setAyuda(false)} />
    </div>
  );
}

// ---------------- Resumen (dashboard) ----------------

function Resumen({ lista, desde, hasta, onRetirar }: { lista: Empleado[]; desde: string; hasta: string; onRetirar: (id: string) => void }) {
  const nav = useNavigate();
  const ref = hoy();
  const { anio, mes } = mesDe(ref);
  const meses = useMemo(() => {
    if (desde || hasta) {
      const d = mesDe(desde || `${anio}-01-01`);
      const h = mesDe(hasta || ref);
      const n = (h.anio - d.anio) * 12 + (h.mes - d.mes) + 1;
      return ultimosMeses(h.anio, h.mes, Math.max(1, Math.min(36, n)));
    }
    return ultimosMeses(anio, mes, 12);
  }, [desde, hasta, anio, mes, ref]);
  const serie = useMemo(() => serieMensual(lista, meses).map((s) => ({ ...s, label: `${MESES_CORTOS[s.mes - 1]}` })), [lista, meses]);
  const actual = serieMensual(lista, [{ anio, mes }])[0];
  const activos = lista.filter((e) => e.estatus === "ACTIVO");
  const retirados = lista.filter((e) => e.estatus === "RETIRADO");
  const alertas = alertasEmpleados(lista, ref);
  const porVencer = alertas.filter((a) => a.tipo === "CONTRATO");
  const docsInc = activos.filter((e) => estadoDocumentos(e).semaforo !== "verde");
  const examPend = activos.filter((e) => e.examen.estatus === "PENDIENTE CITAR" || e.examen.estatus === "AGENDADO").length +
    retirados.filter((e) => e.examenEgreso && e.examenEgreso.estatus === "PENDIENTE CITAR").length;
  const antiguedad = activos.length ? activos.reduce((s, e) => s + antiguedadMeses(e), 0) / activos.length : 0;
  const rotacionProm = serie.length ? serie.reduce((s, x) => s + x.rotacion, 0) / serie.length : 0;
  const [dist, setDist] = useState<"eps" | "afp" | "banco">("eps");

  const contratoData = contar(activos, (e) => ({ FIJO: "Término fijo", INDEFINIDO: "Indefinido", PS: "Prestación de servicios" }[e.tipoContrato]));
  const piramide = [
    { name: "< 3 meses", value: activos.filter((e) => antiguedadMeses(e) < 3).length },
    { name: "3 – 6 meses", value: activos.filter((e) => antiguedadMeses(e) >= 3 && antiguedadMeses(e) < 6).length },
    { name: "6 – 12 meses", value: activos.filter((e) => antiguedadMeses(e) >= 6 && antiguedadMeses(e) < 12).length },
    { name: "1 – 2 años", value: activos.filter((e) => antiguedadMeses(e) >= 12 && antiguedadMeses(e) < 24).length },
    { name: "+ 2 años", value: activos.filter((e) => antiguedadMeses(e) >= 24).length },
  ];
  const edades = ["18–24", "25–29", "30–34", "35–39", "40+"].map((r) => ({ name: r, value: activos.filter((e) => rangoEdad(edad(e.fechaNacimiento)) === r).length }));

  if (!lista.length)
    return <Empty icon={<Users />} title="Aún no hay empleados" text="Crea el primero o importa la BBDD desde Excel." action={<button className="btn primary" onClick={() => nav("/empleados?nuevo=1")}><UserPlus />Crear el primero</button>} />;

  return (
    <>
      <div className="grid g6">
        <Kpi label="Activos" value={activos.length} icon={<Users />} color="var(--green)" foot={<span>{retirados.length} retirados</span>} />
        <Kpi label="Ingresos del mes" value={actual.ingresos} icon={<UserPlus />} color="var(--blue)" foot={<span>{MESES_CORTOS[mes - 1]} {anio}</span>} />
        <Kpi label="Retiros del mes" value={actual.retiros} icon={<UserMinus />} color="var(--red)" foot={<span>rotación {actual.rotacion.toFixed(1)} %</span>} />
        <Kpi label="Contratos por vencer" value={porVencer.length} icon={<CalendarClock />} color="var(--orange)" foot={<span>≤ 45 días</span>} />
        <Kpi label="Documentos incompletos" value={docsInc.length} icon={<FileWarning />} color="var(--yellow)" foot={<span>de {activos.length} activos</span>} />
        <Kpi label="Exámenes pendientes" value={examPend} icon={<Stethoscope />} color="var(--purple)" foot={<span>ingreso y egreso</span>} />
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Activos vs. retirados" sub="¿Estamos creciendo o perdiendo gente?" className="span2">
          <div style={{ height: 240 }}>
            <ResponsiveContainer>
              <LineChart data={serie} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Line dataKey="activos" name="Activos" stroke="var(--green)" strokeWidth={3} dot={false} type="monotone" />
                <Line dataKey="retirados" name="Retirados (acum.)" stroke="var(--red)" strokeWidth={3} dot={false} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ label: "Activos", color: "var(--green)" }, { label: "Retirados acumulados", color: "var(--red)" }]} />
        </Card>
        <Card title="Alertas" sub="Lo que hay que decidir a tiempo" style={{ padding: 12 }}>
          <div style={{ maxHeight: 268, overflow: "auto", margin: "0 -4px" }}>
            {alertas.length === 0 && <div className="footnote" style={{ padding: 12 }}>Todo al día ✨</div>}
            {alertas.map((a) => {
              const I = ALERTA_ICONO[a.tipo];
              const e = lista.find((x) => x.id === a.empleadoId)!;
              return (
                <div key={a.id} className="alert-row" onClick={() => nav(`/empleados/${a.empleadoId}`)}>
                  <span className="alert-dot" style={{ background: NIVEL_COLOR[a.nivel] }}><I /></span>
                  <div className="grow">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{nombreCorto(e.nombreCompleto)} · {a.titulo}</div>
                    <div className="caption">{a.detalle}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Ingresos vs. retiros" sub="Movimiento mensual de personal">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={serie} margin={{ left: -24, right: 4, top: 8 }} barGap={2}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="var(--blue)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="retiros" name="Retiros" fill="var(--red)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Rotación mensual" sub={`Promedio ${rotacionProm.toFixed(1)} % · retiros ÷ activos promedio`}>
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <AreaChart data={serie} margin={{ left: -24, right: 4, top: 8 }}>
                <defs>
                  <linearGradient id="rot" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--orange)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--orange)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} unit="%" />
                <Tooltip content={<ChartTip suffix=" %" />} />
                <Area dataKey="rotacion" name="Rotación" stroke="var(--orange)" strokeWidth={2.5} fill="url(#rot)" type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Tipo de contrato" sub="¿Cuánta gente sigue por prestación de servicios?">
          <div style={{ height: 170 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={contratoData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3} cornerRadius={6} stroke="none">
                  {contratoData.map((_, i) => <Cell key={i} fill={["var(--purple)", "var(--blue)", "var(--orange)"][i % 3]} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <Legend items={contratoData.map((d, i) => ({ label: `${d.name} · ${d.value}`, color: ["var(--purple)", "var(--blue)", "var(--orange)"][i % 3] }))} />
        </Card>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Por área" sub="Headcount activo"><BarList data={contar(activos, (e) => e.area).map((d) => ({ ...d, name: titulo(d.name) }))} /></Card>
        <Card title="Por cargo" sub="Top 8"><BarList data={contar(activos, (e) => e.cargo).slice(0, 8).map((d) => ({ ...d, name: titulo(d.name) }))} color="var(--purple)" /></Card>
        <Card title="Antigüedad" sub={`Promedio ${numero(antiguedad, 1)} meses`}><BarList data={piramide} color="var(--teal)" /></Card>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card
          title="Seguridad social y bancos"
          sub="Distribución de afiliaciones"
          action={<Seg value={dist} onChange={setDist} options={[{ value: "eps", label: "EPS" }, { value: "afp", label: "Pensión" }, { value: "banco", label: "Banco" }]} />}
        >
          <BarList data={contar(activos, (e) => (dist === "eps" ? e.eps : dist === "afp" ? e.afp : e.banco)).map((d) => ({ ...d, name: titulo(d.name) }))} color={dist === "eps" ? "var(--green)" : dist === "afp" ? "var(--indigo)" : "var(--orange)"} />
        </Card>
        <Card title="Rango de edades" sub="Activos">
          <div style={{ height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={edades} margin={{ left: -24, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} stroke="var(--separator)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--fill-2)" }} />
                <Bar dataKey="value" name="Personas" radius={[8, 8, 0, 0]}>
                  {edades.map((_, i) => <Cell key={i} fill={PALETA[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="Motivos de retiro" sub={`${retirados.length} retiros`}>
          {retirados.length ? <BarList data={contar(retirados, (e) => e.retiro?.causal ?? "").map((d) => ({ ...d, name: titulo(d.name) }))} color="var(--red)" /> : <div className="footnote">Sin retiros en el filtro</div>}
        </Card>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Estatus de examen médico" sub="Ingreso · activos">
          <BarList data={contar(activos, (e) => e.examen.estatus).map((d) => ({ ...d, name: titulo(d.name) }))} color="var(--purple)" />
        </Card>
        <Card title="Contratos FIJO por vencer" sub="Preaviso legal mínimo: 30 días" className="span2">
          {porVencer.length === 0 ? (
            <div className="footnote">Ningún contrato vence en los próximos 45 días.</div>
          ) : (
            <div className="list" style={{ boxShadow: "none" }}>
              {porVencer.map((a) => {
                const e = lista.find((x) => x.id === a.empleadoId)!;
                return (
                  <div key={a.id} className="list-row click" onClick={() => nav(`/empleados/${e.id}`)}>
                    <Avatar e={e} />
                    <div className="grow">
                      <div className="list-label">{nombreCorto(e.nombreCompleto)} <span className="caption">· {titulo(e.cargo)}</span></div>
                      <div className="caption">{a.detalle}</div>
                    </div>
                    <Badge color={a.nivel === "rojo" ? "red" : "yellow"}>{a.dias} días · {fecha(e.terminacionContrato)}</Badge>
                    <button className="btn sm danger" onClick={(ev) => { ev.stopPropagation(); onRetirar(e.id); }}>No renovar</button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

// ---------------- Directorio ----------------

function Directorio({ lista, onRetirar, vacio, onNuevo }: { lista: Empleado[]; onRetirar: (id: string) => void; vacio: boolean; onNuevo: () => void }) {
  const nav = useNavigate();
  const [vista, setVista] = useState<"tarjetas" | "tabla">("tarjetas");
  const [orden, setOrden] = useState<{ k: keyof Empleado; asc: boolean }>({ k: "id", asc: true });
  const ordenada = [...lista].sort((a, b) => {
    const r = String(a[orden.k] ?? "").localeCompare(String(b[orden.k] ?? ""), "es");
    return orden.asc ? r : -r;
  });
  if (vacio) return <Empty icon={<Users />} title="Aún no hay empleados" text="Crea el primero →" action={<button className="btn primary" onClick={onNuevo}><UserPlus />Nuevo empleado</button>} />;
  if (!lista.length) return <Empty icon={<Search />} title="Sin resultados" text="Ajusta la búsqueda o los filtros." />;
  const th = (k: keyof Empleado, label: string) => (
    <th className="sortable" onClick={() => setOrden((o) => ({ k, asc: o.k === k ? !o.asc : true }))}>
      {label}{orden.k === k ? (orden.asc ? " ↑" : " ↓") : ""}
    </th>
  );
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="footnote">{lista.length} activos</span>
        <div className="right">
          <Seg value={vista} onChange={setVista} options={[{ value: "tarjetas", label: <LayoutGrid size={15} /> }, { value: "tabla", label: <List size={15} /> }]} />
        </div>
      </div>
      {vista === "tarjetas" ? (
        <div className="people">
          {ordenada.map((e) => {
            const d = estadoDocumentos(e);
            return (
              <div key={e.id} className="person" onClick={() => nav(`/empleados/${e.id}`)}>
                <span className="sema" style={{ background: d.semaforo === "verde" ? "var(--green)" : d.semaforo === "rojo" ? "var(--red)" : "var(--yellow)" }} title={`Documentos ${d.completos}/${d.total}`} />
                <Avatar e={e} size="lg" />
                <div className="person-name">{nombreCorto(e.nombreCompleto)}</div>
                <div className="person-role">{titulo(e.cargo)}</div>
                <div className="person-badges">
                  <Badge color="purple">{e.id}</Badge>
                  <Badge color={e.tipoContrato === "PS" ? "orange" : e.tipoContrato === "FIJO" ? "blue" : "green"}>{e.tipoContrato}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead>
              <tr>
                {th("id", "ID")}
                {th("nombreCompleto", "Nombre")}
                {th("area", "Área")}
                {th("cargo", "Cargo")}
                {th("tipoContrato", "Contrato")}
                {th("inicioContrato", "Inicio")}
                {th("terminacionContrato", "Terminación")}
                <th>Documento</th>
                <th>Cuenta</th>
                <th>Docs</th>
                <th>Examen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordenada.map((e) => {
                const d = estadoDocumentos(e);
                return (
                  <tr key={e.id} className="click" onClick={() => nav(`/empleados/${e.id}`)}>
                    <td className="mono">{e.id}</td>
                    <td><div className="row"><Avatar e={e} /><b style={{ fontWeight: 600 }}>{e.nombreCompleto}</b></div></td>
                    <td>{titulo(e.area)}</td>
                    <td>{titulo(e.cargo)}</td>
                    <td>{e.tipoContrato}{e.duracionMeses ? ` · ${e.duracionMeses}m` : ""}</td>
                    <td className="num">{fecha(e.inicioContrato)}</td>
                    <td className="num">{fecha(e.terminacionContrato)}</td>
                    <td className="mono">{e.tipoDocumento} {enmascarar(e.numeroDocumento)}</td>
                    <td className="mono">{titulo(e.banco)} {enmascarar(e.numeroCuenta)}</td>
                    <td><Badge color={d.semaforo === "verde" ? "green" : d.semaforo === "rojo" ? "red" : "yellow"} dot>{d.completos}/{d.total}</Badge></td>
                    <td><EstatusBadge estatus={e.examen.estatus} /></td>
                    <td><button className="btn sm danger" onClick={(ev) => { ev.stopPropagation(); onRetirar(e.id); }}>Retirar</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Retirados({ lista }: { lista: Empleado[] }) {
  const nav = useNavigate();
  if (!lista.length) return <Empty icon={<UserMinus />} title="Sin retirados" text="Ningún registro se borra: los retiros aparecen aquí, separados de los activos." />;
  return (
    <div className="table-wrap restricted-not">
      <table className="t">
        <thead>
          <tr><th>ID</th><th>Nombre</th><th>Cargo</th><th>Contrato</th><th>Ingreso</th><th>Salida</th><th>Causal</th><th className="r">Liquidación</th><th>Estado</th><th>Examen egreso</th></tr>
        </thead>
        <tbody>
          {lista.sort((a, b) => (b.retiro?.fechaSalida ?? "").localeCompare(a.retiro?.fechaSalida ?? "")).map((e) => (
            <tr key={e.id} className="click" onClick={() => nav(`/empleados/${e.id}`)}>
              <td className="mono">{e.id}</td>
              <td><div className="row"><Avatar e={e} /><b style={{ fontWeight: 600 }}>{e.nombreCompleto}</b></div></td>
              <td>{titulo(e.cargo)}</td>
              <td>{e.tipoContrato}</td>
              <td className="num">{fecha(e.inicioContrato)}</td>
              <td className="num">{fecha(e.retiro?.fechaSalida)}</td>
              <td>{e.retiro?.causal === "SIN REGISTRAR" ? <Badge color="yellow" dot>Por registrar</Badge> : titulo(e.retiro?.causal ?? "")}</td>
              <td className="r">{e.retiro ? `$ ${e.retiro.valorLiquidacion.toLocaleString("es-CO")}` : "—"}</td>
              <td><EstatusBadge estatus={e.retiro?.estadoLiquidacion ?? ""} /></td>
              <td>{e.examenEgreso ? <EstatusBadge estatus={e.examenEgreso.estatus} /> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Socios({ lista }: { lista: Empleado[] }) {
  const nav = useNavigate();
  return (
    <>
      <div className="card glass" style={{ marginBottom: 16 }}>
        <div className="row"><Crown color="var(--yellow)" /><div><b>Sección exclusiva de ADMINISTRADOR.</b><div className="footnote">Los socios están excluidos de todas las gráficas e indicadores de empleados. Su nómina se liquida en la sección NÓMINA SOCIOS con totales propios.</div></div></div>
      </div>
      <div className="people">
        {lista.map((e) => (
          <div key={e.id} className="person" onClick={() => nav(`/empleados/${e.id}`)}>
            <Avatar e={e} size="lg" />
            <div className="person-name">{nombreCorto(e.nombreCompleto)}</div>
            <div className="person-role">{titulo(e.cargo)}</div>
            <div className="person-badges"><Badge color="yellow">Socio</Badge><Badge color="purple">{e.id}</Badge></div>
          </div>
        ))}
      </div>
    </>
  );
}

export function HistorialView({ filtro = "", empleadoId }: { filtro?: string; empleadoId?: string }) {
  const db = useDB();
  const [evento, setEvento] = useState("");
  const [modulo, setModulo] = useState("");
  const s = filtro.trim().toUpperCase();
  const items = db.historial.filter(
    (h) =>
      (!empleadoId || h.empleadoId === empleadoId) &&
      (!evento || h.evento === evento) &&
      (!modulo || h.modulo === modulo) &&
      (!s || (h.nombre ?? "").includes(s) || (h.empleadoId ?? "").includes(s)),
  );
  const eventos = [...new Set(db.historial.map((h) => h.evento))].sort();
  return (
    <>
      {!empleadoId && (
        <div className="row wrap" style={{ marginBottom: 12 }}>
          <select className="select" style={{ width: 220 }} value={modulo} onChange={(e) => setModulo(e.target.value)}>
            <option value="">Todos los módulos</option><option>EMPLEADOS</option><option>NOMINA</option><option>CONFIGURACION</option>
          </select>
          <select className="select" style={{ width: 260 }} value={evento} onChange={(e) => setEvento(e.target.value)}>
            <option value="">Todos los eventos</option>
            {eventos.map((e) => <option key={e}>{e}</option>)}
          </select>
          <span className="footnote right">{items.length} registros · fuente de las gráficas mensuales</span>
        </div>
      )}
      <div className="table-wrap" style={{ maxHeight: 620 }}>
        <table className="t">
          <thead>
            <tr><th>Fecha</th><th>Evento</th><th>ID</th><th>Nombre</th><th>Campo</th><th>Valor anterior</th><th>Valor nuevo</th><th>Usuario</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            {items.slice(0, 400).map((h) => (
              <tr key={h.id}>
                <td className="num">{fechaHora(h.ts)}</td>
                <td><Badge color={h.evento.includes("RETIRO") ? "red" : h.evento.includes("INGRESO") || h.evento.includes("APROBADA") ? "green" : h.evento.includes("AUTOMÁTICA") ? "orange" : "blue"}>{h.evento}</Badge></td>
                <td className="mono">{h.empleadoId ?? "—"}</td>
                <td>{h.nombre ?? "—"}</td>
                <td>{h.campo ?? "—"}</td>
                <td className="muted">{h.anterior || "—"}</td>
                <td>{h.nuevo || "—"}</td>
                <td>{h.usuario}</td>
                <td className="footnote" style={{ whiteSpace: "normal", minWidth: 220 }}>{h.detalle ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function AyudaEmpleados({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reglas = [
    ["ID único", "Cada persona recibe un ID consecutivo LB0001. Es la llave que conecta Empleados, Nómina y los demás módulos; el salario vive aparte (BBDD SALARIO NÓMINA) y se cruza solo por ID."],
    ["Listas maestras", "Estatus, contrato, documento, EPS, pensión, banco y tipo de cuenta solo aceptan valores de las listas. El cargo depende del área."],
    ["Formato", "Nombres en MAYÚSCULAS, fechas DD/MM/AAAA, celulares de 10 dígitos. Los obligatorios vacíos se resaltan en amarillo."],
    ["Duplicados", "Si el número de documento ya existe, el sistema ofrece actualizar o reactivar con el mismo ID."],
    ["Contratos FIJO", "La terminación se calcula sola. Hasta 3 renovaciones de 6 meses; desde la 4.ª, mínimo 12 meses. Sin preaviso ni retiro se prorroga automáticamente y queda en el Historial."],
    ["Retiros", "Nunca se borra a nadie. Al retirar, el estatus pasa a RETIRADO, se guarda causal y liquidación, se cargan soportes en la carpeta Retiro y se crea el examen de egreso."],
    ["Exámenes", "PENDIENTE CITAR → AGENDADO (fecha y hora) → REALIZADO → APROBADO / APTO CON RESTRICCIONES / NO APTO (exigen certificado)."],
    ["Alertas", "Contratos FIJO a 45 días, documentos pendientes 5 días después del ingreso, liquidaciones pendientes, exámenes sin citar (> 3 días) o con cita vencida y cumpleaños."],
    ["Privacidad", "Socios ven todo; coordinación edita; cada empleado ve y actualiza solo su perfil. En vistas generales se ocultan documento y cuenta."],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Cómo funciona Empleados">
      <div className="list">
        {reglas.map(([t, d]) => (
          <div className="list-row flat" key={t} style={{ alignItems: "flex-start" }}>
            <div><div className="list-label">{t}</div><div className="footnote">{d}</div></div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
