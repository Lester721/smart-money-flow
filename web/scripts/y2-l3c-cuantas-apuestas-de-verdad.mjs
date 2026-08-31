// ¿CUÁNTAS APUESTAS DE VERDAD HAY AQUÍ? — y ¿la señal es del TICKER o del MES?
//
// La lente 3 dejó dos cosas apuntadas y esto las pone en números:
//
//   · el barajado CRUZANDO TICKERS (a cada operación se le pega la señal que tenía otro ticker
//     ESE MISMO MES) da mediana 1.51 y 7 de 20 igualan o superan al 1.67 de verdad. O sea que
//     acertar el TICKER no aporta: lo que aporta es acertar el MES.
//   · el barajado por MESES (mismo ticker, mes equivocado) da mediana 1.06 y 0 de 20 llegan al
//     1.67. O sea que el MES sí lleva información.
//
// Si la decisión es mensual y de mercado, entonces las "127 operaciones al año" no son 127
// apuestas: son ~12 decisiones al año, y muchas menos si el disparo se agolpa. Esto mide:
//
//   1. cuántos MESES distintos dispara la regla y cuánto dinero sale de cada uno
//   2. el agolpamiento: cuánto se desvía el disparo mensual de lo que daría un sorteo por ticker
//   3. el JACKKNIFE POR MESES: se quita un mes entero cada vez (100 pasadas, sin azar) y se mira
//      cuánto se mueve el ratio y cuántos meses hacen falta para tumbarlo por debajo de 1.40
//   4. el CONTROL DEL CALENDARIO: dentro de cada mes del calendario, ¿la señal sigue separando?
//   5. la traducción a DÓLARES AL AÑO, que es lo único que se opera
//
// Uso: REUSE=1 node --import tsx scripts/y2-l3c-cuantas-apuestas-de-verdad.mjs
//      (necesita el volcado que deja y2-l3-que-es-la-senal.mjs)

import { readFileSync, existsSync } from "node:fs";
const VOLCADO = "scripts/cache-theta/_y2l3-ops.json";
if (!existsSync(VOLCADO)) { console.log("Falta el volcado. Corre antes scripts/y2-l3-que-es-la-senal.mjs"); process.exit(1); }
const { ops: OPS } = JSON.parse(readFileSync(VOLCADO, "utf8"));

const APUESTA = 1000, ANOSCAL = 10.6;
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const linea = (t) => console.log(`\n${"═".repeat(100)}\n  ${t}\n${"═".repeat(100)}`);

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function mide(v) { const a = acc(); for (const o of v) { const d = APUESTA * o.ret; a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; } return a; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const R = (a) => (a && a.n ? ratio(a).toFixed(2) : "n/d");

const baseA = OPS.filter((o) => o.env === "A" && o.s[60] != null);
const REGLA = (o) => o.s[60] > 0.80;
const selA = baseA.filter(REGLA);
const TOT = mide(selA), LIS = mide(baseA);

linea("EL PUNTO DE PARTIDA");
console.log(`  regla: percentil > 80 con la ventana de 60 días · envase A`);
console.log(`  n=${num(TOT.n)} · ratio ${R(TOT)} · acierta ${pct(acierto(TOT))} · listón ${R(LIS)} / ${pct(acierto(LIS))} (n=${num(LIS.n)})`);

// ── 1) meses ────────────────────────────────────────────────────────────────
linea("1 — LOS MESES: cuántas decisiones distintas hay de verdad");
const porMes = new Map();
for (const o of selA) { if (!porMes.has(o.mes)) porMes.set(o.mes, []); porMes.get(o.mes).push(o); }
const mesesFila = [...porMes.entries()].map(([m, v]) => { const a = mide(v); return { m, a, neto: a.gan - a.per }; });
mesesFila.sort((x, y) => y.neto - x.neto);
console.log(`  meses distintos en los que la regla dispara: ${porMes.size} en ${ANOSCAL} años  →  ${(porMes.size / ANOSCAL).toFixed(1)} meses al año`);
console.log(`  operaciones por mes que dispara: mediana ${mediana([...porMes.values()].map((v) => v.length))} · máximo ${Math.max(...[...porMes.values()].map((v) => v.length))}`);
console.log(`  (y cada entrada compra una CALL y una PUT del mismo día y ticker: son 2 filas por decisión)`);
console.log(`\n  NETO por mes (lo ganado menos lo perdido), los 8 mejores y los 8 peores:`);
for (const x of mesesFila.slice(0, 8)) console.log(`    ${x.m}  ${usd(x.neto).padStart(10)}  (n=${x.a.n})`);
console.log(`    ...`);
for (const x of mesesFila.slice(-8)) console.log(`    ${x.m}  ${usd(x.neto).padStart(10)}  (n=${x.a.n})`);
const netoTot = TOT.gan - TOT.per;
console.log(`\n  NETO total de la regla: ${usd(netoTot)} en ${ANOSCAL} años = ${usd(netoTot / ANOSCAL)} al año`);
console.log(`  meses con neto positivo: ${mesesFila.filter((x) => x.neto > 0).length} de ${porMes.size} (${pct(mesesFila.filter((x) => x.neto > 0).length / porMes.size)})`);
let acN = 0, cN = 0;
for (const x of mesesFila) { if (x.neto <= 0) break; acN += x.neto; cN++; if (acN >= netoTot) break; }
console.log(`  hacen falta ${cN} meses para juntar TODO el neto (los demás se lo comen)`);

// ── 2) agolpamiento ─────────────────────────────────────────────────────────
linea("2 — EL AGOLPAMIENTO: ¿dispara a la vez en todos los tickers?");
const mesTk = new Map();
for (const o of baseA) {
  if (o.tipo !== "C") continue;
  if (!mesTk.has(o.mes)) mesTk.set(o.mes, { n: 0, f: 0 });
  const x = mesTk.get(o.mes); x.n++; if (REGLA(o)) x.f++;
}
const fs = [...mesTk.values()].filter((x) => x.n >= 15);
const p = media(fs.map((x) => x.f / x.n));
const sdObs = sd(fs.map((x) => x.f / x.n));
const nMed = media(fs.map((x) => x.n));
const sdInd = Math.sqrt(p * (1 - p) / nMed);
console.log(`  meses con 15 tickers o más: ${fs.length} · tasa media de disparo ${pct(p)} · tickers por mes ${nMed.toFixed(0)}`);
console.log(`  cuánto varía el disparo de un mes a otro (observado)          : ${pct(sdObs)}`);
console.log(`  cuánto variaría si cada ticker decidiera por su cuenta (sorteo): ${pct(sdInd)}`);
console.log(`  → se agolpa ${(sdObs / sdInd).toFixed(1)} veces más de lo que daría el azar por ticker.`);
console.log(`  Traducido: ${nMed.toFixed(0)} tickers en un mes NO son ${nMed.toFixed(0)} apuestas, son del orden de ${Math.max(1, (nMed / (sdObs / sdInd) ** 2)).toFixed(1)}.`);
console.log(`  Con ${(porMes.size / ANOSCAL).toFixed(1)} meses de disparo al año, las apuestas independientes salen a`);
console.log(`  ~${((porMes.size / ANOSCAL) * Math.max(1, nMed / (sdObs / sdInd) ** 2)).toFixed(0)} al año, NO 127.`);

// ── 3) jackknife por meses ──────────────────────────────────────────────────
linea("3 — JACKKNIFE POR MESES: se quita un mes entero cada vez (sin azar, los quita todos)");
const rs = [];
for (const m of porMes.keys()) {
  const a = mide(selA.filter((o) => o.mes !== m));
  rs.push({ m, r: ratio(a) });
}
rs.sort((a, b) => a.r - b.r);
console.log(`  ${rs.length} pasadas · ratio con todo: ${R(TOT)}`);
console.log(`  quitando el mes que más ayuda: ${rs[0].r.toFixed(2)} (era ${rs[0].m})`);
console.log(`  mediana de las pasadas: ${mediana(rs.map((x) => x.r)).toFixed(2)} · quitando el mes que más estorba: ${rs[rs.length - 1].r.toFixed(2)} (${rs[rs.length - 1].m})`);
console.log(`  pasadas que caen por debajo de 1.40 (el objetivo): ${rs.filter((x) => x.r < 1.40).length} de ${rs.length}`);
// quitando los k mejores meses
console.log(`\n  | meses quitados (los que más aportan) | n | ratio | listón sin esos meses |`);
console.log(`  |---|---|---|---|`);
for (const k of [0, 1, 2, 3, 5, 8]) {
  const fuera = new Set(mesesFila.slice(0, k).map((x) => x.m));
  const a = mide(selA.filter((o) => !fuera.has(o.mes)));
  const l = mide(baseA.filter((o) => !fuera.has(o.mes)));
  console.log(`  | ${k} | ${num(a.n)} | **${R(a)}** | ${R(l)} |`);
}

// ── 4) control del calendario ───────────────────────────────────────────────
linea("4 — CONTROL DEL CALENDARIO: fijado el mes del año, ¿la señal sigue separando?");
const NM = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
console.log(`  | mes | listón n / ratio | con señal n / ratio | ¿mejora? |`);
console.log(`  |---|---|---|---|`);
let mejora = 0, peor = 0, ganC = 0, perC = 0, ganL = 0, perL = 0;
for (let i = 1; i <= 12; i++) {
  const mm = String(i).padStart(2, "0");
  const l = mide(baseA.filter((o) => o.mes.slice(4, 6) === mm));
  const s = mide(baseA.filter((o) => o.mes.slice(4, 6) === mm && REGLA(o)));
  if (s.n < 20) continue;
  if (ratio(s) > ratio(l)) mejora++; else peor++;
  ganC += s.gan; perC += s.per; ganL += l.gan; perL += l.per;
  console.log(`  | ${NM[i - 1]} | ${num(l.n)} / ${R(l)} | ${num(s.n)} / ${R(s)} | ${ratio(s) > ratio(l) ? "sí" : "NO"} |`);
}
console.log(`  meses del calendario donde la señal mejora: ${mejora} de ${mejora + peor}`);
// versión sin señal que sólo usa el calendario: los 4 meses donde más dispara
const CAL4 = ["10", "11", "02", "03"];   // los 4 de mayor disparo (elegidos MIRANDO la tabla: es una puerta)
const soloCal = mide(baseA.filter((o) => CAL4.includes(o.mes.slice(4, 6))));
console.log(`\n  UN CONTROL BARATO: comprar SIEMPRE (sin señal) en oct/nov/feb/mar, los 4 meses donde más dispara`);
console.log(`    n=${num(soloCal.n)} (${(soloCal.n / ANOSCAL).toFixed(0)} ops/año) · ratio ${R(soloCal)} · acierta ${pct(acierto(soloCal))}`);
console.log(`    (esos 4 meses se eligieron MIRANDO la tabla — es una puerta abierta, no una regla honesta)`);
const senEnCal = mide(baseA.filter((o) => CAL4.includes(o.mes.slice(4, 6)) && REGLA(o)));
console.log(`    y la señal DENTRO de esos 4 meses: n=${num(senEnCal.n)} · ratio ${R(senEnCal)}`);
const senFueraCal = mide(baseA.filter((o) => !CAL4.includes(o.mes.slice(4, 6)) && REGLA(o)));
const lisFueraCal = mide(baseA.filter((o) => !CAL4.includes(o.mes.slice(4, 6))));
console.log(`    y la señal FUERA de esos 4 meses: n=${num(senFueraCal.n)} · ratio ${R(senFueraCal)} · listón ahí ${R(lisFueraCal)}`);

// ── 5) dólares al año ───────────────────────────────────────────────────────
linea("5 — EN DÓLARES AL AÑO ($1,000 por operación)");
for (const [et, a] of [["sin señal (todo el envase A)", LIS], ["con la señal (>80, 60 d)", TOT]]) {
  const neto = a.gan - a.per;
  console.log(`  ${et}: ${(a.n / ANOSCAL).toFixed(0)} ops/año · ${usd(a.gan / ANOSCAL)} ganados − ${usd(a.per / ANOSCAL)} perdidos = ${usd(neto / ANOSCAL)} al año`);
  console.log(`     capital puesto al año: ${usd(a.n * APUESTA / ANOSCAL)} → rendimiento sobre lo arriesgado ${pct(neto / (a.n * APUESTA))}`);
}
// sin el mes campeón
{
  const top = mesesFila[0].m;
  const a = mide(selA.filter((o) => o.mes !== top));
  const neto = a.gan - a.per;
  console.log(`  con la señal PERO sin ${top}: ${usd(neto / ANOSCAL)} al año · ratio ${R(a)}`);
}
console.log(`\n${"═".repeat(100)}`);
console.log(`  PUERTAS de este script: 6 cortes de jackknife + 12 meses del calendario + 1 control de calendario = 19.`);
console.log(`${"═".repeat(100)}\n`);
