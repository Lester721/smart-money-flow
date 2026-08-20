// PASO 1 — CACHÉ COMPACTA DE LOS 1.123 DÍAS, reconstruida desde las cadenas.
//
// NO se usa scripts/regimen-filas.json: sólo cubre 653 días (2024-2026). Todo lo que hay aquí
// sale de scripts/cache-theta/gex-2026/iv_AAAA-MM-DD_{C,P}.csv, que son las cadenas 0DTE de SPXW
// cada 5 minutos.
//
// Por día guarda:
//   h[]  s[]   — el camino del subyacente cada 5 min (hora y precio). El camino ENTERO, porque
//                el rango de AYER hace falta y se calcula del camino de ayer.
//   c25  p25   — las cuatro patas del cóndor de hoy a las 11:00, con BID de lo vendido y ASK de
//                lo comprado. Precios REALES, nunca punto medio.
//   ivAtm      — implied_vol del strike más cercano al spot a las 11:00 (media call/put).
//   strad      — el straddle del dinero a las 11:00 (mid call + mid put). Es la σ que el mercado
//                pone al movimiento que queda hasta el cierre: el normalizador adimensional.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/mov-cache.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00";

const CAB = ["symbol","expiration","strike","right","timestamp","bid","bid_implied_vol","midpoint",
             "implied_vol","ask","ask_implied_vol","iv_error","underlying_timestamp","underlying_price"];

function leer(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  // el campo que no existe se lee como 0 — aquí se LANZA en vez de medir cero
  for (const c of CAB) if (cab.indexOf(c) < 0) throw new Error(`falta la columna "${c}" en ${f}`);
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iM = cab.indexOf("midpoint"), iV = cab.indexOf("implied_vol"),
        iU = cab.indexOf("underlying_price");
  const camino = new Map(), enHora = [];
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(","); if (c.length <= iU) continue;
    const h = c[iT].slice(11, 16), sp = +c[iU];
    if (sp > 0 && !camino.has(h)) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = +c[iK], bid = +c[iB], ask = +c[iA];
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, mid: +c[iM], iv: +c[iV], spot: sp });
  }
  return { camino, enHora };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`${fechas.length} días de cadena en disco (${fechas[0]} → ${fechas[fechas.length - 1]})`);

const out = {}, excluidos = [];
let k = 0;
for (const fecha of fechas) {
  if (++k % 100 === 0) console.log(`  ${k}/${fechas.length} …`);
  const C = leer(fecha, "C"), P = leer(fecha, "P");
  if (!C || !P) { excluidos.push([fecha, "falta fichero C o P"]); continue; }
  if (!C.enHora.length) { excluidos.push([fecha, "ninguna CALL cotizada a las 11:00"]); continue; }
  if (!P.enHora.length) { excluidos.push([fecha, "ninguna PUT cotizada a las 11:00"]); continue; }
  // el camino: unir C y P (por si a alguna hora sólo hay uno de los dos)
  const cam = new Map(C.camino);
  for (const [h, s] of P.camino) if (!cam.has(h)) cam.set(h, s);
  const horas = [...cam.keys()].sort();
  if (horas.length < 60) { excluidos.push([fecha, `sólo ${horas.length} marcas de 5 min — sesión corta`]); continue; }
  const s = horas.map((h) => cam.get(h));
  const spot = C.enHora[0].spot;
  if (!(spot > 0)) { excluidos.push([fecha, "spot 0 a las 11:00"]); continue; }

  // las cuatro patas: vender ±25, comprar 50 más allá
  const cC = cerca(C.enHora, spot + 25), pC = cerca(P.enHora, spot - 25);
  const cL = cerca(C.enHora, cC.K + 50), pL = cerca(P.enHora, pC.K - 50);
  if (cL.K <= cC.K || pL.K >= pC.K) { excluidos.push([fecha, "no hay alas"]); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { excluidos.push([fecha, `crédito ≤ 0 (${cred.toFixed(2)})`]); continue; }

  // el straddle del dinero y la IV del dinero, a las 11:00
  const cA = cerca(C.enHora, spot), pA = cerca(P.enHora, spot);
  const strad = (cA.mid > 0 ? cA.mid : (cA.bid + cA.ask) / 2) + (pA.mid > 0 ? pA.mid : (pA.bid + pA.ask) / 2);
  const ivAtm = (cA.iv > 0 && pA.iv > 0) ? (cA.iv + pA.iv) / 2 : (cA.iv > 0 ? cA.iv : pA.iv);

  out[fecha] = {
    h: horas, s,
    cCK: cC.K, cCb: cC.bid, cLK: cL.K, cLa: cL.ask,
    pCK: pC.K, pCb: pC.bid, pLK: pL.K, pLa: pL.ask,
    cred, strad, ivAtm,
  };
}
writeFileSync("scripts/cache-dias/mov-dias.json", JSON.stringify(out));
console.log(`\nGUARDADOS ${Object.keys(out).length} días · EXCLUIDOS ${excluidos.length}`);
for (const [f, m] of excluidos) console.log(`  ✗ ${f} — ${m}`);
