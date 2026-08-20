// ═══ CONVEXIDAD · PASO 2 — POR QUÉ FALTA EL STRIKE ══════════════════════════════════════
//
// El recon dice que AMD, CSCO e INTC dan CERO días con perfil, y QQQ sólo 36 de 74. Antes de
// medir hay que saber si eso es el MERCADO (no existe ese strike) o el DESCARGADOR
// (`bajar-cadenas-todos-los-dias.ts` tira todo contrato con `bid <= 0`). Son cosas distintas:
//   · si es el mercado → el perfil no se puede comprar ahí y el ticker sale del universo, bien.
//   · si es el descargador → estaríamos midiendo sólo las calls que YA valían algo. Sesgo.
//
// Se abre el fichero y se miran los strikes que hay, no los que esperábamos.

import fs from "node:fs";
import path from "node:path";

const CAD = path.join("scripts", "cache-theta", "cadenas");
const CIE = path.join("scripts", "cache-theta", "cierres");
const aDate = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));
const dias360 = (a, b) => Math.round((aDate(b) - aDate(a)) / 86400e3);

function rv60(c, dia) {
  const ds = Object.keys(c).sort().filter((d) => d < dia);
  if (ds.length < 61) return null;
  const u = ds.slice(-61), r = [];
  for (let i = 1; i < u.length; i++) r.push(Math.log(c[u[i]] / c[u[i - 1]]));
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1) * 252);
}

const DIA = "20260615";
for (const t of ["AMD", "CSCO", "INTC", "QQQ", "NVDA", "TSLA", "AAPL"]) {
  const c = JSON.parse(fs.readFileSync(path.join(CIE, `${t}.json`), "utf8"));
  const s = c[DIA], sig = rv60(c, DIA);
  const j = JSON.parse(fs.readFileSync(path.join(CAD, `${t}_d${DIA}.json`), "utf8"));
  const exps = Object.keys(j).sort();
  let mejor = null;
  for (const e of exps) { const d = dias360(DIA, e); if (d < 300 || d > 450) continue;
    if (!mejor || Math.abs(d - 365) < Math.abs(dias360(DIA, mejor) - 365)) mejor = e; }
  console.log(`\n── ${t} · ${DIA} · S=${s} · rv60=${(sig * 100).toFixed(0)}%`);
  console.log(`   vencimientos en el fichero: ${exps.length}  (${exps[0]} … ${exps[exps.length - 1]})`);
  const enRango = exps.filter((e) => { const d = dias360(DIA, e); return d >= 300 && d <= 450; });
  console.log(`   en [300,450] días: ${enRango.length} ${enRango.join(" ")}`);
  if (!mejor) { console.log(`   ✗ NO HAY vencimiento a ~1 año en este fichero`); continue; }
  const dte = dias360(DIA, mejor);
  const objetivo = s * Math.exp(1.5 * sig * Math.sqrt(dte / 365));
  const calls = Object.keys(j[mejor]).filter((k) => k.endsWith("|C")).map((k) => Number(k.slice(0, -2))).sort((a, b) => a - b);
  console.log(`   venc elegido ${mejor} (${dte}d) · objetivo 1,5σ = ${objetivo.toFixed(1)} (K/S ${(objetivo / s).toFixed(2)})`);
  console.log(`   calls cotizadas: ${calls.length} · rango ${calls[0]} … ${calls[calls.length - 1]} (K/S ${(calls[0] / s).toFixed(2)} … ${(calls[calls.length - 1] / s).toFixed(2)})`);
  const arriba = calls.filter((k) => k >= objetivo);
  console.log(`   strikes ≥ objetivo: ${arriba.length} ${arriba.slice(0, 6).join(" ")}`);
  if (arriba.length) {
    const K = arriba[0], [b, a] = j[mejor][`${K}|C`];
    console.log(`   → K=${K}  bid ${b}  ask ${a}  horquilla ${((a - b) / a * 100).toFixed(0)}% del ask`);
  } else {
    console.log(`   ✗ EL STRIKE MÁS ALTO COTIZADO (${calls[calls.length - 1]}) SE QUEDA CORTO`);
    console.log(`     ¿es el mercado o el descargador? el descargador tira bid<=0.`);
  }
}
