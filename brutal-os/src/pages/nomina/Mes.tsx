import { Fragment, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check, CheckCheck, ChevronLeft, ChevronRight, Columns3, Crown, Download, FileText, Lock, Printer, RefreshCw, RotateCcw, Send, ShieldCheck, TriangleAlert, Undo2,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  aprobarPeriodo, actualizarNovedades, cargarFila, cargarTodas, devolverFilas, enviarAprobacion, generarPeriodo, reabrirPeriodo,
  sincronizarPeriodo, solicitarOtp, useDB, useSesion,
} from "../../data/store";
import { calcPeriodo, periodoPrevio, type FilaCalc, type PeriodoCalc } from "../../data/selectors";
import { hoy, MESES, mesAnterior, mesId, mesSiguiente } from "../../domain/fechas";
import { calcularFila, type CalculoNomina, type Totales } from "../../domain/nomina";
import type { EstadoNomina, Novedades, Parametros } from "../../domain/types";
import { enmascarar, fecha, fechaHora, pct, pesos, pesosCortos, titulo } from "../../lib/format";
import { Badge, Card, Empty, Field, Kpi, Modal, MoneyInput, OtpSheet, useToast } from "../../components/ui";

const ESTADOS: EstadoNomina[] = ["BORRADOR", "CARGADO", "EN APROBACIÓN", "APROBADO", "ENVIADO A PAGOS"];

export default function Mes() {
  const { id } = useParams();
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const toast = useToast();
  const per = db.periodos.find((p) => p.id === id);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [detalle, setDetalle] = useState(false);
  const [otp, setOtp] = useState<"aprobar" | "reabrir" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [pedirMotivo, setPedirMotivo] = useState(false);
  const [devolver, setDevolver] = useState<Record<string, string>>({});
  const [verDevolver, setVerDevolver] = useState(false);
  const [desprendibles, setDesprendibles] = useState<string[] | null>(null);
  const esAdmin = sesion.rol === "ADMINISTRADOR";

  const ref = hoy();
  const sugerido = useMemo(() => {
    const ultimo = db.periodos[db.periodos.length - 1];
    if (!ultimo) return { anio: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) };
    return mesSiguiente(ultimo.anio, ultimo.mes);
  }, [db.periodos, ref]);

  if (!per) {
    return (
      <Empty
        icon={<FileText />}
        title="No hay nómina para este mes"
        text="Al generarla se crea una fila por empleado activo con su base salarial vigente y sus datos bancarios."
        action={<button className="btn primary" onClick={() => { generarPeriodo(sugerido.anio, sugerido.mes); nav(`/nomina/mes/${mesId(sugerido.anio, sugerido.mes)}`); }}>Generar nómina de {MESES[sugerido.mes - 1]} {sugerido.anio}</button>}
      />
    );
  }

  const pc = calcPeriodo(db, per);
  const prev = periodoPrevio(db, per);
  const pcPrev = prev ? calcPeriodo(db, prev) : null;
  const editable = per.estado === "BORRADOR" || per.estado === "CARGADO";
  const bloqueado = per.estado === "APROBADO" || per.estado === "ENVIADO A PAGOS";
  const variacion = (empId: string, costo: number) => {
    const p = pcPrev?.filas.find((x) => x.f.empleadoId === empId);
    return p && p.c.costoTotal ? (costo - p.c.costoTotal) / p.c.costoTotal : null;
  };
  const empleados = pc.filas.filter((x) => !x.f.esSocio);
  const socios = pc.filas.filter((x) => x.f.esSocio);
  const cambios = empleados.filter((x) => Math.abs(variacion(x.f.empleadoId, x.c.costoTotal) ?? 0) > pc.params.variacionAlertaPct);
  const conAlertas = pc.filas.filter((x) => x.c.alertas.length);
  const cargadas = per.filas.filter((f) => f.cargada).length;
  const sinSalario = db.empleados.filter((e) => e.estatus === "ACTIVO" && !per.filas.some((f) => f.empleadoId === e.id) && !db.salarios.some((s) => s.empleadoId === e.id));
  const anterior = mesAnterior(per.anio, per.mes);
  const siguiente = mesSiguiente(per.anio, per.mes);
  const existeSig = db.periodos.some((p) => p.id === mesId(siguiente.anio, siguiente.mes));
  const d = (a: number, b?: number) => (b ? (a - b) / b : null);

  const exportar = () => {
    const filas = pc.filas.filter((x) => esAdmin || !x.f.esSocio).map(({ f, c }) => ({
      SECCIÓN: f.esSocio ? "SOCIOS" : "EMPLEADOS", ID: f.empleadoId, NOMBRE: f.nombre, AREA: f.area, CARGO: f.cargo, DÍAS: f.novedades.diasContrato,
      "BASE PRESTACIONAL": Math.round(f.base), "AUX NO PRESTACIONAL": Math.round(c.auxNoPrestacional), "AUX TRANSPORTE": Math.round(c.auxTransporte),
      "HORAS EXTRA": Math.round(c.horasExtra), "INCAPACIDAD": Math.round(c.incapacidad), "BONIFICACIONES": Math.round(c.bonificacionSalarial + c.bonificacionNoSalarial),
      "INGRESO BRUTO": Math.round(c.ingresoBruto), "APORTE DE SALUD EMPLEADO": Math.round(c.saludEmpleado), "APORTE PENSION EMPLEADO": Math.round(c.pensionEmpleado),
      AFP: Math.round(c.fsp), RETENCIÓN: Math.round(c.retencion), "TOTAL DEDUCCIONES A EMPLEADOS": Math.round(c.totalDeducciones), DESCUENTOS: Math.round(c.descuentos),
      "PAGO TOTAL A EMPLEADO": Math.round(c.neto), CESANTIAS: Math.round(c.cesantias), PRIMA: Math.round(c.prima), "INTERESES DE LAS CESANTIAS": Math.round(c.interesesCesantias),
      VACACIONES: Math.round(c.vacaciones), "TOTAL PROVISIONES": Math.round(c.totalProvisiones), "MENSUAL EMPLEADO CON PROVISIONES": Math.round(c.netoConProvisiones),
      "APORTE SALUD": Math.round(c.saludEmpleador), "APORTE PENSION": Math.round(c.pensionEmpleador), CCF: Math.round(c.ccf), ARL: Math.round(c.arl), "ICBF + SENA": Math.round(c.icbf + c.sena),
      "APORTE EMPLEADOR": Math.round(c.aporteEmpleador), "TOTAL COSTO PLANILLA": Math.round(c.totalPlanilla), "DEDUCCIONES ASUMIDAS": Math.round(c.deduccionesAsumidas),
      "COSTO TOTAL EMPLEADO": Math.round(c.costoTotal), BANCO: f.banco, "TIPO DE CUENTA": f.tipoCuenta, "NUMERO DE CUENTA": esAdmin ? f.numeroCuenta : enmascarar(f.numeroCuenta),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), `NOMINA ${per.id}`);
    XLSX.writeFile(wb, `NOMINA_${per.id}.xlsx`);
  };

  const visibles = esAdmin ? pc.filas : empleados;
  const fila = abierta ? pc.filas.find((x) => x.f.empleadoId === abierta) : undefined;

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <button className="btn glass-btn icon" disabled={!db.periodos.some((p) => p.id === mesId(anterior.anio, anterior.mes))} onClick={() => nav(`/nomina/mes/${mesId(anterior.anio, anterior.mes)}`)}><ChevronLeft /></button>
        <div className="headline" style={{ fontSize: 24, minWidth: 200, textAlign: "center" }}>{MESES[per.mes - 1]} {per.anio}</div>
        <button className="btn glass-btn icon" disabled={!existeSig} onClick={() => nav(`/nomina/mes/${mesId(siguiente.anio, siguiente.mes)}`)}><ChevronRight /></button>
        {!existeSig && bloqueado && (
          <button className="btn glass-btn" onClick={() => { generarPeriodo(siguiente.anio, siguiente.mes); nav(`/nomina/mes/${mesId(siguiente.anio, siguiente.mes)}`); toast(`Nómina de ${MESES[siguiente.mes - 1]} generada`); }}>Generar {MESES[siguiente.mes - 1]}</button>
        )}
        <div className="toolbar right">
          {editable && <button className="btn glass-btn" onClick={() => { sincronizarPeriodo(per.id); toast("Sincronizada con la BBDD de empleados"); }}><RefreshCw />Sincronizar</button>}
          <button className="btn glass-btn" onClick={() => setDetalle((v) => !v)}><Columns3 />{detalle ? "Vista simple" : "Todas las columnas"}</button>
          <button className="btn glass-btn" onClick={exportar}><Download />Excel</button>
          <button className="btn glass-btn" onClick={() => setDesprendibles(visibles.map((x) => x.f.empleadoId))}><Printer />Desprendibles</button>
        </div>
      </div>

      {/* Flujo de estados */}
      <div className="card glass" style={{ marginBottom: 16, padding: "16px 18px" }}>
        <div className="row wrap" style={{ gap: 0 }}>
          {ESTADOS.map((s, i) => {
            const idx = ESTADOS.indexOf(per.estado);
            const done = i < idx || (i === idx && bloqueado);
            const on = i === idx;
            return (
              <Fragment key={s}>
                <div className="row" style={{ gap: 8, opacity: i > idx ? 0.45 : 1 }}>
                  <span style={{ width: 26, height: 26, borderRadius: 13, display: "grid", placeItems: "center", background: done ? "var(--green)" : on ? "var(--tint)" : "var(--fill)", color: done || on ? "#fff" : "var(--label-2)", fontSize: 12, fontWeight: 700 }}>
                    {done ? <Check size={14} /> : i + 1}
                  </span>
                  <span style={{ fontWeight: on ? 700 : 500, fontSize: 13 }}>{s}</span>
                </div>
                {i < ESTADOS.length - 1 && <div style={{ flex: 1, minWidth: 16, height: 2, background: i < idx ? "var(--green)" : "var(--separator)", margin: "0 10px" }} />}
              </Fragment>
            );
          })}
        </div>
        <div className="row wrap" style={{ marginTop: 14 }}>
          <span className="footnote">
            {per.estado === "BORRADOR" && `${cargadas}/${per.filas.length} filas cargadas. Revisa cada persona y presiona Cargar.`}
            {per.estado === "CARGADO" && "Todas las filas están cargadas: ya puedes enviar a aprobación."}
            {per.estado === "EN APROBACIÓN" && (esAdmin ? "Revisa el comparativo, devuelve filas con comentarios o aprueba con código." : "Pendiente de aprobación del ADMINISTRADOR (notificado por correo).")}
            {bloqueado && <>Aprobada por {per.aprobadoPor} el {fechaHora(per.aprobadoEn)} · mes bloqueado <Lock size={12} /></>}
          </span>
          <div className="toolbar right">
            {editable && cargadas < per.filas.length && <button className="btn" onClick={() => { cargarTodas(per.id); toast("Todas las filas cargadas"); }}><CheckCheck />Cargar todas</button>}
            {editable && <button className="btn primary" disabled={per.estado !== "CARGADO"} onClick={() => { enviarAprobacion(per.id); toast("Enviada a aprobación · ADMINISTRADOR notificado"); }}><Send />Enviar a aprobación</button>}
            {per.estado === "EN APROBACIÓN" && esAdmin && (
              <>
                <button className="btn danger" onClick={() => setVerDevolver(true)}><Undo2 />Devolver filas</button>
                <button className="btn primary success" onClick={() => setOtp("aprobar")}><ShieldCheck />Aprobar mes</button>
              </>
            )}
            {bloqueado && esAdmin && <button className="btn" onClick={() => setPedirMotivo(true)}><RotateCcw />Reabrir</button>}
            {bloqueado && <button className="btn glass-btn" onClick={() => nav("/nomina/pagos")}>Ver pagos generados</button>}
          </div>
        </div>
      </div>

      <div className="grid g6">
        <Kpi label="Total devengado" value={pesosCortos(pc.empleados.ingresoBruto)} delta={d(pc.empleados.ingresoBruto, pcPrev?.empleados.ingresoBruto)} invert />
        <Kpi label="Deducciones" value={pesosCortos(pc.empleados.totalDeducciones + pc.empleados.descuentos)} />
        <Kpi label="Neto a pagar" value={pesosCortos(pc.empleados.neto)} delta={d(pc.empleados.neto, pcPrev?.empleados.neto)} invert />
        <Kpi label="Provisiones" value={pesosCortos(pc.empleados.totalProvisiones)} />
        <Kpi label="Planilla" value={pesosCortos(pc.empleados.totalPlanilla)} />
        <Kpi label="Costo empresa" value={pesosCortos(pc.empleados.costoTotal)} delta={d(pc.empleados.costoTotal, pcPrev?.empleados.costoTotal)} invert deltaLabel="vs ant." />
      </div>

      {sinSalario.length > 0 && (
        <div className="card" style={{ marginTop: 16, background: "color-mix(in srgb, var(--orange) 12%, var(--bg-elev))" }}>
          <div className="row wrap"><TriangleAlert color="var(--orange)" />
            <div className="grow"><b>{sinSalario.length} {sinSalario.length === 1 ? "persona activa no tiene" : "personas activas no tienen"} salario registrado</b>
              <div className="footnote">{sinSalario.map((e) => `${e.id} ${titulo(e.nombreCompleto)} (${titulo(e.cargo)})`).join(" · ")}. No entran en la nómina hasta definir su base: crea una propuesta en el simulador.</div>
            </div>
            <button className="btn sm" onClick={() => nav(`/nomina/simulador?empleado=${sinSalario[0].id}`)}>Definir salario</button>
          </div>
        </div>
      )}

      {(conAlertas.length > 0 || cambios.length > 0) && (
        <div className="grid g2" style={{ marginTop: 16 }}>
          {conAlertas.length > 0 && (
            <Card title={<span className="row" style={{ gap: 8 }}><TriangleAlert color="var(--red)" size={18} />Validaciones</span>}>
              {conAlertas.filter((x) => esAdmin || !x.f.esSocio).map((x) => (
                <div key={x.f.empleadoId} className="alert-row" onClick={() => setAbierta(x.f.empleadoId)}>
                  <div className="grow"><b>{titulo(x.f.nombre)}</b><div className="caption">{x.c.alertas.join(" · ")}</div></div>
                </div>
              ))}
            </Card>
          )}
          {cambios.length > 0 && (
            <Card title="Cambios mayores al 5 % vs mes anterior" sub="Se resaltan en amarillo en la tabla">
              {cambios.map((x) => {
                const v = variacion(x.f.empleadoId, x.c.costoTotal)!;
                return (
                  <div key={x.f.empleadoId} className="alert-row" onClick={() => setAbierta(x.f.empleadoId)}>
                    <div className="grow"><b>{titulo(x.f.nombre)}</b><div className="caption">{titulo(x.f.cargo)}</div></div>
                    <span className={`trend ${v > 0 ? "up" : "down"} bad`}>{v > 0 ? "+" : ""}{pct(v)}</span>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}

      <div className="section-title">Empleados <small>{empleados.length} personas · fila por persona, sin agrupar</small></div>
      <TablaNomina filas={empleados} detalle={detalle} variacion={variacion} editable={editable} onOpen={setAbierta} total={pc.empleados} periodoId={per.id} />

      <div className="section-title"><Crown size={20} color="var(--yellow)" />Nómina socios <small>Totales propios · fuera de gráficas e indicadores</small></div>
      {esAdmin ? (
        <TablaNomina filas={socios} detalle={detalle} variacion={variacion} editable={editable} onOpen={setAbierta} total={pc.socios} periodoId={per.id} />
      ) : (
        <div className="card restricted" style={{ textAlign: "center" }}><Lock size={18} /> <span className="footnote">Visible solo para ADMINISTRADOR</span></div>
      )}

      {per.reaperturas.length > 0 && (
        <Card title="Reaperturas" style={{ marginTop: 16 }}>
          {per.reaperturas.map((r, i) => <div key={i} className="footnote">{fechaHora(r.en)} · {r.por}: {r.motivo}</div>)}
        </Card>
      )}

      {fila && <NovedadesSheet fila={fila} pc={pc} editable={editable} onClose={() => setAbierta(null)} onDesprendible={() => setDesprendibles([fila.f.empleadoId])} />}

      <Modal open={verDevolver} onClose={() => setVerDevolver(false)} title="Devolver filas con comentarios" size="wide"
        footer={<><button className="btn" onClick={() => setVerDevolver(false)}>Cancelar</button><button className="btn danger primary" disabled={!Object.values(devolver).some((v) => v.trim())} onClick={() => {
          devolverFilas(per.id, Object.entries(devolver).filter(([, c]) => c.trim()).map(([empleadoId, comentario]) => ({ empleadoId, comentario })));
          setDevolver({}); setVerDevolver(false); toast("Filas devueltas a COORDINACIÓN", "warn");
        }}>Devolver</button></>}>
        <p className="footnote" style={{ marginTop: 0 }}>Escribe un comentario en las filas que quieres devolver. El mes vuelve a BORRADOR para que COORDINACIÓN las corrija y las cargue de nuevo.</p>
        <div className="list">
          {pc.filas.map(({ f, c }) => (
            <div className="list-row flat" key={f.empleadoId}>
              <div style={{ width: 260 }}><b style={{ fontWeight: 600 }}>{titulo(f.nombre)}</b><div className="caption">Neto {pesos(c.neto)}</div></div>
              <input className="input sm grow" placeholder="Comentario (opcional)" value={devolver[f.empleadoId] ?? ""} onChange={(e) => setDevolver({ ...devolver, [f.empleadoId]: e.target.value })} />
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={pedirMotivo} onClose={() => setPedirMotivo(false)} title="Reabrir nómina" size="narrow"
        footer={<><button className="btn" onClick={() => setPedirMotivo(false)}>Cancelar</button><button className="btn primary" disabled={!motivo.trim()} onClick={() => { setPedirMotivo(false); setOtp("reabrir"); }}>Continuar</button></>}>
        <Field label="Justificación" required hint="Queda registrada en el Historial. Las cuentas por pagar pendientes se anulan.">
          <textarea className="textarea" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        </Field>
      </Modal>

      <OtpSheet
        open={!!otp}
        onClose={() => setOtp(null)}
        title={otp === "aprobar" ? `Aprobar ${MESES[per.mes - 1]}` : "Reabrir mes"}
        description={otp === "aprobar" ? <>Neto a consignar <b>{pesos(pc.total.neto)}</b> · provisiones {pesos(pc.total.totalProvisiones)} · planilla {pesos(pc.total.totalPlanilla)}. Ingresa el código de un solo uso.</> : "Ingresa el código enviado a tu correo."}
        onRequest={() => solicitarOtp(`${otp}-${per.id}`)}
        onVerify={(code) => {
          try {
            if (otp === "aprobar") {
              aprobarPeriodo(per.id, code);
              toast(<>Nómina aprobada y <b>enviada a Pagos</b> · {per.filas.length + 2} cuentas por pagar</>);
            } else {
              reabrirPeriodo(per.id, code, motivo);
              setMotivo("");
              toast("Mes reabierto · registrado en el Historial", "warn");
            }
          } catch {
            return false;
          }
          setOtp(null);
          return true;
        }}
      />

      {desprendibles && <Desprendibles ids={desprendibles} pc={pc} onClose={() => setDesprendibles(null)} />}
    </>
  );
}

function TablaNomina({ filas, detalle, variacion, editable, onOpen, total, periodoId }: {
  filas: FilaCalc[]; detalle: boolean; variacion: (id: string, costo: number) => number | null; editable: boolean; onOpen: (id: string) => void;
  total: Totales; periodoId: string;
}) {
  if (!filas.length) return <div className="footnote">Sin personas en esta sección.</div>;
  const cols: { k: keyof CalculoNomina; l: string; g: string }[] = detalle
    ? [
        { k: "salarioOrdinario", l: "Salario", g: "Ingresos" }, { k: "auxNoPrestacional", l: "Aux. no prest.", g: "Ingresos" }, { k: "auxTransporte", l: "Aux. transp.", g: "Ingresos" },
        { k: "horasExtra", l: "H. extra", g: "Ingresos" }, { k: "incapacidad", l: "Incap.", g: "Ingresos" }, { k: "ingresoBruto", l: "Ingreso bruto", g: "Ingresos" },
        { k: "saludEmpleado", l: "Salud", g: "Deducciones" }, { k: "pensionEmpleado", l: "Pensión", g: "Deducciones" }, { k: "fsp", l: "FSP", g: "Deducciones" }, { k: "retencion", l: "Retención", g: "Deducciones" }, { k: "descuentos", l: "Descuentos", g: "Deducciones" },
        { k: "neto", l: "Neto", g: "Neto" },
        { k: "cesantias", l: "Cesantías", g: "Provisiones" }, { k: "prima", l: "Prima", g: "Provisiones" }, { k: "interesesCesantias", l: "Int. ces.", g: "Provisiones" }, { k: "vacaciones", l: "Vacaciones", g: "Provisiones" }, { k: "totalProvisiones", l: "Total", g: "Provisiones" },
        { k: "saludEmpleador", l: "Salud", g: "Planilla" }, { k: "pensionEmpleador", l: "Pensión", g: "Planilla" }, { k: "ccf", l: "CCF", g: "Planilla" }, { k: "arl", l: "ARL", g: "Planilla" }, { k: "aporteEmpleador", l: "Aporte emp.", g: "Planilla" }, { k: "totalPlanilla", l: "Total planilla", g: "Planilla" },
        { k: "deduccionesAsumidas", l: "Ded. asumidas", g: "Costo" }, { k: "costoTotal", l: "Costo total", g: "Costo" },
      ]
    : [
        { k: "ingresoBruto", l: "Ingreso bruto", g: "" }, { k: "totalDeducciones", l: "Deducciones", g: "" }, { k: "neto", l: "Neto", g: "" },
        { k: "totalProvisiones", l: "Provisiones", g: "" }, { k: "totalPlanilla", l: "Planilla", g: "" }, { k: "costoTotal", l: "Costo total", g: "" },
      ];
  const grupos = detalle ? [...new Set(cols.map((c) => c.g))] : [];
  const gColor: Record<string, string> = { Ingresos: "var(--green)", Deducciones: "var(--red)", Neto: "var(--blue)", Provisiones: "var(--indigo)", Planilla: "var(--teal)", Costo: "var(--orange)" };
  const totalKey = (k: keyof CalculoNomina) => (total as unknown as Record<string, number>)[k as string];
  return (
    <div className="table-wrap">
      <table className="t">
        <thead>
          {detalle && (
            <tr>
              <th className="sticky-col" colSpan={1} />
              <th colSpan={3} />
              {grupos.map((g) => <th key={g} className="group" colSpan={cols.filter((c) => c.g === g).length} style={{ ["--gc" as string]: gColor[g] }}>{g}</th>)}
              <th colSpan={2} />
            </tr>
          )}
          <tr>
            <th className="sticky-col">Persona</th>
            <th className="r">Días</th>
            <th className="r">Base</th>
            <th>Novedades</th>
            {cols.map((c) => <th key={c.k + c.g} className="r">{c.l}</th>)}
            <th className="r">Var.</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(({ f, c }) => {
            const v = variacion(f.empleadoId, c.costoTotal);
            const n = f.novedades;
            const nov = [n.diasIncapacidad && `${n.diasIncapacidad}d incap.`, n.diasVacaciones && `${n.diasVacaciones}d vac.`, n.diasLicenciaRemunerada + n.diasLicenciaNoRemunerada && "licencia", n.hed + n.hen + n.horasRecargoNocturno + n.horasDominical && "h. extra", n.bonificacionSalarial + n.bonificacionNoSalarial && "bono", n.prestamos + n.anticipos + n.otrosDescuentos && "descuento"].filter(Boolean) as string[];
            const alto = v !== null && Math.abs(v) > 0.05;
            return (
              <tr key={f.empleadoId} className={`click ${f.devuelta ? "devuelta" : alto ? "hl" : ""}`} onClick={() => onOpen(f.empleadoId)}>
                <td className="sticky-col">
                  <div style={{ fontWeight: 600 }}>{titulo(f.nombre)}</div>
                  <div className="caption">{f.empleadoId} · {titulo(f.cargo)}{f.deduccionesAsumidas ? " · ded. asumidas" : ""}</div>
                  {f.devuelta && <div className="caption" style={{ color: "var(--red)" }}>Devuelta: {f.devuelta.comentario}</div>}
                </td>
                <td className="r">{n.diasContrato}</td>
                <td className="r">{pesos(f.base)}{c.alertas.length > 0 && <TriangleAlert size={13} color="var(--red)" style={{ marginLeft: 4, verticalAlign: -2 }} />}</td>
                <td>{nov.length ? <div className="row" style={{ gap: 4 }}>{nov.slice(0, 2).map((x) => <Badge key={x} color="blue">{x}</Badge>)}{nov.length > 2 && <Badge>+{nov.length - 2}</Badge>}</div> : <span className="caption">—</span>}</td>
                {cols.map((col) => <td key={col.k + col.g} className="r" style={col.k === "neto" ? { fontWeight: 700 } : undefined}>{pesos(c[col.k] as number)}</td>)}
                <td className="r">{v === null ? <span className="caption">nuevo</span> : <span className={`trend ${v > 0.0005 ? "up" : v < -0.0005 ? "down" : "neutral"} bad`}>{v > 0 ? "+" : ""}{pct(v)}</span>}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  {editable ? (
                    <button className={`btn sm ${f.cargada ? "success" : ""}`} onClick={() => cargarFila(periodoId, f.empleadoId, !f.cargada)}>{f.cargada ? <><Check size={14} />Cargada</> : "Cargar"}</button>
                  ) : <Badge color="green" dot>Cargada</Badge>}
                </td>
              </tr>
            );
          })}
          <tr className="total">
            <td className="sticky-col">Total · {total.personas}</td>
            <td /><td /><td />
            {cols.map((col) => <td key={col.k + col.g} className="r">{totalKey(col.k) !== undefined ? pesos(totalKey(col.k)) : pesos(filas.reduce((s, x) => s + (x.c[col.k] as number), 0))}</td>)}
            <td /><td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Novedades ----------------

const CAMPOS_DIAS: [keyof Novedades, string][] = [
  ["diasContrato", "Días con contrato en el mes"],
  ["diasIncapacidad", "Días de incapacidad"],
  ["diasLicenciaRemunerada", "Licencia remunerada (días)"],
  ["diasLicenciaNoRemunerada", "Licencia no remunerada (días)"],
  ["diasVacaciones", "Vacaciones disfrutadas (días)"],
];
const CAMPOS_HORAS: [keyof Novedades, string][] = [
  ["hed", "Horas extra diurnas"],
  ["hen", "Horas extra nocturnas"],
  ["horasRecargoNocturno", "Horas recargo nocturno"],
  ["horasDominical", "Horas dominical / festivo"],
];
const CAMPOS_PLATA: [keyof Novedades, string][] = [
  ["bonificacionSalarial", "Bonificación salarial"],
  ["bonificacionNoSalarial", "Bonificación no salarial"],
  ["prestamos", "Préstamos"],
  ["anticipos", "Anticipos"],
  ["otrosDescuentos", "Otros descuentos"],
];

function NovedadesSheet({ fila, pc, editable, onClose, onDesprendible }: { fila: FilaCalc; pc: PeriodoCalc; editable: boolean; onClose: () => void; onDesprendible: () => void }) {
  const [n, setN] = useState<Novedades>(fila.f.novedades);
  const c = calcularFila({ ...fila.f, novedades: n }, pc.params);
  const toast = useToast();
  const cambiado = JSON.stringify(n) !== JSON.stringify(fila.f.novedades);
  const set = (k: keyof Novedades, v: number | string) => setN((s) => ({ ...s, [k]: v }));
  const guardar = () => {
    actualizarNovedades(pc.periodo.id, fila.f.empleadoId, n);
    toast("Novedades registradas · la fila debe cargarse de nuevo");
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={titulo(fila.f.nombre)} size="wide"
      footer={<>
        <button className="btn" onClick={onDesprendible} style={{ marginRight: "auto" }}><Printer />Desprendible</button>
        <button className="btn" onClick={onClose}>Cerrar</button>
        {editable && <button className="btn primary" disabled={!cambiado} onClick={guardar}>Guardar novedades</button>}
      </>}>
      <div className="caption" style={{ textAlign: "center", marginTop: -6, marginBottom: 14 }}>{fila.f.empleadoId} · {titulo(fila.f.cargo)} · base {pesos(fila.f.base)} · {MESES[pc.periodo.mes - 1]} {pc.periodo.anio}</div>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="list-header" style={{ padding: 0 }}>Días</div>
          <div className="form-grid">
            {CAMPOS_DIAS.map(([k, l]) => (
              <Field key={k} label={l}><input className="input num" type="number" min={0} max={30} disabled={!editable} value={n[k] as number} onChange={(e) => set(k, Math.max(0, Math.min(30, Number(e.target.value))))} /></Field>
            ))}
          </div>
          <div className="list-header" style={{ padding: 0 }}>Horas extra y recargos</div>
          <div className="form-grid">
            {CAMPOS_HORAS.map(([k, l]) => (
              <Field key={k} label={l}><input className="input num" type="number" min={0} disabled={!editable} value={n[k] as number} onChange={(e) => set(k, Math.max(0, Number(e.target.value)))} /></Field>
            ))}
          </div>
          <div className="list-header" style={{ padding: 0 }}>Bonificaciones y descuentos</div>
          <div className="form-grid">
            {CAMPOS_PLATA.map(([k, l]) => (
              <Field key={k} label={l}><MoneyInput disabled={!editable} value={n[k] as number} onChange={(v) => set(k, v)} /></Field>
            ))}
            <Field label="Nota" full><input className="input" disabled={!editable} value={n.nota} onChange={(e) => set("nota", e.target.value)} /></Field>
          </div>
        </div>
        <div className="stack">
          {c.alertas.length > 0 && <div className="card" style={{ background: "color-mix(in srgb, var(--red) 10%, transparent)", boxShadow: "none", padding: 12 }}>{c.alertas.map((a) => <div key={a} className="footnote" style={{ color: "var(--red)" }}>⚠︎ {a}</div>)}</div>}
          <Desglose c={c} params={pc.params} />
        </div>
      </div>
    </Modal>
  );
}

function Desglose({ c, params }: { c: CalculoNomina; params: Parametros }) {
  const sec = (t: string, color: string, filas: [string, number][], total?: [string, number]) => (
    <div className="list" style={{ boxShadow: "none" }}>
      <div className="list-row flat" style={{ minHeight: 36 }}><span className="badge" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>{t}</span></div>
      {filas.filter(([, v]) => v).map(([l, v]) => <div className="list-row flat" key={l} style={{ minHeight: 34, padding: "6px 16px" }}><span className="footnote">{l}</span><span className="right num">{pesos(v)}</span></div>)}
      {total && <div className="list-row flat" style={{ minHeight: 38 }}><b>{total[0]}</b><b className="right num">{pesos(total[1])}</b></div>}
    </div>
  );
  return (
    <>
      <div className="hero" style={{ minHeight: 0, padding: 20, ["--tint" as string]: "#30C759" }}>
        <div className="hero-eyebrow">Neto a consignar</div>
        <div className="hero-value" style={{ fontSize: 40 }}>{pesos(c.neto)}</div>
        <div className="hero-sub">Costo total empresa {pesos(c.costoTotal)}</div>
      </div>
      {sec("Devengados", "var(--green)", [["Salario", c.salarioOrdinario], ["Vacaciones disfrutadas", c.vacacionesDisfrutadas], ["Licencia remunerada", c.licenciaRemunerada], ["Incapacidad", c.incapacidad], ["Horas extra y recargos", c.horasExtra], ["Bonificación salarial", c.bonificacionSalarial], ["Aux. no prestacional", c.auxNoPrestacional], ["Bonificación no salarial", c.bonificacionNoSalarial], ["Aux. transporte", c.auxTransporte]], ["Ingreso bruto", c.ingresoBruto])}
      {sec("Deducciones", "var(--red)", [["Salud 4 %", c.saludEmpleado], ["Pensión 4 %", c.pensionEmpleado], ["Fondo de solidaridad", c.fsp], ["Retención en la fuente", c.retencion], ["Préstamos, anticipos y otros", c.descuentos]], ["Total", c.totalDeducciones + c.descuentos])}
      {sec("Provisiones", "var(--indigo)", [["Cesantías", c.cesantias], ["Prima", c.prima], ["Intereses de cesantías", c.interesesCesantias], ["Vacaciones", c.vacaciones]], ["Total provisiones", c.totalProvisiones])}
      {sec("Planilla (empresa)", "var(--teal)", [["Salud empleador", c.saludEmpleador], ["Pensión 12 %", c.pensionEmpleador], ["Caja de compensación 4 %", c.ccf], ["ARL", c.arl], ["ICBF", c.icbf], ["SENA", c.sena]], ["Aporte empleador", c.aporteEmpleador])}
      <div className="caption">IBC {pesos(c.ibc)} · SMMLV {params.anio}: {pesos(params.smmlv)}{c.deduccionesAsumidas ? ` · deducciones asumidas ${pesos(c.deduccionesAsumidas)}` : ""}</div>
    </>
  );
}

function Desprendibles({ ids, pc, onClose }: { ids: string[]; pc: PeriodoCalc; onClose: () => void }) {
  const filas = pc.filas.filter((x) => ids.includes(x.f.empleadoId));
  return (
    <Modal open onClose={onClose} title={`Desprendibles · ${filas.length}`} size="wide" footer={<><button className="btn" onClick={onClose}>Cerrar</button><button className="btn primary" onClick={() => window.print()}><Printer />Imprimir / Guardar PDF</button></>}>
      <div className="print-area stack">
        {filas.map(({ f, c }) => (
          <div className="payslip" key={f.empleadoId}>
            <div className="row between" style={{ alignItems: "flex-start" }}>
              <div><h2>LA BRUTAL</h2><div style={{ color: "#666" }}>Comprobante de pago de nómina</div></div>
              <div style={{ textAlign: "right" }}><b>{MESES[pc.periodo.mes - 1]} {pc.periodo.anio}</b><div style={{ color: "#666" }}>Generado {fecha(hoy())}</div></div>
            </div>
            <div className="row between" style={{ marginTop: 14 }}>
              <div><b>{f.nombre}</b><div style={{ color: "#666" }}>{f.tipoDocumento} {f.numeroDocumento} · {f.empleadoId}</div></div>
              <div style={{ textAlign: "right" }}>{f.cargo}<div style={{ color: "#666" }}>{f.banco} {f.tipoCuenta} {enmascarar(f.numeroCuenta)}</div></div>
            </div>
            <table>
              <tbody>
                <tr><td>Días</td><td className="r">{f.novedades.diasContrato}</td></tr>
                <tr><td>Salario</td><td className="r">{pesos(c.salarioOrdinario + c.vacacionesDisfrutadas + c.licenciaRemunerada)}</td></tr>
                {c.incapacidad > 0 && <tr><td>Incapacidad</td><td className="r">{pesos(c.incapacidad)}</td></tr>}
                {c.horasExtra > 0 && <tr><td>Horas extra y recargos</td><td className="r">{pesos(c.horasExtra)}</td></tr>}
                {c.bonificacionSalarial + c.bonificacionNoSalarial > 0 && <tr><td>Bonificaciones</td><td className="r">{pesos(c.bonificacionSalarial + c.bonificacionNoSalarial)}</td></tr>}
                <tr><td>Auxilio no prestacional</td><td className="r">{pesos(c.auxNoPrestacional)}</td></tr>
                <tr><td>Auxilio de transporte</td><td className="r">{pesos(c.auxTransporte)}</td></tr>
                <tr className="tot"><td>Total devengado</td><td className="r">{pesos(c.ingresoBruto)}</td></tr>
                <tr><td>Salud (4 %)</td><td className="r">− {pesos(c.saludEmpleado)}</td></tr>
                <tr><td>Pensión (4 %)</td><td className="r">− {pesos(c.pensionEmpleado)}</td></tr>
                {c.fsp > 0 && <tr><td>Fondo de solidaridad pensional</td><td className="r">− {pesos(c.fsp)}</td></tr>}
                {c.retencion > 0 && <tr><td>Retención en la fuente</td><td className="r">− {pesos(c.retencion)}</td></tr>}
                {c.descuentos > 0 && <tr><td>Préstamos, anticipos y otros</td><td className="r">− {pesos(c.descuentos)}</td></tr>}
                <tr className="tot"><td>NETO PAGADO</td><td className="r">{pesos(c.neto)}</td></tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Modal>
  );
}
