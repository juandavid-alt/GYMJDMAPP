// Formato Colombia: $ 1.300.000 · DD/MM/AAAA

const cop = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });

export function pesos(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const v = Math.round(n);
  return `${v < 0 ? "−" : ""}$ ${cop.format(Math.abs(v))}`;
}

export function pesosCortos(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e9) return `${s}$ ${(a / 1e9).toLocaleString("es-CO", { maximumFractionDigits: 1 })} MM`;
  if (a >= 1e6) return `${s}$ ${(a / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
  if (a >= 1e3) return `${s}$ ${(a / 1e3).toLocaleString("es-CO", { maximumFractionDigits: 0 })} mil`;
  return pesos(n);
}

export function numero(n: number, dec = 0) {
  return n.toLocaleString("es-CO", { maximumFractionDigits: dec, minimumFractionDigits: dec });
}

export function pct(n: number, dec = 1) {
  return `${(n * 100).toLocaleString("es-CO", { maximumFractionDigits: dec, minimumFractionDigits: dec })} %`;
}

export function fecha(s: string | null | undefined): string {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function fechaHora(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Oculta números de cuenta y documentos en vistas generales. */
export function enmascarar(s: string | null | undefined, visibles = 4): string {
  if (!s) return "—";
  return `•••• ${s.slice(-visibles)}`;
}

export function iniciales(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 2 ? p[2]?.[0] ?? "" : p[1]?.[0] ?? "")).toUpperCase();
}

export function nombreCorto(nombre: string) {
  const p = nombre.trim().split(/\s+/);
  const titulo = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();
  if (p.length <= 2) return p.map(titulo).join(" ");
  return `${titulo(p[0])} ${titulo(p.length >= 4 ? p[2] : p[1])}`;
}

export function titulo(s: string) {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 2 || /^[a-z]/.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Color determinístico para avatares (paleta de sistema Apple). */
const AVATAR = ["#FF9F0A", "#30D158", "#64D2FF", "#BF5AF2", "#FF375F", "#5E5CE6", "#FFD60A", "#0A84FF", "#AC8E68", "#66D4CF"];
export function colorAvatar(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR[h % AVATAR.length];
}

export function parseNumero(s: string): number {
  const limpio = s.replace(/[^\d,-]/g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : 0;
}
