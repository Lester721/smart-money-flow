// BASE PARA "EL DÍA ANTERIOR" — reconstruye los 1.123 días desde las cadenas de 5 min.
//
// Nada de scripts/regimen-filas.json (sólo cubre 653 días, 2024-2026). Aquí se lee la cadena.
// Todo lo que se guarda es OBSERVABLE: el camino del subyacente, la cadena a las 11:00 con
// bid/ask reales, y el cierre de las 16:00. Ninguna media de la serie entera.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dia-anterior-base.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", SEP = 25, ALA = 50, COMM = 0.03;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const nec = ["strike", "timestamp", "bid", "ask", "midpoint", "implied_vol", "underlying_price"];
  const idx = nec.map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f + " → " + cab.join("|"));
  const [iK, iT, iB, iA, iM, iV, iU] = idx;
  const enHora = [];
  const camino = new Map();   // hh:mm -> spot
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && !camino.has(h)) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0 && sp > 0)
      enHora.push({ K, bid, ask, mid: Number(c[iM]), iv: Number(c[iV]), spot: sp });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`ficheros de CALL encontrados: ${fechas.length}`);

const dias = [];
const excluidos = [];
let hecho = 0;
for (const fecha of fechas) {
  if (++hecho % 100 === 0) process.stderr.write(`  ${hecho}/${fechas.length}\n`);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C) { excluidos.push([fecha, "sin CALL cotizada a las 11:00"]); continue; }
  if (!P) { excluidos.push([fecha, "sin PUT cotizada a las 11:00"]); continue; }

  // camino del subyacente: unión de los dos ficheros (mismo spot)
  const cam = new Map(C.camino);
  for (const [h, s] of P.camino) if (!cam.has(h)) cam.set(h, s);
  const horas = [...cam.keys()].sort();
  if (!horas.length) { excluidos.push([fecha, "sin camino de subyacente"]); continue; }
  const apertura = cam.get(horas[0]);
  const cierre = cam.get(horas[horas.length - 1]);
  const hFin = horas[horas.length - 1];
  let hi = -Infinity, lo = Infinity, hiM = -Infinity, loM = Infinity;
  for (const h of horas) {
    const s = cam.get(h);
    if (s > hi) hi = s; if (s < lo) lo = s;
    if (h <= HORA) { if (s > hiM) hiM = s; if (s < loM) loM = s; }
  }
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0) || !(cierre > 0)) { excluidos.push([fecha, "spot inválido"]); continue; }

  const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { excluidos.push([fecha, "no hay ala a 50 puntos"]); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { excluidos.push([fecha, `crédito ≤ 0 ($${cred.toFixed(2)})`]); continue; }

  const S = cierre;
  const perdC = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
  const perdP = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
  const pl = (cred - perdC - perdP) * 100 - 8 * COMM;

  // sigma del straddle a las 11:00 (movimiento esperado que queda, en puntos) — sólo normalizador
  const atmC = cerca(C.filas, sp11), atmP = cerca(P.filas, sp11);
  const straddle = atmC.mid + atmP.mid;
  const ivATM = (atmC.iv + atmP.iv) / 2;

  // penetración máxima intradía (cuánto se metió el precio más allá de un corto)
  let penMax = 0;
  for (const h of horas) {
    if (h < HORA) continue;
    const s = cam.get(h);
    penMax = Math.max(penMax, s - cC.K, pC.K - s);
  }

  dias.push({
    fecha, ticker: "SPXW",
    apertura, sp11, cierre, hi, lo, hiM, loM, hFin,
    kC: cC.K, kP: pC.K, kCL: cL.K, kPL: pL.K,
    cred, credD: cred * 100, pl,
    straddle, ivATM,
    penCierre: Math.max(S - cC.K, pC.K - S, 0),
    penMax,
    roto: (S > cC.K || S < pC.K) ? 1 : 0,
    rotoIntra: penMax > 0 ? 1 : 0,
    lado: S > cC.K ? "C" : S < pC.K ? "P" : "-",
  });
}

writeFileSync("scripts/dia-anterior-base.json", JSON.stringify(dias));
console.log(`\nDÍAS VÁLIDOS: ${dias.length}   (${dias[0].fecha} → ${dias[dias.length - 1].fecha})`);
console.log(`EXCLUIDOS: ${excluidos.length}`);
for (const [f, m] of excluidos) console.log(`  ✗ ${f}  ${m}`);
const porAno = {};
for (const d of dias) porAno[d.fecha.slice(0, 4)] = (porAno[d.fecha.slice(0, 4)] ?? 0) + 1;
console.log("por año:", JSON.stringify(porAno));
