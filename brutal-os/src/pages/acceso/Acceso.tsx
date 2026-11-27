import { useEffect, useState, type ReactNode } from "react";
import { CloudUpload, Database, LockKeyhole, LogIn } from "lucide-react";
import App from "../../App";
import { entrar, escribirDB, leerDB, type SesionNube } from "../../data/nube";
import { crearBaseInicial, hidratarNube } from "../../data/store";
import type { BBDDPrivada, FacturacionPrivada } from "../../data/seed";

type Paso = { tipo: "login" } | { tipo: "cargando"; s: SesionNube } | { tipo: "vacia"; s: SesionNube } | { tipo: "listo" } | { tipo: "error"; mensaje: string };

function Fondo({ children }: { children: ReactNode }) {
  return (
    <div className="acceso">
      <div className="saludo-bg" />
      <div className="acceso-card">
        <div className="acceso-logo">B</div>
        {children}
      </div>
      <div className="acceso-pie">LA BRUTAL · Datos protegidos conforme a la Ley 1581 de 2012</div>
    </div>
  );
}

export default function Acceso({ inicial }: { inicial: SesionNube | null }) {
  const [paso, setPaso] = useState<Paso>(inicial ? { tipo: "cargando", s: inicial } : { tipo: "login" });

  useEffect(() => {
    if (paso.tipo !== "cargando") return;
    leerDB()
      .then((r) => {
        if (r.db) {
          hidratarNube(r.db, r.etag, paso.s);
          setPaso({ tipo: "listo" });
        } else setPaso({ tipo: "vacia", s: paso.s });
      })
      .catch((e: Error & { status?: number }) => setPaso(e.status === 401 ? { tipo: "login" } : { tipo: "error", mensaje: e.message }));
  }, [paso]);

  if (paso.tipo === "listo") return <App />;
  if (paso.tipo === "login") return <Login onOk={(s) => setPaso({ tipo: "cargando", s })} />;
  if (paso.tipo === "vacia") return <Inicializar s={paso.s} onOk={() => setPaso({ tipo: "listo" })} />;
  if (paso.tipo === "error")
    return (
      <Fondo>
        <h1 className="acceso-titulo">No pudimos conectar</h1>
        <p className="acceso-sub">{paso.mensaje}</p>
        <button className="btn primary lg" onClick={() => location.reload()}>Reintentar</button>
      </Fondo>
    );
  return (
    <Fondo>
      <h1 className="acceso-titulo">Brutal OS</h1>
      <p className="acceso-sub">Cargando la información de la empresa…</p>
      <div className="acceso-spinner" />
    </Fondo>
  );
}

function Login({ onOk }: { onOk: (s: SesionNube) => void }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      onOk(await entrar(usuario, clave));
    } catch (x) {
      setError((x as Error).message);
      setEnviando(false);
    }
  };
  return (
    <Fondo>
      <h1 className="acceso-titulo">Brutal OS</h1>
      <p className="acceso-sub">Grupo Brutal · Entra con tu usuario</p>
      <form className="acceso-form" onSubmit={enviar}>
        <input className="input lg" placeholder="Usuario" autoComplete="username" autoCapitalize="none" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
        <input className="input lg" placeholder="Clave" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        {error && <div className="acceso-error">{error}</div>}
        <button className="btn primary lg" disabled={enviando || !usuario || !clave}>{enviando ? "Entrando…" : <><LogIn size={18} />Entrar</>}</button>
      </form>
      <div className="acceso-nota"><LockKeyhole size={13} />Conexión cifrada · la sesión dura 7 días en este equipo</div>
    </Fondo>
  );
}

function Inicializar({ s, onOk }: { s: SesionNube; onOk: () => void }) {
  const [bbdd, setBbdd] = useState<BBDDPrivada>();
  const [fact, setFact] = useState<FacturacionPrivada>();
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const leer = async <T,>(f: File | undefined, set: (v: T) => void) => {
    if (!f) return;
    try { set(JSON.parse(await f.text()) as T); setError(""); } catch { setError(`${f.name} no es un archivo válido`); }
  };
  if (s.rol !== "ADMINISTRADOR")
    return (
      <Fondo>
        <h1 className="acceso-titulo">Base de datos vacía</h1>
        <p className="acceso-sub">Un administrador debe cargar la información inicial antes de usar la plataforma.</p>
      </Fondo>
    );
  const crear = async () => {
    setEnviando(true);
    const d = crearBaseInicial(bbdd, fact);
    const r = await escribirDB(d, null).catch((e: Error) => ({ tipo: "error" as const, status: 0, mensaje: e.message }));
    if (r.tipo === "ok") { hidratarNube(d, r.etag, s); onOk(); }
    else { setError(r.tipo === "error" ? r.mensaje : "La base ya fue creada por otra persona. Recarga la página."); setEnviando(false); }
  };
  return (
    <Fondo>
      <h1 className="acceso-titulo">Primera carga</h1>
      <p className="acceso-sub">La base de datos en la nube está vacía. Carga la BBDD de empleados y la de facturación para empezar.</p>
      <div className="acceso-form">
        <label className="acceso-archivo"><Database size={18} /><span>{bbdd ? `BBDD empleados · ${bbdd.empleados.length} personas` : "bbdd.json (empleados y salarios)"}</span><input type="file" accept="application/json,.json" onChange={(e) => leer<BBDDPrivada>(e.target.files?.[0], setBbdd)} /></label>
        <label className="acceso-archivo"><CloudUpload size={18} /><span>{fact ? `Facturación · ${fact.clientes.length} clientes · ${fact.facturas.length} facturas` : "facturacion.json (clientes y facturas)"}</span><input type="file" accept="application/json,.json" onChange={(e) => leer<FacturacionPrivada>(e.target.files?.[0], setFact)} /></label>
        {error && <div className="acceso-error">{error}</div>}
        <button className="btn primary lg" disabled={enviando || !bbdd} onClick={crear}>{enviando ? "Creando la base…" : "Crear la base de datos"}</button>
      </div>
    </Fondo>
  );
}
