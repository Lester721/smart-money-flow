// PANEL FLOW-TAPE · PASO 5 — EL DINERO, EL VEHÍCULO, Y QUÉ FALTA.
//
// Lo que dejaron los pasos 3 y 4:
//   · La FORMA de la cinta (ritmo, aceleración del ritmo, rachas, hora del grueso de la prima,
//     concordancia con el precio) NO aporta nada por encima de la simple DIRECCIÓN. `racha`
//     correlaciona 0,821 con `neto` y al neutralizarla cae de +0,62 (t=2,61) a +0,21 (t=0,95).
//     Y el mecanismo que la explicaría —una orden grande trabajada— predice que los prints
//     GRANDES separen más; separan MENOS (0,547 vs 0,669). El mecanismo está refutado.
//   · Lo único con forma propia es `dirAcel`: el VIRAJE de la cinta dentro del día. Y su signo
//     es NEGATIVO en 3 de los 4 cortes: SE DA LA VUELTA. Sobrevive a neutralizar por `neto`.
//
// Aquí se le da la mejor oportunidad posible a `dirAcel` (combinar cortes, apretar a deciles),
// se traduce a dólares al año, y se dice qué le falta y si el vehículo existe en su cuenta.
//
// PRUEBAS: 74 + 4 = 78.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/tape-5-dinero.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos";

const RAIZ = "C:/Users/leste/dev/agente-tito-metralleta/web";
const PANEL = path.join(RAIZ, "scripts/cache-theta/marketsnack/tape-panel.json");
const SALIDA = path.join(RAIZ, "scripts/marketsnack/tape-5-salida.json");
const PRUEBAS = 78, LISTON = listonT(PRUEBAS);
const MIN_SIM = 12, CUENTA = 56389;

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);

const panel = JSON.parse(fs.readFileSync(PANEL, "utf8"));
const porCorte = (c) => { const m = new Map(); for (const f of panel) { if (f.corte !== c) continue; let g = m.get(f.dia); if (!g) { g = []; m.set(f.dia, g); } g.push(f); } return m; };

console.log(`=== FLOW TAPE · PASO 5 · DINERO Y VEHÍCULO ===`);
console.log(`   ${PRUEBAS} pruebas acumuladas · listón |t| >= ${LISTON}\n`);

/** Largo/corto con corte por fracción (1/3 = tercios, 1/10 = deciles). Devuelve también las patas. */
function ls(dias, fn, horiz, frac = 1 / 3, minSim = MIN_SIM) {
  const serie = [];
  for (const [dia, g0] of [...dias].sort()) {
    const g = g0.filter((f) => f[horiz] != null && fn(f) != null && Number.isFinite(fn(f)));
    if (g.length < minSim) continue;
    const ord = [...g].sort((a, b) => fn(b) - fn(a));
    const k = Math.max(3, Math.floor(ord.length * frac)); if (k * 2 > ord.length) continue;
    const alto = media(ord.slice(0, k).map((f) => f[horiz]));
    const bajo = media(ord.slice(-k).map((f) => f[horiz]));
    const dia_ = media(g.map((f) => f[horiz]));
    serie.push({ dia, ls: alto - bajo, alto, bajo, mercado: dia_, patajLarga: bajo - dia_ });
  }
  const v = serie.map((s) => s.ls), k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0), serie };
}
const linea = (nom, r) => `   ${nom.padEnd(48)} n=${String(r.n).padStart(3)}d · ${(r.m >= 0 ? "+" : "") + r.m.toFixed(4)} pts · t=${r.t.toFixed(2).padStart(6)}` +
  ` · tercios ${r.ter.map((x) => (x >= 0 ? "+" : "") + x.toFixed(3)).join(" ")} ${r.mismo ? "OK" : "--"}${Math.abs(r.t) >= LISTON ? "  <<< PASA" : ""}`;

const D13 = porCorte("13:00ET"), D15 = porCorte("15:00ET"), DIA = porCorte("dia");

// ── 1. la mejor versión posible: combinar los tres cortes con signo negativo ────────────────
console.log(`== LA MEJOR OPORTUNIDAD QUE SE LE PUEDE DAR A dirAcel ==\n`);
const r13 = ls(D13, (f) => f.dirAcel, "r1"), r15 = ls(D15, (f) => f.dirAcel, "r1"), rDia = ls(DIA, (f) => f.dirAcel, "r1");
console.log(linea("dirAcel @13:00ET (entrada cierre del mismo día)", r13));
console.log(linea("dirAcel @15:00ET (entrada cierre del mismo día)", r15));
console.log(linea("dirAcel @dia (entrada cierre del día SIGUIENTE)", rDia));

// combinación: media de las series diarias de 13:00 y 15:00 (las dos entradas en el mismo día)
const mapa13 = new Map(r13.serie.map((s) => [s.dia, s.ls])), mapa15 = new Map(r15.serie.map((s) => [s.dia, s.ls]));
const comb = [];
for (const d of [...new Set([...mapa13.keys(), ...mapa15.keys()])].sort()) {
  const a = mapa13.get(d), b = mapa15.get(d);
  if (a == null || b == null) continue;
  comb.push({ dia: d, ls: (a + b) / 2 });
}
const vc = comb.map((s) => s.ls), k3c = Math.floor(comb.length / 3);
const terC = [0, 1, 2].map((i) => media((i < 2 ? comb.slice(i * k3c, (i + 1) * k3c) : comb.slice(2 * k3c)).map((s) => s.ls)));
const rComb = { n: comb.length, m: media(vc), de: de(vc), t: tUna(vc), ter: terC, mismo: terC.every((x) => x > 0) || terC.every((x) => x < 0), serie: comb };
console.log(linea("COMBINADO 13:00+15:00 (promedio de las 2 series)", rComb));

// deciles: apretar a los extremos
const rDec = ls(DIA, (f) => f.dirAcel, "r1", 1 / 10, 25);
const r13Dec = ls(D13, (f) => f.dirAcel, "r1", 1 / 10, 25);
console.log(linea("dirAcel @dia · DECILES en vez de tercios", rDec));
console.log(linea("dirAcel @13:00ET · DECILES", r13Dec));

// ── 2. la pata larga sola (sin vender en corto) ─────────────────────────────────────────────
console.log(`\n== EL VEHÍCULO — en Robinhood NO se venden acciones en corto ==\n`);
const largaDia = rDia.serie.map((s) => s.patajLarga), larga13 = r13.serie.map((s) => s.patajLarga);
console.log(`   La señal dice: COMPRAR el tercio BAJO de dirAcel (el que la cinta abandonó) y VENDER el alto.`);
console.log(`   Sin poder vender en corto, sólo queda la pata larga contra el mercado del día:`);
console.log(`   pata larga @dia      ${media(largaDia) >= 0 ? "+" : ""}${media(largaDia).toFixed(4)} pts/día sobre la media del día · t=${tUna(largaDia).toFixed(2)} · n=${largaDia.length}d`);
console.log(`   pata larga @13:00ET  ${media(larga13) >= 0 ? "+" : ""}${media(larga13).toFixed(4)} pts/día sobre la media del día · t=${tUna(larga13).toFixed(2)} · n=${larga13.length}d`);
console.log(`   OJO: la pata larga sola NO es neutral — se lleva el mercado entero encima, que es`);
console.log(`   justo lo que el tercio-contra-tercio quitaba. Su riesgo no es comparable.`);

// ── 3. el dinero, con el intervalo honesto ─────────────────────────────────────────────────
console.log(`\n== EN DÓLARES AL AÑO ==\n`);
function dinero(nom, r, opsAno = 252, delay = "") {
  const sep = Math.abs(r.m);                       // se opera en el sentido que dice el signo
  const ee = r.de / Math.sqrt(r.n);
  const bruto = (sep / 100) * opsAno * CUENTA;
  const loB = ((sep - LISTON * ee) / 100) * opsAno * CUENTA;
  const hiB = ((sep + LISTON * ee) / 100) * opsAno * CUENTA;
  const peaje = (5 / 10000) * opsAno * CUENTA * 4; // 2 patas × ida y vuelta, 5 pb por cruce
  console.log(`   ${nom}${delay}`);
  console.log(`      BRUTO  $${bruto.toFixed(0)}/año  (${sep.toFixed(4)} pts × ${opsAno} rot. × $${CUENTA.toLocaleString("es-ES")})`);
  console.log(`      peaje  −$${peaje.toFixed(0)}/año  (5 pb por cruce × 4 cruces/día · SUPUESTO, MarketSnack no trae horquilla de acciones)`);
  console.log(`      NETO   $${(bruto - peaje).toFixed(0)}/año`);
  console.log(`      intervalo al listón de ${PRUEBAS} pruebas: $${loB.toFixed(0)} a $${hiB.toFixed(0)}/año BRUTO` +
    `${loB < 0 ? "  <- CRUZA EL CERO: el dato no distingue esto de nada" : ""}`);
  return { bruto, peaje, neto: bruto - peaje, loB, hiB, sep, t: r.t, n: r.n };
}
const dDia = dinero("dirAcel @dia (el más estable)", rDia, 252, " — entrada retrasada un día");
const d13 = dinero("dirAcel @13:00ET (el más fuerte)", r13);
const dComb = dinero("COMBINADO 13:00+15:00", rComb);

console.log(`\n   Por qué el bruto sale tan alto y aun así NO vale: ${Math.abs(rDia.m).toFixed(2)} pts/día implica un Sharpe`);
console.log(`   de ${(Math.abs(rDia.t) / Math.sqrt(rDia.n) * Math.sqrt(252)).toFixed(2)} anualizado. Un Sharpe así no existe en nada que se pueda alquilar por $50 al mes.`);
console.log(`   Con 81 días el intervalo es tan ancho que cabe dentro el cero. El número grande es la`);
console.log(`   PUNTA de una distribución enorme, no una estimación.`);

// ── 4. qué falta ────────────────────────────────────────────────────────────────────────────
console.log(`\n== QUÉ LE FALTA PARA FUNCIONAR ==\n`);
for (const [nom, r] of [["dirAcel @dia", rDia], ["dirAcel @13:00ET", r13], ["COMBINADO", rComb]]) {
  const nNec = Math.ceil(((LISTON * r.de) / Math.abs(r.m)) ** 2);
  console.log(`   ${nom.padEnd(20)} hoy ${r.n} días · t=${r.t.toFixed(2)} · harían falta ${nNec} días (${(nNec / 252).toFixed(1)} años) -> FALTAN ${Math.max(0, nNec - r.n)}`);
}
console.log(`\n   Y NO se puede recuperar hacia atrás: MarketSnack borra ~1 día de historia por día de`);
console.log(`   calendario (medido: el 12-ago el suelo era 2026-04-15, hoy es 2026-04-22). La única`);
console.log(`   vía es FOTOGRAFIAR a diario. A 1 día ganado por día, los ${Math.max(0, Math.ceil(((LISTON * rDia.de) / Math.abs(rDia.m)) ** 2) - rDia.n)} días que faltan son ~6 meses`);
console.log(`   de descarga nocturna ininterrumpida antes de poder volver a mirar esto.`);

fs.writeFileSync(SALIDA, JSON.stringify({ pruebas: PRUEBAS, liston: LISTON,
  cortes: { r13: { ...r13, serie: undefined }, r15: { ...r15, serie: undefined }, rDia: { ...rDia, serie: undefined },
    rComb: { ...rComb, serie: undefined }, rDec: { ...rDec, serie: undefined }, r13Dec: { ...r13Dec, serie: undefined } },
  pataLarga: { dia: { m: media(largaDia), t: tUna(largaDia), n: largaDia.length }, c13: { m: media(larga13), t: tUna(larga13), n: larga13.length } },
  dinero: { dDia, d13, dComb } }, null, 1));
console.log(`\n   escrito ${SALIDA}`);
