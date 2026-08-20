// LA MISMA LENTE QUE MATÓ A «SALTARSE EL DÍA», APLICADA A «CERRAR A LAS 15:30».
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/azar-cerrar-rotacion.mjs
//
// No vale declarar buena la regla nueva sin pasarle el control que tumbó a la vieja. Aquí se
// gira el PAR (pl, plCerrar) contra el calendario dentro de cada mitad, se vuelve a buscar entre
// los 44 cubos cuál es el que más gana cerrando a las 15:30, y se mira si el fin de mes destaca
// o si cualquier serie sin información produce un cubo igual de bueno.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const DIAS_ANO = 252;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function drawdown(p) { let a = 0, pi = 0, w = 0; for (const x of p) { a += x; if (a > pi) pi = a; if (a - pi < w) w = a - pi; } return w; }

const cerr = JSON.parse(readFileSync("scripts/azar-cerrar-1530.json", "utf8"));
const MAPC = new Map(cerr.map((r) => [r.fecha, r.plCerrar]));
const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
for (const f of filas) f.plCerrar = MAPC.get(f.fecha);
if (filas.some((f) => f.plCerrar == null)) throw new Error("faltan precios de salida — no se rellena");

const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const MEDIO = new Set(["2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29","2024-12-24","2025-07-03","2025-11-28","2025-12-24","2026-11-27","2026-12-24"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay(); if (w !== 0 && w !== 6 && !FEST.has(s)) SES.push(s);
}
const POS = new Map(SES.map((s, i) => [s, i]));
const tercerViernes = (y, m) => { let n = 0; for (let d = 1; d <= 31; d++) { const dt = new Date(Date.UTC(y, m - 1, d)); if (dt.getUTCMonth() !== m - 1) break; if (dt.getUTCDay() === 5 && ++n === 3) return iso(dt); } return null; };
for (const f of filas) {
  const d = new Date(f.fecha + "T00:00:00Z"), i = POS.get(f.fecha);
  const ant = SES[i - 1], sig = SES[i + 1];
  const y = +f.fecha.slice(0, 4), m = +f.fecha.slice(5, 7), dd = +f.fecha.slice(8, 10);
  const salto = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000;
  f.dow = d.getUTCDay(); f.mes = m; f.ano = y;
  f.semMes = Math.ceil(dd / 7); f.domCubo = Math.min(6, Math.ceil(dd / 5));
  f.vispFest = sig && salto(f.fecha, sig) > (f.dow === 5 ? 3 : 1) ? 1 : 0;
  f.postFest = ant && salto(ant, f.fecha) > (f.dow === 1 ? 3 : 1) ? 1 : 0;
  f.medioDia = MEDIO.has(f.fecha) ? 1 : 0;
  f.primeroMes = !ant || ant.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimoMes = !sig || sig.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimos2 = f.ultimoMes || (sig && SES[i + 2] && SES[i + 2].slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
  const tv = tercerViernes(y, m), iTv = POS.get(tv);
  f.opex = f.fecha === tv ? 1 : 0;
  f.opexTrim = f.opex && [3, 6, 9, 12].includes(m) ? 1 : 0;
  f.semOpex = iTv != null && i - iTv >= -4 && i - iTv <= 0 ? 1 : 0;
  f.finTrim = f.ultimoMes && [3, 6, 9, 12].includes(m) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
  f.ahorro = f.plCerrar - f.pl;          // lo que salva cerrar media hora antes
}
radiografia(filas, ["pl", "plCerrar", "ahorro", "credito"], "cerrar 15:30", { maxCeros: 0.3 });

const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
const DIAS = ["dom","LUN","MAR","MIE","JUE","VIE","sab"], MESES = ["","ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const FAMILIAS = [
  { id: "dow", cubo: (f) => f.dow, et: (v) => DIAS[v] },
  { id: "domCubo", cubo: (f) => f.domCubo, et: (v) => ["","1-5","6-10","11-15","16-20","21-25","26-31"][v] },
  { id: "semMes", cubo: (f) => f.semMes, et: (v) => `sem ${v}` },
  { id: "mes", cubo: (f) => f.mes, et: (v) => MESES[v] },
  { id: "opex", cubo: (f) => f.opex, et: (v) => (v ? "OPEX" : "resto") },
  { id: "opexTrim", cubo: (f) => f.opexTrim, et: (v) => (v ? "trimestral" : "resto") },
  { id: "semOpex", cubo: (f) => f.semOpex, et: (v) => (v ? "semOPEX" : "resto") },
  { id: "vispFest", cubo: (f) => f.vispFest, et: (v) => (v ? "víspera" : "resto") },
  { id: "postFest", cubo: (f) => f.postFest, et: (v) => (v ? "postFest" : "resto") },
  { id: "medioDia", cubo: (f) => f.medioDia, et: (v) => (v ? "medioDía" : "resto") },
  { id: "primeroMes", cubo: (f) => f.primeroMes, et: (v) => (v ? "1ºmes" : "resto") },
  { id: "ultimoMes", cubo: (f) => f.ultimoMes, et: (v) => (v ? "últimoMes" : "resto") },
  { id: "ultimos2", cubo: (f) => f.ultimos2, et: (v) => (v ? "2últ" : "resto") },
  { id: "finTrim", cubo: (f) => f.finTrim, et: (v) => (v ? "finTrim" : "resto") },
];
const MIN_N = 20, CUBOS = [];
for (const fam of FAMILIAS) for (const v of [...new Set(filas.map(fam.cubo))].sort((a, b) => a - b)) {
  const nA = A.filter((f) => fam.cubo(f) === v).length, nB = B.filter((f) => fam.cubo(f) === v).length;
  if (nA >= MIN_N && nB >= MIN_N) CUBOS.push({ id: `${fam.id}=${fam.et(v)}`, fam, v, nA, nB });
}
const idxDe = (g, fn) => new Set(g.map((f, i) => (fn(f) ? i : -1)).filter((i) => i >= 0));
const IDX = CUBOS.map((c) => ({ c, iA: idxDe(A, (f) => c.fam.cubo(f) === c.v), iB: idxDe(B, (f) => c.fam.cubo(f) === c.v) }));

// Δ$/año de CERRAR ese cubo a las 15:30 (no de saltárselo)
function dAnoCerrar(g, pl, ahorro, idx) {
  let s = 0; for (const i of idx) s += ahorro[i];
  return s / (g.length / DIAS_ANO);
}
const ahA = A.map((f) => f.ahorro), ahB = B.map((f) => f.ahorro);

console.log("═".repeat(112));
console.log("1 · LOS 44 CUBOS, ORDENADOS POR LO QUE GANAN CERRANDO A LAS 15:30 (peor de las dos mitades)");
console.log("═".repeat(112));
const EV = IDX.map(({ c, iA, iB }) => ({
  ...c, dA: dAnoCerrar(A, null, ahA, iA), dB: dAnoCerrar(B, null, ahB, iB),
  mA: media([...iA].map((i) => ahA[i])), mB: media([...iB].map((i) => ahB[i])),
}));
const ord = [...EV].sort((a, b) => Math.min(b.dA, b.dB) - Math.min(a.dA, a.dB));
console.log("| cubo | nA | nB | ahorro/día A | ahorro/día B | Δ$/año A | Δ$/año B | peor de los dos |");
console.log("|---|---|---|---|---|---|---|---|");
for (const e of ord.slice(0, 12))
  console.log(`| ${e.id} | ${e.nA} | ${e.nB} | ${eur(e.mA)} | ${eur(e.mB)} | ${eur(e.dA)} | ${eur(e.dB)} | ${eur(Math.min(e.dA, e.dB))} |`);
const fm = EV.find((e) => e.id === "ultimoMes=últimoMes");
const rank = ord.findIndex((e) => e.id === fm.id) + 1;
const realStat = Math.min(fm.dA, fm.dB);
console.log(`\n  «último día del mes» queda el ${rank}º de ${CUBOS.length}, con ${eur(realStat)} en la peor de las dos mitades.`);
const pasan = EV.filter((e) => e.dA > 0 && e.dB > 0);
console.log(`  cubos con ahorro positivo en LAS DOS mitades: ${pasan.length} de ${CUBOS.length}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · ROTACIÓN — el par (pl, ahorro) girado contra el calendario
// ═════════════════════════════════════════════════════════════════════════════════════════════
const ROT = 2000;
const rotar = (v, r) => { const n = v.length, o = new Array(n); for (let i = 0; i < n; i++) o[i] = v[(i + r) % n]; return o; };
console.log("\n" + "═".repeat(112));
console.log(`2 · ROTACIÓN · ${ROT.toLocaleString("es-ES")} giros · ¿produce un calendario SIN información un cubo tan bueno?`);
console.log("═".repeat(112));
const mejores = [], nPasan = [];
for (let s = 0; s < ROT; s++) {
  const ra = 1 + Math.floor(Math.random() * (A.length - 1)), rb = 1 + Math.floor(Math.random() * (B.length - 1));
  const aA = rotar(ahA, ra), aB = rotar(ahB, rb);
  let mejor = -Infinity, k = 0;
  for (const { iA, iB } of IDX) {
    const dA = dAnoCerrar(A, null, aA, iA), dB = dAnoCerrar(B, null, aB, iB);
    if (dA > 0 && dB > 0) k++;
    const m = Math.min(dA, dB); if (m > mejor) mejor = m;
  }
  mejores.push(mejor); nPasan.push(k);
  if ((s + 1) % 500 === 0) console.log(`   ... ${s + 1}/${ROT}`);
}
const p = mejores.filter((x) => x >= realStat).length / ROT;
const pTop = mejores.filter((x) => x >= Math.min(ord[0].dA, ord[0].dB)).length / ROT;
console.log(`\n   MEJOR cubo bajo rotación: mediana ${eur(pct(mejores, 0.5))} · p95 ${eur(pct(mejores, 0.95))} · máx ${eur(Math.max(...mejores))}`);
console.log(`   → p(ruido produzca un cubo ≥ el fin de mes, ${eur(realStat)})  = ${p.toFixed(4)}  ${p < 0.05 ? "PASA" : "NO PASA"}`);
console.log(`   → p(ruido produzca un cubo ≥ el MEJOR real, ${eur(Math.min(ord[0].dA, ord[0].dB))}) = ${pTop.toFixed(4)}  ${pTop < 0.05 ? "PASA" : "NO PASA"}`);
console.log(`   cubos con ahorro positivo en las dos mitades bajo rotación: mediana ${pct(nPasan, 0.5)} · p95 ${pct(nPasan, 0.95)} · real ${pasan.length}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL AHORRO, CUBO A CUBO, CON t Y LISTÓN
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("3 · ¿ES EL FIN DE MES EL CUBO DONDE MÁS SE SALVA CERRANDO ANTES? (t del ahorro contra el resto)");
console.log("═".repeat(112));
const ts = [];
for (const c of CUBOS) {
  const g = filas.filter((f) => c.fam.cubo(f) === c.v), r = filas.filter((f) => c.fam.cubo(f) !== c.v);
  ts.push({ id: c.id, n: g.length, t: tWelch(g.map((f) => f.ahorro), r.map((f) => f.ahorro)), m: media(g.map((f) => f.ahorro)) });
}
ts.sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
for (const x of ts.slice(0, 8)) console.log(`   ${x.id.padEnd(22)} n=${String(x.n).padStart(4)}  ahorro/día ${eur(x.m).padStart(7)}  t=${x.t.toFixed(2)}`);
const L62 = listonT(62), L106 = listonT(106);
console.log(`\n   listón con 62 pruebas ${L62} · con 106 (las 62 del informe + los 44 cubos de ESTA búsqueda) ${L106}`);
console.log(`   el fin de mes: t=${ts.find((x) => x.id === "ultimoMes=últimoMes").t.toFixed(2)}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · TERCIOS DE TIEMPO Y AÑO A AÑO — la criba que mató al hallazgo de la inusualidad
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("4 · TRES TERCIOS DE TIEMPO Y AÑO A AÑO · ahorro de cerrar a 15:30 el fin de mes");
console.log("═".repeat(112));
const k3 = Math.floor(filas.length / 3);
const tercios = [filas.slice(0, k3), filas.slice(k3, 2 * k3), filas.slice(2 * k3)];
console.log("| tercio | rango | n fin de mes | ahorro/día fin de mes | ahorro/día resto |");
console.log("|---|---|---|---|---|");
for (let i = 0; i < 3; i++) {
  const g = tercios[i], a = g.filter((f) => f.ultimoMes), r = g.filter((f) => !f.ultimoMes);
  console.log(`| ${i + 1} | ${g[0].fecha} → ${g[g.length - 1].fecha} | ${a.length} | ${eur(media(a.map((f) => f.ahorro)))} | ${eur(media(r.map((f) => f.ahorro)))} |`);
}
console.log("\n| año | n | ahorro/día fin de mes | ahorro/día resto | ¿mismo signo? |");
console.log("|---|---|---|---|---|");
let signos = 0;
for (const y of [2022, 2023, 2024, 2025, 2026]) {
  const g = filas.filter((f) => f.ano === y), a = g.filter((f) => f.ultimoMes), r = g.filter((f) => !f.ultimoMes);
  const ma = media(a.map((f) => f.ahorro)), mr = media(r.map((f) => f.ahorro));
  if (ma > 0) signos++;
  console.log(`| ${y} | ${a.length} | ${eur(ma)} | ${eur(mr)} | ${ma > 0 ? "sí (+)" : "NO (−)"} |`);
}
console.log(`\n  años con ahorro positivo al cerrar antes el fin de mes: ${signos} de 5`);
