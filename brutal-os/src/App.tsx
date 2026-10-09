import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Banknote, ChevronRight, House, Moon, Sun, SunMoon, UserRound, Users, LayoutGrid } from "lucide-react";
import { MODULOS, moduloPorRuta } from "./modules";
import { ejecutarProrrogasAutomaticas, setSesion, useDB, useSesion } from "./data/store";
import { alertasEmpleados } from "./domain/empleados";
import { ToastProvider, useToast } from "./components/ui";
import Home from "./pages/Home";
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
    <BrowserRouter>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </BrowserRouter>
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
                  {MODULOS.filter((m) => m.grupo === g).map((m) => {
                    const active = m.ruta === "/" ? loc.pathname === "/" : loc.pathname.startsWith(m.ruta);
                    const Icon = m.icono;
                    const count = m.slug === "empleados" ? alertas : m.slug === "nomina" ? pendientesNomina : 0;
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
              <div className="hide-sm" style={{ display: "none" }} />
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
                <Route path="/" element={<Home />} />
                <Route path="/empleados" element={<Empleados />} />
                <Route path="/empleados/:id" element={<Perfil />} />
                <Route path="/nomina/*" element={<Nomina />} />
                <Route path="/configuracion" element={<Configuracion />} />
                <Route path="/modulo/:slug" element={<ComingSoon />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </>
            )}
          </Routes>
          <div className="caption" style={{ textAlign: "center", marginTop: 48 }}>
            Brutal OS · Modo demostración con datos ficticios · Tratamiento de datos conforme a la Ley 1581 de 2012
          </div>
        </main>
      </div>

      <nav className="tabbar glass">
        {esEmpleado ? (
          <NavLink to={`/empleados/${sesion.empleadoId}`}><UserRound />Mi perfil</NavLink>
        ) : (
          <>
            <NavLink to="/" end><House />Inicio</NavLink>
            <NavLink to="/empleados"><Users />Empleados</NavLink>
            <NavLink to="/nomina"><Banknote />Nómina</NavLink>
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
  const cambiar = (rol: Rol) =>
    setSesion({ rol, usuario: rol === "ADMINISTRADOR" ? "Administrador" : rol === "COORDINACION" ? "Coordinación" : activos.find((e) => e.id === s.empleadoId)?.nombreCompleto ?? "Empleado" });
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="nav-title" style={{ padding: "0 4px" }}>Ver como (demo)</div>
      <div className="role-pill glass" style={{ borderRadius: 14 }}>
        <UserRound size={16} />
        <select value={s.rol} onChange={(e) => cambiar(e.target.value as Rol)} style={{ flex: 1 }}>
          <option value="ADMINISTRADOR">Administrador (socios)</option>
          <option value="COORDINACION">Coordinación</option>
          <option value="EMPLEADO">Empleado</option>
        </select>
      </div>
      {s.rol === "EMPLEADO" && (
        <div className="role-pill glass" style={{ borderRadius: 14 }}>
          <select
            value={s.empleadoId}
            onChange={(e) => setSesion({ empleadoId: e.target.value, usuario: activos.find((x) => x.id === e.target.value)?.nombreCompleto ?? "Empleado" })}
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
