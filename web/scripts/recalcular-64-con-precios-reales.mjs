// RECALCULAR CON PRECIOS REALES LAS 64 OPERACIONES QUE SOBREVIVIERON.
//
// Idea de Lester: en cada operación del ledger la SEÑAL estaba limpia y sólo el PRECIO estaba
// inventado. En vez de tirarlas, se les pide a ThetaData el bid/ask real de las dos patas y se
// recalcula el resultado. Yo las borré de Redis sin ver esa distinción; éstas son las que
// sobrevivieron en la copia local (data/forward/ledger.json, 23-31 julio 2026).
//
// ╔═══ LO QUE SE CONSERVA DE CADA OPERACIÓN (limpio) ═══╗
//   ticker · entryDate · dte · sigma · dir · type · spot · rv · expiryDate
// ╔═══ LO QUE SE TIRA Y SE RECALCULA (venía de Black-Scholes) ═══╗
//   credit · netCredit · retOnRisk · pnlPerSpread
//
// ╔═══ DOS COSAS QUE ADEMÁS ESTABAN MAL, Y SE ARREGLAN AQUÍ ═══╗
//   1. Los strikes eran TEÓRICOS (shortK: 318.07). Ese contrato no existe. Aquí se ajustan al
//      strike LISTADO más cercano, que es el que se podría operar de verdad.
//   2. El crédito se tomaba entero. Aquí se VENDE al bid y se COMPRA al ask: la horquilla
//      completa, más $0,03 por contrato y pata.
//
// Liquidación: al vencimiento, valor intrínseco del spread con el cierre real del subyacente.
// No es un estimado — es lo que vale un vertical al expirar.
//
// Uso: node scripts/recalcular-64-con-precios-reales.mjs

import fs from "node:fs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const COMISION = 0.03;
const LEDGER = "data/forward/ledger.json";
const SALIDA = "data/forward/64-recalculadas.json";

const ops = JSON.parse(fs.readFileSync(LEDGER, "utf8"));
console.log(`═══ RECALCULAR CON PRECIOS REALES · ${ops.length} operaciones ═══`);
console.log(`   origen: ${LEDGER} (23-31 julio 2026, señal intacta)\n`);

const cache = new Map();
async function texto(ruta) {
  if (cache.has(ruta)) return cache.get(ruta);
  try {
    const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(60000) });
    const t = await r.text();
    cache.set(ruta, r.ok ? t : null);
    return r.ok ? t : null;
  } catch { cache.set(ruta, null); return null; }
}

// Strikes que EXISTEN de verdad para ese vencimiento.
async function listados(sym, exp) {
  const t = await texto(`option/list/strikes?symbol=${sym}&expiration=${exp}`);
  if (!t) return null;
  const ks = t.trim().split("\n").slice(1)
    .map((l) => +l.split(",").pop().replace(/"/g, "")).filter((x) => x > 0);
  return ks.length ? [...new Set(ks)].sort((a, b) => a - b) : null;
}

// Cotización real de una pata a una fecha (cierre de ese día).
async function cotiza(sym, exp, k, right, fecha) {
  const t = await texto(`option/history/eod?symbol=${sym}&expiration=${exp}&strike=${k}&right=${right}&start_date=${fecha}&end_date=${fecha}`);
  if (!t || !t.includes("bid")) return null;
  const lin = t.trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(","), iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
  const c = lin[lin.length - 1].split(",");
  const bid = +c[iB], ask = +c[iA];
  return ask > 0 && bid >= 0 && ask >= bid ? { bid, ask } : null;
}

async function cierreSubyacente(sym, fecha) {
  const t = await texto(`stock/history/eod?symbol=${sym}&start_date=${fecha}&end_date=${fecha}`);
  if (!t) return null;
  const lin = t.trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(","), iC = cab.indexOf("close");
  const v = +lin[lin.length - 1].split(",")[iC];
  return v > 0 ? v : null;
}

// Vencimientos que EXISTEN. El ledger guardaba `entrada + dte` a pelo, y eso cae en miércoles o
// jueves donde AAPL no tiene contratos: 54 de las 64 operaciones vencían en un día inexistente.
// Tercer barrote roto, además del precio modelado y los strikes teóricos.
async function expiraciones(sym) {
  const t = await texto(`option/list/expirations?symbol=${sym}`);
  if (!t) return null;
  const es = t.trim().split("\n").slice(1)
    .map((l) => l.split(",").pop().replace(/"/g, "").trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x));
  return es.length ? [...new Set(es)].sort() : null;
}

const cerca = (arr, x) => arr.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), arr[0]);
const res = [];
let hechas = 0;

for (const o of ops) {
  hechas++;
  const exps = await expiraciones(o.ticker);
  // La primera listada EN O DESPUÉS de la teórica: es la que se habría operado de verdad.
  const exp = exps ? (exps.find((e) => e >= o.expiryDate) ?? null) : null;
  if (!exp) {
    res.push({ id: o.id, ticker: o.ticker, dia: o.entryDate, motivo: "sin vencimiento listado" });
    continue;
  }
  const right = o.type === "put" ? "P" : "C";
  const fila = { id: o.id, ticker: o.ticker, dia: o.entryDate, tipo: o.type, dte: o.dte, sigma: o.sigma, vencTeorico: o.expiryDate, vencReal: exp,
                 creditoModelo: o.netCredit ?? o.credit, motivo: null };

  const ks = await listados(o.ticker, exp);
  if (!ks) { fila.motivo = "sin lista de strikes"; res.push(fila); continue; }

  // Strikes REALES, los que existen, no los teóricos del modelo.
  const kC = cerca(ks, o.shortK), kL = cerca(ks, o.longK);
  if (kC === kL) { fila.motivo = "los dos strikes caen en el mismo listado"; res.push(fila); continue; }
  fila.shortK = kC; fila.longK = kL; fila.anchoReal = Math.abs(kC - kL);

  const [qs, ql] = await Promise.all([
    cotiza(o.ticker, exp, kC, right, o.entryDate),
    cotiza(o.ticker, exp, kL, right, o.entryDate),
  ]);
  if (!qs || !ql) { fila.motivo = "sin cotización real en la entrada"; res.push(fila); continue; }

  // Se VENDE la corta al bid y se COMPRA la larga al ask. Horquilla entera.
  const creditoReal = qs.bid - ql.ask - 2 * COMISION;
  fila.creditoReal = Math.round(creditoReal * 1000) / 1000;
  fila.horquillaCorta = Math.round((qs.ask - qs.bid) * 1000) / 1000;

  const S = await cierreSubyacente(o.ticker, exp);
  if (S == null) { fila.motivo = "sin cierre del subyacente al vencimiento"; res.push(fila); continue; }
  fila.cierre = S;

  // Valor intrínseco del vertical al expirar, acotado por el ancho.
  const perd = o.type === "put"
    ? Math.min(Math.max(kC - S, 0), fila.anchoReal)
    : Math.min(Math.max(S - kC, 0), fila.anchoReal);
  fila.plReal = Math.round((creditoReal - perd) * 100 * 100) / 100;         // por spread, en $
  fila.riesgoReal = Math.round((fila.anchoReal - creditoReal) * 100 * 100) / 100;
  fila.retornoReal = fila.riesgoReal > 0 ? Math.round(fila.plReal / fila.riesgoReal * 10000) / 100 : null;
  fila.plModelo = o.pnlPerSpread ?? null;
  res.push(fila);

  if (hechas % 10 === 0) process.stdout.write(`\r   ${hechas}/${ops.length}   `);
}
console.log(`\r   ${hechas}/${ops.length} procesadas          \n`);

const buenas = res.filter((r) => r.plReal != null);
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const mdn = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

console.log(`${"─".repeat(70)}`);
console.log(`   recalculadas con precio real : ${buenas.length} de ${ops.length}`);
const fallos = res.filter((r) => r.motivo);
if (fallos.length) {
  const porQue = {};
  for (const f of fallos) porQue[f.motivo] = (porQue[f.motivo] ?? 0) + 1;
  console.log(`   sin recalcular               : ${fallos.length}`);
  for (const [m, n] of Object.entries(porQue)) console.log(`      · ${m}: ${n}`);
}

if (buenas.length) {
  const cm = buenas.map((r) => r.creditoModelo).filter((x) => x > 0);
  const cr = buenas.map((r) => r.creditoReal);
  console.log(`\n   CRÉDITO — lo que el modelo decía contra lo que el mercado pagaba:`);
  console.log(`      modelo  : $${(mdn(cm) * 100).toFixed(0)} de mediana`);
  console.log(`      real    : $${(mdn(cr) * 100).toFixed(0)} de mediana`);
  console.log(`      el modelo inflaba un ${((mdn(cm) / mdn(cr) - 1) * 100).toFixed(0)}%`);

  const conPL = buenas.filter((r) => r.retornoReal != null);
  if (conPL.length) {
    const gan = conPL.filter((r) => r.plReal > 0).length;
    console.log(`\n   RESULTADO REAL (${conPL.length} operaciones liquidadas al vencimiento):`);
    console.log(`      acierto            : ${(gan / conPL.length * 100).toFixed(0)}%`);
    console.log(`      P&L medio por spread: $${media(conPL.map((r) => r.plReal)).toFixed(0)}`);
    console.log(`      retorno sobre riesgo: ${media(conPL.map((r) => r.retornoReal)).toFixed(2)}%`);
    const conModelo = conPL.filter((r) => r.plModelo != null);
    if (conModelo.length) {
      console.log(`\n   Y lo que decía el modelo para esas mismas ${conModelo.length}:`);
      console.log(`      P&L medio del modelo: $${media(conModelo.map((r) => r.plModelo)).toFixed(0)}`);
    }
  }
}

fs.writeFileSync(SALIDA, JSON.stringify(res, null, 1));
console.log(`\n   guardado en ${SALIDA}`);
console.log(`\n   ⚠ 64 operaciones de 7 sesiones NO son una conclusión sobre la estrategia.`);
console.log(`     Lo que esto mide es CUÁNTO INFLABA EL MODELO, con números propios.\n`);
