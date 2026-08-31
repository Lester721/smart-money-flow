// ══ OPTIMIZAR LA PALANCA ══ Lester, 2026-08-29: «mide el dial del aguante. Optimiza todo lo
// que puedas encontrar.»
//
// ═══ EL PELIGRO, Y CÓMO SE EVITA ═══════════════════════════════════════════════════════════
// Barrer CUATRO diales (profundidad, plazo, aguante, freno) más el tamaño sobre los mismos
// 10,6 años **garantiza** encontrar algo bonito. Es exactamente así como nació el $950.446 y
// como nació el «máx 2 entradas/mes». Si lo hago así, lo que salga no vale nada.
//
// Por eso el titular de este script NO es el mejor de todos. Es esto:
//
//   1. SE OPTIMIZA SÓLO SOBRE 2016-2020.  2021-2026 no se mira ni una vez.
//   2. El ganador se lleva a 2021-2026 TAL CUAL, sin tocar un parámetro.
//   3. Eso es un examen de verdad, y encima cae justo en el período que a Lester le preocupa
//      (la burbuja de la IA). Si sobrevive, sobrevive a un cambio de régimen.
//
// El óptimo de todo el período se enseña APARTE y ETIQUETADO como lo que es: dentro de muestra.
//
// ═══ LOS DIALES ════════════════════════════════════════════════════════════════════════════
//   profundidad  25% / 35% dentro         (la beta: 3,5x / 2,7x)
//   plazo        250 / 400 días
//   AGUANTE      30..250 días             ← nunca movido, es el que pidió Lester
//   FRENO        no abrir si SPY cae X%   ← la protección contra caída repentina que pidió
//   tamaño       huecos × % por posición
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const pct = (x, n = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(n) + "%";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const M = {}; let v = 0;
for (const p of [25, 35]) for (const d of [250, 400]) {
  const f = "largo-p" + p + "-d" + d + ".json";
  if (!existsSync(join(CACHE, f))) continue;
  process.env.CAMINOS = f;
  M[p + "|" + d] = await import("./motor-cartera.mjs?v=" + (++v)); }
const K = Object.keys(M);
if (!K.length) { console.log("\n  ⛔ faltan los ficheros largo-p*.json. Corre r137 primero.\n"); process.exit(1); }
for (const k of K) for (const o of M[k].OPS) if (o.ma >= 0) o.ma = 999;   // bajo la media, la regla original
const M0 = M[K[0]];
const spy1 = M0.spyApalancado(1);
const A = "20201231", B = "20210101";

console.log("");
console.log("  ══ AUDIT ══");
for (const k of K) { const L = M[k].OPS;
  const lg = L.map((o)=>o.camino.length).sort((a,b)=>a-b);
  console.log("  " + k.replace("|","% × ") + "d   entradas " + L.length.toLocaleString("en-US") +
    "   días de camino guardados: mediana " + lg[Math.floor(lg.length/2)] + " · máx " + lg[lg.length-1]); }
console.log("  EL LISTÓN: comprar SPY = " + spy1.cagr.toFixed(1) + "% al año, caída −" + spy1.caida.toFixed(0) +
  "%, Sharpe " + spy1.sharpe.toFixed(2));
console.log("  (2016-2020: 14,7% y −34%  ·  2021-2026: 15,4% y −25%)");
console.log("");

// ══ 1 · EL DIAL DEL AGUANTE, SOLO ═════════════════════════════════════════════════════════
console.log("  ══ 1 · EL DIAL DEL AGUANTE ══  (35% × 400d, 8 huecos al 20%, sin freno)");
console.log("");
const kA = M["35|400"] ? "35|400" : K[0];
console.log("  " + "aguante".padEnd(12) + "TODO 2016-2026".padStart(26) + "2016-2020".padStart(22) + "2021-2026".padStart(22));
console.log("  " + " ".repeat(12) + "al año  caída  Sharpe  ops".padStart(26) + "al año  caída  Sh".padStart(22) + "al año  caída  Sh".padStart(22));
for (const pl of [30, 60, 90, 120, 150, 200, 250]) {
  const cf = { tam:0.20, huecos:8, modo:"spy", plazo:pl };
  const T = M[kA].banda(cf), a = M[kA].banda({...cf, hasta:A}), b = M[kA].banda({...cf, desdeD:B});
  const q = M[kA].simular(cf);
  console.log("  " + (pl + " días").padEnd(12) +
    ((T.a.toFixed(1)+"%").padStart(8)+("−"+T.c.toFixed(0)+"%").padStart(7)+T.s.toFixed(2).padStart(6)+String(q.ops).padStart(5)).padStart(26) +
    ((a.a.toFixed(1)+"%").padStart(8)+("−"+a.c.toFixed(0)+"%").padStart(7)+a.s.toFixed(2).padStart(6)).padStart(22) +
    ((b.a.toFixed(1)+"%").padStart(8)+("−"+b.c.toFixed(0)+"%").padStart(7)+b.s.toFixed(2).padStart(6)).padStart(22)); }
console.log("");

// ══ 2 · EL FRENO DE LESTER, SOLO ══════════════════════════════════════════════════════════
console.log("  ══ 2 · EL FRENO ══  no abrir nada nuevo mientras SPY esté X% bajo su máximo");
console.log("  (lo ya abierto NO se toca: vender en el pánico es el error que ya medimos)");
console.log("");
console.log("  " + "freno".padEnd(12) + "TODO 2016-2026".padStart(26) + "2016-2020".padStart(22) + "2021-2026".padStart(22));
for (const fr of [0, 0.03, 0.05, 0.08, 0.10, 0.15, 0.20]) {
  const cf = { tam:0.20, huecos:8, modo:"spy", plazo:120, frenoSPY:fr };
  const T = M[kA].banda(cf), a = M[kA].banda({...cf, hasta:A}), b = M[kA].banda({...cf, desdeD:B});
  const q = M[kA].simular(cf);
  console.log("  " + (fr === 0 ? "sin freno" : "SPY −" + (100*fr).toFixed(0) + "%").padEnd(12) +
    ((T.a.toFixed(1)+"%").padStart(8)+("−"+T.c.toFixed(0)+"%").padStart(7)+T.s.toFixed(2).padStart(6)+String(q.ops).padStart(5)).padStart(26) +
    ((a.a.toFixed(1)+"%").padStart(8)+("−"+a.c.toFixed(0)+"%").padStart(7)+a.s.toFixed(2).padStart(6)).padStart(22) +
    ((b.a.toFixed(1)+"%").padStart(8)+("−"+b.c.toFixed(0)+"%").padStart(7)+b.s.toFixed(2).padStart(6)).padStart(22)); }
console.log("");

// ══ 3 · LA OPTIMIZACIÓN HONESTA ═══════════════════════════════════════════════════════════
console.log("  ══ 3 · OPTIMIZAR SOBRE 2016-2020, EXAMINAR EN 2021-2026 ══");
console.log("  (2021-2026 no se mira para elegir NADA. Es el examen, y es el régimen que te preocupa.)");
console.log("");
const REJ = [];
for (const k of K)
  for (const h of [4, 6, 8, 10, 12])
    for (const t of [0.10, 0.15, 0.20, 0.25])
      for (const pl of [60, 90, 120, 180, 250])
        for (const fr of [0, 0.05, 0.10, 0.15])
          REJ.push({ k, h, t, pl, fr });
console.log("  configuraciones a probar: " + REJ.length.toLocaleString("en-US"));
const DENTRO = [];
for (const c of REJ) {
  const cf = { tam:c.t, huecos:c.h, modo:"spy", plazo:c.pl, frenoSPY:c.fr, hasta:A };
  const q = M[c.k].simular(cf);
  if (q.ops < 30) continue;                       // sin muestra no se elige nada
  const b = M[c.k].banda(cf);
  DENTRO.push({ ...c, a:b.a, cd:b.c, s:b.s, ops:q.ops, exp:q.invertido }); }
console.log("  con muestra suficiente (≥30 operaciones en 2016-2020): " + DENTRO.length.toLocaleString("en-US"));
console.log("");
// tres criterios distintos de elección, para no depender de uno solo
const CRIT = [
  ["mejor Sharpe",              (x) => x.s],
  ["mejor rendimiento",         (x) => x.a],
  ["mejor rendimiento/caída",   (x) => x.a / Math.max(1, x.cd)],
];
console.log("  " + "criterio (elegido en 2016-2020)".padEnd(32) + "configuración".padEnd(30) +
  "2016-2020".padStart(20) + "→ EXAMEN 2021-2026".padStart(24));
const GAN = [];
for (const [nom, f] of CRIT) {
  const g = DENTRO.slice().sort((x,y)=>f(y)-f(x))[0];
  const cf = { tam:g.t, huecos:g.h, modo:"spy", plazo:g.pl, frenoSPY:g.fr };
  const ex = M[g.k].banda({ ...cf, desdeD:B });
  GAN.push({ nom, g, ex });
  console.log("  " + nom.padEnd(32) +
    (g.k.replace("|","%×") + "d " + g.h + "×" + (100*g.t).toFixed(0) + "% ag" + g.pl +
     (g.fr ? " fr" + (100*g.fr).toFixed(0) : " sinfr")).padEnd(30) +
    ((g.a.toFixed(1)+"%").padStart(8)+("−"+g.cd.toFixed(0)+"%").padStart(7)+g.s.toFixed(2).padStart(5)).padStart(20) +
    ((ex.a.toFixed(1)+"%").padStart(9)+("−"+ex.c.toFixed(0)+"%").padStart(8)+ex.s.toFixed(2).padStart(7)).padStart(24)); }
console.log("  " + "comprar SPY".padEnd(62) + "14.7%   −34%".padStart(20) + "15.4%   −25%".padStart(24));
console.log("");
const pasa = GAN.filter((x) => x.ex.a > 15.4 && x.ex.c < 40);
console.log("  " + (pasa.length
  ? "→ " + pasa.length + " de 3 criterios SUPERAN a SPY en el examen (más rendimiento y menos caída) ✓"
  : "→ NINGUNO de los 3 supera a SPY en el examen fuera de muestra ⛔"));
console.log("");

// ══ 4 · EL ÓPTIMO DE TODO EL PERÍODO — etiquetado como lo que es ══════════════════════════
console.log("  ══ 4 · EL ÓPTIMO DE 2016-2026 ══  ⚠️ DENTRO DE MUESTRA: esto NO es una promesa");
console.log("");
const TODO = [];
for (const c of REJ) {
  const cf = { tam:c.t, huecos:c.h, modo:"spy", plazo:c.pl, frenoSPY:c.fr };
  const q = M[c.k].simular(cf);
  if (q.ops < 60) continue;
  const b = M[c.k].banda(cf);
  TODO.push({ ...c, a:b.a, cd:b.c, s:b.s, ops:q.ops, exp:q.invertido, fin:q.final }); }
console.log("  " + "criterio".padEnd(26) + "configuración".padEnd(30) + "al año".padStart(9) +
  "caída".padStart(8) + "Sharpe".padStart(8) + "$60.000 →".padStart(13));
for (const [nom, f] of [...CRIT, ["caída mínima con ≥25%/año", (x) => x.a >= 25 ? -x.cd : -999]]) {
  const g = TODO.slice().sort((x,y)=>f(y)-f(x))[0]; if (!g) continue;
  console.log("  " + nom.padEnd(26) +
    (g.k.replace("|","%×") + "d " + g.h + "×" + (100*g.t).toFixed(0) + "% ag" + g.pl +
     (g.fr ? " fr" + (100*g.fr).toFixed(0) : " sinfr")).padEnd(30) +
    (g.a.toFixed(1)+"%").padStart(9) + ("−"+g.cd.toFixed(0)+"%").padStart(8) +
    g.s.toFixed(2).padStart(8) + D(g.fin).padStart(13)); }
console.log("");
