// DETALLE DE LA COLA DE LA GANADORA — ¿qué días quita el filtro y cuáles NO?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/sintesis-detalle-cola.mjs
//
// Complemento de scripts/sintesis-mejor-condor.mjs. Aquí no se mide nada nuevo: se ABRE la cola
// para poder decirle a Lester, día por día, qué desaparece y qué se queda.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, ALA = 50, DIST = 30;
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// señal
const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const o = m.get(570), c = m.get(960), p11 = m.get(660);
    if (!(o > 0) || !(c > 0) || !(p11 > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const filas = [];
for (const fecha of fechas) {
  const i = idx.get(fecha);
  if (i === undefined || i < 200) continue;
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  const S = C.cierre;
  const mk = (d) => {
    const cC = cerca(C.filas, spot + d), pC = cerca(P.filas, spot - d);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) return null;
    const aC = cL.K - cC.K, aP = pC.K - pL.K;
    return { pl: (cred - Math.min(Math.max(S - cC.K, 0), aC) - Math.min(Math.max(pC.K - S, 0), aP)) * 100 - 8 * COMM,
      cred: cred * 100, kC: cC.K, kP: pC.K, lado: (S - cC.K) > (pC.K - S) ? "CALL" : "PUT" };
  };
  const a = mk(25), b = mk(DIST);
  if (!a || !b) continue;
  const cierres = dias.slice(i - 200, i).map((d) => d.c);
  const p11 = dias[i].p11;
  const opera = p11 / media(cierres.slice(-20)) - 1 >= 0 && p11 / media(cierres.slice(-50)) - 1 >= 0;
  filas.push({ fecha, base: a.pl, gan: b.pl, opera, cred: b.cred, spot, cierre: S, mov: S - spot, lado: b.lado });
}

console.log(`\n${filas.length} días.\n`);
console.log("── LOS 15 PEORES DÍAS DEL CÓNDOR DE HOY (±25) Y QUÉ HACE LA GANADORA (±30 + filtro) ──");
console.log("| fecha | ±25 | ±30 | ¿el filtro deja operar? | resultado real de la ganadora | movimiento 11:00→cierre | lado |");
console.log("|---|---|---|---|---|---|---|");
for (const f of [...filas].sort((a, b) => a.base - b.base).slice(0, 15)) {
  console.log(`| ${f.fecha} | ${eur(f.base)} | ${eur(f.gan)} | ${f.opera ? "SÍ opera" : "**NO opera**"} | ${eur(f.opera ? f.gan : 0)} | ${f.mov.toFixed(0)} pts | ${f.lado} |`);
}

const g = filas.map((f) => (f.opera ? f.gan : 0));
console.log("\n── LOS DÍAS QUE LE SIGUEN DOLIENDO A LA GANADORA (los 10 peores que SÍ opera) ──");
console.log("| fecha | P&L ganadora | P&L del cóndor de hoy | crédito cobrado | movimiento | lado |");
console.log("|---|---|---|---|---|---|");
for (const f of filas.filter((x) => x.opera).sort((a, b) => a.gan - b.gan).slice(0, 10)) {
  console.log(`| ${f.fecha} | ${eur(f.gan)} | ${eur(f.base)} | ${eur(f.cred)} | ${f.mov.toFixed(0)} pts | ${f.lado} |`);
}

const cnt = (v, u) => v.filter((x) => x <= -u).length;
const gOp = filas.filter((x) => x.opera).map((x) => x.gan), b = filas.map((x) => x.base);
console.log("\n── DÓNDE CORTA EL FILTRO Y DÓNDE NO ──");
console.log("| umbral de pérdida | cóndor de hoy (±25, 649 días) | ganadora (±30 + filtro, 455 días) | ¿cuántos quita? |");
console.log("|---|---|---|---|");
for (const u of [1000, 2000, 3000, 4000, 4500]) {
  console.log(`| más de ${eur(-u)} | ${cnt(b, u)} días | ${cnt(gOp, u)} días | ${cnt(b, u) - cnt(gOp, u)} |`);
}

console.log("\n── LA NUEVA PEOR RACHA DE LA GANADORA, DÍA A DÍA ──");
const ven = filas.filter((f) => f.fecha >= "2025-10-08" && f.fecha <= "2025-10-17");
let ac = 0;
console.log("| fecha | ¿opera? | P&L ganadora | acumulado | P&L del cóndor de hoy |");
console.log("|---|---|---|---|---|");
for (const f of ven) { const p = f.opera ? f.gan : 0; ac += p; console.log(`| ${f.fecha} | ${f.opera ? "sí" : "no"} | ${eur(p)} | ${eur(ac)} | ${eur(f.base)} |`); }

console.log("\n── LA PEOR RACHA DEL CÓNDOR DE HOY (2025-01-29 → 2025-03-07), QUÉ HACE LA GANADORA ──");
const v2 = filas.filter((f) => f.fecha >= "2025-01-29" && f.fecha <= "2025-03-07");
const sB = v2.reduce((a, f) => a + f.base, 0), sG = v2.reduce((a, f) => a + (f.opera ? f.gan : 0), 0);
console.log(`  ${v2.length} sesiones · cóndor de hoy ${eur(sB)} · ganadora ${eur(sG)} (opera ${v2.filter((f) => f.opera).length} de ${v2.length} días)`);
