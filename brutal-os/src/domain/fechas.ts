// Fechas como cadenas ISO "AAAA-MM-DD" para evitar desfases de zona horaria.
// En pantalla siempre se muestran como DD/MM/AAAA.

const pad = (n: number) => String(n).padStart(2, "0");

export function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function parse(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

let hoyFijo: string | null = null;
/** Solo para pruebas. */
export function fijarHoy(s: string | null) {
  hoyFijo = s;
}

export function hoy(): string {
  if (hoyFijo) return hoyFijo;
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDias(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Suma meses respetando fin de mes (31/01 + 1 mes = 28/02). */
export function addMeses(s: string, n: number): string {
  const d = parse(s);
  const dia = d.getUTCDate();
  const objetivo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const ultimo = new Date(Date.UTC(objetivo.getUTCFullYear(), objetivo.getUTCMonth() + 1, 0)).getUTCDate();
  objetivo.setUTCDate(Math.min(dia, ultimo));
  return iso(objetivo);
}

export function diffDias(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86_400_000);
}

export function finDeMes(anio: number, mes: number): string {
  return iso(new Date(Date.UTC(anio, mes, 0)));
}

export function inicioDeMes(anio: number, mes: number): string {
  return `${anio}-${pad(mes)}-01`;
}

export function mesId(anio: number, mes: number): string {
  return `${anio}-${pad(mes)}`;
}

export function mesDe(s: string): { anio: number; mes: number } {
  return { anio: Number(s.slice(0, 4)), mes: Number(s.slice(5, 7)) };
}

export function mesAnterior(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
}

export function mesSiguiente(anio: number, mes: number): { anio: number; mes: number } {
  return mes === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: mes + 1 };
}

/** Últimos n meses terminando en (anio, mes), en orden cronológico. */
export function ultimosMeses(anio: number, mes: number, n: number) {
  const out: { anio: number; mes: number }[] = [];
  let cur = { anio, mes };
  for (let i = 0; i < n; i++) {
    out.unshift(cur);
    cur = mesAnterior(cur.anio, cur.mes);
  }
  return out;
}

/** Día comercial (base 30): el 31 cuenta como 30 y el último día de febrero también. */
function dia30(s: string): number {
  const d = parse(s);
  const dia = d.getUTCDate();
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return dia === ultimo ? 30 : Math.min(dia, 30);
}

/**
 * Días con contrato vigente dentro del mes en base 30 (prorrateo por ingreso o retiro a mitad
 * de mes). inicio y salida inclusive.
 */
export function diasVigentesEnMes(anio: number, mes: number, inicio: string, salida?: string | null): number {
  const ini = inicioDeMes(anio, mes);
  const fin = finDeMes(anio, mes);
  if (inicio > fin) return 0;
  if (salida && salida < ini) return 0;
  const desde = inicio > ini ? dia30(inicio) : 1;
  const hasta = salida && salida < fin ? dia30(salida) : 30;
  return Math.max(0, hasta - desde + 1);
}

export function edad(nacimiento: string, ref = hoy()): number {
  const n = parse(nacimiento);
  const r = parse(ref);
  let e = r.getUTCFullYear() - n.getUTCFullYear();
  if (r.getUTCMonth() < n.getUTCMonth() || (r.getUTCMonth() === n.getUTCMonth() && r.getUTCDate() < n.getUTCDate())) e--;
  return e;
}

export const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** N-ésimo día hábil del mes (sin sábados, domingos ni festivos). */
export function diaHabil(anio: number, mes: number, n: number, festivos: string[]): string {
  let d = inicioDeMes(anio, mes);
  let cuenta = 0;
  for (;;) {
    const dow = parse(d).getUTCDay();
    if (dow !== 0 && dow !== 6 && !festivos.includes(d)) {
      cuenta++;
      if (cuenta === n) return d;
    }
    d = addDias(d, 1);
  }
}
