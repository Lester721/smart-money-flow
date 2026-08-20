// EL VEREDICTO — ¿alguna de las 16 señales marca los días que CONSTRUYEN la caída?
//
// De scripts/colaintra-puente.mjs: la peor racha (−$15.176) son 26 sesiones del 2025-01-30 al
// 2025-03-07, y CUATRO días de pérdida grande suman −$15.525 mientras las otras 22 sesiones
// suman +$349. O sea: la caída NO es goteo, son cuatro días. Si una señal va a bajar la caída,
// tiene que marcar ESOS CUATRO. Aquí se mira en qué percentil de cada señal caen.
//
// Y para el candidato que se queda cerca (`movFirmado`, la mañana que ya viene roja) se mide con
// un estadístico de más potencia que la proporción —el déficit esperado, la media del 10% peor—
// y se calcula CUÁNTA MUESTRA haría falta para que llegue al listón. Un "no pasó" sin decir qué
// le falta no es un resultado.

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const camino = JSON.parse(readFileSync("scripts/colaintra-camino.json", "utf8"));
const MALO = 2000, ANUAL = 252, LISTON = listonT(16);

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(s.length * q)))]; };
function racha(pls) { let cur = 0, peor = 0; for (const p of pls) { cur = Math.min(0, cur + p); peor = Math.min(peor, cur); } return peor; }

// ── las mismas 16 señales, mismo código que colaintra-intradia.mjs ──────────────────────────
const SQRT5MIN = Math.sqrt(5 / (252 * 6.5)), BARRAS_ANO = 252 * 78;
for (let i = 0; i < filas.length; i++) {
  const f = filas[i], ant = filas[i - 1], c = camino[f.fecha];
  if (!c) continue;
  const marcas = Object.keys(c).sort(), s = marcas.map((h) => c[h]), sig = f.sigma;
  let largo = 0, paso5 = 0, sr2 = 0, enDir = 0; const dNeto = f.sp11 - f.ap; const difs = [];
  for (let k = 1; k < s.length; k++) {
    const d = s[k] - s[k - 1]; difs.push(d); largo += Math.abs(d);
    if (Math.abs(d) > paso5) paso5 = Math.abs(d);
    const r = Math.log(s[k] / s[k - 1]); sr2 += r * r;
    if (dNeto !== 0 && Math.sign(d) === Math.sign(dNeto)) enDir++;
  }
  const rvAnual = Math.sqrt(sr2 / difs.length) * Math.sqrt(BARRAS_ANO);
  const ivAtm = sig > 0 ? sig / (f.sp11 * SQRT5MIN) : null;
  const iC = marcas.indexOf("10:35"); let l1 = 0, l2 = 0;
  for (let k = 1; k <= iC; k++) l1 += Math.abs(s[k] - s[k - 1]);
  for (let k = iC + 1; k < s.length; k++) l2 += Math.abs(s[k] - s[k - 1]);
  let mx = s[0], mn = s[0], nuevos = 0; const i2 = marcas.indexOf("10:05");
  for (let k = 1; k < s.length; k++) {
    const nMx = s[k] > mx, nMn = s[k] < mn; if (nMx) mx = s[k]; if (nMn) mn = s[k];
    if (k >= i2 && (nMx || nMn)) nuevos++;
  }
  const rango = f.maxM - f.minM;
  f.movAbs = Math.abs(f.sp11 / f.ap - 1) * 100;
  f.movSigma = sig > 0 ? Math.abs(dNeto) / sig : null;
  f.movFirmado = (f.sp11 / f.ap - 1) * 100;
  f.huecoAbs = ant ? Math.abs(f.ap / ant.cierre - 1) * 100 : null;
  f.huecoFirm = ant ? (f.ap / ant.cierre - 1) * 100 : null;
  f.rangoSigma = sig > 0 ? rango / sig : null;
  f.extremo = rango > 0 ? Math.abs((f.sp11 - f.minM) / rango - 0.5) * 2 : null;
  f.posRango = rango > 0 ? (f.sp11 - f.minM) / rango : null;
  f.caminoSigma = sig > 0 ? largo / sig : null;
  f.paso5Sigma = sig > 0 ? paso5 / sig : null;
  f.rvIv = ivAtm > 0 ? rvAnual / ivAtm : null;
  f.aceleracion = (l1 > 0 && iC > 0) ? (l2 / (s.length - 1 - iC)) / (l1 / iC) : null;
  f.eficiencia = largo > 0 ? Math.abs(dNeto) / largo : null;
  f.monotonia = difs.length ? enDir / difs.length : null;
  f.nuevosExtr = nuevos;
  f.derivaUlt = (sig > 0 && c["10:30"] > 0) ? Math.abs(f.sp11 - c["10:30"]) / sig : null;
}

const CAMPOS = ["movAbs","movSigma","movFirmado","huecoAbs","huecoFirm","rangoSigma","extremo","posRango",
                "caminoSigma","paso5Sigma","rvIv","aceleracion","eficiencia","monotonia","nuevosExtr","derivaUlt"];

// percentil de un valor dentro de la distribución de esa señal
const dist = {};
for (const c of CAMPOS) dist[c] = filas.map((f) => f[c]).filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
const percentil = (c, v) => (v == null || !isFinite(v)) ? null : dist[c].filter((x) => x <= v).length / dist[c].length;

// ── A · los días que CONSTRUYEN la caída, señal por señal ───────────────────────────────────
const base = filas.map((f) => f.pl);
let cur = 0, peor = 0, ini = 0, fin = 0, curIni = 0;
for (let i = 0; i < base.length; i++) {
  if (cur === 0) curIni = i;
  cur = Math.min(0, cur + base[i]);
  if (cur < peor) { peor = cur; ini = curIni; fin = i; }
}
const tramo = filas.slice(ini, fin + 1);
const culpables = tramo.filter((f) => f.pl < -MALO).sort((a, b) => a.pl - b.pl);

console.log("═".repeat(118));
console.log("  A · LOS " + culpables.length + " DÍAS QUE SON LA PEOR RACHA (" + tramo[0].fecha + " → " + tramo[tramo.length - 1].fecha + ", " + eur(peor) + ")");
console.log("      suman " + eur(culpables.reduce((a, f) => a + f.pl, 0)) + "; las otras " + (tramo.length - culpables.length) + " sesiones del tramo suman " +
            eur(tramo.reduce((a, f) => a + f.pl, 0) - culpables.reduce((a, f) => a + f.pl, 0)));
console.log("      EN QUÉ PERCENTIL DE CADA SEÑAL CAEN. Para que un filtro los evitara harían falta percentiles extremos (>0,80 o <0,20).");
console.log("═".repeat(118));
console.log("\n| fecha | P&L | crédito | " + CAMPOS.join(" | ") + " |");
console.log("|---|---|---|" + CAMPOS.map(() => "---").join("|") + "|");
for (const f of culpables) {
  console.log("| " + f.fecha + " | " + eur(f.pl) + " | " + eur(f.credito) + " | " +
              CAMPOS.map((c) => { const p = percentil(c, f[c]); return p == null ? "—" : p.toFixed(2); }).join(" | ") + " |");
}
// ¿cuántas señales marcarían a cada uno como extremo?
console.log("\n  señales que ponen a ese día en un extremo (percentil >0,80 o <0,20), de las 16:");
for (const f of culpables) {
  const ext = CAMPOS.filter((c) => { const p = percentil(c, f[c]); return p != null && (p > 0.8 || p < 0.2); });
  console.log("    " + f.fecha + "  " + String(ext.length).padStart(2) + "/16  " + (ext.length ? ext.join(", ") : "NINGUNA"));
}
// y los 10 peores días de todo el período
const peores10 = [...filas].sort((a, b) => a.pl - b.pl).slice(0, 10);
console.log("\n  los 10 PEORES días del período completo — cuántas señales los ponen en un extremo:");
for (const f of peores10) {
  const ext = CAMPOS.filter((c) => { const p = percentil(c, f[c]); return p != null && (p > 0.8 || p < 0.2); });
  console.log("    " + f.fecha + "  " + eur(f.pl).padStart(8) + "  " + String(ext.length).padStart(2) + "/16  " + (ext.length ? ext.join(", ") : "NINGUNA"));
}
const mediaExt = media(peores10.map((f) => CAMPOS.filter((c) => { const p = percentil(c, f[c]); return p != null && (p > 0.8 || p < 0.2); }).length));
const mediaTodos = media(filas.map((f) => CAMPOS.filter((c) => { const p = percentil(c, f[c]); return p != null && (p > 0.8 || p < 0.2); }).length));
console.log("\n  media de señales en extremo: los 10 peores días " + mediaExt.toFixed(1) + "/16 · TODOS los días " + mediaTodos.toFixed(1) + "/16");

// ── B · el candidato que se queda cerca, con un estadístico de más potencia ──────────────────
// El déficit esperado (media del 10% peor) usa TODA la cola, no sólo si cruza un umbral.
console.log("\n" + "═".repeat(118));
console.log("  B · `movFirmado` (la mañana que ya viene ROJA) — con déficit esperado en vez de proporción");
console.log("═".repeat(118));

function deficit(pls, q = 0.1) { const s = [...pls].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.round(s.length * q)))); }
function bootDif(A, B, q = 0.1, reps = 20000) {
  const obs = deficit(A, q) - deficit(B, q);
  let mayor = 0; const todos = [...A, ...B];
  // permutación: se baraja la etiqueta alto/bajo y se mira cuántas veces el azar da algo tan grande
  for (let r = 0; r < reps; r++) {
    const mez = todos.slice();
    for (let i = mez.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [mez[i], mez[j]] = [mez[j], mez[i]]; }
    const d = deficit(mez.slice(0, A.length), q) - deficit(mez.slice(A.length), q);
    if (Math.abs(d) >= Math.abs(obs)) mayor++;
  }
  return { obs, p: (mayor + 1) / (reps + 1) };
}

for (const campo of ["movFirmado", "huecoAbs", "aceleracion"]) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  const ord = [...val].sort((a, b) => b[campo] - a[campo]);
  const k = Math.floor(ord.length / 3);
  const A = ord.slice(0, k).map((f) => f.pl), B = ord.slice(-k).map((f) => f.pl);
  const { obs, p } = bootDif(A, B);
  console.log("\n  `" + campo + "`  déficit esperado (media del 10% peor) · tercio alto " + eur(deficit(A)) + " · tercio bajo " + eur(deficit(B)) +
              " · diferencia " + eur(obs));
  console.log("     p de permutación (20.000 barajadas) = " + p.toFixed(4) + "  ·  listón de Bonferroni para 16 pruebas = " + (0.05 / 16).toFixed(4) +
              "  →  " + (p < 0.05 / 16 ? "PASA" : "no pasa"));
  // por año
  for (const a of ["2024", "2025", "2026"]) {
    const g = val.filter((f) => f.fecha.startsWith(a));
    const o = [...g].sort((x, y) => y[campo] - x[campo]); const kk = Math.floor(o.length / 3);
    console.log("     " + a + "  alto " + eur(deficit(o.slice(0, kk).map((f) => f.pl))) + " · bajo " + eur(deficit(o.slice(-kk).map((f) => f.pl))) +
                " · dif " + eur(deficit(o.slice(0, kk).map((f) => f.pl)) - deficit(o.slice(-kk).map((f) => f.pl))));
  }
}

// ── C · cuánta muestra haría falta ──────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(118));
console.log("  C · QUÉ LE FALTA · cuánta muestra necesita `movFirmado` para llegar al listón de |z| = " + LISTON);
console.log("═".repeat(118));
const vM = filas.filter((f) => f.movFirmado != null);
const oM = [...vM].sort((a, b) => b.movFirmado - a.movFirmado); const kM = Math.floor(oM.length / 3);
const kA = oM.slice(0, kM).filter((f) => f.pl < -MALO).length, kB = oM.slice(-kM).filter((f) => f.pl < -MALO).length;
const pA = kA / kM, pB = kB / kM, pP = (kA + kB) / (2 * kM);
const zAct = (pA - pB) / Math.sqrt(pP * (1 - pP) * (2 / kM));
const nNec = kM * Math.pow(LISTON / Math.abs(zAct), 2);
console.log("\n  hoy: tercio alto " + (pA * 100).toFixed(1) + "% de días malos, tercio bajo " + (pB * 100).toFixed(1) + "% · n por tercio " + kM + " · |z| = " + Math.abs(zAct).toFixed(2));
console.log("  para |z| = " + LISTON + " con el MISMO tamaño de efecto hacen falta " + Math.round(nNec) + " días por tercio → " + Math.round(nNec * 3) + " sesiones");
console.log("  hoy hay " + filas.length + " sesiones (" + (filas.length / ANUAL).toFixed(1) + " años). Faltan " + Math.round(nNec * 3 - filas.length) +
            " sesiones ≈ " + ((nNec * 3 - filas.length) / ANUAL).toFixed(1) + " años más de cadena 0DTE de SPXW.");
console.log("  SPXW tiene vencimiento los cinco días de la semana desde mayo de 2022: bajando 2022-05 → 2023-12");
console.log("  se añadirían unas 400 sesiones (n≈1.050), que llevarían |z| a ~" + (Math.abs(zAct) * Math.sqrt(1050 / filas.length)).toFixed(2) + ". Sigue sin bastar por sí solo.");

// ── D · el filtro de movFirmado, con la caída y el ingreso por año ──────────────────────────
console.log("\n  el filtro tal como quedaría (tirar el 20% de mañanas más rojas):");
const corte = pct(vM.map((f) => f.movFirmado), 0.20);
const dentro = filas.filter((f) => f.movFirmado == null || f.movFirmado > corte);
const plsD = dentro.map((f) => f.pl), plsB = filas.map((f) => f.pl);
const ANOS = filas.length / ANUAL;
console.log("    corte: no operar si a las 11:00 el índice está por debajo de " + corte.toFixed(2) + "% respecto de la apertura (" + (filas.length - dentro.length) + " días de " + filas.length + ")");
console.log("    ingreso " + eur(plsB.reduce((a, b) => a + b, 0) / ANOS) + "/año → " + eur(plsD.reduce((a, b) => a + b, 0) / ANOS) + "/año (" +
            ((plsD.reduce((a, b) => a + b, 0) / plsB.reduce((a, b) => a + b, 0)) * 100).toFixed(0) + "%)");
console.log("    peor día " + eur(Math.min(...plsB)) + " → " + eur(Math.min(...plsD)) + "  ·  peor racha " + eur(racha(plsB)) + " → " + eur(racha(plsD)));
console.log("    P(pérdida>" + eur(MALO) + ") " + ((plsB.filter((x) => x < -MALO).length / plsB.length) * 100).toFixed(1) + "% → " +
            ((plsD.filter((x) => x < -MALO).length / plsD.length) * 100).toFixed(1) + "%  ·  p5 " + eur(pct(plsB, 0.05)) + " → " + eur(pct(plsD, 0.05)) +
            "  ·  p1 " + eur(pct(plsB, 0.01)) + " → " + eur(pct(plsD, 0.01)));
