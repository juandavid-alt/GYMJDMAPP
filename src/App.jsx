import React, { useState, useEffect, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Plus, TrendingUp, Trash2, Dumbbell, Calendar, PlayCircle, Flame,
  ListChecks, CheckCircle2, ChevronDown, BookOpen, Check, Timer, X, Pill, Droplet,
  Scale, Bell, BellRing
} from "lucide-react";

const STORAGE_KEY = "jd-workout-logs";
const SUPP_KEY = "jd-supplement-logs";
const WEIGHT_KEY = "jd-weight-logs";
const SNOOZE_KEY = "jd-weight-snooze";
const REST_SECONDS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHECKIN_INTERVAL_DAYS = 30;

const EXERCISES = [
  "Press banca plano", "Press inclinado mancuernas", "Press militar",
  "Elevaciones laterales", "Fondos en paralelas", "Extensión tríceps polea", "Press francés",
  "Dominadas", "Remo con barra", "Remo en polea baja",
  "Curl con barra", "Curl martillo", "Curl concentrado",
  "Sentadilla", "Prensa", "Peso muerto rumano", "Curl femoral", "Extensión cuádriceps", "Elevación de talones",
  "Curl 21s", "Curl inclinado mancuernas", "Curl predicador",
  "Press cerrado", "Extensión tríceps overhead", "Patada de tríceps"
];

const GUIDE = [
  { name: "Press banca plano", grupo: "Pecho", equipo: "Barra olímpica + banco plano", cue: "Escápulas retraídas, baja la barra al esternón con codos a 45°, empuja sin rebotar." },
  { name: "Press inclinado mancuernas", grupo: "Pecho", equipo: "Mancuernas + banco inclinado 30-45°", cue: "Codos ligeramente por debajo de la línea de hombros, junta las mancuernas arriba sin chocarlas." },
  { name: "Press militar", grupo: "Hombro", equipo: "Barra + rack o mancuernas de pie", cue: "Abdomen apretado, empuja la barra en línea recta sobre la cabeza, no arquear la espalda." },
  { name: "Elevaciones laterales", grupo: "Hombro", equipo: "Mancuernas ligeras", cue: "Sube con codos ligeramente flexionados hasta la altura del hombro, controla la bajada." },
  { name: "Fondos en paralelas", grupo: "Pecho", equipo: "Barras paralelas o máquina asistida", cue: "Inclina el torso adelante para pecho, mantente vertical para enfatizar tríceps." },
  { name: "Extensión tríceps polea", grupo: "Tríceps", equipo: "Polea alta + cuerda o barra recta", cue: "Codos pegados al torso, extiende completo y aprieta el tríceps abajo." },
  { name: "Press francés", grupo: "Tríceps", equipo: "Barra Z + banco plano", cue: "Baja la barra hacia la frente flexionando solo el codo, antebrazos fijos." },
  { name: "Dominadas", grupo: "Espalda", equipo: "Barra de dominadas", cue: "Agarre prono, tira hasta pasar la barbilla la barra, baja controlado sin balanceo." },
  { name: "Remo con barra", grupo: "Espalda", equipo: "Barra olímpica", cue: "Torso inclinado ~45°, tira hacia el ombligo, espalda neutra todo el movimiento." },
  { name: "Remo en polea baja", grupo: "Espalda", equipo: "Polea baja + agarre en V", cue: "Pecho arriba, tira con los codos pegados al cuerpo, aprieta escápulas al final." },
  { name: "Curl con barra", grupo: "Bíceps", equipo: "Barra recta o Z", cue: "Codos fijos a los costados, sube sin balancear el torso, baja lento (2-3s)." },
  { name: "Curl martillo", grupo: "Bíceps", equipo: "Mancuernas", cue: "Agarre neutro (palmas enfrentadas), codos fijos, ideal para grosor del brazo." },
  { name: "Curl concentrado", grupo: "Bíceps", equipo: "Mancuerna + banco", cue: "Codo apoyado en la cara interna del muslo, aísla el bíceps al máximo." },
  { name: "Sentadilla", grupo: "Pierna", equipo: "Barra + rack", cue: "Pies al ancho de hombros, baja con caderas atrás, rodillas siguen la punta del pie." },
  { name: "Prensa", grupo: "Pierna", equipo: "Máquina de prensa 45°", cue: "Pies a la altura de hombros en la plataforma, no bloquees rodillas al extender." },
  { name: "Peso muerto rumano", grupo: "Pierna", equipo: "Barra o mancuernas", cue: "Rodillas semi-flexionadas fijas, baja la barra pegada a las piernas con espalda recta." },
  { name: "Curl femoral", grupo: "Pierna", equipo: "Máquina de curl femoral (tumbado o sentado)", cue: "Flexiona la rodilla llevando el talón al glúteo, controla la vuelta." },
  { name: "Extensión cuádriceps", grupo: "Pierna", equipo: "Máquina de extensión de piernas", cue: "Extiende completo apretando el cuádriceps, baja sin soltar el peso de golpe." },
  { name: "Elevación de talones", grupo: "Pierna", equipo: "Máquina de pantorrilla o step + mancuerna", cue: "Sube lo más alto posible en la punta del pie, baja controlado hasta estirar bien." },
  { name: "Curl 21s", grupo: "Bíceps", equipo: "Barra o mancuernas", cue: "7 reps mitad inferior + 7 mitad superior + 7 completas, mismo peso." },
  { name: "Curl inclinado mancuernas", grupo: "Bíceps", equipo: "Mancuernas + banco inclinado", cue: "Banco a 45-60°, brazos colgando atrás para mayor estiramiento del bíceps." },
  { name: "Curl predicador", grupo: "Bíceps", equipo: "Banco predicador (Scott) + barra Z", cue: "Apoya todo el brazo en el banco, no extiendas del todo para mantener tensión." },
  { name: "Press cerrado", grupo: "Tríceps", equipo: "Barra + banco plano", cue: "Agarre al ancho de hombros, codos pegados al cuerpo al bajar la barra al pecho." },
  { name: "Extensión tríceps overhead", grupo: "Tríceps", equipo: "Mancuerna o cuerda en polea", cue: "Codos apuntando al frente y fijos, baja detrás de la cabeza, extiende completo." },
  { name: "Patada de tríceps", grupo: "Tríceps", equipo: "Mancuerna", cue: "Torso paralelo al piso, brazo pegado al costado, extiende solo el antebrazo." },
];

// Día 1 = Tracción, Día 2 = Empuje (intercambiados a pedido)
const ROUTINE_DAYS = [
  {
    id: 1, title: "Tracción", subtitle: "Espalda · Bíceps", color: "#007AFF",
    exercises: [
      { name: "Dominadas", sets: 4, reps: "8-10" },
      { name: "Remo con barra", sets: 4, reps: "8-10" },
      { name: "Remo en polea baja", sets: 3, reps: "10" },
      { name: "Curl con barra", sets: 4, reps: "10" },
      { name: "Curl martillo", sets: 3, reps: "12" },
      { name: "Curl concentrado", sets: 3, reps: "12" },
    ],
  },
  {
    id: 2, title: "Empuje", subtitle: "Pecho · Hombro · Tríceps", color: "#FF3B30",
    exercises: [
      { name: "Press banca plano", sets: 4, reps: "8-10" },
      { name: "Press inclinado mancuernas", sets: 3, reps: "10" },
      { name: "Press militar", sets: 3, reps: "8-10" },
      { name: "Elevaciones laterales", sets: 3, reps: "15" },
      { name: "Fondos en paralelas", sets: 3, reps: "10" },
      { name: "Extensión tríceps polea", sets: 4, reps: "12" },
      { name: "Press francés", sets: 3, reps: "10" },
    ],
  },
  {
    id: 3, title: "Piernas", subtitle: "Cuádriceps · Isquiotibiales", color: "#34C759",
    exercises: [
      { name: "Sentadilla", sets: 4, reps: "8" },
      { name: "Prensa", sets: 3, reps: "10" },
      { name: "Peso muerto rumano", sets: 3, reps: "10" },
      { name: "Curl femoral", sets: 3, reps: "12" },
      { name: "Extensión cuádriceps", sets: 3, reps: "12" },
      { name: "Elevación de talones", sets: 4, reps: "15" },
    ],
  },
  {
    id: 4, title: "Brazos", subtitle: "Especialización · Bíceps · Tríceps", color: "#AF52DE",
    exercises: [
      { name: "Curl 21s", sets: 3, reps: "21" },
      { name: "Curl inclinado mancuernas", sets: 3, reps: "12" },
      { name: "Curl predicador", sets: 3, reps: "10" },
      { name: "Press cerrado", sets: 4, reps: "10" },
      { name: "Extensión tríceps overhead", sets: 3, reps: "12" },
      { name: "Patada de tríceps", sets: 3, reps: "15" },
      { name: "Elevaciones laterales", sets: 3, reps: "15" },
    ],
  },
];

const SUPP_DEFAULTS = { "Proteína": 30, "Creatina": 5 };

export default function WorkoutTracker() {
  const [logs, setLogs] = useState([]);
  const [supps, setSupps] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("rutina");
  const [exercise, setExercise] = useState(EXERCISES[0]);
  const [customExercise, setCustomExercise] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [error, setError] = useState("");
  const [guideFilter, setGuideFilter] = useState("Todos");
  const [activeDay, setActiveDay] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [quickWeight, setQuickWeight] = useState("");
  const [quickReps, setQuickReps] = useState("");
  const [restSeconds, setRestSeconds] = useState(null);
  const [suppType, setSuppType] = useState("Proteína");
  const [suppAmount, setSuppAmount] = useState(String(SUPP_DEFAULTS["Proteína"]));
  const [weights, setWeights] = useState([]);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [notifStatus, setNotifStatus] = useState(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setLogs(raw ? JSON.parse(raw) : []);
    } catch (e) {
      setLogs([]);
    }
    try {
      const raw2 = localStorage.getItem(SUPP_KEY);
      setSupps(raw2 ? JSON.parse(raw2) : []);
    } catch (e) {
      setSupps([]);
    }
    try {
      const raw3 = localStorage.getItem(WEIGHT_KEY);
      setWeights(raw3 ? JSON.parse(raw3) : []);
    } catch (e) {
      setWeights([]);
    }
    setLoaded(true);
  }, []);

  // Rest timer ticking
  useEffect(() => {
    if (restSeconds === null || restSeconds <= 0) return;
    const t = setTimeout(() => setRestSeconds((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [restSeconds]);

  // Auto-hide "listo" state
  useEffect(() => {
    if (restSeconds === 0) {
      const t = setTimeout(() => setRestSeconds(null), 8000);
      return () => clearTimeout(t);
    }
  }, [restSeconds]);

  const persist = (next) => {
    setLogs(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      setError("No se pudo guardar. Intenta de nuevo.");
    }
  };

  const persistSupps = (next) => {
    setSupps(next);
    try {
      localStorage.setItem(SUPP_KEY, JSON.stringify(next));
    } catch (e) {
      setError("No se pudo guardar. Intenta de nuevo.");
    }
  };

  const persistWeights = (next) => {
    setWeights(next);
    try {
      localStorage.setItem(WEIGHT_KEY, JSON.stringify(next));
    } catch (e) {
      setError("No se pudo guardar. Intenta de nuevo.");
    }
  };

  const addWeight = () => {
    const w = parseFloat(weightInput);
    if (isNaN(w) || w <= 0) {
      setError("Ingresa un peso válido.");
      return;
    }
    setError("");
    const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), weight: w, date: new Date().toISOString() };
    persistWeights([entry, ...weights]);
    setShowWeightModal(false);
    setWeightInput("");
    try { localStorage.removeItem(SNOOZE_KEY); } catch (e) {}
  };

  const snoozeWeightPrompt = () => {
    try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 7 * DAY_MS)); } catch (e) {}
    setShowWeightModal(false);
  };

  const requestNotifications = () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    Notification.requestPermission().then((perm) => setNotifStatus(perm));
  };

  const addEntry = (exName, w, r) => {
    const weightNum = parseFloat(w);
    const repsNum = parseInt(r, 10);
    if (!exName || isNaN(weightNum) || weightNum <= 0 || isNaN(repsNum) || repsNum <= 0) {
      return false;
    }
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      exercise: exName,
      weight: weightNum,
      reps: repsNum,
      date: new Date().toISOString(),
    };
    persist([entry, ...logs]);
    setRestSeconds(REST_SECONDS);
    return true;
  };

  const addLog = () => {
    const finalExercise = useCustom ? customExercise.trim() : exercise;
    const ok = addEntry(finalExercise, weight, reps);
    if (!ok) {
      setError("Completa ejercicio, peso y repeticiones válidos.");
      return;
    }
    setError("");
    setWeight("");
    setReps("");
  };

  const deleteLog = (id) => {
    persist(logs.filter((l) => l.id !== id));
  };

  const addSupplement = () => {
    const amt = parseFloat(suppAmount);
    if (isNaN(amt) || amt <= 0) {
      setError("Ingresa una cantidad válida.");
      return;
    }
    setError("");
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type: suppType,
      amount: amt,
      date: new Date().toISOString(),
    };
    persistSupps([entry, ...supps]);
  };

  const deleteSupp = (id) => {
    persistSupps(supps.filter((s) => s.id !== id));
  };

  const exerciseNames = useMemo(() => {
    const set = new Set(logs.map((l) => l.exercise));
    return Array.from(set).sort();
  }, [logs]);

  const prByExercise = useMemo(() => {
    const map = {};
    for (const l of logs) {
      if (!map[l.exercise] || l.weight > map[l.exercise].weight) map[l.exercise] = l;
    }
    return map;
  }, [logs]);

  const lastByExercise = useMemo(() => {
    const map = {};
    for (const l of logs) {
      if (!map[l.exercise] || new Date(l.date) > new Date(map[l.exercise].date)) map[l.exercise] = l;
    }
    return map;
  }, [logs]);

  const chartData = useMemo(() => {
    if (!selectedExercise) return [];
    return logs
      .filter((l) => l.exercise === selectedExercise)
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((l) => ({
        date: new Date(l.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
        peso: l.weight,
        reps: l.reps,
      }));
  }, [logs, selectedExercise]);

  const recentLogs = logs.slice(0, 12);
  const todayKey = new Date().toISOString().slice(0, 10);

  const doneTodaySet = useMemo(() => {
    return new Set(logs.filter((l) => l.date.slice(0, 10) === todayKey).map((l) => l.exercise));
  }, [logs, todayKey]);

  const trainedDateSet = useMemo(() => new Set(logs.map((l) => l.date.slice(0, 10))), [logs]);
  const trainedDatesSorted = useMemo(
    () => Array.from(trainedDateSet).sort((a, b) => (a < b ? 1 : -1)),
    [trainedDateSet]
  );
  const monthGroups = useMemo(() => {
    const groups = {};
    for (const d of trainedDatesSorted) {
      const key = d.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }
    return groups;
  }, [trainedDatesSorted]);
  const thisMonthCount = useMemo(() => {
    const prefix = todayKey.slice(0, 7);
    return trainedDatesSorted.filter((d) => d.startsWith(prefix)).length;
  }, [trainedDatesSorted, todayKey]);
  const calendarCells = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ day: d, trained: trainedDateSet.has(key) });
    }
    return cells;
  }, [trainedDateSet]);

  const filteredGuide = useMemo(() => {
    if (guideFilter === "Todos") return GUIDE;
    return GUIDE.filter((g) => g.grupo === guideFilter);
  }, [guideFilter]);
  const guideGroups = ["Todos", "Pecho", "Espalda", "Hombro", "Bíceps", "Tríceps", "Pierna"];

  const weightsSorted = useMemo(
    () => weights.slice().sort((a, b) => new Date(b.date) - new Date(a.date)),
    [weights]
  );
  const latestWeight = weightsSorted[0] || null;
  const firstWeight = weightsSorted[weightsSorted.length - 1] || null;
  const weightDelta = latestWeight && firstWeight && latestWeight.id !== firstWeight.id
    ? +(latestWeight.weight - firstWeight.weight).toFixed(1)
    : null;
  const weightChartData = useMemo(() => {
    return weights
      .slice()
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map((w) => ({ date: new Date(w.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short" }), peso: w.weight }));
  }, [weights]);

  const shouldPromptWeight = useMemo(() => {
    if (!loaded) return false;
    let snoozeUntil = 0;
    try { snoozeUntil = Number(localStorage.getItem(SNOOZE_KEY)) || 0; } catch (e) {}
    if (Date.now() < snoozeUntil) return false;
    if (!latestWeight) return true;
    const daysSince = (Date.now() - new Date(latestWeight.date).getTime()) / DAY_MS;
    return daysSince >= CHECKIN_INTERVAL_DAYS;
  }, [loaded, latestWeight]);

  useEffect(() => {
    if (shouldPromptWeight) {
      setShowWeightModal(true);
      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        try {
          new Notification("Actualiza tu peso 📊", {
            body: "Ya pasó un mes — registra tu peso para ver tu evolución.",
            icon: "/icon-192.png",
          });
        } catch (e) {}
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPromptWeight]);

  const suggestedDay = ROUTINE_DAYS[trainedDatesSorted.length % 4].id;
  useEffect(() => {
    setActiveDay(suggestedDay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const currentDay = ROUTINE_DAYS.find((d) => d.id === activeDay);
  const dayDoneCount = currentDay ? currentDay.exercises.filter((e) => doneTodaySet.has(e.name)).length : 0;

  const openQuickLog = (name) => {
    if (expanded === name) {
      setExpanded(null);
      return;
    }
    setExpanded(name);
    const last = lastByExercise[name];
    setQuickWeight(last ? String(last.weight) : "");
    setQuickReps(last ? String(last.reps) : "");
  };

  const saveQuickLog = (name) => {
    const ok = addEntry(name, quickWeight, quickReps);
    if (ok) {
      setExpanded(null);
      setQuickWeight("");
      setQuickReps("");
    }
  };

  const todaySupps = useMemo(() => supps.filter((s) => s.date.slice(0, 10) === todayKey), [supps, todayKey]);
  const todayProtein = useMemo(() => todaySupps.filter((s) => s.type === "Proteína").reduce((a, s) => a + s.amount, 0), [todaySupps]);
  const todayCreatine = useMemo(() => todaySupps.filter((s) => s.type === "Creatina").reduce((a, s) => a + s.amount, 0), [todaySupps]);
  const suppMonthGroups = useMemo(() => {
    const groups = {};
    for (const s of supps) {
      const key = s.date.slice(0, 7);
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    }
    return groups;
  }, [supps]);

  const restPct = restSeconds === null ? 0 : Math.min(1, restSeconds / REST_SECONDS);
  const restMM = restSeconds !== null ? String(Math.floor(restSeconds / 60)).padStart(1, "0") : "0";
  const restSS = restSeconds !== null ? String(restSeconds % 60).padStart(2, "0") : "00";

  const TABS = [
    { id: "rutina", label: "Rutina", icon: ListChecks },
    { id: "registrar", label: "Registrar", icon: Plus },
    { id: "progreso", label: "Progreso", icon: TrendingUp },
    { id: "dias", label: "Días", icon: Calendar },
    { id: "suplementos", label: "Suplem.", icon: Pill },
    { id: "guia", label: "Guía", icon: BookOpen },
  ];

  return (
    <div style={styles.app}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        body { margin: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #D1D1D6; border-radius: 3px; }
        .row-enter { animation: slideIn 0.25s cubic-bezier(0.16,1,0.3,1); }
        .fade-in { animation: fadeIn 0.2s ease-out; }
        .toast-in { animation: toastIn 0.3s cubic-bezier(0.16,1,0.3,1); }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-6px);} to { opacity: 1; transform: translateY(0);} }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes toastIn { from { opacity: 0; transform: translate(-50%, -14px);} to { opacity: 1; transform: translate(-50%, 0);} }
        button { font-family: inherit; -webkit-appearance: none; }
        input, select { font-family: inherit; }
        input:focus, select:focus { outline: none; border-color: #FF9500 !important; }
        .pill-btn { transition: transform 0.15s ease, background 0.15s ease; }
        .pill-btn:active { transform: scale(0.96); }
        .ex-card { transition: background 0.15s ease; }
      `}</style>

      {restSeconds !== null && (
        <div className="toast-in" style={styles.restToast}>
          <div style={styles.restRing}>
            <svg width="34" height="34" viewBox="0 0 34 34">
              <circle cx="17" cy="17" r="14.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="3" />
              <circle
                cx="17" cy="17" r="14.5" fill="none" stroke={restSeconds === 0 ? "#34C759" : "#FF9500"} strokeWidth="3"
                strokeDasharray={2 * Math.PI * 14.5} strokeDashoffset={2 * Math.PI * 14.5 * (1 - restPct)}
                strokeLinecap="round" transform="rotate(-90 17 17)" style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <Timer size={14} color="#FFFFFF" style={{ position: "absolute" }} />
          </div>
          {restSeconds === 0 ? (
            <span style={styles.restLabel}>¡Descanso listo! 💪</span>
          ) : (
            <span style={styles.restLabel}>Descanso · {restMM}:{restSS}</span>
          )}
          {restSeconds !== 0 && (
            <button onClick={() => setRestSeconds((s) => (s || 0) + 30)} style={styles.restBtn}>+30s</button>
          )}
          <button onClick={() => setRestSeconds(null)} style={styles.restCloseBtn} aria-label="Cerrar">
            <X size={15} color="#FFFFFF" />
          </button>
        </div>
      )}

      {showWeightModal && (
        <div style={styles.modalOverlay} className="fade-in">
          <div style={styles.modalCard}>
            <Scale size={30} color="#FF9500" />
            <div style={styles.modalTitle}>
              {latestWeight ? "Actualiza tu peso" : "Registra tu peso inicial"}
            </div>
            <div style={styles.modalSubtitle}>
              {latestWeight
                ? "Ya pasó un mes desde tu último registro. Anótalo para ver tu evolución."
                : "Guarda tu peso actual para empezar a ver tu evolución mes a mes."}
            </div>
            <input
              type="number"
              inputMode="decimal"
              placeholder="Peso en kg"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              style={{ ...styles.input, textAlign: "center", fontSize: 20, marginTop: 16 }}
              autoFocus
            />
            {error && <div style={styles.errorText}>{error}</div>}
            <button onClick={addWeight} style={{ ...styles.addBtn, background: "#FF9500", marginTop: 14 }}>
              <Check size={17} strokeWidth={3} />
              GUARDAR
            </button>
            <button onClick={snoozeWeightPrompt} style={styles.modalSkip}>Recordar en 7 días</button>
          </div>
        </div>
      )}

      <header style={styles.header}>
        <div style={styles.headerTop}>
          <Dumbbell size={20} color="#FF9500" strokeWidth={2.4} />
          <span style={styles.eyebrow}>ENTRENAMIENTO</span>
        </div>
        <h1 style={styles.title}>Hola, Juan David</h1>
        <div style={styles.statRow}>
          <div style={styles.statChip}><span style={styles.statNum}>{trainedDateSet.size}</span><span style={styles.statLabel}>días</span></div>
          <div style={styles.statChip}><span style={styles.statNum}>{logs.length}</span><span style={styles.statLabel}>series</span></div>
          <div style={styles.statChip}><span style={styles.statNum}>{exerciseNames.length}</span><span style={styles.statLabel}>ejercicios</span></div>
        </div>
      </header>

      <main style={styles.main}>
        {!loaded && <div style={styles.loading}>Cargando…</div>}

        {loaded && tab === "rutina" && (
          <div className="fade-in">
            <div style={styles.dayPills}>
              {ROUTINE_DAYS.map((d) => (
                <button
                  key={d.id}
                  className="pill-btn"
                  onClick={() => setActiveDay(d.id)}
                  style={{
                    ...styles.dayPill,
                    ...(activeDay === d.id ? { background: d.color, color: "#FFFFFF" } : {}),
                  }}
                >
                  Día {d.id}
                  {suggestedDay === d.id && <span style={{ ...styles.pillDot, background: activeDay === d.id ? "#FFFFFF" : d.color }} />}
                </button>
              ))}
            </div>

            <div style={{ ...styles.routineHero, background: `linear-gradient(135deg, ${currentDay.color}1A, #F7F7F8 65%)`, border: `1px solid ${currentDay.color}33` }}>
              {suggestedDay === activeDay && (
                <div style={{ ...styles.suggestedBadge, background: currentDay.color }}>SUGERIDO HOY</div>
              )}
              <div style={styles.routineHeroTitle}>{currentDay.title}</div>
              <div style={styles.routineHeroSubtitle}>{currentDay.subtitle}</div>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressFill, width: `${(dayDoneCount / currentDay.exercises.length) * 100}%`, background: currentDay.color }} />
              </div>
              <div style={styles.progressLabel}>{dayDoneCount} de {currentDay.exercises.length} ejercicios registrados hoy</div>
            </div>

            <div style={styles.sectionLabel}>EJERCICIOS DE HOY</div>
            {currentDay.exercises.map((ex) => {
              const done = doneTodaySet.has(ex.name);
              const isOpen = expanded === ex.name;
              const guide = GUIDE.find((g) => g.name === ex.name);
              return (
                <div key={ex.name} style={styles.exCard} className="ex-card row-enter">
                  <button style={styles.exCardTop} onClick={() => openQuickLog(ex.name)}>
                    <div style={{ ...styles.exDot, background: done ? currentDay.color : "#E5E5EA" }}>
                      {done && <Check size={13} color="#FFFFFF" strokeWidth={3} />}
                    </div>
                    <div style={{ flex: 1, textAlign: "left" }}>
                      <div style={styles.exName}>{ex.name}</div>
                      <div style={styles.exTarget}>{ex.sets} series × {ex.reps} reps{guide ? ` · ${guide.equipo}` : ""}</div>
                    </div>
                    <ChevronDown size={18} color="#8E8E93" style={{ transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </button>

                  {isOpen && (
                    <div style={styles.exExpand} className="fade-in">
                      {guide && (
                        <div style={styles.exCue}>
                          {guide.cue}
                          <a
                            href={`https://www.tiktok.com/search?q=${encodeURIComponent(ex.name + " técnica ejecución gym")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ ...styles.videoBtn, marginTop: 10 }}
                          >
                            <PlayCircle size={15} />
                            VER VIDEO
                          </a>
                        </div>
                      )}
                      <div style={styles.twoCol}>
                        <div style={{ flex: 1 }}>
                          <div style={styles.fieldLabel}>PESO (KG)</div>
                          <input type="number" inputMode="decimal" value={quickWeight} onChange={(e) => setQuickWeight(e.target.value)} style={styles.input} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={styles.fieldLabel}>REPS</div>
                          <input type="number" inputMode="numeric" value={quickReps} onChange={(e) => setQuickReps(e.target.value)} style={styles.input} />
                        </div>
                      </div>
                      <button onClick={() => saveQuickLog(ex.name)} style={{ ...styles.addBtn, background: currentDay.color, marginTop: 14 }}>
                        <CheckCircle2 size={17} strokeWidth={2.5} />
                        REGISTRAR SERIE
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {loaded && tab === "registrar" && (
          <div className="fade-in">
            <div style={styles.card}>
              <div style={styles.fieldLabel}>EJERCICIO</div>
              {!useCustom ? (
                <select value={exercise} onChange={(e) => setExercise(e.target.value)} style={styles.select}>
                  {EXERCISES.map((ex) => <option key={ex} value={ex}>{ex}</option>)}
                </select>
              ) : (
                <input type="text" placeholder="Nombre del ejercicio" value={customExercise} onChange={(e) => setCustomExercise(e.target.value)} style={styles.input} />
              )}
              <button onClick={() => setUseCustom(!useCustom)} style={styles.linkBtn}>
                {useCustom ? "← elegir de la lista" : "+ otro ejercicio"}
              </button>

              <div style={styles.twoCol}>
                <div style={{ flex: 1 }}>
                  <div style={styles.fieldLabel}>PESO (KG)</div>
                  <input type="number" inputMode="decimal" placeholder="0" value={weight} onChange={(e) => setWeight(e.target.value)} style={styles.input} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={styles.fieldLabel}>REPS</div>
                  <input type="number" inputMode="numeric" placeholder="0" value={reps} onChange={(e) => setReps(e.target.value)} style={styles.input} />
                </div>
              </div>

              {error && <div style={styles.errorText}>{error}</div>}

              <button onClick={addLog} style={{ ...styles.addBtn, background: "#FF9500" }}>
                <Plus size={18} strokeWidth={3} />
                REGISTRAR SERIE
              </button>
            </div>

            <div style={styles.sectionLabel}>ÚLTIMAS SERIES</div>
            {recentLogs.length === 0 && <div style={styles.empty}>Aún no hay series registradas. Agrega la primera arriba.</div>}
            {recentLogs.map((l) => (
              <div key={l.id} style={styles.logRow} className="row-enter">
                <div style={styles.logMain}>
                  <div style={styles.logExercise}>{l.exercise}</div>
                  <div style={styles.logDate}>
                    {new Date(l.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div style={styles.logStats}>
                  <span style={styles.logWeight}>{l.weight}<small>kg</small></span>
                  <span style={styles.logReps}>×{l.reps}</span>
                </div>
                <button onClick={() => deleteLog(l.id)} style={styles.deleteBtn} aria-label="Eliminar">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}

        {loaded && tab === "progreso" && (
          <div className="fade-in">
            <div style={styles.sectionLabel}>PESO CORPORAL</div>
            <div style={styles.weightCard}>
              <div style={styles.weightTop}>
                <div>
                  <div style={styles.weightNow}>
                    {latestWeight ? `${latestWeight.weight} kg` : "— kg"}
                  </div>
                  <div style={styles.weightSub}>
                    {latestWeight
                      ? `Último registro: ${new Date(latestWeight.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}`
                      : "Aún no has registrado tu peso"}
                    {weightDelta !== null && (
                      <span style={{ color: weightDelta >= 0 ? "#34C759" : "#FF3B30", fontWeight: 700 }}>
                        {" "}· {weightDelta >= 0 ? "+" : ""}{weightDelta} kg desde el inicio
                      </span>
                    )}
                  </div>
                </div>
                <Scale size={26} color="#FF9500" />
              </div>
              <button onClick={() => { setWeightInput(latestWeight ? String(latestWeight.weight) : ""); setShowWeightModal(true); }} style={{ ...styles.addBtn, background: "#FF9500", marginTop: 14 }}>
                <Plus size={17} strokeWidth={3} />
                {latestWeight ? "ACTUALIZAR PESO" : "REGISTRAR PESO"}
              </button>
              {notifStatus !== "granted" && notifStatus !== "unsupported" && (
                <button onClick={requestNotifications} style={styles.notifBtn}>
                  <Bell size={14} />
                  Activar recordatorio mensual
                </button>
              )}
              {notifStatus === "granted" && (
                <div style={styles.notifActive}><BellRing size={14} color="#34C759" /> Recordatorio mensual activado</div>
              )}
            </div>

            {weightChartData.length >= 2 && (
              <div style={{ ...styles.chartCard, marginBottom: 22 }}>
                <div style={styles.chartHeader}>
                  <TrendingUp size={16} color="#FF9500" />
                  <span style={styles.chartTitle}>Evolución de peso</span>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={weightChartData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                    <CartesianGrid stroke="#EDEDED" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={{ stroke: "#EDEDED" }} />
                    <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={false} domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #FF9500", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: "#000000" }} itemStyle={{ color: "#FF9500" }} />
                    <Line type="monotone" dataKey="peso" stroke="#FF9500" strokeWidth={2.5} dot={{ r: 4, fill: "#FF9500" }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {exerciseNames.length === 0 ? (
              <div style={styles.empty}>Registra tus series para ver tu progreso por ejercicio aquí.</div>
            ) : (
              <>
                <div style={styles.sectionLabel}>RÉCORDS PERSONALES</div>
                <div style={styles.prGrid}>
                  {exerciseNames.map((name) => {
                    const pr = prByExercise[name];
                    const isSelected = selectedExercise === name;
                    return (
                      <button key={name} onClick={() => setSelectedExercise(name)} style={{ ...styles.prCard, ...(isSelected ? styles.prCardActive : {}) }}>
                        <div style={styles.prName}>{name}</div>
                        <div style={styles.prValue}>{pr.weight}<span style={styles.prUnit}>kg</span></div>
                        <div style={styles.prReps}>×{pr.reps} reps · PR</div>
                      </button>
                    );
                  })}
                </div>

                {selectedExercise && (
                  <div style={styles.chartCard}>
                    <div style={styles.chartHeader}>
                      <TrendingUp size={16} color="#FF9500" />
                      <span style={styles.chartTitle}>{selectedExercise}</span>
                    </div>
                    {chartData.length < 2 ? (
                      <div style={styles.empty}>Registra al menos 2 series de este ejercicio para ver la curva.</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={chartData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke="#EDEDED" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="date" stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={{ stroke: "#EDEDED" }} />
                          <YAxis stroke="#8E8E93" fontSize={11} tickLine={false} axisLine={false} />
                          <Tooltip contentStyle={{ background: "#FFFFFF", border: "1px solid #FF9500", borderRadius: 10, fontSize: 12 }} labelStyle={{ color: "#000000" }} itemStyle={{ color: "#FF9500" }} />
                          <Line type="monotone" dataKey="peso" stroke="#FF9500" strokeWidth={2.5} dot={{ r: 4, fill: "#FF9500" }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {loaded && tab === "dias" && (
          <div className="fade-in">
            <div style={styles.card}>
              <div style={styles.chartHeader}>
                <Calendar size={16} color="#FF9500" />
                <span style={styles.chartTitle}>{new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</span>
                <span style={{ ...styles.logDate, marginLeft: "auto" }}>{thisMonthCount} días este mes</span>
              </div>
              <div style={styles.weekHeader}>
                {["L", "M", "X", "J", "V", "S", "D"].map((d) => <div key={d} style={styles.weekHeadCell}>{d}</div>)}
              </div>
              <div style={styles.calendarGrid}>
                {calendarCells.map((c, i) =>
                  c === null ? <div key={i} style={styles.calCellEmpty} /> : (
                    <div key={i} style={{ ...styles.calCell, ...(c.trained ? styles.calCellTrained : {}) }}>{c.day}</div>
                  )
                )}
              </div>
            </div>

            <div style={styles.sectionLabel}>HISTORIAL COMPLETO</div>
            {trainedDatesSorted.length === 0 && <div style={styles.empty}>Cuando registres tu primera serie, el día quedará marcado aquí.</div>}
            {Object.entries(monthGroups).map(([key, dates]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={styles.monthLabel}>
                  {new Date(key + "-01").toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
                  <span style={{ color: "#FF9500", marginLeft: 8 }}>· {dates.length} días</span>
                </div>
                {dates.map((d) => (
                  <div key={d} style={styles.dayRow}>
                    <Flame size={14} color="#FF9500" />
                    <span>{new Date(d + "T00:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "short" })}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {loaded && tab === "suplementos" && (
          <div className="fade-in">
            <div style={styles.suppSummaryRow}>
              <div style={{ ...styles.suppSummaryCard, background: "#EAF2FF" }}>
                <Droplet size={18} color="#007AFF" />
                <div style={styles.suppSummaryNum}>{todayProtein}<small>g</small></div>
                <div style={styles.suppSummaryLabel}>Proteína hoy</div>
              </div>
              <div style={{ ...styles.suppSummaryCard, background: "#F1EAFB" }}>
                <Pill size={18} color="#AF52DE" />
                <div style={styles.suppSummaryNum}>{todayCreatine}<small>g</small></div>
                <div style={styles.suppSummaryLabel}>Creatina hoy</div>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.fieldLabel}>SUPLEMENTO</div>
              <div style={styles.segmented}>
                {Object.keys(SUPP_DEFAULTS).map((t) => (
                  <button
                    key={t}
                    onClick={() => { setSuppType(t); setSuppAmount(String(SUPP_DEFAULTS[t])); }}
                    style={{ ...styles.segmentBtn, ...(suppType === t ? styles.segmentBtnActive : {}) }}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <div style={styles.fieldLabel}>CANTIDAD (GRAMOS)</div>
              <input type="number" inputMode="decimal" value={suppAmount} onChange={(e) => setSuppAmount(e.target.value)} style={styles.input} />
              {error && <div style={styles.errorText}>{error}</div>}
              <button onClick={addSupplement} style={{ ...styles.addBtn, background: suppType === "Proteína" ? "#007AFF" : "#AF52DE" }}>
                <Plus size={18} strokeWidth={3} />
                REGISTRAR CONSUMO
              </button>
            </div>

            <div style={styles.sectionLabel}>HISTORIAL</div>
            {supps.length === 0 && <div style={styles.empty}>Aún no has registrado proteína ni creatina.</div>}
            {Object.entries(suppMonthGroups).map(([key, entries]) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={styles.monthLabel}>{new Date(key + "-01").toLocaleDateString("es-ES", { month: "long", year: "numeric" })}</div>
                {entries.map((s) => (
                  <div key={s.id} style={styles.logRow} className="row-enter">
                    {s.type === "Proteína" ? <Droplet size={16} color="#007AFF" /> : <Pill size={16} color="#AF52DE" />}
                    <div style={styles.logMain}>
                      <div style={styles.logExercise}>{s.type}</div>
                      <div style={styles.logDate}>{new Date(s.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                    </div>
                    <span style={{ ...styles.logWeight, color: s.type === "Proteína" ? "#007AFF" : "#AF52DE" }}>{s.amount}<small>g</small></span>
                    <button onClick={() => deleteSupp(s.id)} style={styles.deleteBtn} aria-label="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {loaded && tab === "guia" && (
          <div className="fade-in">
            <div style={styles.filterRow}>
              {guideGroups.map((g) => (
                <button key={g} onClick={() => setGuideFilter(g)} style={{ ...styles.filterChip, ...(guideFilter === g ? styles.filterChipActive : {}) }}>{g}</button>
              ))}
            </div>
            {filteredGuide.map((g) => (
              <div key={g.name} style={styles.guideCard}>
                <div style={styles.guideTop}>
                  <div>
                    <div style={styles.guideName}>{g.name}</div>
                    <div style={styles.guideGrupo}>{g.grupo}</div>
                  </div>
                  <a href={`https://www.tiktok.com/search?q=${encodeURIComponent(g.name + " técnica ejecución gym")}`} target="_blank" rel="noopener noreferrer" style={styles.videoBtn}>
                    <PlayCircle size={16} />
                    VIDEO
                  </a>
                </div>
                <div style={styles.guideEquipo}><Dumbbell size={13} color="#8E8E93" /><span>{g.equipo}</span></div>
                <div style={styles.guideCue}>{g.cue}</div>
              </div>
            ))}
          </div>
        )}
      </main>

      <nav style={styles.tabBar}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={styles.tabBarBtn}>
              <Icon size={21} strokeWidth={active ? 2.4 : 2} color={active ? "#FF9500" : "#8E8E93"} />
              <span style={{ ...styles.tabBarLabel, color: active ? "#FF9500" : "#8E8E93" }}>{t.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

const SYSTEM_FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif";
const MONO_FONT = "'SF Mono', ui-monospace, Menlo, Consolas, monospace";

const styles = {
  app: {
    fontFamily: SYSTEM_FONT,
    background: "#FFFFFF",
    color: "#000000",
    minHeight: "100vh",
    maxWidth: 480,
    margin: "0 auto",
    position: "relative",
    paddingBottom: 86,
  },
  restToast: {
    position: "fixed", top: 14, left: "50%", zIndex: 50,
    display: "flex", alignItems: "center", gap: 9,
    background: "#1C1C1E", color: "#FFFFFF", borderRadius: 999,
    padding: "7px 10px 7px 8px", boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
  },
  restRing: { position: "relative", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  restLabel: { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },
  restBtn: { background: "rgba(255,255,255,0.15)", border: "none", color: "#FFFFFF", fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "5px 9px", cursor: "pointer" },
  restCloseBtn: { background: "none", border: "none", cursor: "pointer", padding: 3, display: "flex" },

  header: { padding: "24px 20px 18px" },
  headerTop: { display: "flex", alignItems: "center", gap: 7, marginBottom: 6 },
  eyebrow: { fontSize: 12, letterSpacing: 1.5, color: "#8E8E93", fontWeight: 600 },
  title: { fontSize: 28, fontWeight: 700, letterSpacing: -0.4, margin: "0 0 16px", color: "#000000" },
  statRow: { display: "flex", gap: 10 },
  statChip: { background: "#F2F2F7", borderRadius: 12, padding: "8px 14px", display: "flex", alignItems: "baseline", gap: 6 },
  statNum: { fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: "#FF9500" },
  statLabel: { fontSize: 13, color: "#8E8E93" },
  main: { padding: "4px 20px 20px" },
  loading: { color: "#8E8E93", textAlign: "center", padding: 40, fontSize: 14 },

  dayPills: { display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" },
  dayPill: {
    position: "relative", flex: 1, background: "#F2F2F7", border: "none", borderRadius: 999,
    color: "#3A3A3C", fontSize: 14, fontWeight: 600, padding: "10px 0", cursor: "pointer", whiteSpace: "nowrap",
  },
  pillDot: { position: "absolute", top: 6, right: 10, width: 6, height: 6, borderRadius: 3 },

  routineHero: { borderRadius: 20, padding: 20, marginBottom: 22, position: "relative" },
  suggestedBadge: { display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "#FFFFFF", padding: "4px 10px", borderRadius: 999, marginBottom: 10 },
  routineHeroTitle: { fontSize: 26, fontWeight: 700, letterSpacing: -0.3, color: "#000000" },
  routineHeroSubtitle: { fontSize: 14, color: "#3A3A3C", marginTop: 2, marginBottom: 16 },
  progressTrack: { height: 8, borderRadius: 4, background: "rgba(0,0,0,0.08)", overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 4, transition: "width 0.3s ease" },
  progressLabel: { fontSize: 12, color: "#3A3A3C", marginTop: 8 },

  sectionLabel: { fontSize: 12, letterSpacing: 1, color: "#8E8E93", fontWeight: 600, marginBottom: 10, marginTop: 4 },

  exCard: { background: "#F7F7F8", borderRadius: 16, marginBottom: 10, overflow: "hidden", border: "1px solid #ECECEC" },
  exCardTop: { width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", gap: 12, padding: "14px 14px", cursor: "pointer" },
  exDot: { width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" },
  exName: { fontSize: 15, fontWeight: 600, color: "#000000" },
  exTarget: { fontSize: 12.5, color: "#8E8E93", marginTop: 2 },
  exExpand: { padding: "0 14px 16px" },
  exCue: { fontSize: 13, color: "#3A3A3C", lineHeight: 1.5, background: "#FFFFFF", border: "1px solid #ECECEC", borderRadius: 12, padding: 12, marginBottom: 12 },

  card: { background: "#F7F7F8", border: "1px solid #ECECEC", borderRadius: 18, padding: 18, marginBottom: 20 },
  fieldLabel: { fontSize: 11.5, letterSpacing: 1, color: "#8E8E93", fontWeight: 600, marginBottom: 6, marginTop: 12 },
  select: { width: "100%", background: "#FFFFFF", border: "1px solid #E5E5EA", borderRadius: 12, color: "#000000", padding: "12px 12px", fontSize: 15 },
  input: { width: "100%", background: "#FFFFFF", border: "1px solid #E5E5EA", borderRadius: 12, color: "#000000", padding: "12px 12px", fontSize: 15, fontFamily: MONO_FONT },
  linkBtn: { background: "none", border: "none", color: "#FF9500", fontSize: 12.5, marginTop: 8, cursor: "pointer", padding: 0, fontWeight: 600 },
  twoCol: { display: "flex", gap: 12 },
  errorText: { color: "#FF3B30", fontSize: 12.5, marginTop: 10 },
  addBtn: { width: "100%", marginTop: 18, border: "none", borderRadius: 12, color: "#FFFFFF", fontWeight: 700, fontSize: 14, letterSpacing: 0.3, padding: "13px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer" },

  empty: { color: "#8E8E93", fontSize: 13.5, padding: "16px 0", lineHeight: 1.5 },
  logRow: { display: "flex", alignItems: "center", background: "#F7F7F8", border: "1px solid #ECECEC", borderRadius: 14, padding: "12px 14px", marginBottom: 8, gap: 10 },
  logMain: { flex: 1, minWidth: 0 },
  logExercise: { fontSize: 15, color: "#000000", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  logDate: { fontSize: 11.5, color: "#8E8E93" },
  logStats: { display: "flex", alignItems: "baseline", gap: 4 },
  logWeight: { fontFamily: MONO_FONT, fontWeight: 700, fontSize: 16, color: "#FF9500" },
  logReps: { fontFamily: MONO_FONT, fontSize: 13, color: "#8E8E93" },
  deleteBtn: { background: "none", border: "none", color: "#C7C7CC", cursor: "pointer", padding: 4 },

  prGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 },
  prCard: { background: "#F7F7F8", border: "1px solid #ECECEC", borderRadius: 16, padding: "14px 14px", textAlign: "left", cursor: "pointer" },
  prCardActive: { border: "1px solid #FF9500", background: "#FFF4E5" },
  prName: { fontSize: 12.5, color: "#8E8E93", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  prValue: { fontFamily: MONO_FONT, fontWeight: 700, fontSize: 22, color: "#000000" },
  prUnit: { fontSize: 12, color: "#8E8E93", marginLeft: 2 },
  prReps: { fontSize: 11.5, color: "#FF9500", marginTop: 4 },
  chartCard: { background: "#F7F7F8", border: "1px solid #ECECEC", borderRadius: 18, padding: 18 },
  chartHeader: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  chartTitle: { fontSize: 15, fontWeight: 600, color: "#000000", textTransform: "capitalize" },

  weekHeader: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginTop: 12, marginBottom: 6 },
  weekHeadCell: { textAlign: "center", fontSize: 11.5, color: "#8E8E93", fontFamily: MONO_FONT },
  calendarGrid: { display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 5 },
  calCell: { aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, color: "#3A3A3C", fontFamily: MONO_FONT, background: "#FFFFFF", border: "1px solid #ECECEC", borderRadius: 8 },
  calCellEmpty: { aspectRatio: "1" },
  calCellTrained: { background: "#FF9500", color: "#FFFFFF", fontWeight: 700, border: "1px solid #FF9500" },
  monthLabel: { fontSize: 14, color: "#000000", fontWeight: 600, marginBottom: 6, textTransform: "capitalize" },
  dayRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#3A3A3C", padding: "6px 0", textTransform: "capitalize" },

  suppSummaryRow: { display: "flex", gap: 10, marginBottom: 18 },
  suppSummaryCard: { flex: 1, borderRadius: 16, padding: "14px 14px" },
  suppSummaryNum: { fontFamily: MONO_FONT, fontWeight: 700, fontSize: 22, color: "#000000", marginTop: 8 },
  suppSummaryLabel: { fontSize: 12, color: "#3A3A3C", marginTop: 2 },
  segmented: { display: "flex", background: "#EFEFF0", borderRadius: 12, padding: 3, marginBottom: 4 },
  segmentBtn: { flex: 1, background: "none", border: "none", borderRadius: 9, padding: "8px 0", fontSize: 13.5, fontWeight: 600, color: "#3A3A3C", cursor: "pointer" },
  segmentBtnActive: { background: "#FFFFFF", color: "#000000", boxShadow: "0 1px 3px rgba(0,0,0,0.12)" },

  filterRow: { display: "flex", gap: 8, overflowX: "auto", paddingBottom: 14, marginBottom: 4 },
  filterChip: { background: "#F2F2F7", border: "none", borderRadius: 999, color: "#3A3A3C", fontSize: 12.5, fontWeight: 600, padding: "7px 15px", whiteSpace: "nowrap", cursor: "pointer", flexShrink: 0 },
  filterChipActive: { background: "#FF9500", color: "#FFFFFF" },
  guideCard: { background: "#F7F7F8", border: "1px solid #ECECEC", borderRadius: 16, padding: 15, marginBottom: 10 },
  guideTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
  guideName: { fontSize: 16, fontWeight: 600, color: "#000000" },
  guideGrupo: { fontSize: 11.5, color: "#FF9500", fontWeight: 600, marginTop: 2 },
  videoBtn: { display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#FF9500", border: "1px solid #FF9500", borderRadius: 999, padding: "6px 11px", textDecoration: "none", flexShrink: 0, width: "fit-content" },
  guideEquipo: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#8E8E93", marginTop: 9 },
  guideCue: { fontSize: 13.5, color: "#3A3A3C", marginTop: 7, lineHeight: 1.55 },

  weightCard: { background: "#F7F7F8", border: "1px solid #ECECEC", borderRadius: 18, padding: 18, marginBottom: 18 },
  weightTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  weightNow: { fontFamily: MONO_FONT, fontWeight: 700, fontSize: 26, color: "#000000" },
  weightSub: { fontSize: 12.5, color: "#8E8E93", marginTop: 4, lineHeight: 1.5 },
  notifBtn: { width: "100%", marginTop: 10, background: "none", border: "1px solid #E5E5EA", borderRadius: 12, color: "#3A3A3C", fontSize: 12.5, fontWeight: 600, padding: "10px 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" },
  notifActive: { display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#34C759", fontWeight: 600, marginTop: 10, justifyContent: "center" },

  modalOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { background: "#FFFFFF", borderRadius: 22, padding: "26px 22px", width: "100%", maxWidth: 340, textAlign: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.25)" },
  modalTitle: { fontSize: 19, fontWeight: 700, color: "#000000", marginTop: 10 },
  modalSubtitle: { fontSize: 13.5, color: "#8E8E93", marginTop: 6, lineHeight: 1.5 },
  modalSkip: { width: "100%", background: "none", border: "none", color: "#8E8E93", fontSize: 13, fontWeight: 600, marginTop: 12, cursor: "pointer", padding: "8px 0" },

  tabBar: {
    position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480,
    display: "flex", background: "rgba(255,255,255,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
    borderTop: "0.5px solid #E5E5EA", padding: "8px 2px calc(8px + env(safe-area-inset-bottom, 0px))",
  },
  tabBarBtn: { flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "4px 0", cursor: "pointer" },
  tabBarLabel: { fontSize: 10, fontWeight: 600 },
};
