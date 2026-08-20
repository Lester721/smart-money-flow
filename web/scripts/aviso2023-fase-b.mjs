// FASE B · ¿es 2023 de verdad distinto? Y ¿la señal lo ve ANTES?
// Sólo descripción: aquí no se elige nada, no cuenta como prueba.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const CUENTA = 56389;
const filas = JSON.parse(readFileSync("scripts/aviso2023-filas.json", "utf8"));

// ── PARIDAD con la serie ya auditada (regimen-filas.json, 653 días) ──
const guardadas = new Map(JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).map((o) => [o.fecha, o.pl]));
let peor = 0, n = 0, faltan = 0;
for (const f of filas) {
  const g = guardadas.get(f.fecha);
  if (g === undefined) { if (f.fecha >= "2024-01-01" && f.fecha <= "2026-08-10") faltan++; continue; }
  n++; peor = Math.max(peor, Math.abs(g - f.pl));
}
console.log(`## PARIDAD · ${n} días comparados con regimen-filas.json · peor diferencia $${peor.toFixed(4)} · sin pareja ${faltan}`);

radiografia(filas, ["pl", "credito", "sp11", "cierre", "mov", "colateral"], "cóndor 0DTE 2022-2026",
  { maxCeros: 0.2, cerosLegitimos: ["mov"] });
console.log("## desviación de strike respecto al ±25 pedido: máx call " +
  Math.max(...filas.map((f) => f.desvC)) + " pts · máx put " + Math.max(...filas.map((f) => f.desvP)) + " pts");
console.log("## anchos de ala: call " + [...new Set(filas.map((f) => f.anchoC))].sort((a,b)=>a-b).join("/") +
  " · put " + [...new Set(filas.map((f) => f.anchoP))].sort((a,b)=>a-b).join("/"));

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const cvar = (v, p) => { const s = [...v].sort((a, b) => a - b); const k = Math.max(1, Math.floor(v.length * p)); return media(s.slice(0, k)); };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");

// ── EL AÑO A AÑO ──
console.log("\n" + "═".repeat(112));
console.log("  EL CÓNDOR ±25 / alas 50 / entrada 11:00 · 1 CONTRATO · precios reales · año a año");
console.log("═".repeat(112));
console.log("| año | días | $ del año | $/día | 5% peor | peor día | % días en pérdida | crédito medio (pts) | mov. medio (pts) | crédito/mov |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const anos = [...new Set(filas.map((f) => f.fecha.slice(0, 4)))].sort();
const resumen = {};
for (const a of ["TODO", ...anos]) {
  const g = a === "TODO" ? filas : filas.filter((f) => f.fecha.slice(0, 4) === a);
  const pls = g.map((f) => f.pl);
  const r = { n: g.length, total: suma(pls), dia: media(pls), cvar: cvar(pls, 0.05), peor: Math.min(...pls),
              perd: g.filter((f) => f.pl < 0).length / g.length,
              cred: media(g.map((f) => f.credito)), mov: media(g.map((f) => f.mov)) };
  r.ratio = r.cred / r.mov;
  resumen[a] = r;
  console.log(`| ${a} | ${r.n} | **${eur(r.total)}** | ${eur(r.dia)} | ${eur(r.cvar)} | ${eur(r.peor)} | ${(r.perd*100).toFixed(0)}% | ${r.cred.toFixed(2)} | ${r.mov.toFixed(2)} | ${r.ratio.toFixed(3)} |`);
}

// ── LA MISMA TABLA POR MESES DE 2023, para ver CUÁNDO se rompió ──
console.log("\n## 2023 mes a mes (1 contrato)\n");
console.log("| mes | días | $ del mes | crédito medio | mov. medio | crédito/mov |");
console.log("|---|---|---|---|---|---|");
for (const m of [...new Set(filas.filter((f) => f.fecha.startsWith("2023")).map((f) => f.fecha.slice(0, 7)))].sort()) {
  const g = filas.filter((f) => f.fecha.slice(0, 7) === m);
  console.log(`| ${m} | ${g.length} | ${eur(suma(g.map((f)=>f.pl)))} | ${media(g.map((f)=>f.credito)).toFixed(2)} | ${media(g.map((f)=>f.mov)).toFixed(2)} | ${(media(g.map((f)=>f.credito))/media(g.map((f)=>f.mov))).toFixed(3)} |`);
}

// ── LA SEÑAL, sin umbral todavía: media móvil de crédito/movimiento con días ANTERIORES ──
// R_N(D) = suma de créditos de los N días previos / suma de movimientos de esos mismos días.
// Ambos ingredientes son de días CERRADOS: a las 11:00 de D todo esto ya se sabe.
for (const N of [20, 40, 60]) {
  for (let i = 0; i < filas.length; i++) {
    if (i < N) { filas[i]["R" + N] = null; continue; }
    const v = filas.slice(i - N, i);
    filas[i]["R" + N] = suma(v.map((f) => f.credito)) / suma(v.map((f) => f.mov));
  }
}
console.log("\n## LA SEÑAL R_N = Σcrédito / Σmovimiento de los N días ANTERIORES (media por año)\n");
console.log("| año | R20 | R40 | R60 | $ del año |");
console.log("|---|---|---|---|---|");
for (const a of anos) {
  const g = filas.filter((f) => f.fecha.slice(0, 4) === a);
  const m = (k) => { const v = g.map((f) => f[k]).filter((x) => x != null); return v.length ? media(v).toFixed(3) : "—"; };
  console.log(`| ${a} | ${m("R20")} | ${m("R40")} | ${m("R60")} | ${eur(resumen[a].total)} |`);
}
console.log("\n## R40 mes a mes, todo el período (para ver si el aviso llega ANTES del daño)\n");
const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].sort();
console.log("| mes | R40 medio | $ del mes | mes | R40 medio | $ del mes |");
console.log("|---|---|---|---|---|---|");
const linea = (m) => { const g = filas.filter((f) => f.fecha.slice(0,7) === m); const v = g.map((f)=>f.R40).filter((x)=>x!=null);
  return `${m} | ${v.length ? media(v).toFixed(3) : "—"} | ${eur(suma(g.map((f)=>f.pl)))}`; };
for (let i = 0; i < Math.ceil(meses.length / 2); i++) {
  const a = meses[i], b = meses[i + Math.ceil(meses.length / 2)];
  console.log("| " + linea(a) + " | " + (b ? linea(b) : " |  | ") + " |");
}
