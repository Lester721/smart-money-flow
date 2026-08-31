// ══ REPARTIR LAS ENTRADAS ══ Lester, 2026-08-28: «no es destruir, es construir».
//
// ═══ QUÉ SE CONSTRUYE Y POR QUÉ ════════════════════════════════════════════════════════════
//
// El diagnóstico de r120: la cartera es UNA SOLA APUESTA. Los 6 huecos se llenan el mismo día
// (todos los tickers caen bajo su media a la vez, porque cae el mercado) y mueren juntos
// 90 días después. Por eso la beta del libro es 3,11 y por eso NINGÚN filtro de señal la tocaba:
// no hay nada que filtrar, hay una apuesta repetida seis veces.
//
// La palanca no es elegir mejor. Es NO DEJAR QUE EL MERCADO DECIDA CUÁNDO SE LLENA EL LIBRO.
// Un tope de entradas nuevas por mes obliga a que las posiciones nazcan en fechas distintas.
//
// En r120 salió: Sharpe 0,86 contra 0,70 de comprar SPY y 0,72 de la estrategia sin repartir.
// AQUÍ SE VALIDA, con las cuatro cribas que ya hemos usado antes y que han matado cosas:
//   1. ¿es MONÓTONO? (menos entradas → mejor, sin saltos raros)
//   2. ¿aguanta en los DOS PERÍODOS por separado? 2016-2020 es virgen para la afinación original
//   3. ¿cuántas operaciones quedan? pocas operaciones = ruido disfrazado
//   4. ¿le gana a SPY A CRÉDITO emparejado por caída? ese es el listón de verdad
import { simular, banda, spyApalancado, OPS, SPY, DD, ANOS, D, pct, med } from "./motor-cartera.mjs";

const CAD = [1, 2, 3, 4, 6, 8, 12, 0];   // 0 = sin tope
const nom = (c) => (c === 0 ? "sin tope" : "máx " + c + "/mes");

console.log("");
console.log("  ══ AUDIT ══");
console.log("  período: " + DD[0] + " → " + DD[DD.length - 1] + "  (" + ANOS.toFixed(1) + " años)");
console.log("  entradas disponibles: " + OPS.length.toLocaleString("en-US"));
const spy1 = spyApalancado(1);
console.log("  comprar SPY y dormir: " + spy1.cagr.toFixed(1) + "% al año · caída −" + spy1.caida.toFixed(0) +
  "% · Sharpe " + spy1.sharpe.toFixed(2) + "   ← EL LISTÓN");
console.log("  las posiciones abiertas se valoran A PRECIO DE HOY (r109 las valoraba al coste)");
console.log("");

// ── 1 · ¿ES MONÓTONO? ─────────────────────────────────────────────────────────────────────
console.log("  ══ 1 · ¿ES MONÓTONO? ══  mismo tamaño para todos (6 huecos al 15%), sólo cambia el tope");
console.log("");
console.log("  " + "tope".padEnd(12) + "al año".padStart(9) + "caída".padStart(9) + "Sharpe".padStart(9) +
  "ops".padStart(7) + "invertido".padStart(11));
for (const c of CAD) {
  const b = banda({ cadencia: c, tam: 0.15, huecos: 6, modo: "spy" });
  const q = simular({ cadencia: c, tam: 0.15, huecos: 6, modo: "spy" });
  console.log("  " + nom(c).padEnd(12) + (b.a.toFixed(1) + "%").padStart(9) + ("−" + b.c.toFixed(0) + "%").padStart(9) +
    b.s.toFixed(2).padStart(9) + String(q.ops).padStart(7) + (q.invertido.toFixed(0) + "%").padStart(11)); }
console.log("");

// ── 2 · LOS DOS PERÍODOS POR SEPARADO ─────────────────────────────────────────────────────
// 2016-2020 nunca se miró al afinar la regla original. Si el reparto sólo funciona en uno,
// es una casualidad del período y no se toca más.
console.log("  ══ 2 · ¿AGUANTA EN LAS DOS MITADES? ══");
console.log("");
function trozo(cfg, desde, hasta) {
  const d0 = DD.filter((d) => d >= desde && d <= hasta);
  const sub = OPS.filter((o) => o.dC >= desde && o.dC <= hasta);
  const anos = (Date.parse(hasta.slice(0,4)+"-"+hasta.slice(4,6)+"-"+hasta.slice(6,8)) -
                Date.parse(desde.slice(0,4)+"-"+desde.slice(4,6)+"-"+desde.slice(6,8))) / (365.25*86400000);
  const q = simular({ ...cfg, hasta, desdeD: desde });
  return { q, anos, n: sub.length, d0 }; }
console.log("  " + "tope".padEnd(12) + "2016-2020 (virgen)".padStart(26) + "2021-2026 (donde se afinó)".padStart(30));
console.log("  " + " ".repeat(12) + "al año   caída  Sharpe".padStart(26) + "al año   caída  Sharpe".padStart(30));
for (const c of CAD) {
  const A = banda({ cadencia: c, tam: 0.15, huecos: 6, modo: "spy", hasta: "20201231" });
  const B = banda({ cadencia: c, tam: 0.15, huecos: 6, modo: "spy", desdeD: "20210101" });
  console.log("  " + nom(c).padEnd(12) +
    ((A.a.toFixed(1)+"%").padStart(8) + ("−"+A.c.toFixed(0)+"%").padStart(8) + A.s.toFixed(2).padStart(8)).padStart(26) +
    ((B.a.toFixed(1)+"%").padStart(8) + ("−"+B.c.toFixed(0)+"%").padStart(8) + B.s.toFixed(2).padStart(8)).padStart(30)); }
console.log("");

// ── 3 · LA FRONTERA CONTRA EL LISTÓN DE VERDAD ────────────────────────────────────────────
console.log("  ══ 3 · CONTRA SPY A CRÉDITO, EMPAREJADOS POR CAÍDA ══");
console.log("");
const FINO = [];
for (const h of [4, 6, 8, 10, 12]) for (let tm = 0.03; tm <= 0.261; tm += 0.01) FINO.push([h, Math.round(tm*1000)/1000]);
const PT = {};
for (const c of [0, 4, 2, 1]) {
  PT[c] = FINO.map(([h, tm]) => { const b = banda({ cadencia: c, tam: tm, huecos: h, modo: "spy" });
    return { h, tm, ...b }; }); }
const FSPY = []; for (let L = 1; L <= 3.01; L += 0.05) { const r = spyApalancado(L); FSPY.push({ L: Math.round(L*100)/100, a: r.cagr, c: r.caida, s: r.sharpe }); }
const mejorEn = (pts, obj) => { const ok = pts.filter((x) => x.c <= obj); return ok.length ? ok.sort((a,b)=>b.a-a.a)[0] : null; };
const OBJ = [30, 40, 50, 60, 70];
console.log("  " + "".padEnd(14) + OBJ.map((o) => ("caída ≤" + o + "%").padStart(12)).join(""));
for (const c of [0, 4, 2, 1]) {
  let l = "  " + nom(c).padEnd(14);
  for (const o of OBJ) { const x = mejorEn(PT[c], o); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(12); }
  console.log(l); }
let l = "  " + "SPY a crédito".padEnd(14);
for (const o of OBJ) { const x = mejorEn(FSPY, o); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(12); }
console.log(l);
console.log("  " + "SPY y dormir".padEnd(14) + (spy1.cagr.toFixed(1)+"%").padStart(12) + "  (caída −" + spy1.caida.toFixed(0) + "%)");
console.log("");

// ── 4 · LA CONFIGURACIÓN QUE SE PROPONE, Y SU FORMA ───────────────────────────────────────
console.log("  ══ 4 · LA CANDIDATA ══");
console.log("");
const cand = mejorEn(PT[2], 60);
const q = simular({ cadencia: 2, tam: cand.tm, huecos: cand.h, modo: "spy" });
const rival = mejorEn(FSPY, q.caida);
const rq = spyApalancado(rival.L);
function mensual(V) { const M = new Map();
  for (let i = 0; i < DD.length; i++) M.set(DD[i].slice(0,6), V[i]);
  const K = [...M.keys()].sort(), R = [];
  for (let i = 1; i < K.length; i++) R.push(100 * (M.get(K[i]) / M.get(K[i-1]) - 1));
  return R; }
function forma(R) { const n = R.length, m = R.reduce((a,x)=>a+x,0)/n;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(n-1));
  const S = [...R].sort((a,b)=>a-b);
  return { m, sk: R.reduce((a,x)=>a+((x-m)/sd)**3,0)/n, p5: S[Math.floor(n*0.05)], p95: S[Math.floor(n*0.95)],
           peor: S[0], mejor: S[n-1], gan: 100*R.filter((x)=>x>0).length/n }; }
const fa = forma(mensual(q.V)), fb = forma(mensual(rq.V));
console.log("  " + cand.h + " huecos al " + (100*cand.tm).toFixed(0) + "%, máx 2 entradas nuevas al mes, el ocioso en SPY");
console.log("");
console.log("  " + " ".repeat(26) + "la candidata".padStart(15) + ("SPY a " + rival.L + "x").padStart(15) + "SPY y dormir".padStart(15));
const fila = (n, a, b, cc, d = 1) => console.log("  " + n.padEnd(26) + a.toFixed(d).padStart(15) + b.toFixed(d).padStart(15) + cc.toFixed(d).padStart(15));
fila("al año %", cand.a, rival.a, spy1.cagr);
fila("caída máxima %", -cand.c, -rival.c, -spy1.caida, 0);
fila("Sharpe", cand.s, rival.s, spy1.sharpe, 2);
fila("meses ganadores %", fa.gan, fb.gan, forma(mensual(spyApalancado(1).V)).gan, 0);
fila("SESGO (cola derecha)", fa.sk, fb.sk, forma(mensual(spyApalancado(1).V)).sk, 2);
fila("mejor mes %", fa.mejor, fb.mejor, forma(mensual(spyApalancado(1).V)).mejor, 0);
fila("peor mes %", fa.peor, fb.peor, forma(mensual(spyApalancado(1).V)).peor, 0);
console.log("");
console.log("  operaciones: " + q.ops + "  ·  invertido de media " + q.invertido.toFixed(0) + "%  ·  final " + D(q.final));
console.log("");
console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "peor caída".padStart(12) + "ops".padStart(6));
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const idx = DD.map((d, i) => [d, i]).filter(([d]) => d.startsWith(y)).map(([, i]) => i);
  if (!idx.length) continue;
  const v0 = idx[0] === 0 ? 60000 : q.V[idx[0]-1], v1 = q.V[idx[idx.length-1]];
  let pk = v0, pr = 0; for (const i of idx) { if (q.V[i] > pk) pk = q.V[i]; const d = 1 - q.V[i]/pk; if (d > pr) pr = d; }
  console.log("  " + y.padEnd(7) + D(v1).padStart(13) + pct(100*(v1/v0-1), 0).padStart(11) +
    ("−"+(100*pr).toFixed(0)+"%").padStart(12) + String(q.tom.filter((x)=>x.y===y).length).padStart(6)); }
console.log("");
