// ═══ GAMMA LADDER · PASO 2 — POR QUÉ NO CUADRA, Y CON QUÉ RECETA SÍ ════════════════════
//
// El paso 1 dejó la reconstrucción SUSPENDIDA: mis muros coinciden con los de MarketSnack sólo
// el 35% de las veces. Antes de medir un retorno con una escalera rota hay que saber por qué.
//
// LA SOSPECHA, mirando los ejemplos: AMD spot 530 y mi call wall en 600; INTC spot 96 y el mío
// en 120. Son strikes MUY lejos del dinero. Ahí la gamma por contrato es diminuta, así que sólo
// pueden dominar si el OI es enorme — y eso pasa en los VENCIMIENTOS LARGOS (LEAPs), que acumulan
// OI durante meses y tienen gamma casi plana. lib/gex.ts ya lo sabía: NEAR_SPOT_PCT = 0.2.
//
// Se prueban recetas cruzando dos cortes (ventana de strike × ventana de vencimiento) y se elige
// la que mejor reproduce los muros publicados por MarketSnack.
//
// ─── POR QUÉ ESTO NO ES MIRAR AL FUTURO ────────────────────────────────────────────────────
// La calibración se hace contra los MUROS QUE ELLOS PUBLICAN, no contra retornos. No entra en el
// preprocesado ninguna información del resultado que se va a medir después. Aun así se deja dicho:
// los 19 días de solape caen DENTRO del período de medición, así que la receta se elige por
// acuerdo estructural con una fuente independiente y se CONGELA antes de tocar un solo retorno.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-2-calibrar.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(BASE, "flujo-100k");
const GEXDIR = path.join(BASE, "aux", "gex", "2026-08-19");
const OCC = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const leer = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));

function parseOCC(sym) {
  const m = OCC.exec(sym);
  if (!m) return null;
  const y = 2000 + Number(m[2].slice(0, 2)), mo = Number(m[2].slice(2, 4)), da = Number(m[2].slice(4, 6));
  return { raiz: m[1], vencMs: Date.UTC(y, mo - 1, da), tipo: m[3], strike: Number(m[4]) / 1000 };
}

// ── muros publicados por MarketSnack ─────────────────────────────────────────────────────
const suyos = new Map(); // "T|fecha" -> punto
for (const fich of fs.readdirSync(GEXDIR)) {
  const T = fich.replace(".json.gz", "");
  for (const p of leer(path.join(GEXDIR, fich))["1m"]?.data ?? []) suyos.set(T + "|" + p.t.slice(0, 10), p);
}
const diasDisco = new Set(fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)));
const diasCmp = [...new Set([...suyos.keys()].map((k) => k.split("|")[1]))].sort().filter((d) => diasDisco.has(d));
console.log("dias de solape: " + diasCmp.length + "  (" + diasCmp[0] + " -> " + diasCmp[diasCmp.length - 1] + ")\n");

// ── carga cruda de esos días (una sola vez) ──────────────────────────────────────────────
const crudo = new Map(); // fecha -> Map(raiz -> {contratos:Map, spot})
for (const d of diasCmp) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  if (!txt) continue;
  const porT = new Map();
  for (const l of txt.split("\n")) {
    const f = JSON.parse(l);
    const o = parseOCC(f.symbol);
    if (!o) continue;
    if (f.gamma == null || !Number.isFinite(f.gamma) || f.open_interest == null || !(f.open_interest > 0)) continue;
    let a = porT.get(o.raiz);
    if (!a) { a = { c: new Map(), spots: [] }; porT.set(o.raiz, a); }
    a.c.set(f.symbol, { strike: o.strike, tipo: o.tipo, gamma: f.gamma, oi: f.open_interest, vencMs: o.vencMs });
    if (f.asset_price != null && f.asset_price > 0) a.spots.push(f.asset_price);
  }
  const salida = new Map();
  for (const [T, a] of porT) {
    if (!a.spots.length) continue;
    const s = a.spots.slice().sort((x, y) => x - y);
    salida.set(T, { spot: s[Math.floor(s.length / 2)], contratos: [...a.c.values()] });
  }
  crudo.set(d, salida);
}
console.log("dias cargados: " + crudo.size + "\n");

// ── recetas ──────────────────────────────────────────────────────────────────────────────
const VENT_STRIKE = [1.0, 0.30, 0.20, 0.10];       // ±% del spot (1.0 = sin corte)
const VENT_DIAS = [3650, 90, 45, 21, 8];           // vencimiento máximo en dias naturales

function evaluar(pctStrike, maxDias) {
  let n = 0, okC = 0, okP = 0, okS = 0, errC = 0, errP = 0, corrN = [];
  for (const d of diasCmp) {
    const dia = crudo.get(d);
    if (!dia) continue;
    const hoyMs = Date.parse(d + "T00:00:00Z");
    for (const [T, a] of dia) {
      const suyo = suyos.get(T + "|" + d);
      if (!suyo || suyo.call_wall == null || suyo.put_wall == null) continue;
      const S = a.spot;
      const strikes = new Map();
      let neto = 0;
      for (const c of a.contratos) {
        if (Math.abs(c.strike - S) / S > pctStrike) continue;
        if ((c.vencMs - hoyMs) / 86400000 > maxDias) continue;
        if (c.vencMs < hoyMs) continue;
        const g = c.gamma * c.oi * 100 * S * S * 0.01;
        let e = strikes.get(c.strike);
        if (!e) { e = { call: 0, put: 0 }; strikes.set(c.strike, e); }
        if (c.tipo === "C") e.call += g; else e.put += g;
        neto += (c.tipo === "C" ? g : -g);
      }
      if (strikes.size < 3) continue;
      let cw = null, cm = 0, pw = null, pm = 0;
      for (const [k, e] of strikes) {
        if (e.call > cm) { cm = e.call; cw = k; }
        if (e.put > pm) { pm = e.put; pw = k; }
      }
      if (cw == null || pw == null) continue;
      n++;
      const dc = Math.abs(cw - suyo.call_wall) / S, dp = Math.abs(pw - suyo.put_wall) / S;
      errC += dc; errP += dp;
      if (dc <= 0.02) okC++;
      if (dp <= 0.02) okP++;
      if (Math.sign(neto) === Math.sign(suyo.net_gex)) okS++;
      corrN.push([neto, suyo.net_gex]);
    }
  }
  // correlacion de Spearman entre mi gamma neta y la suya
  const rank = (v) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length); idx.forEach((p, i) => r[p[1]] = i); return r; };
  let rho = 0;
  if (corrN.length > 5) {
    const ra = rank(corrN.map((x) => x[0])), rb = rank(corrN.map((x) => x[1]));
    const m = (v) => v.reduce((a, b) => a + b, 0) / v.length;
    const ma = m(ra), mb = m(rb);
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
    rho = num / Math.sqrt(da * db);
  }
  return { n, okC: okC / n, okP: okP / n, okS: okS / n, errC: errC / n, errP: errP / n, rho };
}

console.log("RECETAS — acuerdo con los muros publicados por MarketSnack");
console.log("ventana strike  venc max     n     call<=2%   put<=2%   signo neto   err call   err put   rho(neto)");
console.log("─".repeat(104));
const todas = [];
for (const ps of VENT_STRIKE) {
  for (const md of VENT_DIAS) {
    const r = evaluar(ps, md);
    if (!r.n) continue;
    todas.push({ ps, md, ...r });
    console.log((ps === 1 ? "sin corte" : "+-" + (ps * 100).toFixed(0) + "%").padEnd(16) +
      (md >= 3650 ? "todos" : md + "d").padEnd(12) + String(r.n).padStart(6) +
      (r.okC * 100).toFixed(1).padStart(11) + "%" + (r.okP * 100).toFixed(1).padStart(9) + "%" +
      (r.okS * 100).toFixed(1).padStart(12) + "%" + (r.errC * 100).toFixed(2).padStart(11) + "%" +
      (r.errP * 100).toFixed(2).padStart(9) + "%" + r.rho.toFixed(3).padStart(11));
  }
}

const mejor = todas.slice().sort((a, b) => (b.okC + b.okP + b.okS) - (a.okC + a.okP + a.okS))[0];
console.log("\n" + "═".repeat(104));
console.log("MEJOR RECETA por acuerdo combinado: ventana de strike " + (mejor.ps === 1 ? "sin corte" : "+-" + (mejor.ps * 100).toFixed(0) + "%") +
  " · vencimiento <= " + (mejor.md >= 3650 ? "todos" : mejor.md + " dias"));
console.log("  call wall <=2%: " + (mejor.okC * 100).toFixed(1) + "%  ·  put wall <=2%: " + (mejor.okP * 100).toFixed(1) +
  "%  ·  signo de la gamma neta: " + (mejor.okS * 100).toFixed(1) + "%  ·  rho(neto) = " + mejor.rho.toFixed(3));

fs.writeFileSync(path.join("scripts", "marketsnack", "ladder-2-salida.json"), JSON.stringify({
  generado: new Date().toISOString(), diasSolape: diasCmp.length, recetas: todas, mejor,
}, null, 1));
console.log("\nguardado en scripts/marketsnack/ladder-2-salida.json");
