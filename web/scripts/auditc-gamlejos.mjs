// AUDITORÍA — recalcula gamLejos para cada (ticker,mes) de puente-filas.json, replicando
// puente-se-veia-venir.mjs, pero con el FACTOR DE SPLIT configurable.
//   FMODE=orig → factor = producto de los splits FUTUROS (lo que hace el original)
//   FMODE=uno  → factor = 1 (sin conocimiento del futuro)
// Salida: scripts/auditc-gamlejos-<FMODE>.json  {ticker|mes: {gamLejos, nUsados, nDescartados, F}}
import { readFileSync, existsSync, writeFileSync } from "node:fs";

const FMODE = process.argv[2] || "orig";
const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
const RISK_FREE = 0.04;

function normCdf(x) {
  if (!Number.isFinite(x)) return x > 0 ? 1 : 0;
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}
const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
const d1Of = (s, k, T, iv, r) => (Math.log(s / k) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
const invalid = (s, k, T, iv) => !(s > 0) || !(k > 0) || !(T > 0) || !(iv > 0);
function precioInterno(s, k, T, iv, r = RISK_FREE) {
  if (invalid(s, k, T, iv)) return 0;
  const d1 = d1Of(s, k, T, iv, r), d2 = d1 - iv * Math.sqrt(T);
  return s * normCdf(d1) - k * Math.exp(-r * T) * normCdf(d2);
}
function bsDelta(s, k, T, iv, r = RISK_FREE) { if (invalid(s, k, T, iv)) return 0; return normCdf(d1Of(s, k, T, iv, r)); }
function bsGamma(s, k, T, iv) {
  if (invalid(s, k, T, iv)) return 0;
  const sq = Math.sqrt(T), d1 = (Math.log(s / k) + 0.5 * iv * iv * T) / (iv * sq);
  return phi(d1) / (s * iv * sq);
}
function impliedVol(price, spot, strike, T, r = RISK_FREE) {
  if (!(price > 0) || !(spot > 0) || !(strike > 0) || !(T > 0)) return null;
  const disc = strike * Math.exp(-r * T);
  const intrinsic = Math.max(0, spot - disc);
  if (price <= intrinsic || price >= spot) return null;
  let lo = 0.01, hi = 5;
  if (precioInterno(spot, strike, T, lo, r) > price) return null;
  if (precioInterno(spot, strike, T, hi, r) < price) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2, p = precioInterno(spot, strike, T, mid, r);
    if (Math.abs(p - price) < 1e-6) return mid;
    if (p < price) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const splits = JSON.parse(readFileSync("scripts/auditc-splits.json", "utf8"));
const factor = (sym, d) => FMODE === "uno" ? 1 : (splits[sym] ?? []).reduce((f, s) => (s.desde > d ? f * s.ratio : f), 1);

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8"));
// último día con cadena de cada (ticker, mes)
import { readdirSync } from "node:fs";
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const ultimoDia = (sym, mes) => { const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes); return d.length ? d[d.length - 1] : null; };

const out = {};
for (const fila of filas) {
  const sym = fila.ticker, mes = fila.mes;
  const d = ultimoDia(sym, mes); if (!d) continue;
  const c = existsSync(`${CDIR}/${sym}_d${d}.json`) ? JSON.parse(readFileSync(`${CDIR}/${sym}_d${d}.json`, "utf8")) : null;
  const oiDia = existsSync(`${OIDIR}/${sym}_d${d}.json`) ? JSON.parse(readFileSync(`${OIDIR}/${sym}_d${d}.json`, "utf8")) : null;
  if (!c || !oiDia) continue;
  const F = factor(sym, d);
  // spot: strike con call-mid más cercano a put-mid (raw), normalizado por F
  let mejorK = null, mejorDif = Infinity;
  for (const grupo of Object.values(c)) for (const [clave, ba] of Object.entries(grupo)) {
    if (clave.slice(-1) !== "C") continue;
    const K = Number(clave.slice(0, -2)); if (!(K > 0)) continue;
    const p = grupo[`${K}|P`]; if (!p) continue;
    const dif = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (dif < mejorDif) { mejorDif = dif; mejorK = K / F; }
  }
  const sp = mejorK;
  if (!sp) continue;
  let gamC = 0, gamLejosC = 0, nUsados = 0, nNull = 0, nSinQuote = 0;
  for (const [expRaw, grupo] of Object.entries(oiDia)) {
    for (const [claveRaw, oi] of Object.entries(grupo)) {
      const K = Number(claveRaw.slice(0, -2)) / F, n = Number(oi) || 0;
      if (!(K > 0) || !(n > 0)) continue;
      if (claveRaw.slice(-1) !== "C") continue;
      const lejos = K > sp * 1.6;
      const ba = c?.[expRaw]?.[claveRaw];
      if (!(ba && ba[0] > 0 && ba[1] > 0)) { nSinQuote++; continue; }
      const T = (ms(expRaw) - ms(d)) / (365 * 86_400_000);
      if (!(T > 0)) continue;
      const mid = ((ba[0] + ba[1]) / 2) * F;
      const iv = impliedVol(mid, sp, K, T);
      if (!(iv > 0 && Number.isFinite(iv))) { nNull++; continue; }
      const gm = bsGamma(sp, K, T, iv) * n * 100 * sp * sp;
      if (Number.isFinite(gm)) { gamC += gm; if (lejos) gamLejosC += gm; nUsados++; }
    }
  }
  out[`${sym}|${mes}`] = { gamLejos: gamC > 0 ? gamLejosC / gamC : null, nUsados, nNull, nSinQuote, F: +F.toFixed(3), spot: sp, dia: d };
}
writeFileSync(`scripts/auditc-gamlejos-${FMODE}.json`, JSON.stringify(out), "utf8");
console.log(`${Object.keys(out).length} filas recalculadas, FMODE=${FMODE}`);
