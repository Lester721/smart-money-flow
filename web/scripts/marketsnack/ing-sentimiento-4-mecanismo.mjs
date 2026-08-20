// INGREDIENTE · SENTIMIENTO — PASO 4: EL MECANISMO
//
// En el paso 3 salió un patrón que hay que explicar antes de decir nada:
//     corte 11:00 → largo−corto +0,471 pts/día (t=1,88)
//     corte 15:00 → +0,124 (t=0,83)
//     sesión completa → +0,076 (t=0,53)
// CUANTA MÁS INFORMACIÓN SE USA, MENOS SEPARA. Eso no es lo que hace una señal: una señal
// mejora al añadirle datos. Lo que sí produce ese patrón es que el flujo PERSIGA AL PRECIO —
// el desequilibrio de la mañana es un termómetro de lo que ya se movió, y a media tarde el
// movimiento ya está en el precio, así que el desequilibrio deja de aportar orden.
//
// Se prueba directamente:
//   1. ¿Cuánto correlaciona dese@11:00 con el retorno intradía 11:00 → cierre del MISMO día?
//   2. ¿Separa el retorno intradía por sí solo el retorno del día siguiente? (momento, gratis)
//   3. Dentro de cada tercio de momento, ¿añade algo el sentimiento? (doble ordenación)
// Si (3) da cero, el sentimiento no aporta NADA sobre mirar el precio, que no cuesta suscripción.
//
// PRECIO INTRADÍA: `asset_price` viene DENTRO de cada fila del flujo (precio del subyacente en
// el momento de la operación). Se valida antes de usarlo contra el cierre de la serie diaria.
//
// PRUEBAS: 2 más sobre las 24 del paso 3 → 26 declaradas.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/ing-sentimiento-4-mecanismo.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos";
import { radiografia } from "../../lib/radiografia";

const RAIZ = "C:/Users/leste/dev/agente-tito-metralleta/web";
const DIR = path.join(RAIZ, "scripts/cache-theta/marketsnack/flujo-100k");
const CHART = path.join(RAIZ, "scripts/cache-theta/marketsnack/aux/chart-all");
const PRUEBAS = 26, LISTON = listonT(PRUEBAS);
const MIN_OPS = 20, MIN_SIM = 9;
const CORTE_UTC = 15;               // 11:00 ET
const CUENTA = 56389;

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);
const corr = (a, b) => {
  const ma = media(a), mb = media(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? n / Math.sqrt(da * db) : 0;
};
function parseOcc(s) {
  if (!s || s.length < 16) return null;
  const k = s.slice(-8), tp = s.slice(-9, -8), fe = s.slice(-15, -9), u = s.slice(0, -15);
  if (!/^\d{8}$/.test(k) || !/^[CP]$/.test(tp) || !/^\d{6}$/.test(fe) || !u) return null;
  return { u, tipo: tp };
}

const conPrecio = new Map();
for (const f of fs.readdirSync(CHART)) {
  let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, f))).toString("utf8")); } catch { continue; }
  if (!j?.data?.length) continue;
  const serie = j.data.map((p) => [p.t.slice(0, 10), p.v]).filter((p) => Number.isFinite(p[1]) && p[1] > 0);
  if (serie.length < 100) continue;
  conPrecio.set(f.replace(".json.gz", ""), { serie, idx: new Map(serie.map((p, i) => [p[0], i])) });
}
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort().map((f) => f.slice(0, 10));

console.log(`═══ PASO 4 · ¿EL FLUJO PERSIGUE AL PRECIO? ═══`);
console.log(`   ${dias.length} días · ${conPrecio.size} símbolos con precio · listón ${LISTON} (${PRUEBAS} pruebas)\n`);

// ── recoger ────────────────────────────────────────────────────────────────────────────────
// por (símbolo,día): desequilibrio hasta 11:00, asset_price de la última operación ≤11:00,
// y asset_price de la ÚLTIMA operación del día (para validar contra el cierre).
const ev = new Map();
let apNulos = 0, apTot = 0;
for (const dia of dias) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8");
  for (const l of buf.split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    const occ = parseOcc(t.symbol ?? ""); if (!occ || !conPrecio.has(occ.u)) continue;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) continue;
    const s = t.sentiment; if (s !== "bullish" && s !== "bearish") continue;
    if (!(t.premium > 0)) continue;
    const hUTC = +t.timestamp.slice(11, 13) + (+t.timestamp.slice(14, 16)) / 60;
    const k = `${occ.u}|${dia}`;
    let e = ev.get(k);
    if (!e) { e = { sim: occ.u, dia, bull: 0, bear: 0, n: 0, p11: null, h11: -1, pUlt: null, hUlt: -1 }; ev.set(k, e); }
    apTot++; if (t.asset_price == null) apNulos++;
    if (hUTC <= CORTE_UTC) {
      if (s === "bullish") e.bull += t.premium; else e.bear += t.premium;
      e.n++;
      if (t.asset_price > 0 && hUTC > e.h11) { e.h11 = hUTC; e.p11 = t.asset_price; }
    }
    if (t.asset_price > 0 && hUTC > e.hUlt) { e.hUlt = hUTC; e.pUlt = t.asset_price; }
  }
}
console.log(`   asset_price nulo en ${((apNulos / apTot) * 100).toFixed(1)}% de las filas usadas (la ruptura del 16-jul)\n`);

// ── VALIDAR asset_price contra el cierre de la serie diaria ────────────────────────────────
const dif = [];
for (const e of ev.values()) {
  if (!(e.pUlt > 0) || e.hUlt < 19.5) continue;         // sólo operaciones de los últimos 30 min
  const { serie, idx } = conPrecio.get(e.sim); const i = idx.get(e.dia); if (i == null) continue;
  dif.push(Math.abs(e.pUlt / serie[i][1] - 1) * 100);
}
dif.sort((a, b) => a - b);
console.log(`── validación de asset_price contra el cierre diario (${dif.length} símbolo-día, últimos 30 min) ──`);
console.log(`   |error| p50 ${dif[Math.floor(dif.length * 0.5)].toFixed(3)}% · p90 ${dif[Math.floor(dif.length * 0.9)].toFixed(3)}% · p99 ${dif[Math.floor(dif.length * 0.99)].toFixed(3)}%`);
if (dif[Math.floor(dif.length * 0.9)] > 1.5) throw new Error("asset_price no cuadra con el cierre: no se mide con esto.");
console.log(`   → asset_price y la serie diaria son el mismo precio. Se puede usar.\n`);

// ── muestra ────────────────────────────────────────────────────────────────────────────────
const SALTO = 0.35, simSalto = new Set();
for (const [sim, { serie }] of conPrecio)
  for (let i = 1; i < serie.length; i++) if (Math.abs(serie[i][1] / serie[i - 1][1] - 1) > SALTO) simSalto.add(sim);

const porDia = new Map();
for (const e of ev.values()) {
  if (simSalto.has(e.sim)) continue;
  if (e.n < MIN_OPS) continue;
  const tot = e.bull + e.bear; if (!(tot > 0)) continue;
  if (!(e.p11 > 0)) continue;
  const { serie, idx } = conPrecio.get(e.sim); const i = idx.get(e.dia);
  if (i == null || i + 1 >= serie.length) continue;
  const cierre = serie[i][1];
  const f = {
    ticker: e.sim, fecha: e.dia,
    dese: (e.bull - e.bear) / tot,
    mom: (cierre / e.p11 - 1) * 100,          // retorno intradía 11:00 → cierre del MISMO día
    r1: (serie[i + 1][1] / cierre - 1) * 100, // lo que se predice
  };
  if (!porDia.has(e.dia)) porDia.set(e.dia, []);
  porDia.get(e.dia).push(f);
}
const filas = [];
for (const g of porDia.values()) if (g.length >= MIN_SIM) filas.push(...g);
console.log(`   muestra: ${filas.length.toLocaleString("es-ES")} símbolo-día · ${porDia.size} días · ${new Set(filas.map((f) => f.ticker)).size} símbolos\n`);
radiografia(filas, ["dese", "mom", "r1"], "mecanismo", { maxCeros: 0.2 });

// ── 1. ¿persigue el flujo al precio? ───────────────────────────────────────────────────────
const cDia = [];
for (const [, g] of porDia) { if (g.length < MIN_SIM) continue; cDia.push(corr(g.map((f) => f.dese), g.map((f) => f.mom))); }
console.log(`── 1. correlación TRANSVERSAL dentro del día  dese@11:00  vs  retorno 11:00→cierre ──`);
console.log(`   media ${media(cDia).toFixed(3)} · mediana ${[...cDia].sort((a, b) => a - b)[Math.floor(cDia.length / 2)].toFixed(3)}` +
  ` · días con correlación positiva: ${cDia.filter((x) => x > 0).length}/${cDia.length}`);
console.log(`   correlación global (todas las filas): ${corr(filas.map((f) => f.dese), filas.map((f) => f.mom)).toFixed(3)}\n`);

// ── 2 y 3. separaciones ────────────────────────────────────────────────────────────────────
function ls(campoOrden, filtro = null) {
  const serie = [];
  for (const [dia, g0] of [...porDia].sort()) {
    const g = filtro ? g0.filter(filtro) : g0;
    if (g.length < MIN_SIM) continue;
    const ord = [...g].sort((a, b) => b[campoOrden] - a[campoOrden]);
    const k = Math.floor(ord.length / 3);
    if (k < 3) continue;
    serie.push({ dia, ls: media(ord.slice(0, k).map((f) => f.r1)) - media(ord.slice(-k).map((f) => f.r1)) });
  }
  const v = serie.map((s) => s.ls);
  const k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0) };
}

const A = ls("dese");
const B = ls("mom");
console.log(`── 2. ¿qué separa el retorno del DÍA SIGUIENTE? (largo tercio alto − corto tercio bajo) ──`);
for (const [nom, r] of [["SENTIMIENTO  dese@11:00", A], ["MOMENTO      retorno 11:00→cierre (gratis, sin suscripción)", B]])
  console.log(`   ${nom.padEnd(58)} n=${r.n} días · ${r.m >= 0 ? "+" : ""}${r.m.toFixed(4)} pts · t=${r.t.toFixed(2)} · tercios ${r.ter.map((x) => (x >= 0 ? "+" : "") + x.toFixed(2)).join(" ")} ${r.mismo ? "✓" : "✗"}`);

// ── 3. doble ordenación: dentro de cada tercio de MOMENTO, ¿añade el sentimiento? ──────────
console.log(`\n── 3. DOBLE ORDENACIÓN — dentro de cada tercio de momento, ¿añade el sentimiento? ──`);
const serieNeutra = [];
for (const [dia, g] of [...porDia].sort()) {
  if (g.length < 12) continue;
  const porMom = [...g].sort((a, b) => b.mom - a.mom);
  const k = Math.floor(porMom.length / 3);
  const alto = [], bajo = [];
  for (let b = 0; b < 3; b++) {
    const cubo = b < 2 ? porMom.slice(b * k, (b + 1) * k) : porMom.slice(2 * k);
    if (cubo.length < 3) continue;
    const ord = [...cubo].sort((x, y) => y.dese - x.dese);
    const j = Math.max(1, Math.floor(ord.length / 3));
    alto.push(...ord.slice(0, j).map((f) => f.r1));
    bajo.push(...ord.slice(-j).map((f) => f.r1));
  }
  if (alto.length && bajo.length) serieNeutra.push({ dia, ls: media(alto) - media(bajo) });
}
const vN = serieNeutra.map((s) => s.ls);
const k3 = Math.floor(serieNeutra.length / 3);
const terN = [0, 1, 2].map((i) => media((i < 2 ? serieNeutra.slice(i * k3, (i + 1) * k3) : serieNeutra.slice(2 * k3)).map((s) => s.ls)));
console.log(`   sentimiento NEUTRALIZADO por momento: n=${serieNeutra.length} días · ${media(vN) >= 0 ? "+" : ""}${media(vN).toFixed(4)} pts` +
  ` · t=${tUna(vN).toFixed(2)} · tercios ${terN.map((x) => (x >= 0 ? "+" : "") + x.toFixed(2)).join(" ")}`);
console.log(`   sin neutralizar era ${A.m >= 0 ? "+" : ""}${A.m.toFixed(4)} pts (t=${A.t.toFixed(2)})` +
  ` → el sentimiento conserva el ${((media(vN) / A.m) * 100).toFixed(0)}% de su separación al quitarle el momento`);

// ── dólares ────────────────────────────────────────────────────────────────────────────────
console.log(`\n── en dólares al año sobre $${CUENTA.toLocaleString("es-ES")} (rotación diaria, ~22 nombres por pata) ──`);
for (const [nom, r] of [["sentimiento solo", A], ["momento solo", B], ["sentimiento neutralizado", { m: media(vN), t: tUna(vN) }]]) {
  const bruto = (r.m / 100) * 252 * CUENTA;
  const peaje = (4 / 10000) * 252 * CUENTA * 2;
  console.log(`   ${nom.padEnd(26)} bruto $${bruto.toFixed(0).padStart(8)}/año · peaje −$${peaje.toFixed(0)} · NETO $${(bruto - peaje).toFixed(0).padStart(8)}/año   (t=${r.t.toFixed(2)})`);
}

fs.writeFileSync(path.join(RAIZ, "scripts/marketsnack/ing-sentimiento-4-salida.json"), JSON.stringify({
  pruebas: PRUEBAS, liston: LISTON, nFilas: filas.length, nDias: porDia.size,
  validacionAssetPrice: { p50: dif[Math.floor(dif.length * 0.5)], p90: dif[Math.floor(dif.length * 0.9)], n: dif.length },
  corrDeseMomento: { mediaPorDia: media(cDia), diasPositivos: cDia.filter((x) => x > 0).length, dias: cDia.length, global: corr(filas.map((f) => f.dese), filas.map((f) => f.mom)) },
  sentimiento: A, momento: B, neutralizado: { n: serieNeutra.length, m: media(vN), t: tUna(vN), ter: terN },
}, null, 1));
console.log(`\n   escrito ing-sentimiento-4-salida.json`);
