// LENTE 5 · EL TEST QUE FALTABA: hora × short(σ) × ALA(σ), todo normalizado a $4.500 de colateral.
//
// El test del agente (estructura4-hora-mecanismo.mjs, sección C) fija el strike CORTO en sigmas
// pero deja el ALA en 50 PUNTOS FIJOS. A las 11:00 el strike LARGO queda a 1,32σ del spot y a las
// 14:30 a 2,25σ. Que las roturas sean más someras por la tarde está construido dentro del test.
// Aquí se fija TAMBIÉN el ala en sigmas. Si el efecto de la hora era real, sigue estando.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const COMM = 0.03, COL = 4500;
const HORAS = ["09:45", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "13:45", "14:15", "14:30", "15:00"];
const SHORTS = [0.41, 0.50, 0.62, 0.75];
const ALAS = [0.60, 0.85, 1.25, 1.70];        // ancho del ala EN SIGMAS

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iV, iU].some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const set = new Set(HORAS), filas = new Map(), spots = new Map();
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask, iv: Number(c[iV]) });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const rej = new Map();
for (const h of HORAS) for (const s of SHORTS) for (const a of ALAS) rej.set(h + "|" + s + "|" + a, []);

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;
  for (const h of HORAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const atm = cerca(fc, spot);
    const horas = Math.max(0.05, 16 - Number(h.slice(0, 2)) - Number(h.slice(3)) / 60);
    const sigma = atm.iv > 0 ? spot * atm.iv * Math.sqrt(horas / (252 * 6.5)) : null;
    if (!(sigma > 0)) continue;
    for (const sh of SHORTS) for (const aw of ALAS) {
      const cC = cerca(fc, spot + sh * sigma), pC = cerca(fp, spot - sh * sigma);
      const cL = cerca(fc, cC.K + aw * sigma), pL = cerca(fp, pC.K - aw * sigma);
      if (cL.K <= cC.K || pL.K >= pC.K) continue;
      const cr = cC.bid + pC.bid - cL.ask - pL.ask;
      if (!(cr > 0)) continue;
      const aC = cL.K - cC.K, aP = pC.K - pL.K;
      const p1 = Math.min(Math.max(S - cC.K, 0), aC), p2 = Math.min(Math.max(pC.K - S, 0), aP);
      const col = (Math.max(aC, aP) - cr) * 100;
      const pl = ((cr - p1 - p2) * 100 - 8 * COMM) * (COL / col);   // normalizado a $4.500 de colateral
      rej.get(h + "|" + sh + "|" + aw).push({ fecha, pl, roto: (p1 + p2) > 0 ? 1 : 0, cred: cr * 100 * (COL / col) });
    }
  }
}

const cvar = (p, q) => { const s = [...p].sort((a, b) => a - b); const k = Math.max(1, Math.floor(s.length * q)); return media(s.slice(0, k)); };
const res = (v) => { const p = v.map((x) => x.pl); return { n: p.length, alAno: p.reduce((a, b) => a + b, 0) / (p.length / 251), p5: pct(p, 0.05), cvar5: cvar(p, 0.05), dd: drawdown(p), peor: Math.min(...p), rotos: v.filter((x) => x.roto).length / v.length }; };

// Spearman de hora (índice) contra la métrica
function spearman(xs, ys) {
  const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
  const rx = rank(xs), ry = rank(ys), n = xs.length;
  const mx = media(rx), my = media(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return num / Math.sqrt(dx * dy);
}

console.log("\n" + "=".repeat(118));
console.log("LENTE 5 · HORA x SHORT(σ) x ALA(σ) — todo a $4.500 de colateral. ¿Queda algo de la hora?");
console.log("=".repeat(118));
const salida = {};
for (const sh of SHORTS) {
  for (const aw of ALAS) {
    const filas = HORAS.map((h) => ({ h, v: rej.get(h + "|" + sh + "|" + aw) })).filter((x) => x.v.length >= 100);
    if (filas.length < 6) continue;
    const rs = filas.map((x) => ({ h: x.h, r: res(x.v) }));
    const rho = spearman(filas.map((_, i) => i), rs.map((x) => Math.abs(x.r.cvar5)));
    const rhoP5 = spearman(filas.map((_, i) => i), rs.map((x) => Math.abs(x.r.p5)));
    salida["short" + sh + "_ala" + aw] = { rhoCvar: rho, rhoP5, filas: rs.map((x) => ({ hora: x.h, ...x.r })) };
    console.log("\n  short " + sh + "σ · ala " + aw + "σ   ·   Spearman hora vs |CVaR5| = " + rho.toFixed(2) + "   ·   hora vs |p5| = " + rhoP5.toFixed(2));
    console.log("  | hora | " + rs.map((x) => x.h).join(" | ") + " |");
    console.log("  |---|" + rs.map(() => "---").join("|") + "|");
    console.log("  | CVaR5 | " + rs.map((x) => eur(x.r.cvar5)).join(" | ") + " |");
    console.log("  | p5 | " + rs.map((x) => eur(x.r.p5)).join(" | ") + " |");
    console.log("  | $/ano | " + rs.map((x) => eur(x.r.alAno)).join(" | ") + " |");
    console.log("  | racha | " + rs.map((x) => eur(x.r.dd)).join(" | ") + " |");
  }
}

// ═══ el contraste directo: el condor de LESTER (±25/50 pts) medido en sigmas por hora ═══
console.log("\n" + "=".repeat(118));
console.log("RESUMEN — Spearman de la hora contra |CVaR5| segun QUE se mantenga fijo");
console.log("=".repeat(118));
console.log("\n  · con los +-25/50 PUNTOS fijos (lo que midio el agente): rho = -0,94  (el ala pasa de 0,83σ a 1,73σ sola)");
for (const k of Object.keys(salida))
  console.log("  · con la geometria fija en SIGMAS (" + k.replace("short", "short ").replace("_ala", "σ, ala ") + "σ): rho = " + salida[k].rhoCvar.toFixed(2) + " (|CVaR5|), " + salida[k].rhoP5.toFixed(2) + " (|p5|)");

writeFileSync("scripts/refuta-hora-lente2.json", JSON.stringify(salida, null, 2));
console.log("\n-> scripts/refuta-hora-lente2.json");
