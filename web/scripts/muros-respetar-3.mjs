// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿SON MUROS?  ·  TERCERA VUELTA — el canal, y cuánto habría hecho falta para verlo.
//
// Las dos primeras vueltas midieron la carrera en UN muro. Falta la pregunta desde el día:
//
//   EL CANAL. Los días en que el muro de calls está ARRIBA y el de puts ABAJO hay un canal.
//   ¿El día se queda dentro más veces que dentro de un canal AL AZAR de la misma forma? Este
//   estadístico no depende de θ, así que no hereda ninguna elección de las vueltas anteriores.
//   Control: se barajan los pares (distancia arriba, distancia abajo) ENTEROS entre días — así
//   el canal de prueba tiene exactamente la misma anchura y la misma asimetría que uno real,
//   pero cae en un día que no es el suyo.
//
//   LA POTENCIA. Un "no pasó" sin potencia no dice nada: puede ser que el muro no exista o que
//   la medición no dé para verlo. Aquí se calcula, casilla por casilla, CUÁNTOS PUNTOS de tasa
//   de rebote por encima del azar habrían hecho falta para pasar el listón, y cuántos hay.
//   Es la respuesta a "¿qué le falta?" en números.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/muros-respetar-3.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const N = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const R2 = JSON.parse(readFileSync("scripts/muros-respetar-2.json", "utf8"));
const SALIDA = "scripts/muros-respetar-3.json";

const LENTES = ["gam", "gamD", "oi"];
const SORTEOS = 500;
const SEMILLA = 20260821;
const PRUEBAS = 54 + 9;                 // las 54 declaradas + 9 del canal (3 lentes × 3 períodos)

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN; };
function listonT(p) { if (p <= 1) return 2; const q = 0.05 / p / 2; const t = Math.sqrt(-2 * Math.log(q)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }
const LISTON = listonT(PRUEBAS);
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

let _s = SEMILLA;
const rnd = () => { _s = (_s * 1664525 + 1013904223) >>> 0; return _s / 4294967296; };
function barajar(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// ═══ DÍAS con minuto a minuto ══════════════════════════════════════════════════════════════
const spyPorDia = {};
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const p = `scripts/cache-theta/SPY_spotmin_y_${y}.json`;
  if (existsSync(p)) Object.assign(spyPorDia, JSON.parse(readFileSync(p, "utf8")));
}
const dias = [];
for (const f of N.filas) {
  const bruto = spyPorDia[f.fecha.replace(/-/g, "")];
  const razon = f.spy?.razonSPX ?? null;
  if (!bruto || !(razon > 0)) continue;
  const arr = [];
  for (const [t, p] of bruto) if (t >= 575 && p > 0) arr.push(p * razon);
  if (arr.length < 300) continue;
  let max = -Infinity, min = Infinity;
  for (const p of arr) { if (p > max) max = p; if (p < min) min = p; }
  dias.push({ fecha: f.fecha, per: f.fecha < "2024-01-01" ? "A" : "B", ap: f.apertura, max, min, niv: f.niveles });
}
exigir(dias.length > 900, `sólo ${dias.length} días con minuto a minuto`);

console.log(`\n${"═".repeat(100)}`);
console.log(`¿SON MUROS? · TERCERA VUELTA · ${dias.length} días con minuto a minuto · ${dias[0].fecha} → ${dias.at(-1).fecha}`);
console.log(`listón |z| ≥ ${LISTON} (${PRUEBAS} pruebas declaradas) · ${SORTEOS} sorteos`);
console.log(`${"═".repeat(100)}`);

// ═══ 1 · EL CANAL ══════════════════════════════════════════════════════════════════════════
console.log(`\n## 1 · EL CANAL — ¿el día se queda entre los dos muros más que entre dos líneas al azar?`);
console.log(`   Sólo los días con canal de verdad (muro de calls ARRIBA y muro de puts ABAJO de las 09:35).`);
console.log(`   El azar baraja los pares (arriba, abajo) ENTEROS: misma anchura, misma asimetría, otro día.\n`);
console.log(`   ${"lente".padEnd(5)} ${"per".padEnd(3)} ${"días".padStart(5)} ${"ancho p50".padStart(10)} ${"DENTRO".padStart(7)} ║ ${"azar".padStart(7)} ${"z".padStart(6)} ${"pctil".padStart(6)} ║ ${"sólo arriba".padStart(11)} ${"sólo abajo".padStart(10)}`);
console.log(`   ${"─".repeat(92)}`);
const CANAL = {};
for (const lente of LENTES) {
  for (const per of ["A", "B", "T"]) {
    const cand = [];
    for (const d of dias) {
      if (per !== "T" && d.per !== per) continue;
      const dc = d.niv[lente].dMuroCall?.pts, dp = d.niv[lente].dMuroPut?.pts;
      if (dc == null || dp == null) continue;
      if (!(dc > 0 && dp < 0)) continue;               // canal de verdad
      cand.push({ d, arriba: dc, abajo: -dp });
    }
    if (cand.length < 40) continue;
    const dentro = (items) => {
      let n = 0, soloA = 0, soloB = 0;
      for (const { d, arriba, abajo } of items) {
        const KC = d.ap + arriba, KP = d.ap - abajo;
        const tocaC = d.max >= KC, tocaP = d.min <= KP;
        if (!tocaC && !tocaP) n++;
        else if (tocaC && !tocaP) soloA++;
        else if (!tocaC && tocaP) soloB++;
      }
      return { pct: (100 * n) / items.length, soloA: (100 * soloA) / items.length, soloB: (100 * soloB) / items.length };
    };
    const real = dentro(cand);
    const vals = [];
    for (let k = 0; k < SORTEOS; k++) {
      const p = barajar(cand.map((c) => [c.arriba, c.abajo]));
      vals.push(dentro(cand.map((c, i) => ({ d: c.d, arriba: p[i][0], abajo: p[i][1] }))).pct);
    }
    const z = sd(vals) > 0 ? (real.pct - media(vals)) / sd(vals) : NaN;
    const pctil = (100 * vals.filter((v) => v <= real.pct).length) / vals.length;
    const anchos = cand.map((c) => c.arriba + c.abajo);
    CANAL[`${lente}|${per}`] = { n: cand.length, ancho: pct(anchos, 0.5), ...real, azar: media(vals), azarSD: sd(vals), z, pctil };
    const marca = Math.abs(z) >= LISTON ? " ◄" : "";
    console.log(`   ${lente.padEnd(5)} ${per.padEnd(3)} ${String(cand.length).padStart(5)} ${(f1(pct(anchos, 0.5)) + " pt").padStart(10)} ${(f1(real.pct) + "%").padStart(7)} ║ ${(f1(media(vals)) + "%").padStart(7)} ${f2(z).padStart(6)} ${f1(pctil).padStart(6)} ║ ${(f1(real.soloA) + "%").padStart(11)} ${(f1(real.soloB) + "%").padStart(10)}${marca}`);
  }
}

// ═══ 2 · LA POTENCIA ═══════════════════════════════════════════════════════════════════════
console.log(`\n\n## 2 · LA POTENCIA — ¿cuánto muro habría hecho falta para verlo?`);
console.log(`   "hace falta" = LISTON × la desviación del azar: los puntos de tasa de rebote POR ENCIMA del`);
console.log(`   azar que habrían hecho falta para firmar. "hay" = los que hay (negativo = rebota MENOS).`);
console.log(`   Si hace falta poco y no hay nada, el muro no está. Si hiciera falta muchísimo, faltaría muestra.\n`);
console.log(`   ${"casilla".padEnd(18)} ${"decid".padStart(6)} ${"rebote".padStart(7)} ${"azar".padStart(7)} ${"sd azar".padStart(8)} ${"hace falta".padStart(11)} ${"hay".padStart(7)} ${"veredicto".padStart(22)}`);
console.log(`   ${"─".repeat(94)}`);
const POT = {};
for (const [k, v] of Object.entries(R2.carrera)) {
  const falta = LISTON * v.azarSD;
  const hay = v.rebPct - v.azar;
  const ver = hay >= falta ? "PASA" : hay <= -falta ? "PASA INVERTIDO" : Math.abs(hay) < falta / 3 ? "no hay nada que ver" : "insuficiente";
  POT[k] = { dec: v.dec, rebPct: v.rebPct, azar: v.azar, azarSD: v.azarSD, falta, hay, ver };
  console.log(`   ${k.replace(/\|/g, " ").padEnd(18)} ${String(v.dec).padStart(6)} ${(f1(v.rebPct) + "%").padStart(7)} ${(f1(v.azar) + "%").padStart(7)} ${f2(v.azarSD).padStart(8)} ${("+" + f1(falta) + " pts").padStart(11)} ${((hay >= 0 ? "+" : "") + f1(hay)).padStart(7)} ${ver.padStart(22)}`);
}

// ═══ 3 · EL SIGNO CONJUNTO ═════════════════════════════════════════════════════════════════
// 17 casillas independientes-ish. Si el muro no hace nada, la mitad de los z serían positivos.
const zs = Object.values(R2.carrera).map((v) => v.z).filter(Number.isFinite);
const zsS = Object.values(R2.carrera).map((v) => v.zS).filter(Number.isFinite);
const neg = zs.filter((z) => z < 0).length, negS = zsS.filter((z) => z < 0).length;
console.log(`\n\n## 3 · EL SIGNO CONJUNTO — si el muro no hiciera nada, la mitad de los z serían positivos`);
console.log(`   azar simple ........ ${neg} de ${zs.length} casillas con z NEGATIVO (el muro rebota MENOS que el azar) · z medio ${f2(media(zs))}`);
console.log(`   azar estratificado . ${negS} de ${zsS.length} casillas con z NEGATIVO · z medio ${f2(media(zsS))}`);
console.log(`   → el estratificado quita el enredo "los días volátiles tienen el muro más cerca". Si el z medio`);
console.log(`     se va a cero al estratificar, lo que se estaba midiendo era la distancia, no el muro.`);

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, pruebas: PRUEBAS, sorteos: SORTEOS, dias: dias.length, canal: CANAL, potencia: POT, signoConjunto: { neg, n: zs.length, zMedio: media(zs), negS, nS: zsS.length, zMedioS: media(zsS) } }, null, 1));
console.log(`\n   escrito ${SALIDA}\n`);
