import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, CircleAlert, FileUp, RotateCcw, ShieldCheck } from "lucide-react";
import { buscarPorDocumento, crearEmpleado, reactivarEmpleado, useDB, useSesion, type NuevoEmpleado as NE } from "../../data/store";
import { ARCHIVOS } from "../../domain/catalogos";
import { calcularTerminacion, soloDigitos, validarCelular, validarCorreo } from "../../domain/empleados";
import { hoy } from "../../domain/fechas";
import type { TipoArchivo } from "../../domain/types";
import { fecha } from "../../lib/format";
import { Field, Modal, useToast } from "../../components/ui";

const PASOS = ["Datos personales", "Seguridad social", "Datos bancarios", "Contacto de emergencia", "Documentos", "Datos internos", "Confirmación"];
const DOCS_EMPLEADO: TipoArchivo[] = ["CEDULA", "CERTIFICADO_BANCARIO", "AFILIACION_EPS", "AFILIACION_PENSION", "AFILIACION_ARL", "ANTECEDENTES", "FOTO"];
const BORRADOR = "brutal-os-borrador-empleado";

const VACIO: NE = {
  tipoContrato: "FIJO", inicioContrato: hoy(), duracionMeses: 6, nombreCompleto: "", fechaNacimiento: "", tipoDocumento: "CC", numeroDocumento: "",
  genero: "FEMENINO", celular: "", correo: "", direccion: "", area: "", cargo: "", claseRiesgoArl: 1, eps: "", arl: "SURA", afp: "", banco: "",
  tipoCuenta: "AHORROS", numeroCuenta: "", emergenciaNombre: "", emergenciaParentesco: "", emergenciaCelular: "", autorizacionDatos: false,
};

export default function NuevoEmpleado({ open, onClose, onCreado }: { open: boolean; onClose: () => void; onCreado: (id: string) => void }) {
  const db = useDB();
  const sesion = useSesion();
  const toast = useToast();
  const nav = useNavigate();
  const [paso, setPaso] = useState(0);
  const [f, setF] = useState<NE>(VACIO);
  const [files, setFiles] = useState<Partial<Record<TipoArchivo, File>>>({});
  const [intento, setIntento] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [reactivar, setReactivar] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const b = localStorage.getItem(BORRADOR);
      if (b) {
        setF({ ...VACIO, ...JSON.parse(b) });
        toast("Recuperamos tu borrador", "info");
      }
    } catch {
      /* noop */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(BORRADOR, JSON.stringify(f));
      } catch {
        /* noop */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [f, open]);

  const set = <K extends keyof NE>(k: K, v: NE[K]) => setF((s) => ({ ...s, [k]: v }));
  const existente = f.numeroDocumento.length >= 5 ? buscarPorDocumento(f.numeroDocumento) : undefined;
  const tiposActivos = db.listas.tiposContrato.filter((t) => t.activo);
  const cargos = db.listas.cargos.filter((c) => c.area === f.area);
  const terminacion = f.tipoContrato === "FIJO" && f.duracionMeses && f.inicioContrato ? calcularTerminacion(f.inicioContrato, f.duracionMeses) : null;

  const errores = useMemo(() => {
    const e: Record<string, string | true> = {};
    const req = (k: keyof NE) => { if (!String(f[k] ?? "").trim()) e[k] = true; };
    if (paso === 0) {
      ["tipoDocumento", "numeroDocumento", "nombreCompleto", "fechaNacimiento", "genero", "celular", "correo", "direccion"].forEach((k) => req(k as keyof NE));
      if (f.celular && !validarCelular(f.celular)) e.celular = "Debe tener 10 dígitos sin espacios";
      if (f.correo && !validarCorreo(f.correo)) e.correo = "Correo no válido";
      if (existente && !reactivar) e.numeroDocumento = "Este documento ya existe";
    }
    if (paso === 1) ["eps", "arl", "afp"].forEach((k) => req(k as keyof NE));
    if (paso === 2) {
      ["banco", "tipoCuenta", "numeroCuenta"].forEach((k) => req(k as keyof NE));
      if (f.numeroCuenta && !/^\d{6,20}$/.test(f.numeroCuenta)) e.numeroCuenta = "Solo dígitos";
    }
    if (paso === 3) {
      ["emergenciaNombre", "emergenciaParentesco", "emergenciaCelular"].forEach((k) => req(k as keyof NE));
      if (f.emergenciaCelular && !validarCelular(f.emergenciaCelular)) e.emergenciaCelular = "Debe tener 10 dígitos";
    }
    if (paso === 5) {
      ["area", "cargo", "tipoContrato", "inicioContrato"].forEach((k) => req(k as keyof NE));
      if (f.tipoContrato === "FIJO" && !f.duracionMeses) e.duracionMeses = true;
    }
    if (paso === 6 && !f.autorizacionDatos) e.autorizacionDatos = "Debes aceptar la autorización para continuar";
    return e;
  }, [f, paso, existente, reactivar]);

  const cls = (k: string) => (intento && errores[k] ? (errores[k] === true ? "required-empty" : "invalid") : "");
  const msg = (k: string) => (intento && typeof errores[k] === "string" ? (errores[k] as string) : undefined);

  const siguiente = () => {
    setIntento(true);
    if (Object.keys(errores).length) return;
    setIntento(false);
    setPaso((p) => Math.min(PASOS.length - 1, p + 1));
  };

  const cerrar = () => {
    setPaso(0);
    setIntento(false);
    setReactivar(null);
    onClose();
  };

  const limpiar = () => {
    setF(VACIO);
    setFiles({});
    try { localStorage.removeItem(BORRADOR); } catch { /* noop */ }
  };

  const guardar = async () => {
    setIntento(true);
    if (Object.keys(errores).length) return;
    setGuardando(true);
    try {
      if (reactivar) {
        const { autorizacionDatos, ...resto } = f;
        reactivarEmpleado(reactivar, { ...resto, autorizacionDatos, autorizacionFecha: hoy() });
        toast(<>Reactivado con su mismo ID <b>{reactivar}</b></>);
        limpiar();
        cerrar();
        onCreado(reactivar);
      } else {
        const id = await crearEmpleado(f, files);
        toast(<><b>{id}</b> creado · carpeta “{id} – {f.nombreCompleto}” lista</>);
        limpiar();
        cerrar();
        onCreado(id);
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={reactivar ? `Reactivar ${reactivar}` : "Nuevo empleado"}
      leading={<button className="btn plain sm" onClick={limpiar} title="Descartar borrador"><RotateCcw size={14} />Limpiar</button>}
      footer={
        <>
          <span className="caption" style={{ marginRight: "auto", alignSelf: "center" }}>Borrador guardado automáticamente</span>
          {paso > 0 && <button className="btn" onClick={() => { setIntento(false); setPaso(paso - 1); }}><ChevronLeft />Atrás</button>}
          {paso < PASOS.length - 1 ? (
            <button className="btn primary" onClick={siguiente}>Siguiente<ChevronRight /></button>
          ) : (
            <button className="btn primary" disabled={guardando} onClick={guardar}><Check />{reactivar ? "Reactivar" : "Crear empleado"}</button>
          )}
        </>
      }
    >
      <div className="steps">{PASOS.map((p, i) => <span key={p} className={i <= paso ? "on" : ""} />)}</div>
      <div className="step-name">Paso {paso + 1} de {PASOS.length}</div>
      <div className="headline" style={{ fontSize: 22, marginBottom: 16 }}>{PASOS[paso]}</div>

      {paso === 0 && (
        <div className="form-grid">
          <Field label="Tipo de documento" required>
            <select className={`select ${cls("tipoDocumento")}`} value={f.tipoDocumento} onChange={(e) => set("tipoDocumento", e.target.value as NE["tipoDocumento"])}>
              {db.listas.tiposDocumento.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Número de documento" required error={msg("numeroDocumento")}>
            <input className={`input ${cls("numeroDocumento")}`} inputMode="numeric" value={f.numeroDocumento} onChange={(e) => set("numeroDocumento", soloDigitos(e.target.value))} />
          </Field>
          {existente && (
            <div className="full card" style={{ background: "color-mix(in srgb, var(--orange) 12%, transparent)", boxShadow: "none", padding: 14 }}>
              <div className="row wrap">
                <CircleAlert color="var(--orange)" />
                <div className="grow">
                  <b>{existente.nombreCompleto}</b> ya está registrado como <b>{existente.id}</b> ({existente.estatus}).
                  <div className="footnote">No se duplican registros. Puedes actualizar su perfil o reactivarlo con el mismo ID.</div>
                </div>
                <button className="btn sm" onClick={() => { cerrar(); nav(`/empleados/${existente.id}`); }}>Actualizar perfil</button>
                {existente.estatus === "RETIRADO" && (
                  <button className="btn sm primary" onClick={() => {
                    setReactivar(existente.id);
                    const { id: _i, estatus: _e, esSocio: _s, renovaciones: _r, terminacionContrato: _t, examen: _x, archivos: _a, creadoEn: _c, autorizacionFecha: _af, retiro: _rt, examenEgreso: _ee, ...datos } = existente;
                    setF({ ...VACIO, ...datos, inicioContrato: hoy(), autorizacionDatos: false });
                  }}>Reactivar {existente.id}</button>
                )}
              </div>
            </div>
          )}
          <Field label="Nombre completo" required full hint="Se guarda en MAYÚSCULAS">
            <input className={`input ${cls("nombreCompleto")}`} value={f.nombreCompleto} onChange={(e) => set("nombreCompleto", e.target.value.toUpperCase())} />
          </Field>
          <Field label="Fecha de nacimiento" required hint={f.fechaNacimiento ? fecha(f.fechaNacimiento) : "DD/MM/AAAA"}>
            <input type="date" className={`input ${cls("fechaNacimiento")}`} value={f.fechaNacimiento} max={hoy()} onChange={(e) => set("fechaNacimiento", e.target.value)} />
          </Field>
          <Field label="Género" required>
            <select className="select" value={f.genero} onChange={(e) => set("genero", e.target.value as NE["genero"])}>
              <option>FEMENINO</option><option>MASCULINO</option><option>OTRO</option>
            </select>
          </Field>
          <Field label="Celular" required error={msg("celular")} hint="10 dígitos sin espacios">
            <input className={`input ${cls("celular")}`} inputMode="numeric" maxLength={10} value={f.celular} onChange={(e) => set("celular", soloDigitos(e.target.value))} />
          </Field>
          <Field label="Correo personal" required error={msg("correo")}>
            <input className={`input ${cls("correo")}`} type="email" value={f.correo} onChange={(e) => set("correo", e.target.value.trim())} />
          </Field>
          <Field label="Dirección" required full>
            <input className={`input ${cls("direccion")}`} value={f.direccion} onChange={(e) => set("direccion", e.target.value)} />
          </Field>
        </div>
      )}

      {paso === 1 && (
        <div className="form-grid">
          <Field label="EPS" required>
            <select className={`select ${cls("eps")}`} value={f.eps} onChange={(e) => set("eps", e.target.value)}>
              <option value="">Selecciona…</option>
              {db.listas.eps.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="ARL" required>
            <select className={`select ${cls("arl")}`} value={f.arl} onChange={(e) => set("arl", e.target.value)}>
              {db.listas.arl.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Fondo de pensiones" required full>
            <select className={`select ${cls("afp")}`} value={f.afp} onChange={(e) => set("afp", e.target.value)}>
              <option value="">Selecciona…</option>
              {db.listas.afp.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
        </div>
      )}

      {paso === 2 && (
        <div className="form-grid">
          <Field label="Banco" required hint="Solo bancos aceptados">
            <select className={`select ${cls("banco")}`} value={f.banco} onChange={(e) => set("banco", e.target.value)}>
              <option value="">Selecciona…</option>
              {db.listas.bancos.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Tipo de cuenta" required>
            <select className="select" value={f.tipoCuenta} onChange={(e) => set("tipoCuenta", e.target.value as NE["tipoCuenta"])}>
              {db.listas.tiposCuenta.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Número de cuenta" required full error={msg("numeroCuenta")} hint="Se cifra y solo lo ve el ADMINISTRADOR">
            <input className={`input mono ${cls("numeroCuenta")}`} inputMode="numeric" value={f.numeroCuenta} onChange={(e) => set("numeroCuenta", soloDigitos(e.target.value))} />
          </Field>
        </div>
      )}

      {paso === 3 && (
        <div className="form-grid">
          <Field label="Nombre del contacto" required full>
            <input className={`input ${cls("emergenciaNombre")}`} value={f.emergenciaNombre} onChange={(e) => set("emergenciaNombre", e.target.value.toUpperCase())} />
          </Field>
          <Field label="Parentesco" required>
            <select className={`select ${cls("emergenciaParentesco")}`} value={f.emergenciaParentesco} onChange={(e) => set("emergenciaParentesco", e.target.value)}>
              <option value="">Selecciona…</option>
              {db.listas.parentescos.map((x) => <option key={x}>{x}</option>)}
            </select>
          </Field>
          <Field label="Celular" required error={msg("emergenciaCelular")}>
            <input className={`input ${cls("emergenciaCelular")}`} inputMode="numeric" maxLength={10} value={f.emergenciaCelular} onChange={(e) => set("emergenciaCelular", soloDigitos(e.target.value))} />
          </Field>
        </div>
      )}

      {paso === 4 && (
        <div className="stack">
          <p className="footnote" style={{ margin: 0 }}>Se guardan con nombre estándar (ej. LB0012_CEDULA.pdf) en la carpeta del empleado. Si faltan, se generará una alerta 5 días después del ingreso.</p>
          {DOCS_EMPLEADO.map((t) => (
            <DropFile key={t} tipo={t} file={files[t]} onFile={(file) => setFiles((s) => ({ ...s, [t]: file }))} />
          ))}
        </div>
      )}

      {paso === 5 && (
        <>
          {sesion.rol === "EMPLEADO" ? (
            <div className="footnote">Esta sección la completa la auxiliar administrativa.</div>
          ) : (
            <div className="form-grid">
              <Field label="Área" required>
                <select className={`select ${cls("area")}`} value={f.area} onChange={(e) => { set("area", e.target.value); set("cargo", ""); }}>
                  <option value="">Selecciona…</option>
                  {db.listas.areas.map((x) => <option key={x}>{x}</option>)}
                </select>
              </Field>
              <Field label="Cargo" required hint={f.area ? `${cargos.length} cargos en ${f.area}` : "Primero elige el área"}>
                <select className={`select ${cls("cargo")}`} value={f.cargo} disabled={!f.area} onChange={(e) => set("cargo", e.target.value)}>
                  <option value="">Selecciona…</option>
                  {cargos.map((x) => <option key={x.cargo}>{x.cargo}</option>)}
                </select>
              </Field>
              <Field label="Tipo de contrato" required hint={db.listas.tiposContrato.some((t) => !t.activo) ? "Prestación de servicios está marcado como obsoleto" : undefined}>
                <select className="select" value={f.tipoContrato} onChange={(e) => { const v = e.target.value as NE["tipoContrato"]; set("tipoContrato", v); set("duracionMeses", v === "FIJO" ? 6 : null); }}>
                  {tiposActivos.map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}</option>)}
                </select>
              </Field>
              <Field label="Fecha de inicio" required hint={fecha(f.inicioContrato)}>
                <input type="date" className={`input ${cls("inicioContrato")}`} value={f.inicioContrato} onChange={(e) => set("inicioContrato", e.target.value)} />
              </Field>
              {f.tipoContrato === "FIJO" && (
                <>
                  <Field label="Duración" required>
                    <select className="select" value={f.duracionMeses ?? 6} onChange={(e) => set("duracionMeses", Number(e.target.value) as 6 | 12)}>
                      <option value={6}>6 meses</option><option value={12}>12 meses</option>
                    </select>
                  </Field>
                  <Field label="Terminación del contrato" hint="Calculada automáticamente">
                    <input className="input" disabled value={fecha(terminacion)} />
                  </Field>
                </>
              )}
              <Field label="Clase de riesgo ARL">
                <select className="select" value={f.claseRiesgoArl} onChange={(e) => set("claseRiesgoArl", Number(e.target.value) as NE["claseRiesgoArl"])}>
                  {[1, 2, 3, 4, 5].map((c) => <option key={c} value={c}>Riesgo {c}</option>)}
                </select>
              </Field>
              <Field label="Examen médico de ingreso" hint="Todo empleado nuevo entra en PENDIENTE CITAR">
                <input className="input" disabled value="PENDIENTE CITAR" />
              </Field>
              <div className="full">
                <DropFile tipo="CONTRATO_FIRMADO" file={files.CONTRATO_FIRMADO} onFile={(file) => setFiles((s) => ({ ...s, CONTRATO_FIRMADO: file }))} />
              </div>
            </div>
          )}
        </>
      )}

      {paso === 6 && (
        <div className="stack">
          <div className="list">
            {[
              ["Nombre", f.nombreCompleto],
              ["Documento", `${f.tipoDocumento} ${f.numeroDocumento}`],
              ["Área · Cargo", `${f.area} · ${f.cargo}`],
              ["Contrato", `${f.tipoContrato}${f.duracionMeses ? ` · ${f.duracionMeses} meses` : ""} · inicia ${fecha(f.inicioContrato)}${terminacion ? ` · termina ${fecha(terminacion)}` : ""}`],
              ["Seguridad social", `${f.eps} · ${f.afp} · ARL ${f.arl}`],
              ["Banco", `${f.banco} · ${f.tipoCuenta}`],
              ["Documentos cargados", `${Object.keys(files).length} archivos`],
            ].map(([k, v]) => (
              <div className="list-row flat" key={k}><span className="muted" style={{ width: 160 }}>{k}</span><b style={{ fontWeight: 500 }}>{v}</b></div>
            ))}
          </div>
          <label className={`check card ${intento && errores.autorizacionDatos ? "required-empty" : ""}`} style={{ boxShadow: "none", background: intento && errores.autorizacionDatos ? "color-mix(in srgb, var(--yellow) 22%, transparent)" : "var(--fill-2)" }}>
            <input type="checkbox" checked={f.autorizacionDatos} onChange={(e) => set("autorizacionDatos", e.target.checked)} />
            <span>
              <b><ShieldCheck size={15} style={{ verticalAlign: -2 }} /> Autorizo el tratamiento de mis datos personales</b>
              <span className="footnote" style={{ display: "block", marginTop: 4 }}>
                De conformidad con la Ley 1581 de 2012 y el Decreto 1377 de 2013, autorizo a LA BRUTAL para recolectar, almacenar y usar mis datos personales con fines laborales, de nómina, seguridad social y obligaciones legales. Puedo conocer, actualizar, rectificar y suprimir mis datos en cualquier momento.
              </span>
              {msg("autorizacionDatos") && <span className="err" style={{ color: "var(--red)", fontSize: 12 }}>{msg("autorizacionDatos")}</span>}
            </span>
          </label>
        </div>
      )}
    </Modal>
  );
}

export function DropFile({ tipo, file, onFile, existente }: { tipo: TipoArchivo; file?: File; onFile: (f: File) => void; existente?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const meta = ARCHIVOS[tipo];
  const ok = !!file || !!existente;
  return (
    <div className={`drop ${ok ? "ok" : ""}`} onClick={() => ref.current?.click()}>
      <span className="list-icon" style={{ background: ok ? "var(--green)" : "var(--fill-3)", color: ok ? "#fff" : "var(--label-2)" }}>{ok ? <Check /> : <FileUp />}</span>
      <div className="grow">
        <div style={{ fontWeight: 600 }}>{meta.etiqueta}</div>
        <div className="caption">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : existente ?? `Carpeta: ${meta.subcarpeta}`}</div>
      </div>
      <span className="btn sm">{ok ? "Cambiar" : "Subir"}</span>
      <input ref={ref} type="file" hidden accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}
