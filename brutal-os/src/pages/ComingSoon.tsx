import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Check, Sparkles } from "lucide-react";
import { MODULOS } from "../modules";

export default function ComingSoon() {
  const { slug } = useParams();
  const nav = useNavigate();
  const m = MODULOS.find((x) => x.slug === slug && !x.listo);
  if (!m) return <Navigate to="/" replace />;
  const Icon = m.icono;
  const otros = MODULOS.filter((x) => !x.listo && x.slug !== m.slug);
  return (
    <div className="fade-in">
      <div className="soon-hero" style={{ background: `radial-gradient(120% 120% at 100% 0%, ${m.color} 0%, color-mix(in srgb, ${m.color} 55%, #000) 55%, #050507 100%)` }}>
        <div className="glyph"><Icon strokeWidth={1.2} /></div>
        <div className="row" style={{ gap: 12, marginBottom: 18 }}>
          <span className="tile-icon" style={{ width: 52, height: 52 }}><Icon /></span>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>{m.nombre}</div>
            <div style={{ opacity: 0.75 }}>{m.descripcion}</div>
          </div>
        </div>
        <div className="big">COMING<br />SOON</div>
        <div style={{ marginTop: 18, opacity: 0.85, maxWidth: 560, fontSize: 17 }}>
          Este módulo está en construcción. Su estructura de datos ya está prevista y se conecta por el ID del empleado (LB0001) con Empleados y Nómina.
        </div>
      </div>

      {m.incluira && (
        <>
          <div className="section-title"><Sparkles size={20} color={m.color} /> Qué incluirá</div>
          <div className="list">
            {m.incluira.map((i) => (
              <div className="list-row" key={i}>
                <span className="list-icon" style={{ background: m.gradiente }}><Check /></span>
                <span>{i}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">También en camino</div>
      <div className="shelf">
        {otros.map((o) => {
          const I = o.icono;
          return (
            <button key={o.slug} className="tile soon" style={{ background: o.gradiente }} onClick={() => nav(o.ruta)}>
              <span className="soon-badge">PRONTO</span>
              <span className="tile-icon"><I /></span>
              <div>
                <div className="tile-title">{o.nombre}</div>
                <div className="tile-sub">{o.descripcion}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
