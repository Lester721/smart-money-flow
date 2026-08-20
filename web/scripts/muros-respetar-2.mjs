// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿SON MUROS?  ·  SEGUNDA VUELTA — lo que a la primera le faltaba.
//
// La primera vuelta (muros-respetar.mjs) midió la carrera rebote/rotura sobre el camino de
// 5 MINUTOS del SPX y salió que el muro no para el precio. Antes de firmar eso hay cuatro
// agujeros que taparlo, y los cuatro pueden dar la vuelta al resultado:
//
//   1. RESOLUCIÓN. Con barras de 5 minutos un toque de dos minutos se pierde entero, y cuando
//      se ve, se ve ya penetrado. Aquí se repite la misma carrera sobre el MINUTO A MINUTO de
//      SPY (1.052 de los 1.122 días) — 391 puntos en vez de 78. Si el muro paraba el precio y
//      el muestreo lo tapaba, aquí aparece.
//
//   2. EL VEHÍCULO. SPY es lo que Lester puede comprar. El camino de SPY se lleva a puntos de
//      SPX con la razón DEL DÍA (no un 10 fijo) y se valida el error de esa conversión contra
//      el cierre real de la cadena antes de usarla para nada.
//
//   3. EL ARRASTRE PARTIDO. "Cuánto avanza después" no es un número: son dos. Cuánto se aleja
//      cuando rebota y cuánto sigue cuando rompe — cada uno contra su azar.
//
//   4. EL MECANISMO. La versión FUERTE de lo que dice Victor no es "el muro para siempre": es
//      "el muro para cuando el creador está LARGO de gamma". Con gamma neta negativa el creador
//      persigue el precio y el muro tiene que romperse. Eso es una predicción con signo, y se
//      mide por terciles de gamma neta (tres tercios, no dos mitades) y por signo puro — que no
//      se ajusta a nada.
//
// Y encima de todo: FUERA DE MUESTRA EN LAS DOS DIRECCIONES. Se elige la mejor casilla en
// 2022-2023 y se mira qué hace en 2024-2026; y al revés. Sólo cuenta lo que aparece en las dos.
//
// PRECIOS: el camino es spot (índice SPX / SPY). El peaje de SPY —1 céntimo de horquilla— NO
// está en esta caché: se declara como SUPUESTO (SPY cotiza a un céntimo en horario regular) y
// se dice que es un supuesto, no una cotización medida. El resultado bruto ya sale con el signo
// en contra, así que ningún supuesto de peaje lo salva.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/muros-respetar-2.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/muros-camino.json", "utf8"));
const SALIDA = "scripts/muros-respetar-2.json";

const LENTES = ["gam", "gamD", "oi"];
const LADOS = [["call", 1], ["put", -1]];
const TH = 0.25;                 // θ en % de la apertura — el central de la primera vuelta
const SORTEOS = 500;
const SEMILLA = 20260820;
const CUENTA = 56389;            // la cuenta de Lester
const HORQUILLA_SPY = 0.01;      // SUPUESTO declarado, no medido: SPY cotiza a un céntimo en RTH

// pruebas declaradas: 6 resolución + 18 carrera(3 lentes×2 lados×3 per) + 12 arrastre partido
// + 18 mecanismo(3 terciles×3 lentes×2 lados) = 54
const PRUEBAS = 54;

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
const LISTON = listonT(PRUEBAS);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : "—");
const eur = (x) => (Number.isFinite(x) ? `$${Math.round(x).toLocaleString("es-ES")}` : "—");
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

let _s = SEMILLA;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
function barajar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// ═══ SPY MINUTO A MINUTO ═══════════════════════════════════════════════════════════════════
// Minuto 570 = 09:30 · 575 = 09:35 (momento de decisión) · 960 = 16:00.
const spyPorDia = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const p = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (existsSync(p)) Object.assign(spyPorDia, JSON.parse(readFileSync(p, "utf8")));
}
exigir(Object.keys(spyPorDia).length > 1000, `SPY minuto a minuto: sólo ${Object.keys(spyPorDia).length} días`);

// ═══ DÍAS ══════════════════════════════════════════════════════════════════════════════════
const dias = [];
let sinSPY = 0, sinCamino = 0;
for (const f of N.filas) {
  const c = CAM[f.fecha];
  if (!c || c.s.length !== 78) { sinCamino++; continue; }
  const bruto = spyPorDia[f.fecha.replace(/-/g, "")];
  const razon = f.spy?.razonSPX ?? null;
  let sSpy = null;
  if (bruto && razon > 0) {
    // camino de SPY desde el minuto 575 (09:35), llevado a puntos de SPX con la razón del día
    const arr = [];
    for (const [t, p] of bruto) if (t >= 575 && p > 0) arr.push(p * razon);
    if (arr.length >= 300) sSpy = Float64Array.from(arr);
  }
  if (!sSpy) sinSPY++;
  dias.push({
    fecha: f.fecha, per: f.fecha < "2024-01-01" ? "A" : "B",
    ap: f.apertura, cierre: f.cierre,
    s5: Float64Array.from(c.s),           // SPX, 78 barras de 5 min
    sM: sSpy,                             // SPY→SPX, ~386 barras de 1 min
    razon, niv: f.niveles,
  });
}
exigir(dias.length > 1000, `sólo ${dias.length} días`);
const conM = dias.filter((d) => d.sM);
exigir(conM.length > 900, `sólo ${conM.length} días con minuto a minuto`);

// ═══ 0 · RADIOGRAFÍA DE LA PIEZA NUEVA ═════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log(`¿SON MUROS? · SEGUNDA VUELTA · ${dias.length} días · ${dias[0].fecha} → ${dias.at(-1).fecha}`);
console.log(`listón |z| ≥ ${LISTON} (${PRUEBAS} pruebas declaradas) · ${SORTEOS} sorteos · θ = ${TH}% de la apertura`);
console.log(`${"═".repeat(100)}`);

console.log(`\n## 0 · RADIOGRAFÍA DEL MINUTO A MINUTO  (se mira ANTES de medir con él)\n`);
console.log(`   días con camino de 5 min .............. ${dias.length}   (${sinCamino} descartados)`);
console.log(`   días con minuto a minuto de SPY ....... ${conM.length}   (${sinSPY} sin él — se dicen, no se rellenan)`);
const largos = {}; for (const d of conM) largos[d.sM.length] = (largos[d.sM.length] || 0) + 1;
console.log(`   longitud del camino de minuto ......... ${Object.entries(largos).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}→${v}d`).join(" · ")}`);
const razones = conM.map((d) => d.razon);
console.log(`   razón SPX/SPY ......................... p05 ${f2(pct(razones, 0.05))} · p50 ${f2(pct(razones, 0.5))} · p95 ${f2(pct(razones, 0.95))}`);

// VALIDACIÓN de la conversión: ¿cuánto se despega SPY×razón del SPX real a lo largo del día?
const errAp = [], errCie = [];
for (const d of conM) {
  errAp.push(Math.abs(d.sM[0] - d.ap));
  errCie.push(Math.abs(d.sM[d.sM.length - 1] - d.cierre));
}
console.log(`   |SPY×razón − SPX| a las 09:35 ......... p50 ${f2(pct(errAp, 0.5))} · p90 ${f2(pct(errAp, 0.9))} pts   (calibrado ahí: tiene que ser ~0)`);
console.log(`   |SPY×razón − SPX| al cierre ........... p50 ${f2(pct(errCie, 0.5))} · p90 ${f2(pct(errCie, 0.9))} pts   (la deriva de seguimiento del día)`);
const thPts = (TH / 100) * media(conM.map((d) => d.ap));
console.log(`   θ = ${TH}% ≈ ${f1(thPts)} pts   →  la deriva es el ${f1((100 * pct(errCie, 0.5)) / thPts)}% de θ`);
exigir(pct(errAp, 0.9) < 1.0, `la conversión no calibra a las 09:35 (p90 = ${pct(errAp, 0.9)})`);
if (pct(errCie, 0.5) > thPts * 0.35)
  console.log(`   ⚠️  la deriva de seguimiento no es despreciable frente a θ: el resultado de SPY es una APROXIMACIÓN.`);

// ═══ EL MOTOR ══════════════════════════════════════════════════════════════════════════════
/** Carrera de primer paso desde el toque: ¿K+θ (rotura) antes que K−θ (rebote)? */
function carrera(s, K, sg, th) {
  const n = s.length;
  let i0 = -1;
  for (let i = 0; i < n; i++) { if (sg > 0 ? s[i] >= K : s[i] <= K) { i0 = i; break; } }
  if (i0 < 0) return null;
  const arriba = K + th, abajo = K - th;
  let res = "abierto";
  for (let i = i0; i < n; i++) {
    const p = s[i];
    if (sg > 0) { if (p >= arriba) { res = "rotura"; break; } if (p <= abajo) { res = "rebote"; break; } }
    else { if (p <= abajo) { res = "rotura"; break; } if (p >= arriba) { res = "rebote"; break; } }
  }
  let pen = 0, rec = 0;
  for (let i = i0; i < n; i++) {
    const e = sg > 0 ? s[i] - K : K - s[i];
    if (e > pen) pen = e;
    if (-e > rec) rec = -e;
  }
  const aCierre = sg > 0 ? K - s[n - 1] : s[n - 1] - K;
  return { i0, res, pen, rec, aCierre, saltado: sg > 0 ? s[i0] >= arriba : s[i0] <= abajo };
}

/** Mide una lista de {d,K,sg}. campo = "s5" | "sM". */
function medir(items, campo, thPct = TH) {
  let nToca = 0, nReb = 0, nRot = 0, nAb = 0, nSalt = 0;
  const aCierre = [], aCierrePct = [], penRot = [], recReb = [], cieReb = [], cieRot = [], tocaMin = [];
  for (const { d, K, sg } of items) {
    const s = d[campo];
    if (!s) continue;
    const th = (thPct / 100) * d.ap;
    const r = carrera(s, K, sg, th);
    if (!r) continue;
    nToca++;
    if (r.saltado) nSalt++;
    aCierre.push(r.aCierre); aCierrePct.push((100 * r.aCierre) / d.ap);
    tocaMin.push(campo === "sM" ? r.i0 : r.i0 * 5);
    if (r.res === "rebote") { nReb++; recReb.push(r.rec); cieReb.push(r.aCierre); }
    else if (r.res === "rotura") { nRot++; penRot.push(r.pen); cieRot.push(r.aCierre); }
    else nAb++;
  }
  const dec = nReb + nRot;
  return {
    nCand: items.length, nToca, tocaPct: (100 * nToca) / items.length, nReb, nRot, nAb, nSalt, dec,
    rebPct: dec ? (100 * nReb) / dec : NaN, saltPct: nToca ? (100 * nSalt) / nToca : NaN,
    aCierreMedia: media(aCierre), aCierrePctMedia: media(aCierrePct), aCierreT: tUna(aCierrePct),
    recRebP50: pct(recReb, 0.5), recRebMedia: media(recReb),
    penRotP50: pct(penRot, 0.5), penRotMedia: media(penRot),
    cieRebMedia: media(cieReb), cieRotMedia: media(cieRot),
    tocaMinP50: pct(tocaMin, 0.5),
    _aCierre: aCierre,
  };
}

/** Candidatos: el muro del lado que le toca. filtro opcional sobre el día. */
function candidatos(lente, lado, sg, per, filtro = null, campo = "sM") {
  const kM = lado === "call" ? "muroCall" : "muroPut";
  const kD = lado === "call" ? "dMuroCall" : "dMuroPut";
  const out = [];
  for (const d of dias) {
    if (per !== "T" && d.per !== per) continue;
    if (campo === "sM" && !d.sM) continue;
    const K = d.niv[lente][kM], dd = d.niv[lente][kD]?.pts;
    if (K == null || dd == null || dd === 0 || Math.sign(dd) !== sg) continue;
    if (filtro && !filtro(d, lente)) continue;
    out.push({ d, K, sg, dist: Math.abs(dd) });
  }
  return out;
}

/** Control del azar: baraja las distancias entre días. Devuelve {z, pctil, azar, azarSD} de rebPct. */
function contraAzar(cand, campo, estratificado = false, extractor = (m) => m.rebPct) {
  const ds = cand.map((c) => c.dist);
  const vals = [];
  let grupos = null;
  if (estratificado) {
    const orden = cand.map((c, i) => i).sort((a, b) => cand[a].dist - cand[b].dist);
    grupos = [];
    for (let g = 0; g < 10; g++) grupos.push(orden.slice(Math.floor((g * orden.length) / 10), Math.floor(((g + 1) * orden.length) / 10)));
  }
  for (let k = 0; k < SORTEOS; k++) {
    let niv;
    if (estratificado) {
      niv = new Array(cand.length);
      for (const g of grupos) { const p = barajar(g.map((i) => cand[i].dist)); g.forEach((i, j) => { niv[i] = cand[i].d.ap + cand[i].sg * p[j]; }); }
    } else {
      const p = barajar(ds);
      niv = cand.map((c, i) => c.d.ap + c.sg * p[i]);
    }
    const m = medir(cand.map((c, i) => ({ d: c.d, K: niv[i], sg: c.sg })), campo);
    if (m.dec >= 5) { const v = extractor(m); if (Number.isFinite(v)) vals.push(v); }
  }
  return { vals, azar: media(vals), azarSD: sd(vals) };
}
const zDe = (x, { azar, azarSD }) => (azarSD > 0 ? (x - azar) / azarSD : NaN);
const pctilDe = (x, { vals }) => (vals.length ? (100 * vals.filter((v) => v <= x).length) / vals.length : NaN);

// ═══ 1 · ¿ERA EL MUESTREO? — 5 minutos contra 1 minuto, los MISMOS días ════════════════════
console.log(`\n\n## 1 · ¿ERA EL MUESTREO?  la misma carrera sobre 78 barras de 5 min y sobre ~386 de 1 min`);
console.log(`   Mismos ${conM.length} días en las dos columnas. Si el muro paraba el precio y las barras de 5 min lo`);
console.log(`   tapaban, la tasa de rebote tiene que SUBIR al mirar el minuto.\n`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ║ ${"toca 5m".padStart(12)} ${"rebote".padStart(7)} ${"saltado".padStart(8)} ║ ${"toca 1m".padStart(12)} ${"rebote".padStart(7)} ${"saltado".padStart(8)} ║ ${"1er toque".padStart(9)}`);
console.log(`   ${"─".repeat(96)}`);
const RES = {};
for (const lente of LENTES) {
  for (const [lado, sg] of LADOS) {
    const cand = candidatos(lente, lado, sg, "T", null, "sM");
    if (cand.length < 30) continue;
    const a = medir(cand, "s5"), b = medir(cand, "sM");
    RES[`${lente}|${lado}`] = { cinco: a, uno: b, n: cand.length };
    console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ║ ${`${a.nToca} (${f1(a.tocaPct)}%)`.padStart(12)} ${(f1(a.rebPct) + "%").padStart(7)} ${(f1(a.saltPct) + "%").padStart(8)} ║ ${`${b.nToca} (${f1(b.tocaPct)}%)`.padStart(12)} ${(f1(b.rebPct) + "%").padStart(7)} ${(f1(b.saltPct) + "%").padStart(8)} ║ ${(b.tocaMinP50 + " min").padStart(9)}`);
  }
}

// ═══ 2 · LA CARRERA CONTRA EL AZAR, AL MINUTO ══════════════════════════════════════════════
console.log(`\n\n## 2 · REBOTE CONTRA EL AZAR — al minuto, en el vehículo que Lester puede comprar`);
console.log(`   Un nivel sin poder ninguno NO da 50%: al muro se llega con inercia y la inercia rompe.`);
console.log(`   Lo que decide es la distancia entre el muro real y una línea al azar a la misma distancia.\n`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ${"cand".padStart(5)} ${"toca".padStart(12)} ${"decid".padStart(6)} ${"REBOTE".padStart(7)} ║ ${"azar".padStart(7)} ${"z".padStart(6)} ${"pctil".padStart(6)} ║ ${"azar estr".padStart(9)} ${"z".padStart(6)}`);
console.log(`   ${"─".repeat(98)}`);
const CARRERA = {};
for (const lente of LENTES) {
  for (const [lado, sg] of LADOS) {
    for (const per of ["A", "B", "T"]) {
      const cand = candidatos(lente, lado, sg, per, null, "sM");
      if (cand.length < 30) continue;
      const real = medir(cand, "sM");
      if (real.dec < 20) { console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${String(cand.length).padStart(5)} ${`${real.nToca} (${f1(real.tocaPct)}%)`.padStart(12)} ${String(real.dec).padStart(6)}   MUESTRA INSUFICIENTE`); continue; }
      const c1 = contraAzar(cand, "sM", false), c1s = contraAzar(cand, "sM", true);
      const z = zDe(real.rebPct, c1), zs = zDe(real.rebPct, c1s), p = pctilDe(real.rebPct, c1);
      CARRERA[`${lente}|${lado}|${per}`] = { ...real, _aCierre: undefined, azar: c1.azar, azarSD: c1.azarSD, z, azarS: c1s.azar, zS: zs, pctil: p };
      const marca = Math.abs(z) >= LISTON && Math.abs(zs) >= LISTON ? " ◄" : "";
      console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${String(cand.length).padStart(5)} ${`${real.nToca} (${f1(real.tocaPct)}%)`.padStart(12)} ${String(real.dec).padStart(6)} ${(f1(real.rebPct) + "%").padStart(7)} ║ ${(f1(c1.azar) + "%").padStart(7)} ${f2(z).padStart(6)} ${f1(p).padStart(6)} ║ ${(f1(c1s.azar) + "%").padStart(9)} ${f2(zs).padStart(6)}${marca}`);
    }
  }
}

// ═══ 3 · EL ARRASTRE PARTIDO POR DESENLACE ═════════════════════════════════════════════════
console.log(`\n\n## 3 · CUÁNTO AVANZA DESPUÉS DE TOCAR — partido en los dos casos`);
console.log(`   REBOTA → cuánto se aleja del muro (rechazo máximo) y dónde cierra.`);
console.log(`   ROMPE  → cuánto sigue más allá (penetración máxima) y dónde cierra.`);
console.log(`   "cierre" con signo A FAVOR del rebote: + = el muro le dio la vuelta al día.\n`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ║ ${"n reb".padStart(6)} ${"rechazo".padStart(8)} ${"cierre".padStart(8)} ║ ${"n rot".padStart(6)} ${"penetra".padStart(8)} ${"cierre".padStart(8)} ║ ${"cierre todo".padStart(11)} ${"t".padStart(6)} ${"azar".padStart(8)} ${"z".padStart(6)}`);
console.log(`   ${"─".repeat(104)}`);
const ARR = {};
for (const lente of LENTES) {
  for (const [lado, sg] of LADOS) {
    for (const per of ["A", "B", "T"]) {
      const cand = candidatos(lente, lado, sg, per, null, "sM");
      if (cand.length < 30) continue;
      const r = medir(cand, "sM");
      if (r.dec < 20) continue;
      const cAz = contraAzar(cand, "sM", false, (m) => m.aCierrePctMedia);
      const zC = zDe(r.aCierrePctMedia, cAz);
      ARR[`${lente}|${lado}|${per}`] = {
        nReb: r.nReb, nRot: r.nRot, recRebP50: r.recRebP50, penRotP50: r.penRotP50,
        cieRebMedia: r.cieRebMedia, cieRotMedia: r.cieRotMedia,
        aCierreMedia: r.aCierreMedia, aCierrePctMedia: r.aCierrePctMedia, aCierreT: r.aCierreT,
        azarCierre: cAz.azar, zCierre: zC,
      };
      const marca = Math.abs(zC) >= LISTON && Math.abs(r.aCierreT) >= LISTON ? " ◄" : "";
      console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ║ ${String(r.nReb).padStart(6)} ${(f1(r.recRebP50) + " pt").padStart(8)} ${(f1(r.cieRebMedia) + " pt").padStart(8)} ║ ${String(r.nRot).padStart(6)} ${(f1(r.penRotP50) + " pt").padStart(8)} ${(f1(r.cieRotMedia) + " pt").padStart(8)} ║ ${(f1(r.aCierreMedia) + " pt").padStart(11)} ${f2(r.aCierreT).padStart(6)} ${(f3(cAz.azar) + "%").padStart(8)} ${f2(zC).padStart(6)}${marca}`);
    }
  }
}

// ═══ 4 · EL MECANISMO — ¿para el muro cuando el creador está LARGO de gamma? ════════════════
console.log(`\n\n## 4 · EL MECANISMO — la versión FUERTE de lo que dice Victor`);
console.log(`   Si el muro para el precio es porque el creador está LARGO de gamma y vende arriba / compra`);
console.log(`   abajo. Con gamma neta NEGATIVA persigue el precio y el muro tiene que ROMPERSE. Es una`);
console.log(`   predicción con signo: la tasa de rebote tiene que SUBIR del tercil bajo al alto.\n`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ${"tercil".padEnd(7)} ${"cand".padStart(5)} ${"decid".padStart(6)} ${"REBOTE".padStart(7)} ║ ${"azar".padStart(7)} ${"z".padStart(6)} ${"pctil".padStart(6)}`);
console.log(`   ${"─".repeat(84)}`);
const MEC = {};
for (const lente of LENTES) {
  if (lente === "oi") continue;                     // oi puro no tiene gamma neta: no aplica
  for (const [lado, sg] of LADOS) {
    for (const per of ["A", "B"]) {
      // terciles de gamma neta por punto, DENTRO del período (la gamma en dólares crece con el índice)
      const base = candidatos(lente, lado, sg, per, null, "sM");
      if (base.length < 90) continue;
      const netos = base.map((c) => c.d.niv[lente].netPunto).filter(Number.isFinite).sort((a, b) => a - b);
      if (netos.length < base.length) { console.log(`   ${lente} ${lado} ${per}: netPunto ausente en ${base.length - netos.length} días — se dice, no se rellena`); }
      const c1 = netos[Math.floor(netos.length / 3)], c2 = netos[Math.floor((2 * netos.length) / 3)];
      const tercios = [["bajo", (v) => v <= c1], ["medio", (v) => v > c1 && v <= c2], ["alto", (v) => v > c2]];
      const fila = [];
      for (const [nom, test] of tercios) {
        const cand = base.filter((c) => test(c.d.niv[lente].netPunto));
        if (cand.length < 25) { fila.push(null); continue; }
        const r = medir(cand, "sM");
        if (r.dec < 15) { fila.push(null); continue; }
        const az = contraAzar(cand, "sM", false);
        const z = zDe(r.rebPct, az), p = pctilDe(r.rebPct, az);
        fila.push({ nom, n: cand.length, dec: r.dec, rebPct: r.rebPct, azar: az.azar, z, pctil: p });
        console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${nom.padEnd(7)} ${String(cand.length).padStart(5)} ${String(r.dec).padStart(6)} ${(f1(r.rebPct) + "%").padStart(7)} ║ ${(f1(az.azar) + "%").padStart(7)} ${f2(z).padStart(6)} ${f1(p).padStart(6)}`);
      }
      MEC[`${lente}|${lado}|${per}`] = fila;
      const v = fila.filter(Boolean).map((x) => x.rebPct);
      if (v.length === 3) {
        const mono = (v[0] <= v[1] && v[1] <= v[2]) ? "SUBE (a favor)" : (v[0] >= v[1] && v[1] >= v[2]) ? "BAJA (en contra)" : "no monótono";
        console.log(`   ${" ".repeat(19)}→ bajo→alto: ${mono}  (${v.map((x) => f1(x) + "%").join(" → ")})`);
      }
    }
  }
}
// signo puro — no se ajusta nada
console.log(`\n   SIGNO PURO de la gamma neta (sin terciles, sin ajustar nada):`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ${"signo".padEnd(8)} ${"cand".padStart(5)} ${"decid".padStart(6)} ${"REBOTE".padStart(7)} ║ ${"azar".padStart(7)} ${"z".padStart(6)}`);
const SIGNO = {};
for (const lente of ["gam", "gamD"]) {
  for (const [lado, sg] of LADOS) {
    for (const per of ["A", "B"]) {
      for (const [nom, test] of [["neta>0", (v) => v > 0], ["neta<0", (v) => v <= 0]]) {
        const cand = candidatos(lente, lado, sg, per, (d, L) => test(d.niv[L].netPunto), "sM");
        if (cand.length < 25) continue;
        const r = medir(cand, "sM");
        if (r.dec < 15) continue;
        const az = contraAzar(cand, "sM", false);
        const z = zDe(r.rebPct, az);
        SIGNO[`${lente}|${lado}|${per}|${nom}`] = { n: cand.length, dec: r.dec, rebPct: r.rebPct, azar: az.azar, z };
        console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${nom.padEnd(8)} ${String(cand.length).padStart(5)} ${String(r.dec).padStart(6)} ${(f1(r.rebPct) + "%").padStart(7)} ║ ${(f1(az.azar) + "%").padStart(7)} ${f2(z).padStart(6)}`);
      }
    }
  }
}

// ═══ 5 · FUERA DE MUESTRA EN LAS DOS DIRECCIONES ═══════════════════════════════════════════
console.log(`\n\n## 5 · FUERA DE MUESTRA EN LAS DOS DIRECCIONES`);
console.log(`   Se elige la casilla con |z| mayor en una mitad y se mira qué hace en la OTRA, que no votó.`);
console.log(`   Un hallazgo de verdad aparece en las dos. Uno elegido a posteriori sólo aparece donde se eligió.\n`);
const OOS = {};
for (const [origen, destino] of [["A", "B"], ["B", "A"]]) {
  const cel = Object.entries(CARRERA).filter(([k]) => k.endsWith(`|${origen}`));
  if (!cel.length) continue;
  cel.sort((a, b) => Math.abs(b[1].z) - Math.abs(a[1].z));
  console.log(`   ── elegido en ${origen === "A" ? "2022-2023" : "2024-2026"} · probado en ${destino === "A" ? "2022-2023" : "2024-2026"} ──`);
  console.log(`   ${"casilla".padEnd(14)} ${"z en " + origen}      →   ${"rebote".padStart(7)} ${"azar".padStart(7)} ${"z en " + destino}`);
  for (const [k, v] of cel.slice(0, 3)) {
    const [lente, lado] = k.split("|");
    const d = CARRERA[`${lente}|${lado}|${destino}`];
    OOS[`${k}→${destino}`] = { zOrigen: v.z, zDestino: d?.z ?? null, rebDestino: d?.rebPct ?? null };
    console.log(`   ${`${lente} ${lado}`.padEnd(14)} ${f2(v.z).padStart(6)}      →   ${(f1(d?.rebPct) + "%").padStart(7)} ${(f1(d?.azar) + "%").padStart(7)} ${f2(d?.z).padStart(6)}`);
  }
  console.log("");
}

// ═══ 6 · EL DINERO — desvanecer el muro, en SPY, con peaje ═════════════════════════════════
console.log(`\n## 6 · EL DINERO — desvanecer el muro (vender en el de calls / comprar en el de puts) y aguantar al cierre`);
console.log(`   Vehículo: SPY, sin apalancamiento, 1 acción por punto no — se opera con el nocional que dé la cuenta.`);
console.log(`   Peaje: horquilla de SPY de $${HORQUILLA_SPY.toFixed(2)} — SUPUESTO declarado (SPY cotiza a un céntimo en RTH),`);
console.log(`   no una cotización medida: esta caché guarda spot por minuto, no bid/ask de SPY.\n`);
console.log(`   ${"lente".padEnd(5)} ${"muro".padEnd(4)} ${"per".padEnd(3)} ${"ops".padStart(5)} ${"ops/año".padStart(8)} ${"bruto/op".padStart(9)} ${"peaje".padStart(7)} ${"neto/op".padStart(8)} ${"$/año".padStart(10)} ${"% cuenta".padStart(9)} ${"t".padStart(6)}`);
console.log(`   ${"─".repeat(92)}`);
const ANIOS = (new Date(dias.at(-1).fecha) - new Date(dias[0].fecha)) / (365.25 * 24 * 3600 * 1000);
const DINERO = {};
for (const lente of LENTES) {
  for (const [lado, sg] of LADOS) {
    for (const per of ["A", "B", "T"]) {
      const cand = candidatos(lente, lado, sg, per, null, "sM");
      if (cand.length < 30) continue;
      const r = medir(cand, "sM");
      if (r.nToca < 20) continue;
      const anios = per === "T" ? ANIOS : per === "A" ? 2 : ANIOS - 2;
      // nocional: toda la cuenta en SPY. Un punto de SPX = 1/razón dólares de SPY por acción.
      const razonMed = pct(conM.map((d) => d.razon), 0.5);
      const acciones = Math.floor(CUENTA / (media(cand.map((c) => c.d.ap)) / razonMed));
      const brutoOp = (r.aCierreMedia / razonMed) * acciones;        // $ por operación, sin peaje
      const peaje = HORQUILLA_SPY * acciones;                         // ida + vuelta ≈ 1 céntimo total cruzado
      const netoOp = brutoOp - peaje;
      const opsAnio = r.nToca / anios;
      const anual = netoOp * opsAnio;
      DINERO[`${lente}|${lado}|${per}`] = { ops: r.nToca, opsAnio, brutoOp, peaje, netoOp, anual, pctCuenta: (100 * anual) / CUENTA, t: r.aCierreT, acciones };
      console.log(`   ${lente.padEnd(5)} ${lado.padEnd(4)} ${per.padEnd(3)} ${String(r.nToca).padStart(5)} ${f1(opsAnio).padStart(8)} ${eur(brutoOp).padStart(9)} ${eur(-peaje).padStart(7)} ${eur(netoOp).padStart(8)} ${eur(anual).padStart(10)} ${(f1((100 * anual) / CUENTA) + "%").padStart(9)} ${f2(r.aCierreT).padStart(6)}`);
    }
  }
}
console.log(`\n   (bruto/op = media del desplazamiento al cierre A FAVOR del desvanecimiento. Negativo = desvanecer`);
console.log(`    el muro PIERDE, o sea que el precio tiende a acabar MÁS ALLÁ del muro tras tocarlo.)`);

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(), liston: LISTON, pruebas: PRUEBAS, sorteos: SORTEOS, theta: TH,
  dias: dias.length, diasMinuto: conM.length, anios: ANIOS,
  horquillaSPYsupuesta: HORQUILLA_SPY,
  derivaConversion: { p50: pct(errCie, 0.5), p90: pct(errCie, 0.9), thetaPts: thPts },
  resolucion: RES, carrera: CARRERA, arrastre: ARR, mecanismo: MEC, signo: SIGNO, oos: OOS, dinero: DINERO,
}, null, 1));
console.log(`\n   escrito ${SALIDA}\n`);
