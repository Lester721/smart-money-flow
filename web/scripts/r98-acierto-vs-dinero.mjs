// ══ AFINAR CON CABEZA — PASO 2 ══ Lester, 2026-08-28:
//   «mide esas dos, pero los aciertos son importantes para mí. Ideal sería por encima del 60% a
//    menos que me digas que voy a ganar buen dinero con el 48-51%. Discutamos esto antes del
//    examen. NO hagas el examen hasta que te dé el visto bueno.»
//
// ⚠️ LA MITAD B NO SE TOCA. Este fichero sólo mira la mitad A.
//
// TRES PREGUNTAS:
//   1. La salida por movimiento de la ACCIÓN (8% / 12%): estaba diseñada para opciones profundas,
//      donde el pago es casi lineal. Con opciones poco profundas debería CORTAR justo las que
//      iban a doblar. Hay que verlo, no suponerlo.
//   2. ¿El golpe de $500.000 añade algo ENCIMA de la operación desnuda, o sólo recorta muestra?
//   3. EL INTERCAMBIO QUE PIDE LESTER: ¿cuánto cuesta subir el acierto? Se responde en DÓLARES
//      AL AÑO, no en porcentaje por operación. Ver [[explicar-en-dolares-al-ano]].
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF = [0.05, 0.15, 0.25, 0.45, 0.70];
const DTE_OBJ = 51, COSTE_MIN = 10000, TOPE = 60;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
const FDIR = join(CACHE, "flujo-limpio");
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
// días con golpe que pasa TODOS los filtros de la tabla mágica, lado CALL
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const conGolpe = new Set();
for (const f of cargar().filter(MAG)) if (f.l === "C") conGolpe.add(f.tk + "|" + f.dC);
function elegir(tk, d, profObj) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 5 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|C")) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      if (K >= s) continue;
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < COSTE_MIN) continue;
      const prof = (s - K) / s;
      const dist = Math.abs(prof - profObj) / profObj + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
/** camino con el múltiplo de la opción Y el movimiento de la acción, para probar las dos salidas */
function camino(tk, d, c, dias) {
  const out = [];
  for (const x of dias.filter((y) => y > d && y <= c.exp)) {
    const ch = leer(tk, x); if (!ch) continue;
    const q = ch[c.exp] && ch[c.exp][c.K + "|C"]; if (!q || !(q[0] > 0)) continue;
    const s = spotDe(tk, x);
    out.push([x, q[0] / c.ask, s == null ? null : (s - c.spot) / c.spot]);
    if (out.length >= TOPE) break; }
  return out; }
/** salida configurable: tope de múltiplo, suelo, movimiento de la acción, días */
function salir(cam, { objetivo = null, suelo = 0.50, movAccion = null, dias = TOPE } = {}) {
  let ult = null;
  for (let i = 0; i < cam.length && i < dias; i++) {
    const [, m, mov] = cam[i]; ult = m;
    if (objetivo && m >= objetivo) return objetivo;
    if (suelo && m <= suelo) return suelo;
    if (movAccion != null && mov != null && mov >= movAccion) return m; }
  return ult; }
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
function stats(L, f) { if (!L || L.length < 3) return null;
  const m = L.map(f).filter((x) => x != null); if (m.length < 3) return null;
  const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  const gan = m.filter((x) => x > 1), per = m.filter((x) => x <= 1);
  return { n: m.length, ret: 100 * r, gana: 100 * gan.length / m.length, t: r / (sd / Math.sqrt(m.length)),
           dobla: 100 * m.filter((x) => x >= 2).length / m.length,
           mediaGana: gan.length ? 100 * (media(gan) - 1) : 0,
           mediaPierde: per.length ? 100 * (media(per) - 1) : 0,
           mejor: 100 * (Math.max(...m) - 1) }; }
function sinSolape(L) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) {
      if (x.dC <= libre) continue; out.push(x);
      const fin = x.cam[Math.min(x.cam.length - 1, TOPE - 1)]; libre = fin ? fin[0] : x.dC; } }
  return out; }

const DATOS = [];
process.stdout.write("\n  midiendo la mitad A: ");
for (const tk of A) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  const DS = todos.filter((d) => d >= "20210101" && d <= "20260819");
  const MA = new Map();
  for (const d of DS) { const i = todos.indexOf(d); if (i < 20) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length >= 15 && s != null) MA.set(d, s / (p.reduce((a, b) => a + b, 0) / p.length) - 1); }
  for (const d of DS.filter((x) => (MA.get(x) ?? 1) < 0)) for (const pObj of PROF) {
    const c = elegir(tk, d, pObj); if (!c) continue;
    const cam = camino(tk, d, c, todos); if (cam.length < 3) continue;
    DATOS.push({ tk, dC: d, y: d.slice(0, 4), pedida: pObj, prof: c.prof, coste: c.ask * 100,
                 horq: (c.ask - c.bid) / c.ask, golpe: conGolpe.has(tk + "|" + d), cam }); } }
console.log("\n");
const L5 = sinSolape(DATOS.filter((x) => x.pedida === 0.05));

console.log("  ══ 1. ¿ESTORBA LA SALIDA POR MOVIMIENTO DE LA ACCIÓN? ══  (5% dentro, sin tope)");
console.log("");
console.log("  " + "salida".padEnd(34) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
for (const [nom, mov] of [["sin salida por la acción", null], ["sale si la acción sube 8%", 0.08],
                          ["sale si la acción sube 12%", 0.12], ["sale si la acción sube 20%", 0.20]]) {
  const s = stats(L5, (x) => salir(x.cam, { objetivo: null, suelo: 0.50, movAccion: mov }));
  console.log("  " + nom.padEnd(34) + String(s.n).padStart(6) + (s.ret.toFixed(2) + "%").padStart(11) +
    (s.gana.toFixed(0) + "%").padStart(9) + s.t.toFixed(2).padStart(8) + (s.dobla.toFixed(1) + "%").padStart(9)); }

console.log("");
console.log("  ══ 2. ¿AÑADE ALGO EL GOLPE DE $500.000? ══  (5% dentro, sin tope, sin salida por la acción)");
console.log("");
console.log("  " + "".padEnd(34) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
for (const [nom, F] of [["días CON golpe", (x) => x.golpe], ["días SIN golpe", (x) => !x.golpe], ["todos", () => true]]) {
  const s = stats(L5.filter(F), (x) => salir(x.cam, { suelo: 0.50 }));
  console.log("  " + nom.padEnd(34) + String(s ? s.n : L5.filter(F).length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); }
const gTodos = DATOS.filter((x) => x.pedida === 0.05 && x.golpe).length;
console.log("  (días con golpe de call en la mitad A, antes de quitar solapes: " + gTodos + ")");

console.log("");
console.log("  ══ 3. EL INTERCAMBIO: ACIERTO CONTRA DINERO ══");
console.log("");
console.log("  Cada fila es una forma distinta de subir el acierto. La última columna es lo que cuesta.");
console.log("");
console.log("  " + "cómo".padEnd(30) + "acierta".padStart(9) + "% por op".padStart(10) + "gana".padStart(9) +
  "pierde".padStart(9) + "doblan".padStart(8) + "mejor".padStart(9) + "$/año".padStart(11));
const OPS_ANO = (L) => L.length / 5.63;
const filas = [];
for (const p of PROF) {
  const L = sinSolape(DATOS.filter((x) => x.pedida === p));
  const s = stats(L, (x) => salir(x.cam, { suelo: 0.50 }));
  if (!s) continue;
  const costeM = media(L.map((x) => x.coste));
  filas.push({ nom: (100 * p).toFixed(0) + "% dentro", s, ops: OPS_ANO(L), coste: costeM });
}
// y las variantes de tope sobre el 5%
for (const [nom, obj] of [["5% dentro + tope 1,25x", 1.25], ["5% dentro + tope 1,50x", 1.50], ["5% dentro + tope 2x", 2.00]]) {
  const s = stats(L5, (x) => salir(x.cam, { objetivo: obj, suelo: 0.50 }));
  filas.push({ nom, s, ops: OPS_ANO(L5), coste: media(L5.map((x) => x.coste)) });
}
for (const f of filas) {
  // dinero al año con 4 huecos: se toman como mucho 4 a la vez, cada una al 25% de $60.000
  const porOp = 15000 * (f.s.ret / 100);
  const alAno = porOp * Math.min(f.ops, 4 * 12);   // el tope de huecos limita cuántas caben
  console.log("  " + f.nom.padEnd(30) + (f.s.gana.toFixed(0) + "%").padStart(9) + (f.s.ret.toFixed(2) + "%").padStart(10) +
    ("+" + f.s.mediaGana.toFixed(0) + "%").padStart(9) + (f.s.mediaPierde.toFixed(0) + "%").padStart(9) +
    (f.s.dobla.toFixed(1) + "%").padStart(8) + ("+" + f.s.mejor.toFixed(0) + "%").padStart(9) + D(alAno).padStart(11));
}
console.log("");
console.log("  ⚠️ el $/año supone $15.000 por posición (25% de $60.000) y todas las señales que caben.");
console.log("     Es una cota superior: no cuenta que a veces no hay hueco ni que el capital crece.");
console.log("");
console.log("  ══ 4. ¿DE DÓNDE SALE EL DINERO CUANDO SÓLO ACIERTAS EL 48%? ══");
console.log("");
const s5 = stats(L5, (x) => salir(x.cam, { suelo: 0.50 }));
const mults = L5.map((x) => salir(x.cam, { suelo: 0.50 })).filter((x) => x != null).sort((a, b) => a - b);
const pct = (p) => mults[Math.min(mults.length - 1, Math.floor(p * mults.length))];
console.log("  reparto de los " + mults.length + " resultados:");
console.log("    peor x" + mults[0].toFixed(2) + "  ·  p25 x" + pct(0.25).toFixed(2) + "  ·  MEDIANA x" + pct(0.50).toFixed(2) +
  "  ·  p75 x" + pct(0.75).toFixed(2) + "  ·  p90 x" + pct(0.90).toFixed(2) + "  ·  mejor x" + mults[mults.length - 1].toFixed(2));
console.log("  la ganadora media gana +" + s5.mediaGana.toFixed(0) + "%   ·   la perdedora media pierde " + s5.mediaPierde.toFixed(0) + "%");
console.log("  aciertas el " + s5.gana.toFixed(0) + "% y aun así ganas porque cuando ganas, ganas " +
  (s5.mediaGana / Math.abs(s5.mediaPierde)).toFixed(1) + " veces lo que pierdes cuando pierdes.");
const top10 = mults.slice(-Math.ceil(mults.length * 0.10));
const resto = mults.slice(0, mults.length - top10.length);
console.log("  el 10% mejor aporta " + (100 * top10.reduce((a, b) => a + b - 1, 0) / mults.reduce((a, b) => a + b - 1, 0)).toFixed(0) +
  "% de toda la ganancia   ·   el otro 90% junto da " + (media(resto) - 1 >= 0 ? "+" : "") + (100 * (media(resto) - 1)).toFixed(2) + "% por operación");
console.log("");
console.log("  ⚠️ MITAD A. La mitad B sigue sin tocarse. NO se ha hecho el examen.");
console.log("");
