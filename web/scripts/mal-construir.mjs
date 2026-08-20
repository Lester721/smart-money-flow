// CONSTRUCTOR · los 1.123 días del cóndor, leídos de las cadenas 0DTE (2022-01 → 2026-08).
//
// regimen-filas.json sólo tiene 653 días (2024-2026) y por eso no ve el mercado bajista.
// Esto reconstruye TODO desde los CSV de cadena, con la misma mecánica que desde-2024.mjs:
// entrada 11:00 ET, corto a ±25 del spot, alas 50 puntos más allá, BID al vender y ASK al
// comprar las cuatro patas, comisión $0,03 por pata, liquidación contra el cierre real.
//
// Guarda además el CAMINO de 5 minutos del subyacente de toda la sesión: sin él no se puede
// saber CUÁNDO dolió el día, sólo que dolió.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, SEP = 25, COMM = 0.03;
const SALIDA = "scripts/mal-dias.json";

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const nl = txt.indexOf("\n");
  const cab = txt.slice(0, nl).split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);   // campo ausente = se leería 0
  const [iK, iT, iB, iA, iV, iU] = idx;

  const enHora = [];
  const camino = Object.create(null);
  let pos = nl + 1;
  const n = txt.length;
  while (pos < n) {
    let fin = txt.indexOf("\n", pos);
    if (fin < 0) fin = n;
    const lin = txt.slice(pos, fin);
    pos = fin + 1;
    if (lin.length < 20) continue;
    // los DOS últimos campos son underlying_timestamp y underlying_price: se sacan sin partir la línea
    const c1 = lin.lastIndexOf(",");
    const c2 = lin.lastIndexOf(",", c1 - 1);
    const h = lin.slice(c2 + 12, c2 + 17);            // "AAAA-MM-DDTHH:MM" → HH:MM
    const sp = +lin.slice(c1 + 1);
    if (sp > 0 && camino[h] === undefined) camino[h] = sp;
    if (h !== HORA) continue;
    const c = lin.split(",");
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV];
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`## leyendo ${fechas.length} días de ${DIR}`);
const t0 = Date.now();

const dias = [], descartes = [];
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 50 === 0) console.log(`   ${i}/${fechas.length} · ${fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { descartes.push([fecha, "sin fichero o sin filas a las 11:00"]); continue; }
  const horas = Object.keys(C.camino).sort();
  const ap = C.camino[horas[0]], sp11 = C.camino[HORA], cierre = C.camino[horas[horas.length - 1]];
  if (!(ap > 0) || !(sp11 > 0) || !(cierre > 0)) { descartes.push([fecha, "camino incompleto"]); continue; }

  const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { descartes.push([fecha, "no hay alas"]); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { descartes.push([fecha, "crédito no positivo"]); continue; }

  const perdCall = Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K);
  const perdPut = Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K);
  const pl = (cred - perdCall - perdPut) * 100 - 8 * COMM;

  const atmC = cerca(C.filas, sp11), atmP = cerca(P.filas, sp11);
  const ivs = [atmC.iv, atmP.iv].filter((x) => x > 0);
  const iv = ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
  const sigma = iv ? sp11 * iv * Math.sqrt(5 / (252 * 6.5)) : null;   // σ del resto de sesión (5h)

  const manana = horas.filter((h) => h <= HORA).map((h) => C.camino[h]).filter((x) => x > 0);
  const hs = horas.filter((h) => C.camino[h] > 0);

  dias.push({
    fecha, ap, sp11, cierre, sigma, iv,
    maxM: Math.max(...manana), minM: Math.min(...manana),
    credito: cred * 100, pl,
    kcC: cC.K, kpC: pC.K, kcL: cL.K, kpL: pL.K,
    bidC: cC.bid, bidP: pC.bid, askCL: cL.ask, askPL: pL.ask,
    ivcC: cC.iv, ivpC: pC.iv,
    perdCall: perdCall * 100, perdPut: perdPut * 100,
    dow: new Date(fecha + "T00:00:00Z").getUTCDay(), dia: +fecha.slice(8, 10),
    h: hs, s: hs.map((x) => C.camino[x]),
  });
}
console.log(`## ${dias.length} días construidos · ${descartes.length} descartados · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const d of descartes) console.log(`   DESCARTE ${d[0]}: ${d[1]}`);
const porAno = {};
for (const d of dias) porAno[d.fecha.slice(0, 4)] = (porAno[d.fecha.slice(0, 4)] || 0) + 1;
console.log("## por año:", JSON.stringify(porAno));
writeFileSync(SALIDA, JSON.stringify(dias), "utf8");
console.log(`## guardado en ${SALIDA}`);
