import { useEffect, useMemo, useState } from "react";
import { HashRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { House, ChevronRight, HandCoins, Moon, ReceiptText, Sun, SunMoon, UserRound, LayoutGrid } from "lucide-react";
import { MODULOS, moduloPorRuta, permitido } from "./modules";
import { ejecutarProrrogasAutomaticas, nombreVisible, setSesion, useDB, useSesion } from "./data/store";
import { alertasEmpleados } from "./domain/empleados";
import { ToastProvider, useToast } from "./components/ui";
import Inicio from "./pages/inicio/Inicio";
import Clientes from "./pages/clientes/Clientes";
import Facturacion from "./pages/facturacion/Facturacion";
import Cartera from "./pages/cartera/Cartera";
import Ingresos from "./pages/ingresos/Ingresos";
import Gastos from "./pages/gastos/Gastos";
import Empleados from "./pages/empleados/Empleados";
import Perfil from "./pages/empleados/Perfil";
import Nomina from "./pages/nomina/Nomina";
import Configuracion from "./pages/Configuracion";
import ComingSoon from "./pages/ComingSoon";
import type { Rol } from "./domain/types";

type Tema = "auto" | "light" | "dark";

function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => {
    try {
      return (localStorage.getItem("brutal-os-tema") as Tema) || "auto";
    } catch {
      return "auto";
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (tema === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", tema);
    try {
      localStorage.setItem("brutal-os-tema", tema);
    } catch {
      /* noop */
    }
  }, [tema]);
  const ciclo = () => setTema((t) => (t === "auto" ? "light" : t === "light" ? "dark" : "auto"));
  return [tema, ciclo];
}

export default function App() {
  return (
    <HashRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </HashRouter>
  );
}

function Shell() {
  const loc = useLocation();
  const modulo = moduloPorRuta(loc.pathname);
  const sesion = useSesion();
  const db = useDB();
  const toast = useToast();
  const [tema, cicloTema] = useTema();

  useEffect(() => {
    const n = ejecutarProrrogasAutomaticas();
    if (n) toast(<><b>{n}</b> contrato(s) FIJO prorrogados automáticamente por falta de preaviso</>, "warn", 6000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--tint", modulo.color);
    window.scrollTo({ top: 0 });
  }, [modulo.color, loc.pathname]);

  const alertas = useMemo(() => alertasEmpleados(db.empleados.filter((e) => !e.esSocio)).filter((a) => a.nivel === "rojo").length, [db.empleados]);
  const hoyISO = new Date().toISOString().slice(0, 10);
  const pendientesNomina = db.periodos.filter((p) => p.estado === "EN APROBACIÓN").length + db.propuestas.filter((p) => p.estado === "PENDIENTE").length;

  const esEmpleado = sesion.rol === "EMPLEADO";
  const grupos = ["Inicio", "Personas", "Finanzas", "Empresa", "Sistema"] as const;

  return (
    <>
      <div className="ambient" aria-hidden><i /><i /><i /></div>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-inner glass">
            <Link to="/" className="brand" style={{ color: "inherit" }}>
              <div className="brand-logo">B</div>
              <div>
                <div className="brand-name">Brutal OS</div>
                <div className="brand-sub">Grupo Brutal · Administración</div>
              </div>
            </Link>
            {esEmpleado ? (
              <div className="nav-group">
                <div className="nav-title">Mi cuenta</div>
                <NavLink to={`/empleados/${sesion.empleadoId}`} className="nav-item active">
                  <span className="nav-icon" style={{ background: MODULOS[1].gradiente }}><UserRound /></span>
                  Mi perfil
                </NavLink>
              </div>
            ) : (
              grupos.map((g) => (
                <div className="nav-group" key={g}>
                  {g !== "Inicio" && <div className="nav-title">{g}</div>}
                  {MODULOS.filter((m) => m.grupo === g && permitido(sesion.rol, m.slug)).map((m) => {
                    const active = m.ruta === "/" ? loc.pathname === "/" : loc.pathname.startsWith(m.ruta);
                    const Icon = m.icono;
                    const count = m.slug === "empleados" ? alertas : m.slug === "nomina" ? pendientesNomina : m.slug === "facturacion" ? db.facturas.filter((f) => f.datoIncompleto && f.estado !== "ANULADA").length + db.notasCredito.filter((n) => n.estado === "SOLICITADA").length : m.slug === "cartera" ? db.facturas.filter((f) => (f.estado === "EMITIDA" || f.estado === "ABONADA") && f.vencimiento && f.vencimiento < hoyISO).length : 0;
                    return (
                      <NavLink key={m.slug} to={m.ruta} className={`nav-item ${active ? "active" : ""}`}>
                        <span className="nav-icon" style={{ background: m.gradiente }}><Icon /></span>
                        {m.nombre}
                        {!m.listo ? <span className="soon">Pronto</span> : count ? <span className="count">{count}</span> : null}
                      </NavLink>
                    );
                  })}
                </div>
              ))
            )}
            <div className="sidebar-foot">
              <RoleSwitcher />
            </div>
          </div>
        </aside>

        <main className="main">
          <div className="topbar">
            <Crumbs />
            <div className="toolbar">
              <button className="btn glass-btn icon" onClick={cicloTema} title={`Tema: ${tema}`} aria-label="Cambiar tema">
                {tema === "auto" ? <SunMoon /> : tema === "light" ? <Sun /> : <Moon />}
              </button>
            </div>
          </div>
          <Routes>
            {esEmpleado ? (
              <>
                <Route path="/empleados/:id" element={<SoloPropio />} />
                <Route path="*" element={<Navigate to={`/empleados/${sesion.empleadoId}`} replace />} />
              </>
            ) : (
              <>
                <Route path="/" element={<Inicio />} />
                {permitido(sesion.rol, "empleados") && <Route path="/empleados" element={<Empleados />} />}
                {permitido(sesion.rol, "empleados") && <Route path="/empleados/:id" element={<Perfil />} />}
                {permitido(sesion.rol, "nomina") && <Route path="/nomina/*" element={<Nomina />} />}
                {permitido(sesion.rol, "clientes") && <Route path="/clientes" element={<Clientes />} />}
                {permitido(sesion.rol, "clientes") && <Route path="/clientes/:id" element={<Clientes />} />}
                {permitido(sesion.rol, "facturacion") && <Route path="/facturacion" element={<Facturacion />} />}
                {permitido(sesion.rol, "cartera") && <Route path="/cartera" element={<Cartera />} />}
                {permitido(sesion.rol, "ingresos") && <Route path="/ingresos" element={<Ingresos />} />}
                {permitido(sesion.rol, "gastos") && <Route path="/gastos" element={<Gastos />} />}
                {permitido(sesion.rol, "configuracion") && <Route path="/configuracion" element={<Configuracion />} />}
                <Route path="/modulo/:slug" element={<ComingSoon />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
          <div className="caption" style={{ textAlign: "center", marginTop: 48 }}>
            Brutal OS · Datos de la BBDD de LA BRUTAL · Documento y cuenta con solo los últimos 4 dígitos · Ley 1581 de 2012
          </div>
        </main>
      </div>

      <nav className="tabbar glass">
        {esEmpleado ? (
          <NavLink to={`/empleados/${sesion.empleadoId}`}><UserRound />Mi perfil</NavLink>
        ) : (
          <>
            <NavLink to="/" end><House />Inicio</NavLink>
            {permitido(sesion.rol, "facturacion") && <NavLink to="/facturacion"><ReceiptText />Facturas</NavLink>}
            {permitido(sesion.rol, "cartera") && <NavLink to="/cartera"><HandCoins />Cartera</NavLink>}
            <NavLink to="/modulo/pagos" className={({ isActive }) => (isActive || loc.pathname.startsWith("/modulo") || loc.pathname.startsWith("/configuracion") ? "active" : "")}><LayoutGrid />Más</NavLink>
          </>
        )}
      </nav>
    </>
  );
}

function SoloPropio() {
  const { id } = useParams();
  const s = useSesion();
  if (id !== s.empleadoId) return <Navigate to={`/empleados/${s.empleadoId}`} replace />;
  return <Perfil />;
}

function Crumbs() {
  const loc = useLocation();
  const m = moduloPorRuta(loc.pathname);
  const partes = loc.pathname.split("/").filter(Boolean);
  if (!partes.length) return <div className="crumbs">Grupo Brutal</div>;
  return (
    <div className="crumbs">
      <Link to="/">Inicio</Link>
      <ChevronRight size={14} />
      <Link to={m.ruta}>{m.nombre}</Link>
      {partes.length > 1 && m.slug !== "nomina" && partes[0] !== "modulo" && (
        <>
          <ChevronRight size={14} />
          <span>{partes[partes.length - 1]}</span>
        </>
      )}
    </div>
  );
}

function RoleSwitcher() {
  const s = useSesion();
  const db = useDB();
  const activos = db.empleados.filter((e) => e.estatus === "ACTIVO" && !e.esSocio);
  const socios = db.empleados.filter((e) => e.esSocio);
  const coord = db.empleados.find((e) => e.estatus === "ACTIVO" && e.cargo === "COORDINADOR ADMINISTRATIVO");
  const persona = (id: string) => db.empleados.find((e) => e.id === id);
  const cambiar = (rol: Rol) => {
    const perfil = rol === "ADMINISTRADOR" ? socios[0] : rol === "COORDINACION" ? coord : rol === "EMPLEADO" ? persona(s.empleadoId) : undefined;
    const fijo: Record<string, string> = { CONTADORA: "Contadora", CONSULTA: "Consulta" };
    setSesion({ rol, perfilId: perfil?.id ?? "", usuario: perfil ? nombreVisible(perfil.nombreCompleto) : fijo[rol] ?? rol });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="nav-title" style={{ padding: "0 4px" }}>Ver como (demo)</div>
      <div className="role-pill glass" style={{ borderRadius: 14 }}>
        <UserRound size={16} />
        <select value={s.rol} onChange={(e) => cambiar(e.target.value as Rol)} style={{ flex: 1 }}>
          <option value="ADMINISTRADOR">Administrador (socios)</option>
          <option value="COORDINACION">Coordinación</option>
          <option value="CONTADORA">Contadora</option>
          <option value="CONSULTA">Consulta (financieros)</option>
          <option value="EMPLEADO">Empleado</option>
        </select>
      </div>
      {s.rol === "ADMINISTRADOR" && socios.length > 0 && (
        <div className="role-pill glass" style={{ borderRadius: 14 }}>
          <select value={s.perfilId} onChange={(e) => setSesion({ perfilId: e.target.value, usuario: nombreVisible(persona(e.target.value)?.nombreCompleto ?? "Administrador") })} style={{ flex: 1 }}>
            {socios.map((e) => <option key={e.id} value={e.id}>{nombreVisible(e.nombreCompleto)}</option>)}
          </select>
        </div>
      )}
      {s.rol === "EMPLEADO" && (
        <div className="role-pill glass" style={{ borderRadius: 14 }}>
          <select
            value={s.empleadoId}
            onChange={(e) => setSesion({ empleadoId: e.target.value, perfilId: e.target.value, usuario: nombreVisible(activos.find((x) => x.id === e.target.value)?.nombreCompleto ?? "Empleado") })}
            style={{ flex: 1 }}
          >
            {activos.map((e) => (
              <option key={e.id} value={e.id}>{e.id} · {e.nombreCompleto}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
