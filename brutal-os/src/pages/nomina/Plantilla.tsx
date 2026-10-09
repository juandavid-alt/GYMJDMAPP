import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, CircleSlash, FilePlus2, Send, Undo2, Calculator } from "lucide-react";
import { crearPropuesta, guardarPlantilla, parametrosDe, resolverPropuesta, salarioVigente, useDB, useSesion } from "../../data/store";
import { calcPeriodo, ingresoDe, periodoActual } from "../../data/selectors";
import { hoy, inicioDeMes, mesSiguiente } from "../../domain/fechas";
import { calcularNomina, RUBROS, type CalculoNomina } from "../../domain/nomina";
import type { EstadoPropuesta, Propuesta } from "../../domain/types";
import { fecha, fechaHora, pct, pesos, titulo } from "../../lib/format";
import { Badge, Card, Empty, EstatusBadge, Field, Kpi, Modal, MoneyInput, Seg, useToast } from "../../components/ui";

const calcBase = (base: number, aux: number | null, p: ReturnType<typeof parametrosDe>, extra: Partial<Parameters<typeof calcularNomina>[0]> = {}) =>
  calcularNomina({ base, auxNoPrestPct: aux, deduccionesAsumidas: false, retencionModo: "MANUAL", retencionManual: 0, claseRiesgoArl: 1, ...extra }, p);

// ---------------- Plantilla salarial por cargo ----------------

export function Plantilla() {
  const db = useDB();
  const sesion = useSesion();
  const nav = useNavigate();
  const p = parametrosDe(db, Number(hoy().slice(0, 4)));
  const [area, setArea] = useState("");
  const filas = db.plantilla
    .filter((x) => !area || x.area === area)
    .map((x) => ({ x, c: calcBase(x.base, x.auxNoPrestPct, p) }))
    .sort((a, b) => a.x.area.localeCompare(b.x.area) || b.x.base - a.x.base);
  const cols: [keyof CalculoNomina, string][] = [
    ["auxNoPrestacional", "Aux. no prest."], ["auxTransporte", "Aux. transp."], ["ingresoBruto", "Ingreso bruto"], ["saludEmpleado", "Salud"], ["pensionEmpleado", "Pensión"],
    ["fsp", "FSP"], ["totalDeducciones", "Deducciones"], ["neto", "Neto"], ["cesantias", "Cesantías"], ["prima", "Prima"], ["interesesCesantias", "Int. ces."],
    ["vacaciones", "Vacaciones"], ["totalProvisiones", "Provisiones"], ["netoConProvisiones", "Mensual c/ prov."], ["aporteEmpleador", "Aporte emp."], ["totalPlanilla", "Planilla"], ["costoTotal", "Costo total"],
  ];
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <select className="select" style={{ width: 240 }} value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">Todas las áreas</option>
          {db.listas.areas.map((a) => <option key={a}>{a}</option>)}
        </select>
        <span className="footnote">Una fila por cargo: solo se define la base prestacional, lo demás se calcula con PARÁMETROS {p.anio}. Es la referencia para personas nuevas y para el simulador.</span>
        <button className="btn primary right" onClick={() => nav("/nomina/simulador?modo=NUEVO_CARGO")}><FilePlus2 />Simular aumento o cargo</button>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead>
            <tr>
              <th className="sticky-col">Cargo</th><th>Área</th><th className="r">Base prestacional</th><th>% aux.</th>
              {cols.map(([, l]) => <th key={l} className="r">{l}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map(({ x, c }) => (
              <tr key={x.cargo}>
                <td className="sticky-col"><b style={{ fontWeight: 600 }}>{titulo(x.cargo)}</b><div className="caption">{db.empleados.filter((e) => e.estatus === "ACTIVO" && !e.esSocio && e.cargo === x.cargo).length} personas activas</div></td>
                <td>{titulo(x.area)}</td>
                <td className="r"><b>{pesos(x.base)}</b>{x.base < p.smmlv && <Badge color="red">&lt; SMMLV</Badge>}</td>
                <td>
                  <select className="select sm" style={{ width: 110 }} disabled={sesion.rol !== "ADMINISTRADOR"} value={x.auxNoPrestPct === null ? "" : String(x.auxNoPrestPct)} onChange={(e) => guardarPlantilla(x.cargo, { auxNoPrestPct: e.target.value === "" ? null : Number(e.target.value) })}>
                    <option value="">Regla</option><option value="0">0 %</option><option value="0.25">25 %</option><option value="0.35">35 %</option>
                  </select>
                </td>
                {cols.map(([k, l]) => <td key={l} className="r" style={k === "costoTotal" || k === "neto" ? { fontWeight: 700 } : undefined}>{pesos(c[k] as number)}</td>)}
                <td><button className="btn sm" onClick={() => nav(`/nomina/simulador?modo=AUMENTO_CARGO&cargo=${encodeURIComponent(x.cargo)}`)}><Calculator size={14} />Simular</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------- Simulador ----------------

type Modo = Propuesta["tipo"];

export function Simulador() {
  const db = useDB();
  const sesion = useSesion();
  const toast = useToast();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const ref = hoy();
  const p = parametrosDe(db, Number(ref.slice(0, 4)));
  const [modo, setModo] = useState<Modo>((sp.get("modo") as Modo) || (sp.get("empleado") ? "AUMENTO_PERSONA" : "AUMENTO_PERSONA"));
  const activos = db.empleados.filter((e) => e.estatus === "ACTIVO");
  const [empId, setEmpId] = useState(sp.get("empleado") ?? activos.find((e) => !e.esSocio)?.id ?? "");
  const [cargo, setCargo] = useState(sp.get("cargo") ?? db.plantilla[0]?.cargo ?? "");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaArea, setNuevaArea] = useState(db.listas.areas[0]);
  const [base, setBase] = useState(0);
  const [justificacion, setJustificacion] = useState("");
  const [comentarios, setComentarios] = useState("");
  const sig = mesSiguiente(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)));
  const [fechaAp, setFechaAp] = useState(inicioDeMes(sig.anio, sig.mes));
  const [intento, setIntento] = useState(false);

  const emp = db.empleados.find((e) => e.id === empId);
  const sal = emp ? salarioVigente(db, emp.id, "9999-12-31") : undefined;
  const pl = db.plantilla.find((x) => x.cargo === cargo);

  const { antes, despues, baseAntes, personas, area, nombreCargo } = useMemo(() => {
    if (modo === "AUMENTO_PERSONA" && emp && sal) {
      const extra = { deduccionesAsumidas: sal.deduccionesAsumidas, retencionModo: sal.retencionModo, retencionManual: sal.retencionManual, claseRiesgoArl: emp.claseRiesgoArl };
      const b = base || sal.base;
      return { antes: calcBase(sal.base, sal.auxNoPrestPct, p, extra), despues: calcBase(b, sal.auxNoPrestPct, p, extra), baseAntes: sal.base, personas: 1, area: emp.area, nombreCargo: emp.cargo };
    }
    if (modo === "AUMENTO_CARGO" && pl) {
      const b = base || pl.base;
      const n = db.empleados.filter((e) => e.estatus === "ACTIVO" && !e.esSocio && e.cargo === pl.cargo).length;
      return { antes: calcBase(pl.base, pl.auxNoPrestPct, p), despues: calcBase(b, pl.auxNoPrestPct, p), baseAntes: pl.base, personas: n, area: pl.area, nombreCargo: pl.cargo };
    }
    const vacio = calcBase(0, 0, p);
    if (modo === "AUMENTO_PERSONA" && emp) {
      // persona sin salario registrado: se define su base desde cero
      return { antes: { ...vacio, alertas: [] }, despues: calcBase(base || p.smmlv, null, p, { claseRiesgoArl: emp.claseRiesgoArl }), baseAntes: 0, personas: 1, area: emp.area, nombreCargo: emp.cargo };
    }
    return { antes: { ...vacio, alertas: [] }, despues: calcBase(base || p.smmlv, null, p), baseAntes: 0, personas: 1, area: nuevaArea, nombreCargo: nuevoNombre.trim().toUpperCase() };
  }, [modo, emp, sal, pl, base, p, nuevaArea, nuevoNombre, db.empleados]);

  const per = periodoActual(db);
  const pc = per ? calcPeriodo(db, per) : null;
  const totalNomina = pc?.empleados.costoTotal ?? 0;
  const ultimoIngreso = [...db.ingresos].reverse().find((i) => i.valor)?.valor ?? (per ? ingresoDe(db, per.id) : 0);
  const difMes = (despues.costoTotal - antes.costoTotal) * (modo === "NUEVO_CARGO" ? 1 : personas || 1);
  const errores = {
    justificacion: !justificacion.trim(),
    fecha: !fechaAp,
    base: !(base > 0) || base < p.smmlv,
    nombre: modo === "NUEVO_CARGO" && (!nuevoNombre.trim() || db.listas.cargos.some((c) => c.cargo === nuevoNombre.trim().toUpperCase())),
  };

  const enviar = () => {
    setIntento(true);
    if (Object.values(errores).some(Boolean)) return;
    crearPropuesta({
      tipo: modo,
      empleadoId: modo === "AUMENTO_PERSONA" ? empId : undefined,
      cargo: nombreCargo,
      area,
      baseAntes,
      baseDespues: base,
      justificacion,
      comentarios,
      fechaAplicacion: fechaAp,
    });
    toast(<>Propuesta creada en estado <b>PENDIENTE</b> · ADMINISTRADOR notificado por correo</>);
    nav("/nomina/propuestas");
  };

  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Seg value={modo} onChange={(m) => { setModo(m); setBase(0); }} options={[{ value: "AUMENTO_PERSONA", label: "Aumento a una persona" }, { value: "AUMENTO_CARGO", label: "Aumento a un cargo" }, { value: "NUEVO_CARGO", label: "Cargo nuevo" }]} />
        <span className="footnote">Solo cambias la base prestacional; el sistema recalcula todos los rubros.</span>
      </div>
      <div className="grid g3" style={{ alignItems: "start" }}>
        <Card title="Propuesta" sub={sesion.rol === "ADMINISTRADOR" ? "Queda PENDIENTE hasta que la apruebes" : "COORDINACIÓN crea, ADMINISTRADOR aprueba"}>
          <div className="stack">
            {modo === "AUMENTO_PERSONA" && (
              <Field label="Persona" required>
                <select className="select" value={empId} onChange={(e) => { setEmpId(e.target.value); setBase(0); }}>
                  {activos.filter((e) => sesion.rol === "ADMINISTRADOR" || !e.esSocio).map((e) => <option key={e.id} value={e.id}>{e.id} · {e.nombreCompleto}</option>)}
                </select>
              </Field>
            )}
            {modo === "AUMENTO_CARGO" && (
              <Field label="Cargo" required>
                <select className="select" value={cargo} onChange={(e) => { setCargo(e.target.value); setBase(0); }}>
                  {db.plantilla.map((x) => <option key={x.cargo} value={x.cargo}>{x.cargo} · {x.area}</option>)}
                </select>
              </Field>
            )}
            {modo === "NUEVO_CARGO" && (
              <>
                <Field label="Nombre del cargo" required error={intento && errores.nombre && (nuevoNombre.trim() ? "Ese cargo ya existe" : "Requerido")}>
                  <input className={`input ${intento && errores.nombre ? "required-empty" : ""}`} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value.toUpperCase())} />
                </Field>
                <Field label="Área" required>
                  <select className="select" value={nuevaArea} onChange={(e) => setNuevaArea(e.target.value)}>{db.listas.areas.map((a) => <option key={a}>{a}</option>)}</select>
                </Field>
              </>
            )}
            <Field label="Base actual"><input className="input" disabled value={modo === "NUEVO_CARGO" ? "—" : pesos(baseAntes)} /></Field>
            <Field label="Nueva base prestacional" required error={intento && errores.base && (base && base < p.smmlv ? "No puede ser inferior al SMMLV" : "Requerida")}>
              <MoneyInput className={intento && errores.base ? "required-empty" : ""} value={base} onChange={setBase} placeholder={pesos(baseAntes || p.smmlv)} />
            </Field>
            <Field label="Fecha de aplicación" required hint={fecha(fechaAp)}>
              <input type="date" className="input" value={fechaAp} onChange={(e) => setFechaAp(e.target.value)} />
            </Field>
            <Field label="Justificación" required>
              <textarea className={`textarea ${intento && errores.justificacion ? "required-empty" : ""}`} value={justificacion} onChange={(e) => setJustificacion(e.target.value)} />
            </Field>
            <Field label="Comentarios"><textarea className="textarea" value={comentarios} onChange={(e) => setComentarios(e.target.value)} /></Field>
            <button className="btn primary lg" onClick={enviar}><Send />Enviar propuesta</button>
          </div>
        </Card>
        <div className="span2 stack">
          <div className="grid g3">
            <Kpi label="Diferencia mensual" value={pesos(difMes)} foot={<span>{modo === "AUMENTO_CARGO" ? `si se aplica a ${personas} persona(s)` : "costo total empresa"}</span>} />
            <Kpi label="Diferencia anual" value={pesos(difMes * 12)} foot={<span>{antes.costoTotal ? pct((despues.costoTotal - antes.costoTotal) / antes.costoTotal) : "nuevo"} por persona</span>} />
            <Kpi label="Nómina / ingresos" value={ultimoIngreso ? <span style={{ fontSize: 24, whiteSpace: "nowrap" }}>{pct(totalNomina / ultimoIngreso)} <ArrowRight size={16} /> {pct((totalNomina + difMes) / ultimoIngreso)}</span> : "—"} foot={<span>Nómina {pesos(totalNomina)} → {pesos(totalNomina + difMes)}</span>} />
          </div>
          <Card title="Comparativo ANTES vs DESPUÉS" sub="Rubro por rubro · mensual y anual">
            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table className="t">
                <thead><tr><th>Rubro</th><th className="r">Antes</th><th className="r">Después</th><th className="r">Dif. mensual</th><th className="r">Dif. anual</th><th className="r">%</th></tr></thead>
                <tbody>
                  {RUBROS.map((r, i) => {
                    const a = antes[r.key] as number;
                    const b = despues[r.key] as number;
                    const dif = b - a;
                    const nuevoGrupo = i === 0 || RUBROS[i - 1].grupo !== r.grupo;
                    const total = ["ingresoBruto", "totalDeducciones", "neto", "totalProvisiones", "totalPlanilla", "costoTotal", "netoConProvisiones", "aporteEmpleador"].includes(r.key);
                    return (
                      <tr key={r.key} className={r.key === "costoTotal" ? "total" : ""} style={nuevoGrupo ? { borderTop: "2px solid var(--separator)" } : undefined}>
                        <td style={{ fontWeight: total ? 600 : 400 }}>{nuevoGrupo && <div className="caption">{r.grupo}</div>}{r.label}</td>
                        <td className="r">{pesos(a)}</td>
                        <td className="r">{pesos(b)}</td>
                        <td className="r" style={{ color: dif > 0 ? "var(--orange)" : undefined }}>{dif ? `${dif > 0 ? "+" : ""}${pesos(dif)}` : "—"}</td>
                        <td className="r">{dif ? pesos(dif * 12) : "—"}</td>
                        <td className="r">{a ? pct(dif / a) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {despues.alertas.length > 0 && <div className="caption" style={{ color: "var(--red)", marginTop: 8 }}>{despues.alertas.join(" · ")}</div>}
          </Card>
        </div>
      </div>
    </>
  );
}

// ---------------- Propuestas ----------------

export function Propuestas() {
  const db = useDB();
  const sesion = useSesion();
  const toast = useToast();
  const nav = useNavigate();
  const [estado, setEstado] = useState<EstadoPropuesta | "">("");
  const [resolver, setResolver] = useState<{ p: Propuesta; accion: "APROBADA" | "RECHAZADA" | "DEVUELTA" } | null>(null);
  const [comentario, setComentario] = useState("");
  const lista = db.propuestas.filter((p) => !estado || p.estado === estado);
  const tipos: Record<Propuesta["tipo"], string> = { AUMENTO_PERSONA: "Aumento a persona", AUMENTO_CARGO: "Aumento a cargo", NUEVO_CARGO: "Cargo nuevo" };
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Seg value={estado} onChange={setEstado} options={[
          { value: "", label: "Todas", count: db.propuestas.length },
          { value: "PENDIENTE", label: "Pendientes", count: db.propuestas.filter((p) => p.estado === "PENDIENTE").length },
          { value: "APROBADA", label: "Aprobadas" }, { value: "DEVUELTA", label: "Devueltas" }, { value: "RECHAZADA", label: "Rechazadas" },
        ]} />
        <button className="btn primary right" onClick={() => nav("/nomina/simulador")}><Calculator />Nueva simulación</button>
      </div>
      {!lista.length ? <Empty icon={<FilePlus2 />} title="Sin propuestas" text="Las propuestas del simulador aparecen aquí, incluidas las rechazadas." /> : (
        <div className="grid g2">
          {lista.map((p) => {
            const emp = db.empleados.find((e) => e.id === p.empleadoId);
            const dif = p.baseAntes ? (p.baseDespues - p.baseAntes) / p.baseAntes : null;
            return (
              <Card key={p.id}
                title={<span className="row" style={{ gap: 8 }}>{tipos[p.tipo]}<EstatusBadge estatus={p.estado} /></span>}
                sub={`${emp ? `${emp.id} · ${titulo(emp.nombreCompleto)} · ` : ""}${titulo(p.cargo)} · ${titulo(p.area)}`}>
                <div className="row" style={{ gap: 12, alignItems: "baseline" }}>
                  <span className="muted num">{p.baseAntes ? pesos(p.baseAntes) : "Nuevo"}</span>
                  <ArrowRight size={16} />
                  <span className="kpi-value" style={{ margin: 0, fontSize: 26 }}>{pesos(p.baseDespues)}</span>
                  {dif !== null && <Badge color="orange">+{pct(dif)}</Badge>}
                </div>
                <div className="footnote" style={{ marginTop: 10 }}><b>Justificación:</b> {p.justificacion}</div>
                {p.comentarios && <div className="footnote"><b>Comentarios:</b> {p.comentarios}</div>}
                <div className="caption" style={{ marginTop: 8 }}>Aplica desde {fecha(p.fechaAplicacion)} · creada por {p.creadoPor} el {fechaHora(p.creadoEn)}</div>
                {p.resolucion && <div className="caption">{p.estado} por {p.resolucion.por} el {fechaHora(p.resolucion.en)}{p.resolucion.comentario ? ` · “${p.resolucion.comentario}”` : ""}</div>}
                {p.estado === "PENDIENTE" && sesion.rol === "ADMINISTRADOR" && (
                  <div className="row" style={{ marginTop: 14 }}>
                    <button className="btn sm success" onClick={() => setResolver({ p, accion: "APROBADA" })}><Check size={14} />Aprobar</button>
                    <button className="btn sm" onClick={() => setResolver({ p, accion: "DEVUELTA" })}><Undo2 size={14} />Devolver</button>
                    <button className="btn sm danger" onClick={() => setResolver({ p, accion: "RECHAZADA" })}><CircleSlash size={14} />Rechazar</button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <Modal open={!!resolver} onClose={() => setResolver(null)} size="narrow" title={resolver?.accion === "APROBADA" ? "Aprobar propuesta" : resolver?.accion === "DEVUELTA" ? "Devolver con comentarios" : "Rechazar propuesta"}
        footer={<><button className="btn" onClick={() => setResolver(null)}>Cancelar</button><button className={`btn primary ${resolver?.accion === "RECHAZADA" ? "danger" : ""}`} disabled={resolver?.accion !== "APROBADA" && !comentario.trim()} onClick={() => {
          resolverPropuesta(resolver!.p.id, resolver!.accion, comentario);
          toast(resolver!.accion === "APROBADA" ? `Aplicada desde ${fecha(resolver!.p.fechaAplicacion)} y registrada en el Historial` : `Propuesta ${resolver!.accion.toLowerCase()}`);
          setComentario(""); setResolver(null);
        }}>Confirmar</button></>}>
        {resolver?.accion === "APROBADA" && <p className="footnote" style={{ marginTop: 0 }}>El cambio se aplica desde {fecha(resolver.p.fechaAplicacion)}{resolver.p.tipo === "NUEVO_CARGO" ? " y el cargo se agrega a la lista maestra" : ""}. Si la nómina de ese mes está abierta, se recalcula.</p>}
        <Field label="Comentario" required={resolver?.accion !== "APROBADA"}><textarea className="textarea" value={comentario} onChange={(e) => setComentario(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
