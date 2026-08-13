// CRUZAR NUESTRO GEX CONTRA EL DE MARKETSNACK.
//
// Por qué esto importa más que cualquier panel bonito: TODA la estrategia del cóndor descansa en
// un solo signo —que el GEX del día sea positivo—. Si nuestro cálculo está mal, el forward-test
// no mide una estrategia, mide ruido. Nunca lo habíamos contrastado contra nadie.
//
// Calcula el GEX a UNA HORA CONCRETA, para poder comparar contra una captura de su pantalla a esa
// misma hora. Comparar las 11:00 nuestras contra las 11:39 suyas no prueba nada: el GEX se mueve.
//
// Saca además los números que ellos enseñan al lado, que son cuatro cruces independientes:
// open interest total, volumen, el nocional, y la gamma por strike.
//
// Uso: node scripts/gex-2026/cruzar-gex-marketsnack.mjs 11:35

import fs from "node:fs";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const SYM = "SPXW";
const HORA = process.argv[2] || "11:35";
const DIA = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

// Gamma de Black-Scholes usada SOLO como transformación descriptiva: la IV entra como dato REAL
// del proveedor, no se inventa ningún precio con el modelo. Es la misma función que usa
// forward-gex-condor.mjs — si se cambia una, hay que cambiar la otra.
const phi = (x) => 0.3989423 * Math.exp((-x * x) / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + ((v * v) / 2) * T) / (v * Math.sqrt(T));
const gamma = (S, K, T, v) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));

async function csv(ruta) {
  const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(180_000) });
  const txt = await r.text();
  if (!r.ok || txt.length < 200) return null;
  const lin = txt.trim().split("\n");
  return { cab: lin[0].split(","), filas: lin.slice(1).map((l) => l.split(",")) };
}

const oiRaw = await csv(`option/history/open_interest?symbol=${SYM}&expiration=${DIA}&start_date=${DIA}&end_date=${DIA}`);
if (!oiRaw) { console.log("✗ sin open interest"); process.exit(1); }
const iK = oiRaw.cab.indexOf("strike"), iR = oiRaw.cab.indexOf("right"), iO = oiRaw.cab.indexOf("open_interest");
const oi = { C: new Map(), P: new Map() };
let oiTotal = 0;
for (const c of oiRaw.filas) {
  const v = +c[iO]; if (!(v > 0)) continue;
  oi[c[iR].replace(/"/g, "") === "CALL" ? "C" : "P"].set(+c[iK], v);
  oiTotal += v;
}

const cad = { C: new Map(), P: new Map() };
let U = 0;
for (const lado of ["P", "C"]) {
  const d = await csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${DIA}&start_date=${DIA}&end_date=${DIA}&right=${lado}&interval=5m`);
  if (!d) { console.log(`✗ sin cadena de ${lado}`); process.exit(1); }
  const jK = d.cab.indexOf("strike"), jT = d.cab.indexOf("timestamp"), jB = d.cab.indexOf("bid"),
        jA = d.cab.indexOf("ask"), jM = d.cab.indexOf("midpoint"), jV = d.cab.indexOf("implied_vol"),
        jU = d.cab.indexOf("underlying_price");
  for (const c of d.filas) {
    if (c[jT].slice(11, 16) !== HORA) continue;
    const u = +c[jU]; if (u > 0) U = u;
    const bid = +c[jB], ask = +c[jA], mid = +c[jM], iv = +c[jV];
    if (!(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
    cad[lado].set(+c[jK], { bid, ask, mid, iv });
  }
}
if (!(U > 0)) { console.log(`✗ no hay datos a las ${HORA} (¿aún no ha pasado esa hora?)`); process.exit(1); }

// Tiempo hasta el cierre, en años. Igual que en el forward-test.
const T = Math.max((16 * 60 - (+HORA.slice(0, 2) * 60 + +HORA.slice(3))) / 60 / 24 / 365, 1 / 24 / 365);

let gC = 0, gP = 0, notional = 0;
const porStrike = new Map();
for (const [lado, mapa] of [["C", cad.C], ["P", cad.P]])
  for (const [K, q] of mapa) {
    const o = oi[lado].get(K); if (!o) continue;
    const g = gamma(U, K, T, q.iv); if (!isFinite(g) || g <= 0) continue;
    const $ = g * o * 100 * U * U * 0.01; if (!isFinite($)) continue;   // por movimiento del 1%
    if (lado === "C") gC += $; else gP += $;
    porStrike.set(K, (porStrike.get(K) ?? 0) + $);
    notional += o * 100 * K;
  }

const M = (x) => `$${(x / 1e6).toFixed(1)}M`;
const B$ = (x) => `$${(x / 1e9).toFixed(2)}B`;

console.log(`\n═══ NUESTRO GEX · ${DIA} a las ${HORA} ET ═══\n`);
console.log(`   SPX (subyacente del propio dato)  ${U.toFixed(2)}`);
console.log(`   GEX neto                          ${gC - gP >= 0 ? "+" : "−"}${B$(Math.abs(gC - gP))}   (calls ${B$(gC)} · puts ${B$(gP)})`);
console.log(`   Nocional                          ${B$(notional)}`);
console.log(`   Open interest total               ${(oiTotal / 1000).toFixed(0)}K`);
console.log(`   Strikes con datos                 ${porStrike.size}`);

console.log(`\n   Gamma por strike, los 10 mayores cerca del dinero:`);
const cerca = [...porStrike.entries()].filter(([K]) => Math.abs(K - U) <= 40).sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [K, v] of cerca) console.log(`     ${K}   ${M(v).padStart(9)}`);

console.log(`\n   ── Pega aquí lo que enseña MarketSnack a esa misma hora y compara ──`);
console.log(`      Net GEX · Notional · OI · Volume · y la gamma de 2 o 3 strikes.`);
console.log(`      Lo que DEBE coincidir es el SIGNO y el orden de magnitud. Una diferencia`);
console.log(`      del 10-20% es normal (fuente de IV distinta, redondeos, hora exacta).`);
console.log(`      Un signo distinto NO es normal: eso invalidaría el forward-test entero.\n`);

fs.mkdirSync("data/validacion", { recursive: true });
fs.writeFileSync(`data/validacion/gex-${DIA}-${HORA.replace(":", "")}.json`, JSON.stringify({
  dia: DIA, hora: HORA, spx: U, gexNeto: gC - gP, gexCalls: gC, gexPuts: gP,
  notional, oiTotal, porStrike: Object.fromEntries(cerca),
}, null, 1));
