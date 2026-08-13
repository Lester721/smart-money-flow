// CALLS CUBIERTAS SOBRE HOOD — la única estrategia que Lester puede ejecutar HOY.
//
// Por qué esta y no otra: tiene 500 acciones de HOOD ($47.500, el 85% de su cuenta) y sólo
// ~$8.000 libres. La Wheel no le cabe —un put inmoviliza $9.500—, pero las calls cubiertas no
// necesitan dinero nuevo: las acciones YA SON el colateral. Puede vender 5 contratos hoy mismo.
// Nunca lo habíamos medido.
//
// ╔═══ LA MEDICIÓN CORRECTA ═══╗
// No es "¿cuánto gana vender calls?" sino "¿QUÉ AÑADE O QUITA sobre tener las acciones?".
// Por ciclo, con las mismas acciones y la misma ventana:
//
//     tener acciones sola : (S_final − S_inicio) / S_inicio
//     con call encima     : (min(S_final, K) − S_inicio + prima) / S_inicio
//     ─────────────────────────────────────────────────────────────────
//     lo que APORTA       :  prima − max(0, S_final − K)
//
// Si esa resta es negativa, vender calls te costó dinero. Sin dependencia del camino, sin
// suponer qué haces tras una asignación, y directamente comparable.
//
// ╔═══ NADA INVENTADO ═══╗
//   · La prima es el BID real (se VENDE la call: se cobra el bid, no el punto medio).
//   · El strike sale de la delta calculada con la IV REAL. Situar un strike no fabrica dinero.
//   · Strikes y vencimientos: los que EXISTEN.
//   · Liquidación al cierre real del subyacente. Tasas $0,03 por contrato.
//
// Uso: node scripts/calls-cubiertas-hood.mjs [TICKER]

import fs from "node:fs";
import path from "node:path";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const TICKER = (process.argv[2] || "HOOD").toUpperCase();
const TASAS = 0.03;
const DELTAS = [0.15, 0.25, 0.35];
const DTES = [7, 14, 30];
const DIR = `scripts/cache-theta/calls-${TICKER.toLowerCase()}`;
fs.mkdirSync(DIR, { recursive: true });

const nd = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const deltaCall = (S, K, T, v) => nd((Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T)));

async function texto(ruta, intentos = 3) {
  for (let i = 1; i <= intentos; i++) {
    try { const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(120000) }); if (r.ok) return await r.text(); }
    catch { /* reintenta */ }
    if (i < intentos) await new Promise((s) => setTimeout(s, 2000 * i));
  }
  return null;
}

// Serie de cierres, en tramos de menos de 365 días (la API no admite más).
const cierres = new Map();
for (const [a, b] of [["2022-01-01", "2022-12-31"], ["2023-01-01", "2023-12-31"], ["2024-01-01", "2024-12-31"],
                      ["2025-01-01", "2025-12-31"], ["2026-01-01", "2026-08-12"]]) {
  const t = await texto(`stock/history/eod?symbol=${TICKER}&start_date=${a}&end_date=${b}`);
  if (!t) continue;
  const lin = t.trim().split("\n"), cab = lin[0].split(",");
  const iC = cab.indexOf("close"), iT = cab.indexOf("last_trade");
  for (const l of lin.slice(1)) {
    const c = l.split(","), f = (c[iT] ?? "").slice(0, 10), p = +c[iC];
    if (/^\d{4}-\d{2}-\d{2}$/.test(f) && p > 0) cierres.set(f, p);
  }
}
console.log(`═══ CALLS CUBIERTAS SOBRE ${TICKER} ═══`);
console.log(`   ${cierres.size} sesiones de precio del subyacente\n`);

const lex = await texto(`option/list/expirations?symbol=${TICKER}`);
const exps = [...new Set((lex ?? "").trim().split("\n").slice(1).map((l) => l.split(",").pop().replace(/"/g, "").trim())
  .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= "2022-01-01" && x <= "2026-08-12"))].sort();
console.log(`   vencimientos: ${exps.length}\n`);

async function cadena(exp, entrada) {
  const f = path.join(DIR, `${exp}_${entrada}.json`);
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { /* rehacer */ } }
  const t = await texto(`option/history/greeks/implied_volatility?symbol=${TICKER}&expiration=${exp}&start_date=${entrada}&end_date=${entrada}&right=C&interval=1h`);
  if (!t || !t.includes("bid")) { fs.writeFileSync(f, "[]"); return []; }
  const lin = t.trim().split("\n"), cab = lin[0].split(",");
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  const filas = [];
  for (const l of lin.slice(1)) {
    const c = l.split(",");
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV], U = +c[iU], hh = (c[iT] ?? "").slice(11, 16);
    if (!(K > 0) || !(bid > 0) || !(ask >= bid) || !(iv > 0.01) || !(U > 0) || hh > "16:00") continue;
    filas.push([hh, K, bid, ask, Math.round(iv * 10000) / 10000, Math.round(U * 100) / 100]);
  }
  fs.writeFileSync(f, JSON.stringify(filas));
  return filas;
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUno = (a) => media(a) / (de(a) / Math.sqrt(a.length));

const resultados = [];
for (const dte of DTES) {
  for (const dObj of DELTAS) {
    const ciclos = [];
    for (const exp of exps) {
      const entrada = new Date(Date.parse(exp) - dte * 86400000).toISOString().slice(0, 10);
      const Sini = cierres.get(entrada), Sfin = cierres.get(exp);
      if (!(Sini > 0) || !(Sfin > 0)) continue;
      const filas = await cadena(exp, entrada);
      if (filas.length < 5) continue;
      const hs = [...new Set(filas.map((r) => r[0]))].sort();
      const enHora = filas.filter((r) => r[0] === hs[hs.length - 1]);
      const U = enHora[0]?.[5];
      if (!(U > 0)) continue;
      const T = dte / 365;
      let mejor = null, dif = 9;
      for (const [, K, bid, ask, iv] of enHora) {
        const d = deltaCall(U, K, T, iv);
        if (Math.abs(d - dObj) < dif) { dif = Math.abs(d - dObj); mejor = { K, bid, ask, iv, d }; }
      }
      if (!mejor || dif > 0.10) continue;
      const prima = mejor.bid - TASAS;
      if (!(prima > 0)) continue;
      // LO QUE APORTA la call sobre tener las acciones, en % del precio de entrada.
      const aporta = (prima - Math.max(0, Sfin - mejor.K)) / Sini * 100;
      ciclos.push({ exp, entrada, Sini, Sfin, K: mejor.K, prima, aporta,
                    asignada: Sfin > mejor.K, accion: (Sfin - Sini) / Sini * 100 });
    }
    if (ciclos.length < 30) continue;
    const ap = ciclos.map((c) => c.aporta);
    const anios = (Date.parse(ciclos[ciclos.length - 1].exp) - Date.parse(ciclos[0].exp)) / 31557600000;
    resultados.push({ dte, delta: dObj, n: ciclos.length,
      aporta: media(ap), t: tUno(ap), asignadas: ciclos.filter((c) => c.asignada).length / ciclos.length * 100,
      prima: media(ciclos.map((c) => c.prima / c.Sini * 100)),
      porAno: media(ap) * (ciclos.length / anios), peor: Math.min(...ap), ciclos });
  }
}

console.log(`   LO QUE APORTA VENDER LA CALL, sobre tener las acciones sin más:\n`);
console.log(`   DTE  delta    n    prima%   aporta%      t    asignadas   peor%   %/año`);
for (const r of resultados) {
  console.log(`   ${String(r.dte).padStart(3)}   ${r.delta.toFixed(2)}  ${String(r.n).padStart(4)}   ${r.prima.toFixed(2).padStart(5)}%  ` +
    `${(r.aporta >= 0 ? "+" : "") + r.aporta.toFixed(3).padStart(6)}%  ${r.t.toFixed(2).padStart(6)}    ${r.asignadas.toFixed(0).padStart(3)}%  ${r.peor.toFixed(1).padStart(7)}%  ${(r.porAno >= 0 ? "+" : "") + r.porAno.toFixed(1).padStart(6)}%`);
}
console.log(`\n   "aporta" negativo = vender la call te QUITÓ dinero respecto a no hacer nada.`);

// ¿Cambia si sólo se vende cuando la acción viene PLANA? Es la hipótesis obvia: no vender
// cuando está corriendo. Se mira sobre la mejor celda por número de operaciones.
const mejorCelda = resultados.reduce((a, b) => (b.n > a.n ? b : a), resultados[0]);
if (mejorCelda) {
  console.log(`\n   ── ¿Y si sólo vendo cuando HOOD viene plana? (celda ${mejorCelda.dte}d Δ${mejorCelda.delta}) ──`);
  const cs = mejorCelda.ciclos;
  const fechas = [...cierres.keys()].sort();
  const idx = new Map(fechas.map((f, i) => [f, i]));
  const conMomento = cs.map((c) => {
    const i = idx.get(c.entrada);
    const previo = i != null && i >= 10 ? cierres.get(fechas[i - 10]) : null;
    return { ...c, mom: previo ? (c.Sini / previo - 1) * 100 : null };
  }).filter((c) => c.mom != null);
  for (const [etiq, filtro] of [["subiendo (+5% en 10 sesiones o más)", (c) => c.mom >= 5],
                                ["plana (entre −5% y +5%)", (c) => c.mom > -5 && c.mom < 5],
                                ["bajando (−5% o menos)", (c) => c.mom <= -5]]) {
    const g = conMomento.filter(filtro);
    if (g.length < 20) { console.log(`      ${etiq.padEnd(38)} n=${g.length} (muestra corta)`); continue; }
    const a = g.map((c) => c.aporta);
    console.log(`      ${etiq.padEnd(38)} n=${String(g.length).padStart(3)}   aporta ${(media(a) >= 0 ? "+" : "") + media(a).toFixed(3)}%   t=${tUno(a).toFixed(2)}`);
  }
}
console.log("");
