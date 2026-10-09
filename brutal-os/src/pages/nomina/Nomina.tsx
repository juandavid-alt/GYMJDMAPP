import { useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { Info } from "lucide-react";
import { useDB, useSesion } from "../../data/store";
import { periodoActual } from "../../data/selectors";
import { Modal, Seg } from "../../components/ui";
import Resumen from "./Resumen";
import Mes from "./Mes";
import { Plantilla, Propuestas, Simulador } from "./Plantilla";
import { Ingresos, Pagos, Provisiones } from "./Provisiones";

const TABS = [
  { value: "", label: "Resumen" },
  { value: "mes", label: "Nómina mensual" },
  { value: "plantilla", label: "Plantilla por cargo" },
  { value: "simulador", label: "Simulador" },
  { value: "propuestas", label: "Propuestas" },
  { value: "provisiones", label: "Provisiones" },
  { value: "pagos", label: "Pagos generados" },
  { value: "ingresos", label: "Ingresos mensuales" },
];

export default function Nomina() {
  const loc = useLocation();
  const nav = useNavigate();
  const db = useDB();
  const sesion = useSesion();
  const [ayuda, setAyuda] = useState(false);
  const seg = loc.pathname.split("/")[2] ?? "";
  const per = periodoActual(db);
  const pend = db.propuestas.filter((p) => p.estado === "PENDIENTE").length;
  if (sesion.rol === "EMPLEADO") return <Navigate to="/" replace />;

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1 className="large-title">Nómina</h1>
          <p className="subtitle" style={{ margin: 0 }}>Conectada a Empleados por ID y a Pagos al aprobar · {sesion.rol === "ADMINISTRADOR" ? "puedes aprobar" : "coordinación: carga y propone, no aprueba"}</p>
        </div>
        <button className="btn glass-btn icon" onClick={() => setAyuda(true)} aria-label="Cómo funciona"><Info /></button>
      </div>
      <div style={{ marginBottom: 20 }}>
        <Seg
          glassy
          value={seg}
          onChange={(v) => nav(v === "mes" ? `/nomina/mes/${per?.id ?? ""}` : `/nomina${v ? `/${v}` : ""}`)}
          options={TABS.map((t) => ({ ...t, count: t.value === "propuestas" && pend ? pend : undefined }))}
        />
      </div>
      <Routes>
        <Route index element={<Resumen />} />
        <Route path="mes" element={per ? <Navigate to={`/nomina/mes/${per.id}`} replace /> : <Mes />} />
        <Route path="mes/:id" element={<Mes />} />
        <Route path="plantilla" element={<Plantilla />} />
        <Route path="simulador" element={<Simulador />} />
        <Route path="propuestas" element={<Propuestas />} />
        <Route path="provisiones" element={<Provisiones />} />
        <Route path="pagos" element={<Pagos />} />
        <Route path="ingresos" element={<Ingresos />} />
        <Route path="*" element={<Navigate to="/nomina" replace />} />
      </Routes>
      <AyudaNomina open={ayuda} onClose={() => setAyuda(false)} />
    </div>
  );
}

function AyudaNomina({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reglas = [
    ["Fórmulas validadas", "Ingreso bruto = base prestacional + aux. no prestacional + aux. transporte. Deducciones: salud 4 %, pensión 4 %, FSP 1 % desde 4 SMMLV y retención. Neto = bruto − deducciones."],
    ["Provisiones", "Cesantías y prima 8,33 % sobre base + aux. transporte; intereses 12 % de las cesantías; vacaciones 4,17 % sobre la base. Se consignan cada mes a la cuenta de ahorros de provisiones."],
    ["Planilla", "Empresa: pensión 12 %, caja 4 %, ARL riesgo 1 0,522 %; salud, ICBF y SENA solo desde 10 SMMLV. Total planilla = aportes empresa + salud y pensión del empleado (+ FSP)."],
    ["Costo total", "Ingreso bruto + aporte empleador + provisiones (+ deducciones asumidas si la persona las tiene en SÍ)."],
    ["PARÁMETROS", "Ningún valor está quemado: SMMLV, auxilio, UVT, porcentajes y recargos se editan por año en Configuración y conservan el histórico."],
    ["Flujo del mes", "Se genera una fila por empleado activo → se registran novedades → COORDINACIÓN presiona Cargar en cada fila → Enviar a aprobación → ADMINISTRADOR devuelve filas o aprueba con código de un solo uso → el mes se bloquea y pasa a Pagos."],
    ["Alertas", "Base inferior al SMMLV, no salariales > 40 % (Ley 1393), y variaciones > 5 % frente al mes anterior."],
    ["Socios", "Van en NÓMINA SOCIOS con sus propios totales: se pagan por el mismo flujo pero no entran en gráficas ni indicadores."],
    ["Simulador", "Aumento para persona o cargo, o cargo nuevo: comparativo antes vs después rubro por rubro. La propuesta queda PENDIENTE hasta que el ADMINISTRADOR la aprueba, rechaza o devuelve."],
  ];
  return (
    <Modal open={open} onClose={onClose} title="Cómo funciona Nómina">
      <div className="list">
        {reglas.map(([t, d]) => (
          <div className="list-row flat" key={t} style={{ alignItems: "flex-start" }}>
            <div><div className="list-label">{t}</div><div className="footnote">{d}</div></div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
