// Categorías y reglas de auto-clasificación por palabras clave del comercio.
// `scope` es la sugerencia por defecto (casa | personal) — el usuario siempre confirma.

export const CATEGORIES = [
  { id: "mercado", name: "Mercado", emoji: "🛒", scope: "casa",
    keys: ["exito", "éxito", "carulla", "d1 ", "tiendas d1", "koba", "ara ", "jeronimo martins", "olimpica", "olímpica", "jumbo", "metro ", "pricesmart", "makro", "isimo", "justo y bueno", "surtimax", "colsubsidio", "fruver", "merqueo", "farmatodo mercado"] },
  { id: "servicios", name: "Servicios", emoji: "💡", scope: "casa",
    keys: ["epm", "enel", "codensa", "vanti", "gas natural", "acueducto", "emcali", "air-e", "aire ", "celsia", "afinia", "essa", "claro", "movistar", "tigo", "etb", "une ", "directv", "wom", "administracion", "administración", "conjunto", "edificio"] },
  { id: "hogar", name: "Hogar", emoji: "🏠", scope: "casa",
    keys: ["homecenter", "sodimac", "ikea", "easy", "tugo", "jamar", "falabella hogar", "ferreteria", "ferretería", "lavanderia", "lavandería"] },
  { id: "restaurantes", name: "Comida", emoji: "🍽️", scope: "personal",
    keys: ["rappi", "ifood", "didi food", "restaurante", "rest ", "crepes", "juan valdez", "starbucks", "tostao", "oma", "mcdonald", "burger", "kfc", "frisby", "el corral", "presto", "domino", "pizza", "sushi", "wok", "andres carne", "cafe", "café", "panaderia", "panadería", "bar "] },
  { id: "transporte", name: "Transporte", emoji: "🚗", scope: "personal",
    keys: ["uber", "didi", "cabify", "indriver", "beat", "picap", "terpel", "primax", "esso", "texaco", "biomax", "mobil", "peaje", "parqueadero", "parking", "flypass", "gopass", "transmilenio", "metro de medellin", "tullave", "civica"] },
  { id: "suscripciones", name: "Suscripciones", emoji: "📺", scope: "personal",
    keys: ["netflix", "spotify", "apple.com", "apple com", "icloud", "google", "youtube", "disney", "hbo", "max.com", "prime video", "amazon prime", "chatgpt", "openai", "anthropic", "claude", "microsoft", "adobe", "canva", "paramount", "crunchyroll"] },
  { id: "salud", name: "Salud", emoji: "🩺", scope: "personal",
    keys: ["drogueria", "droguería", "cruz verde", "farmatodo", "colsanitas", "sura", "compensar", "sanitas", "coomeva", "odontolog", "clinica", "clínica", "hospital", "laboratorio", "optica", "óptica", "gimnasio", "smart fit", "bodytech", "spinning"] },
  { id: "compras", name: "Compras", emoji: "🛍️", scope: "personal",
    keys: ["falabella", "amazon", "mercadolibre", "mercado libre", "zara", "h&m", "arturo calle", "studio f", "adidas", "nike", "ktronix", "alkosto", "panamericana", "temu", "shein", "aliexpress", "mac center", "ishop"] },
  { id: "viajes", name: "Viajes", emoji: "✈️", scope: "personal",
    keys: ["avianca", "latam", "wingo", "jetsmart", "airbnb", "booking", "hotel", "despegar", "expedia"] },
  { id: "efectivo", name: "Efectivo", emoji: "💵", scope: "personal", keys: ["retiro", "cajero", "atm"] },
  { id: "otros", name: "Otros", emoji: "•", scope: "personal", keys: [] },
];

export const INCOME_CATEGORY = { id: "ingreso", name: "Ingreso", emoji: "💰" };
export const TRANSFER_CATEGORY = { id: "movimiento", name: "Entre mis cuentas", emoji: "🔁" };

export const catById = (id) =>
  CATEGORIES.find((c) => c.id === id) ||
  (id === "ingreso" ? INCOME_CATEGORY : id === "movimiento" ? TRANSFER_CATEGORY : CATEGORIES.at(-1));

const norm = (s) =>
  ` ${(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")} `;

export function guessCategory(merchant) {
  const m = norm(merchant);
  for (const c of CATEGORIES) {
    if (c.keys.some((k) => m.includes(norm(k).slice(1, -1)))) return c.id;
  }
  return "otros";
}

// Clave estable de comercio para "recordar" decisiones (Personal/Casa, categoría).
export const merchantKey = (merchant) =>
  norm(merchant).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
