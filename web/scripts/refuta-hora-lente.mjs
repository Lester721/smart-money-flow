// LENTE "FUTURO" sobre el hallazgo de la HORA DE ENTRADA.
// Reconstruye el cóndor exactamente igual que estructura4-hora-cola.mjs, pero además:
//   1) GUARDA la geometría REAL (ancho de ala efectivo, granularidad de strikes) por hora
//   2) mide el pareado 11:00 vs 13:45 (los mismos días) con bootstrap por bloques
//   3) prueba la geometría: short y ALA fijados AMBOS en sigmas, normalizado a colateral igual
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { media, sd, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, ALA = 50, COMM = 0.03;
const HORAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "14:30", "15:00"];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iV, iU].some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const set = new Set(HORAS), filas = new Map(), spots = new Map(), todos = new Map();
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0)) continue;
    if (!todos.has(h)) todos.set(h, []);
    todos.get(h).push(K);                       // TODOS los strikes listados, con o sin oferta
    if (!(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask, iv: Number(c[iV]) });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre, todos };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const porHora = new Map(HORAS.map((h) => [h, []]));
const geo = new Map(HORAS.map((h) => [h, { alaC: [], alaP: [], nStrikes: [], nListados: [], perdidos: 0 }]));
const geomSigma = new Map(HORAS.map((h) => [h, []]));   // short 0,62σ Y ala 1,25σ, colateral normalizado

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;
  for (const h of HORAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const g = geo.get(h);
    const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
    const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { g.perdidos++; continue; }
    const credito = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(credito > 0)) { g.perdidos++; continue; }
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
    const perdC = Math.min(Math.max(S - cC.K, 0), anchoC);
    const perdP = Math.min(Math.max(pC.K - S, 0), anchoP);
    const pl = (credito - perdC - perdP) * 100 - 8 * COMM;
    const atm = cerca(fc, spot);
    const horas = Math.max(0.05, 16 - Number(h.slice(0, 2)) - Number(h.slice(3)) / 60);
    const sigma = atm.iv > 0 ? spot * atm.iv * Math.sqrt(horas / (252 * 6.5)) : null;
    const colateral = (Math.max(anchoC, anchoP) - credito) * 100;
    g.alaC.push(anchoC); g.alaP.push(anchoP);
    g.nStrikes.push(fc.length); g.nListados.push((C.todos.get(h) || []).length);
    porHora.get(h).push({
      fecha, pl, credito: credito * 100, sigma, anchoC, anchoP, colateral,
      sepSig: sigma ? SEP / sigma : null, alaSig: sigma ? anchoC / sigma : null,
      roto: (perdC + perdP) > 0 ? 1 : 0,
      total: (perdC >= anchoC - 0.01 || perdP >= anchoP - 0.01) ? 1 : 0,
    });

    // ── geometría FIJA EN SIGMAS: short 0,62σ, ala 1,25σ (la geometría real de las 13:45) ──
    if (sigma > 0) {
      const d = 0.62 * sigma, w = 1.25 * sigma;
      const gcC = cerca(fc, spot + d), gpC = cerca(fp, spot - d);
      const gcL = cerca(fc, gcC.K + w), gpL = cerca(fp, gpC.K - w);
      if (gcL.K > gcC.K && gpL.K < gpC.K) {
        const cr = gcC.bid + gpC.bid - gcL.ask - gpL.ask;
        if (cr > 0) {
          const aC = gcL.K - gcC.K, aP = gpC.K - gpL.K;
          const p2 = Math.min(Math.max(S - gcC.K, 0), aC), q2 = Math.min(Math.max(gpC.K - S, 0), aP);
          const col = (Math.max(aC, aP) - cr) * 100;
          const plG = (cr - p2 - q2) * 100 - 8 * COMM;
          // NORMALIZADO a $4.500 de colateral: es lo que se puede poner, no "un contrato"
          geomSigma.get(h).push({ fecha, pl: plG * (4500 / col), col, ancho: aC });
        }
      }
    }
  }
}

const cvar = (pls, q) => { const s = [...pls].sort((a, b) => a - b); const k = Math.max(1, Math.floor(s.length * q)); return media(s.slice(0, k)); };
const res = (v) => {
  const p = v.map((x) => x.pl);
  return {
    n: p.length, alAno: p.reduce((a, b) => a + b, 0) / (p.length / 251), media: media(p),
    peor: Math.min(...p), p1: pct(p, 0.01), p5: pct(p, 0.05), cvar5: cvar(p, 0.05),
    dd: drawdown(p), acierto: p.filter((x) => x > 0).length / p.length,
  };
};

console.log("\n" + "=".repeat(114));
console.log("LENTE 1 · LA GEOMETRIA REAL DEL CONDOR POR HORA (¿el ala mide 50 puntos de verdad?)");
console.log("=".repeat(114));
console.log("\n| hora | n | ala CALL p50/p05/min | ala PUT p50/p05/min | % dias con ala<50 | strikes con oferta | strikes listados | colateral med |");
console.log("|---|---|---|---|---|---|---|---|");
for (const h of HORAS) {
  const g = geo.get(h), v = porHora.get(h); if (!v.length) continue;
  const est = (a) => pct(a, 0.5) + "/" + pct(a, 0.05) + "/" + Math.min(...a);
  const estrechas = v.filter((x) => x.anchoC < 50 || x.anchoP < 50).length;
  console.log("| " + h + (h === "11:00" ? " <--" : "") + " | " + v.length + " | " + est(g.alaC) + " | " + est(g.alaP) + " | " +
    (estrechas / v.length * 100).toFixed(1) + "% | " + Math.round(media(g.nStrikes)) + " | " + Math.round(media(g.nListados)) +
    " | " + eur(media(v.map((x) => x.colateral))) + " |");
}

console.log("\n" + "=".repeat(114));
console.log("LENTE 2 · PAREADO 11:00 vs 13:45 — los MISMOS dias, diferencia dia a dia");
console.log("=".repeat(114));
const m11 = new Map(porHora.get("11:00").map((x) => [x.fecha, x]));
const par = porHora.get("13:45").filter((x) => m11.has(x.fecha)).map((x) => ({ fecha: x.fecha, a: m11.get(x.fecha).pl, b: x.pl }));
const dif = par.map((x) => x.b - x.a);
const seDif = sd(dif) / Math.sqrt(dif.length);
const tPar = media(dif) / seDif;
const cor = (media(par.map((x) => x.a * x.b)) - media(par.map((x) => x.a)) * media(par.map((x) => x.b))) / (sd(par.map((x) => x.a)) * sd(par.map((x) => x.b)));
console.log("\n  n pareado = " + par.length);
console.log("  media 11:00 = " + eur(media(par.map((x) => x.a))) + "/dia   media 13:45 = " + eur(media(par.map((x) => x.b))) + "/dia");
console.log("  diferencia media (13:45 − 11:00) = " + eur(media(dif)) + "/dia · error tipico " + eur(seDif) + " · t pareado = " + tPar.toFixed(2));
console.log("  en $/ano: diferencia " + eur(media(dif) * 251) + " ± " + eur(1.96 * seDif * 251) + " (IC 95%)");
console.log("  correlacion dia a dia de los dos P&L: " + cor.toFixed(3));
console.log("\n  IC 95% del INGRESO de cada hora por separado:");
for (const h of ["11:00", "13:00", "13:30", "13:45", "14:00", "14:30"]) {
  const p = porHora.get(h).map((x) => x.pl);
  const se = sd(p) / Math.sqrt(p.length) * 251;
  console.log("    " + h + ": " + eur(media(p) * 251) + "/ano ± " + eur(1.96 * se) + "  ->  [" + eur(media(p) * 251 - 1.96 * se) + " , " + eur(media(p) * 251 + 1.96 * se) + "]");
}

console.log("\n" + "=".repeat(114));
console.log("LENTE 3 · BOOTSTRAP POR BLOQUES (bloques de 21 dias, 2.000 remuestras, pareado)");
console.log("=".repeat(114));
function bootBloques(sA, sB, B = 2000, L = 21) {
  const n = sA.length, nb = Math.ceil(n / L);
  let gP5 = 0, gCV = 0, gDD = 0, gIng = 0, gEf = 0;
  const dP5 = [], dCV = [], dDD = [], dIng = [];
  for (let b = 0; b < B; b++) {
    const iA = [], iB = [];
    for (let k = 0; k < nb; k++) { const s = Math.floor(Math.random() * (n - L + 1)); for (let j = 0; j < L && iA.length < n; j++) { iA.push(sA[s + j]); iB.push(sB[s + j]); } }
    const rA = res(iA.map((p) => ({ pl: p }))), rB = res(iB.map((p) => ({ pl: p })));
    if (Math.abs(rB.p5) < Math.abs(rA.p5)) gP5++;
    if (Math.abs(rB.cvar5) < Math.abs(rA.cvar5)) gCV++;
    if (Math.abs(rB.dd) < Math.abs(rA.dd)) gDD++;
    if (rB.alAno > rA.alAno) gIng++;
    if (rA.dd < 0 && rB.dd < 0 && rB.alAno / Math.abs(rB.dd) > rA.alAno / Math.abs(rA.dd)) gEf++;
    dP5.push(Math.abs(rA.p5) - Math.abs(rB.p5)); dCV.push(Math.abs(rA.cvar5) - Math.abs(rB.cvar5));
    dDD.push(Math.abs(rA.dd) - Math.abs(rB.dd)); dIng.push(rB.alAno - rA.alAno);
  }
  return {
    gP5: gP5 / B, gCV: gCV / B, gDD: gDD / B, gIng: gIng / B, gEf: gEf / B,
    p5IC: [pct(dP5, 0.025), pct(dP5, 0.975)], cvIC: [pct(dCV, 0.025), pct(dCV, 0.975)],
    ddIC: [pct(dDD, 0.025), pct(dDD, 0.975)], ingIC: [pct(dIng, 0.025), pct(dIng, 0.975)],
  };
}
const bt = bootBloques(par.map((x) => x.a), par.map((x) => x.b));
console.log("\n  P(13:45 tiene menos |p5|)    = " + (bt.gP5 * 100).toFixed(1) + "%   IC95 de la reduccion: [" + eur(bt.p5IC[0]) + " , " + eur(bt.p5IC[1]) + "]");
console.log("  P(13:45 tiene menos |CVaR5|) = " + (bt.gCV * 100).toFixed(1) + "%   IC95: [" + eur(bt.cvIC[0]) + " , " + eur(bt.cvIC[1]) + "]");
console.log("  P(13:45 tiene menos |racha|) = " + (bt.gDD * 100).toFixed(1) + "%   IC95: [" + eur(bt.ddIC[0]) + " , " + eur(bt.ddIC[1]) + "]");
console.log("  P(13:45 ingresa MAS)         = " + (bt.gIng * 100).toFixed(1) + "%   IC95 de la dif. de $/ano: [" + eur(bt.ingIC[0]) + " , " + eur(bt.ingIC[1]) + "]");
console.log("  P(13:45 mejor $/ano por $ de racha) = " + (bt.gEf * 100).toFixed(1) + "%");

console.log("\n" + "=".repeat(114));
console.log("LENTE 4 · LA GEOMETRIA, NO LA HORA: short 0,62σ Y ala 1,25σ en TODAS las horas, a colateral $4.500");
console.log("=".repeat(114));
console.log("(el test \"a igual sigma\" del agente fija el strike corto en sigmas pero deja el ALA en 50 PUNTOS FIJOS:");
console.log(" a las 11:00 esas 50 pts son ~0,8σ y a las 13:45 son ~1,25σ. El ala se ensancha sola al entrar tarde.)");
console.log("\n| hora | n | ala real (pts) | $/ano | media/dia | peor dia | p5 | CVaR5 | peor racha | acierto |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const h of HORAS) {
  const v = geomSigma.get(h); if (v.length < 100) continue;
  const r = res(v);
  console.log("| " + h + (h === "11:00" ? " <--" : "") + " | " + r.n + " | " + media(v.map((x) => x.ancho)).toFixed(0) + " | " + eur(r.alAno) + " | " +
    eur(r.media) + " | " + eur(r.peor) + " | " + eur(r.p5) + " | " + eur(r.cvar5) + " | " + eur(r.dd) + " | " + (r.acierto * 100).toFixed(0) + "% |");
}
console.log("\n  el condor de +-25/50 puntos, medido en SIGMAS (lo que realmente cambia con la hora):");
for (const h of HORAS) {
  const v = porHora.get(h).map((x) => x.alaSig).filter((x) => x != null); if (v.length < 100) continue;
  const s = porHora.get(h).map((x) => x.sepSig).filter((x) => x != null);
  const sg = porHora.get(h).map((x) => x.sigma).filter((x) => x != null);
  console.log("    " + h + ": short " + media(s).toFixed(2) + "σ · ala " + media(v).toFixed(2) + "σ · σ mediana " + pct(sg, 0.5).toFixed(0) + " pts");
}

writeFileSync("scripts/refuta-hora-lente.json", JSON.stringify({
  geometria: Object.fromEntries(HORAS.map((h) => [h, {
    n: porHora.get(h).length, alaCp50: pct(geo.get(h).alaC, 0.5),
    alaCmin: geo.get(h).alaC.length ? Math.min(...geo.get(h).alaC) : null,
    pctEstrecha: porHora.get(h).length ? porHora.get(h).filter((x) => x.anchoC < 50 || x.anchoP < 50).length / porHora.get(h).length : null,
    colateral: media(porHora.get(h).map((x) => x.colateral)),
    alaSig: media(porHora.get(h).map((x) => x.alaSig).filter((x) => x != null)),
  }])),
  pareado: { n: par.length, difMedia: media(dif), se: seDif, t: tPar, cor },
  bootstrap: bt,
  geomSigma: Object.fromEntries(HORAS.filter((h) => geomSigma.get(h).length >= 100).map((h) => [h, res(geomSigma.get(h))])),
}, null, 2));
console.log("\n-> scripts/refuta-hora-lente.json");
