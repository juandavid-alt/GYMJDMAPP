import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CalendarClock, Crown, Eye, EyeOff, FileText, Folder, Pencil, RefreshCw, Stethoscope, Undo2, UserMinus, Wallet, Banknote, TriangleAlert,
} from "lucide-react";
import { actualizarCondicionesSalario, actualizarLiquidacion, actualizarRetiro, subirArchivo, useDB, useSesion } from "../../data/store";
import { calcPeriodo } from "../../data/selectors";
import { ARCHIVOS, SUBCARPETAS } from "../../domain/catalogos";
import { antiguedadMeses, duracionesPermitidas, estadoDocumentos } from "../../domain/empleados";
import { diffDias, edad, hoy, MESES } from "../../domain/fechas";
import { auxNoPrestPct } from "../../domain/nomina";
import type { Archivo, TipoArchivo } from "../../domain/types";
import { enmascarar, fecha, fechaHora, numero, pct, pesos, titulo } from "../../lib/format";
import { Avatar, Badge, Card, Empty, EstatusBadge, Field, MoneyInput, Progress, Seg, Switch, useToast } from "../../components/ui";
import { EditarSheet, ExamenSheet, RenovarSheet, RetirarSheet, VisorArchivo } from "./Acciones";
import { DropFile } from "./NuevoEmpleado";
import { parametrosDe } from "../../data/store";
import NuevoEmpleado from "./NuevoEmpleado";

export default function Perfil() {
  const { id } = useParams();
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const toast = useToast();
  const e = db.empleados.find((x) => x.id === id);
  const [editar, setEditar] = useState(false);
  const [renovar, setRenovar] = useState(false);
  const [retirar, setRetirar] = useState(false);
  const [examen, setExamen] = useState<"examen" | "examenEgreso" | null>(null);
  const [visor, setVisor] = useState<Archivo | null>(null);
  const [verCuenta, setVerCuenta] = useState(false);
  const [reactivar, setReactivar] = useState(false);
  const [subiendo, setSubiendo] = useState<TipoArchivo | null>(null);

  if (!e) return <Empty icon={<TriangleAlert />} title="Empleado no encontrado" action={<Link className="btn" to="/empleados">Volver</Link>} />;
  if (e.esSocio && sesion.rol !== "ADMINISTRADOR") return <Empty icon={<Crown />} title="Sección restringida" text="La información de los socios solo es visible para el ADMINISTRADOR." />;

  const propio = sesion.rol === "EMPLEADO";
  const esAdmin = sesion.rol === "ADMINISTRADOR";
  const docs = estadoDocumentos(e);
  const ref = hoy();
  const diasFin = e.terminacionContrato ? diffDias(ref, e.terminacionContrato) : null;
  const historial = db.historial.filter((h) => h.empleadoId === e.id);
  const salarios = db.salarios.filter((s) => s.empleadoId === e.id).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde));
  const salario = salarios.find((s) => s.vigenteDesde <= ref) ?? salarios[0];
  const params = parametrosDe(db, Number(ref.slice(0, 4)));
  const nominas = db.periodos
    .map((p) => ({ p, fila: calcPeriodo(db, p).filas.find((x) => x.f.empleadoId === e.id) }))
    .filter((x) => x.fila)
    .reverse();
  const semColor = docs.semaforo === "verde" ? "var(--green)" : docs.semaforo === "rojo" ? "var(--red)" : "var(--yellow)";
  const periodoContrato = e.terminacionContrato ? diffDias(e.inicioContrato, e.terminacionContrato) : 0;

  return (
    <div className="fade-in">
      <div className="profile-hero glass">
        <Avatar e={e} size="xl" />
        <div className="grow">
          <div className="caption mono">{e.id}</div>
          <h1 className="large-title" style={{ margin: "2px 0" }}>{titulo(e.nombreCompleto)}</h1>
          <div className="muted" style={{ fontSize: 17 }}>{titulo(e.cargo)} · {titulo(e.area)}</div>
          <div className="meta">
            <EstatusBadge estatus={e.estatus} />
            {e.esSocio && <Badge color="yellow"><Crown size={12} />Socio</Badge>}
            <Badge color={e.tipoContrato === "PS" ? "orange" : e.tipoContrato === "FIJO" ? "blue" : "green"}>{({ FIJO: "Término fijo", INDEFINIDO: "Indefinido", PS: "Prestación de servicios" })[e.tipoContrato]}</Badge>
            <Badge color="gray">{numero(antiguedadMeses(e), 1)} meses en La Brutal</Badge>
            <Badge color={docs.semaforo === "verde" ? "green" : docs.semaforo === "rojo" ? "red" : "yellow"} dot>Documentos {docs.completos}/{docs.total}</Badge>
          </div>
        </div>
        <div className="toolbar" style={{ alignSelf: "flex-start" }}>
          <button className="btn glass-btn" onClick={() => setEditar(true)}><Pencil />{propio ? "Actualizar mis datos" : "Editar"}</button>
          {!propio && e.estatus === "ACTIVO" && e.tipoContrato === "FIJO" && <button className="btn glass-btn" onClick={() => setRenovar(true)}><RefreshCw />Renovar contrato</button>}
          {!propio && e.estatus === "ACTIVO" && <button className="btn danger" onClick={() => setRetirar(true)}><UserMinus />Retirar empleado</button>}
          {!propio && e.estatus === "RETIRADO" && <button className="btn primary" onClick={() => setReactivar(true)}><Undo2 />Reactivar</button>}
        </div>
      </div>

      {e.examen.restricciones && e.examen.estatus === "APTO CON RESTRICCIONES" && (
        <div className="card" style={{ marginTop: 16, background: "color-mix(in srgb, var(--orange) 12%, var(--bg-elev))" }}>
          <div className="row"><Stethoscope color="var(--orange)" /><div><b>Apto con restricciones</b><div className="footnote">{e.examen.restricciones}</div></div></div>
        </div>
      )}

      <div className="grid g3" style={{ marginTop: 16 }}>
        <Card title="Datos personales" className="span2">
          <dl className="kv" style={{ margin: 0 }}>
            {[
              ["Documento", `${e.tipoDocumento} ${e.numeroDocumento}`],
              ["Nacimiento", `${fecha(e.fechaNacimiento)} · ${edad(e.fechaNacimiento)} años`],
              ["Género", titulo(e.genero)],
              ["Celular", e.celular],
              ["Correo", e.correo],
              ["Dirección", e.direccion],
              ["EPS", e.eps],
              ["Fondo de pensiones", e.afp],
              ["ARL", `${e.arl} · riesgo ${e.claseRiesgoArl}`],
              ["Banco", `${e.banco} · ${titulo(e.tipoCuenta)}`],
            ].map(([k, v]) => (
              <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
            ))}
            <div>
              <dt>Número de cuenta</dt>
              <dd className="row" style={{ gap: 6 }}>
                <span className="mono">{(esAdmin || propio) && verCuenta ? e.numeroCuenta : enmascarar(e.numeroCuenta)}</span>
                {(esAdmin || propio) && <button className="btn icon sm plain" onClick={() => setVerCuenta((v) => !v)} aria-label="Mostrar cuenta">{verCuenta ? <EyeOff size={15} /> : <Eye size={15} />}</button>}
              </dd>
            </div>
            <div><dt>Contacto de emergencia</dt><dd>{e.emergenciaNombre} · {titulo(e.emergenciaParentesco)} · {e.emergenciaCelular}</dd></div>
            <div><dt>Tratamiento de datos (Ley 1581)</dt><dd>{e.autorizacionDatos ? <Badge color="green">Autorizado {fecha(e.autorizacionFecha)}</Badge> : <Badge color="red">Pendiente</Badge>}</dd></div>
          </dl>
        </Card>

        <div className="stack">
          <Card title="Contrato" action={<CalendarClock color="var(--tint)" />}>
            <div className="list" style={{ boxShadow: "none" }}>
              <div className="list-row flat"><span className="muted">Inicio</span><b className="right">{fecha(e.inicioContrato)}</b></div>
              {e.tipoContrato === "FIJO" && (
                <>
                  <div className="list-row flat"><span className="muted">Terminación</span><b className="right">{fecha(e.terminacionContrato)}</b></div>
                  <div className="list-row flat"><span className="muted">Duración</span><b className="right">{e.duracionMeses} meses</b></div>
                  <div className="list-row flat"><span className="muted">Renovaciones</span><b className="right">{e.renovaciones} · próxima mín. {duracionesPermitidas(e.renovaciones)[0]} meses</b></div>
                </>
              )}
            </div>
            {e.tipoContrato === "FIJO" && diasFin !== null && e.estatus === "ACTIVO" && (
              <div style={{ marginTop: 12 }}>
                <Progress value={1 - diasFin / Math.max(1, periodoContrato)} color={diasFin <= 30 ? "var(--red)" : diasFin <= 45 ? "var(--orange)" : undefined} />
                <div className="caption" style={{ marginTop: 6 }}>{diasFin >= 0 ? `Faltan ${diasFin} días · preaviso legal mínimo 30 días` : "Vencido"}</div>
              </div>
            )}
          </Card>

          <Card title="Examen médico" action={!propio && <button className="btn sm" onClick={() => setExamen("examen")}>Gestionar</button>}>
            <div className="row between"><span className="muted">Ingreso</span><EstatusBadge estatus={e.examen.estatus} /></div>
            {e.examen.citaFechaHora && e.examen.estatus === "AGENDADO" && <div className="caption" style={{ marginTop: 6 }}>Cita: {fechaHora(e.examen.citaFechaHora)}</div>}
            {e.examenEgreso && (
              <div className="row between" style={{ marginTop: 10 }}>
                <span className="muted">Egreso</span>
                <span className="row" style={{ gap: 6 }}><EstatusBadge estatus={e.examenEgreso.estatus} />{!propio && <button className="btn sm" onClick={() => setExamen("examenEgreso")}>Gestionar</button>}</span>
              </div>
            )}
          </Card>

          {e.retiro && (
            <Card title="Retiro" action={<Wallet color="var(--red)" />}>
              <div className="list" style={{ boxShadow: "none" }}>
                <div className="list-row flat"><span className="muted">Causal</span>
                  {propio ? <b className="right">{titulo(e.retiro.causal)}</b> : (
                    <select className={`select sm right ${e.retiro.causal === "SIN REGISTRAR" ? "required-empty" : ""}`} style={{ width: 210 }} value={e.retiro.causal} onChange={(ev) => actualizarRetiro(e.id, { causal: ev.target.value as typeof e.retiro.causal })}>
                      {e.retiro.causal === "SIN REGISTRAR" && <option>SIN REGISTRAR</option>}
                      {db.listas.causalesRetiro.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  )}
                </div>
                <div className="list-row flat"><span className="muted">Notificación</span><b className="right">{fecha(e.retiro.fechaNotificacion)}</b></div>
                <div className="list-row flat"><span className="muted">Salida</span><b className="right">{fecha(e.retiro.fechaSalida)}</b></div>
                <div className="list-row flat"><span className="muted">Liquidación</span>{propio ? <b className="right">{pesos(e.retiro.valorLiquidacion)}</b> : <div className="right" style={{ width: 170 }}><MoneyInput value={e.retiro.valorLiquidacion} onChange={(n) => actualizarRetiro(e.id, { valorLiquidacion: n })} /></div>}</div>
                <div className="list-row flat">
                  <span className="muted">Estado</span>
                  <span className="right">
                    {propio ? <EstatusBadge estatus={e.retiro.estadoLiquidacion} /> : (
                      <Seg value={e.retiro.estadoLiquidacion} onChange={(v) => { actualizarLiquidacion(e.id, v); toast(`Liquidación marcada como ${v}`); }} options={[{ value: "PENDIENTE", label: "Pendiente" }, { value: "PAGADA", label: "Pagada" }]} />
                    )}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <div className="section-title">
        Documentos
        <small>{e.id} – {e.nombreCompleto}</small>
        <span className="right row" style={{ gap: 8, width: 220 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: semColor, flex: "none" }} />
          <div className="grow"><Progress value={docs.pct} color={semColor} /></div>
          <b className="num">{Math.round(docs.pct * 100)} %</b>
        </span>
      </div>
      <div className="grid g3">
        {SUBCARPETAS.map((sub) => {
          const tipos = (Object.keys(ARCHIVOS) as TipoArchivo[]).filter((t) => ARCHIVOS[t].subcarpeta === sub);
          const archivos = e.archivos.filter((a) => a.subcarpeta === sub);
          if (sub === "Retiro" && !e.retiro && !archivos.length) return null;
          return (
            <div className="folder" key={sub}>
              <div className="row"><Folder size={18} color="var(--blue)" fill="color-mix(in srgb, var(--blue) 25%, transparent)" /><b>{sub}</b><span className="caption right">{archivos.length}</span></div>
              {archivos.map((a) => (
                <div className="file" key={a.id} onClick={() => setVisor(a)}>
                  <FileText size={18} color={a.vence && a.vence < ref ? "var(--red)" : "var(--label-2)"} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis" }}>{a.nombre}</div>
                    <div className="caption">{ARCHIVOS[a.tipo].etiqueta}{a.vence ? ` · vence ${fecha(a.vence)}` : ""}</div>
                  </div>
                  {a.vence && a.vence < ref && <Badge color="red">Vencido</Badge>}
                </div>
              ))}
              {tipos.filter((t) => ARCHIVOS[t].obligatorio && !e.archivos.some((a) => a.tipo === t)).map((t) => (
                <div key={t} style={{ marginTop: 8 }}>
                  <DropFile tipo={t} onFile={async (file) => { setSubiendo(t); await subirArchivo(e.id, t, file); setSubiendo(null); toast(`${ARCHIVOS[t].etiqueta} cargado`); }} />
                  {subiendo === t && <div className="caption">Subiendo…</div>}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {!propio && salario && (
        <>
          <div className="section-title">Salario y nómina <small>BBDD SALARIO NÓMINA · enlazada por ID</small></div>
          <div className="grid g3">
            <Card title="Condiciones vigentes" sub={`Desde ${fecha(salario.vigenteDesde)}`} action={<Banknote color="var(--green)" />}>
              <div className="kpi-value" style={{ marginTop: 0 }}>{pesos(salario.base)}</div>
              <div className="caption">Base prestacional</div>
              <div className="divider" />
              <div className="stack" style={{ gap: 14 }}>
                <Field label="Auxilio no prestacional" hint={`Regla: ${pct(auxNoPrestPct(salario.base, null, params), 0)} · ${pesos(salario.base * auxNoPrestPct(salario.base, salario.auxNoPrestPct, params))}`}>
                  <select className="select" disabled={!esAdmin} value={salario.auxNoPrestPct === null ? "" : String(salario.auxNoPrestPct)} onChange={(ev) => actualizarCondicionesSalario(e.id, { auxNoPrestPct: ev.target.value === "" ? null : Number(ev.target.value) })}>
                    <option value="">Según PARÁMETROS</option><option value="0">0 %</option><option value="0.25">25 %</option><option value="0.35">35 %</option>
                  </select>
                </Field>
                <div className="row between">
                  <div><div style={{ fontWeight: 600 }}>Deducciones asumidas por la empresa</div><div className="caption">Se suman al costo total como gasto</div></div>
                  <Switch on={salario.deduccionesAsumidas} disabled={!esAdmin} onChange={(v) => actualizarCondicionesSalario(e.id, { deduccionesAsumidas: v })} />
                </div>
                <Field label="Retención en la fuente">
                  <div className="row">
                    <Seg value={salario.retencionModo} onChange={(v) => esAdmin && actualizarCondicionesSalario(e.id, { retencionModo: v })} options={[{ value: "MANUAL", label: "Manual" }, { value: "AUTO", label: "Proc. 1" }]} />
                    {salario.retencionModo === "MANUAL" && <MoneyInput disabled={!esAdmin} value={salario.retencionManual} onChange={(n) => actualizarCondicionesSalario(e.id, { retencionManual: n })} />}
                  </div>
                </Field>
                {!esAdmin && <div className="caption">Solo el ADMINISTRADOR cambia condiciones. Para un aumento crea una propuesta en el <Link to={`/nomina/simulador?empleado=${e.id}`}>simulador</Link>.</div>}
                {esAdmin && <Link className="btn sm" to={`/nomina/simulador?empleado=${e.id}`}>Simular aumento</Link>}
              </div>
            </Card>
            <Card title="Historial salarial" className="span2">
              <div className="table-wrap" style={{ boxShadow: "none" }}>
                <table className="t">
                  <thead><tr><th>Vigente desde</th><th className="r">Base</th><th className="r">Variación</th><th>Motivo</th></tr></thead>
                  <tbody>
                    {salarios.map((s, i) => {
                      const ant = salarios[i + 1];
                      return (
                        <tr key={s.id}>
                          <td className="num">{fecha(s.vigenteDesde)}{s.vigenteDesde > ref && <Badge color="blue">Futuro</Badge>}</td>
                          <td className="r">{pesos(s.base)}</td>
                          <td className="r">{ant ? <span className="trend up">+{pct((s.base - ant.base) / ant.base)}</span> : "—"}</td>
                          <td className="footnote" style={{ whiteSpace: "normal" }}>{s.motivo}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="card-title" style={{ marginTop: 18, marginBottom: 8 }}>Nóminas</div>
              <div className="table-wrap" style={{ boxShadow: "none", maxHeight: 280 }}>
                <table className="t">
                  <thead><tr><th>Mes</th><th className="r">Ingreso bruto</th><th className="r">Deducciones</th><th className="r">Neto</th><th className="r">Costo empresa</th><th>Estado</th></tr></thead>
                  <tbody>
                    {nominas.map(({ p, fila }) => (
                      <tr key={p.id} className="click" onClick={() => nav(`/nomina/mes/${p.id}`)}>
                        <td>{MESES[p.mes - 1]} {p.anio}</td>
                        <td className="r">{pesos(fila!.c.ingresoBruto)}</td>
                        <td className="r">{pesos(fila!.c.totalDeducciones + fila!.c.descuentos)}</td>
                        <td className="r"><b>{pesos(fila!.c.neto)}</b></td>
                        <td className="r">{pesos(fila!.c.costoTotal)}</td>
                        <td><EstatusBadge estatus={p.estado} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </>
      )}

      <div className="section-title">Línea de tiempo</div>
      <Card>
        {historial.length === 0 ? <div className="footnote">Sin eventos.</div> : (
          <div className="timeline">
            {historial.slice(0, 40).map((h) => (
              <div className="tl-item" key={h.id}>
                <div className="row" style={{ gap: 8 }}><b>{h.evento}</b><span className="caption">{fechaHora(h.ts)} · {h.usuario}</span></div>
                <div className="footnote">
                  {h.campo && <>{h.campo}: </>}
                  {h.anterior && <span style={{ textDecoration: "line-through" }}>{h.anterior}</span>}{h.anterior && h.nuevo ? " → " : ""}{h.nuevo}
                  {h.detalle && <> · {h.detalle}</>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <EditarSheet e={e} open={editar} onClose={() => setEditar(false)} propio={propio} />
      <RenovarSheet e={e} open={renovar} onClose={() => setRenovar(false)} />
      <RetirarSheet id={retirar ? e.id : null} onClose={() => setRetirar(false)} />
      {examen && <ExamenSheet e={e} cual={examen} open onClose={() => setExamen(null)} />}
      <VisorArchivo archivo={visor} onClose={() => setVisor(null)} />
      <NuevoEmpleado open={reactivar} reactivarId={e.id} onClose={() => setReactivar(false)} onCreado={(x) => nav(`/empleados/${x}`)} />
    </div>
  );
}
