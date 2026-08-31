// ══ PARAR CUANDO SPY CAE ══ Lester, 2026-08-28:
//   «¿qué pasa si dejamos de operar cuando existe una disminución del 10% del SPY?»
//
// ES DISTINTO DEL FRENO QUE PROBÉ ANTES. Aquel miraba la caída de TU CUENTA; éste mira la del
// MERCADO. Es mejor: la caída de SPY es externa y no depende de tus propias pérdidas, así que no
// se realimenta. Usa sólo el pasado: el máximo de SPY hasta ese día.
//
// DE DÓNDE VIENE LA CAÍDA, mecánicamente:
//   En un mercado bajista la condición de entrada se cumple MÁS —«la acción bajo su media de 20»
//   se dispara todos los días cuando todo cae—, así que la regla compra MÁS calls justo cuando
//   peor. En 2022 hizo 40 operaciones con 27 perdedoras. Se echa gasolina al incendio.
//   Y diez calls largas no son diez apuestas: son una, porque van todas al mismo lado.
//
// DOS PALANCAS CON MECANISMO (no un barrido de parámetros):
//
//   1. FRENO DE CUENTA. Si la cuenta cae X% desde su máximo, se dejan de ABRIR posiciones nuevas
//      hasta que se recupere. No filtra la señal ni predice nada: corta la realimentación.
//      Usa sólo el pasado (el máximo hasta hoy), así que no mira al futuro.
//
//   2. EL SUELO POR POSICIÓN. Está en 0,50x desde el principio y NUNCA se midió para esta regla.
//      Con calls al 15% dentro muchas más lo tocan que con las profundas de antes, donde sólo
//      4 de 93 llegaban ([[tabla-magica]]). Puede que ahí haya mucho que ganar.
//
// Se miden por separado y juntas. Base: 10 huecos al 8%, el ocioso en SPY (la fila que ganaba).
import { abrir } from "./datos.mjs";
const TK = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, PLAZO = 90;
const DIV_SPY = 0.013, DESDE = "20160104";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
let CH = new Map(), SP = new Map();
const leer = (tk, d) => { if (CH.has(d)) return CH.get(d); const c = cad.leer(tk, d); CH.set(d, c); return c; };
function spotOk(c, hoy) { if (!c) return null; let e0 = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null; const g = c[e0]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[k + "|P"]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; K = k; } }
  if (K == null) return null; const C = g[K + "|C"], P = g[K + "|P"];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2; return s > 0 ? s : null; }
const spotDe = (tk, d) => { if (SP.has(d)) return SP.get(d); const s = spotOk(leer(tk, d), d); SP.set(d, s); return s; };
function elegir(tk, d) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 30 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|C")) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      if (K >= s) continue;
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      const prof = (s - K) / s;
      const dist = Math.abs(prof - PROF_OBJ) / PROF_OBJ + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
// se guarda el CAMINO entero para poder probar varios suelos sin releer nada
const OPS = [];
process.stdout.write("\n  construyendo 2016-2026: ");
for (const tk of TK) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  for (let i = 20; i < todos.length; i++) {
    const d = todos[i];
    if (d < DESDE || d > "20260819") continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length < 15 || s == null) continue;
    const ma = s / (p.reduce((a, b) => a + b, 0) / p.length) - 1;
    if (ma >= 0) continue;
    const L = elegir(tk, d); if (!L) continue;
    const cam = [];
    for (const x of todos.filter((y) => y > d && y <= L.exp)) {
      const ch = leer(tk, x); if (!ch) continue;
      const q = ch[L.exp] && ch[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
      cam.push([x, Math.round((q[0] / L.ask) * 1000) / 1000]); if (cam.length >= PLAZO) break; }
    if (cam.length < 15) continue;
    OPS.push({ tk, dC: d, y: d.slice(0, 4), ma, coste: L.ask * 100, cam }); } }
OPS.sort((a, b) => a.dC.localeCompare(b.dC));
console.log("\n");
function salida(cam, suelo) { let ult = null;
  for (const [x, m] of cam) { ult = { mult: m, dSal: x }; if (m <= suelo) return { mult: suelo, dSal: x }; }
  return ult; }
CH = new Map(); SP = new Map();
const DIAS = cad.dias("SPY").filter((d) => d >= DESDE && d <= "20260819");
const pSPY = new Map();
for (const d of DIAS) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DD = DIAS.filter((d) => pSPY.has(d));
const ANOS = (ms("20260819") - ms(DD[0])) / (365.25 * 86400000);
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / ANOS) - 1);
/** freno: si la cuenta cae `freno` desde su máximo, no se ABREN nuevas hasta recuperar `vuelve` */
function cuenta({ capital, tam = 0.08, huecos = 10, suelo = 0.50, freno = null, vuelve = 0.05, hasta = null }) {
  const divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = hasta ? DD.filter((d) => d <= hasta) : DD;
  const porDia = new Map();
  for (const x of OPS) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0, frenado = false, diasFreno = 0;
  for (const hoy of dias) {
    const p = pSPY.get(hoy);
    acc *= (1 + divD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    const valor = () => caja + acc * p + inv();
    // el freno mira SÓLO el pasado: el máximo alcanzado hasta hoy
    if (freno != null) {
      const dd = 1 - valor() / pico;
      if (!frenado && dd >= freno) frenado = true;
      else if (frenado && dd <= vuelve) frenado = false;
      if (frenado) diasFreno++;
    }
    if (!frenado) for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const patr = valor();
      const tope = patr * tam;
      const falta = Math.min(tope, patr) - caja;
      if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; }
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const r = salida(x.cam, suelo);
      const dinero = n * x.coste;
      caja -= dinero; ab.push({ ...x, dinero, mult: r.mult, dSal: r.dSal });
      tom.push({ ...x, dinero, mult: r.mult, gana: dinero * (r.mult - 1) }); }
    if (caja > 0) { acc += caja / p; caja = 0; }
    const v = valor();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = pSPY.get(dias[dias.length - 1]);
  let fin = caja + acc * p; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom, freno: 100 * diasFreno / dias.length }; }
function banda(op, base = 60000) { const R = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ ...op, capital: c }); R.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(R), c: med(C) }; }

// ── la caída de SPY desde su propio máximo, día a día (sólo pasado) ──
const CAIDA_SPY = new Map();
{ let pico = 0;
  for (const d of DD) { const p = pSPY.get(d); if (p > pico) pico = p; CAIDA_SPY.set(d, 1 - p / pico); } }
function cuenta2({ capital, tam = 0.08, huecos = 10, suelo = 0.50, umbral = null, modo = "spy", hasta = null }) {
  const intD = Math.pow(1.033, 1 / 252) - 1, divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = hasta ? DD.filter((d) => d <= hasta) : DD;
  const porDia = new Map();
  for (const x of OPS) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0, parado = 0;
  for (const hoy of dias) {
    const p = pSPY.get(hoy);
    if (modo === "spy") acc *= (1 + divD); else caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    const valor = () => caja + acc * p + inv();
    const fuera = umbral != null && (CAIDA_SPY.get(hoy) || 0) >= umbral;
    if (fuera) parado++;
    if (!fuera) for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const patr = valor(), tope = patr * tam;
      if (modo === "spy") { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const r = salida(x.cam, suelo);
      const dinero = n * x.coste;
      caja -= dinero; ab.push({ ...x, dinero, mult: r.mult, dSal: r.dSal });
      tom.push({ ...x, dinero, mult: r.mult, gana: dinero * (r.mult - 1) }); }
    if (modo === "spy" && caja > 0) { acc += caja / p; caja = 0; }
    const v = valor();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = pSPY.get(dias[dias.length - 1]);
  let fin = caja + acc * p; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom, parado: 100 * parado / dias.length }; }
function banda2(op, base = 60000) { const R = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta2({ ...op, capital: c }); R.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(R), c: med(C) }; }
const spySolo = 60000 * (pSPY.get(DD[DD.length - 1]) / pSPY.get(DD[0])) * Math.pow(1 + DIV_SPY, ANOS);

const spyRef = 60000 * (pSPY.get(DD[DD.length - 1]) / pSPY.get(DD[0])) * Math.pow(1 + DIV_SPY, ANOS);
/** mediana del multiplicador final sobre 21 capitales, escalada a $60.000 */
function banda3(op, base = 60000) {
  const R = [], C = [], M = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) {
    const q = cuenta2({ ...op, capital: c });
    R.push(an(q.final, c)); C.push(q.caida); M.push(q.final / c); }
  return { a: med(R), c: med(C), dinero: 60000 * med(M) }; }
console.log("");
console.log("  ══ CUÁNTO DINERO, EN TOTAL ══   $60.000 de partida · 2016-2026 (10,6 años)");
console.log("  (mediana de 21 capitales de partida, escalada a $60.000)");
console.log("");
console.log("  " + "".padEnd(24) + "  │ " + "DESCANSANDO EN SPY".padStart(34) + "  │ " + "LA ESTRATEGIA SOLA".padStart(34));
console.log("  " + "".padEnd(24) + "  │ " + "acaba con     al año    caída".padStart(34) + "  │ " + "acaba con     al año    caída".padStart(34));
for (const [nom, u] of [["sin filtro", null], ["parar si SPY cae 10%", 0.10], ["parar si SPY cae 5%", 0.05]]) {
  const s2 = banda3({ umbral: u, modo: "spy" });
  const e2 = banda3({ umbral: u, modo: "efectivo" });
  console.log("  " + nom.padEnd(24) +
    "  │ " + (D(s2.dinero) + "   " + s2.a.toFixed(1) + "%   −" + s2.c.toFixed(0) + "%").padStart(34) +
    "  │ " + (D(e2.dinero) + "   " + e2.a.toFixed(1) + "%   −" + e2.c.toFixed(0) + "%").padStart(34)); }
console.log("  " + "comprar SPY y dormir".padEnd(24) +
  "  │ " + (D(spyRef) + "   " + an(spyRef, 60000).toFixed(1) + "%   −25%").padStart(34) +
  "  │ " + "".padStart(34));
console.log("  " + "el efectivo al 3,3%".padEnd(24) + "  │ " + "".padStart(34) +
  "  │ " + (D(60000 * Math.pow(1.033, ANOS)) + "   3.3%    −0%").padStart(34));
console.log("");
console.log("  ⚠️ El umbral se eligió mirando estos mismos datos. No está examinado.");
console.log("");
