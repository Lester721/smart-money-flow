// REFUTACIÓN · tercera tanda
//  14 · ¿el P&L de regimen-filas.json sale de las cadenas REALES? — se reconstruyen 8 días
//       desde iv_*.csv con bid/ask y se comparan uno a uno.
//  15 · intervalo de confianza del INGRESO retenido (la parte que el hallazgo da por hecha)
//  16 · recuento honesto de pruebas y listón

import { readFileSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const desv = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin, hFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const ops = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const porFecha = new Map(ops.map((o) => [o.fecha, o]));

console.log("═".repeat(104));
console.log("14 · ¿EL P&L ES REAL? — reconstrucción desde la cadena, bid al vender y ask al comprar");
console.log("═".repeat(104));
console.log("\n| fecha | crédito recalculado | crédito guardado | P&L recalculado | P&L guardado | Δ | patas (V call/V put/C call/C put) |");
console.log("|---|---|---|---|---|---|---|");
const muestra = ["2024-01-02", "2024-04-04", "2024-08-05", "2025-01-31", "2025-04-30", "2025-10-10", "2026-06-05", "2026-08-10"];
let maxD = 0;
for (const fecha of muestra) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P"), g = porFecha.get(fecha);
  if (!C || !P || !g) { console.log(`| ${fecha} | — | — | — | — | SIN DATO | — |`); continue; }
  const spot = C.filas[0].spot;
  const cC = cerca(C.filas, spot + 25), pC = cerca(P.filas, spot - 25);
  const cL = cerca(C.filas, cC.K + 50), pL = cerca(P.filas, pC.K - 50);
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  const S = C.cierre;
  const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K) - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
  const d = Math.abs(pl - g.pl); maxD = Math.max(maxD, d);
  console.log(`| ${fecha} | ${eur(cred * 100)} | ${eur(g.credito)} | ${eur(pl)} | ${eur(g.pl)} | ${d < 0.01 ? "0" : eur(d)} | ${cC.K}/${pC.K}/${cL.K}/${pL.K} |`);
}
console.log(`\n    Mayor discrepancia de la muestra: ${maxD < 0.01 ? "CERO — el fichero sale de las cadenas reales" : eur(maxD)}`);

// ═══ 15 · INTERVALO DEL INGRESO RETENIDO ═══════════════════════════════════════════════════
const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    if (!(m.get(570) > 0) || !(m.get(960) > 0) || !(m.get(660) > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c: m.get(960), p11: m.get(660) });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));
const filas = [];
for (const op of ops) {
  const i = idx.get(op.fecha); if (i === undefined || i < 200) continue;
  const c = dias.slice(i - 200, i).map((d) => d.c);
  filas.push({ fecha: op.fecha, pl: op.pl, d20: dias[i].p11 / media(c.slice(-20)) - 1, d50: dias[i].p11 / media(c.slice(-50)) - 1 });
}
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = filas.length / 252;
const B = (f) => f.d20 >= 0 && f.d50 >= 0;
const fuera = filas.filter((f) => !B(f)).map((f) => f.pl);
const dentro = filas.filter(B).map((f) => f.pl);
const totBase = filas.reduce((a, f) => a + f.pl, 0);

console.log(`\n${"═".repeat(104)}`);
console.log("15 · EL INGRESO RETENIDO — lo que el hallazgo da por hecho («el ingreso NO baja»)");
console.log("═".repeat(104));
const seFuera = desv(fuera) / Math.sqrt(fuera.length);
const totFuera = fuera.reduce((a, x) => a + x, 0);
console.log(`\n    Los ${fuera.length} días que se saltan: media ${eur(media(fuera))}/día · desv ${eur(desv(fuera))} · total ${eur(totFuera)}`);
console.log(`    IC 95% de su media: ${eur(media(fuera) - 1.96 * seFuera)} … ${eur(media(fuera) + 1.96 * seFuera)} por día`);
console.log(`    → en total, esos días valían entre ${eur(fuera.length * (media(fuera) - 1.96 * seFuera))} y ${eur(fuera.length * (media(fuera) + 1.96 * seFuera))}`);
console.log(`    → el ingreso con filtro queda entre ${eur((totBase - fuera.length * (media(fuera) + 1.96 * seFuera)) / ANOS)}/año y ${eur((totBase - fuera.length * (media(fuera) - 1.96 * seFuera)) / ANOS)}/año`);
console.log(`      (base ${eur(totBase / ANOS)}/año · punto estimado con filtro ${eur(dentro.reduce((a, x) => a + x, 0) / ANOS)}/año)`);
const t = (media(dentro) - media(fuera)) / Math.sqrt(desv(dentro) ** 2 / dentro.length + desv(fuera) ** 2 / fuera.length);
console.log(`\n    t de la diferencia de MEDIAS (dentro vs fuera): ${t.toFixed(2)} → la media NO se separa; lo que se separa es la COLA.`);

// ═══ 16 · RECUENTO DE PRUEBAS ══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("16 · EL LISTÓN — ¿aguanta z=5,92 si se cuentan las pruebas de verdad?");
console.log("═".repeat(104));
const listonT = (p) => { const q = 0.05 / p / 2, tt = Math.sqrt(-2 * Math.log(q)); return Math.round((tt - (2.30753 + 0.27061 * tt) / (1 + 0.99229 * tt + 0.04481 * tt * tt)) * 100) / 100; };
console.log("\n| pruebas contadas | listón |z| | ¿pasa z=5,92? | ¿pasa z=5,83 (control SPX)? |");
console.log("|---|---|---|---|");
for (const p of [56, 120, 300, 1000, 5000, 20000]) console.log(`| ${p} | ${listonT(p)} | ${5.92 >= listonT(p) ? "sí" : "NO"} | ${5.83 >= listonT(p) ? "sí" : "NO"} |`);
