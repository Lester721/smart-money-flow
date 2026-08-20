// ═══════════════════════════════════════════════════════════════════════════════════════════
// DÓLARES-GRIEGOS · SEGUNDA VUELTA — LA UNIDAD DE ANÁLISIS CORRECTA
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// La primera vuelta dio 0 de 18. Pero sus t están INFLADAS y hay que decirlo antes de usarlas
// para nada, ni siquiera para descartar:
//
//   · a +20 días, cada símbolo-día abre una ventana que se solapa con las 19 siguientes. 3.885
//     observaciones NO son 3.885 datos independientes: son ~60 días de señal, y de esos, sólo
//     ~3 ventanas de 20 días que no se pisan.
//   · dentro de un mismo día, los 116 símbolos suben y bajan juntos. Restar la media del día
//     quita el mercado, pero no la correlación que queda (sectores).
//
// La unidad correcta de una estrategia transversal es EL DÍA: cada día se construye UNA cartera
// (larga el tercio alto, corta el bajo) y se apunta UN número. Después se contrastan esos números
// entre sí. Eso da la t honesta, y además da directamente el rendimiento de la cartera, que es
// lo único que se puede traducir a dólares al año.
//
// Para +5 y +20 días se usan ventanas QUE NO SE SOLAPAN (una cada 5 y una cada 20 días).
//
// No son pruebas nuevas: son las mismas 18 hipótesis con el error estándar bien calculado.
// El listón sigue siendo listonT(18).
//
// Uso: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/medir-dolares-griegos-cartera.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { listonT } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const DIR_FLUJO = "scripts/cache-theta/marketsnack/flujo-100k";
const DIR_CHART = "scripts/cache-theta/marketsnack/aux/chart-all";
const CORTE = "19:00";
const HORIZONTES = [1, 5, 20];
const PRUEBAS = 18;
const MIN_OPS = 8, MIN_COB = 0.6, MIN_SIM = 15, VENTANA_Z = 20, MIN_Z = 10;
const SALTO = 0.25, ULTIMO_DIA = "2026-08-19";
const CUENTA = 56389;

const RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const VENTA = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t1 = (a) => (a.length < 3 || desv(a) === 0 ? 0 : media(a) / (desv(a) / Math.sqrt(a.length)));
const fmt = (x, d = 3) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

// ── precios ────────────────────────────────────────────────────────────────────────────────
const cierres = new Map(), idxF = new Map();
for (const f of fs.readdirSync(DIR_CHART)) {
  const T = f.replace(".json.gz", "");
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, f))).toString("utf8"));
  let s = (j.data || []).map((p) => ({ f: p.t.slice(0, 10), c: p.v })).filter((p) => p.c > 0).sort((a, b) => a.f.localeCompare(b.f)).filter((p) => p.f < ULTIMO_DIA);
  if (s.length < 30) continue;
  for (let i = 1; i < s.length; i++) if (Math.abs(s[i].c / s[i - 1].c - 1) > SALTO) s[i].salto = true;
  cierres.set(T, s); idxF.set(T, new Map(s.map((p, i) => [p.f, i])));
}
const sana = (s, i, h) => {
  if (i + h >= s.length) return false;
  for (let k = i + 1; k <= i + h; k++) if (s[k].salto) return false;
  const dd = (new Date(s[i + h].f) - new Date(s[i].f)) / 86400000;
  return dd > 0 && dd <= h * 1.55 + 6;
};

// ── flujo -> símbolo-día ───────────────────────────────────────────────────────────────────
const dias = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const agg = new Map(), primaTot = new Map();
for (const d of dias) {
  for (const l of zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, `${d}.jsonl.gz`))).toString("utf8").split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    if (!t.timestamp || t.timestamp.slice(11, 16) >= CORTE) continue;
    const m = RE.exec(t.symbol || ""); if (!m) continue;
    const raiz = m[1], ser = cierres.get(raiz); if (!ser) continue;
    const k = `${raiz}|${d}`;
    primaTot.set(k, (primaTot.get(k) ?? 0) + (t.premium > 0 ? t.premium : 0));
    if (!Number.isFinite(t.delta) || !Number.isFinite(t.gamma) || !(t.size > 0)) continue;
    const sgn = COMPRA.has(t.side) ? -1 : VENTA.has(t.side) ? +1 : 0; if (!sgn) continue;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) continue;
    const i = idxF.get(raiz).get(d); if (i == null || i < 1) continue;
    const S = ser[i - 1].c, ct = t.size * 100;
    let a = agg.get(k);
    if (!a) { a = { raiz, dia: d, dd: 0, dg: 0, absd: 0, absg: 0, n: 0, prima: 0 }; agg.set(k, a); }
    a.dd += sgn * t.delta * ct * S; a.dg += sgn * t.gamma * ct * S * S * 0.01;
    a.absd += Math.abs(t.delta) * ct * S; a.absg += t.gamma * ct * S * S * 0.01;
    a.n++; a.prima += t.premium > 0 ? t.premium : 0;
  }
}
const sd = [...agg.values()].filter((a) => a.n >= MIN_OPS && (primaTot.get(`${a.raiz}|${a.dia}`) ?? 0) > 0 && a.prima / primaTot.get(`${a.raiz}|${a.dia}`) >= MIN_COB);
for (const a of sd) { a.iDelta = a.absd > 0 ? a.dd / a.absd : null; a.iGamma = a.absg > 0 ? a.dg / a.absg : null; }
const porRaiz = new Map();
for (const a of sd) { if (!porRaiz.has(a.raiz)) porRaiz.set(a.raiz, []); porRaiz.get(a.raiz).push(a); }
for (const [, arr] of porRaiz) {
  arr.sort((x, y) => x.dia.localeCompare(y.dia));
  for (let i = 0; i < arr.length; i++) {
    const prev = arr.slice(Math.max(0, i - VENTANA_Z), i);
    if (prev.length < MIN_Z) { arr[i].zDelta = null; arr[i].zGamma = null; continue; }
    for (const [c, dst] of [["dd", "zDelta"], ["dg", "zGamma"]]) {
      const v = prev.map((p) => p[c]), s = desv(v);
      arr[i][dst] = s > 0 ? (arr[i][c] - media(v)) / s : null;
    }
  }
}
for (const a of sd) {
  const ser = cierres.get(a.raiz), i = idxF.get(a.raiz).get(a.dia); if (i == null) continue;
  for (const h of HORIZONTES) if (sana(ser, i, h)) a[`r${h}`] = (ser[i + h].c / ser[i].c - 1) * 100;
}
radiografia(sd.filter((a) => a.r1 != null), ["dd", "dg", "absd", "absg", "iDelta", "iGamma", "r1", "n"], "símbolo-día (2ª vuelta)");

const porDia = new Map();
for (const a of sd) { if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }
const diasOrd = [...porDia.keys()].sort();
console.log(`símbolo-día usables: ${sd.length}  ·  días: ${diasOrd.length}\n`);

// ── la cartera de cada día ─────────────────────────────────────────────────────────────────
const METRICAS = ["iDelta", "zDelta", "iGamma", "zGamma"];
const LISTON = listonT(PRUEBAS);

/** Rendimiento largo-corto de UN día: media(tercio alto) − media(tercio bajo). */
function carteraDelDia(arr, met, h, abs) {
  const con = arr.filter((a) => a[met] != null && Number.isFinite(a[met]) && a[`r${h}`] != null);
  if (con.length < MIN_SIM) return null;
  const ord = [...con].sort((x, y) => x[met] - y[met]);
  const k = Math.floor(ord.length / 3);
  const v = (g) => media(g.map((a) => (abs ? Math.abs(a[`r${h}`]) : a[`r${h}`])));
  return { sep: v(ord.slice(-k)) - v(ord.slice(0, k)), nSim: con.length };
}

console.log("═".repeat(100));
console.log("LA MISMA MEDICIÓN, CON LA UNIDAD CORRECTA: UN NÚMERO POR DÍA (o por ventana sin solape)");
console.log(`listón de |t| con ${PRUEBAS} pruebas: ${LISTON}`);
console.log("═".repeat(100));
console.log("métrica  obj   h   días  media/op    t      %aciertos  media anual   $/año s/cuenta  signo 3 tercios");

const salida = [];
for (const obj of ["x", "ax"]) {
  for (const met of METRICAS) {
    if (obj === "ax" && !met.includes("Gamma")) continue;
    for (const h of HORIZONTES) {
      // ventanas SIN SOLAPE: una de cada h días de señal
      const usados = diasOrd.filter((_, i) => i % h === 0);
      const serie = [];
      for (const d of usados) {
        const c = carteraDelDia(porDia.get(d), met, h, obj === "ax");
        if (c) serie.push({ dia: d, sep: c.sep, nSim: c.nSim });
      }
      if (serie.length < 5) { console.log(`${met.padEnd(8)} ${obj.padEnd(4)} ${String(h).padStart(2)}  muestra insuficiente (${serie.length} ventanas)`); continue; }
      const v = serie.map((x) => x.sep);
      const m = media(v), t = t1(v);
      const acierto = (100 * v.filter((x) => x > 0).length) / v.length;
      const porAno = (m / 100) * (252 / h);                                  // rendimiento anual del largo-corto
      const dolares = porAno * CUENTA;
      const k3 = Math.floor(serie.length / 3);
      const ter = [v.slice(0, k3), v.slice(k3, 2 * k3), v.slice(2 * k3)].map((g) => (media(g) >= 0 ? "+" : "−")).join("");
      console.log(
        `${met.padEnd(8)} ${obj.padEnd(4)} ${String(h).padStart(2)}  ${String(serie.length).padStart(4)}  ${fmt(m).padStart(8)}%  ${t.toFixed(2).padStart(6)}   ` +
        `${acierto.toFixed(0).padStart(5)}%      ${fmt(porAno * 100, 1).padStart(7)}%   ${(dolares >= 0 ? "+$" : "−$") + Math.abs(dolares).toFixed(0).padStart(6)}      ${ter}   ${Math.abs(t) >= LISTON ? "PASA" : ""}`,
      );
      salida.push({ met, obj, h, ventanas: serie.length, mediaOp: m, t, acierto, porAno, dolares, tercios: ter, serie });
    }
  }
}

// ── ¿cuánta muestra haría falta? ───────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(100));
console.log("QUÉ LE FALTA A CADA UNA PARA LLEGAR AL LISTÓN (misma media, más ventanas)");
console.log("═".repeat(100));
console.log("métrica  obj   h   t ahora  ventanas ahora   ventanas necesarias   días de mercado   meses de captura");
for (const s of salida) {
  if (s.t === 0) continue;
  const nec = Math.ceil(s.ventanas * (LISTON / Math.abs(s.t)) ** 2);
  const dias = nec * s.h;
  console.log(
    `${s.met.padEnd(8)} ${s.obj.padEnd(4)} ${String(s.h).padStart(2)}  ${s.t.toFixed(2).padStart(7)}  ${String(s.ventanas).padStart(14)}   ${String(nec).padStart(19)}   ${String(dias).padStart(15)}   ${(dias / 21).toFixed(0).padStart(16)}`,
  );
}

fs.writeFileSync("scripts/marketsnack/salida-dolares-griegos-cartera.json", JSON.stringify({ generado: new Date().toISOString(), LISTON, CUENTA, resultados: salida }, null, 1));
console.log("\nsalida: scripts/marketsnack/salida-dolares-griegos-cartera.json");
