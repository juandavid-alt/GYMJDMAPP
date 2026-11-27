import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ArrowUpRight, Banknote, BellRing, Building2, ChevronRight, CircleDollarSign, FileBarChart, HandCoins, Receipt, ReceiptText,
  RefreshCw, Sparkles, TrendingUp, UserMinus, UserPlus, Users, FileWarning, Pin, Trash2,
} from "lucide-react";
import { nombreSaludo, useDB, useSesion } from "../../data/store";
import { guardarConfigIndice } from "../../data/storeFin";
import { calcPeriodo, periodoActual } from "../../data/selectors";
import {
  agingTotales, cartera, contratosPorVencer, facturasCalc, mesCausado, mesesDelAnio, proyeccionCierre, pyg, serieFacturacion, sumarPyG, TIPOS_LABEL, ultimos12, type Base,
} from "../../data/selectorsFin";
import { alertasEmpresa } from "../../data/alertasEmpresa";
import { serieMensual } from "../../domain/empleados";
import { cuentaEnFacturado, valorVigente, type Factura } from "../../domain/facturacion";
import { diffDias, hoy, MESES, mesAnterior, mesId } from "../../domain/fechas";
import { fecha, pct, pesos, pesosCortos } from "../../lib/format";
import { Avatar, Badge, ChartTip, Legend, Seg, useToast } from "../../components/ui";
import { MODULOS, permitido } from "../../modules";
import { PyGTabla, Reporte } from "./piezas";

const ax = (n: number) => pesosCortos(n).replace("$ ", "");
const C = { ventas: "#FF2D55", caja: "#30C759", margen: "#0A7AFF", ingresos: "#30C759", egresos: "#FF9500", utilidad: "#0A7AFF" };
const COLOR_TIPO: Record<Factura["tipo"], string> = { FIJA: "#30C759", ADICIONAL: "#0A7AFF", "ONE SHOT": "#AF52DE", PAUTA: "#FF9500" };
const ROL_LABEL: Record<string, string> = { ADMINISTRADOR: "Administrador · Socio", COORDINACION: "Coordinación administrativa", CONTADORA: "Contadora", CONSULTA: "Consulta financiera", EMPLEADO: "Empleado" };

// ---------------- Anillos (estilo Actividad de Apple Watch) ----------------

function Anillos({ datos, size = 190 }: { datos: { valor: number; color: string }[]; size?: number }) {
  const grosor = size * 0.105;
  const gap = grosor * 0.18;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Anillos de avance del mes">
      {datos.map((d, i) => {
        const r = size / 2 - grosor / 2 - i * (grosor + gap);
        const c = 2 * Math.PI * r;
        const v = Math.max(0, Math.min(1, d.valor));
        return (
          <g key={i} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeOpacity={0.22} strokeWidth={grosor} />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={grosor} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} style={{ transition: "stroke-dasharray 1.2s cubic-bezier(.32,.72,0,1)" }} />
          </g>
        );
      })}
    </svg>
  );
}

// ---------------- Widget ----------------

function Widget({ tamano = "s", modulo, titulo, children, onClick, accion }: { tamano?: "s" | "m" | "l"; modulo: string; titulo?: string; children: ReactNode; onClick?: () => void; accion?: ReactNode }) {
  const m = MODULOS.find((x) => x.slug === modulo)!;
  const I = m.icono;
  return (
    <div className={`widget w-${tamano}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="widget-head">
        <span className="widget-icon" style={{ background: m.gradiente }}><I /></span>
        <span className="widget-title">{titulo ?? m.nombre}</span>
        {accion ?? <ChevronRight size={16} className="widget-chev" />}
      </div>
      {children}
    </div>
  );
}

function relativo(ts: string) {
  const d = diffDias(ts.slice(0, 10), hoy());
  if (d <= 0) {
    const h = Math.round((Date.now() - Date.parse(ts)) / 3_600_000);
    return h <= 0 ? "ahora" : `hace ${h} h`;
  }
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  return fecha(ts.slice(0, 10));
}

interface Evento { ts: string; icono: ReactNode; color: string; titulo: string; detalle: string; ruta: string; }

export default function Inicio() {
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const toast = useToast();
  const ref = hoy();
  const [mes, setMes] = useState(ref.slice(0, 7));
  const [base, setBase] = useState<Base>("CAUSADO");
  const [conIva, setConIva] = useState(false);
  const [verPyG, setVerPyG] = useState(false);
  const [reporte, setReporte] = useState(false);
  const [nota, setNota] = useState("");
  const anio = Number(mes.slice(0, 4));
  const nombreMes = MESES[Number(mes.slice(5, 7)) - 1];
  const meses = mesesDelAnio(anio);
  const verFinanzas = sesion.rol === "ADMINISTRADOR" || sesion.rol === "CONSULTA";
  const puede = (slug: string) => permitido(sesion.rol, slug);

  const filas = useMemo(() => pyg(db, meses, base, conIva), [db, base, conIva, anio]); // eslint-disable-line react-hooks/exhaustive-deps
  const fila = filas.find((f) => f.mes === mes)!;
  // Los datos arrancan con la migración: los meses vacíos anteriores no se grafican
  const desde = filas.find((f) => f.ingresos || f.costos || f.gastos)?.mes ?? mes;
  const filasVis = filas.filter((f) => f.mes >= desde && f.mes <= (mes > ref.slice(0, 7) ? mes : ref.slice(0, 7)));
  const ant = mesAnterior(anio, Number(mes.slice(5, 7)));
  const filaAnt = filas.find((f) => f.mes === mesId(ant.anio, ant.mes));
  const ytd = sumarPyG(filas.filter((f) => f.mes <= mes));
  const proy = useMemo(() => proyeccionCierre(db), [db]);
  const serieF = useMemo(() => serieFacturacion(db, meses), [db, anio]); // eslint-disable-line react-hooks/exhaustive-deps
  const sf = serieF.find((s) => s.mes === mes)!;
  const fs = facturasCalc(db);
  const cs = cartera(db);
  const carteraTotal = cs.reduce((s, x) => s + x.c.saldo, 0);
  const vencida = cs.filter((x) => (x.dias ?? 0) < 0).reduce((s, x) => s + x.c.saldo, 0);
  const alertas = useMemo(() => alertasEmpresa(db, mes, filas), [db, mes, filas]);
  const perfil = db.empleados.find((e) => e.id === sesion.perfilId);
  const nombre = perfil ? nombreSaludo(perfil.nombreCompleto) : sesion.usuario;
  const hora = new Date().getHours();
  const saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const metaMes = db.configIndice.metaVentasAnual / 12;

  // Anillos: ventas (vs meta o vs programado), cartera al día, margen vs meta
  const anillos = [
    { label: metaMes ? "Ventas vs meta" : "Facturado vs programado", valor: metaMes ? fila.ingresos / metaMes : sf.programado ? sf.facturado / sf.programado : 0, texto: metaMes ? pct(fila.ingresos / metaMes, 0) : sf.programado ? pct(sf.facturado / sf.programado, 0) : "—", color: C.ventas },
    { label: "Cartera al día", valor: carteraTotal ? 1 - vencida / carteraTotal : 1, texto: carteraTotal ? pct(1 - vencida / carteraTotal, 0) : "100 %", color: C.caja },
    { label: "Margen vs meta", valor: db.configIndice.metaMargenOperacional ? fila.margenOperacional / db.configIndice.metaMargenOperacional : 0, texto: fila.ingresos ? pct(fila.margenOperacional, 0) : "—", color: C.margen },
  ];

  // Lo que ha pasado este mes
  const iniMes = `${ref.slice(0, 7)}-01`;
  const emitidasMes = fs.filter((x) => cuentaEnFacturado(x.f) && (x.f.emision ?? "") >= iniMes);
  const pagosMes = fs.filter((x) => x.f.estado === "PAGADA" && (x.f.pago?.fecha ?? "") >= iniMes);
  const porEmitir = fs.filter((x) => x.f.estado === "PROGRAMADA" && x.f.fechaProgramada <= ref);
  const movEmp = serieMensual(db.empleados, [{ anio: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) }])[0];
  const per = periodoActual(db);
  const pcNom = per ? calcPeriodo(db, per) : null;
  const pendientes = db.notasCredito.filter((n) => n.estado === "SOLICITADA").length + db.propuestas.filter((p) => p.estado === "PENDIENTE").length;
  const resumenMes: { icono: ReactNode; color: string; valor: string; label: string; detalle: string; ruta: string; slug: string }[] = [
    { icono: <ReceiptText />, color: "#30B0C7", valor: pesosCortos(emitidasMes.reduce((s, x) => s + x.c.ingresoPropio, 0)), label: "Facturado", detalle: `${emitidasMes.length} facturas emitidas`, ruta: "/facturacion", slug: "facturacion" },
    { icono: <CircleDollarSign />, color: "#30C759", valor: pesosCortos(pagosMes.reduce((s, x) => s + (x.f.pago?.valorRecibido ?? 0), 0)), label: "Recaudado", detalle: `${pagosMes.length} pagos verificados`, ruta: "/ingresos", slug: "ingresos" },
    { icono: <Receipt />, color: "#FF9500", valor: String(porEmitir.length), label: "Por emitir", detalle: pesosCortos(porEmitir.reduce((s, x) => s + x.c.subtotal, 0)) + " sin IVA", ruta: "/facturacion?tab=lote", slug: "facturacion" },
    { icono: <HandCoins />, color: "#FF3B30", valor: pesosCortos(vencida), label: "Cartera vencida", detalle: `${cs.filter((x) => (x.dias ?? 0) < 0).length} facturas`, ruta: "/cartera", slug: "cartera" },
    { icono: <UserPlus />, color: "#AF52DE", valor: `${movEmp.ingresos} / ${movEmp.retiros}`, label: "Ingresos / retiros", detalle: "personas este mes", ruta: "/empleados", slug: "empleados" },
    { icono: <Banknote />, color: "#34C759", valor: pcNom ? pesosCortos(pcNom.total.neto) : "—", label: `Nómina ${per ? MESES[per.mes - 1].toLowerCase() : ""}`, detalle: per ? `neto · ${per.estado.toLowerCase()}` : "sin generar", ruta: "/nomina/mes", slug: "nomina" },
    { icono: <BellRing />, color: "#5856D6", valor: String(pendientes), label: "Por aprobar", detalle: "notas crédito y propuestas", ruta: "/facturacion?tab=notas", slug: "facturacion" },
  ].filter((t) => puede(t.slug));

  // Actividad reciente: historial + hechos de facturación y personas
  const eventos = useMemo<Evento[]>(() => {
    const out: Evento[] = [];
    for (const x of fs) {
      if (x.f.pago?.fecha) out.push({ ts: `${x.f.pago.fecha}T12:00:00`, icono: <CircleDollarSign />, color: "#30C759", titulo: `Pago de ${x.cli?.nombreComercial}`, detalle: pesos(x.f.pago.valorRecibido), ruta: "/ingresos" });
      if (x.f.emision && cuentaEnFacturado(x.f) && x.f.emision >= `${anio}-${String(Number(mes.slice(5, 7)) - 1 || 1).padStart(2, "0")}-01`) out.push({ ts: `${x.f.emision}T09:00:00`, icono: <ReceiptText />, color: "#30B0C7", titulo: `Factura ${x.f.numero ?? "emitida"} · ${x.cli?.nombreComercial}`, detalle: pesos(x.c.subtotal), ruta: "/facturacion?tab=facturas" });
    }
    for (const h of db.historial.slice(0, 80)) {
      if (h.usuario === "Migración") continue;
      const icon = h.evento.includes("RETIRO") ? <UserMinus /> : h.evento.includes("INGRESO") ? <UserPlus /> : h.evento.includes("RENOVACIÓN") ? <RefreshCw /> : h.evento.includes("NÓMINA") ? <Banknote /> : h.evento.includes("NOTA") ? <FileWarning /> : <Sparkles />;
      out.push({ ts: h.ts, icono: icon, color: h.evento.includes("RETIRO") ? "#FF3B30" : "#5856D6", titulo: `${h.evento.charAt(0)}${h.evento.slice(1).toLowerCase()}${h.nombre ? ` · ${h.nombre.split(" ").slice(0, 2).join(" ")}` : ""}`, detalle: h.detalle ?? h.nuevo ?? "", ruta: h.modulo === "NOMINA" ? "/nomina" : h.modulo === "EMPLEADOS" ? "/empleados" : "/facturacion" });
    }
    for (const e of db.empleados) if (e.inicioContrato >= iniMes && e.inicioContrato <= ref) out.push({ ts: `${e.inicioContrato}T08:00:00`, icono: <UserPlus />, color: "#AF52DE", titulo: `Ingresó ${e.nombreCompleto.split(" ").slice(0, 2).join(" ")}`, detalle: e.cargo, ruta: `/empleados/${e.id}` });
    return out.filter((e) => e.ts.slice(0, 10) <= ref).sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, 7);
  }, [db, fs, mes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Datos de widgets
  const ult6 = ultimos12().slice(-6);
  const pyg6 = useMemo(() => pyg(db, ult6, "CAUSADO", false).filter((f) => f.ingresos || f.costos || f.gastos).map((f) => ({ label: f.label, ingresos: f.ingresos, egresos: f.costos + f.gastos + f.socios, utilidad: f.utilidadFinal })), [db]); // eslint-disable-line react-hooks/exhaustive-deps
  const aging = agingTotales(db);
  const agingColores = ["#30C759", "#FFCC00", "#FF9500", "#FF6B35", "#FF3B30"];
  const activos = db.empleados.filter((e) => e.estatus === "ACTIVO" && !e.esSocio);
  const porContrato = [
    { name: "Fijo", value: activos.filter((e) => e.tipoContrato === "FIJO").length, color: "#0A7AFF" },
    { name: "Indefinido", value: activos.filter((e) => e.tipoContrato === "INDEFINIDO").length, color: "#AF52DE" },
    { name: "Prestación", value: activos.filter((e) => e.tipoContrato === "PS").length, color: "#FF9500" },
  ];
  const clientesActivos = db.clientes.filter((c) => c.estado === "ACTIVO");
  const fee = db.contratos.filter((c) => c.estado === "ACTIVO").reduce((s, c) => s + valorVigente(c, ref.slice(0, 7)), 0);
  const recaudoAnual = serieF.filter((s) => s.mes >= desde).map((s) => ({ label: s.label, v: s.recaudado }));
  const gastosMes = db.gastos.filter((g) => g.fecha.startsWith(ref.slice(0, 7)));
  const porTipoMes = (Object.keys(COLOR_TIPO) as Factura["tipo"][]).map((t) => ({ t, v: sf[t] as number })).filter((x) => x.v);
  const vencen = contratosPorVencer(db, 90);
  const urgentes = alertas.filter((a) => a.nivel === "rojo");

  // Panorama
  const cascada = [
    { name: "Ingresos", base: 0, valor: fila.ingresos, color: "#30C759" },
    { name: "Costos", base: fila.ingresos - fila.costos, valor: fila.costos, color: "#FF9500" },
    { name: "Gastos", base: fila.utilidadBruta - fila.gastos, valor: fila.gastos, color: "#AF52DE" },
    { name: "Socios", base: fila.utilidadOperacional - fila.socios, valor: fila.socios, color: "#FFCC00" },
    { name: "Utilidad", base: 0, valor: fila.utilidadFinal, color: fila.utilidadFinal >= 0 ? "#0A7AFF" : "#FF3B30" },
  ].map((x) => ({ ...x, base: Math.max(0, x.base) }));
  const rentabilidad = useMemo(() => {
    const m = new Map<string, { name: string; ingresos: number; costos: number }>();
    for (const x of fs) if (cuentaEnFacturado(x.f) && mesCausado(x.f).startsWith(String(anio))) { const e = m.get(x.f.clienteId) ?? { name: x.cli?.nombreComercial ?? "—", ingresos: 0, costos: 0 }; e.ingresos += x.c.ingresoPropio; m.set(x.f.clienteId, e); }
    for (const g of db.gastos) if (g.clienteId && g.tipo === "COSTO" && g.fecha.startsWith(String(anio))) { const e = m.get(g.clienteId); if (e) e.costos += g.valor; }
    return [...m.values()].map((e) => ({ ...e, margen: e.ingresos - e.costos, pctMargen: e.ingresos ? (e.ingresos - e.costos) / e.ingresos : 0 })).sort((a, b) => b.margen - a.margen);
  }, [fs, db, anio]);
  const delta = (a: number, b?: number) => (b ? (a - b) / Math.abs(b) : null);
  const D = ({ v, invert }: { v: number | null; invert?: boolean }) => v === null ? null : <span className={`trend ${v >= 0 ? "up" : "down"} ${invert ? "bad" : ""}`}><ArrowUpRight size={13} style={{ transform: v < 0 ? "rotate(90deg)" : undefined }} />{pct(Math.abs(v), 0)}</span>;

  return (
    <div className="fade-in inicio">
      {/* ---------- Saludo ---------- */}
      <section className="saludo">
        <div className="saludo-bg" />
        <div className="saludo-izq">
          <div className="row" style={{ gap: 14 }}>
            {perfil ? <Avatar e={perfil} size="lg" /> : <div className="avatar lg" style={{ background: "linear-gradient(160deg,#4C7DFF,#1534D6)" }}>{nombre.slice(0, 1)}</div>}
            <div>
              <div className="saludo-fecha">{saludo} · {new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</div>
              <h1 className="saludo-titulo">Hola, {nombre}</h1>
              <span className="saludo-rol">{ROL_LABEL[sesion.rol]}</span>
            </div>
          </div>
          <div className="saludo-chips">
            {urgentes.slice(0, 3).map((a, i) => (
              <button key={i} className="saludo-chip" onClick={() => nav(a.ruta)}><span className="dot-r" />{a.texto}</button>
            ))}
            {!urgentes.length && <span className="saludo-chip">Todo al día ✓</span>}
          </div>
        </div>
        {verFinanzas && (
          <div className="saludo-der">
            <Anillos datos={anillos} />
            <div className="anillos-leyenda">
              {anillos.map((a) => (
                <div key={a.label}>
                  <div className="anillo-label"><i style={{ background: a.color }} />{a.label}</div>
                  <div className="anillo-valor">{a.texto}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- Lo que ha pasado ---------- */}
      <div className="section-title">En {MESES[Number(ref.slice(5, 7)) - 1].toLowerCase()} <small>actualizado {new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</small></div>
      <div className="resumen-mes">
        {resumenMes.map((t) => (
          <button key={t.label} className="resumen-tile" onClick={() => nav(t.ruta)}>
            <span className="resumen-icon" style={{ background: t.color }}>{t.icono}</span>
            <span className="resumen-valor num">{t.valor}</span>
            <span className="resumen-label">{t.label}</span>
            <span className="resumen-det">{t.detalle}</span>
          </button>
        ))}
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <section className="card span2" style={{ padding: 14 }}>
          <div className="row between" style={{ padding: "4px 6px 8px" }}><div className="card-title">Actividad reciente</div><span className="caption hide-sm">lo último que pasó en la empresa</span></div>
          {eventos.length ? eventos.map((e, i) => (
            <div key={i} className="evento" onClick={() => nav(e.ruta)}>
              <span className="evento-icon" style={{ background: e.color }}>{e.icono}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="evento-titulo">{e.titulo}</div>
                <div className="caption" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.detalle}</div>
              </div>
              <span className="caption" style={{ whiteSpace: "nowrap" }}>{relativo(e.ts)}</span>
            </div>
          )) : <div className="footnote" style={{ padding: 10 }}>Aún no hay movimientos este mes.</div>}
        </section>
        <section className="card" style={{ padding: 14 }}>
          <div className="row between" style={{ padding: "4px 6px 8px" }}><div className="card-title">Atender hoy</div><Badge color="red">{urgentes.length} urgentes</Badge></div>
          <div className="stack" style={{ gap: 6 }}>
            {alertas.filter((a) => sesion.rol !== "COORDINACION" || a.grupo !== "Costos y gastos").slice(0, 6).map((a, i) => (
              <button key={i} className="atender" onClick={() => nav(a.ruta)}>
                <span className="atender-barra" style={{ background: a.nivel === "rojo" ? "var(--red)" : a.nivel === "amarillo" ? "var(--orange)" : "var(--blue)" }} />
                <span className="grow" style={{ textAlign: "left" }}><span className="caption">{a.grupo}</span><br />{a.texto}</span>
                <ChevronRight size={16} color="var(--label-3)" />
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* ---------- Widgets por módulo ---------- */}
      <div className="section-title">Tus módulos</div>
      <div className="widgets">
        {verFinanzas && (
          <Widget tamano="l" modulo="ingresos" titulo={`Finanzas · ${nombreMes.toLowerCase()}`} onClick={() => document.getElementById("panorama")?.scrollIntoView({ behavior: "smooth" })}>
            <div className="w-hero">
              <div className="caption">Utilidad después de socios</div>
              <div className="w-numero grande" style={{ color: fila.utilidadFinal < 0 ? "var(--red)" : undefined }}>{pesosCortos(fila.utilidadFinal)}</div>
              <div className="row wrap" style={{ gap: 8, marginTop: 4 }}>
                <span className="w-chip"><i style={{ background: C.ingresos }} />Ingresos {pesosCortos(fila.ingresos)}</span>
                <span className="w-chip"><i style={{ background: C.egresos }} />Egresos {pesosCortos(fila.costos + fila.gastos + fila.socios)}</span>
                <span className="w-chip">Margen {fila.ingresos ? pct(fila.utilidadFinal / fila.ingresos, 0) : "—"}</span>
              </div>
            </div>
            <div style={{ height: 150, marginTop: 8 }}>
              <ResponsiveContainer>
                <BarChart data={pyg6} margin={{ left: 0, right: 4, top: 6 }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="var(--separator)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={48} />
                  <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                  <Bar dataKey="ingresos" name="Ingresos" fill={C.ingresos} radius={[4, 4, 0, 0]} maxBarSize={22} />
                  <Bar dataKey="egresos" name="Egresos" fill={C.egresos} radius={[4, 4, 0, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!fila.nominaRegistrada && <div className="caption">Este mes no tiene nómina registrada.</div>}
          </Widget>
        )}
        {puede("facturacion") && (
          <Widget tamano="m" modulo="facturacion" onClick={() => nav("/facturacion")}>
            <div className="row between" style={{ alignItems: "flex-end" }}>
              <div><div className="caption">Facturado {nombreMes.toLowerCase()}</div><div className="w-numero">{pesosCortos(sf.facturado)}</div></div>
              <div style={{ textAlign: "right" }}><div className="caption">de {pesosCortos(sf.programado)} programado</div><div className="w-numero chico">{sf.programado ? pct(sf.facturado / sf.programado, 0) : "—"}</div></div>
            </div>
            <div className="w-barra">
              {porTipoMes.map((x) => <span key={x.t} style={{ width: `${(x.v / Math.max(1, sf.programado)) * 100}%`, background: COLOR_TIPO[x.t] }} title={`${TIPOS_LABEL[x.t]} ${pesos(x.v)}`} />)}
            </div>
            <Legend items={porTipoMes.map((x) => ({ label: TIPOS_LABEL[x.t], color: COLOR_TIPO[x.t] }))} />
            <div className="caption" style={{ marginTop: 6 }}>{porEmitir.length} por emitir · {db.facturas.filter((f) => f.datoIncompleto && f.estado !== "ANULADA").length} sin número</div>
          </Widget>
        )}
        {puede("cartera") && (
          <Widget tamano="m" modulo="cartera" onClick={() => nav("/cartera")}>
            <div className="row between" style={{ alignItems: "flex-end" }}>
              <div><div className="caption">Por cobrar</div><div className="w-numero">{pesosCortos(carteraTotal)}</div></div>
              <div style={{ textAlign: "right" }}><div className="caption">vencida</div><div className="w-numero chico" style={{ color: vencida ? "var(--red)" : undefined }}>{pesosCortos(vencida)}</div></div>
            </div>
            <div className="w-barra">
              {aging.map((a, i) => a.value > 0 && <span key={a.name} style={{ width: `${(a.value / Math.max(1, carteraTotal)) * 100}%`, background: agingColores[i] }} title={`${a.name} ${pesos(a.value)}`} />)}
            </div>
            <Legend items={aging.filter((a) => a.value).map((a) => ({ label: `${a.name} ${pesosCortos(a.value)}`, color: agingColores[aging.indexOf(a)] }))} />
          </Widget>
        )}
        {puede("nomina") && pcNom && per && (
          <Widget tamano="m" modulo="nomina" titulo={`Nómina · ${MESES[per.mes - 1].toLowerCase()}`} onClick={() => nav("/nomina/mes")}>
            <div className="row between" style={{ alignItems: "flex-end" }}>
              <div><div className="caption">Neto a consignar</div><div className="w-numero">{pesosCortos(pcNom.total.neto)}</div></div>
              <div style={{ textAlign: "right" }}><div className="caption">provisiones</div><div className="w-numero chico">{pesosCortos(pcNom.total.totalProvisiones)}</div></div>
            </div>
            <div className="pasos-mini">
              {["BORRADOR", "CARGADO", "EN APROBACIÓN", "APROBADO", "ENVIADO A PAGOS"].map((s, i, arr) => {
                const idx = arr.indexOf(per.estado);
                return <span key={s} className={i <= idx ? "on" : ""} title={s} />;
              })}
            </div>
            <div className="caption">{per.estado} · {per.filas.filter((f) => f.cargada).length}/{per.filas.length} filas cargadas</div>
          </Widget>
        )}
        {puede("empleados") && (
          <Widget modulo="empleados" onClick={() => nav("/empleados")}>
            <div className="row" style={{ gap: 10 }}>
              <PieChart width={76} height={76}><Pie data={porContrato} dataKey="value" cx="50%" cy="50%" innerRadius={24} outerRadius={36} paddingAngle={4} cornerRadius={4} stroke="none" isAnimationActive={false}>{porContrato.map((p) => <Cell key={p.name} fill={p.color} />)}</Pie></PieChart>
              <div><div className="w-numero">{activos.length}</div><div className="caption">activos</div></div>
            </div>
            <Legend items={porContrato.map((p) => ({ label: `${p.name} ${p.value}`, color: p.color }))} />
          </Widget>
        )}
        {puede("clientes") && (
          <Widget modulo="clientes" onClick={() => nav("/clientes")}>
            <div className="w-numero">{clientesActivos.length}</div>
            <div className="caption">clientes activos</div>
            <div className="w-numero chico" style={{ marginTop: 10 }}>{pesosCortos(fee)}</div>
            <div className="caption">fee mensual contratado{vencen.length ? ` · ${vencen.length} por vencer` : ""}</div>
          </Widget>
        )}
        {puede("ingresos") && (
          <Widget modulo="ingresos" onClick={() => nav("/ingresos")}>
            <div className="caption">Recaudado {anio}</div>
            <div className="w-numero">{pesosCortos(serieF.reduce((s, x) => s + x.recaudado, 0))}</div>
            <div style={{ height: 54, marginTop: 6 }}>
              <ResponsiveContainer>
                <BarChart data={recaudoAnual} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <Bar dataKey="v" fill="#30C759" radius={[3, 3, 0, 0]} maxBarSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Widget>
        )}
        {puede("gastos") && (
          <Widget modulo="gastos" onClick={() => nav("/gastos")}>
            <div className="caption">Gastos {nombreMes.toLowerCase()}</div>
            <div className="w-numero">{pesosCortos(gastosMes.reduce((s, g) => s + g.valor, 0))}</div>
            <div className="caption" style={{ marginTop: 8 }}>{gastosMes.length ? `${gastosMes.length} registros · ${new Set(gastosMes.map((g) => g.categoria)).size} categorías` : "Registra arriendo, software y proveedores para ver la utilidad real"}</div>
          </Widget>
        )}
      </div>

      {/* ---------- Panorama financiero ---------- */}
      {verFinanzas && (
        <>
          <div className="section-title" id="panorama">Panorama financiero
            <span className="right row wrap" style={{ gap: 8 }}>
              <input type="month" className="input sm" style={{ width: 150 }} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
              <Seg value={base} onChange={setBase} options={[{ value: "CAUSADO", label: "Causado" }, { value: "CAJA", label: "Caja" }]} />
              <Seg value={conIva ? "con" : "sin"} onChange={(v) => setConIva(v === "con")} options={[{ value: "sin", label: "Sin IVA" }, { value: "con", label: "Con IVA" }]} />
              <button className="btn glass-btn sm" onClick={() => setReporte(true)}><FileBarChart size={14} />Reporte</button>
            </span>
          </div>

          <div className="panorama-hero">
            {[
              { l: "Ingresos propios", v: fila.ingresos, d: delta(fila.ingresos, filaAnt?.ingresos), c: C.ingresos, inv: false },
              { l: "Costos + gastos", v: fila.costos + fila.gastos, d: delta(fila.costos + fila.gastos, filaAnt ? filaAnt.costos + filaAnt.gastos : undefined), c: C.egresos, inv: true },
              { l: "Utilidad operacional", v: fila.utilidadOperacional, d: delta(fila.utilidadOperacional, filaAnt?.utilidadOperacional), c: C.utilidad, inv: false, s: `margen ${pct(fila.margenOperacional, 0)}` },
              { l: "Después de socios", v: fila.utilidadFinal, d: delta(fila.utilidadFinal, filaAnt?.utilidadFinal), c: "#5856D6", inv: false, s: `socios ${pesosCortos(fila.socios)}` },
            ].map((k) => (
              <div key={k.l} className="ph-item">
                <span className="ph-barra" style={{ background: k.c }} />
                <div className="caption">{k.l}</div>
                <div className="ph-valor num">{pesosCortos(k.v)}</div>
                <div className="caption row" style={{ gap: 6 }}><D v={k.d} invert={k.inv} />{k.d !== null && "vs mes ant."}{k.s ? ` · ${k.s}` : ""}</div>
              </div>
            ))}
          </div>

          <div className="grid g3" style={{ marginTop: 16 }}>
            <section className="card span2">
              <div className="card-head"><div><div className="card-title">¿Ganamos o perdimos cada mes?</div><div className="card-sub">Ingresos, egresos y utilidad · {anio}</div></div><TrendingUp color="var(--tint)" /></div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer>
                  <ComposedChart data={filasVis.map((f) => ({ ...f, egresos: f.costos + f.gastos + f.socios }))} margin={{ left: 0, right: 8, top: 8 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                    <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                    <ReferenceLine y={0} stroke="var(--separator)" />
                    <Bar dataKey="ingresos" name="Ingresos" fill={C.ingresos} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="egresos" name="Egresos" fill={C.egresos} radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Line dataKey="utilidadFinal" name="Utilidad" stroke={C.utilidad} strokeWidth={2} dot={{ r: 5, strokeWidth: 2, stroke: "var(--bg-elev)", fill: C.utilidad }} type="linear" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <Legend items={[{ label: "Ingresos propios", color: C.ingresos }, { label: "Costos + gastos + socios", color: C.egresos }, { label: "Utilidad final", color: C.utilidad }]} />
            </section>
            <section className="card">
              <div className="card-head"><div><div className="card-title">¿Dónde se va la plata?</div><div className="card-sub">Cascada de {nombreMes.toLowerCase()}</div></div></div>
              <div style={{ height: 300 }}>
                <ResponsiveContainer>
                  <BarChart data={cascada} margin={{ left: 0, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                    <Tooltip content={({ active, payload }) => active && payload?.length ? <div className="tt"><div className="tt-title">{payload[0].payload.name}</div><b>{pesos(payload[0].payload.valor)}</b></div> : null} cursor={{ fill: "var(--fill-2)" }} />
                    <Bar dataKey="base" stackId="w" fill="transparent" />
                    <Bar dataKey="valor" stackId="w" radius={[4, 4, 4, 4]} maxBarSize={36}>{cascada.map((c) => <Cell key={c.name} fill={c.color} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>

          <div className="grid g3" style={{ marginTop: 16 }}>
            <section className="card span2">
              <div className="card-head">
                <div><div className="card-title">¿Cómo cerramos {anio}?</div><div className="card-sub">Proyección en tres escenarios</div></div>
                <div className="row" style={{ gap: 16 }}>
                  {[["Conservador", proy.conservador, "#FF9500"], ["Base", proy.base, "#0A7AFF"], ["Optimista", proy.optimista, "#30C759"]].map(([l, v, c]) => (
                    <div key={l as string} style={{ textAlign: "right" }}><div className="caption"><i className="dot-leg" style={{ background: c as string }} />{l}</div><div className="headline num">{pesosCortos(v as number)}</div></div>
                  ))}
                </div>
              </div>
              <div style={{ height: 240 }}>
                <ResponsiveContainer>
                  <AreaChart data={proy.filas.filter((f) => f.mes >= desde)} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={56} />
                    <Tooltip content={<ChartTip money />} />
                    <Area dataKey="optimista" name="Optimista" stroke="#30C759" fill="#30C759" fillOpacity={0.1} strokeWidth={2} type="monotone" />
                    <Area dataKey="base" name="Base" stroke="#0A7AFF" fill="#0A7AFF" fillOpacity={0.1} strokeWidth={2} type="monotone" />
                    <Area dataKey="conservador" name="Conservador" stroke="#FF9500" fill="#FF9500" fillOpacity={0.1} strokeWidth={2} type="monotone" />
                    <Line dataKey="costo" name="Costos y gastos" stroke="#FF3B30" strokeWidth={2} dot={false} type="monotone" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <Legend items={[{ label: "Optimista", color: "#30C759" }, { label: "Base", color: "#0A7AFF" }, { label: "Conservador", color: "#FF9500" }, { label: "Costos y gastos proyectados", color: "#FF3B30" }]} />
            </section>
            <section className="card">
              <div className="card-head"><div><div className="card-title">¿Vamos a cumplir?</div><div className="card-sub">Acumulado {anio}</div></div></div>
              <div className="meta-ring">
                <Anillos size={170} datos={[{ valor: db.configIndice.metaVentasAnual ? ytd.ingresos / db.configIndice.metaVentasAnual : 0, color: C.ventas }, { valor: db.configIndice.metaVentasAnual ? proy.base / db.configIndice.metaVentasAnual : 0, color: "#0A7AFF" }]} />
                <div className="meta-centro"><div className="w-numero">{pesosCortos(ytd.ingresos)}</div><div className="caption">acumulado</div></div>
              </div>
              <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                <div className="row between footnote"><span><i className="dot-leg" style={{ background: C.ventas }} />Real vs meta</span><b>{db.configIndice.metaVentasAnual ? pct(ytd.ingresos / db.configIndice.metaVentasAnual, 0) : "—"}</b></div>
                <div className="row between footnote"><span><i className="dot-leg" style={{ background: "#0A7AFF" }} />Proyección base vs meta</span><b>{db.configIndice.metaVentasAnual ? pct(proy.base / db.configIndice.metaVentasAnual, 0) : "—"}</b></div>
                {!db.configIndice.metaVentasAnual && <button className="btn sm" onClick={() => nav("/configuracion")}>Definir meta anual</button>}
                {!!db.configIndice.metaVentasAnual && proy.base < db.configIndice.metaVentasAnual && <div className="caption">Faltan {pesosCortos(db.configIndice.metaVentasAnual - proy.base)} en ventas</div>}
              </div>
            </section>
          </div>

          <div className="grid g3" style={{ marginTop: 16 }}>
            <section className="card">
              <div className="card-head"><div><div className="card-title">¿Qué tan estable es el ingreso?</div><div className="card-sub">Por tipo de factura</div></div></div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={filas.filter((f) => f.ingresos).map((f) => ({ label: f.label, ...f.ingresosPorTipo }))} margin={{ left: 0, right: 4, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                    <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                    {(Object.keys(COLOR_TIPO) as Factura["tipo"][]).map((t, i, a) => <Bar key={t} dataKey={t} name={TIPOS_LABEL[t]} stackId="t" fill={COLOR_TIPO[t]} maxBarSize={24} radius={i === a.length - 1 ? [4, 4, 0, 0] : undefined} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legend items={(Object.keys(COLOR_TIPO) as Factura["tipo"][]).map((t) => ({ label: TIPOS_LABEL[t], color: COLOR_TIPO[t] }))} />
            </section>
            <section className="card">
              <div className="card-head"><div><div className="card-title">¿Lo facturado se vuelve caja?</div><div className="card-sub">Facturado con IVA vs recaudado</div></div></div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={serieF.filter((s) => s.facturadoConIva || s.recaudado)} margin={{ left: 0, right: 4, top: 8 }} barGap={2}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={ax} width={52} />
                    <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                    <Bar dataKey="facturadoConIva" name="Facturado" fill="#30B0C7" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="recaudado" name="Recaudado" fill="#30C759" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legend items={[{ label: "Facturado con IVA", color: "#30B0C7" }, { label: "Recaudado", color: "#30C759" }]} />
            </section>
            <section className="card">
              <div className="card-head"><div><div className="card-title">¿Somos más eficientes?</div><div className="card-sub">Márgenes mensuales</div></div></div>
              <div style={{ height: 220 }}>
                <ResponsiveContainer>
                  <LineChart data={filas.filter((f) => f.ingresos)} margin={{ left: -8, right: 8, top: 8 }}>
                    <CartesianGrid vertical={false} stroke="var(--separator)" />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
                    <Tooltip content={({ active, payload, label }) => active && payload?.length ? <div className="tt"><div className="tt-title">{label}</div>{payload.map((p) => <div className="tt-row" key={p.name}><span><i style={{ background: p.color }} />{p.name}</span><b>{pct(p.value as number, 0)}</b></div>)}</div> : null} />
                    <ReferenceLine y={db.configIndice.metaMargenOperacional} stroke="var(--label-3)" />
                    <Line dataKey="margenBruto" name="Bruto" stroke="#30C759" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--bg-elev)", fill: "#30C759" }} />
                    <Line dataKey="margenOperacional" name="Operacional" stroke="#0A7AFF" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, stroke: "var(--bg-elev)", fill: "#0A7AFF" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <Legend items={[{ label: "Margen bruto", color: "#30C759" }, { label: "Margen operacional", color: "#0A7AFF" }, { label: "Meta operacional", color: "var(--label-3)" }]} />
            </section>
          </div>

          <div className="grid g3" style={{ marginTop: 16 }}>
            <section className="card span2">
              <div className="card-head"><div><div className="card-title">¿Qué clientes nos dejan plata?</div><div className="card-sub">Ingreso propio {anio} menos costos asignados</div></div><Building2 color="var(--tint)" /></div>
              <div style={{ height: Math.max(220, Math.min(rentabilidad.length, 14) * 26) }}>
                <ResponsiveContainer>
                  <BarChart data={rentabilidad.slice(0, 14)} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="var(--separator)" />
                    <XAxis type="number" axisLine={false} tickLine={false} tickFormatter={ax} />
                    <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={140} interval={0} />
                    <Tooltip content={<ChartTip money />} cursor={{ fill: "var(--fill-2)" }} />
                    <Bar dataKey="margen" name="Margen" radius={[0, 4, 4, 0]} maxBarSize={16}>{rentabilidad.slice(0, 14).map((r) => <Cell key={r.name} fill={r.margen >= 0 ? "#5856D6" : "#FF3B30"} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="card">
              <div className="card-head"><div><div className="card-title">Equipo</div><div className="card-sub">¿Es sostenible para lo que facturamos?</div></div><Users color="var(--tint)" /></div>
              <div className="equipo-grid">
                <div><div className="w-numero">{activos.length}</div><div className="caption">personas activas</div></div>
                <div><div className="w-numero">{fila.ingresos && fila.nominaRegistrada ? pct((fila.nominaOperativa + fila.nominaAdministrativa) / fila.ingresos, 0) : "—"}</div><div className="caption">nómina / ingresos</div></div>
                <div><div className="w-numero">{fila.headcount ? pesosCortos(fila.ingresos / fila.headcount) : "—"}</div><div className="caption">ingreso por persona</div></div>
                <div><div className="w-numero">{fila.headcount ? pesosCortos((fila.nominaOperativa + fila.nominaAdministrativa) / fila.headcount) : "—"}</div><div className="caption">costo por persona</div></div>
              </div>
              <div className="w-barra" style={{ marginTop: 14 }}>
                <span style={{ width: `${fila.ingresos ? Math.min(100, ((fila.nominaOperativa + fila.nominaAdministrativa) / fila.ingresos) * 100) : 0}%`, background: "#AF52DE" }} />
              </div>
              <div className="caption">Meta: nómina por debajo del {pct(db.configIndice.metaNominaPctIngresos, 0)} del ingreso</div>
            </section>
          </div>

          <section className="card" style={{ marginTop: 16 }}>
            <div className="row between">
              <div><div className="card-title">Estado de resultados {anio}</div><div className="card-sub">{base === "CAUSADO" ? "Causado" : "Caja"} · {conIva ? "con" : "sin"} IVA · YTD utilidad {pesosCortos(ytd.utilidadFinal)}</div></div>
              <button className="btn sm" onClick={() => setVerPyG((v) => !v)}>{verPyG ? "Ocultar" : "Ver detalle"}</button>
            </div>
            {verPyG && <div style={{ marginTop: 12 }}><PyGTabla filas={filas} presupuesto={db.configIndice.presupuesto} catCostos={["Nómina operativa", ...db.gastos.filter((g) => g.tipo === "COSTO").map((g) => g.categoria)]} /></div>}
          </section>

          {sesion.rol === "ADMINISTRADOR" && (
            <section className="card glass" style={{ marginTop: 16 }}>
              <div className="row" style={{ gap: 8 }}><Pin size={16} color="var(--orange)" /><div className="card-title">Notas de los socios</div></div>
              {db.configIndice.notas.map((n) => (
                <div key={n.id} className="row" style={{ marginTop: 8 }}>
                  <div className="grow footnote" style={{ color: "var(--label)" }}>{n.texto} <span className="caption">· {n.por} · {fecha(n.en.slice(0, 10))}</span></div>
                  <button className="btn icon sm plain" onClick={() => guardarConfigIndice({ notas: db.configIndice.notas.filter((x) => x.id !== n.id) })}><Trash2 size={14} /></button>
                </div>
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                <input className="input sm" placeholder="Fijar una nota para el equipo directivo…" value={nota} onChange={(e) => setNota(e.target.value)} />
                <button className="btn sm" disabled={!nota.trim()} onClick={() => { guardarConfigIndice({ notas: [{ id: String(Date.now()), texto: nota.trim(), por: sesion.usuario, en: new Date().toISOString() }, ...db.configIndice.notas] }); setNota(""); toast("Nota fijada"); }}>Fijar</button>
              </div>
            </section>
          )}
        </>
      )}

      {/* ---------- Resto de módulos ---------- */}
      <div className="section-title">Todos los módulos</div>
      <div className="shelf">
        {MODULOS.filter((m) => m.slug !== "inicio" && (!m.listo || puede(m.slug))).map((m) => {
          const I = m.icono;
          return (
            <button key={m.slug} className={`tile ${m.listo ? "" : "soon"}`} style={{ background: m.gradiente }} onClick={() => nav(m.ruta)}>
              {!m.listo && <span className="soon-badge">PRONTO</span>}
              <span className="tile-icon"><I /></span>
              <div><div className="tile-title">{m.nombre}</div><div className="tile-sub">{m.descripcion}</div></div>
            </button>
          );
        })}
      </div>

      {reporte && <Reporte onClose={() => setReporte(false)} mes={mes} fila={fila} ytd={ytd} proy={proy} resumen={[
        `Ingresos propios de ${nombreMes.toLowerCase()}: ${pesos(fila.ingresos)}.`,
        `Utilidad operacional: ${pesos(fila.utilidadOperacional)} (margen ${pct(fila.margenOperacional, 0)}).`,
        `Cartera por cobrar ${pesos(carteraTotal)}, vencida ${pesos(vencida)}.`,
        `Cierre proyectado (base): ${pesos(proy.base)}.`,
      ]} alertas={alertas} rentabilidad={rentabilidad} filas={filas} />}
    </div>
  );
}
