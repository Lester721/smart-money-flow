// REFUTACIÓN CON LA LENTE «DINERO» · extractor con LAS CUATRO PATAS ABIERTAS.
//
// El extractor original (dsem-extraer.mjs) guarda el crédito ya sumado. Para auditar el dinero
// hace falta ver cada pata por separado: bid, ask, horquilla, ancho real del ala, distancia real
// del corto al spot, y el colateral que de verdad retiene el bróker.
//
// Mismo lector, mismos filtros, mismas horas. Lo único que cambia es que aquí NO se tira nada:
// se guarda todo lo que hace falta para preguntarle al dinero.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refut-dinero-extraer.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const ALA = 50;
const SEP = 25;

const CAMPOS = ["strike", "timestamp", "bid", "ask", "underlying_price", "implied_vol"];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const lin = txt.split("\n");
  if (lin.length < 3) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = CAMPOS.map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error(`faltan columnas en ${f}: ${CAMPOS.filter((c, i) => idx[i] < 0).join(", ")}`);
  const [iK, iT, iB, iA, iU, iV] = idx;

  const camino = new Map();
  const enHora = [];
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16);
    const sp = +c[iU];
    if (sp > 0 && !camino.has(h)) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV];
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}

const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`${fechas.length} fechas con fichero de CALL en disco`);

const filas = [], saltados = [];
let hecho = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { saltados.push([fecha, "sin filas a las 11:00"]); continue; }
  const horas = [...new Set([...C.camino.keys(), ...P.camino.keys()])].sort();
  const s0 = horas.map((h) => C.camino.get(h) ?? P.camino.get(h));
  const ok = horas.filter((h, i) => s0[i] > 0);
  const sp = ok.map((h) => (C.camino.get(h) ?? P.camino.get(h)));
  if (sp.length < 20) { saltados.push([fecha, `camino de ${sp.length} puntos`]); continue; }
  const i11 = ok.indexOf(HORA);
  if (i11 < 1) { saltados.push([fecha, "sin precio a las 11:00"]); continue; }
  const sp11 = sp[i11], cierre = sp[sp.length - 1], hFin = ok[ok.length - 1];
  if (!(sp11 > 0 && cierre > 0)) { saltados.push([fecha, "precios a cero"]); continue; }

  const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { saltados.push([fecha, "alas cruzadas"]); continue; }

  const mid = (x) => (x.bid + x.ask) / 2;
  const creditoNat = (cC.bid + pC.bid - cL.ask - pL.ask) * 100;   // lo que usa el hallazgo
  const creditoMid = (mid(cC) + mid(pC) - mid(cL) - mid(pL)) * 100;
  if (!(creditoNat > 0)) { saltados.push([fecha, `crédito ${creditoNat.toFixed(0)}`]); continue; }

  const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
  const S = cierre;
  const perdidaC = Math.min(Math.max(S - cC.K, 0), anchoC) * 100;
  const perdidaP = Math.min(Math.max(pC.K - S, 0), anchoP) * 100;

  const cAtm = cerca(C.filas, sp11), pAtm = cerca(P.filas, sp11);
  const ivs = [cAtm.iv, pAtm.iv].filter((x) => x > 0.001 && x < 5);
  const ivAtm = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;

  filas.push({
    fecha, sp11, cierre, hFin, nPuntos: sp.length, ivAtm,
    // las cuatro patas, tal cual salen del fichero
    cCk: cC.K, cCb: cC.bid, cCa: cC.ask,
    pCk: pC.K, pCb: pC.bid, pCa: pC.ask,
    cLk: cL.K, cLb: cL.bid, cLa: cL.ask,
    pLk: pL.K, pLb: pL.bid, pLa: pL.ask,
    anchoC, anchoP,
    distC: cC.K - sp11, distP: sp11 - pC.K,
    creditoNat, creditoMid,
    peaje: creditoMid - creditoNat,           // lo que cuesta cruzar las cuatro horquillas
    perdidaC, perdidaP,
    riesgoMax: Math.max(anchoC, anchoP) * 100 - creditoNat,
    nCotC: C.filas.length, nCotP: P.filas.length,
  });
  if (++hecho % 200 === 0) console.log(`  ${hecho}/${fechas.length} · ${fecha}`);
}

console.log(`\n${filas.length} días construidos · ${saltados.length} saltados`);
for (const [f, m] of saltados) console.log(`  saltado ${f}: ${m}`);
if (filas.length < fechas.length * 0.9) throw new Error(`sólo ${filas.length} de ${fechas.length}. Eso es un bug, no un resultado.`);

writeFileSync("scripts/refut-dinero-filas.json", JSON.stringify(filas));
console.log("escrito scripts/refut-dinero-filas.json");
