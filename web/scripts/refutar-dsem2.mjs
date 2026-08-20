// REFUTACION 2 · el control de desplazamiento, el mecanismo por mitades, y el permutation honesto.
import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const DIAS_ANO = 252, EFECTIVO = 7977;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function ddown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const d = acc - pico; if (d < peor) peor = d; } return peor; }

const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/dsem-camino.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SESIONES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay(); if (w !== 0 && w !== 6 && !FEST.has(s)) SESIONES.push(s);
}
const POS = new Map(SESIONES.map((s, i) => [s, i]));
for (const f of filas) {
  const i = POS.get(f.fecha);
  let k = 0; while (SESIONES[i + k + 1] && SESIONES[i + k + 1].slice(0, 7) === f.fecha.slice(0, 7)) k++;
  f.posFin = k; f.ultimoMes = k === 0 ? 1 : 0; f.ano = +f.fecha.slice(0, 4);
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
  const c = CAM[f.fecha], i1530 = c.h.indexOf("15:30");
  f.zCierrePts = i1530 >= 0 ? c.s[c.s.length - 1] - c.s[i1530] : null;
}
const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
function ev(base, filtro) {
  const serie = base.map((f) => (filtro(f) ? 0 : f.pl));
  return { alAno: serie.reduce((a,b)=>a+b,0) / (base.length/DIAS_ANO), dd: ddown(serie) };
}
console.log("=".repeat(112));
console.log("1 · EL CONTROL DE DESPLAZAMIENTO, VALOR A VALOR (el informe dice 'k=0 bate a 20 de 20')");
console.log("=".repeat(112));
for (const [nom, g] of [["2022-2023 (A)", A], ["2024-2026 (B)", B]]) {
  const res = [];
  for (let k = 0; k < 21; k++) {
    const marc = new Set();
    for (const f of g) if (f.ultimoMes === 1) { const j = POS.get(f.fecha) + k; if (SESIONES[j]) marc.add(SESIONES[j]); }
    res.push({ k, r: ev(g, (f) => marc.has(f.fecha)) });
  }
  console.log("\n  " + nom + "   base " + eur(ev(g, ()=>false).alAno) + "/año");
  console.log("    " + res.map(x => "k"+x.k+"="+eur(x.r.alAno)).join("  "));
  const otros = res.slice(1).map(x=>x.r.alAno).sort((a,b)=>b-a);
  console.log("    k=0 = " + eur(res[0].r.alAno) + "   ·   el MEJOR de los otros 20 = " + eur(otros[0]) + "   ·   VENTAJA DE k=0 SOBRE EL SEGUNDO = " + eur(res[0].r.alAno - otros[0]));
}
console.log("\n" + "=".repeat(112));
console.log("2 · EL MECANISMO, PARTIDO EN LAS DOS MITADES (el informe lo mide sobre los 1.121 juntos)");
console.log("=".repeat(112));
console.log("| periodo | n ultimo | |mov 15:30->cierre| ultimo | resto | t Welch | |mov 11:00->cierre| ultimo | resto | t |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom, g] of [["2022-2023", A], ["2024-2026", B], ["TODO", filas]]) {
  const u = g.filter(f=>f.ultimoMes===1 && f.zCierrePts!=null), r = g.filter(f=>f.posFin>4 && f.zCierrePts!=null);
  const uc = u.map(f=>Math.abs(f.zCierrePts)), rc = r.map(f=>Math.abs(f.zCierrePts));
  const ut = u.map(f=>Math.abs(f.zTardePts)), rt = r.map(f=>Math.abs(f.zTardePts));
  console.log("| "+nom+" | "+u.length+" | "+media(uc).toFixed(1)+" | "+media(rc).toFixed(1)+" | "+tWelch(uc,rc).toFixed(2)+" | "+media(ut).toFixed(1)+" | "+media(rt).toFixed(1)+" | "+tWelch(ut,rt).toFixed(2)+" |");
}
console.log("\n  Tasa de rotura del corto (cierre fuera de los strikes cortos):");
for (const [nom, g] of [["2022-2023", A], ["2024-2026", B], ["TODO", filas]]) {
  const u = g.filter(f=>f.ultimoMes===1), r = g.filter(f=>f.posFin>4);
  const ru = u.filter(f=>f.cierre>f.kCallCorta||f.cierre<f.kPutCorta).length;
  const rr = r.filter(f=>f.cierre>f.kCallCorta||f.cierre<f.kPutCorta).length;
  console.log("    "+nom.padEnd(11)+" ultimo "+ru+"/"+u.length+" = "+(ru/u.length*100).toFixed(0)+"%   ·   resto "+rr+"/"+r.length+" = "+(rr/r.length*100).toFixed(0)+"%");
}
console.log("\n" + "=".repeat(112));
console.log("3 · PERMUTACION HONESTA · en la unica direccion donde la eleccion fue ciega (elegido en B, probado en A)");
console.log("=".repeat(112));
// En A: cual es la probabilidad de que UN dia-al-mes cualquiera (mismo n, mismo espaciado) mejore
// tanto o mas que el ultimo dia del mes?  Se sortea un offset por mes, no un conjunto libre.
function porMes(g) { const m = new Map(); for (const f of g) { const k = f.fecha.slice(0,7); if (!m.has(k)) m.set(k, []); m.get(k).push(f); } return m; }
for (const [nom, g] of [["2022-2023 (A) — la unica prueba fuera de muestra de verdad", A], ["2024-2026 (B) — donde se eligio", B]]) {
  const M = porMes(g), base = ev(g, ()=>false);
  const real = ev(g, (f)=>f.ultimoMes===1);
  let mejor = 0, N = 20000;
  const meses = [...M.values()];
  for (let s = 0; s < N; s++) {
    const marc = new Set();
    for (const dias of meses) marc.add(dias[Math.floor(Math.random()*dias.length)].fecha);
    const r = ev(g, (f)=>marc.has(f.fecha));
    if (r.alAno >= real.alAno) mejor++;
  }
  console.log("  "+nom);
  console.log("    base "+eur(base.alAno)+"  ·  regla "+eur(real.alAno)+"  ·  de "+N+" sorteos de 'un dia al azar por mes', "+mejor+" igualan o baten a la regla  →  p = "+(mejor/N).toFixed(4));
}
console.log("\n" + "=".repeat(112));
console.log("4 · CUANTOS CANDIDATOS DEL CALENDARIO 'SOBREVIVEN AL CRUCE' con el criterio del informe");
console.log("=".repeat(112));
console.log("  (criterio del informe: mejora $/año en A Y en B. Si muchos lo pasan, el criterio no filtra.)");
