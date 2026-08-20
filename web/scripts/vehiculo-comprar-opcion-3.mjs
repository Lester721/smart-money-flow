// vehiculo-comprar-opcion-3.mjs — LA n EFECTIVA, Y LA t QUE SE PUEDE DEFENDER
//
// El pase 2 dio "el cono pierde -26,8% con t=-9,72" sobre 8.631 pares. Esa t NO vale: los 8.631
// pares no son 8.631 pruebas independientes. Se solapan por DOS lados:
//
//   · entre TICKERS   — 27 activos, casi todos del mismo mercado, comprados el mismo día.
//   · entre DÍAS      — una posición a 30 días comprada el lunes comparte 29 de sus 30 días con
//                       la comprada el martes. Son casi la misma apuesta.
//
// Aquí se colapsa a una observación por FECHA DE ENTRADA (mata el solapamiento entre tickers) y
// luego se toman sólo fechas separadas por al menos el plazo (mata el solapamiento entre días).
// Lo que queda es la n EFECTIVA, y la t que sale de ella es la única reportable.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dias = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));

const tickersCadena = [...new Set(readdirSync(CDIR).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const diasCadena = {};
for (const t of tickersCadena) {
  const ds = readdirSync(CDIR).filter((f) => f.startsWith(`${t}_d2026`)).map((f) => f.slice(-13, -5)).sort().filter((d) => d >= "20260422");
  if (ds.length) diasCadena[t] = ds;
}
const cierres = {};
for (const t of Object.keys(diasCadena)) if (existsSync(`${CIERRES}/${t}.json`)) cierres[t] = JSON.parse(readFileSync(`${CIERRES}/${t}.json`, "utf8"));
const tickers = Object.keys(diasCadena).filter((t) => cierres[t]);

const DIST = [0.05, 0.10, 0.20], DTE = [7, 30, 90], TOL_DTE = { 7: 4, 30: 10, 90: 25 }, ULTIMO = "20260806";

function elegir(cad, S, dteObj, dist, tipo, hoy) {
  let mejorExp = null, mejorDD = Infinity;
  for (const exp of Object.keys(cad)) {
    const d = dias(hoy, exp); if (d < 1) continue;
    const dd = Math.abs(d - dteObj); if (dd < mejorDD) { mejorDD = dd; mejorExp = exp; }
  }
  if (!mejorExp || mejorDD > TOL_DTE[dteObj]) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mejorK = null, mejorKD = Infinity;
  for (const clave of Object.keys(cad[mejorExp])) {
    const [ks, r] = clave.split("|"); if (r !== tipo) continue;
    const K = Number(ks), kd = Math.abs(K - objetivo);
    if (kd < mejorKD) { mejorKD = kd; mejorK = K; }
  }
  if (mejorK == null) return null;
  const distReal = tipo === "C" ? mejorK / S - 1 : 1 - mejorK / S;
  if (Math.abs(distReal - dist) > dist * 0.30) return null;
  const [bid, ask] = cad[mejorExp][`${mejorK}|${tipo}`];
  return { expiracion: mejorExp, K: mejorK, bid, ask };
}

const pares = [];
for (const t of tickers) for (const dY of diasCadena[t]) {
  if (dY > ULTIMO) continue;
  const S = cierres[t][dY]; if (!(S > 0)) continue;
  const p = `${CDIR}/${t}_d${dY}.json`; if (!existsSync(p)) continue;
  let cad; try { cad = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  if (!cad || !Object.keys(cad).length) continue;
  for (const dte of DTE) for (const dist of DIST) {
    const c = elegir(cad, S, dte, dist, "C", dY), q = elegir(cad, S, dte, dist, "P", dY);
    if (!c || !q || c.expiracion !== q.expiracion) continue;
    if (!(c.ask > 0 && q.ask > 0 && c.bid > 0 && q.bid > 0)) continue;
    const ST = cierres[t][c.expiracion]; if (!(ST > 0)) continue;
    const pagoC = Math.max(0, ST - c.K), pagoP = Math.max(0, q.K - ST);
    pares.push({ ticker: t, fechaY: dY, fecha: iso(dY), dist, dte,
      retCono: (pagoC + pagoP) / (c.ask + q.ask) - 1 });
  }
}

console.log("═".repeat(97));
console.log("LA n EFECTIVA — de 8.631 filas a las pruebas que de verdad son independientes");
console.log("═".repeat(97));
console.log("  paso 1: colapsar a UNA observación por fecha de entrada (mata el solapamiento entre los");
console.log("          27 tickers, que son casi todos el mismo mercado).");
console.log("  paso 2: quedarse sólo con fechas separadas ≥ el plazo (mata el solapamiento entre días).\n");
console.log("  dist  dte    filas   fechas   n EFECTIVA   retorno del cono        t crudo    t HONESTA");
console.log("  " + "─".repeat(93));

const salida = [];
for (const dist of DIST) for (const dte of DTE) {
  const g = pares.filter((f) => f.dist === dist && f.dte === dte);
  if (g.length < 20) continue;
  // paso 1: media por fecha
  const porFecha = new Map();
  for (const f of g) { if (!porFecha.has(f.fechaY)) porFecha.set(f.fechaY, []); porFecha.get(f.fechaY).push(f.retCono); }
  const fechas = [...porFecha.keys()].sort();
  const serie = fechas.map((d) => ({ d, r: media(porFecha.get(d)) }));
  // paso 2: fechas separadas ≥ dte días naturales
  const noSolap = [];
  let ultima = null;
  for (const x of serie) { if (ultima === null || dias(ultima, x.d) >= dte) { noSolap.push(x.r); ultima = x.d; } }
  const tCrudo = tDe(g.map((f) => f.retCono));
  const tHonesta = noSolap.length >= 3 ? tDe(noSolap) : NaN;
  salida.push({ dist, dte, filas: g.length, fechas: fechas.length, nEf: noSolap.length,
    ret: media(g.map((f) => f.retCono)), retNoSolap: media(noSolap), tCrudo, tHonesta });
  console.log(`  ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)} ${String(g.length).padStart(8)}   ${String(fechas.length).padStart(6)}   ${String(noSolap.length).padStart(10)}   ` +
    `${(media(noSolap) * 100).toFixed(1).padStart(16)}%   ${tCrudo.toFixed(2).padStart(10)}   ${(Number.isFinite(tHonesta) ? tHonesta.toFixed(2) : "n/a").padStart(10)}`);
}

// Agregado: todos los plazos juntos, una observación por fecha, sin solapar al plazo más largo
const todasFechas = [...new Set(pares.map((f) => f.fechaY))].sort();
const serieTodo = todasFechas.map((d) => media(pares.filter((f) => f.fechaY === d).map((x) => x.retCono)));
console.log(`\n  AGREGADO (una obs. por fecha, los 9 cubos juntos): n=${serieTodo.length} fechas · ` +
  `retorno ${(media(serieTodo) * 100).toFixed(1)}% · t=${tDe(serieTodo).toFixed(2)}`);
const negativas = serieTodo.filter((x) => x < 0).length;
console.log(`  fechas de entrada con resultado NEGATIVO: ${negativas} de ${serieTodo.length} (${(100 * negativas / serieTodo.length).toFixed(0)}%)`);

console.log("\n" + "═".repeat(97));
console.log("LO QUE ESTO SIGNIFICA PARA LA PREGUNTA DE LESTER");
console.log("═".repeat(97));
const mejorT = salida.filter((s) => Number.isFinite(s.tHonesta)).sort((a, b) => a.tHonesta - b.tHonesta)[0];
console.log(`  La pérdida del cono sobrevive al descuento: el cubo más claro es ${(mejorT.dist * 100).toFixed(0)}% a ${mejorT.dte}d con`);
console.log(`  n efectiva ${mejorT.nEf} y t honesta ${mejorT.tHonesta.toFixed(2)} (la cruda era ${mejorT.tCrudo.toFixed(2)} — el solapamiento inflaba ×${(mejorT.tCrudo / mejorT.tHonesta).toFixed(1)}).`);
console.log(`\n  Pero el sentido de la n efectiva es el CONTRARIO para una señal: si con toda la muestra`);
console.log(`  sólo hay ${salida.reduce((a, s) => a + s.nEf, 0)} apuestas no solapadas repartidas en 9 cubos, ninguna señal de MS puede`);
console.log(`  demostrarse aquí. Lo único que 86 días establecen es el COSTE del vehículo, no la señal.`);

writeFileSync("scripts/vehiculo-comprar-opcion-3.json", JSON.stringify({
  cubos: salida, nEfTotal: salida.reduce((a, s) => a + s.nEf, 0),
  agregado: { fechas: serieTodo.length, ret: media(serieTodo), t: tDe(serieTodo), pctNegativas: negativas / serieTodo.length },
}, null, 1));
console.log("\n  → scripts/vehiculo-comprar-opcion-3.json");
