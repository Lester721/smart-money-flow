// ══ LA REGLA NÚMERO UNO: LIQUIDEZ ══ Lester, 2026-08-29: «prueba el 1 y optimiza».
//
// ═══ POR QUÉ ESTO PUEDE TUMBARLO TODO ══════════════════════════════════════════════════════
//
// LA PALANCA compra calls **25-35% DENTRO del dinero a 250-400 días**. Eso no es un contrato
// normal: es mucho más profundo y mucho más largo que lo que se negocia de verdad. El backtest
// entra al ASK y sale al BID, o sea que ya paga la horquilla cotizada — pero:
//
//   · si la horquilla es enorme, el peaje se come el resultado y hay que verlo en euros
//   · si es MAYOR en los contratos profundos/largos, entonces el «óptimo» de profundidad que
//     encontramos ayer está sesgado: eligió lo caro de ejecutar sin saberlo
//   · y CLAUDE.md manda avisar explícitamente si algo no es líquido y decir NO OPERARLO
//
// ═══ LO QUE SE PUEDE Y LO QUE NO ═══════════════════════════════════════════════════════════
// Las cadenas guardadas traen **bid y ask, nada más**. No hay volumen ni interés abierto.
// O sea: se puede medir la horquilla COTIZADA, no si hay tamaño detrás. Eso se dice y no se
// disfraza. Un bid/ask estrecho por 1 contrato no es liquidez para $11.000.
import { abrir } from "./datos.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const cad = abrir("cadenas", { callado: true });
const q = (X, p) => { const S = [...X].sort((a,b)=>a-b); return S[Math.floor(p*(S.length-1))]; };
const D = (x) => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");

// ── se muestrean operaciones REALES de cada fichero y se relee su cadena del día ──
function medir(fichero, muestra = 1200) {
  const OPS = JSON.parse(readFileSync(join(CACHE, fichero), "utf8")).ops;
  const paso = Math.max(1, Math.floor(OPS.length / muestra));
  const sel = OPS.filter((_, i) => i % paso === 0);
  sel.sort((a,b) => a.tk.localeCompare(b.tk) || a.dC.localeCompare(b.dC));   // agrupar por ticker: cache
  const R = [];
  let CH = new Map(), tkAct = null;
  for (const o of sel) {
    if (o.tk !== tkAct) { CH = new Map(); tkAct = o.tk; }
    let ch = CH.get(o.dC);
    if (ch === undefined) { ch = cad.leer(o.tk, o.dC); CH.set(o.dC, ch); }
    if (!ch) continue;
    const g = ch[o.exp]; if (!g) continue;
    const c = g[o.K + "|C"]; if (!c || !(c[0] > 0) || !(c[1] > 0)) continue;
    const bid = c[0], ask = c[1], mid = (bid+ask)/2;
    R.push({ tk:o.tk, dC:o.dC, bid, ask, mid,
      hMid: (ask-bid)/mid,            // horquilla como % del punto medio
      hAsk: (ask-bid)/ask,            // lo que pierdes ida y vuelta sobre lo que pagas
      coste: ask*100,
      pctSpot: ask*100/(o.spot*100) });
  }
  return R; }

// ── referencia: ¿cómo es la horquilla de algo que TODOS negocian? ──
// la call al dinero del vencimiento más cercano, mismos días y tickers
function referencia(muestra = 400) {
  const OPS = JSON.parse(readFileSync(join(CACHE, "caminos-p25-d250.json"), "utf8")).ops;
  const paso = Math.max(1, Math.floor(OPS.length / muestra));
  const sel = OPS.filter((_, i) => i % paso === 0);
  sel.sort((a,b) => a.tk.localeCompare(b.tk) || a.dC.localeCompare(b.dC));
  const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));
  const R = [];
  let CH = new Map(), tkAct = null;
  for (const o of sel) {
    if (o.tk !== tkAct) { CH = new Map(); tkAct = o.tk; }
    let ch = CH.get(o.dC);
    if (ch === undefined) { ch = cad.leer(o.tk, o.dC); CH.set(o.dC, ch); }
    if (!ch) continue;
    // vencimiento entre 20 y 45 días
    let ex = null, md = 1e9;
    for (const e of Object.keys(ch)) { const d = (ms(e)-ms(o.dC))/86400000;
      if (d < 20 || d > 45) continue; if (Math.abs(d-30) < md) { md = Math.abs(d-30); ex = e; } }
    if (!ex) continue;
    let K = null, dm = 1e9;
    for (const cl of Object.keys(ch[ex])) { if (!cl.endsWith("|C")) continue;
      const k = Number(cl.slice(0, cl.indexOf("|")));
      if (Math.abs(k - o.spot) < dm) { dm = Math.abs(k - o.spot); K = k; } }
    if (K == null) continue;
    const c = ch[ex][K+"|C"]; if (!c || !(c[0]>0) || !(c[1]>0)) continue;
    R.push({ hMid: (c[1]-c[0])/((c[0]+c[1])/2), hAsk: (c[1]-c[0])/c[1] }); }
  return R; }

console.log("");
console.log("  ══ LIQUIDEZ DE LOS CONTRATOS DE LA PALANCA ══");
console.log("");
console.log("  ⚠️ Las cadenas guardadas traen bid y ask, NO volumen ni interés abierto.");
console.log("     Esto mide la HORQUILLA COTIZADA, no si hay tamaño detrás. Un bid/ask");
console.log("     estrecho por 1 contrato NO es liquidez para $11.000.");
console.log("");
const REF = referencia();
console.log("  REFERENCIA — call AL DINERO a ~30 días (lo que todo el mundo negocia), n=" + REF.length);
console.log("    horquilla sobre el punto medio:  mediana " + (100*q(REF.map(r=>r.hMid),0.5)).toFixed(1) +
  "%   ·  p90 " + (100*q(REF.map(r=>r.hMid),0.9)).toFixed(1) + "%");
console.log("");
console.log("  " + "contrato".padEnd(16) + "n".padStart(7) + "horquilla / punto medio".padStart(28) +
  "coste del contrato".padStart(26));
console.log("  " + " ".repeat(16) + " ".repeat(7) + "p25   MEDIANA   p75   p90".padStart(28) +
  "mediana      p90".padStart(26));
const TAB = {};
for (const [nom, f] of [
  ["15% × 120d", "caminos-p15-d120.json"],
  ["25% × 120d", "caminos-p25-d120.json"],
  ["25% × 250d", "caminos-p25-d250.json"],
  ["25% × 400d", "caminos-p25-d400.json"],
  ["35% × 120d", "caminos-p35-d120.json"],
  ["35% × 250d", "caminos-p35-d250.json"],
  ["35% × 400d", "caminos-p35-d400.json"],
  ["50% × 250d", "caminos-p50-d250.json"]]) {
  let R;
  try { R = medir(f); } catch (e) { console.log("  " + nom.padEnd(16) + "  (falta " + f + ")"); continue; }
  if (!R.length) continue;
  TAB[nom] = R;
  const H = R.map(r=>r.hMid), C = R.map(r=>r.coste);
  console.log("  " + nom.padEnd(16) + String(R.length).padStart(7) +
    ((100*q(H,0.25)).toFixed(1)+"%").padStart(7) + ((100*q(H,0.5)).toFixed(1)+"%").padStart(9) +
    ((100*q(H,0.75)).toFixed(1)+"%").padStart(7) + ((100*q(H,0.9)).toFixed(1)+"%").padStart(5) +
    D(q(C,0.5)).padStart(14) + D(q(C,0.9)).padStart(12)); }
console.log("");

// ── ¿la horquilla es PEOR en los profundos/largos? esa es la pregunta que sesga el óptimo ──
console.log("  ══ ¿EMPEORA AL IR MÁS DENTRO O MÁS LARGO? ══");
console.log("  (si empeora, el óptimo de profundidad de ayer eligió lo caro de ejecutar sin saberlo)");
console.log("");
const base = TAB["25% × 250d"];
if (base) for (const k of Object.keys(TAB)) {
  const m = 100*q(TAB[k].map(r=>r.hMid),0.5), b = 100*q(base.map(r=>r.hMid),0.5);
  console.log("  " + k.padEnd(16) + (m.toFixed(2)+"%").padStart(9) +
    ("  " + (m>b?"+":"") + (m-b).toFixed(2) + " pts contra el 25%×250d").padStart(34)); }
console.log("");

// ── EN DÓLARES, que es como se entiende ──
console.log("  ══ EL PEAJE EN DÓLARES ══  por operación de ida y vuelta, sobre una posición de $11.084");
console.log("  (2 huecos al 20% de una cuenta de $55.419)");
console.log("");
console.log("  " + "contrato".padEnd(16) + "horquilla".padStart(11) + "peaje ida+vuelta".padStart(18) +
  "sobre 6 ops/año".padStart(18));
for (const k of Object.keys(TAB)) {
  const h = q(TAB[k].map(r=>r.hMid), 0.5);
  const peaje = 11084 * h;              // cruzar entera la horquilla una vez (entrar al ask, salir al bid)
  console.log("  " + k.padEnd(16) + ((100*h).toFixed(2)+"%").padStart(11) + D(peaje).padStart(18) +
    (D(peaje*6) + "/año").padStart(18)); }
console.log("");

// ── ¿cuántos contratos caben de verdad? ──
console.log("  ══ ¿CABE EN LA CUENTA? ══  $55.419 · 2 huecos al 20% = $11.084 por posición");
console.log("");
console.log("  " + "contrato".padEnd(16) + "coste mediano".padStart(15) + "% de ops que CABEN".padStart(20) +
  "más caro (p90)".padStart(16));
for (const k of Object.keys(TAB)) {
  const C = TAB[k].map(r=>r.coste);
  const caben = 100 * C.filter(x=>x<=11084).length / C.length;
  console.log("  " + k.padEnd(16) + D(q(C,0.5)).padStart(15) + (caben.toFixed(0)+"%").padStart(20) +
    D(q(C,0.9)).padStart(16)); }
console.log("");
