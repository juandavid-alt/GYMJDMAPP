import { useEffect, useState } from "react";
import { Database, Landmark, ListChecks, Plus, RotateCcw, Save, ShieldCheck, Target, Users } from "lucide-react";
import { guardarConfigIndice, guardarServicio, guardarTributarios } from "../data/storeFin";
import type { ConfigIndice, ParamsTributarios, Servicio } from "../domain/facturacion";
import { mesesDelAnio } from "../data/selectorsFin";
import { MESES_CORTOS } from "../domain/fechas";
import { agregarALista, agregarCargo, enNube, getUsuarioNube, guardarParametros, nombreVisible, restablecerDemo, toggleTipoContrato, useDB, useSesion } from "../data/store";
import { guardarUsuario, listarUsuarios, type UsuarioNube } from "../data/nube";
import type { Parametros, Rol } from "../domain/types";
import { pct, pesos, titulo } from "../lib/format";
import { Badge, Card, Confirm, Field, Modal, MoneyInput, Seg, Switch, useToast } from "../components/ui";

type Tab = "parametros" | "tributarios" | "servicios" | "indice" | "listas" | "roles" | "datos";

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
          { value: "tributarios", label: <><Landmark size={14} />Tributarios</> },
          { value: "servicios", label: <><ListChecks size={14} />Servicios</> },
          { value: "indice", label: <><Target size={14} />Índice</> },
          { value: "listas", label: <><ListChecks size={14} />Listas maestras</> },
          { value: "roles", label: <><Users size={14} />Usuarios y roles</> },
          { value: "datos", label: <><Database size={14} />Datos</> },
        ]} />
      </div>
      {tab === "parametros" && <ParametrosView editable={sesion.rol === "ADMINISTRADOR"} />}
      {tab === "tributarios" && <Tributarios editable={sesion.rol === "ADMINISTRADOR" || sesion.rol === "CONTADORA"} />}
      {tab === "servicios" && <Servicios editable={sesion.rol === "ADMINISTRADOR" || sesion.rol === "CONTADORA"} />}
      {tab === "indice" && <ConfigIndiceView editable={sesion.rol === "ADMINISTRADOR"} />}
      {tab === "listas" && <Listas editable={sesion.rol !== "EMPLEADO"} admin={sesion.rol === "ADMINISTRADOR"} />}
      {tab === "roles" && (enNube() && getUsuarioNube()?.rol === "ADMINISTRADOR" ? <><UsuariosNube /><div style={{ height: 16 }} /><Roles /></> : <Roles />)}
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
      {!enNube() && <Card title="Modo demostración" sub="Cambia de rol desde la barra lateral (“Ver como”) para recorrer la plataforma con los permisos de cada perfil.">
        <div className="footnote">Los códigos de verificación se muestran en pantalla como “correo simulado”. En producción se envían por correo o SMS al ADMINISTRADOR y expiran en 5 minutos.</div>
      </Card>}
    </div>
  );
}

const ROL_NOMBRE: Record<Rol, string> = { ADMINISTRADOR: "Administrador (socio)", COORDINACION: "Coordinación", CONTADORA: "Contadora", CONSULTA: "Consulta (financieros)", EMPLEADO: "Empleado" };

function UsuariosNube() {
  const db = useDB();
  const toast = useToast();
  const [lista, setLista] = useState<UsuarioNube[] | null>(null);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<(Partial<UsuarioNube> & { usuario: string; clave?: string; nuevo?: boolean }) | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { listarUsuarios().then(setLista).catch((e: Error) => setError(e.message)); }, []);
  const personas = [...db.empleados].filter((e) => e.estatus === "ACTIVO").sort((a, b) => a.nombreCompleto.localeCompare(b.nombreCompleto));
  const guardar = async () => {
    if (!edit) return;
    setGuardando(true);
    try {
      const { nuevo: _n, ...datos } = edit;
      setLista(await guardarUsuario({ ...datos, clave: datos.clave || undefined }));
      toast(edit.nuevo ? "Usuario creado" : "Usuario actualizado");
      setEdit(null);
    } catch (e) {
      toast((e as Error).message, "warn");
    }
    setGuardando(false);
  };
  return (
    <Card title="Usuarios con acceso" sub="Cada persona entra con su usuario y clave. Las claves se guardan cifradas; nadie puede leerlas."
      action={<button className="btn sm primary" onClick={() => setEdit({ usuario: "", nombre: "", rol: "CONSULTA", perfilId: "", empleadoId: "", activo: true, clave: "", nuevo: true })}><Plus size={14} />Nuevo usuario</button>}>
      {error && <div className="footnote danger-text">{error}</div>}
      {!lista && !error && <div className="footnote">Cargando…</div>}
      {lista && !lista.length && <div className="footnote">Aún no hay usuarios. Estás entrando con el acceso de respaldo del administrador: crea un usuario para cada socio y para el equipo.</div>}
      {lista && lista.length > 0 && (
        <div className="list" style={{ boxShadow: "none" }}>
          {lista.map((u) => (
            <div className="list-row" key={u.usuario} onClick={() => setEdit({ ...u, clave: "" })} style={{ cursor: "pointer" }}>
              <span className="list-icon" style={{ background: u.activo ? "var(--blue)" : "var(--gray)" }}><ShieldCheck /></span>
              <div className="grow"><div className="list-label">{u.nombre || u.usuario}</div><div className="footnote">{u.usuario} · {ROL_NOMBRE[u.rol]}</div></div>
              {!u.activo && <Badge>Inactivo</Badge>}
            </div>
          ))}
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.nuevo ? "Nuevo usuario" : `Editar ${edit?.usuario}`} size="narrow"
        footer={<><button className="btn" onClick={() => setEdit(null)}>Cancelar</button><button className="btn primary" disabled={guardando || !edit?.usuario || (edit?.nuevo && !edit?.clave)} onClick={guardar}>{guardando ? "Guardando…" : "Guardar"}</button></>}>
        {edit && (
          <div className="stack">
            <Field label="Usuario" hint="Sin espacios, por ejemplo: felipe.vargas"><input className="input" disabled={!edit.nuevo} autoCapitalize="none" value={edit.usuario} onChange={(e) => setEdit({ ...edit, usuario: e.target.value.trim().toLowerCase() })} /></Field>
            <Field label="Persona" hint="Su perfil en la BBDD: define el nombre y la foto del saludo">
              <select className="input" value={edit.perfilId ?? ""} onChange={(e) => { const p = db.empleados.find((x) => x.id === e.target.value); setEdit({ ...edit, perfilId: e.target.value, empleadoId: e.target.value, nombre: p ? nombreVisible(p.nombreCompleto) : edit.nombre }); }}>
                <option value="">— Sin perfil (externo) —</option>
                {personas.map((p) => <option key={p.id} value={p.id}>{nombreVisible(p.nombreCompleto)} · {p.cargo || (p.esSocio ? "Socio" : "")}</option>)}
              </select>
            </Field>
            <Field label="Nombre visible"><input className="input" value={edit.nombre ?? ""} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Field>
            <Field label="Rol">
              <select className="input" value={edit.rol} onChange={(e) => setEdit({ ...edit, rol: e.target.value as Rol })}>
                {(Object.keys(ROL_NOMBRE) as Rol[]).map((r) => <option key={r} value={r}>{ROL_NOMBRE[r]}</option>)}
              </select>
            </Field>
            <Field label={edit.nuevo ? "Clave" : "Nueva clave"} hint={edit.nuevo ? "Mínimo 8 caracteres. Compártela por un canal privado." : "Déjala vacía para conservar la actual"}><input className="input" type="password" autoComplete="new-password" value={edit.clave ?? ""} onChange={(e) => setEdit({ ...edit, clave: e.target.value })} /></Field>
            {!edit.nuevo && <div className="row between"><span>Acceso activo</span><Switch on={!!edit.activo} onChange={(v) => setEdit({ ...edit, activo: v })} /></div>}
          </div>
        )}
      </Modal>
    </Card>
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
      {enNube() ? (
        <Card title="Base de datos en la nube" sub="Vercel Blob privado · cada cambio queda guardado y se hace una copia de seguridad diaria automática">
          <div className="footnote">Solo las personas con usuario pueden ver la información. Los perfiles de consulta no pueden modificar datos.</div>
        </Card>
      ) : (
        <Card title="Restablecer demo" sub="Vuelve a los datos ficticios iniciales">
          <button className="btn danger" onClick={() => setConfirmar(true)}><RotateCcw />Restablecer</button>
        </Card>
      )}
      <Confirm open={confirmar} onClose={() => setConfirmar(false)} danger title="¿Restablecer la demo?" confirmLabel="Restablecer"
        text="Se borrarán los cambios hechos en este navegador y se cargarán de nuevo los datos ficticios."
        onConfirm={() => { restablecerDemo(); toast("Demo restablecida"); }} />
    </div>
  );
}

function Tributarios({ editable }: { editable: boolean }) {
  const db = useDB();
  const toast = useToast();
  const [p, setP] = useState<ParamsTributarios>(db.tributarios[db.tributarios.length - 1]);
  const pctIn = (v: number, on: (n: number) => void, step = "0.01") => (
    <div className="row" style={{ gap: 6 }}><input className="input num" type="number" step={step} disabled={!editable} value={Number((v * 100).toFixed(4))} onChange={(e) => on(Number(e.target.value) / 100)} /><span className="muted">%</span></div>
  );
  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <Badge color="yellow">Valores iniciales: la contadora debe validarlos antes de operar</Badge>
        {editable && <button className="btn primary right" onClick={() => { guardarTributarios(p); toast(`Parámetros tributarios ${p.anio} guardados`); }}><Save />Guardar {p.anio}</button>}
      </div>
      <div className="grid g3">
        <Card title="IVA y ReteIVA">
          <div className="stack">
            <Field label="Tarifa de IVA">{pctIn(p.ivaPct, (n) => setP({ ...p, ivaPct: n }))}</Field>
            <Field label="ReteIVA (sobre el IVA)" hint="Practicada por grandes contribuyentes y entidades públicas">{pctIn(p.reteIvaPct, (n) => setP({ ...p, reteIvaPct: n }))}</Field>
            <Field label="UVT"><MoneyInput disabled={!editable} value={p.uvt} onChange={(v) => setP({ ...p, uvt: v })} /></Field>
          </div>
        </Card>
        <Card title="ReteFuente por concepto">
          <div className="stack">
            {(Object.keys(p.reteFuente) as (keyof ParamsTributarios["reteFuente"])[]).map((k) => (
              <div className="form-grid" key={k}>
                <Field label={titulo(k)}>{pctIn(p.reteFuente[k].pct, (n) => setP({ ...p, reteFuente: { ...p.reteFuente, [k]: { ...p.reteFuente[k], pct: n } } }))}</Field>
                <Field label="Base mínima (UVT)"><input className="input num" type="number" disabled={!editable} value={p.reteFuente[k].baseUvt} onChange={(e) => setP({ ...p, reteFuente: { ...p.reteFuente, [k]: { ...p.reteFuente[k], baseUvt: Number(e.target.value) } } })} /></Field>
              </div>
            ))}
          </div>
        </Card>
        <Card title="ReteICA Bogotá">
          <div className="stack">
            <Field label="Tarifa (por mil)" hint="Según actividad CIIU"><input className="input num" type="number" step="0.01" disabled={!editable} value={p.reteIcaPorMil} onChange={(e) => setP({ ...p, reteIcaPorMil: Number(e.target.value) })} /></Field>
            <Field label="Base mínima (UVT)"><input className="input num" type="number" disabled={!editable} value={p.reteIcaBaseUvt} onChange={(e) => setP({ ...p, reteIcaBaseUvt: Number(e.target.value) })} /></Field>
          </div>
        </Card>
      </div>
    </>
  );
}

function Servicios({ editable }: { editable: boolean }) {
  const db = useDB();
  const [nuevo, setNuevo] = useState<Servicio>({ nombre: "", categoria: "ADICIONAL", conceptoRetencion: "SERVICIOS", baseIva: "TOTAL", activo: true });
  return (
    <>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Servicio</th><th>Categoría</th><th>Concepto de retención</th><th>Base de IVA</th><th>Activo</th></tr></thead>
          <tbody>
            {db.servicios.map((s) => (
              <tr key={s.nombre}>
                <td>{s.nombre}</td>
                <td><Badge color={s.categoria === "MENSUAL" ? "green" : s.categoria === "ADICIONAL" ? "blue" : s.categoria === "PAUTA" ? "orange" : "gray"}>{s.categoria}</Badge></td>
                <td><select className="select sm" style={{ width: 160 }} disabled={!editable} value={s.conceptoRetencion} onChange={(e) => guardarServicio({ ...s, conceptoRetencion: e.target.value as Servicio["conceptoRetencion"] })}><option>SERVICIOS</option><option>HONORARIOS</option><option>PUBLICIDAD</option></select></td>
                <td><select className="select sm" style={{ width: 150 }} disabled={!editable || s.categoria !== "PAUTA"} value={s.baseIva} onChange={(e) => guardarServicio({ ...s, baseIva: e.target.value as Servicio["baseIva"] })}><option value="TOTAL">Total</option><option value="INCREMENTO">Solo incremento</option></select></td>
                <td><Switch on={s.activo} disabled={!editable} onChange={(v) => guardarServicio({ ...s, activo: v })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="row wrap" style={{ marginTop: 12 }}>
          <input className="input" style={{ maxWidth: 280 }} placeholder="Nuevo servicio" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
          <select className="select" style={{ width: 160 }} value={nuevo.categoria} onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value as Servicio["categoria"] })}><option>MENSUAL</option><option>ADICIONAL</option><option>PAUTA</option><option>TERCEROS</option></select>
          <button className="btn primary" disabled={!nuevo.nombre.trim() || db.servicios.some((s) => s.nombre === nuevo.nombre.trim())} onClick={() => { guardarServicio({ ...nuevo, nombre: nuevo.nombre.trim() }); setNuevo({ ...nuevo, nombre: "" }); }}><Plus />Agregar</button>
        </div>
      )}
      <div className="caption" style={{ marginTop: 8 }}>La base de IVA de la pauta con incremento (sobre el total o solo sobre el incremento) la define la contadora.</div>
    </>
  );
}

function ConfigIndiceView({ editable }: { editable: boolean }) {
  const db = useDB();
  const toast = useToast();
  const [c, setC] = useState<ConfigIndice>(db.configIndice);
  const anio = new Date().getFullYear();
  const meses = mesesDelAnio(anio);
  const pctIn = (k: keyof ConfigIndice, label: string, hint?: string) => (
    <Field label={label} hint={hint}><div className="row" style={{ gap: 6 }}><input className="input num" type="number" disabled={!editable} value={Math.round((c[k] as number) * 1000) / 10} onChange={(e) => setC({ ...c, [k]: Number(e.target.value) / 100 })} /><span className="muted">%</span></div></Field>
  );
  const pres = (m: string, k: "ingresos" | "costos" | "gastos", v: number) => setC({ ...c, presupuesto: { ...c.presupuesto, [m]: { ...(c.presupuesto[m] ?? { ingresos: 0, costos: 0, gastos: 0 }), [k]: v } } });
  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        {!editable && <Badge color="yellow">Solo lectura · edita el ADMINISTRADOR</Badge>}
        {editable && <button className="btn primary right" onClick={() => { guardarConfigIndice(c); toast("Configuración del Índice guardada"); }}><Save />Guardar</button>}
      </div>
      <div className="grid g3">
        <Card title="Metas">
          <div className="stack">
            <Field label="Ventas anuales (ingreso propio)"><MoneyInput disabled={!editable} value={c.metaVentasAnual} onChange={(v) => setC({ ...c, metaVentasAnual: v })} /></Field>
            {pctIn("metaMargenBruto", "Margen bruto")}
            {pctIn("metaMargenOperacional", "Margen operacional")}
            {pctIn("metaNominaPctIngresos", "Nómina % sobre ingresos (máximo)")}
          </div>
        </Card>
        <Card title="Umbrales de alerta">
          <div className="stack">
            {pctIn("umbralSobrecosto", "Sobrecosto por categoría", "vs promedio de 3 meses")}
            <Field label="Tope de gasto abrupto"><MoneyInput disabled={!editable} value={c.topeGastoAbrupto} onChange={(v) => setC({ ...c, topeGastoAbrupto: v })} /></Field>
            {pctIn("umbralConcentracion", "Concentración por cliente")}
            <Field label="Tope de capital adelantado en pauta"><MoneyInput disabled={!editable} value={c.topeCapitalPauta} onChange={(v) => setC({ ...c, topeCapitalPauta: v })} /></Field>
          </div>
        </Card>
        <Card title="Supuestos de proyección y cobro">
          <div className="stack">
            <Field label="Meses para promediar adicionales"><input className="input num" type="number" disabled={!editable} value={c.mesesPromedio} onChange={(e) => setC({ ...c, mesesPromedio: Number(e.target.value) })} /></Field>
            {pctIn("pctRenovacion", "% de renovación de contratos (optimista)")}
            <Field label="Correo de facturación LA BRUTAL"><input className="input" disabled={!editable} value={c.correoBrutal} onChange={(e) => setC({ ...c, correoBrutal: e.target.value })} /></Field>
            <Field label="Teléfono"><input className="input" disabled={!editable} value={c.telefonoBrutal} onChange={(e) => setC({ ...c, telefonoBrutal: e.target.value })} /></Field>
          </div>
        </Card>
      </div>
      <Card title="Plantilla del correo de cobro" sub="Variables: [N.º FACTURA] [RAZÓN SOCIAL] [VALOR TOTAL] [DESCRIPCIÓN] [FECHA DE VENCIMIENTO] [correo] [teléfono]" style={{ marginTop: 16 }}>
        <div className="stack">
          <Field label="Asunto"><input className="input" disabled={!editable} value={c.plantillaCorreo.asunto} onChange={(e) => setC({ ...c, plantillaCorreo: { ...c.plantillaCorreo, asunto: e.target.value } })} /></Field>
          <Field label="Cuerpo"><textarea className="textarea" style={{ minHeight: 200 }} disabled={!editable} value={c.plantillaCorreo.cuerpo} onChange={(e) => setC({ ...c, plantillaCorreo: { ...c.plantillaCorreo, cuerpo: e.target.value } })} /></Field>
        </div>
      </Card>
      <div className="section-title">Presupuesto {anio} <small>Ingresos, costos y gastos por mes</small></div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th>Mes</th><th className="r">Ingresos</th><th className="r">Costos</th><th className="r">Gastos</th></tr></thead>
          <tbody>
            {meses.map((m, i) => (
              <tr key={m}>
                <td>{MESES_CORTOS[i]}</td>
                {(["ingresos", "costos", "gastos"] as const).map((k) => <td key={k} className="r"><MoneyInput disabled={!editable} value={c.presupuesto[m]?.[k] ?? 0} onChange={(v) => pres(m, k, v)} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
