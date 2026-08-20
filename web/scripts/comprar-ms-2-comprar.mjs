// PASO 2 — COMPRAR LA OPCIÓN con las señales de MarketSnack. PRECIOS REALES: se paga el ASK
// del EOD del día de la decisión y se cobra el BID del EOD del día de salida. Nunca punto medio,
// nunca Black-Scholes. Si el contrato NO APARECE en la cadena de salida, vale CERO (el
// descargador filtra bid<=0, así que "no está" = "no tiene puja" = expiró sin valor).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/comprar-ms-2-comprar.mjs
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { pasarBarrera, listonT, informe, potencia } from "../lib/barreraHallazgos.ts";

const CDIR = "scripts/cache-theta/cadenas", CIER = "scripts/cache-theta/cierres";
const PLAZOS = [7, 30, 60];                 // DTE objetivo
const DIST   = [0, 0.05, 0.10, 0.20];       // fuera del dinero
const HOLD   = [1, 5, 10, 20];              // días de mercado hasta la salida
const CUENTA = 56389;

const aIso = (d) => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
const ms = (ymd) => Date.parse(aIso(ymd) + "T00:00:00Z");

// ── días de cadena por ticker ──
const diasCad = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  (diasCad.get(m[1]) ?? diasCad.set(m[1], []).get(m[1])).push(m[2]);
}
const idxCad = new Map();
for (const [t, v] of diasCad) { v.sort(); idxCad.set(t, new Map(v.map((d, i) => [d, i]))); }

const cierres = new Map();
const cierre = (t, ymd) => {
  if (!cierres.has(t)) cierres.set(t, existsSync(`${CIER}/${t}.json`) ? JSON.parse(readFileSync(`${CIER}/${t}.json`,"utf8")) : {});
  const v = cierres.get(t)[ymd]; return Number.isFinite(v) && v > 0 ? v : null;
};
const cacheCad = new Map();
function cadena(t, ymd) {
  const k = `${t}|${ymd}`;
  if (cacheCad.has(k)) { const v = cacheCad.get(k); cacheCad.delete(k); cacheCad.set(k, v); return v; }
  const f = `${CDIR}/${t}_d${ymd}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cacheCad.set(k, v);
  if (cacheCad.size > 400) cacheCad.delete(cacheCad.keys().next().value);
  return v;
}

/** Elige vencimiento y strike REALES de la cadena del día. Devuelve null si no existen. */
function elegir(cad, ymd, S, right, plazo, dist) {
  const objetivo = ms(ymd) + plazo * 86400000;
  let exp = null;
  for (const e of Object.keys(cad)) { const t = ms(e); if (t >= objetivo && (exp === null || t < ms(exp))) exp = e; }
  if (!exp) return null;
  const kObj = right === "C" ? S * (1 + dist) : S * (1 - dist);
  let mejor = null;
  for (const clave of Object.keys(cad[exp])) {
    if (clave.slice(-1) !== right) continue;
    const K = Number(clave.slice(0, -2));
    const ba = cad[exp][clave]; if (!(ba[1] > 0) || !(ba[0] > 0)) continue;
    const d = Math.abs(K - kObj);
    if (!mejor || d < mejor.d) mejor = { d, clave, K, bid: ba[0], ask: ba[1], exp };
  }
  // el strike encontrado tiene que estar razonablemente cerca del objetivo, si no la cadena
  // no cubre esa distancia y forzarlo sería medir otra cosa
  if (!mejor || mejor.d > kObj * 0.05) return null;
  return mejor;
}

/** Valor de salida REAL: bid del día de salida, o intrínseco si ya venció. 0 si no cotiza. */
function salida(t, exp, clave, ymdSal, K, right) {
  if (ms(exp) <= ms(ymdSal)) {                      // ya venció: liquidación por intrínseco
    const Sx = cierre(t, exp);
    if (Sx == null) return null;                    // sin cierre real no se inventa
    return right === "C" ? Math.max(0, Sx - K) : Math.max(0, K - Sx);
  }
  const cad = cadena(t, ymdSal); if (!cad) return null;
  const ba = cad[exp]?.[clave];
  return ba ? ba[0] : 0;                            // no está en la cadena = sin puja = cero
}

// ═══ construir todas las operaciones posibles (call y put) para cada ticker-día ═══
const senales = JSON.parse(readFileSync("scripts/cache-theta/marketsnack/senales-tickerdia.json","utf8"));
radiografia(senales, ["neto","ivFlujo","sizeSobreOI","prima","nOps","callPct"], "señales MS por ticker-día");

const ops = [];
let sinCierre = 0, sinContrato = 0, sinSalida = 0, intentos = 0;
for (const s of senales) {
  const cad = cadena(s.ticker, s.ymd); if (!cad) continue;
  const S = cierre(s.ticker, s.ymd); if (S == null) { sinCierre++; continue; }
  const idx = idxCad.get(s.ticker), dias = diasCad.get(s.ticker);
  const i0 = idx.get(s.ymd);
  for (const plazo of PLAZOS) for (const dist of DIST) {
    const C = elegir(cad, s.ymd, S, "C", plazo, dist);
    const P = elegir(cad, s.ymd, S, "P", plazo, dist);
    intentos++;
    if (!C || !P) { sinContrato++; continue; }
    for (const h of HOLD) {
      const iS = i0 + h; if (iS >= dias.length) continue;
      const ymdSal = dias[iS];
      const vC = salida(s.ticker, C.exp, C.clave, ymdSal, C.K, "C");
      const vP = salida(s.ticker, P.exp, P.clave, ymdSal, P.K, "P");
      if (vC == null || vP == null) { sinSalida++; continue; }
      ops.push({
        ticker: s.ticker, fecha: s.fecha, ymd: s.ymd, tramo: s.tramo, plazo, dist, h,
        neto: s.neto, ivFlujo: s.ivFlujo, sizeSobreOI: s.sizeSobreOI, prima: s.prima, n1M: s.n1M, neto1M: s.neto1M,
        expC: C.exp, kC: C.K, askC: C.ask, salC: vC, retC: (vC - C.ask) / C.ask,
        expP: P.exp, kP: P.K, askP: P.ask, salP: vP, retP: (vP - P.ask) / P.ask,
        S, Ssal: cierre(s.ticker, ymdSal),
        dteC: (ms(C.exp) - ms(s.ymd)) / 86400000,
      });
    }
  }
}
console.log(`\nintentos (ticker-día × plazo × dist): ${intentos} · sin contrato a esa distancia ${sinContrato} · sin cierre ${sinCierre} · sin salida ${sinSalida}`);
console.log(`operaciones construidas (call y put a la vez): ${ops.length}`);
writeFileSync("scripts/cache-theta/marketsnack/ops-comprar.json", JSON.stringify(ops), "utf8");
console.log("escrito ops-comprar.json");
