import React, { useState, useEffect } from "react";
import { Dumbbell, ChevronRight, Plus, Check, ArrowLeft, User } from "lucide-react";
import {
  genId, fetchUsers, createUser, setActiveUserId, saveUserKind,
  enqueueUpsert, hasLegacyData, migrateLegacyTo,
} from "./sync.js";

const ACCENT = "#0A84FF";
const ACCENT_GRAD = "linear-gradient(135deg, #3AA0FF 0%, #0A84FF 55%, #0A5BE0 100%)";

const GOALS = [
  { id: "hipertrofia", label: "Ganar músculo", emoji: "💪" },
  { id: "fuerza", label: "Fuerza", emoji: "🏋️" },
  { id: "perder_grasa", label: "Perder grasa", emoji: "🔥" },
  { id: "mantener", label: "Mantener", emoji: "⚖️" },
];
const LEVELS = [
  { id: "principiante", label: "Principiante" },
  { id: "intermedio", label: "Intermedio" },
  { id: "avanzado", label: "Avanzado" },
];
const SEXES = [
  { id: "M", label: "Hombre" },
  { id: "F", label: "Mujer" },
  { id: "Otro", label: "Otro" },
];

export default function Onboarding({ onSelect }) {
  const [users, setUsers] = useState(null);
  const [screen, setScreen] = useState("picker");

  useEffect(() => {
    fetchUsers().then((list) => {
      setUsers(list);
      if (!list.length) setScreen("create");
    });
  }, []);

  const pick = (id) => {
    setActiveUserId(id);
    onSelect(id);
  };

  if (screen === "create") {
    return <CreateProfile onCancel={() => setScreen("picker")} onCreated={pick} firstEver={!users || !users.length} />;
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.hero}>
        <div style={styles.logoBubble}><Dumbbell size={28} color="#FFFFFF" strokeWidth={2.4} /></div>
        <div style={styles.eyebrow}>ENTRENAMIENTO</div>
        <h1 style={styles.h1}>¿Quién entrena hoy?</h1>
        <div style={styles.sub}>Elige tu perfil o crea uno nuevo.</div>
      </div>

      <div style={styles.list}>
        {users === null && <div style={styles.loading}>Cargando perfiles…</div>}
        {users && users.map((u) => (
          <button key={u.id} style={styles.profileRow} onClick={() => pick(u.id)}>
            <div style={styles.avatar}>{(u.name || "?").trim().charAt(0).toUpperCase()}</div>
            <div style={{ flex: 1, textAlign: "left" }}>
              <div style={styles.pName}>{u.name}</div>
              <div style={styles.pGoal}>{(GOALS.find((g) => g.id === u.goal) || {}).label || "Entrenamiento"}</div>
            </div>
            <ChevronRight size={18} color="#C7C7CC" />
          </button>
        ))}

        <button style={styles.newBtn} onClick={() => setScreen("create")}>
          <div style={styles.newIcon}><Plus size={18} color={ACCENT} strokeWidth={3} /></div>
          <span style={styles.newLabel}>Crear nuevo perfil</span>
        </button>
      </div>
    </div>
  );
}

function CreateProfile({ onCancel, onCreated, firstEver }) {
  const [name, setName] = useState("");
  const [sex, setSex] = useState("M");
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [level, setLevel] = useState("intermedio");
  const [goal, setGoal] = useState("hipertrofia");
  const [days, setDays] = useState(4);
  const [importLegacy, setImportLegacy] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const legacy = hasLegacyData();

  const submit = async () => {
    const nm = name.trim();
    const h = parseFloat(height);
    const w = parseFloat(weight);
    const a = parseInt(age, 10);
    if (!nm) return setError("Escribe tu nombre.");
    if (isNaN(w) || w <= 0) return setError("Ingresa un peso válido.");
    if (isNaN(h) || h <= 0) return setError("Ingresa una altura válida.");
    setError("");
    setSaving(true);

    const id = genId();
    const nowIso = new Date().toISOString();
    const profile = {
      id, name: nm, sex,
      birth_year: !isNaN(a) && a > 0 ? new Date().getFullYear() - a : null,
      height_cm: h, weight_kg: w, goal, experience: level, days_per_week: days,
    };

    setActiveUserId(id);
    if (legacy && importLegacy) migrateLegacyTo(id);

    // Peso inicial como primer weight_log (local + cola de sync).
    const wEntry = { id: genId(), weight: w, date: nowIso };
    const existingWeights = []; // perfil nuevo
    saveUserKind(id, "weights", [wEntry, ...existingWeights]);
    enqueueUpsert(id, "weights", wEntry);

    await createUser(profile);
    onCreated(id);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.formHeader}>
        <button style={styles.backBtn} onClick={onCancel} aria-label="Volver"><ArrowLeft size={20} color="#3A3A3C" /></button>
        <span style={styles.formTitle}>Nuevo perfil</span>
      </div>

      <div style={styles.form}>
        <div style={styles.fieldLabel}>NOMBRE</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" style={styles.input} autoFocus />

        <div style={styles.fieldLabel}>SEXO</div>
        <Segmented options={SEXES} value={sex} onChange={setSex} />

        <div style={styles.twoCol}>
          <div style={{ flex: 1 }}>
            <div style={styles.fieldLabel}>EDAD</div>
            <input type="number" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="años" style={styles.inputMono} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.fieldLabel}>ALTURA (CM)</div>
            <input type="number" inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="cm" style={styles.inputMono} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={styles.fieldLabel}>PESO (KG)</div>
            <input type="number" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="kg" style={styles.inputMono} />
          </div>
        </div>

        <div style={styles.fieldLabel}>NIVEL</div>
        <Segmented options={LEVELS} value={level} onChange={setLevel} />

        <div style={styles.fieldLabel}>OBJETIVO</div>
        <div style={styles.goalGrid}>
          {GOALS.map((g) => (
            <button key={g.id} onClick={() => setGoal(g.id)}
              style={{ ...styles.goalCard, ...(goal === g.id ? styles.goalCardActive : {}) }}>
              <span style={{ fontSize: 20 }}>{g.emoji}</span>
              <span style={styles.goalLabel}>{g.label}</span>
            </button>
          ))}
        </div>

        <div style={styles.fieldLabel}>DÍAS POR SEMANA</div>
        <div style={styles.daysRow}>
          {[3, 4, 5, 6].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              style={{ ...styles.dayChip, ...(days === d ? styles.dayChipActive : {}) }}>{d}</button>
          ))}
        </div>

        {legacy && firstEver && (
          <button style={styles.checkRow} onClick={() => setImportLegacy((v) => !v)}>
            <div style={{ ...styles.checkbox, ...(importLegacy ? styles.checkboxOn : {}) }}>
              {importLegacy && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
            </div>
            <span style={styles.checkLabel}>Importar mis entrenamientos guardados en este dispositivo</span>
          </button>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <button onClick={submit} disabled={saving} style={{ ...styles.cta, opacity: saving ? 0.6 : 1 }}>
          <User size={17} strokeWidth={2.5} />
          {saving ? "CREANDO…" : "CREAR PERFIL Y EMPEZAR"}
        </button>
      </div>
    </div>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={styles.segmented}>
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          style={{ ...styles.segmentBtn, ...(value === o.id ? styles.segmentBtnActive : {}) }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif";
const MONO_FONT = "'SF Mono', ui-monospace, Menlo, Consolas, monospace";

const styles = {
  wrap: { fontFamily: SYSTEM_FONT, background: "#FFFFFF", color: "#000000", minHeight: "100vh", maxWidth: 480, margin: "0 auto", paddingBottom: 40 },
  hero: { padding: "48px 24px 20px", textAlign: "center" },
  logoBubble: { width: 60, height: 60, borderRadius: 18, background: ACCENT_GRAD, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", boxShadow: "0 10px 26px rgba(10,132,255,0.35)" },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: "#8E8E93", fontWeight: 600 },
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: -0.4, margin: "6px 0 6px" },
  sub: { fontSize: 14, color: "#8E8E93" },
  list: { padding: "8px 20px" },
  loading: { color: "#8E8E93", textAlign: "center", padding: 30, fontSize: 14 },
  profileRow: { width: "100%", display: "flex", alignItems: "center", gap: 14, background: "#F7F7F8", border: "1px solid #ECECEC", borderRadius: 16, padding: "14px 16px", marginBottom: 10, cursor: "pointer" },
  avatar: { width: 44, height: 44, borderRadius: 22, background: ACCENT_GRAD, color: "#FFFFFF", fontSize: 19, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  pName: { fontSize: 16, fontWeight: 600, color: "#000000" },
  pGoal: { fontSize: 12.5, color: "#8E8E93", marginTop: 2 },
  newBtn: { width: "100%", display: "flex", alignItems: "center", gap: 14, background: "none", border: "1.5px dashed #C7C7CC", borderRadius: 16, padding: "14px 16px", marginTop: 4, cursor: "pointer" },
  newIcon: { width: 44, height: 44, borderRadius: 22, background: "#EAF3FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  newLabel: { fontSize: 15, fontWeight: 600, color: ACCENT },

  formHeader: { display: "flex", alignItems: "center", gap: 10, padding: "20px 20px 6px" },
  backBtn: { background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex" },
  formTitle: { fontSize: 18, fontWeight: 700 },
  form: { padding: "8px 20px 20px" },
  fieldLabel: { fontSize: 11.5, letterSpacing: 1, color: "#8E8E93", fontWeight: 600, marginBottom: 7, marginTop: 18 },
  input: { width: "100%", background: "#F7F7F8", border: "1px solid #E5E5EA", borderRadius: 12, color: "#000000", padding: "13px 12px", fontSize: 15 },
  inputMono: { width: "100%", background: "#F7F7F8", border: "1px solid #E5E5EA", borderRadius: 12, color: "#000000", padding: "13px 12px", fontSize: 15, fontFamily: MONO_FONT },
  twoCol: { display: "flex", gap: 10 },
  segmented: { display: "flex", background: "#EFEFF0", borderRadius: 12, padding: 3 },
  segmentBtn: { flex: 1, background: "none", border: "none", borderRadius: 9, padding: "9px 0", fontSize: 13, fontWeight: 600, color: "#3A3A3C", cursor: "pointer" },
  segmentBtnActive: { background: "#FFFFFF", color: "#000000", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" },
  goalGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  goalCard: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, background: "#F7F7F8", border: "1.5px solid #ECECEC", borderRadius: 14, padding: "14px 14px", cursor: "pointer" },
  goalCardActive: { border: `1.5px solid ${ACCENT}`, background: "#EAF3FF" },
  goalLabel: { fontSize: 14, fontWeight: 600, color: "#000000" },
  daysRow: { display: "flex", gap: 10 },
  dayChip: { flex: 1, background: "#F2F2F7", border: "none", borderRadius: 12, color: "#3A3A3C", fontSize: 16, fontWeight: 700, padding: "12px 0", cursor: "pointer", fontFamily: MONO_FONT },
  dayChipActive: { background: ACCENT_GRAD, color: "#FFFFFF" },
  checkRow: { width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: 0, marginTop: 20, cursor: "pointer", textAlign: "left" },
  checkbox: { width: 22, height: 22, borderRadius: 7, border: "1.5px solid #C7C7CC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  checkboxOn: { background: ACCENT, border: `1.5px solid ${ACCENT}` },
  checkLabel: { fontSize: 13, color: "#3A3A3C", lineHeight: 1.4 },
  error: { color: "#FF3B30", fontSize: 13, marginTop: 14 },
  cta: { width: "100%", marginTop: 22, border: "none", borderRadius: 12, color: "#FFFFFF", fontWeight: 700, fontSize: 14, letterSpacing: 0.3, padding: "15px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", background: ACCENT_GRAD, boxShadow: "0 6px 18px rgba(10,132,255,0.30)" },
};
