// vehiculo-comprar-opcion-5.mjs — EL PUENTE: la esquina más barata del vehículo
//
// Los cuatro pases anteriores cierran la puerta grande: las 36 combinaciones de
// (distancia × plazo × momento de salida) pierden dinero neutralizando la dirección. Pero NO todas
// pierden lo mismo, y la diferencia no es ruido: es el peaje, que es un % de la PRIMA.
//
//   · lo caro : 20% fuera, 7 días  → peaje 58-63% de la prima → el cono pierde -57%
//   · lo barato: 5% fuera, 90 días → peaje  5,3% de la prima  → el cono pierde  -2,9%
//
// Este pase se planta en la esquina barata y responde la única pregunta que le queda a Lester:
// SI una señal de MarketSnack acertara el lado, ¿cuánto tendría que acertar para ganar dinero
// AHÍ, y cuánto dinero sería? Es la especificación de lo que habría que buscar, no una medida
// de ninguna señal.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CUENTA = 56389;
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
const cache = new Map();
function cadena(t, dY) {
  const k = `${t}|${dY}`; if (cache.has(k)) return cache.get(k);
  const p = `${CDIR}/${t}_d${dY}.json`; let v = null;
  if (existsSync(p)) { try { v = JSON.parse(readFileSync(p, "utf8")); } catch { v = null; } }
  cache.set(k, v); return v;
}
const ULTIMO = "20260806";
// las tres esquinas más baratas que salieron del pase 4, y una cara de referencia
const ESQUINAS = [
  { dist: 0.05, dte: 90, fr: 0.25, tol: 25 },
  { dist: 0.10, dte: 90, fr: 0.25, tol: 25 },
  { dist: 0.05, dte: 30, fr: 0.25, tol: 10 },
  { dist: 0.10, dte: 7,  fr: 0.25, tol: 4  },   // referencia cara
];

function elegir(cad, S, dteObj, dist, tipo, hoy, tol) {
  let mejorExp = null, mejorDD = Infinity;
  for (const exp of Object.keys(cad)) {
    const d = dias(hoy, exp); if (d < 1) continue;
    const dd = Math.abs(d - dteObj); if (dd < mejorDD) { mejorDD = dd; mejorExp = exp; }
  }
  if (!mejorExp || mejorDD > tol) return null;
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

console.log("═".repeat(97));
console.log("EL PUENTE — qué haría falta en la esquina barata del vehículo");
console.log("═".repeat(97));
console.log("  compra al ASK · venta al BID REAL del día de salida (0 si ya no tiene comprador)\n");

const resumen = [];
for (const E of ESQUINAS) {
  const ops = [];
  for (const t of tickers) {
    const misDias = diasCadena[t].filter((d) => d <= ULTIMO);
    const setDias = new Set(misDias);
    for (const dY of misDias) {
      const S = cierres[t][dY]; if (!(S > 0)) continue;
      const cad = cadena(t, dY); if (!cad || !Object.keys(cad).length) continue;
      const c = elegir(cad, S, E.dte, E.dist, "C", dY, E.tol), q = elegir(cad, S, E.dte, E.dist, "P", dY, E.tol);
      if (!c || !q || c.expiracion !== q.expiracion) continue;
      if (!(c.ask > 0 && q.ask > 0 && c.bid > 0 && q.bid > 0)) continue;
      const dteReal = dias(dY, c.expiracion);
      const objetivo = Math.round(dteReal * E.fr);
      const salidaY = misDias.find((d) => d > dY && dias(dY, d) >= objetivo);
      if (!salidaY || salidaY > c.expiracion || !setDias.has(salidaY)) continue;
      const cs = cadena(t, salidaY); if (!cs) continue;
      const vC = cs?.[c.expiracion]?.[`${c.K}|C`]?.[0] ?? 0;
      const vP = cs?.[c.expiracion]?.[`${q.K}|P`]?.[0] ?? 0;
      ops.push({
        ticker: t, fechaY: dY, retC: vC / c.ask - 1, retP: vP / q.ask - 1,
        primaC: c.ask * 100, primaP: q.ask * 100, diasPos: dias(dY, salidaY),
        peaje: ((c.ask - c.bid) / c.ask + (q.ask - q.bid) / q.ask) / 2,
      });
    }
  }
  if (ops.length < 50) { console.log(`  ${(E.dist * 100).toFixed(0)}% / ${E.dte}d: sólo ${ops.length} operaciones, se salta`); continue; }

  const gana = [], falla = [];
  for (const o of ops) { const [a, b] = o.retC >= o.retP ? [o.retC, o.retP] : [o.retP, o.retC]; gana.push(a); falla.push(b); }
  const mg = media(gana), mf = media(falla);
  const pEmpate = -mf / (mg - mf);
  const prima = media(ops.map((o) => (o.primaC + o.primaP) / 2));
  const diasPos = Math.round(media(ops.map((o) => o.diasPos)));
  const ciclos = 365 / diasPos;
  const peaje = media(ops.map((o) => o.peaje));
  // n efectiva
  const fechas = [...new Set(ops.map((o) => o.fechaY))].sort();
  const noSolap = []; let ultima = null;
  for (const d of fechas) if (ultima === null || dias(ultima, d) >= diasPos) { noSolap.push(d); ultima = d; }

  console.log(`  ┌─ ${(E.dist * 100).toFixed(0)}% fuera · ${E.dte} días · salir al ${(E.fr * 100).toFixed(0)}% del plazo (${diasPos} días en posición)`);
  console.log(`  │  n=${ops.length} operaciones · ${fechas.length} fechas · n EFECTIVA ${noSolap.length} · peaje ${(peaje * 100).toFixed(1)}% de la prima`);
  console.log(`  │  prima media $${prima.toFixed(0)} por contrato · ${ciclos.toFixed(1)} ciclos/año`);
  console.log(`  │  si aciertas el lado: ${(mg * 100).toFixed(1)}%  ·  si fallas: ${(mf * 100).toFixed(1)}%`);
  console.log(`  │  ACIERTO NECESARIO PARA EMPATAR: ${(pEmpate * 100).toFixed(1)}%   (una moneda da 50%)`);
  console.log(`  │`);
  console.log(`  │  acierto →      50%        55%        60%        65%`);
  const linea = [];
  for (const p of [0.50, 0.55, 0.60, 0.65]) {
    const retOp = p * mg + (1 - p) * mf;
    linea.push({ p, retOp, dolarAno: prima * retOp * ciclos });
  }
  console.log(`  │  $/año (1 contrato): ` + linea.map((x) => ("$" + x.dolarAno.toFixed(0)).padStart(10)).join(" "));
  const nC = Math.max(1, Math.floor(CUENTA * 0.10 / prima));
  console.log(`  │  con el 10% de la cuenta ($${(CUENTA * 0.1).toFixed(0)} = ${nC} contratos):`);
  console.log(`  └  ` + linea.map((x) => ("$" + (x.dolarAno * nC).toFixed(0)).padStart(10)).join(" ") + `   ← SPY da $${(CUENTA * 0.1 * 0.14).toFixed(0)}`);
  console.log("");
  resumen.push({ ...E, n: ops.length, nEf: noSolap.length, peaje, mg, mf, pEmpate, prima, diasPos, ciclos,
    dolares: linea, nContratos: nC });
}

console.log("═".repeat(97));
console.log("LA ESPECIFICACIÓN DE LO QUE HABRÍA QUE BUSCAR");
console.log("═".repeat(97));
const mejor = resumen.filter((r) => Number.isFinite(r.pEmpate)).sort((a, b) => a.pEmpate - b.pEmpate)[0];
console.log(`  La esquina menos hostil es ${(mejor.dist * 100).toFixed(0)}% fuera del dinero a ${mejor.dte} días, saliendo a los ${mejor.diasPos} días.`);
console.log(`  Ahí el peaje baja al ${(mejor.peaje * 100).toFixed(1)}% de la prima y el acierto para empatar es ${(mejor.pEmpate * 100).toFixed(1)}%.`);
console.log(`  Es decir: hay que ganarle ${((mejor.pEmpate - 0.5) * 100).toFixed(1)} puntos a una moneda, de forma sostenida.`);
console.log(`\n  Referencia de lo medido en este proyecto: EVA acierta el DÍA pero no el LADO (~51%,`);
console.log(`  n=19.465, concluyente). Las 11 métricas de MS fallaron contra el retorno de la acción.`);
console.log(`  Ninguna ha demostrado nunca ${(mejor.pEmpate * 100).toFixed(0)}% en la dirección.`);
console.log(`\n  Y aunque la tuviera: con ${mejor.nEf} apuestas no solapadas en 86 días, DEMOSTRARLO aquí es`);
console.log(`  imposible. La muestra no da. Eso no es pesimismo, es el tamaño de la ventana de MS.`);

writeFileSync("scripts/vehiculo-comprar-opcion-5.json", JSON.stringify({ esquinas: resumen }, null, 1));
console.log("\n  → scripts/vehiculo-comprar-opcion-5.json");
