import { createPortal } from "react-dom";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Check, ChevronRight, Info, Minus, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { colorAvatar, iniciales, pesos } from "../lib/format";
import { leerArchivo } from "../data/files";
import type { Empleado } from "../domain/types";

// ---------------- Toasts ----------------

type ToastKind = "ok" | "info" | "warn" | "error";
interface ToastItem { id: number; kind: ToastKind; text: ReactNode; }
const ToastCtx = createContext<(text: ReactNode, kind?: ToastKind, ms?: number) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: ReactNode, kind: ToastKind = "ok", ms = 3200) => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, kind, text }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), ms);
  }, []);
  const color: Record<ToastKind, string> = { ok: "var(--green)", info: "var(--blue)", warn: "var(--orange)", error: "var(--red)" };
  const icon: Record<ToastKind, ReactNode> = { ok: <Check />, info: <Info />, warn: <TriangleAlert />, error: <X /> };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast">
            <span className="ti" style={{ background: color[t.kind] }}>{icon[t.kind]}</span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------- Básicos ----------------

export function Badge({ color = "gray", children, dot }: { color?: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`badge ${color}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function EstatusBadge({ estatus }: { estatus: string }) {
  const map: Record<string, string> = {
    ACTIVO: "green", RETIRADO: "red", PENDIENTE: "yellow", PAGADA: "green", PAGADO: "green", RECHAZADO: "red",
    BORRADOR: "gray", CARGADO: "blue", "EN APROBACIÓN": "yellow", APROBADO: "green", "ENVIADO A PAGOS": "purple",
    APROBADA: "green", RECHAZADA: "red", DEVUELTA: "orange",
    "PENDIENTE CITAR": "yellow", AGENDADO: "blue", REALIZADO: "purple", "APTO CON RESTRICCIONES": "orange", "NO APTO": "red",
  };
  return <Badge color={map[estatus] ?? "gray"} dot>{estatus}</Badge>;
}

export function Card({ title, sub, action, children, className = "", style }: { title?: ReactNode; sub?: ReactNode; action?: ReactNode; children?: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <section className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="card-head">
          <div className="grow">
            {title && <div className="card-title">{title}</div>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({
  label, value, icon, color, foot, delta, deltaLabel, invert, onClick,
}: {
  label: string; value: ReactNode; icon?: ReactNode; color?: string; foot?: ReactNode;
  delta?: number | null; deltaLabel?: string; invert?: boolean; onClick?: () => void;
}) {
  const dir = delta === undefined || delta === null || Math.abs(delta) < 0.0005 ? "neutral" : delta > 0 ? "up" : "down";
  return (
    <div className="kpi" onClick={onClick} style={{ cursor: onClick ? "pointer" : undefined }}>
      <div className="kpi-top">
        {icon && <span className="kpi-icon" style={{ background: color }}>{icon}</span>}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {delta !== undefined && delta !== null && (
          <span className={`trend ${dir} ${invert ? "bad" : ""}`}>
            {dir === "up" ? <ArrowUpRight size={14} /> : dir === "down" ? <ArrowDownRight size={14} /> : <Minus size={14} />}
            {Math.abs(delta * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %
          </span>
        )}
        {deltaLabel && <span>{deltaLabel}</span>}
        {foot}
      </div>
    </div>
  );
}

export function Seg<T extends string>({ value, onChange, options, glassy }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; glassy?: boolean }) {
  return (
    <div className={`seg ${glassy ? "glassy" : ""}`} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} className={o.value === value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="pill-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" className={`switch ${on ? "on" : ""}`} aria-pressed={on} disabled={disabled} onClick={() => onChange(!on)} />;
}

export function Avatar({ e, size = "" }: { e: Pick<Empleado, "id" | "nombreCompleto" | "archivos">; size?: "" | "md" | "lg" | "xl" }) {
  const [url, setUrl] = useState<string | null>(null);
  const foto = e.archivos.find((a) => a.tipo === "FOTO");
  useEffect(() => {
    let u: string | null = null;
    let vivo = true;
    if (foto) {
      leerArchivo(foto.id).then((b) => {
        if (b && vivo && b.type.startsWith("image/")) {
          u = URL.createObjectURL(b);
          setUrl(u);
        }
      });
    }
    return () => {
      vivo = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [foto?.id]);
  return (
    <div
      className={`avatar ${size}`}
      style={{
        background: url ? `center/cover url(${url})` : `linear-gradient(160deg, ${colorAvatar(e.id)}, color-mix(in srgb, ${colorAvatar(e.id)} 70%, #000))`,
      }}
    >
      {!url && iniciales(e.nombreCompleto)}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p style={{ margin: "0 0 16px" }}>{text}</p>}
      {action}
    </div>
  );
}

export function Progress({ value, color }: { value: number; color?: string }) {
  return (
    <div className="progress">
      <span style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function ListRow({ icon, color, label, value, onClick, sub }: { icon?: ReactNode; color?: string; label: ReactNode; value?: ReactNode; onClick?: () => void; sub?: ReactNode }) {
  return (
    <div className={`list-row ${onClick ? "click" : ""} ${icon ? "" : "flat"}`} onClick={onClick}>
      {icon && <span className="list-icon" style={{ background: color }}>{icon}</span>}
      <div className="grow">
        <div className="list-label">{label}</div>
        {sub && <div className="caption">{sub}</div>}
      </div>
      {value !== undefined && <div className="list-value">{value}</div>}
      {onClick && <ChevronRight className="chev" />}
    </div>
  );
}

// ---------------- Modal ----------------

export function Modal({
  open, onClose, title, children, footer, size = "", leading,
}: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: "" | "wide" | "narrow"; leading?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet ${size}`} role="dialog" aria-modal="true">
        <div className="grabber" />
        <div className="sheet-head">
          <div style={{ width: 72 }}>{leading}</div>
          <div className="sheet-title">{title}</div>
          <div style={{ width: 72, display: "flex", justifyContent: "flex-end" }}>
            <button className="btn icon sm" onClick={onClose} aria-label="Cerrar" style={{ color: "var(--label-2)" }}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({
  open, onClose, onConfirm, title, text, confirmLabel = "Confirmar", danger,
}: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; text: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="narrow"
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className={`btn primary ${danger ? "danger" : ""}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </>
      }
    >
      <div style={{ textAlign: "center", padding: "6px 4px 4px" }}>{text}</div>
    </Modal>
  );
}

/** Verificación con código de un solo uso (6 dígitos). */
export function OtpSheet({
  open, onClose, onRequest, onVerify, title, description,
}: { open: boolean; onClose: () => void; onRequest: () => string; onVerify: (code: string) => boolean; title: string; description: ReactNode }) {
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [enviado, setEnviado] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (open) {
      setDigits(["", "", "", "", "", ""]);
      setEnviado(onRequest());
      setTimeout(() => refs.current[0]?.focus(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "");
    if (clean.length > 1) {
      const arr = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""].map((_, k) => arr[k] ?? "");
      setDigits(next);
      refs.current[Math.min(5, arr.length)]?.focus();
      if (arr.length === 6) verificar(next.join(""));
      return;
    }
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d)) verificar(next.join(""));
  };
  const verificar = (code: string) => {
    if (!onVerify(code)) {
      setShake(true);
      setTimeout(() => setShake(false), 450);
      setDigits(["", "", "", "", "", ""]);
      refs.current[0]?.focus();
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="" size="narrow">
      <div style={{ textAlign: "center" }}>
        <div className="empty-icon" style={{ background: "color-mix(in srgb, var(--green) 16%, transparent)", color: "var(--green)" }}>
          <ShieldCheck />
        </div>
        <div className="headline" style={{ fontSize: 22 }}>{title}</div>
        <p className="muted" style={{ margin: "6px 0 0" }}>{description}</p>
        <div className={`otp ${shake ? "shake" : ""}`}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => (refs.current[i] = el)}
              value={d}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => e.key === "Backspace" && !d && i > 0 && refs.current[i - 1]?.focus()}
            />
          ))}
        </div>
        {enviado && (
          <div className="card" style={{ background: "var(--fill-2)", boxShadow: "none", padding: 12, textAlign: "left" }}>
            <div className="caption">Modo demostración · correo simulado al ADMINISTRADOR</div>
            <div className="row between" style={{ marginTop: 4 }}>
              <span>Tu código de verificación es</span>
              <b className="mono" style={{ fontSize: 18, letterSpacing: ".2em" }}>{enviado}</b>
            </div>
          </div>
        )}
        <button className="btn plain" style={{ marginTop: 10 }} onClick={() => setEnviado(onRequest())}>Reenviar código</button>
      </div>
    </Modal>
  );
}

// ---------------- Formularios ----------------

export function Field({ label, required, hint, error, children, full }: { label: string; required?: boolean; hint?: ReactNode; error?: string | false; children: ReactNode; full?: boolean }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <label>
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function MoneyInput({ value, onChange, className = "", disabled, placeholder }: { value: number; onChange: (n: number) => void; className?: string; disabled?: boolean; placeholder?: string }) {
  const [txt, setTxt] = useState(value ? value.toLocaleString("es-CO") : "");
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setTxt(value ? Math.round(value).toLocaleString("es-CO") : "");
  }, [value, focus]);
  return (
    <input
      className={`input num ${className}`}
      inputMode="numeric"
      disabled={disabled}
      placeholder={placeholder ?? "$ 0"}
      value={focus ? txt : txt ? `$ ${txt}` : ""}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onChange={(e) => {
        const n = Number(e.target.value.replace(/\D/g, "")) || 0;
        setTxt(n ? n.toLocaleString("es-CO") : "");
        onChange(n);
      }}
    />
  );
}

// ---------------- Gráficas ----------------

export const PALETA = ["#0A7AFF", "#AF52DE", "#30C759", "#FF9500", "#FF2D55", "#5856D6", "#30B0C7", "#FFCC00", "#A2845E", "#00C7BE", "#8E8E93"];

export function ChartTip({ active, payload, label, money, suffix = "" }: { active?: boolean; payload?: { name: string; value: number; color?: string; fill?: string; payload?: Record<string, unknown> }[]; label?: string; money?: boolean; suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tt">
      {label !== undefined && <div className="tt-title">{label}</div>}
      {payload.map((p, i) => (
        <div className="tt-row" key={i}>
          <span><i style={{ background: p.color ?? p.fill }} />{p.name}</span>
          <b className="num">{money ? pesos(p.value) : `${(Math.round(p.value * 10) / 10).toLocaleString("es-CO")}${suffix}`}</b>
        </div>
      ))}
    </div>
  );
}

export function BarList({ data, color, max, format }: { data: { name: string; value: number }[]; color?: string; max?: number; format?: (n: number) => string }) {
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="barlist">
      {data.map((d, i) => (
        <div className="barlist-row" key={d.name}>
          <span className="lbl" title={d.name}>{d.name}</span>
          <div className="bar"><span style={{ width: `${(d.value / m) * 100}%`, background: color ?? PALETA[i % PALETA.length] }} /></div>
          <b className="num" style={{ textAlign: "right" }}>{format ? format(d.value) : d.value}</b>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="chart-legend">
      {items.map((i) => (
        <span key={i.label}><i style={{ background: i.color }} />{i.label}</span>
      ))}
    </div>
  );
}
