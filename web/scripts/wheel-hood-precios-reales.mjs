// LA WHEEL SOBRE HOOD, CON PRIMAS REALES — la falsación más barata del backtest contaminado.
//
// Lo que se pone a prueba: `backtest-wheel.ts` promete, en su celda mejor (agresivo Δ0,35 a 14
// días), **+0,78% por operación y $12.279/año sobre $60.000**. Esa prima salía de
// `bsPrice(spot, strike, T, rv, "put")` — el modelo alimentado con volatilidad REALIZADA, que
// asume que la prima extra es cero. Es la promesa más grande que queda sin verificar.
//
// ╔═══ POR QUÉ HOOD Y NO SPY ═══╗
// La Wheel inmoviliza strike×100 en efectivo. SPY a $773 son $77.300 por contrato: no cabe en la
// cuenta de Lester. HOOD a ~$95 son $9.500 — cabe, está en el backtest original, y es la acción
// que de verdad tiene (500 títulos). Si la celda se cae aquí, se cae en todas: el defecto es el
// mismo en las nueve.
//
// ╔═══ NADA INVENTADO ═══╗
//   · La prima sale del BID real (se VENDE el put, así que se cobra el bid, no el punto medio).
//   · El strike sale de la delta calculada con la IV REAL del mercado. Elegir un strike no
//     fabrica dinero; el dinero sigue saliendo del bid.
//   · Vencimientos y strikes: los que EXISTEN en la cadena.
//   · Liquidación al cierre real del subyacente el día del vencimiento.
//   · Tasas regulatorias $0,03 por contrato (Robinhood no cobra comisión, pero esto sí se paga).
//
// Uso: node scripts/wheel-hood-precios-reales.mjs [TICKER] [DTE] [DELTA]

import fs from "node:fs";
import path from "node:path";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const TICKER = (process.argv[2] || "HOOD").toUpperCase();
const DTE = Number(process.argv[3] || 14);
const DELTA_OBJ = Number(process.argv[4] || 0.35);
const TASAS = 0.03;
const DIR = `scripts/cache-theta/wheel-${TICKER.toLowerCase()}`;
fs.mkdirSync(DIR, { recursive: true });

const nd = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
// Delta del put a partir de la IV REAL. Transformación descriptiva: sitúa el strike, no pone precio.
const deltaPut = (S, K, T, v) => nd((Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T))) - 1;

async function texto(ruta, intentos = 3) {
  for (let i = 1; i <= intentos; i++) {
    try { const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(120000) }); if (r.ok) return await r.text(); }
    catch { /* reintenta */ }
    if (i < intentos) await new Promise((s) => setTimeout(s, 2000 * i));
  }
  return null;
}

console.log(`═══ WHEEL SOBRE ${TICKER} CON PRIMAS REALES ═══`);
console.log(`   cash-secured put · ${DTE} días · delta objetivo ${DELTA_OBJ}\n`);

const lex = await texto(`option/list/expirations?symbol=${TICKER}`);
if (!lex) { console.log("✗ sin vencimientos"); process.exit(1); }
const exps = [...new Set(lex.trim().split("\n").slice(1).map((l) => l.split(",").pop().replace(/"/g, "").trim())
  .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= "2022-01-01" && x <= "2026-08-12"))].sort();
console.log(`   vencimientos disponibles: ${exps.length} (${exps[0]} → ${exps[exps.length - 1]})`);

// Una entrada por vencimiento: se entra DTE días naturales antes. Sin solapamiento, que es como
// se opera de verdad — un put a la vez con el mismo efectivo.
const ops = [];
let bajadas = 0, sinDatos = 0;

for (const exp of exps) {
  const entrada = new Date(Date.parse(exp) - DTE * 86400000).toISOString().slice(0, 10);
  const f = path.join(DIR, `${exp}.json`);
  let filas;
  if (fs.existsSync(f)) { try { filas = JSON.parse(fs.readFileSync(f, "utf8")); } catch { filas = null; } }
  if (!filas) {
    const t = await texto(`option/history/greeks/implied_volatility?symbol=${TICKER}&expiration=${exp}&start_date=${entrada}&end_date=${entrada}&right=P&interval=1h`);
    if (!t || !t.includes("bid")) { sinDatos++; continue; }
    const lin = t.trim().split("\n"), cab = lin[0].split(",");
    const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
          iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
    filas = [];
    for (const l of lin.slice(1)) {
      const c = l.split(",");
      const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV], U = +c[iU], hh = (c[iT] ?? "").slice(11, 16);
      if (!(K > 0) || !(bid > 0) || !(ask >= bid) || !(iv > 0.01) || !(U > 0) || hh > "16:00") continue;
      filas.push([hh, K, bid, ask, Math.round(iv * 10000) / 10000, Math.round(U * 100) / 100]);
    }
    if (!filas.length) { sinDatos++; continue; }
    fs.writeFileSync(f, JSON.stringify(filas)); bajadas++;
    if (bajadas % 20 === 0) process.stdout.write(`\r   bajando... ${bajadas} vencimientos   `);
  }

  // Última foto del día de entrada (cerca del cierre).
  const hs = [...new Set(filas.map((r) => r[0]))].sort();
  const ultima = hs[hs.length - 1];
  const enHora = filas.filter((r) => r[0] === ultima);
  if (enHora.length < 5) continue;
  const U = enHora[0][5];
  const T = DTE / 365;

  // Strike cuya delta REAL se acerca más a la objetivo.
  let mejor = null, dif = 9;
  for (const [, K, bid, ask, iv] of enHora) {
    const d = Math.abs(deltaPut(U, K, T, iv));
    if (Math.abs(d - DELTA_OBJ) < dif) { dif = Math.abs(d - DELTA_OBJ); mejor = { K, bid, ask, iv, d }; }
  }
  if (!mejor || dif > 0.12) continue;

  // Se VENDE el put: se cobra el BID, no el punto medio. Menos las tasas.
  const prima = mejor.bid - TASAS;
  if (!(prima > 0)) continue;

  const teod = await texto(`stock/history/eod?symbol=${TICKER}&start_date=${exp}&end_date=${exp}`);
  if (!teod) continue;
  const lin2 = teod.trim().split("\n");
  if (lin2.length < 2) continue;
  const cab2 = lin2[0].split(","), iC = cab2.indexOf("close");
  const S = +lin2[lin2.length - 1].split(",")[iC];
  if (!(S > 0)) continue;

  const colateral = mejor.K * 100;
  const resultado = (prima - Math.max(0, mejor.K - S)) * 100;
  ops.push({ exp, entrada, U, K: mejor.K, delta: Math.round(mejor.d * 100) / 100, prima: prima * 100,
             cierre: S, asignado: S < mejor.K, resultado, colateral, ret: resultado / colateral * 100,
             horquilla: Math.round((mejor.ask - mejor.bid) / ((mejor.ask + mejor.bid) / 2) * 1000) / 10 });
}
console.log(`\r   vencimientos usados: ${ops.length}  ·  bajados ahora: ${bajadas}  ·  sin datos: ${sinDatos}      \n`);

if (ops.length < 20) { console.log("   muestra insuficiente para concluir"); process.exit(0); }

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUno = (a) => media(a) / (de(a) / Math.sqrt(a.length));
const mdn = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const rets = ops.map((o) => o.ret);
const anios = (Date.parse(ops[ops.length - 1].exp) - Date.parse(ops[0].exp)) / 31557600000;
const porAno = media(ops.map((o) => o.resultado)) * (ops.length / anios);
const colMed = mdn(ops.map((o) => o.colateral));

console.log(`${"─".repeat(66)}`);
console.log(`   operaciones          : ${ops.length}   (${ops[0].exp} → ${ops[ops.length - 1].exp})`);
console.log(`   delta media obtenida : ${media(ops.map((o) => Math.abs(o.delta))).toFixed(2)}`);
console.log(`   prima mediana cobrada: $${mdn(ops.map((o) => o.prima)).toFixed(0)}   sobre $${colMed.toFixed(0)} de colateral`);
console.log(`   horquilla mediana    : ${mdn(ops.map((o) => o.horquilla)).toFixed(1)}% de la prima`);
console.log(`   asignaciones         : ${(ops.filter((o) => o.asignado).length / ops.length * 100).toFixed(0)}%`);
console.log(`\n   retorno por operación: ${(media(rets) >= 0 ? "+" : "") + media(rets).toFixed(3)}%  ·  t = ${tUno(rets).toFixed(2)}`);
console.log(`   peor operación       : ${Math.min(...rets).toFixed(2)}%`);
console.log(`   $/año con UN contrato: $${porAno.toFixed(0)}  (inmoviliza $${colMed.toFixed(0)})`);

const ord = [...ops].sort((a, b) => (a.exp < b.exp ? -1 : 1));
const c = Math.floor(ord.length / 2);
const m1 = media(ord.slice(0, c).map((o) => o.ret)), m2 = media(ord.slice(c).map((o) => o.ret));
console.log(`\n   1ª mitad: ${(m1 >= 0 ? "+" : "") + m1.toFixed(3)}%   2ª mitad: ${(m2 >= 0 ? "+" : "") + m2.toFixed(3)}%   ${Math.sign(m1) === Math.sign(m2) ? "coherentes" : "SE CONTRADICEN"}`);
console.log(`\n   ── lo que decía el backtest contaminado ──`);
console.log(`      agresivo Δ0,35 a 14d: +0,78% por operación · $12.279/año\n`);
