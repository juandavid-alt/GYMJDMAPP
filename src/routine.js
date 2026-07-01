// Catálogo de ejercicios, guía técnica y generador de rutina personalizada.

export const EXERCISES = [
  "Press banca plano", "Press inclinado mancuernas", "Press militar",
  "Elevaciones laterales", "Fondos en paralelas", "Extensión tríceps polea", "Press francés",
  "Dominadas", "Remo con barra", "Remo en polea baja",
  "Curl con barra", "Curl martillo", "Curl concentrado",
  "Sentadilla", "Prensa", "Peso muerto rumano", "Curl femoral", "Extensión cuádriceps", "Elevación de talones",
  "Curl 21s", "Curl inclinado mancuernas", "Curl predicador",
  "Press cerrado", "Extensión tríceps overhead", "Patada de tríceps"
];

export const GUIDE = [
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

// Ejercicios compuestos (multiarticulares) -> menos reps, más peso.
const COMPOUNDS = new Set([
  "Press banca plano", "Press inclinado mancuernas", "Press militar", "Fondos en paralelas",
  "Press cerrado", "Dominadas", "Remo con barra", "Remo en polea baja",
  "Sentadilla", "Prensa", "Peso muerto rumano",
]);

// Plantillas de días (solo nombres de ejercicios del catálogo).
const PUSH = { title: "Empuje", subtitle: "Pecho · Hombro · Tríceps", color: "#FF3B30",
  ex: ["Press banca plano", "Press inclinado mancuernas", "Press militar", "Elevaciones laterales", "Fondos en paralelas", "Extensión tríceps polea", "Press francés"] };
const PULL = { title: "Tracción", subtitle: "Espalda · Bíceps", color: "#32ADE6",
  ex: ["Dominadas", "Remo con barra", "Remo en polea baja", "Curl con barra", "Curl martillo", "Curl concentrado"] };
const LEGS = { title: "Piernas", subtitle: "Cuádriceps · Isquiotibiales", color: "#34C759",
  ex: ["Sentadilla", "Prensa", "Peso muerto rumano", "Curl femoral", "Extensión cuádriceps", "Elevación de talones"] };
const SHOULDERS = { title: "Hombros", subtitle: "Deltoides · Trapecio", color: "#FF9F0A",
  ex: ["Press militar", "Elevaciones laterales", "Fondos en paralelas", "Extensión tríceps polea"] };
const ARMS = { title: "Brazos", subtitle: "Bíceps · Tríceps", color: "#AF52DE",
  ex: ["Curl 21s", "Curl inclinado mancuernas", "Curl predicador", "Press cerrado", "Extensión tríceps overhead", "Patada de tríceps", "Elevaciones laterales"] };

// Split según días por semana.
const SPLITS = {
  3: [PUSH, PULL, LEGS],
  4: [PULL, PUSH, LEGS, ARMS],
  5: [PUSH, PULL, LEGS, SHOULDERS, ARMS],
  6: [PUSH, PULL, LEGS, PUSH, PULL, LEGS],
};

// Esquema de series/reps según objetivo.
const GOAL_SCHEME = {
  fuerza:       { compound: { sets: 5, reps: "4-6" },  isolation: { sets: 3, reps: "8-10" },  rest: 165 },
  hipertrofia:  { compound: { sets: 4, reps: "6-10" }, isolation: { sets: 3, reps: "10-12" }, rest: 105 },
  perder_grasa: { compound: { sets: 3, reps: "10-12" },isolation: { sets: 3, reps: "12-15" }, rest: 60 },
  mantener:     { compound: { sets: 3, reps: "8-10" }, isolation: { sets: 3, reps: "10-12" }, rest: 90 },
};

const DEFAULT_GOAL = "hipertrofia";

function scheme(goal) {
  return GOAL_SCHEME[goal] || GOAL_SCHEME[DEFAULT_GOAL];
}

// Descanso recomendado (segundos) según objetivo + nivel.
export function restSecondsFor(profile) {
  const s = scheme(profile?.goal);
  let rest = s.rest;
  if (profile?.experience === "principiante") rest += 15;
  return rest;
}

// Genera la rutina (array de días) personalizada para el perfil.
export function buildRoutine(profile) {
  const days = Number(profile?.days_per_week) || 4;
  const split = SPLITS[days] || SPLITS[4];
  const s = scheme(profile?.goal);
  const exp = profile?.experience || "intermedio";

  return split.map((day, i) => ({
    id: i + 1,
    title: day.title,
    subtitle: day.subtitle,
    color: day.color,
    exercises: day.ex.map((name) => {
      const base = COMPOUNDS.has(name) ? s.compound : s.isolation;
      let sets = base.sets;
      if (exp === "principiante") sets = Math.min(sets, 3);
      if (exp === "avanzado" && COMPOUNDS.has(name)) sets += 1;
      return { name, sets, reps: base.reps };
    }),
  }));
}
