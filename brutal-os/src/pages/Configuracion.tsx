import { useEffect, useState } from "react";
import { Database, Landmark, ListChecks, Plus, RotateCcw, Save, ShieldCheck, Users } from "lucide-react";
import { agregarALista, agregarCargo, guardarParametros, restablecerDemo, toggleTipoContrato, useDB, useSesion } from "../data/store";
import type { Parametros } from "../domain/types";
import { pct, pesos, titulo } from "../lib/format";
import { Badge, Card, Confirm, Field, MoneyInput, Seg, Switch, useToast } from "../components/ui";

type Tab = "parametros" | "listas" | "roles" | "datos";

export default function Configuracion() {
  const sesion = useSesion();
  const [tab, setTab] = useState<Tab>("parametros");
  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Configuración</h1>
          <p className="subtitle" style={{ margin: 0 }}>Ningún valor legal vive en el código: todo sale de aquí, por año.</p>
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <Seg glassy value={tab} onChange={setTab} options={[
          { value: "parametros", label: <><Landmark size={14} />Parámetros</> },
          { value: "listas", label: <><ListChecks size={14} />Listas maestras</> },
          { value: "roles", label: <><Users size={14} />Usuarios y roles</> },
          { value: "datos", label: <><Database size={14} />Datos</> },
        ]} />
      </div>
      {tab === "parametros" && <ParametrosView editable={sesion.rol === "ADMINISTRADOR"} />}
      {tab === "listas" && <Listas editable={sesion.rol !== "EMPLEADO"} admin={sesion.rol === "ADMINISTRADOR"} />}
      {tab === "roles" && <Roles />}
      {tab === "datos" && <Datos />}
    </div>
  );
}

function ParametrosView({ editable }: { editable: boolean }) {
  const db = useDB();
  const toast = useToast();
  const anios = db.parametros.map((p) => p.anio).sort();
  const [anio, setAnio] = useState(anios[anios.length - 1]);
  const actual = db.parametros.find((p) => p.anio === anio)!;
  const [p, setP] = useState<Parametros>(actual);
  useEffect(() => setP(actual), [actual]);
  const set = <K extends keyof Parametros>(k: K, v: Parametros[K]) => setP((s) => ({ ...s, [k]: v }));
  const pctField = (k: keyof Parametros, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      <div className="row" style={{ gap: 6 }}>
        <input className="input num" type="number" step="0.001" disabled={!editable} value={Number(((p[k] as number) * 100).toFixed(4))} onChange={(e) => set(k, (Number(e.target.value) / 100) as never)} />
        <span className="muted">%</span>
      </div>
    </Field>
  );
  const nuevoAnio = () => {
    const base = db.parametros.find((x) => x.anio === anios[anios.length - 1])!;
    const n = { ...base, anio: base.anio + 1, smmlv: Math.round(base.smmlv * (1 + base.incrementoSmmlvProyeccion)), auxTransporte: Math.round(base.auxTransporte * (1 + base.incrementoSmmlvProyeccion)), festivos: [] };
    guardarParametros(n);
    setAnio(n.anio);
    toast(`Parámetros ${n.anio} creados (estimados: actualízalos con el decreto oficial)`, "warn", 5000);
  };
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <Seg value={String(anio)} onChange={(v) => setAnio(Number(v))} options={anios.map((a) => ({ value: String(a), label: String(a) }))} />
        {editable && <button className="btn" onClick={nuevoAnio}><Plus />Nuevo año</button>}
        {!editable && <Badge color="yellow">Solo lectura · edita el ADMINISTRADOR</Badge>}
        {editable && <button className="btn primary right" onClick={() => { guardarParametros(p); toast(`Parámetros ${anio} guardados · la nómina abierta se recalcula`); }}><Save />Guardar {anio}</button>}
      </div>
      <div className="grid g3">
        <Card title="Valores base" sub={`Año ${anio}`}>
          <div className="stack">
            <Field label="SMMLV"><MoneyInput disabled={!editable} value={p.smmlv} onChange={(v) => set("smmlv", v)} /></Field>
            <Field label="Auxilio de transporte"><MoneyInput disabled={!editable} value={p.auxTransporte} onChange={(v) => set("auxTransporte", v)} /></Field>
            <Field label="Tope auxilio de transporte (SMMLV)"><input className="input num" type="number" disabled={!editable} value={p.topeAuxTransporteSmmlv} onChange={(e) => set("topeAuxTransporteSmmlv", Number(e.target.value))} /></Field>
            <Field label="UVT"><MoneyInput disabled={!editable} value={p.uvt} onChange={(v) => set("uvt", v)} /></Field>
            <Field label="Horas mensuales (jornada)" hint="210 = jornada de 42 h semanales"><input className="input num" type="number" disabled={!editable} value={p.horasMes} onChange={(e) => set("horasMes", Number(e.target.value))} /></Field>
          </div>
        </Card>
        <Card title="Política interna" sub="Auxilio no prestacional y proyección">
          <div className="stack">
            {pctField("auxNoPrestPctGeneral", "Aux. no prestacional general", "Sobre la base prestacional")}
            {pctField("auxNoPrestPctMinimo", "Aux. no prestacional (salario mínimo)")}
            {pctField("topeNoSalarialPct", "Tope pagos no salariales", "Ley 1393 de 2010: el exceso entra al IBC")}
            {pctField("incrementoSmmlvProyeccion", "Incremento anual SMMLV (proyección)")}
            {pctField("incrementoGeneralProyeccion", "Incremento general salarios (proyección)")}
            {pctField("variacionAlertaPct", "Alerta de variación vs mes anterior")}
          </div>
        </Card>
        <Card title="Deducciones y provisiones">
          <div className="stack">
            {pctField("saludEmpleadoPct", "Salud empleado")}
            {pctField("pensionEmpleadoPct", "Pensión empleado")}
            {pctField("cesantiasPct", "Cesantías")}
            {pctField("primaPct", "Prima")}
            {pctField("interesesCesantiasPct", "Intereses de cesantías (anual)")}
            {pctField("vacacionesPct", "Vacaciones")}
            {pctField("incapacidadPct", "Pago incapacidad", "Nunca inferior al SMMLV diario")}
          </div>
        </Card>
        <Card title="Aportes del empleador">
          <div className="stack">
            {pctField("pensionEmpleadorPct", "Pensión empleador")}
            {pctField("ccfPct", "Caja de compensación")}
            {pctField("saludEmpleadorPct", "Salud empleador")}
            <Field label="Salud empleador desde (SMMLV)"><input className="input num" type="number" disabled={!editable} value={p.saludEmpleadorDesdeSmmlv} onChange={(e) => set("saludEmpleadorDesdeSmmlv", Number(e.target.value))} /></Field>
            {pctField("icbfPct", "ICBF")}
            {pctField("senaPct", "SENA")}
            <Field label="Exoneración ICBF/SENA por debajo de (SMMLV)" hint="Art. 114-1 E.T."><input className="input num" type="number" disabled={!editable} value={p.exoneracionIcbfSenaHastaSmmlv} onChange={(e) => set("exoneracionIcbfSenaHastaSmmlv", Number(e.target.value))} /></Field>
          </div>
        </Card>
        <Card title="ARL y recargos">
          <div className="stack">
            {([1, 2, 3, 4, 5] as const).map((c) => (
              <Field key={c} label={`ARL riesgo ${c}`}>
                <div className="row" style={{ gap: 6 }}>
                  <input className="input num" type="number" step="0.001" disabled={!editable} value={Number((p.arlPct[c] * 100).toFixed(4))} onChange={(e) => set("arlPct", { ...p.arlPct, [c]: Number(e.target.value) / 100 })} />
                  <span className="muted">%</span>
                </div>
              </Field>
            ))}
            {(["hed", "hen", "nocturno", "dominical"] as const).map((k) => (
              <Field key={k} label={{ hed: "Recargo hora extra diurna", hen: "Recargo hora extra nocturna", nocturno: "Recargo nocturno", dominical: "Recargo dominical / festivo" }[k]}>
                <div className="row" style={{ gap: 6 }}>
                  <input className="input num" type="number" disabled={!editable} value={Math.round(p.recargos[k] * 100)} onChange={(e) => set("recargos", { ...p.recargos, [k]: Number(e.target.value) / 100 })} />
                  <span className="muted">%</span>
                </div>
              </Field>
            ))}
          </div>
        </Card>
        <Card title="Fondo de solidaridad y cuentas">
          <div className="list" style={{ boxShadow: "none", marginBottom: 14 }}>
            {p.fsp.map((t) => <div className="list-row flat" key={t.desdeSmmlv}><span>Desde {t.desdeSmmlv} SMMLV ({pesos(t.desdeSmmlv * p.smmlv)})</span><b className="right">{pct(t.pct)}</b></div>)}
          </div>
          <div className="stack">
            <Field label="Banco cuenta de provisiones"><select className="select" disabled={!editable} value={p.cuentaProvisiones.banco} onChange={(e) => set("cuentaProvisiones", { ...p.cuentaProvisiones, banco: e.target.value })}>{db.listas.bancos.map((b) => <option key={b}>{b}</option>)}</select></Field>
            <Field label="Número cuenta de provisiones"><input className="input mono" disabled={!editable} value={p.cuentaProvisiones.numero} onChange={(e) => set("cuentaProvisiones", { ...p.cuentaProvisiones, numero: e.target.value.replace(/\D/g, "") })} /></Field>
            <Field label="Día hábil de vencimiento PILA" hint="Según los dos últimos dígitos del NIT"><input className="input num" type="number" min={2} max={16} disabled={!editable} value={p.diaHabilPila} onChange={(e) => set("diaHabilPila", Number(e.target.value))} /></Field>
            <Field label="Festivos (AAAA-MM-DD, separados por coma)"><textarea className="textarea mono" disabled={!editable} value={p.festivos.join(", ")} onChange={(e) => set("festivos", e.target.value.split(",").map((s) => s.trim()).filter(Boolean))} /></Field>
          </div>
        </Card>
      </div>
    </>
  );
}

function Listas({ editable, admin }: { editable: boolean; admin: boolean }) {
  const db = useDB();
  const toast = useToast();
  const [nuevo, setNuevo] = useState<Record<string, string>>({});
  const [areaCargo, setAreaCargo] = useState(db.listas.areas[0]);
  const simples = [
    ["areas", "Áreas"], ["eps", "EPS"], ["afp", "Fondos de pensiones"], ["arl", "ARL"], ["bancos", "Bancos"], ["parentescos", "Parentescos"],
  ] as const;
  return (
    <>
      <div className="grid g3">
        <Card title="Tipos de contrato" sub="Desactivar = obsoleto: conserva históricos y bloquea nuevos registros">
          <div className="list" style={{ boxShadow: "none" }}>
            {db.listas.tiposContrato.map((t) => (
              <div className="list-row flat" key={t.valor}>
                <div className="grow"><div className="list-label">{t.etiqueta}</div><div className="caption">{db.empleados.filter((e) => e.tipoContrato === t.valor && e.estatus === "ACTIVO").length} activos · {t.activo ? "permitido" : "obsoleto"}</div></div>
                <Switch on={t.activo} disabled={!admin} onChange={() => { toggleTipoContrato(t.valor); toast(t.activo ? `${t.etiqueta} marcado como obsoleto` : `${t.etiqueta} reactivado`); }} />
              </div>
            ))}
          </div>
        </Card>
        <Card title="Cargos por área" sub="El menú de cargo depende del área" className="span2">
          <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
            {db.listas.areas.map((a) => <button key={a} className={`chip-btn ${a === areaCargo ? "on" : ""}`} onClick={() => setAreaCargo(a)}>{titulo(a)}</button>)}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {db.listas.cargos.filter((c) => c.area === areaCargo).map((c) => (
              <Badge key={c.cargo} color={db.plantilla.some((p) => p.cargo === c.cargo) ? "purple" : "orange"}>{c.cargo}</Badge>
            ))}
          </div>
          {editable && (
            <div className="row" style={{ marginTop: 14 }}>
              <input className="input" placeholder={`Nuevo cargo en ${titulo(areaCargo)}`} value={nuevo.cargo ?? ""} onChange={(e) => setNuevo({ ...nuevo, cargo: e.target.value.toUpperCase() })} />
              <button className="btn primary" disabled={!nuevo.cargo?.trim()} onClick={() => { agregarCargo(nuevo.cargo!, areaCargo); setNuevo({ ...nuevo, cargo: "" }); toast("Cargo agregado · define su base con el simulador (cargo nuevo)"); }}><Plus />Agregar</button>
            </div>
          )}
          <div className="caption" style={{ marginTop: 8 }}>Morado: tiene base en la plantilla salarial. Naranja: falta definir su base.</div>
        </Card>
      </div>
      <div className="grid g3" style={{ marginTop: 16 }}>
        {simples.map(([k, label]) => (
          <Card key={k} title={label} sub={`${db.listas[k].length} valores`}>
            <div className="row wrap" style={{ gap: 6 }}>{db.listas[k].map((v) => <Badge key={v}>{v}</Badge>)}</div>
            {editable && (
              <div className="row" style={{ marginTop: 12 }}>
                <input className="input sm" placeholder="Agregar…" value={nuevo[k] ?? ""} onChange={(e) => setNuevo({ ...nuevo, [k]: e.target.value.toUpperCase() })} />
                <button className="btn sm" disabled={!nuevo[k]?.trim()} onClick={() => { agregarALista(k, nuevo[k]!); setNuevo({ ...nuevo, [k]: "" }); }}><Plus size={14} /></button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

function Roles() {
  const filas = [
    ["ADMINISTRADOR (socios)", "Todo. Aprueba nómina y propuestas con código de verificación, reabre meses, edita PARÁMETROS, ve socios y cuentas bancarias completas.", "var(--yellow)"],
    ["COORDINACIÓN (auxiliar administrativa)", "Crea y edita empleados, sube documentos, registra novedades, carga filas y crea propuestas. No aprueba ni ve datos de socios. Cuentas y documentos enmascarados en vistas generales.", "var(--blue)"],
    ["EMPLEADO", "Ve y actualiza solo su propio perfil. Sin acceso a Nómina.", "var(--green)"],
    ["CONSULTA (futuro)", "Solo lectura de reportes y dashboards autorizados.", "var(--gray)"],
  ];
  return (
    <div className="grid g2">
      <Card title="Roles y permisos" sub="En producción: login con correo corporativo, sesiones con expiración y Row Level Security en PostgreSQL">
        <div className="list" style={{ boxShadow: "none" }}>
          {filas.map(([r, d, c]) => (
            <div className="list-row" key={r} style={{ alignItems: "flex-start" }}>
              <span className="list-icon" style={{ background: c }}><ShieldCheck /></span>
              <div><div className="list-label">{r}</div><div className="footnote">{d}</div></div>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Modo demostración" sub="Cambia de rol desde la barra lateral (“Ver como”) para recorrer la plataforma con los permisos de cada perfil.">
        <div className="footnote">Los códigos de verificación se muestran en pantalla como “correo simulado”. En producción se envían por correo o SMS al ADMINISTRADOR y expiran en 5 minutos.</div>
      </Card>
    </div>
  );
}

function Datos() {
  const db = useDB();
  const toast = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const exportar = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `brutal-os-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  return (
    <div className="grid g2">
      <Card title="Respaldo" sub="Copia completa de la base de datos de la demo">
        <div className="footnote" style={{ marginBottom: 12 }}>{db.empleados.length} empleados · {db.periodos.length} nóminas · {db.historial.length} eventos en el Historial</div>
        <button className="btn" onClick={exportar}><Database />Descargar respaldo (.json)</button>
      </Card>
      <Card title="Restablecer demo" sub="Vuelve a los datos ficticios iniciales">
        <button className="btn danger" onClick={() => setConfirmar(true)}><RotateCcw />Restablecer</button>
      </Card>
      <Confirm open={confirmar} onClose={() => setConfirmar(false)} danger title="¿Restablecer la demo?" confirmLabel="Restablecer"
        text="Se borrarán los cambios hechos en este navegador y se cargarán de nuevo los datos ficticios."
        onConfirm={() => { restablecerDemo(); toast("Demo restablecida"); }} />
    </div>
  );
}
