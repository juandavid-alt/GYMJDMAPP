import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import {
  actualizarEmpleado, cambiarExamen, renovarContrato, retirarEmpleado, useDB, useSesion,
} from "../../data/store";
import { leerArchivo } from "../../data/files";
import { duracionesPermitidas, renovar, soloDigitos, validarCelular, validarCorreo } from "../../domain/empleados";
import { hoy } from "../../domain/fechas";
import type { Archivo, CausalRetiro, Empleado, EstatusExamen } from "../../domain/types";
import { fecha } from "../../lib/format";
import { Field, Modal, MoneyInput, Seg, useToast } from "../../components/ui";
import { DropFile } from "./NuevoEmpleado";

// ---------------- Retirar ----------------

export function RetirarSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const db = useDB();
  const toast = useToast();
  const e = db.empleados.find((x) => x.id === id);
  const [f, setF] = useState({ fechaNotificacion: hoy(), causal: "" as CausalRetiro | "", fechaSalida: hoy(), valorLiquidacion: 0, estadoLiquidacion: "PENDIENTE" as "PENDIENTE" | "PAGADA" });
  const [carta, setCarta] = useState<File>();
  const [soporte, setSoporte] = useState<File>();
  const [intento, setIntento] = useState(false);
  useEffect(() => {
    if (id) {
      setF({ fechaNotificacion: hoy(), causal: "", fechaSalida: e?.terminacionContrato && e.terminacionContrato >= hoy() ? e.terminacionContrato : hoy(), valorLiquidacion: 0, estadoLiquidacion: "PENDIENTE" });
      setCarta(undefined);
      setSoporte(undefined);
      setIntento(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!e) return null;
  const ok = f.causal && f.fechaSalida && f.fechaNotificacion;
  const confirmar = async () => {
    setIntento(true);
    if (!ok) return;
    await retirarEmpleado(e.id, { ...f, causal: f.causal as CausalRetiro }, carta, soporte);
    toast(<><b>{e.id}</b> pasó a Retirados · examen de egreso creado</>);
    onClose();
  };
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title="Retirar empleado"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn danger primary" onClick={confirmar}>Confirmar retiro</button></>}
    >
      <p className="footnote" style={{ marginTop: 0 }}>
        <b style={{ color: "var(--label)" }}>{e.nombreCompleto}</b> · {e.id} · {e.cargo}. El registro no se borra: pasa a la sección Retirados y se crea automáticamente el examen de egreso.
      </p>
      <div className="form-grid">
        <Field label="Fecha de notificación del retiro" required hint={fecha(f.fechaNotificacion)}>
          <input type="date" className="input" value={f.fechaNotificacion} onChange={(ev) => setF({ ...f, fechaNotificacion: ev.target.value })} />
        </Field>
        <Field label="Fecha de salida" required hint={fecha(f.fechaSalida)}>
          <input type="date" className="input" value={f.fechaSalida} onChange={(ev) => setF({ ...f, fechaSalida: ev.target.value })} />
        </Field>
        <Field label="Causal o motivo" required full>
          <select className={`select ${intento && !f.causal ? "required-empty" : ""}`} value={f.causal} onChange={(ev) => setF({ ...f, causal: ev.target.value as CausalRetiro })}>
            <option value="">Selecciona…</option>
            {db.listas.causalesRetiro.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Valor de la liquidación">
          <MoneyInput value={f.valorLiquidacion} onChange={(n) => setF({ ...f, valorLiquidacion: n })} />
        </Field>
        <Field label="Estado de la liquidación">
          <Seg value={f.estadoLiquidacion} onChange={(v) => setF({ ...f, estadoLiquidacion: v })} options={[{ value: "PENDIENTE", label: "Pendiente" }, { value: "PAGADA", label: "Pagada" }]} />
        </Field>
        <div className="full stack" style={{ gap: 8 }}>
          <DropFile tipo="CARTA_RETIRO" file={carta} onFile={setCarta} />
          <DropFile tipo="SOPORTE_LIQUIDACION" file={soporte} onFile={setSoporte} />
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Renovar ----------------

export function RenovarSheet({ e, open, onClose }: { e: Empleado; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const permitidas = duracionesPermitidas(e.renovaciones);
  const [meses, setMeses] = useState<6 | 12>(permitidas[0]);
  useEffect(() => setMeses(permitidas[0]), [open, e.renovaciones]); // eslint-disable-line react-hooks/exhaustive-deps
  if (e.tipoContrato !== "FIJO" || !e.terminacionContrato) return null;
  const r = renovar(e, meses);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Renovar contrato"
      size="narrow"
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={() => { renovarContrato(e.id, meses); toast(<>Renovación <b>#{r.numero}</b> registrada hasta {fecha(r.hasta)}</>); onClose(); }}>Renovar</button></>}
    >
      <div className="stack">
        <div className="list">
          <div className="list-row flat"><span className="muted">Terminación actual</span><b className="right">{fecha(e.terminacionContrato)}</b></div>
          <div className="list-row flat"><span className="muted">Renovaciones hechas</span><b className="right">{e.renovaciones}</b></div>
        </div>
        <Field label="Nueva duración" hint={permitidas.length === 1 ? "Desde la cuarta renovación la duración mínima es de 12 meses" : "Hasta 3 renovaciones de 6 meses"}>
          <Seg value={String(meses) as "6" | "12"} onChange={(v) => setMeses(Number(v) as 6 | 12)} options={[6, 12].map((m) => ({ value: String(m) as "6" | "12", label: `${m} meses` })).filter((o) => permitidas.includes(Number(o.value) as 6 | 12))} />
        </Field>
        <div className="card" style={{ background: "var(--fill-2)", boxShadow: "none", textAlign: "center" }}>
          <div className="caption">Nuevo periodo · renovación #{r.numero}</div>
          <div className="headline" style={{ fontSize: 20 }}>{fecha(r.desde)} → {fecha(r.hasta)}</div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Examen médico ----------------

const FLUJO: EstatusExamen[] = ["PENDIENTE CITAR", "AGENDADO", "REALIZADO", "APROBADO", "APTO CON RESTRICCIONES", "NO APTO"];
const REQUIERE_CERT: EstatusExamen[] = ["APROBADO", "APTO CON RESTRICCIONES", "NO APTO"];

export function ExamenSheet({ e, cual, open, onClose }: { e: Empleado; cual: "examen" | "examenEgreso"; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const actual = e[cual]?.estatus ?? "PENDIENTE CITAR";
  const [estatus, setEstatus] = useState<EstatusExamen>(actual);
  const [cita, setCita] = useState("");
  const [restricciones, setRestricciones] = useState("");
  const [cert, setCert] = useState<File>();
  const [intento, setIntento] = useState(false);
  useEffect(() => {
    setEstatus(actual);
    setCita(e[cual]?.citaFechaHora ?? "");
    setRestricciones(e[cual]?.restricciones ?? "");
    setCert(undefined);
    setIntento(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const tipoCert = cual === "examen" ? "EXAMEN_INGRESO" : "EXAMEN_EGRESO";
  const yaTiene = e.archivos.find((a) => a.tipo === tipoCert);
  const faltaCita = estatus === "AGENDADO" && !cita;
  const faltaCert = REQUIERE_CERT.includes(estatus) && !cert && !yaTiene;
  const faltaRestr = estatus === "APTO CON RESTRICCIONES" && !restricciones.trim();
  const guardar = async () => {
    setIntento(true);
    if (faltaCita || faltaCert || faltaRestr) return;
    await cambiarExamen(e.id, cual, estatus, { citaFechaHora: cita, restricciones, certificado: cert });
    toast(estatus === "AGENDADO" ? "Cita agendada · recordatorio programado un día antes" : `Examen actualizado a ${estatus}`);
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={cual === "examen" ? "Examen de ingreso" : "Examen de egreso"} footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={guardar}>Guardar</button></>}>
      <div className="stack">
        <div className="row wrap" style={{ gap: 6 }}>
          {FLUJO.map((s) => (
            <button key={s} className={`chip-btn ${estatus === s ? "on" : ""}`} onClick={() => setEstatus(s)}>{s}</button>
          ))}
        </div>
        {estatus === "AGENDADO" && (
          <Field label="Fecha y hora de la cita" required hint="Se envía recordatorio por correo al empleado y a la auxiliar un día antes">
            <input type="datetime-local" className={`input ${intento && faltaCita ? "required-empty" : ""}`} value={cita} onChange={(ev) => setCita(ev.target.value)} />
          </Field>
        )}
        {estatus === "APTO CON RESTRICCIONES" && (
          <Field label="Restricciones" required hint="Se muestran en la ficha del empleado">
            <textarea className={`textarea ${intento && faltaRestr ? "required-empty" : ""}`} value={restricciones} onChange={(ev) => setRestricciones(ev.target.value)} />
          </Field>
        )}
        {REQUIERE_CERT.includes(estatus) && (
          <div>
            <DropFile tipo={tipoCert} file={cert} onFile={setCert} existente={yaTiene?.nombre} />
            {intento && faltaCert && <div className="err" style={{ color: "var(--red)", fontSize: 12, marginTop: 6 }}>Debes cargar el certificado del examen</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------- Editar datos ----------------

export function EditarSheet({ e, open, onClose, propio }: { e: Empleado; open: boolean; onClose: () => void; propio?: boolean }) {
  const db = useDB();
  const sesion = useSesion();
  const toast = useToast();
  const [f, setF] = useState(e);
  const [intento, setIntento] = useState(false);
  useEffect(() => { setF(e); setIntento(false); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Empleado>(k: K, v: Empleado[K]) => setF((s) => ({ ...s, [k]: v }));
  const interno = !propio && sesion.rol !== "EMPLEADO";
  const verCuenta = sesion.rol === "ADMINISTRADOR" || propio;
  const errores = {
    celular: !validarCelular(f.celular),
    correo: !validarCorreo(f.correo),
    emergenciaCelular: !validarCelular(f.emergenciaCelular),
    nombreCompleto: !f.nombreCompleto.trim(),
    direccion: !f.direccion.trim(),
  };
  const guardar = () => {
    setIntento(true);
    if (Object.values(errores).some(Boolean)) return;
    const { id: _id, archivos: _a, historial: _h, ...patch } = f as Empleado & { historial?: unknown };
    actualizarEmpleado(e.id, patch);
    toast("Cambios guardados y registrados en el Historial");
    onClose();
  };
  const c = (k: keyof typeof errores) => (intento && errores[k] ? "invalid" : "");
  return (
    <Modal open={open} onClose={onClose} title={propio ? "Actualizar mis datos" : "Editar empleado"} size="wide" footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={guardar}>Guardar</button></>}>
      <div className="list-header" style={{ padding: "0 0 8px" }}>Datos personales</div>
      <div className="form-grid">
        <Field label="Nombre completo" required full><input className={`input ${c("nombreCompleto")}`} value={f.nombreCompleto} disabled={!interno} onChange={(ev) => set("nombreCompleto", ev.target.value.toUpperCase())} /></Field>
        <Field label="Fecha de nacimiento"><input type="date" className="input" value={f.fechaNacimiento} onChange={(ev) => set("fechaNacimiento", ev.target.value)} /></Field>
        <Field label="Género"><select className="select" value={f.genero} onChange={(ev) => set("genero", ev.target.value as Empleado["genero"])}><option>FEMENINO</option><option>MASCULINO</option><option>OTRO</option></select></Field>
        <Field label="Celular" required error={intento && errores.celular && "10 dígitos"}><input className={`input ${c("celular")}`} maxLength={10} value={f.celular} onChange={(ev) => set("celular", soloDigitos(ev.target.value))} /></Field>
        <Field label="Correo" required error={intento && errores.correo && "Correo no válido"}><input className={`input ${c("correo")}`} value={f.correo} onChange={(ev) => set("correo", ev.target.value.trim())} /></Field>
        <Field label="Dirección" required full><input className={`input ${c("direccion")}`} value={f.direccion} onChange={(ev) => set("direccion", ev.target.value)} /></Field>
      </div>
      <div className="list-header" style={{ padding: "18px 0 8px" }}>Seguridad social y banco</div>
      <div className="form-grid">
        <Field label="EPS"><select className="select" value={f.eps} onChange={(ev) => set("eps", ev.target.value)}>{db.listas.eps.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Fondo de pensiones"><select className="select" value={f.afp} onChange={(ev) => set("afp", ev.target.value)}>{db.listas.afp.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="ARL"><select className="select" value={f.arl} onChange={(ev) => set("arl", ev.target.value)}>{db.listas.arl.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Banco"><select className="select" value={f.banco} onChange={(ev) => set("banco", ev.target.value)}>{db.listas.bancos.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Tipo de cuenta"><select className="select" value={f.tipoCuenta} onChange={(ev) => set("tipoCuenta", ev.target.value as Empleado["tipoCuenta"])}>{db.listas.tiposCuenta.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Número de cuenta" hint={verCuenta ? undefined : "Solo el ADMINISTRADOR ve y edita la cuenta"}>
          <input className="input mono" disabled={!verCuenta} value={verCuenta ? f.numeroCuenta : `•••• ${f.numeroCuenta.slice(-4)}`} onChange={(ev) => set("numeroCuenta", soloDigitos(ev.target.value))} />
        </Field>
      </div>
      <div className="list-header" style={{ padding: "18px 0 8px" }}>Contacto de emergencia</div>
      <div className="form-grid">
        <Field label="Nombre"><input className="input" value={f.emergenciaNombre} onChange={(ev) => set("emergenciaNombre", ev.target.value.toUpperCase())} /></Field>
        <Field label="Parentesco"><select className="select" value={f.emergenciaParentesco} onChange={(ev) => set("emergenciaParentesco", ev.target.value)}>{db.listas.parentescos.map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Celular" error={intento && errores.emergenciaCelular && "10 dígitos"}><input className={`input ${c("emergenciaCelular")}`} maxLength={10} value={f.emergenciaCelular} onChange={(ev) => set("emergenciaCelular", soloDigitos(ev.target.value))} /></Field>
      </div>
      {interno && (
        <>
          <div className="list-header" style={{ padding: "18px 0 8px" }}>Datos internos</div>
          <div className="form-grid">
            <Field label="Área"><select className="select" value={f.area} onChange={(ev) => { set("area", ev.target.value); set("cargo", db.listas.cargos.find((x) => x.area === ev.target.value)?.cargo ?? ""); }}>{db.listas.areas.map((x) => <option key={x}>{x}</option>)}</select></Field>
            <Field label="Cargo"><select className="select" value={f.cargo} onChange={(ev) => set("cargo", ev.target.value)}>{db.listas.cargos.filter((x) => x.area === f.area).map((x) => <option key={x.cargo}>{x.cargo}</option>)}</select></Field>
            <Field label="Tipo de contrato">
              <select className="select" value={f.tipoContrato} onChange={(ev) => { const v = ev.target.value as Empleado["tipoContrato"]; set("tipoContrato", v); set("duracionMeses", v === "FIJO" ? f.duracionMeses ?? 6 : null); }}>
                {db.listas.tiposContrato.filter((t) => t.activo || t.valor === e.tipoContrato).map((t) => <option key={t.valor} value={t.valor}>{t.etiqueta}{t.activo ? "" : " (obsoleto)"}</option>)}
              </select>
            </Field>
            <Field label="Inicio del contrato"><input type="date" className="input" value={f.inicioContrato} onChange={(ev) => set("inicioContrato", ev.target.value)} /></Field>
            <Field label="Clase de riesgo ARL"><select className="select" value={f.claseRiesgoArl} onChange={(ev) => set("claseRiesgoArl", Number(ev.target.value) as Empleado["claseRiesgoArl"])}>{[1, 2, 3, 4, 5].map((x) => <option key={x} value={x}>Riesgo {x}</option>)}</select></Field>
          </div>
        </>
      )}
    </Modal>
  );
}

// ---------------- Visor de archivos ----------------

export function VisorArchivo({ archivo, onClose }: { archivo: Archivo | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => {
    let u: string | null = null;
    setUrl(null);
    if (archivo) {
      setCargando(true);
      leerArchivo(archivo.id).then((b) => {
        if (b) {
          u = URL.createObjectURL(b);
          setUrl(u);
        }
        setCargando(false);
      });
    }
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [archivo]);
  if (!archivo) return null;
  return (
    <Modal open onClose={onClose} title={archivo.nombre} size="wide" footer={url ? <a className="btn primary" href={url} download={archivo.nombre}>Descargar</a> : undefined}>
      <div className="caption" style={{ marginBottom: 10 }}>{archivo.subcarpeta} · subido el {fecha(archivo.subidoEn.slice(0, 10))} por {archivo.subidoPor}{archivo.vence ? ` · vence ${fecha(archivo.vence)}` : ""}</div>
      {cargando ? (
        <div className="empty">Cargando…</div>
      ) : url ? (
        archivo.mime.startsWith("image/") ? (
          <img src={url} alt={archivo.nombre} style={{ maxWidth: "100%", borderRadius: 16, display: "block", margin: "0 auto" }} />
        ) : (
          <iframe src={url} title={archivo.nombre} style={{ width: "100%", height: "70vh", border: "none", borderRadius: 16, background: "#fff" }} />
        )
      ) : (
        <div className="empty">
          <div className="empty-icon"><FileText /></div>
          <h3>Documento de demostración</h3>
          <p>Este registro viene de los datos ficticios de la demo: existe la metadata pero no el archivo. Los archivos que subas sí se previsualizan aquí sin descargarlos.</p>
        </div>
      )}
    </Modal>
  );
}
