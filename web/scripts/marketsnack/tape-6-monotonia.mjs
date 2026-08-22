// PANEL FLOW-TAPE · PASO 6 — LA PRUEBA QUE DECIDE: ¿ES MONÓTONO?
//
// El paso 5 dejó un aviso que no se puede pasar por alto: al apretar de TERCIOS a DECILES el
// efecto de dirAcel se DESPLOMA (t=−2,13 -> −0,41 en @dia; −2,52 -> −0,47 en @13:00ET).
// Si la señal fuese real, los extremos tendrían que separar MÁS, no menos. Que el efecto viva
// en el centro de la distribución y desaparezca en las puntas es la firma del ruido.
//
// Aquí se mira la escalera completa por quintiles: retorno futuro medio de cada quintil,
// DEMEDIADO dentro del día (que es el vehículo neutral). Una señal buena baja (o sube) escalón
// a escalón. Una escalera desordenada no se opera aunque la t del extremo salga bonita.
//
// PRUEBAS: 78 + 3 = 81.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/tape-6-monotonia.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const PANEL = path.join(RAIZ, "scripts/cache-theta/marketsnack/tape-panel.json");
const SALIDA = path.join(RAIZ, "scripts/marketsnack/tape-6-salida.json");
const PRUEBAS = 81, LISTON = listonT(PRUEBAS);
const MIN_SIM = 20, Q = 5;

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);

const panel = JSON.parse(fs.readFileSync(PANEL, "utf8"));
const porCorte = (c) => { const m = new Map(); for (const f of panel) { if (f.corte !== c) continue; let g = m.get(f.dia); if (!g) { g = []; m.set(f.dia, g); } g.push(f); } return m; };

console.log(`=== FLOW TAPE · PASO 6 · MONOTONÍA ===`);
console.log(`   ${PRUEBAS} pruebas acumuladas · listón |t| >= ${LISTON}\n`);

/** Escalera por quintiles: para cada día se demedía el retorno y se reparte en Q cubos. */
function escalera(dias, campo, horiz = "r1") {
  const cubos = Array.from({ length: Q }, () => []);   // series DIARIAS por quintil
  for (const [, g0] of [...dias].sort()) {
    const g = g0.filter((f) => f[horiz] != null && f[campo] != null && Number.isFinite(f[campo]));
    if (g.length < MIN_SIM) continue;
    const mr = media(g.map((f) => f[horiz]));
    const ord = [...g].sort((a, b) => a[campo] - b[campo]);      // de menor a mayor
    const k = ord.length / Q;
    for (let q = 0; q < Q; q++) {
      const trozo = ord.slice(Math.floor(q * k), Math.floor((q + 1) * k));
      if (trozo.length) cubos[q].push(media(trozo.map((f) => f[horiz])) - mr);
    }
  }
  const m = cubos.map((c) => media(c)), t = cubos.map((c) => tUna(c));
  // ¿es monótona? se cuentan los escalones que van en el sentido del extremo
  const dir = Math.sign(m[Q - 1] - m[0]);
  let bien = 0; for (let i = 1; i < Q; i++) if (Math.sign(m[i] - m[i - 1]) === dir) bien++;
  return { m, t, n: cubos[0].length, monot: bien, dir };
}

function pinta(nom, e) {
  const barra = (x) => { const w = Math.round(Math.abs(x) * 12); return x >= 0 ? " ".repeat(14) + "|" + "#".repeat(w) : " ".repeat(14 - Math.min(14, w)) + "#".repeat(Math.min(14, w)) + "|"; };
  console.log(`   ${nom}  (n=${e.n} días · escalones en orden: ${e.monot}/${Q - 1})${e.monot === Q - 1 ? "  <<< MONÓTONA" : ""}`);
  for (let q = 0; q < Q; q++) {
    console.log(`      Q${q + 1} ${q === 0 ? "(más bajo) " : q === Q - 1 ? "(más alto) " : "           "}` +
      `${(e.m[q] >= 0 ? "+" : "") + e.m[q].toFixed(4)} pts  t=${e.t[q].toFixed(2).padStart(6)}  ${barra(e.m[q])}`);
  }
  console.log("");
}

const D13 = porCorte("13:00ET"), DIA = porCorte("dia"), D11 = porCorte("11:00ET");
const res = {};

console.log(`== dirAcel — el único con forma propia. ¿Escalera ordenada? ==\n`);
res.dirAcel13 = escalera(D13, "dirAcel"); pinta("dirAcel @13:00ET -> r1", res.dirAcel13);
res.dirAcelDia = escalera(DIA, "dirAcel"); pinta("dirAcel @dia -> r1", res.dirAcelDia);

console.log(`== los otros dos que asomaron, para comparar ==\n`);
res.racha11 = escalera(D11, "racha"); pinta("racha @11:00ET -> r1", res.racha11);
res.neto11 = escalera(D11, "neto"); pinta("neto @11:00ET -> r1 (el control: dirección sola)", res.neto11);

// ── veredicto ───────────────────────────────────────────────────────────────────────────────
console.log(`${"=".repeat(88)}`);
console.log(`   VEREDICTO DE MONOTONÍA\n`);
const filas = [["dirAcel @13:00ET", res.dirAcel13], ["dirAcel @dia", res.dirAcelDia], ["racha @11:00ET", res.racha11], ["neto @11:00ET", res.neto11]];
for (const [nom, e] of filas) {
  const extremos = Math.abs(e.m[Q - 1] - e.m[0]);
  const centro = Math.abs(e.m[Q - 2] - e.m[1]);
  console.log(`   ${nom.padEnd(18)} escalones en orden ${e.monot}/${Q - 1} · extremos ${extremos.toFixed(3)} pts · centro (Q2-Q4) ${centro.toFixed(3)} pts` +
    ` · ${centro > extremos * 0.6 ? "el CENTRO lleva casi todo -> no es una señal, es ruido con forma" : "los extremos mandan"}`);
}

console.log(`\n   Una señal que se opera tiene que ordenar de punta a punta: los que más tienen del`);
console.log(`   ingrediente van a un lado, los que menos al otro, y el medio en medio. Si el resultado`);
console.log(`   vive en Q2-Q4 y las puntas no mandan, lo que se está midiendo no es el ingrediente.`);

fs.writeFileSync(SALIDA, JSON.stringify({ pruebas: PRUEBAS, liston: LISTON, escaleras: res }, null, 1));
console.log(`\n   escrito ${SALIDA}`);
