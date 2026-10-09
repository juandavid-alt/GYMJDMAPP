import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Banknote, Bell, CalendarClock, Cake, FileWarning, PiggyBank, Plus, Stethoscope, UserMinus, UserPlus, Users, Wallet } from "lucide-react";
import { useDB, useSesion } from "../data/store";
import { calcPeriodo, periodoActual, periodoPrevio, serieNomina } from "../data/selectors";
import { alertasEmpleados, estadoDocumentos, serieMensual, type Alerta } from "../domain/empleados";
import { hoy, MESES } from "../domain/fechas";
import { MODULOS } from "../modules";
import { pesos, pesosCortos, nombreCorto } from "../lib/format";
import { ChartTip, EstatusBadge, Kpi } from "../components/ui";

export const ALERTA_ICONO: Record<Alerta["tipo"], typeof Bell> = {
  CONTRATO: CalendarClock,
  DOCUMENTOS: FileWarning,
  LIQUIDACION: Wallet,
  CUMPLEAÑOS: Cake,
  EXAMEN: Stethoscope,
};
export const NIVEL_COLOR = { rojo: "var(--red)", amarillo: "var(--orange)", azul: "var(--blue)", verde: "var(--green)" };

export default function Home() {
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const ref = hoy();
  const anio = Number(ref.slice(0, 4));
  const mes = Number(ref.slice(5, 7));

  const emps = db.empleados.filter((e) => !e.esSocio);
  const activos = emps.filter((e) => e.estatus === "ACTIVO");
  const serie = useMemo(() => serieMensual(db.empleados, [{ anio, mes }])[0], [db.empleados, anio, mes]);
  const alertas = useMemo(() => alertasEmpleados(emps), [db.empleados]);
  const per = periodoActual(db);
  const pc = per ? calcPeriodo(db, per) : null;
  const prev = per ? periodoPrevio(db, per) : undefined;
  const pcPrev = prev ? calcPeriodo(db, prev) : null;
  const nomina = serieNomina(db, anio).filter((m) => m.existe);
  const docsIncompletos = activos.filter((e) => estadoDocumentos(e).semaforo !== "verde").length;
  const vencen = alertas.filter((a) => a.tipo === "CONTRATO").length;
  const delta = (a?: number, b?: number) => (a !== undefined && b ? (a - b) / b : null);

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <div className="caption" style={{ textTransform: "capitalize" }}>
            {new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <h1 className="large-title">Hola, {sesion.usuario.split(" ")[0]}</h1>
          <p className="subtitle" style={{ margin: 0 }}>Así está La Brutal en {MESES[mes - 1].toLowerCase()}.</p>
        </div>
        <div className="toolbar">
          <button className="btn glass-btn" onClick={() => nav("/empleados?nuevo=1")}><UserPlus />Nuevo empleado</button>
          <button className="btn primary" style={{ background: "var(--green)" }} onClick={() => nav(per ? `/nomina/mes/${per.id}` : "/nomina")}><Banknote />Preparar nómina</button>
        </div>
      </div>

      <div className="grid g3">
        <div className="hero span2" style={{ ["--tint" as string]: "#1F4FFF" }}>
          <div className="row between" style={{ alignItems: "flex-start", position: "relative", zIndex: 1 }}>
            <div>
              <div className="hero-eyebrow">Nómina de {MESES[(per?.mes ?? mes) - 1]}</div>
              <div className="hero-value">{pc ? pesos(pc.total.neto) : "—"}</div>
              <div className="hero-sub">Total a consignar · {pc?.total.personas ?? 0} personas (incluye socios)</div>
            </div>
            {per && <EstatusBadge estatus={per.estado} />}
          </div>
          <div style={{ height: 90, margin: "10px -8px -6px", position: "relative", zIndex: 1 }}>
            <ResponsiveContainer>
              <AreaChart data={nomina}>
                <defs>
                  <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="#fff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" hide />
                <Tooltip content={<ChartTip money />} cursor={false} />
                <Area dataKey="costo" name="Costo empresa (empleados)" stroke="#fff" strokeWidth={2.5} fill="url(#hg)" type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="hero-chips">
            <span className="hero-chip">Provisiones {pc ? pesosCortos(pc.total.totalProvisiones) : "—"}</span>
            <span className="hero-chip">Planilla {pc ? pesosCortos(pc.total.totalPlanilla) : "—"}</span>
            <span className="hero-chip">Costo empresa {pc ? pesosCortos(pc.total.costoTotal) : "—"}</span>
          </div>
        </div>

        <div className="card glass" style={{ padding: 8 }}>
          <div className="row between" style={{ padding: "10px 12px 4px" }}>
            <div className="card-title">Alertas</div>
            <span className="badge red">{alertas.filter((a) => a.nivel === "rojo").length} urgentes</span>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto" }}>
            {alertas.slice(0, 8).map((a) => {
              const I = ALERTA_ICONO[a.tipo];
              const e = db.empleados.find((x) => x.id === a.empleadoId)!;
              return (
                <div key={a.id} className="alert-row" onClick={() => nav(`/empleados/${a.empleadoId}`)}>
                  <span className="alert-dot" style={{ background: NIVEL_COLOR[a.nivel] }}><I /></span>
                  <div className="grow">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{a.titulo}</div>
                    <div className="caption">{nombreCorto(e.nombreCompleto)} · {a.detalle}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid g4" style={{ marginTop: 16 }}>
        <Kpi label="Empleados activos" value={activos.length} icon={<Users />} color={MODULOS[1].gradiente} foot={<span>sin socios</span>} onClick={() => nav("/empleados")} />
        <Kpi label="Ingresos / retiros del mes" value={<span>{serie.ingresos}<span className="muted"> / </span>{serie.retiros}</span>} icon={<UserMinus />} color="linear-gradient(145deg,#FF9F0A,#E07800)" foot={<span>rotación {serie.rotacion.toFixed(1)} %</span>} />
        <Kpi label="Costo empresa (empleados)" value={pc ? pesosCortos(pc.empleados.costoTotal) : "—"} icon={<PiggyBank />} color={MODULOS[2].gradiente} delta={delta(pc?.empleados.costoTotal, pcPrev?.empleados.costoTotal)} deltaLabel="vs mes anterior" invert />
        <Kpi label="Contratos por vencer" value={vencen} icon={<CalendarClock />} color="linear-gradient(145deg,#FF6961,#D70015)" foot={<span>{docsIncompletos} con documentos incompletos</span>} onClick={() => nav("/empleados")} />
      </div>

      <div className="section-title">Módulos</div>
      <div className="shelf">
        {MODULOS.filter((m) => m.slug !== "inicio").map((m) => {
          const I = m.icono;
          return (
            <button key={m.slug} className={`tile ${m.listo ? "" : "soon"}`} style={{ background: m.gradiente }} onClick={() => nav(m.ruta)}>
              {!m.listo && <span className="soon-badge">PRONTO</span>}
              <span className="tile-icon"><I /></span>
              <div>
                <div className="tile-title">{m.nombre}</div>
                <div className="tile-sub">{m.descripcion}</div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="section-title">Accesos rápidos</div>
      <div className="grid g3">
        {[
          { t: "Nuevo empleado", s: "Formulario por pasos con documentos", i: UserPlus, c: MODULOS[1].gradiente, to: "/empleados?nuevo=1" },
          { t: "Novedades del mes", s: "Incapacidades, horas extra, descuentos", i: Plus, c: MODULOS[2].gradiente, to: per ? `/nomina/mes/${per.id}` : "/nomina" },
          { t: "Simular aumento o cargo", s: "Comparativo antes vs después", i: Banknote, c: "linear-gradient(145deg,#5AC8FA,#1A8BA6)", to: "/nomina/simulador" },
        ].map((a) => (
          <button key={a.t} className="card row" style={{ cursor: "pointer", textAlign: "left", border: "1px solid var(--glass-edge)" }} onClick={() => nav(a.to)}>
            <span className="list-icon" style={{ background: a.c, width: 44, height: 44, borderRadius: 12 }}><a.i /></span>
            <div>
              <div className="headline">{a.t}</div>
              <div className="footnote">{a.s}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
