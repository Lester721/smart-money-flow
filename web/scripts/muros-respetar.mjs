// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿SON MUROS?  —  RESPETAR · la pregunta de Victor, medida.
//
// HIPÓTESIS: el precio rebota en el muro de calls por arriba y en el de puts por abajo.
//
// ═══ CÓMO SE MIDE ══════════════════════════════════════════════════════════════════════════
//
// TOQUE: el muro tiene que estar del lado que le toca (call por ENCIMA de la apertura de las
//   09:35, put por DEBAJO) y el precio tiene que llegar hasta él en alguna de las 78 barras de
//   5 minutos del día. Los días donde el muro nace del lado equivocado no entran: no hay nada
//   que respetar.
//
// LA CARRERA (así se decide rebote o rotura, y es SIMÉTRICA a propósito): desde la barra del
//   toque, ¿el precio llega antes a K+θ (ROTURA) o a K−θ (REBOTE)? Es una carrera de primer
//   paso: un nivel cualquiera, sin poder ninguno, da ~50/50. Por eso el número que importa no
//   es "rebota el 55%": es cuánto se separa ese 55% de lo que da una línea puesta al azar a la
//   misma distancia — que NO es 50%, porque al muro se llega con inercia y la inercia rompe.
//
//   Si la barra del toque ya está más allá de K+θ (se lo saltó de una), cuenta ROTURA. Es lo
//   honesto: con una orden esperando en K te llenaron y acto seguido se fue en contra.
//
// ARRASTRE: cuánto avanza después. Se guardan penetración máxima, rechazo máximo y —el que
//   se parece al dinero— el desplazamiento del nivel al cierre, con signo a favor del rebote.
//
// ═══ LOS TRES CONTROLES ════════════════════════════════════════════════════════════════════
//
//   C1  AZAR, 500 sorteos. Se barajan las DISTANCIAS entre días: el nivel del día j pasa a estar
//       a la distancia que tenía el muro del día σ(j). Misma distribución de distancias, misma
//       mecánica, cero relación con la gamma de ESE día. Es el control que decide.
//   C1s AZAR ESTRATIFICADO por decil de distancia. Baraja sólo dentro del decil, así que quita
//       el enredo "los días volátiles tienen el muro más cerca".
//   C2  VECINDAD. El mismo muro corrido ±5, ±10, ±15, ±20 puntos. Mismo día, mismo lado, casi
//       la misma distancia. Si el muro es un nivel de verdad, tiene que ganar a sus vecinos;
//       si la tasa es plana en toda la vecindad, lo que se mide es la distancia, no el muro.
//
// PARTICIÓN: A = 2022-2023 (469 días) · B = 2024-2026 (653 días). Todo se reporta en las dos
//   mitades por separado. Sólo cuenta lo que aparece en las DOS.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/muros-respetar.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/muros-camino.json", "utf8"));
const SALIDA = "scripts/muros-respetar.json";

const LENTES = ["gam", "gamD", "oi"];
const LADOS = [["call", 1], ["put", -1]];
const THETAS = [0.15, 0.25, 0.40];        // % de la apertura
const SORTEOS = 500;
const PRUEBAS_DECLARADAS = 24;            // 3 lentes × 2 lados × 3 θ  +  3 × 2 arrastre
const SEMILLA = 20260820;

// ── estadística ─────────────────────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN; };
const tUna = (v) => { const s = sd(v); return s > 0 ? media(v) / (s / Math.sqrt(v.length)) : 0; };
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "—");

/** LANZA si algo está muerto: un campo vacío devuelve 0 y 0 no da error. */
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

// azar reproducible
let _s = SEMILLA;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
function barajar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// ═══ DÍAS ══════════════════════════════════════════════════════════════════════════════════
const dias = [];
for (const f of N.filas) {
  const c = CAM[f.fecha];
  if (!c || c.s.length !== 78) continue;
  dias.push({
    fecha: f.fecha, per: f.fecha < "2024-01-01" ? "A" : "B",
    ap: f.apertura, cierre: f.cierre,
    s: Float64Array.from(c.s),
    razon: f.spy?.razonSPX ?? null,
    niv: f.niveles,
  });
}
exigir(dias.length > 1000, `sólo ${dias.length} días con camino de 78 barras`);
exigir(dias.some((d) => d.per === "A") && dias.some((d) => d.per === "B"), "falta una mitad");

// ═══ EL MOTOR: toque + carrera + arrastre ══════════════════════════════════════════════════
/**
 * @param s     camino de 78 precios (09:35 → 16:00)
 * @param K     nivel
 * @param sg    +1 muro de calls (arriba)  ·  −1 muro de puts (abajo)
 * @param th    θ en puntos
 * @returns null si no lo toca; si no, el desenlace.
 */
function carrera(s, K, sg, th) {
  let i0 = -1;
  for (let i = 0; i < s.length; i++) { if (sg > 0 ? s[i] >= K : s[i] <= K) { i0 = i; break; } }
  if (i0 < 0) return null;
  const arriba = K + th, abajo = K - th;
  let res = "abierto", iFin = s.length - 1;
  for (let i = i0; i < s.length; i++) {
    const p = s[i];
    if (sg > 0) { if (p >= arriba) { res = "rotura"; iFin = i; break; } if (p <= abajo) { res = "rebote"; iFin = i; break; } }
    else { if (p <= abajo) { res = "rotura"; iFin = i; break; } if (p >= arriba) { res = "rebote"; iFin = i; break; } }
  }
  // arrastre: penetración y rechazo máximos DESDE el toque
  let pen = 0, rec = 0;
  for (let i = i0; i < s.length; i++) {
    const e = sg > 0 ? s[i] - K : K - s[i];      // + = más allá del muro
    if (e > pen) pen = e;
    if (-e > rec) rec = -e;
  }
  // desplazamiento del nivel al cierre, con signo A FAVOR del rebote
  const aCierre = sg > 0 ? K - s[s.length - 1] : s[s.length - 1] - K;
  return { i0, res, iFin, pen, rec, aCierre, saltado: (sg > 0 ? s[i0] >= arriba : s[i0] <= abajo) };
}

/** Mide una colección de (día, nivel) y devuelve las cifras agregadas. */
function medir(items, thPct) {
  let nToca = 0, nRebote = 0, nRotura = 0, nAbierto = 0, nSaltado = 0;
  const aCierre = [], aCierrePct = [], pen = [], rec = [], minutos = [];
  for (const { d, K, sg } of items) {
    const th = (thPct / 100) * d.ap;
    const r = carrera(d.s, K, sg, th);
    if (!r) continue;
    nToca++;
    if (r.res === "rebote") nRebote++; else if (r.res === "rotura") nRotura++; else nAbierto++;
    if (r.saltado) nSaltado++;
    aCierre.push(r.aCierre);
    aCierrePct.push((100 * r.aCierre) / d.ap);
    pen.push(r.pen); rec.push(r.rec); minutos.push(r.i0 * 5);
  }
  const dec = nRebote + nRotura;
  return {
    nCand: items.length, nToca, tocaPct: (100 * nToca) / items.length,
    nRebote, nRotura, nAbierto, nSaltado, dec,
    rebPct: dec ? (100 * nRebote) / dec : NaN,
    aCierreMedia: media(aCierre), aCierreT: tUna(aCierre),
    aCierrePctMedia: media(aCierrePct), aCierrePctT: tUna(aCierrePct),
    penP50: pct(pen, 0.5), recP50: pct(rec, 0.5), minP50: pct(minutos, 0.5),
    _aCierre: aCierre,
  };
}

/** Los días candidatos de una lente/lado: muro del lado correcto. */
function candidatos(lente, lado, sg, per) {
  const campo = lado === "call" ? "muroCall" : "muroPut";
  const dcampo = lado === "call" ? "dMuroCall" : "dMuroPut";
  const out = [];
  for (const d of dias) {
    if (per !== "T" && d.per !== per) continue;
    const K = d.niv[lente][campo], dd = d.niv[lente][dcampo]?.pts;
    if (K == null || dd == null || dd === 0 || Math.sign(dd) !== sg) continue;
    out.push({ d, K, sg, dist: Math.abs(dd) });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log(`¿SON MUROS?  ·  ${dias.length} días  ·  ${dias[0].fecha} → ${dias.at(-1).fecha}`);
console.log(`decisión 09:35 · camino de 5 min · ${SORTEOS} sorteos de azar · listón |t| ≥ ${LISTON} (${PRUEBAS_DECLARADAS} pruebas declaradas)`);
console.log(`${"═".repeat(100)}`);

const R = {};

// ── TABLA 1 · el hallazgo bruto y el control del azar ──────────────────────────────────────
for (const thPct of THETAS) {
  console.log(`\n\n## θ = ${thPct}% de la apertura  (${f1((thPct / 100) * 5500)} pts a SPX 5500)`);
  console.log(`   la carrera: desde el toque, ¿llega antes a K+θ (rotura) o a K−θ (rebote)?\n`);
  console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ${"cand".padStart(5)} ${"toca".padStart(11)} ${"decid".padStart(6)} ${"REBOTE".padStart(7)}  ║ ${"azar C1".padStart(8)} ${"z".padStart(6)} ${"pctil".padStart(6)} ║ ${"azar C1s".padStart(8)} ${"z".padStart(6)}`);
  console.log(`   ${"─".repeat(96)}`);

  for (const lente of LENTES) {
    for (const [lado, sg] of LADOS) {
      for (const per of ["A", "B", "T"]) {
        const cand = candidatos(lente, lado, sg, per);
        if (cand.length < 30) continue;
        const real = medir(cand, thPct);
        if (real.dec < 20) { console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${String(cand.length).padStart(5)} ${`${real.nToca} (${f1(real.tocaPct)}%)`.padStart(11)} ${String(real.dec).padStart(6)}   MUESTRA INSUFICIENTE`); continue; }

        // ── C1: barajar distancias entre días ──
        const ds = cand.map((c) => c.dist);
        const reb1 = [], cie1 = [];
        for (let k = 0; k < SORTEOS; k++) {
          const p = barajar(ds);
          const m = medir(cand.map((c, i) => ({ d: c.d, K: c.d.ap + sg * p[i], sg })), thPct);
          if (m.dec >= 5) { reb1.push(m.rebPct); cie1.push(m.aCierrePctMedia); }
        }
        // ── C1s: barajar sólo dentro del decil de distancia ──
        const orden = cand.map((c, i) => i).sort((a, b) => cand[a].dist - cand[b].dist);
        const grupos = [];
        for (let g = 0; g < 10; g++) grupos.push(orden.slice(Math.floor((g * orden.length) / 10), Math.floor(((g + 1) * orden.length) / 10)));
        const reb1s = [];
        for (let k = 0; k < SORTEOS; k++) {
          const niv = new Array(cand.length);
          for (const g of grupos) { const p = barajar(g.map((i) => cand[i].dist)); g.forEach((i, j) => { niv[i] = cand[i].d.ap + sg * p[j]; }); }
          const m = medir(cand.map((c, i) => ({ d: c.d, K: niv[i], sg })), thPct);
          if (m.dec >= 5) reb1s.push(m.rebPct);
        }
        const z = (x, arr) => { const s = sd(arr); return s > 0 ? (x - media(arr)) / s : 0; };
        const pctil = (100 * reb1.filter((x) => x <= real.rebPct).length) / reb1.length;

        R[`${lente}|${lado}|${per}|${thPct}`] = {
          ...real, _aCierre: undefined,
          azarReb: media(reb1), azarRebSD: sd(reb1), z: z(real.rebPct, reb1), pctil,
          azarRebS: media(reb1s), zS: z(real.rebPct, reb1s),
          azarCierrePct: media(cie1), azarCierreSD: sd(cie1), zCierre: z(real.aCierrePctMedia, cie1),
        };
        const marca = Math.abs(z(real.rebPct, reb1)) >= LISTON && Math.abs(z(real.rebPct, reb1s)) >= LISTON ? " ◄" : "";
        console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${String(cand.length).padStart(5)} ${`${real.nToca} (${f1(real.tocaPct)}%)`.padStart(11)} ${String(real.dec).padStart(6)} ${(f1(real.rebPct) + "%").padStart(7)}  ║ ${(f1(media(reb1)) + "%").padStart(8)} ${f2(z(real.rebPct, reb1)).padStart(6)} ${(f1(pctil)).padStart(6)} ║ ${(f1(media(reb1s)) + "%").padStart(8)} ${f2(z(real.rebPct, reb1s)).padStart(6)}${marca}`);
      }
    }
  }
}

// ── TABLA 2 · el arrastre: cuánto avanza después de tocar ──────────────────────────────────
console.log(`\n\n## ARRASTRE — cuánto avanza el precio DESPUÉS de tocar el muro`);
console.log(`   "al cierre" = puntos del nivel al cierre CON SIGNO A FAVOR DEL REBOTE (+ = se dio la vuelta).`);
console.log(`   Es el número con forma de dinero: es lo que gana quien vende en el muro de calls y aguanta.\n`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ${"n".padStart(5)} ${"al cierre".padStart(10)} ${"t".padStart(6)} ${"%".padStart(7)} ║ ${"azar".padStart(8)} ${"z vs azar".padStart(9)} ║ ${"penetra".padStart(8)} ${"rechazo".padStart(8)} ${"1er toque".padStart(9)}`);
console.log(`   ${"─".repeat(98)}`);
for (const lente of LENTES) {
  for (const [lado, sg] of LADOS) {
    for (const per of ["A", "B", "T"]) {
      const k = `${lente}|${lado}|${per}|0.25`;
      const r = R[k];
      if (!r) continue;
      const marca = Math.abs(r.zCierre) >= LISTON && Math.abs(r.aCierrePctT) >= LISTON ? " ◄" : "";
      console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${String(r.nToca).padStart(5)} ${(f1(r.aCierreMedia) + " pt").padStart(10)} ${f2(r.aCierrePctT).padStart(6)} ${(f3(r.aCierrePctMedia) + "%").padStart(7)} ║ ${(f3(r.azarCierrePct) + "%").padStart(8)} ${f2(r.zCierre).padStart(9)} ║ ${(f1(r.penP50) + " pt").padStart(8)} ${(f1(r.recP50) + " pt").padStart(8)} ${(r.minP50 + " min").padStart(9)}${marca}`);
    }
  }
}

// ── TABLA 3 · VECINDAD: ¿la tasa hace pico EN el muro? ─────────────────────────────────────
console.log(`\n\n## C2 · VECINDAD — el mismo muro corrido unos puntos. Mismo día, mismo lado, casi la misma distancia.`);
console.log(`   Si la tasa de rebote es plana por toda la vecindad, lo que separa es la DISTANCIA, no el muro.\n`);
const OFF = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ${OFF.map((o) => (o === 0 ? "MURO" : (o > 0 ? "+" : "") + o).padStart(7)).join("")}`);
console.log(`   ${"─".repeat(81)}`);
const VEC = {};
for (const lente of LENTES) {
  for (const [lado, sg] of LADOS) {
    for (const per of ["A", "B", "T"]) {
      const cand = candidatos(lente, lado, sg, per);
      if (cand.length < 30) continue;
      const fila = [], filaN = [];
      for (const o of OFF) {
        const m = medir(cand.map((c) => ({ d: c.d, K: c.K + sg * o, sg })), 0.25);
        fila.push(m.dec >= 20 ? m.rebPct : NaN); filaN.push(m.dec);
      }
      if (!Number.isFinite(fila[4])) continue;
      VEC[`${lente}|${lado}|${per}`] = { off: OFF, reb: fila, n: filaN };
      console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${fila.map((x, i) => (i === 4 ? `[${f1(x)}]` : f1(x)).padStart(7)).join("")}`);
    }
  }
}

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, sorteos: SORTEOS, carrera: R, vecindad: VEC }, null, 1));
console.log(`\n   escrito ${SALIDA}\n`);
