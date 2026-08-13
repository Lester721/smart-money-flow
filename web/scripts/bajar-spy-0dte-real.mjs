// BAJAR LA CADENA REAL DE SPY 0DTE — para rehacer el backtest sin Black-Scholes.
//
// Por qué: `scripts/odte-2-backtest.ts` concluyó que el bear call spread a 1σ sobre SPY 0DTE da
// "+4-5% por operación, ~$3.400/año". Ese número salió valorando con bsPrice alimentado con
// volatilidad realizada — o sea, asumiendo que la prima extra es cero. Es de los pocos
// contaminados que concluyeron "SÍ FUNCIONA", así que hay que rehacerlo con precios reales.
//
// Lo que baja: la cadena entera (bid, ask, IV, subyacente) cada 5 minutos, para cada sesión en
// que SPY tuvo vencimiento el mismo día. Un pedido por día y lado.
//
// El endpoint de griegas trae bid/ask REALES además de la IV, así que sirve para las dos cosas:
// situar el strike (con la IV del mercado, no inventada) y valorar (con bid/ask, no con modelo).
//
// Uso: node scripts/bajar-spy-0dte-real.mjs [desde] [hasta]

import fs from "node:fs";
import path from "node:path";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const SYM = "SPY";
const DIR = "scripts/cache-theta/spy-0dte";
const DESDE = process.argv[2] || "2022-01-01";
const HASTA = process.argv[3] || "2026-08-12";
const CONCURRENCIA = 4;

fs.mkdirSync(DIR, { recursive: true });

// Con reintento: la conexión del Terminal con su servidor es intermitente, y un fallo suelto
// NO es "no hay dato". Ya nos tumbó esta misma descarga una vez y el recolector de flujo otra.
async function texto(ruta, ms = 90000, intentos = 4) {
  for (let i = 1; i <= intentos; i++) {
    try {
      const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(ms) });
      if (r.ok) return await r.text();
    } catch { /* se reintenta */ }
    if (i < intentos) await new Promise((s) => setTimeout(s, 2000 * i));
  }
  return null;
}

// Días en que SPY tuvo vencimiento el mismo día. No se supone cuáles: se pregunta.
console.log(`═══ BAJAR SPY 0DTE REAL ═══\n   ${DESDE} → ${HASTA}\n`);
const listado = await texto(`option/list/expirations?symbol=${SYM}`);
if (!listado) { console.log("✗ no se pudo listar vencimientos"); process.exit(1); }
const exps = [...new Set(listado.trim().split("\n").slice(1)
  .map((l) => l.split(",").pop().replace(/"/g, "").trim())
  .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= DESDE && x <= HASTA))].sort();
console.log(`   vencimientos de SPY en la ventana: ${exps.length}`);

// 0DTE = el día del vencimiento es día de mercado. Se comprueba pidiendo la cadena de ESE día
// para ESE vencimiento: si hay filas, hubo 0DTE.
const pendientes = exps.filter((d) => !fs.existsSync(path.join(DIR, `${d}.json`)));
console.log(`   ya en caché: ${exps.length - pendientes.length}  ·  por bajar: ${pendientes.length}`);
console.log(`   estimado: ~${Math.round(pendientes.length * 2 * 1.5 / CONCURRENCIA / 60)} min\n`);

const cuenta = { ok: 0, vacio: 0, fallo: 0 };
let idx = 0;
const t0 = Date.now();

async function unDia(dia) {
  const filas = [];
  for (const lado of ["C", "P"]) {
    const t = await texto(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}&right=${lado}&interval=5m`);
    if (!t || !t.includes("bid")) continue;
    const lin = t.trim().split("\n");
    const cab = lin[0].split(",");
    const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
          iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
    for (const l of lin.slice(1)) {
      const c = l.split(",");
      const hhmm = (c[iT] ?? "").slice(11, 16);
      const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV], U = +c[iU];
      if (!/^\d{2}:\d{2}$/.test(hhmm) || !(K > 0) || !(ask > 0) || ask < bid || !(U > 0)) continue;
      // Se guarda TODO en crudo: bid, ask, IV y subyacente. Nada derivado, nada modelado.
      filas.push([hhmm, lado, K, bid, ask, Math.round(iv * 10000) / 10000, Math.round(U * 100) / 100]);
    }
  }
  if (!filas.length) return "vacio";
  fs.writeFileSync(path.join(DIR, `${dia}.json`), JSON.stringify(filas));
  return "ok";
}

async function trabajador() {
  while (idx < pendientes.length) {
    const d = pendientes[idx++];
    cuenta[await unDia(d)]++;
    const h = cuenta.ok + cuenta.vacio + cuenta.fallo;
    if (h % 25 === 0) {
      const min = (Date.now() - t0) / 60000;
      process.stdout.write(`\r   ${h}/${pendientes.length}  ·  con datos ${cuenta.ok}  ·  sin 0DTE ${cuenta.vacio}  ·  ${min.toFixed(1)} min  ·  faltan ~${(min / h * (pendientes.length - h)).toFixed(0)} min   `);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));

const bajados = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
const mb = bajados.reduce((s, f) => s + fs.statSync(path.join(DIR, f)).size, 0) / 1024 / 1024;
console.log(`\r   ${pendientes.length}/${pendientes.length}  ·  con datos ${cuenta.ok}  ·  sin 0DTE ${cuenta.vacio}  ·  fallos ${cuenta.fallo}          \n`);
console.log(`   sesiones con cadena 0DTE en disco: ${bajados.length}  ·  ${mb.toFixed(0)} MB`);
console.log(`   ${bajados.sort()[0]?.replace(".json", "")} → ${bajados.sort().pop()?.replace(".json", "")}`);
console.log(`\n   Guardado en ${DIR}. NO se vuelve a bajar.\n`);
