import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, catById, merchantKey, guessCategory } from "./categories.js";
import { parseNotification } from "./parser.js";
import { load, save, uid, copValue, sync, push } from "./store.js";

// ---------- helpers ----------
const fmt = (n) => "$" + Math.round(n).toLocaleString("es-CO");
const fmtShort = (n) =>
  Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 }) + " M" : fmt(n);
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const monthKey = (d) => { const x = new Date(d); return x.getFullYear() * 12 + x.getMonth(); };
const dayLabel = (d) => {
  const x = new Date(d), t = new Date();
  const diff = Math.round((new Date(t.toDateString()) - new Date(x.toDateString())) / 864e5);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Ayer";
  return x.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
};
const timeLabel = (d) => new Date(d).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
const METHOD = { credito: "Crédito", debito: "Débito", efectivo: "Efectivo" };
const SCOPE = { personal: { name: "Personal", emoji: "👤" }, casa: { name: "Casa", emoji: "🏠" } };
const live = (t) => !t.deleted;

function useToast() {
  const [msg, setMsg] = useState(null);
  const t = useRef();
  const show = (m) => { setMsg(m); clearTimeout(t.current); t.current = setTimeout(() => setMsg(null), 2200); };
  return [msg, show];
}

// ---------- App ----------
export default function App() {
  const [state, setState] = useState(load);
  const [tab, setTab] = useState("resumen");
  const [editing, setEditing] = useState(null); // null | "new" | tx
  const [classifying, setClassifying] = useState(false);
  const [toast, showToast] = useToast();
  const pushTimer = useRef();

  const update = (fn) =>
    setState((s) => {
      const n = typeof fn === "function" ? fn(s) : fn;
      save(n);
      clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => push(n).catch(() => {}), 1200);
      return n;
    });

  const doSync = async (silent) => {
    if (!state.settings.token) return;
    try {
      const { state: n, imported } = await sync(load());
      save(n);
      setState(n);
      if (imported) { showToast(`${imported} movimiento${imported > 1 ? "s" : ""} nuevo${imported > 1 ? "s" : ""}`); setClassifying(true); }
      else if (!silent) showToast("Todo al día");
    } catch (e) {
      if (!silent) showToast(e.message || "Sin conexión");
    }
  };

  useEffect(() => {
    doSync(true);
    const onVis = () => document.visibilityState === "visible" && doSync(true);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const txs = useMemo(() => state.txs.filter(live).sort((a, b) => new Date(b.date) - new Date(a.date)), [state.txs]);
  const pending = txs.filter((t) => t.type === "gasto" && !t.scope);

  const upsertTx = (tx, remember) =>
    update((s) => {
      const rules = { ...s.rules };
      if (remember && tx.type === "gasto") rules[merchantKey(tx.merchant)] = { scope: tx.scope, category: tx.category };
      const others = s.txs.filter((t) => t.id !== tx.id);
      return { ...s, rules, txs: [...others, { ...tx, u: Date.now() }] };
    });
  const deleteTx = (tx) => update((s) => ({ ...s, txs: s.txs.map((t) => (t.id === tx.id ? { ...t, deleted: true, u: Date.now() } : t)) }));

  return (
    <div className="app">
      {tab === "resumen" && (
        <Summary state={state} txs={txs} pending={pending} onAdd={() => setEditing("new")} onClassify={() => setClassifying(true)} />
      )}
      {tab === "movimientos" && (
        <Movements state={state} txs={txs} onAdd={() => setEditing("new")} onOpen={setEditing} pendingCount={pending.length} onClassify={() => setClassifying(true)} />
      )}
      {tab === "ajustes" && <Settings state={state} update={update} onSync={() => doSync(false)} showToast={showToast} />}

      <TabBar tab={tab} setTab={setTab} badge={pending.length} />

      {editing && (
        <TxSheet
          tx={editing === "new" ? null : editing}
          rules={state.rules}
          onClose={() => setEditing(null)}
          onSave={(tx, remember) => { upsertTx(tx, remember); setEditing(null); showToast("Guardado"); }}
          onDelete={(tx) => { deleteTx(tx); setEditing(null); showToast("Eliminado"); }}
        />
      )}
      {classifying && pending.length > 0 && (
        <ClassifySheet
          queue={pending}
          rate={state.settings.usdRate}
          onClose={() => setClassifying(false)}
          onPick={(tx, scope, remember) => upsertTx({ ...tx, scope, auto: false }, remember)}
          onSkipAsTransfer={(tx) => upsertTx({ ...tx, type: "movimiento", category: "movimiento", scope: null })}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

// ---------- Resumen ----------
function Summary({ state, txs, pending, onAdd, onClassify }) {
  const now = new Date();
  const [mk, setMk] = useState(monthKey(now));
  const [scopeFilter, setScopeFilter] = useState("todo");
  const rate = state.settings.usdRate;
  const y = Math.floor(mk / 12), m = mk % 12;
  const inMonth = txs.filter((t) => monthKey(t.date) === mk);
  const gastos = inMonth.filter((t) => t.type === "gasto");
  const sum = (arr) => arr.reduce((a, t) => a + copValue(t, rate), 0);
  const total = sum(gastos);
  const ingresos = sum(inMonth.filter((t) => t.type === "ingreso"));
  const byScope = { personal: sum(gastos.filter((t) => t.scope === "personal")), casa: sum(gastos.filter((t) => t.scope === "casa")) };

  const isCurrent = mk === monthKey(now);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const dayOfMonth = isCurrent ? now.getDate() : daysInMonth;
  const daysLeft = daysInMonth - dayOfMonth + 1;
  const monthProgress = dayOfMonth / daysInMonth;

  // Mismo punto del mes anterior, para comparar justo
  const prev = txs.filter((t) => t.type === "gasto" && monthKey(t.date) === mk - 1 && new Date(t.date).getDate() <= dayOfMonth);
  const prevTotal = sum(prev);
  const delta = prevTotal ? (total - prevTotal) / prevTotal : null;

  const filtered = scopeFilter === "todo" ? gastos : gastos.filter((t) => t.scope === scopeFilter);
  const byCat = Object.entries(
    filtered.reduce((acc, t) => ((acc[t.category] = (acc[t.category] || 0) + copValue(t, rate)), acc), {})
  ).sort((a, b) => b[1] - a[1]);
  const maxCat = byCat[0]?.[1] || 1;
  const credito = sum(gastos.filter((t) => t.method === "credito"));

  const insights = [];
  for (const s of ["personal", "casa"]) {
    const b = state.budgets[s];
    if (!b) continue;
    const used = byScope[s] / b;
    if (used > 1) insights.push(["⚠️", `${SCOPE[s].name}: te pasaste ${fmt(byScope[s] - b)} del presupuesto.`]);
    else if (isCurrent && used > monthProgress + 0.1)
      insights.push(["🐢", `${SCOPE[s].name} va rápido: llevas ${Math.round(used * 100)}% del presupuesto y solo ${Math.round(monthProgress * 100)}% del mes.`]);
  }
  if (ingresos > 0) {
    const ahorro = (ingresos - total) / ingresos;
    insights.push([ahorro >= 0.2 ? "🌱" : ahorro >= 0 ? "💡" : "🔻",
      ahorro >= 0 ? `Tasa de ahorro: ${Math.round(ahorro * 100)}% de tus ingresos.${ahorro < 0.2 ? " La meta sana es 20% o más." : ""}` : `Gastaste ${fmt(-ahorro * ingresos)} más de lo que entró.`]);
  }
  if (credito > 0) insights.push(["💳", `${fmt(credito)} fueron con tarjeta de crédito: ese dinero ya está comprometido para el próximo pago.`]);
  const subs = sum(gastos.filter((t) => t.category === "suscripciones"));
  if (subs > 0) insights.push(["📺", `Suscripciones: ${fmt(subs)} este mes (${fmt(subs * 12)} al año). ¿Usas todas?`]);

  return (
    <>
      <div className="header">
        <div>
          <div className="sub">{now.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</div>
          <h1>Resumen</h1>
        </div>
        <button className="iconbtn" onClick={onAdd} aria-label="Agregar movimiento">+</button>
      </div>

      {pending.length > 0 && (
        <button className="banner" onClick={onClassify}>
          <span className="pulse" />
          <div className="grow" style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{pending.length} por clasificar</div>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>¿Personal o Casa? Toma 5 segundos.</div>
          </div>
          <span className="chev" style={{ color: "var(--text3)", fontSize: 20 }}>›</span>
        </button>
      )}

      <div className="month">
        <button onClick={() => setMk(mk - 1)} aria-label="Mes anterior">‹</button>
        <span>{MONTHS[m]} {y}</span>
        <button onClick={() => setMk(mk + 1)} disabled={isCurrent} aria-label="Mes siguiente">›</button>
      </div>

      <div className="card hero">
        <div className="label">Gastado en {MONTHS[m].toLowerCase()}</div>
        <div className="big num">{fmt(total)}</div>
        <div className="delta">
          {delta === null ? `${gastos.length} movimientos` : (
            <span>
              <span style={{ color: delta > 0 ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
                {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}%
              </span>{" "}vs. mismo punto del mes pasado
            </span>
          )}
        </div>
        {ingresos > 0 && (
          <div className="delta" style={{ marginTop: 6 }}>Ingresos <b className="num" style={{ color: "var(--green)" }}>{fmt(ingresos)}</b></div>
        )}
      </div>

      <div className="split">
        {["personal", "casa"].map((s) => {
          const b = state.budgets[s];
          const pct = b ? Math.min(1, byScope[s] / b) : 0;
          const over = b && byScope[s] > b;
          return (
            <button key={s} className="card scope-card" onClick={() => setScopeFilter(scopeFilter === s ? "todo" : s)}
              style={{ outline: scopeFilter === s ? `2px solid var(--${s})` : "none" }}>
              <div className="dot" style={{ background: `var(--${s})` }}>{SCOPE[s].emoji}</div>
              <div className="name">{SCOPE[s].name}</div>
              <div className="amt num">{fmt(byScope[s])}</div>
              {b ? (
                <>
                  <div className="bar"><i style={{ width: `${pct * 100}%`, background: over ? "var(--red)" : `var(--${s})` }} /></div>
                  <div className="hint">
                    {over ? <span style={{ color: "var(--red)" }}>Excedido {fmtShort(byScope[s] - b)}</span>
                      : <>Quedan {fmtShort(b - byScope[s])}{isCurrent && <><br />{fmtShort((b - byScope[s]) / daysLeft)}/día</>}</>}
                  </div>
                </>
              ) : (
                <div className="hint">{total ? Math.round((byScope[s] / total) * 100) : 0}% del gasto · sin presupuesto</div>
              )}
            </button>
          );
        })}
      </div>

      {insights.length > 0 && (
        <>
          <div className="section-title">Para tener en cuenta</div>
          <div className="group">
            {insights.map(([e, t], i) => <div key={i} className="insight"><span>{e}</span><span>{t}</span></div>)}
          </div>
        </>
      )}

      <div className="section-title">
        En qué se va {scopeFilter !== "todo" && <>· {SCOPE[scopeFilter].name}</>}
      </div>
      {byCat.length === 0 ? (
        <div className="group"><div className="empty"><div className="e">🌤️</div>Sin gastos este mes.<br />Toca <b>+</b> o conecta tu banco en Ajustes.</div></div>
      ) : (
        <div className="group">
          {byCat.map(([id, v]) => {
            const c = catById(id);
            return (
              <div key={id} className="row">
                <div className="avatar">{c.emoji}</div>
                <div className="grow">
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17 }}>
                    <span>{c.name}</span><span className="num">{fmt(v)}</span>
                  </div>
                  <div className="bar" style={{ marginTop: 7 }}>
                    <i style={{ width: `${(v / maxCat) * 100}%`, background: scopeFilter === "todo" ? "var(--indigo)" : `var(--${scopeFilter})` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------- Movimientos ----------
function Movements({ state, txs, onAdd, onOpen, pendingCount, onClassify }) {
  const [filter, setFilter] = useState("todo");
  const [q, setQ] = useState("");
  const list = txs.filter((t) => {
    if (filter === "pendiente") { if (!(t.type === "gasto" && !t.scope)) return false; }
    else if (filter !== "todo" && t.scope !== filter) return false;
    if (q && !`${t.merchant} ${catById(t.category).name} ${t.note || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const groups = [];
  for (const t of list) {
    const k = new Date(t.date).toDateString();
    if (!groups.length || groups.at(-1).k !== k) groups.push({ k, d: t.date, items: [] });
    groups.at(-1).items.push(t);
  }
  return (
    <>
      <div className="header">
        <h1>Movimientos</h1>
        <button className="iconbtn" onClick={onAdd} aria-label="Agregar movimiento">+</button>
      </div>
      <input className="search" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="seg">
        {[["todo", "Todos"], ["personal", "Personal"], ["casa", "Casa"], ["pendiente", `Pendientes${pendingCount ? ` (${pendingCount})` : ""}`]].map(([k, l]) => (
          <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {filter === "pendiente" && pendingCount > 0 && (
        <button className="btn" style={{ margin: "6px 0 4px" }} onClick={onClassify}>Clasificar ahora</button>
      )}
      {groups.length === 0 && <div className="empty"><div className="e">🧾</div>No hay movimientos aquí.</div>}
      {groups.map((g) => (
        <div key={g.k}>
          <div className="section-title" style={{ textTransform: "none", fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            {dayLabel(g.d).replace(/^./, (c) => c.toUpperCase())}
          </div>
          <div className="group">
            {g.items.map((t) => <TxRow key={t.id} t={t} rate={state.settings.usdRate} onClick={() => onOpen(t)} />)}
          </div>
        </div>
      ))}
    </>
  );
}

function TxRow({ t, rate, onClick }) {
  const c = catById(t.category);
  const sign = t.type === "ingreso" ? "+" : t.type === "gasto" ? "−" : "";
  return (
    <button className="row" onClick={onClick}>
      <div className="avatar">{c.emoji}</div>
      <div className="grow">
        <div className="title">{t.merchant}</div>
        <div className="meta">
          {c.name}{t.method ? ` · ${METHOD[t.method]}${t.last4 ? ` ••${t.last4}` : ""}` : ""} · {timeLabel(t.date)}
          {t.type === "gasto" && (t.scope ? <span className={`badge ${t.scope}`}>{SCOPE[t.scope].name}</span> : <span className="badge pending">Sin clasificar</span>)}
        </div>
      </div>
      <div className="right num" style={{ color: t.type === "ingreso" ? "var(--green)" : t.type === "movimiento" ? "var(--text2)" : "var(--text)" }}>
        {sign}{t.currency === "USD" ? `US$${t.amount}` : fmt(t.amount)}
        {t.currency === "USD" && <div style={{ fontSize: 12, color: "var(--text2)" }}>≈ {fmt(copValue(t, rate))}</div>}
      </div>
    </button>
  );
}

// ---------- Clasificar (la pregunta clave) ----------
function ClassifySheet({ queue, rate, onClose, onPick, onSkipAsTransfer }) {
  const [remember, setRemember] = useState(false);
  const [total] = useState(queue.length);
  const tx = queue[0];
  const c = catById(tx.category);
  const done = total - queue.length + 1;
  const pick = (scope) => { onPick(tx, scope, remember); setRemember(false); };
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Clasificar movimiento">
        <div className="grab" />
        <div className="sheet-head"><button onClick={onClose}>Luego</button><h2>¿De quién es este gasto?</h2><span style={{ minWidth: 70 }} /></div>
        {total > 1 && <div className="counter">{done} de {total}</div>}
        <div className="classify-amount">
          <div style={{ fontSize: 40 }}>{c.emoji}</div>
          <div className="big num">{tx.currency === "USD" ? `US$${tx.amount}` : fmt(tx.amount)}</div>
          <div className="who">{tx.merchant}</div>
          <div className="meta">
            {c.name}{tx.method ? ` · ${METHOD[tx.method]}${tx.last4 ? ` ••${tx.last4}` : ""}` : ""} · {dayLabel(tx.date)} {timeLabel(tx.date)}
          </div>
        </div>
        <div className="choose">
          <button className="p" onClick={() => pick("personal")}><span>👤</span>Personal</button>
          <button className="c" onClick={() => pick("casa")}><span>🏠</span>Casa</button>
        </div>
        <div className="group" style={{ marginTop: 16 }}>
          <div className="row">
            <div className="grow"><div className="title" style={{ fontSize: 15 }}>Recordar para “{tx.merchant}”</div>
              <div className="meta">La próxima vez se clasifica solo</div></div>
            <button className={`toggle ${remember ? "on" : ""}`} onClick={() => setRemember(!remember)} aria-label="Recordar" />
          </div>
        </div>
        <button className="btn danger" style={{ marginTop: 8, fontSize: 15 }} onClick={() => onSkipAsTransfer(tx)}>
          No es un gasto (pago de tarjeta / entre mis cuentas)
        </button>
      </div>
    </>
  );
}

// ---------- Agregar / editar ----------
const toDisplay = (n) => (n ? Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 }) : "");
function TxSheet({ tx, rules, onClose, onSave, onDelete }) {
  const isNew = !tx;
  const [d, setD] = useState(() => tx ? { ...tx, amount: toDisplay(tx.amount) } : { id: uid(), type: "gasto", amount: "", currency: "COP", merchant: "", category: "otros", method: "debito", scope: null, date: new Date().toISOString() });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState("");
  const [remember, setRemember] = useState(false);
  const [touchedCat, setTouchedCat] = useState(!isNew);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));

  const applyParsed = (text) => {
    const p = parseNotification(text);
    if (!p) return false;
    const rule = rules[merchantKey(p.merchant)];
    setD((x) => ({ ...x, ...p, amount: toDisplay(p.amount), category: rule?.category || p.category, scope: rule?.scope || x.scope }));
    setTouchedCat(true);
    setPasteOpen(false);
    return true;
  };
  const readClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t && applyParsed(t)) return;
      setPaste(t || ""); setPasteOpen(true);
    } catch { setPasteOpen(true); }
  };

  const amount = Number(String(d.amount).replace(/\./g, "").replace(",", "."));
  const valid = amount > 0 && (d.type !== "gasto" || d.scope);
  const save = () => {
    const merchant = d.merchant.trim() || (d.type === "ingreso" ? "Ingreso" : catById(d.category).name);
    onSave({ ...d, amount, merchant, category: d.type === "gasto" ? d.category : d.type, scope: d.type === "gasto" ? d.scope : null }, remember);
  };
  const onAmount = (v) => {
    const [int, dec] = v.replace(/[^\d,]/g, "").split(",");
    const digits = int || "";
    set("amount", digits ? Number(digits).toLocaleString("es-CO") + (dec !== undefined ? "," + dec.slice(0, 2) : "") : "");
  };
  const localDate = (() => { const x = new Date(d.date); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); })();

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label={isNew ? "Nuevo movimiento" : "Editar movimiento"}>
        <div className="grab" />
        <div className="sheet-head">
          <button onClick={onClose}>Cancelar</button>
          <h2>{isNew ? "Nuevo" : "Editar"}</h2>
          <button onClick={save} disabled={!valid}>Guardar</button>
        </div>

        {isNew && (
          <button className="btn secondary" style={{ margin: "4px 0 10px" }} onClick={readClipboard}>
            📋 Pegar notificación del banco
          </button>
        )}
        {pasteOpen && (
          <div style={{ marginBottom: 10 }}>
            <textarea className="field" autoFocus placeholder="Pega aquí el SMS, push o correo del banco…" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <button className="btn" style={{ marginTop: 8 }} disabled={!paste.trim()} onClick={() => !applyParsed(paste) && alert("No encontré un monto en ese texto.")}>Leer</button>
          </div>
        )}

        <div className="seg">
          {[["gasto", "Gasto"], ["ingreso", "Ingreso"], ["movimiento", "Entre cuentas"]].map(([k, l]) => (
            <button key={k} className={d.type === k ? "on" : ""} onClick={() => set("type", k)}>{l}</button>
          ))}
        </div>

        <input className="amount-input num" inputMode="numeric" placeholder="$0" value={d.amount ? `${d.currency === "USD" ? "US$" : "$"}${d.amount}` : ""}
          onChange={(e) => onAmount(e.target.value)} autoFocus={isNew && !pasteOpen} aria-label="Monto" />
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <button style={{ color: "var(--blue)", fontSize: 13 }} onClick={() => set("currency", d.currency === "USD" ? "COP" : "USD")}>
            {d.currency === "USD" ? "Dólares · cambiar a pesos" : "Pesos · cambiar a dólares"}
          </button>
        </div>

        <div className="group plain">
          <div className="row">
            <span className="title" style={{ flex: "none" }}>Comercio</span>
            <input className="inline" style={{ width: "100%" }} placeholder={d.type === "ingreso" ? "Ej. Nómina" : "Ej. Éxito"} value={d.merchant}
              onChange={(e) => { set("merchant", e.target.value); if (!touchedCat) set("category", guessCategory(e.target.value)); }} />
          </div>
          <div className="row">
            <span className="title" style={{ flex: 1 }}>Medio</span>
            <select className="inline" style={{ border: 0, background: "none", textAlign: "right", fontSize: 17, color: "var(--text2)", outline: "none" }}
              value={d.method || "debito"} onChange={(e) => set("method", e.target.value)}>
              <option value="debito">Débito</option><option value="credito">Crédito</option><option value="efectivo">Efectivo</option>
            </select>
          </div>
          <div className="row">
            <span className="title" style={{ flex: 1 }}>Fecha</span>
            <input type="datetime-local" className="inline" value={localDate} onChange={(e) => e.target.value && set("date", new Date(e.target.value).toISOString())} />
          </div>
        </div>

        {d.type === "gasto" && (
          <>
            <div className="section-title">Categoría</div>
            <div className="cats">
              {CATEGORIES.map((c) => (
                <button key={c.id} className={d.category === c.id ? "on" : ""} onClick={() => { set("category", c.id); setTouchedCat(true); }}>
                  <span>{c.emoji}</span>{c.name}
                </button>
              ))}
            </div>
            <div className="section-title">¿Personal o Casa?</div>
            <div className="choose" style={{ marginTop: 0 }}>
              <button className={`p ${d.scope && d.scope !== "personal" ? "dim" : ""}`} onClick={() => set("scope", "personal")}><span>👤</span>Personal</button>
              <button className={`c ${d.scope && d.scope !== "casa" ? "dim" : ""}`} onClick={() => set("scope", "casa")}><span>🏠</span>Casa</button>
            </div>
            {d.merchant.trim() && (
              <div className="group" style={{ marginTop: 12 }}>
                <div className="row">
                  <div className="grow"><div className="title" style={{ fontSize: 15 }}>Recordar para “{d.merchant.trim()}”</div></div>
                  <button className={`toggle ${remember ? "on" : ""}`} onClick={() => setRemember(!remember)} aria-label="Recordar" />
                </div>
              </div>
            )}
          </>
        )}

        <input className="field" style={{ marginTop: 16 }} placeholder="Nota (opcional)" value={d.note || ""} onChange={(e) => set("note", e.target.value)} />

        {d.raw && <><div className="section-title">Notificación original</div><pre className="code">{d.raw}</pre></>}

        {!isNew && <button className="btn danger" style={{ marginTop: 16 }} onClick={() => confirm("¿Eliminar este movimiento?") && onDelete(tx)}>Eliminar movimiento</button>}
      </div>
    </>
  );
}

// ---------- Ajustes ----------
function Settings({ state, update, onSync, showToast }) {
  const [token, setToken] = useState(state.settings.token);
  const setBudget = (k, v) => update((s) => ({ ...s, budgets: { ...s.budgets, [k]: Number(v.replace(/[^\d]/g, "")) || 0 } }));
  const rules = Object.entries(state.rules);
  const origin = typeof location !== "undefined" ? location.origin : "";

  const exportCsv = () => {
    const rows = [["fecha", "tipo", "comercio", "categoria", "personal_o_casa", "medio", "tarjeta", "monto", "moneda", "nota"]];
    for (const t of state.txs.filter(live))
      rows.push([t.date, t.type, t.merchant, catById(t.category).name, t.scope || "", t.method || "", t.last4 || "", t.amount, t.currency, t.note || ""]);
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
    a.download = `finanzas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <>
      <div className="header"><h1>Ajustes</h1></div>

      <div className="section-title">Presupuesto mensual</div>
      <div className="group plain">
        {["personal", "casa"].map((k) => (
          <div className="row" key={k}>
            <span className="title" style={{ flex: 1 }}>{SCOPE[k].emoji} {SCOPE[k].name}</span>
            <input className="inline num" inputMode="numeric" placeholder="$0" value={state.budgets[k] ? fmt(state.budgets[k]) : ""} onChange={(e) => setBudget(k, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="foot">Con presupuesto, el Resumen te dice cuánto te queda por día y te avisa si vas muy rápido.</div>

      <div className="section-title">Conexión con tu banco</div>
      <div className="group plain">
        <div className="row">
          <span className="title" style={{ flex: "none" }}>Llave</span>
          <input className="inline" style={{ width: "100%" }} type="password" placeholder="FIN_TOKEN" value={token} onChange={(e) => setToken(e.target.value)}
            onBlur={() => update((s) => ({ ...s, settings: { ...s.settings, token: token.trim() } }))} />
        </div>
        <button className="row" onClick={() => { update((s) => ({ ...s, settings: { ...s.settings, token: token.trim() } })); setTimeout(onSync, 50); }}>
          <span className="title" style={{ color: "var(--blue)", flex: 1 }}>Sincronizar ahora</span>
          <span className="meta">{state.settings.lastSync ? `Última: ${timeLabel(state.settings.lastSync)}` : "Nunca"}</span>
        </button>
      </div>
      <div className="foot">Respaldo en la nube + bandeja donde llegan las notificaciones del banco desde el Atajo del iPhone.</div>

      <div className="section-title">Atajo de iPhone (automático)</div>
      <ol className="steps">
        <li>Atajos → <b>Automatización</b> → <b>+</b> → <b>Mensaje</b> (o <b>Correo</b>). Remitente: tu banco (ej. 85540 Bancolombia). “El mensaje contiene”: <i>$</i>. Marca <b>Ejecutar inmediatamente</b>.</li>
        <li>Acción <b>Obtener contenido de URL</b>:<br />URL <code>{origin}/api/ingest</code> · Método <b>POST</b> · Encabezado <code>x-token</code> = tu llave · Cuerpo JSON: <code>text</code> = <i>Mensaje</i> (variable).</li>
        <li>Listo. Cada compra llega aquí y al abrir la app te pregunta <b>¿Personal o Casa?</b></li>
      </ol>
      <button className="btn secondary" style={{ marginTop: 10 }} onClick={() => { navigator.clipboard?.writeText(`${origin}/api/ingest`); showToast("URL copiada"); }}>Copiar URL del Atajo</button>

      <div className="section-title">Tasa del dólar</div>
      <div className="group plain">
        <div className="row">
          <span className="title" style={{ flex: 1 }}>1 USD =</span>
          <input className="inline num" inputMode="numeric" value={fmt(state.settings.usdRate)}
            onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, usdRate: Number(e.target.value.replace(/[^\d]/g, "")) || 0 } }))} />
        </div>
      </div>

      {rules.length > 0 && (
        <>
          <div className="section-title">Comercios recordados</div>
          <div className="group plain">
            {rules.map(([k, r]) => (
              <div className="row" key={k}>
                <span className="title" style={{ flex: 1, textTransform: "capitalize" }}>{k}</span>
                <span className={`badge ${r.scope}`}>{SCOPE[r.scope]?.name}</span>
                <button style={{ color: "var(--red)", fontSize: 15, marginLeft: 8 }} onClick={() => update((s) => { const n = { ...s.rules }; delete n[k]; return { ...s, rules: n }; })}>Quitar</button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Datos</div>
      <div className="group plain">
        <button className="row" onClick={exportCsv}><span className="title" style={{ color: "var(--blue)" }}>Exportar a Excel (CSV)</span></button>
      </div>
      <div className="foot" style={{ textAlign: "center", marginTop: 24 }}>Tus datos viven en este teléfono{state.settings.token ? " y en tu base de datos privada" : ""}.</div>
    </>
  );
}

// ---------- Tab bar ----------
function TabBar({ tab, setTab, badge }) {
  const tabs = [
    ["resumen", "Resumen", <path key="a" d="M4 13h4v7H4zM10 8h4v12h-4zM16 4h4v16h-4z" fill="currentColor" />],
    ["movimientos", "Movimientos", <path key="b" d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />],
    ["ajustes", "Ajustes", <g key="c" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5" strokeLinecap="round" /></g>],
  ];
  return (
    <nav className="tabbar">
      <div className="inner">
        {tabs.map(([k, l, icon]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            <span style={{ position: "relative" }}>
              <svg viewBox="0 0 24 24">{icon}</svg>
              {k === "movimientos" && badge > 0 && (
                <span style={{ position: "absolute", top: -3, right: -9, background: "var(--red)", color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 9, minWidth: 18, height: 18, display: "grid", placeItems: "center", padding: "0 5px" }}>{badge}</span>
              )}
            </span>
            {l}
          </button>
        ))}
      </div>
    </nav>
  );
}
