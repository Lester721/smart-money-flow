// ═══ ESTRUCTURA 3 · COMPRAR LA COLA — FASE A: extraer las patas de cola de las cadenas reales ═══
//
// Construye, para cada uno de los 653 días, el cóndor de siempre MÁS los precios reales (BID y ASK
// a las 11:00) de las patas que se comprarían como seguro: put a −75/−100/−150/−200 puntos del
// spot de las 11:00 y call a +75/+100/+150/+200.
//
// REGLAS QUE SE CUMPLEN AQUÍ:
//   · Todo lo que decide la entrada se lee del corte de las 11:00. El cierre sólo se usa para
//     liquidar, nunca para elegir.
//   · Se paga el ASK de lo comprado. Si no hay ASK (ask<=0) la pata NO SE PUEDE COMPRAR y el día
//     se marca; no se rellena con el punto medio ni con un modelo.
//   · El lector de cadenas está COPIADO de scripts/regimen-18.mjs.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, SEP = 25, COMM = 0.03;
const DIST = [75, 100, 150, 200];
const SALIDA = "scripts/cola-filas.json";

function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);   // el campo que no existe se lee como 0
  const [iK, iT, iB, iA, iV, iU] = idx;

  const enHora = [], camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), iv = Number(c[iV]);
    if (K > 0 && bid >= 0 && ask >= 0) enHora.push({ K, bid, ask, iv });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log("## FASE A · " + fechas.length + " días de cadena en disco");

const filas = [];
let sinDatos = 0;
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 50 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { sinDatos++; continue; }
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]);
  const ap = C.camino.get(horas[0]);
  const sp11 = C.camino.get(HORA);
  if (!(cierre > 0) || !(ap > 0) || !(sp11 > 0)) { sinDatos++; continue; }

  const manana = horas.filter((h) => h <= HORA).map((h) => C.camino.get(h)).filter((x) => x > 0);

  // ── el cóndor de siempre ──
  const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { sinDatos++; continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { sinDatos++; continue; }
  const pl = (cred - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
                   - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 8 * COMM;

  const atm = cerca(C.filas, sp11);
  const iv = atm.iv > 0 ? atm.iv : null;

  // ── alas alternativas (patrón de comparación: estrechar el ala también corta la cola) ──
  const alas = {};
  for (const w of [20, 30, 40]) {
    const cw = cerca(C.filas, cC.K + w), pw = cerca(P.filas, pC.K - w);
    alas["a" + w] = (cw.K > cC.K && pw.K < pC.K && cw.ask > 0 && pw.ask > 0)
      ? { cK: cw.K, cAsk: cw.ask, pK: pw.K, pAsk: pw.ask } : null;
  }

  // ── las patas de cola: ASK real, y null si no hay oferta ──
  const cola = {};
  for (const d of DIST) {
    const p = cerca(P.filas, sp11 - d), c = cerca(C.filas, sp11 + d);
    cola["p" + d] = { K: p.K, ask: p.ask > 0 ? p.ask : null, bid: p.bid };
    cola["c" + d] = { K: c.K, ask: c.ask > 0 ? c.ask : null, bid: c.bid };
  }

  filas.push({
    fecha, sp11, ap, cierre, pl, credito: cred * 100,
    maxM: Math.max(...manana), minM: Math.min(...manana),
    sigma: iv ? sp11 * iv * Math.sqrt(5 / (252 * 6.5)) : null,
    ivAtm: iv,
    cCK: cC.K, pCK: pC.K, cLK: cL.K, pLK: pL.K,
    cCbid: cC.bid, pCbid: pC.bid, cLask: cL.ask, pLask: pL.ask,
    cola, alas,
    dow: new Date(fecha + "T00:00:00Z").getUTCDay(),
  });
}
writeFileSync(SALIDA, JSON.stringify(filas), "utf8");
console.log("\n   " + filas.length + " días útiles · " + sinDatos + " descartados · guardado en " + SALIDA);

// Comprobación de cordura: ¿cuántas patas de cola NO se pueden comprar (sin ask)?
for (const d of DIST) {
  const nP = filas.filter((f) => f.cola["p" + d].ask == null).length;
  const nC = filas.filter((f) => f.cola["c" + d].ask == null).length;
  const dp = filas.map((f) => f.sp11 - f.cola["p" + d].K).sort((a, b) => a - b);
  console.log(`   −${d}: ${nP} días sin ASK en la put · +${d}: ${nC} sin ASK en la call · distancia real de la put p5=${dp[Math.floor(dp.length*0.05)].toFixed(0)} p50=${dp[dp.length>>1].toFixed(0)} p95=${dp[Math.floor(dp.length*0.95)].toFixed(0)}`);
}
