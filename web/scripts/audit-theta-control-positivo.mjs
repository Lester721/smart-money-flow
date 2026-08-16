// CONTROL POSITIVO — ¿devuelve ThetaData datos con ESTE MISMO formato de petición para contratos
// que SÍ están en la caché con puja > 0? Si tampoco, la validación de ausentes no vale nada.
// 4 peticiones secuenciales. Solo lectura. Uso: node scripts/audit-theta-control-positivo.mjs

import { readFileSync } from "node:fs";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503";
const CDIR = "scripts/cache-theta/cadenas";

// Mismos (símbolo, día de venta, expiración) que los ausentes, pero con un strike que SÍ está.
const OBJ = [
  ["SPY",  "20241023", "20241025"],
  ["QQQ",  "20250326", "20250328"],
  ["NVDA", "20251208", "20251212"],
  ["AMD",  "20240812", "20240816"],
];

for (const [sym, dia, exp] of OBJ) {
  const cad = JSON.parse(readFileSync(`${CDIR}/${sym}_d${dia}.json`, "utf8"));
  const grupo = cad[exp];
  if (!grupo) { console.log(`${sym} ${dia}: la caché NO tiene la expiración ${exp}`); continue; }
  // el contrato con la puja más alta: imposible que sea un hueco
  let mejor = null;
  for (const [clave, ba] of Object.entries(grupo)) if (!mejor || ba[0] > mejor.ba[0]) mejor = { clave, ba };
  const [kStr, right] = [mejor.clave.slice(0, -2), mejor.clave.slice(-1)];
  const url = `${B}/v3/option/history/eod?symbol=${sym}&expiration=${exp}&strike=${Math.round(Number(kStr) * 1000)}&right=${right}` +
              `&start_date=${dia}&end_date=${dia}`;
  console.log(`\n${sym} ${dia} exp ${exp} K ${kStr}${right} — la CACHÉ dice [bid,ask] = ${JSON.stringify(mejor.ba)}`);
  console.log(`   GET ${url}`);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const txt = (await r.text()).trim();
    console.log(`   HTTP ${r.status} · respuesta:`);
    for (const l of txt.split("\n").slice(0, 3)) console.log(`      ${l}`);
  } catch (e) { console.log(`   ERROR ${e.message}`); }
  await new Promise((r) => setTimeout(r, 400));
}
