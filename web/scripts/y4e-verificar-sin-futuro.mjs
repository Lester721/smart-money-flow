// Y4-E — VERIFICADOR: recalcular la senal A LO BRUTO y comprobar que da lo mismo.
//
// y4 calcula los montones con ventanas que van creciendo (medias que se van sumando, listas
// ordenadas donde se va insertando). Eso es rapido, pero es justo el sitio donde en este proyecto
// se han colado ya dos veces datos del futuro: basta con insertar el valor de hoy una linea antes
// de tiempo y la senal se convierte en un selector de ganadoras conocidas.
//
// Aqui se hace lo contrario de rapido: para una muestra de observaciones se recalcula el monton
// DESDE CERO, filtrando a mano todas las observaciones con fecha ESTRICTAMENTE ANTERIOR, sin
// ninguna estructura incremental. Si los dos numeros no coinciden en el 100% de los casos, hay
// contaminacion. Ademas se comprueba a mano que ninguna observacion usada tenga fecha >= la del
// dia de la compra.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4e-verificar-sin-futuro.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const TRAMOS = [["f", 30, 10], ["b", 180, 45]];
const MIN_ANOS_MES = 2, NB = 5, MIN_PROPIO = 12;
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const num = (n) => Math.round(n).toLocaleString("en-US");

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();
const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}
function sigmaDe(g, S, dte) {
  let mejor = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p || !(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mejor = { c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mejor || dm > S * 0.05) return null;
  const cuna = mejor.c + mejor.p;
  return cuna > 0 ? (cuna / S) / Math.sqrt(dte / 365) : null;
}

const obs = [];
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym), vistos = new Set();
  for (const dia of ds) {
    if (vistos.has(dia.slice(0, 6))) continue;
    vistos.add(dia.slice(0, 6));
    const c = cadena(sym, dia);
    if (!c) continue;
    const S = spotOk(c, dia);
    if (!(S > 0)) continue;
    const sig = {};
    for (const [nom, obj, tol] of TRAMOS) {
      let exp = null, dd = Infinity;
      for (const e of Object.keys(c)) { const d = cal(dia, e); if (d < 1) continue; const x = Math.abs(d - obj); if (x < dd) { dd = x; exp = e; } }
      if (!exp || dd > tol) continue;
      const s = sigmaDe(c[exp], S, cal(dia, exp));
      if (s > 0) sig[nom] = s;
    }
    if (!(sig.f > 0 && sig.b > 0)) continue;
    obs.push({ sym, dia, MM: dia.slice(4, 6), coc: sig.f / sig.b });
  }
  cache.clear();
}
console.log(`\n  observaciones de curva 30/180: ${num(obs.length)}`);

// ── VERSION INCREMENTAL (la de y4) ──────────────────────────────────────────
const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
function insertar(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } a.splice(lo, 0, x); }
function rango(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo / a.length; }
const resid = new Map(), mesHist = new Map();
let kk = 0;
while (kk < orden.length) {
  const dia = obs[orden[kk]].dia;
  let j = kk;
  while (j < orden.length && obs[orden[j]].dia === dia) j++;
  for (let q = kk; q < j; q++) {
    const o = obs[orden[q]];
    o.q = null;
    const mh = mesHist.get(`${o.sym}|${o.MM}`);
    if (mh && mh.n >= MIN_ANOS_MES) {
      o.res = o.coc - mh.suma / mh.n;
      const RR = resid.get(o.sym) ?? [];
      if (RR.length >= MIN_PROPIO) o.q = Math.min(NB - 1, Math.floor(rango(RR, o.res) * NB));
    }
  }
  for (let q = kk; q < j; q++) {
    const o = obs[orden[q]], km = `${o.sym}|${o.MM}`;
    if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
    const mh = mesHist.get(km); mh.suma += o.coc; mh.n++;
    if (o.res !== undefined) { if (!resid.has(o.sym)) resid.set(o.sym, []); insertar(resid.get(o.sym), o.res); }
  }
  kk = j;
}

// ── VERSION A LO BRUTO — todo recalculado desde cero, filtrando por fecha a mano ─────────────
/** El residuo de una observacion, mirando SOLO observaciones con dia < o.dia. Devuelve null si
 *  no hay al menos MIN_ANOS_MES observaciones anteriores de ese ticker en ese mes. */
function residBruto(o, todas) {
  const prev = todas.filter((x) => x.sym === o.sym && x.MM === o.MM && x.dia < o.dia);
  if (prev.length < MIN_ANOS_MES) return null;
  // control extra: ninguna puede ser del futuro ni del mismo dia
  for (const x of prev) if (x.dia >= o.dia) throw new Error("FUTURO en la media de mes");
  return o.coc - prev.reduce((a, x) => a + x.coc, 0) / prev.length;
}
function qBruto(o, todas) {
  const r = residBruto(o, todas);
  if (r == null) return null;
  const prevRes = [];
  for (const x of todas) {
    if (x.sym !== o.sym || x.dia >= o.dia) continue;
    const rx = residBruto(x, todas);
    if (rx != null) prevRes.push(rx);
  }
  if (prevRes.length < MIN_PROPIO) return null;
  const menores = prevRes.filter((v) => v < r).length;
  return Math.min(NB - 1, Math.floor((menores / prevRes.length) * NB));
}

// muestra determinista (uno de cada 9), no aleatoria
const muestra = obs.filter((_, i) => i % 9 === 0);
let iguales = 0, distintos = 0, ambosNull = 0, ejemplos = [];
for (const o of muestra) {
  const qb = qBruto(o, obs);
  if (o.q == null && qb == null) { ambosNull++; iguales++; continue; }
  if (o.q === qb) iguales++;
  else { distintos++; if (ejemplos.length < 8) ejemplos.push(`${o.sym} ${o.dia}: incremental=${o.q} bruto=${qb}`); }
}
console.log(`\n${"=".repeat(96)}`);
console.log("  ¿LA VENTANA MIRA AL FUTURO? — recalculo a lo bruto contra el incremental");
console.log(`${"=".repeat(96)}`);
console.log(`  muestra comprobada: ${num(muestra.length)} observaciones (una de cada 9, elegidas por posicion, no al azar)`);
console.log(`  coinciden: ${num(iguales)} · NO coinciden: ${num(distintos)} · las dos sin monton: ${num(ambosNull)}`);
if (ejemplos.length) { console.log("  ejemplos de desacuerdo:"); for (const e of ejemplos) console.log("    " + e); }
console.log(`  VEREDICTO: ${distintos === 0 ? "la ventana NO mira al futuro — el incremental y el bruto dan lo MISMO en el 100% de la muestra" : "HAY CONTAMINACION"}`);

// ── control 2: la fecha de la primera senal viva ─────────────────────────────
const conQ = obs.filter((o) => o.q != null).map((o) => o.dia).sort();
console.log(`\n  primer dia con monton asignado: ${conQ[0]} · ultimo: ${conQ[conQ.length - 1]} · dias con monton: ${num(conQ.length)}`);

// ── control 3: ¿el residuo de hoy usa el valor de hoy? prueba de sabotaje ────
// Si se ENSUCIA a proposito metiendo el valor del propio dia en la media del mes, el monton tiene
// que cambiar en muchas observaciones. Si no cambiara nada, es que el filtro de fecha no hace nada.
{
  let cambia = 0, mira = 0;
  for (const o of muestra) {
    const prev = obs.filter((x) => x.sym === o.sym && x.MM === o.MM && x.dia <= o.dia);   // <= : contaminado a proposito
    if (prev.length < MIN_ANOS_MES) continue;
    const rSucio = o.coc - prev.reduce((a, x) => a + x.coc, 0) / prev.length;
    const rLimpio = residBruto(o, obs);
    if (rLimpio == null) continue;
    mira++;
    if (Math.abs(rSucio - rLimpio) > 1e-12) cambia++;
  }
  console.log(`  prueba de sabotaje: metiendo el dato de HOY en la media de su mes, el residuo cambia en ${num(cambia)} de ${num(mira)} casos comprobados.`);
  console.log(`  (tenia que cambiar en casi todos: si no cambiara, el filtro de fecha seria decorativo)`);
}
console.log("");
