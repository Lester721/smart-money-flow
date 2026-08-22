// PANEL FLOW-TAPE · PASO 7 — LA PRUEBA QUE PUEDE TUMBARLO TODO: ¿ES SÓLO EL PRECIO?
//
// `dirAcel` = la cinta vira hacia un lado en su último tramo. Y lo que predice es que el
// subyacente hace LO CONTRARIO al día siguiente.
//
// Hay una explicación aburrida y GRATIS de exactamente ese patrón: si la acción SUBE por la
// mañana, la cinta de la tarde se pone alcista sola (los que persiguen el movimiento compran
// calls), y al día siguiente el movimiento intradía revierte un poco — que es un efecto conocido
// y que no necesita ninguna suscripción. Si eso es lo que está pasando, `dirAcel` no es
// información del flujo: es un termómetro caro del precio de la mañana.
//
// Se prueba así: se mide el MOMENTO INTRADÍA (asset_price de la última operación antes del corte
// / asset_price de la primera del día − 1) y se neutraliza. Si al fijar el momento `dirAcel`
// desaparece, el hallazgo es el precio y no la cinta.
//
// PRUEBAS: 81 + 4 = 85.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/tape-7-artefacto.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos";
import { radiografia } from "../../lib/radiografia";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const PANEL = path.join(RAIZ, "scripts/cache-theta/marketsnack/tape-panel.json");
const SALIDA = path.join(RAIZ, "scripts/marketsnack/tape-7-salida.json");
const PRUEBAS = 85, LISTON = listonT(PRUEBAS);
const MIN_SIM = 12;

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);
const corr = (a, b) => { const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? n / Math.sqrt(da * db) : null; };

const panel = JSON.parse(fs.readFileSync(PANEL, "utf8"));
const porCorte = (c) => { const m = new Map(); for (const f of panel) { if (f.corte !== c) continue; let g = m.get(f.dia); if (!g) { g = []; m.set(f.dia, g); } g.push(f); } return m; };

console.log(`=== FLOW TAPE · PASO 7 · ¿ES dirAcel SÓLO EL PRECIO DE LA MAÑANA? ===`);
console.log(`   ${PRUEBAS} pruebas acumuladas · listón |t| >= ${LISTON}\n`);

function ls(dias, fn, horiz) {
  const serie = [];
  for (const [dia, g0] of [...dias].sort()) {
    const g = g0.filter((f) => f[horiz] != null && fn(f) != null && Number.isFinite(fn(f)));
    if (g.length < MIN_SIM) continue;
    const ord = [...g].sort((a, b) => fn(b) - fn(a));
    const k = Math.floor(ord.length / 3); if (k < 4) continue;
    serie.push({ dia, ls: media(ord.slice(0, k).map((f) => f[horiz])) - media(ord.slice(-k).map((f) => f[horiz])) });
  }
  const v = serie.map((s) => s.ls), k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0) };
}
function lsNeutral(dias, fn, control, horiz) {
  const serie = [];
  for (const [dia, g0] of [...dias].sort()) {
    const g = g0.filter((f) => f[horiz] != null && fn(f) != null && control(f) != null);
    if (g.length < 15) continue;
    const pc = [...g].sort((a, b) => control(b) - control(a)), k = Math.floor(pc.length / 3);
    const alto = [], bajo = [];
    for (let b = 0; b < 3; b++) {
      const cubo = b < 2 ? pc.slice(b * k, (b + 1) * k) : pc.slice(2 * k);
      if (cubo.length < 3) continue;
      const o = [...cubo].sort((x, y) => fn(y) - fn(x)), j = Math.max(1, Math.floor(o.length / 3));
      alto.push(...o.slice(0, j).map((f) => f[horiz])); bajo.push(...o.slice(-j).map((f) => f[horiz]));
    }
    if (alto.length && bajo.length) serie.push({ dia, ls: media(alto) - media(bajo) });
  }
  const v = serie.map((s) => s.ls), k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0) };
}
const linea = (nom, r) => `   ${nom.padEnd(50)} n=${String(r.n).padStart(3)}d · ${(r.m >= 0 ? "+" : "") + r.m.toFixed(4)} pts · t=${r.t.toFixed(2).padStart(6)}` +
  ` · tercios ${r.ter.map((x) => (x >= 0 ? "+" : "") + x.toFixed(3)).join(" ")} ${r.mismo ? "OK" : "--"}${Math.abs(r.t) >= LISTON ? "  <<< PASA" : ""}`;

for (const corte of ["13:00ET", "dia"]) {
  const D = porCorte(corte);
  const todas = [...D.values()].flat().filter((f) => f.momento != null && f.dirAcel != null);
  const cob = ((todas.length / [...D.values()].flat().length) * 100).toFixed(1);
  console.log(`== CORTE ${corte} ==`);
  console.log(`   cobertura de momento intradía: ${cob}% (${todas.length} filas)`);
  console.log(`   correlación dirAcel vs momento intradía: ${corr(todas.map((f) => f.dirAcel), todas.map((f) => f.momento)).toFixed(3)}`);
  radiografia(todas, ["dirAcel", "momento", "r1"], `artefacto ${corte}`, { maxCeros: 0.2 });

  const A = ls(D, (f) => f.dirAcel, "r1");
  const M = ls(D, (f) => f.momento, "r1");
  const N = lsNeutral(D, (f) => f.dirAcel, (f) => f.momento, "r1");
  const R = lsNeutral(D, (f) => f.momento, (f) => f.dirAcel, "r1");
  console.log(linea("dirAcel a secas", A));
  console.log(linea("MOMENTO intradía a secas (gratis, sin suscripción)", M));
  console.log(linea("dirAcel NEUTRALIZADO por el momento  <- la prueba", N));
  console.log(linea("momento NEUTRALIZADO por dirAcel", R));
  const sobrevive = Math.abs(N.m) > Math.abs(A.m) * 0.5 && Math.sign(N.m) === Math.sign(A.m);
  console.log(`   -> dirAcel ${sobrevive ? "SOBREVIVE" : "NO sobrevive"}: conserva ${((Math.abs(N.m) / Math.abs(A.m)) * 100).toFixed(0)}% de su separación al fijar el momento.`);
  console.log(`   -> el MOMENTO por sí solo ${Math.abs(M.t) > Math.abs(A.t) ? "SEPARA MÁS que dirAcel — el flujo sobra" : "separa menos que dirAcel"}` +
    ` (|t| ${Math.abs(M.t).toFixed(2)} vs ${Math.abs(A.t).toFixed(2)})\n`);
  if (corte === "13:00ET") fs.writeFileSync(SALIDA, JSON.stringify({ pruebas: PRUEBAS, liston: LISTON, corte, cobertura: +cob,
    corrDirAcelMomento: corr(todas.map((f) => f.dirAcel), todas.map((f) => f.momento)), dirAcel: A, momento: M, neutralizado: N, momentoNeutral: R }, null, 1));
}
console.log(`   escrito ${SALIDA}`);
