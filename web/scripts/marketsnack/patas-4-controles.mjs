// PATAS SUELTAS · PASO 4 — LOS CONTROLES DEL ÚNICO SUPERVIVIENTE
//
// Del paso 3 sólo queda una casilla viva: TAMAÑO |retorno| a 5 días, ordenando por el
// desequilibrio de las PATAS SUELTAS. +0,86 puntos de |retorno|, t=2,39 (listón 3,08), y el
// orden sueltas > todas > multi es el que predice el mecanismo.
//
// Antes de darle ningún valor hay que quitarle CUATRO explicaciones alternativas:
//
//   1. SOLAPAMIENTO. Con h=5 días y una observación por día, las ventanas comparten 4 de cada 5
//      días. La t calculada como si fueran independientes está inflada. Se recalcula con
//      Newey-West (retardo h−1) y además con submuestras SIN solapar (una de cada h días).
//
//   2. EL TICKER. El transversal dentro del día cancela el mercado, pero NO cancela el ticker:
//      TSLA se mueve el doble que KO todos los días. Si el flujo suelto de TSLA es siempre más
//      alcista, TSLA vive en el tercio alto y "predice" su propia volatilidad de siempre.
//      Se corrige de dos maneras: (a) |retorno| dividido por la volatilidad propia del ticker,
//      medida con los 60 cierres ANTERIORES al día de decidir; (b) la métrica convertida en
//      z-score contra la historia previa del PROPIO ticker.
//
//   3. LA SUBIDA. La ventana fue alcista. Ordenar por flujo alcista y medir |retorno| puede estar
//      cobrando sólo que lo que sube, sube. Se parte el |retorno| en su parte de subida y su
//      parte de bajada.
//
//   4. LA MÉTRICA CORRECTA PARA EL TAMAÑO. Un desequilibrio ALCISTA no es lo mismo que un
//      desequilibrio EXTREMO. Lo que debería predecir tamaño es la UNILATERALIDAD |dese|,
//      no su signo. Se mide también así.
//
// Uso: node --import tsx scripts/marketsnack/patas-4-controles.mjs [100k] [minOps]

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";

const NIVEL = process.argv[2] || "100k";
const MIN_OPS = Number(process.argv[3] || 5);
const MIN_TICKERS = 9;
const HOR = [1, 3, 5];
const VENTANA_VOL = 60;

const panel = JSON.parse(fs.readFileSync(path.resolve(`scripts/marketsnack/patas-2-panel-${NIVEL}.json`), "utf8"));
const CIERRES = path.resolve("scripts/cache-theta/cierres");
const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) {
  const t = f.replace(".json", "");
  const j = JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8"));
  const dias = Object.keys(j).sort();
  cierres.set(t, { j, dias, idx: new Map(dias.map((d, i) => [d, i])) });
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t1 = (a) => (a.length < 3 ? 0 : media(a) / (de(a) / Math.sqrt(a.length)));

/** t con error estándar Newey-West: corrige el solapamiento de ventanas. */
function tNW(a, retardo) {
  const n = a.length; if (n < 5) return 0;
  const m = media(a), u = a.map((x) => x - m);
  let s = u.reduce((s0, x) => s0 + x * x, 0) / n;
  for (let l = 1; l <= retardo; l++) {
    let c = 0;
    for (let i = l; i < n; i++) c += u[i] * u[i - l];
    s += 2 * (1 - l / (retardo + 1)) * (c / n);
  }
  if (!(s > 0)) return 0;
  return m / Math.sqrt(s / n);
}

// ── retornos, volatilidad propia SIN mirar al futuro, y descomposición ──
let sinVol = 0;
for (const f of panel) {
  const c = cierres.get(f.t); if (!c) continue;
  const key = f.d.replaceAll("-", "");
  const i = c.idx.get(key); if (i == null) continue;
  const p0 = c.j[c.dias[i]];

  // volatilidad diaria del ticker con los 60 cierres ANTERIORES al día de decidir.
  // Se usan i-60..i, o sea retornos que terminan en el cierre de HOY. Nada del futuro.
  if (i >= VENTANA_VOL) {
    const rs = [];
    for (let k = i - VENTANA_VOL + 1; k <= i; k++) rs.push((c.j[c.dias[k]] - c.j[c.dias[k - 1]]) / c.j[c.dias[k - 1]] * 100);
    f.vol = de(rs);
  } else { sinVol++; }

  for (const h of HOR) {
    const j = i + h; if (j >= c.dias.length) continue;
    const p1 = c.j[c.dias[j]];
    if (!(p0 > 0) || !(p1 > 0)) continue;
    const r = ((p1 - p0) / p0) * 100;
    f[`r${h}`] = r;
    f[`a${h}`] = Math.abs(r);
    f[`up${h}`] = Math.max(0, r);      // parte de subida
    f[`dn${h}`] = Math.max(0, -r);     // parte de bajada
    if (f.vol > 0) f[`z${h}`] = Math.abs(r) / (f.vol * Math.sqrt(h));   // |retorno| en unidades del propio ticker
  }
}

// ── z-score de la métrica contra la HISTORIA PREVIA del propio ticker (expanding, ≥15 obs) ──
const porTicker = new Map();
for (const f of [...panel].sort((a, b) => (a.d < b.d ? -1 : 1))) {
  if (!porTicker.has(f.t)) porTicker.set(f.t, []);
  const hist = porTicker.get(f.t);
  for (const [src, dst] of [["desSueltaE", "zSuelta"], ["desTodas", "zTodas"], ["desMultiE", "zMulti"]]) {
    const prev = hist.map((x) => x[src]).filter((x) => x != null);
    if (prev.length >= 15) {
      const s = de(prev);
      if (s > 0 && f[src] != null) f[dst] = (f[src] - media(prev)) / s;
    }
  }
  hist.push(f);
}
// unilateralidad
for (const f of panel) {
  if (f.desSueltaE != null) f.uniSuelta = Math.abs(f.desSueltaE);
  if (f.desTodas != null) f.uniTodas = Math.abs(f.desTodas);
  if (f.zSuelta != null) f.zUniSuelta = Math.abs(f.zSuelta);
}

const conRet = panel.filter((f) => f.r1 != null);
const usable = conRet.filter((f) => f.nSueltaE >= MIN_OPS && f.nTodas >= MIN_OPS && f.desSueltaE != null && f.desTodas != null);
const diasOk = new Map();
for (const f of usable) { if (!diasOk.has(f.d)) diasOk.set(f.d, []); diasOk.get(f.d).push(f); }
for (const [d, v] of [...diasOk]) if (v.length < MIN_TICKERS) diasOk.delete(d);

console.log(`═══ CONTROLES DEL SUPERVIVIENTE (TAMAÑO h=5, patas sueltas) ═══\n`);
console.log(`   celdas: ${[...diasOk.values()].flat().length}  ·  días: ${diasOk.size}  ·  sin volatilidad previa: ${sinVol}`);
const LISTON = listonT(24);
console.log(`   listón de |t|: ${LISTON}\n`);

function transversal(metrica, salida) {
  const obs = [];
  for (const [d, v] of diasOk) {
    const con = v.filter((f) => f[metrica] != null && f[salida] != null);
    if (con.length < MIN_TICKERS) continue;
    const ord = [...con].sort((a, b) => a[metrica] - b[metrica]);
    const k = Math.floor(ord.length / 3);
    obs.push({ d, v: media(ord.slice(-k).map((f) => f[salida])) - media(ord.slice(0, k).map((f) => f[salida])),
               alto: media(ord.slice(-k).map((f) => f[salida])), bajo: media(ord.slice(0, k).map((f) => f[salida])) });
  }
  return obs;
}

/** Submuestras sin solapar: se toma una observación de cada h y se promedian los h arranques. */
function tSinSolape(obs, h) {
  const v = obs.map((o) => o.v);
  const ts = [];
  for (let off = 0; off < h; off++) {
    const sub = v.filter((_, i) => (i - off) % h === 0);
    if (sub.length >= 5) ts.push({ t: t1(sub), n: sub.length });
  }
  if (!ts.length) return null;
  return { t: media(ts.map((x) => x.t)), n: media(ts.map((x) => x.n)), rango: [Math.min(...ts.map((x) => x.t)), Math.max(...ts.map((x) => x.t))] };
}

function linea(nom, met, sal, h) {
  const obs = transversal(met, sal);
  if (obs.length < 6) { console.log(`   ${nom.padEnd(46)} (sólo ${obs.length} días)`); return null; }
  const v = obs.map((o) => o.v);
  const bruto = t1(v), nw = tNW(v, Math.max(0, h - 1)), ss = tSinSolape(obs, h);
  console.log(`   ${nom.padEnd(46)} ${String(obs.length).padStart(3)}d  ` +
    `alto−bajo ${(media(v) >= 0 ? "+" : "") + media(v).toFixed(4).padStart(8)}   ` +
    `t=${bruto.toFixed(2).padStart(6)}   tNW=${nw.toFixed(2).padStart(6)}   ` +
    `t sin solape=${ss ? ss.t.toFixed(2).padStart(6) : "  —  "}${ss ? ` [${ss.rango[0].toFixed(2)}…${ss.rango[1].toFixed(2)}], n≈${ss.n.toFixed(0)}` : ""}`);
  return { media: media(v), t: bruto, tNW: nw, tSS: ss?.t ?? null, dias: obs.length };
}

const R = {};
console.log(`${"─".repeat(78)}\n1 · SOLAPAMIENTO — la misma casilla, con la t corregida\n`);
for (const h of HOR) {
  R[`sueltaE_a${h}`] = linea(`|retorno| ~ dese SUELTAS       h=${h}`, "desSueltaE", `a${h}`, h);
  R[`todas_a${h}`] = linea(`|retorno| ~ dese TODAS         h=${h}`, "desTodas", `a${h}`, h);
  R[`multi_a${h}`] = linea(`|retorno| ~ dese MULTI         h=${h}`, "desMultiE", `a${h}`, h);
  console.log("");
}

console.log(`${"─".repeat(78)}\n2 · EL TICKER — |retorno| en unidades de la volatilidad propia (60 días previos)\n`);
for (const h of HOR) {
  R[`sueltaE_z${h}`] = linea(`|ret|/vol propia ~ dese SUELTAS  h=${h}`, "desSueltaE", `z${h}`, h);
  R[`todas_z${h}`] = linea(`|ret|/vol propia ~ dese TODAS    h=${h}`, "desTodas", `z${h}`, h);
  console.log("");
}
console.log(`   y la métrica como z-score contra la historia del PROPIO ticker:\n`);
for (const h of HOR) {
  R[`zsuelta_a${h}`] = linea(`|retorno| ~ z(dese SUELTAS)      h=${h}`, "zSuelta", `a${h}`, h);
  R[`zsuelta_z${h}`] = linea(`|ret|/vol propia ~ z(dese SUELT) h=${h}`, "zSuelta", `z${h}`, h);
  console.log("");
}

console.log(`${"─".repeat(78)}\n3 · LA SUBIDA — el |retorno| partido en subida y bajada (ordenando por dese SUELTAS)\n`);
for (const h of HOR) {
  R[`up${h}`] = linea(`parte de SUBIDA                  h=${h}`, "desSueltaE", `up${h}`, h);
  R[`dn${h}`] = linea(`parte de BAJADA                  h=${h}`, "desSueltaE", `dn${h}`, h);
  R[`sig${h}`] = linea(`retorno con SIGNO                h=${h}`, "desSueltaE", `r${h}`, h);
  console.log("");
}

console.log(`${"─".repeat(78)}\n4 · UNILATERALIDAD |dese| — la métrica que de verdad debería predecir TAMAÑO\n`);
for (const h of HOR) {
  R[`uni_a${h}`] = linea(`|retorno| ~ |dese| SUELTAS       h=${h}`, "uniSuelta", `a${h}`, h);
  R[`uni_todas_a${h}`] = linea(`|retorno| ~ |dese| TODAS         h=${h}`, "uniTodas", `a${h}`, h);
  R[`uni_z${h}`] = linea(`|ret|/vol propia ~ |dese| SUELTAS h=${h}`, "uniSuelta", `z${h}`, h);
  R[`zuni_z${h}`] = linea(`|ret|/vol ~ |z(dese)| SUELTAS    h=${h}`, "zUniSuelta", `z${h}`, h);
  console.log("");
}

fs.writeFileSync(path.resolve(`scripts/marketsnack/patas-4-salida-${NIVEL}.json`), JSON.stringify(R, null, 1));
console.log(`escrito scripts/marketsnack/patas-4-salida-${NIVEL}.json`);
