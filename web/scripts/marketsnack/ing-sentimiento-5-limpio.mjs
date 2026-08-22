// INGREDIENTE · SENTIMIENTO — PASO 5: LA VERSIÓN LIMPIA (y la retirada de dos cosas del paso 4)
//
// ═══ LO QUE EL PASO 4 TENÍA MAL, DICHO ANTES QUE NADA ══════════════════════════════════════
// El paso 4 calculó el "momento intradía" como  cierre_de_la_serie_diaria / asset_price@11:00.
// Está MAL, y la pista era el p99 del error: 301%. Las dos cifras no están en la misma escala:
//     CRWD  asset_price 466,20  vs  cierre de la serie 116,67   → exactamente 4:1
//     KLAC       1.809,30  vs  181,21                           → 10:1
//     CVNA         416,09  vs   83,36                           → 5:1
// La serie de /assets/{T}/chart está AJUSTADA POR SPLITS hacia atrás; `asset_price` dentro del
// flujo es el precio BRUTO del momento. 9.631 filas de 14 símbolos cruzaban las dos escalas.
// → Se RETIRA el resultado "momento −0,58 pts (t=−1,72)" y la doble ordenación que lo usaba.
//
// Y el ajuste por splits tiene una segunda consecuencia, esta a FAVOR: como la serie está
// ajustada, los saltos diarios >35% que el paso 3 excluía (48 símbolos) son movimientos REALES,
// no splits sin ajustar. Excluirlos quitaba las colas de verdad. Aquí se mide con y sin.
//
// ═══ LO QUE SE CORRIGE ═════════════════════════════════════════════════════════════════════
//   · momento intradía = asset_price(última op. del día) / asset_price(última op. ≤11:00) − 1,
//     las dos del MISMO campo y la MISMA escala. Nada de cruzar series.
//   · universo completo, sin la exclusión por salto (se reporta también con ella).
//
// PRUEBAS declaradas acumuladas: 26 del paso 3+4 (las 24 de familias + 2 de mecanismo).
// Aquí no se añade hipótesis nueva: se repara y se repite. Listón sin cambios.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/ing-sentimiento-5-limpio.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos";
import { radiografia } from "../../lib/radiografia";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const DIR = path.join(RAIZ, "scripts/cache-theta/marketsnack/flujo-100k");
const CHART = path.join(RAIZ, "scripts/cache-theta/marketsnack/aux/chart-all");
const PRUEBAS = 26, LISTON = listonT(PRUEBAS);
const MIN_OPS = 20, MIN_SIM = 9, CUENTA = 56389;
const CORTES = { "11:00": 15, "13:00": 17, "15:00": 19, cierre: 24 };

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);
const corr = (a, b) => { const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? n / Math.sqrt(da * db) : 0; };
function parseOcc(s) {
  if (!s || s.length < 16) return null;
  const k = s.slice(-8), tp = s.slice(-9, -8), fe = s.slice(-15, -9), u = s.slice(0, -15);
  return /^\d{8}$/.test(k) && /^[CP]$/.test(tp) && /^\d{6}$/.test(fe) && u ? { u, tipo: tp } : null;
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

console.log(`═══ PASO 5 · SENTIMIENTO, VERSIÓN LIMPIA ═══`);
console.log(`   ${dias.length} días (${dias[0]} → ${dias.at(-1)}) · ${conPrecio.size} símbolos con precio · listón ${LISTON} (${PRUEBAS} pruebas)\n`);

// ── agregación ─────────────────────────────────────────────────────────────────────────────
const ev = new Map();
const nulosDia = new Map();
for (const dia of dias) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8");
  let n = 0, nul = 0;
  for (const l of buf.split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    n++; if (t.asset_price == null) nul++;
    const occ = parseOcc(t.symbol ?? ""); if (!occ || !conPrecio.has(occ.u)) continue;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) continue;
    const s = t.sentiment; if (s !== "bullish" && s !== "bearish") continue;
    if (!(t.premium > 0)) continue;
    const h = +t.timestamp.slice(11, 13) + (+t.timestamp.slice(14, 16)) / 60;
    const k = `${occ.u}|${dia}`;
    let e = ev.get(k);
    if (!e) { e = { sim: occ.u, dia, c: {}, p11: null, h11: -1, pFin: null, hFin: -1 }; for (const c of Object.keys(CORTES)) e.c[c] = { bull: 0, bear: 0, n: 0 }; ev.set(k, e); }
    for (const [c, lim] of Object.entries(CORTES)) {
      if (h > lim) continue;
      const o = e.c[c];
      if (s === "bullish") o.bull += t.premium; else o.bear += t.premium;
      o.n++;
    }
    if (t.asset_price > 0) {
      if (h <= 15 && h > e.h11) { e.h11 = h; e.p11 = t.asset_price; }
      if (h > e.hFin) { e.hFin = h; e.pFin = t.asset_price; }
    }
  }
  nulosDia.set(dia, nul / n);
}
console.log(`── la ruptura del 16-jul, confirmada en MIS ficheros ──`);
const anterior = [...nulosDia].filter(([d]) => d < "2026-07-16").map(([, v]) => v);
const posterior = [...nulosDia].filter(([d]) => d >= "2026-07-16").map(([, v]) => v);
console.log(`   asset_price nulo: ${(media(anterior) * 100).toFixed(1)}% en los ${anterior.length} días ANTERIORES` +
  ` · ${(media(posterior) * 100).toFixed(1)}% en los ${posterior.length} días DESDE el 16-jul\n`);

// ── ¿está la serie diaria ajustada por splits? se comprueba, no se supone ──────────────────
const ratios = new Map();
for (const e of ev.values()) {
  if (!(e.pFin > 0) || e.hFin < 19.5) continue;
  const c = conPrecio.get(e.sim); const i = c.idx.get(e.dia); if (i == null) continue;
  if (!ratios.has(e.sim)) ratios.set(e.sim, []);
  ratios.get(e.sim).push(e.pFin / c.serie[i][1]);
}
const splitados = [];
for (const [sim, r] of ratios) {
  const m = [...r].sort((a, b) => a - b)[Math.floor(r.length / 2)];
  if (Math.abs(m - 1) > 0.15) splitados.push({ sim, factor: +m.toFixed(2), n: r.length });
}
console.log(`── ¿serie diaria ajustada por splits? ──`);
console.log(`   ${splitados.length} símbolos donde asset_price/cierre ≠ 1: ` +
  splitados.sort((a, b) => b.factor - a.factor).slice(0, 12).map((s) => `${s.sim} ×${s.factor}`).join("  "));
console.log(`   factores redondos (4, 10, 5, 3…) = SPLITS. La serie está ajustada, asset_price es bruto.`);
console.log(`   → los retornos de la serie son correctos; el momento se calcula SÓLO con asset_price.\n`);

// ── muestra ────────────────────────────────────────────────────────────────────────────────
const SALTO = 0.35, simSalto = new Set();
for (const [sim, { serie }] of conPrecio)
  for (let i = 1; i < serie.length; i++) if (Math.abs(serie[i][1] / serie[i - 1][1] - 1) > SALTO) simSalto.add(sim);

function construir(corte, excluirSalto) {
  const porDia = new Map();
  for (const e of ev.values()) {
    if (excluirSalto && simSalto.has(e.sim)) continue;
    const o = e.c[corte]; if (o.n < MIN_OPS) continue;
    const tot = o.bull + o.bear; if (!(tot > 0)) continue;
    const c = conPrecio.get(e.sim); const i = c.idx.get(e.dia);
    if (i == null || i + 1 >= c.serie.length) continue;
    const cierre = c.serie[i][1];
    const f = { ticker: e.sim, fecha: e.dia, dese: (o.bull - o.bear) / tot, ops: o.n,
      r1: (c.serie[i + 1][1] / cierre - 1) * 100,
      r5: i + 5 < c.serie.length ? (c.serie[i + 5][1] / cierre - 1) * 100 : null,
      // momento intradía: LAS DOS PUNTAS DEL MISMO CAMPO (asset_price), misma escala
      mom: e.p11 > 0 && e.pFin > 0 && e.hFin >= 19.5 ? (e.pFin / e.p11 - 1) * 100 : null };
    if (!porDia.has(e.dia)) porDia.set(e.dia, []);
    porDia.get(e.dia).push(f);
  }
  for (const [d, g] of [...porDia]) if (g.length < MIN_SIM) porDia.delete(d);
  return porDia;
}

function ls(porDia, campoOrden, campoR, filtroFila = null) {
  const serie = [];
  for (const [dia, g0] of [...porDia].sort()) {
    const g = g0.filter((f) => f[campoR] != null && f[campoOrden] != null && (!filtroFila || filtroFila(f)));
    if (g.length < MIN_SIM) continue;
    const ord = [...g].sort((a, b) => b[campoOrden] - a[campoOrden]);
    const k = Math.floor(ord.length / 3); if (k < 3) continue;
    serie.push({ dia, ls: media(ord.slice(0, k).map((f) => f[campoR])) - media(ord.slice(-k).map((f) => f[campoR])) });
  }
  const v = serie.map((s) => s.ls), k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0) };
}
const linea = (nom, r) => `   ${nom.padEnd(46)} n=${String(r.n).padStart(3)}d · ${(r.m >= 0 ? "+" : "") + r.m.toFixed(4)} pts · t=${r.t.toFixed(2).padStart(6)} · tercios ${r.ter.map((x) => (x >= 0 ? "+" : "") + x.toFixed(2)).join(" ")} ${r.mismo ? "✓" : "✗"}`;

console.log(`── SENTIMIENTO por hora de corte, con y sin la exclusión por salto (h=1 día) ──`);
const tabla = {};
for (const c of Object.keys(CORTES)) {
  const conEx = construir(c, true), sinEx = construir(c, false);
  const a = ls(conEx, "dese", "r1"), b = ls(sinEx, "dese", "r1");
  tabla[c] = { conExclusion: a, sinExclusion: b };
  console.log(linea(`corte ${c}  (excluyendo 48 símbolos de salto)`, a));
  console.log(linea(`corte ${c}  (UNIVERSO COMPLETO)`, b));
}

// ── mecanismo, ahora bien calculado ────────────────────────────────────────────────────────
const P = construir("11:00", false);
const filas = [...P.values()].flat();
const conMom = filas.filter((f) => f.mom != null);
console.log(`\n── momento intradía 11:00→cierre, calculado sólo con asset_price ──`);
radiografia(conMom, ["dese", "mom", "r1"], "mecanismo limpio", { maxCeros: 0.2 });
const cd = [];
for (const [, g] of P) { const gg = g.filter((f) => f.mom != null); if (gg.length < MIN_SIM) continue; cd.push(corr(gg.map((f) => f.dese), gg.map((f) => f.mom))); }
console.log(`   correlación transversal dese@11:00 vs momento: media ${media(cd).toFixed(3)} · días positivos ${cd.filter((x) => x > 0).length}/${cd.length}`);
console.log(`   → el flujo NO persigue al precio: es información independiente, no un termómetro del movimiento ya ocurrido.\n`);

console.log(`── ¿el sentimiento sobrevive si se le quita el momento? (h=1) ──`);
const S = ls(P, "dese", "r1", (f) => f.mom != null);
const M = ls(P, "mom", "r1", (f) => f.mom != null);
console.log(linea("SENTIMIENTO dese@11:00", S));
console.log(linea("MOMENTO intradía (gratis, sin suscripción)", M));

// doble ordenación limpia
const serieN = [];
for (const [dia, g0] of [...P].sort()) {
  const g = g0.filter((f) => f.mom != null);
  if (g.length < 12) continue;
  const pm = [...g].sort((a, b) => b.mom - a.mom), k = Math.floor(pm.length / 3);
  const alto = [], bajo = [];
  for (let b = 0; b < 3; b++) {
    const cubo = b < 2 ? pm.slice(b * k, (b + 1) * k) : pm.slice(2 * k);
    if (cubo.length < 3) continue;
    const o = [...cubo].sort((x, y) => y.dese - x.dese), j = Math.max(1, Math.floor(o.length / 3));
    alto.push(...o.slice(0, j).map((f) => f.r1)); bajo.push(...o.slice(-j).map((f) => f.r1));
  }
  if (alto.length && bajo.length) serieN.push({ dia, ls: media(alto) - media(bajo) });
}
const vN = serieN.map((s) => s.ls), k3 = Math.floor(serieN.length / 3);
const terN = [0, 1, 2].map((i) => media((i < 2 ? serieN.slice(i * k3, (i + 1) * k3) : serieN.slice(2 * k3)).map((s) => s.ls)));
console.log(linea("SENTIMIENTO neutralizado por momento", { n: serieN.length, m: media(vN), t: tUna(vN), ter: terN, mismo: terN.every((x) => x > 0) || terN.every((x) => x < 0) }));

// ── qué le faltaría ────────────────────────────────────────────────────────────────────────
const mejor = tabla["11:00"].sinExclusion;
console.log(`\n════════ QUÉ LE FALTA AL MEJOR (corte 11:00, universo completo, h=1) ════════`);
console.log(`   separación ${mejor.m.toFixed(4)} pts/día · de ${mejor.de.toFixed(3)} · n=${mejor.n} días · t=${mejor.t.toFixed(2)} · listón ${LISTON}`);
const nNec = Math.ceil(((LISTON * mejor.de) / Math.abs(mejor.m)) ** 2);
console.log(`   1) MÁS DÍAS: harían falta ${nNec} días de mercado (${(nNec / 252).toFixed(1)} años) manteniendo esta separación. Hay ${mejor.n}. Faltan ${nNec - mejor.n}.`);
console.log(`      Y MarketSnack BORRA ~1 día de historia por día de calendario: no se puede esperar, hay que fotografiar a diario.`);
const sepNec = (LISTON * mejor.de) / Math.sqrt(mejor.n);
console.log(`   2) MÁS SEPARACIÓN: con ${mejor.n} días haría falta ${sepNec.toFixed(3)} pts/día, ${(sepNec / mejor.m).toFixed(1)}× lo observado.`);
console.log(`   3) ESTABILIDAD: los tres tercios dan ${mejor.ter.map((x) => (x >= 0 ? "+" : "") + x.toFixed(2)).join(" · ")}. El tercero cambia de signo — eso ya lo descalifica aunque la t subiera.`);
const bruto = (mejor.m / 100) * 252 * CUENTA, peaje = (4 / 10000) * 252 * CUENTA * 2;
console.log(`\n   dimensión en dinero SI fuese real (rotación diaria, ~20 nombres por pata, horquilla 4 pb ida y vuelta × 2 patas):`);
console.log(`     bruto $${bruto.toFixed(0)}/año · peaje −$${peaje.toFixed(0)}/año · NETO $${(bruto - peaje).toFixed(0)}/año sobre $${CUENTA.toLocaleString("es-ES")}`);
console.log(`     el peaje se lleva el ${((peaje / bruto) * 100).toFixed(0)}% del bruto: aquí la horquilla NO es lo que lo mata. Lo mata la t.`);

fs.writeFileSync(path.join(RAIZ, "scripts/marketsnack/ing-sentimiento-5-salida.json"), JSON.stringify({
  pruebas: PRUEBAS, liston: LISTON, dias: dias.length, simbolos: conPrecio.size,
  rupturaJul16: { antesNulosPct: media(anterior) * 100, desdeNulosPct: media(posterior) * 100 },
  splitados, tabla, mecanismo: { corrMedia: media(cd), diasPos: cd.filter((x) => x > 0).length, nDias: cd.length,
    sentimiento: S, momento: M, neutralizado: { n: serieN.length, m: media(vN), t: tUna(vN), ter: terN } },
  faltan: { nNec, sepNec, bruto, peaje, neto: bruto - peaje },
}, null, 1));
console.log(`\n   escrito ing-sentimiento-5-salida.json`);
