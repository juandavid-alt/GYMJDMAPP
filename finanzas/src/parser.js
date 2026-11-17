// Convierte el texto de una notificación bancaria (SMS, push o correo) en un movimiento.
// Funciona con los formatos típicos de bancos colombianos (Bancolombia, Davivienda, BBVA,
// Banco de Bogotá, Nu, Falabella, Scotiabank Colpatria, Lulo, Nequi...). Es heurístico:
// si algo no se reconoce, la app te deja corregirlo antes de guardar.
import { guessCategory } from "./categories.js";

// "$45.900,00" | "$45,900.00" | "COP 45.900" | "$ 1.250.000" -> número
export function parseAmount(raw) {
  let s = raw.replace(/[^\d.,]/g, "");
  if (!s) return null;
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  const lastSep = Math.max(lastDot, lastComma);
  const decimals = lastSep >= 0 ? s.length - lastSep - 1 : 0;
  if (lastSep >= 0 && decimals <= 2 && decimals > 0) {
    // el último separador es decimal
    const int = s.slice(0, lastSep).replace(/[.,]/g, "");
    return Number(`${int}.${s.slice(lastSep + 1)}`);
  }
  return Number(s.replace(/[.,]/g, ""));
}

const AMOUNT_RE = /(?:\$|cop|usd|us\$)\s?([\d][\d.,]*)/i;

const RULES = [
  // [regex, tipo]
  [/pag\w*.{0,30}\b(?:a|de) (?:tu|su) (?:t\.? ?cred|tarjeta de cr[eé]dito|tc\b)/i, "movimiento"],
  [/transferencia (?:a|entre) (?:tus|sus) (?:propias )?cuentas|traslado entre cuentas/i, "movimiento"],
  [/recibi(?:ste|o|ó)|abono|consignaci[oó]n|te (?:enviaron|transfirieron)|n[oó]mina|pago de n[oó]mina|reembolso|devoluci[oó]n|reversi[oó]n/i, "ingreso"],
  [/retir(?:o|aste)|avance/i, "gasto"],
  [/compr(?:a|aste)|pag(?:o|aste)|transfer|env(?:i|í)aste|d[eé]bito autom|cargo|cobro/i, "gasto"],
];

export function parseNotification(text) {
  if (!text || !text.trim()) return null;
  const t = text.replace(/\s+/g, " ").trim();

  const am = t.match(AMOUNT_RE);
  if (!am) return null;
  const amount = parseAmount(am[1]);
  if (!amount) return null;
  const currency = /usd|us\$/i.test(am[0]) ? "USD" : "COP";

  let type = "gasto";
  for (const [re, ty] of RULES) if (re.test(t)) { type = ty; break; }

  // Medio de pago
  let method = null;
  if (/t\.? ?cred|cr[eé]dito|tc\b|visa|mastercard|amex|master\b|tarjeta nu\b|rappicard/i.test(t)) method = "credito";
  if (/t\.? ?deb|d[eé]bito|cta\.?|cuenta|ahorros|corriente|nequi|daviplata|pse/i.test(t)) method = method || "debito";
  const last4 = (t.match(/(?:\*|x{2,}|terminada en |final(?:izada)? en |no\.? ?)\s?(\d{4})\b/i) || [])[1] || null;

  // Comercio: lo que viene después de " en " / " a " hasta un delimitador
  let merchant = "";
  const mm =
    t.match(/\$\s?[\d.,]+\s+(?:en|a)\s+(.+?)(?=\s+(?:con|desde|el|a las|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2})\b|[.,;](?:\s|$)|$)/i) ||
    t.match(/\b(?:en|comercio:?)\s+([A-Z0-9][A-Z0-9 &*.\-']{2,40})/);
  if (mm) merchant = mm[1].trim().replace(/[.\s]+$/, "");
  if (type === "ingreso") {
    const from = t.match(/\bde\s+([A-Z][A-Za-z0-9 &.\-']{2,40}?)(?=\s+(?:en|a|por|el)\b|[.,]|$)/);
    merchant = from ? from[1].trim() : "";
  }
  if (type === "movimiento") merchant = "Pago tarjeta de crédito";
  if (!merchant && type === "gasto" && /retir/i.test(t)) merchant = "Retiro de efectivo";
  if (!merchant) merchant = type === "ingreso" ? "Ingreso" : "Movimiento";
  merchant = merchant.length > 40 ? merchant.slice(0, 40) : merchant;

  // Fecha y hora si vienen en el texto
  let date = new Date();
  const dm = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (dm) {
    const y = dm[3].length === 2 ? 2000 + +dm[3] : +dm[3];
    const d = new Date(y, +dm[2] - 1, +dm[1]);
    if (!isNaN(d)) date = d;
  }
  const hm = t.match(/(\d{1,2}):(\d{2})/);
  if (hm) date.setHours(+hm[1], +hm[2], 0, 0);

  const bank = (t.match(/bancolombia|davivienda|bbva|banco de bogot[aá]|nu\b|nubank|falabella|colpatria|scotiabank|lulo|nequi|daviplata|itau|itaú|av villas|banco popular|occidente|rappicard|rappipay/i) || [])[0] || null;

  return {
    amount, currency, type, merchant, method, last4,
    bank: bank ? (bank.length <= 4 ? bank.toUpperCase() : bank[0].toUpperCase() + bank.slice(1).toLowerCase()) : null,
    date: date.toISOString(),
    category: type === "gasto" ? guessCategory(merchant + " " + t) : type,
    raw: text,
  };
}
