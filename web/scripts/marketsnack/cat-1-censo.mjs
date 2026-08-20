// CATÁLOGO · PASO 1 — CENSO DE EVENTOS POR HERRAMIENTA
//
// Antes de medir NADA: por cada herramienta que MarketSnack pone en pantalla, ¿cuántos
// eventos EJECUTABLES genera de verdad, y cuántos de ellos podemos medir con lo que
// tenemos en disco? Esta es la columna "muestra" del catálogo.
//
// La unidad es EL PRINT, no el promedio del día.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/cat-1-censo.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const SALIDA = path.resolve("scripts/marketsnack/cat-1-salida.json");

const CODE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));

// ── clasificación MECÁNICA de la condición (no la de MarketSnack) ────────────
// Lo que importa para leer un print como "opinión de alguien" es si el AGRESOR era
// una orden de una sola pata. MESL/MFSL/MASL/TESL/TASL/TFSL son órdenes MULTI-PATA
// que se ejecutan CONTRA cotizaciones de una pata: el print es una pata de spread.
const SUELTA = new Set(["AUTO", "ISOI", "SLAN", "SLAI", "SLCN", "SLCI", "SLFT", "REOP"]);
const MULTI = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MESL", "MASL", "MFSL"]);
const ACCION = new Set(["TLAT", "TLET", "TLCT", "TLFT", "TESL", "TASL", "TFSL"]); // stock+opción
const BASURA = new Set(["CANC", "CNCL", "CNCO", "CNOL", "OSEQ", "LATE", "OPEN", "OPNL", "MCTP", "EXHT"]);

function clase(id) {
  const c = CODE.get(id);
  if (!c) return "desconocida";
  if (BASURA.has(c)) return "basura";
  if (SUELTA.has(c)) return "suelta";
  if (MULTI.has(c)) return "multi";
  if (ACCION.has(c)) return "accion";
  return "desconocida";
}

// ── universo con cadena + cierre en disco ────────────────────────────────────
const conCierre = fs.readdirSync(CIERRES).map((f) => f.replace(".json", ""));
const cierres = new Map();
for (const t of conCierre) cierres.set(t, JSON.parse(fs.readFileSync(path.join(CIERRES, `${t}.json`), "utf8")));

// qué días de cadena hay por ticker (sólo el índice, no el contenido)
const diasCadena = new Map(); // ticker -> Set(YYYYMMDD)
for (const f of fs.readdirSync(CADENAS)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
  if (!m) continue;
  if (!diasCadena.has(m[1])) diasCadena.set(m[1], new Set());
  diasCadena.get(m[1]).add(m[2]);
}
const MEDIBLES = new Set([...diasCadena.keys()].filter((t) => cierres.has(t)));

const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");

function masDias(yyyymmdd, n) {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return ymd(d);
}
function diasEntre(a, b) {
  const A = Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6));
  const B = Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6));
  return Math.round((B - A) / 86400000);
}
/** primer día de cadena disponible en [dia, dia+tol] */
function cadenaCerca(t, dia, tol = 6) {
  const s = diasCadena.get(t);
  if (!s) return null;
  for (let i = 0; i <= tol; i++) { const d = masDias(dia, i); if (s.has(d)) return d; }
  return null;
}

// ── ESQUINA BARATA: 3–8% fuera del dinero, 60–120 días de plazo ──────────────
const CORNER_OTM = [0.03, 0.08];
const CORNER_DTE = [60, 120];
const SALIDA_DIAS = 23;

const acc = {
  total: 0, sinSymbol: 0, sinCond: 0,
  porNivel: {},
  clase: {}, side: {}, lado_x_clase: {},
  nulos: { antes: {}, despues: {} }, nAntes: 0, nDespues: 0,
  tickers: new Map(),
  hora: new Map(),
  // censo de la esquina barata
  esquina: { total: 0, medible: 0, conSalida: 0, suelta: 0, sueltaAsk: 0, sueltaAskMedible: 0, sueltaAskConSalida: 0 },
  esquinaDias: new Set(), esquinaTickers: new Map(),
  // rejilla plazo × distancia (censo, para saber dónde vive el flujo de verdad)
  rejilla: new Map(),
  primaTotal: 0,
};
const CAMPOS = ["asset_price", "delta", "gamma", "theta", "vega", "implied_volatility",
  "open_interest", "volume", "bid_price", "ask_price", "bid_size", "ask_size",
  "score", "sentiment", "side", "trade_condition_id", "exchange_id", "premium", "size", "price"];

const RUPTURA = "20260716";

for (const NIVEL of ["100k", "1000k"]) {
  const DIR = path.resolve(`scripts/cache-theta/marketsnack/flujo-${NIVEL}`);
  if (!fs.existsSync(DIR)) continue;
  const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort();
  acc.porNivel[NIVEL] = { dias: dias.length, n: 0, desde: dias[0]?.slice(0, 10), hasta: dias[dias.length - 1]?.slice(0, 10) };

  for (const f of dias) {
    const dia = f.replace(".jsonl.gz", "").replace(/-/g, "");
    const antes = dia < RUPTURA;
    if (antes) acc.nAntes++; else acc.nDespues++;
    const inp = fs.createReadStream(path.join(DIR, f)).pipe(zlib.createGunzip());
    for await (const l of rl.createInterface({ input: inp })) {
      if (!l.trim()) continue;
      let t; try { t = JSON.parse(l); } catch { continue; }
      acc.total++; acc.porNivel[NIVEL].n++;
      acc.primaTotal += t.premium ?? 0;

      const bolsa = antes ? acc.nulos.antes : acc.nulos.despues;
      for (const c of CAMPOS) { if (t[c] == null) bolsa[c] = (bolsa[c] ?? 0) + 1; }

      const cl = clase(t.trade_condition_id);
      if (t.trade_condition_id == null) acc.sinCond++;
      acc.clase[cl] = (acc.clase[cl] ?? 0) + 1;
      acc.side[t.side ?? "null"] = (acc.side[t.side ?? "null"] ?? 0) + 1;
      const k = `${cl}|${t.side ?? "null"}`;
      acc.lado_x_clase[k] = (acc.lado_x_clase[k] ?? 0) + 1;

      // hora ET (UTC-4 en verano)
      if (t.timestamp) {
        const h = new Date(t.timestamp); const et = (h.getUTCHours() - 4 + 24) % 24;
        const bucket = `${String(et).padStart(2, "0")}:${h.getUTCMinutes() < 30 ? "00" : "30"}`;
        acc.hora.set(bucket, (acc.hora.get(bucket) ?? 0) + 1);
      }

      const m = P.exec(t.symbol ?? "");
      if (!m) { acc.sinSymbol++; continue; }
      const [, root, yy, tipo, str] = m;
      const e = acc.tickers.get(root) ?? { n: 0, prima: 0 };
      e.n++; e.prima += t.premium ?? 0; acc.tickers.set(root, e);

      // ─ geometría del contrato: hace falta precio del subyacente ─
      const venc = `20${yy}`;
      const strike = +str / 1000;
      let spot = t.asset_price;
      if (spot == null && cierres.has(root)) spot = cierres.get(root)[dia] ?? null;
      if (spot == null || !(spot > 0)) continue;
      const dte = diasEntre(dia, venc);
      if (dte < 0) continue;
      const otm = tipo === "C" ? (strike - spot) / spot : (spot - strike) / spot;

      // rejilla censal
      const bDte = dte <= 7 ? "0-7" : dte <= 30 ? "8-30" : dte <= 60 ? "31-60" : dte <= 120 ? "61-120" : "121+";
      const bOtm = otm < -0.02 ? "ITM" : otm < 0.02 ? "ATM" : otm < 0.05 ? "2-5%" : otm < 0.10 ? "5-10%" : otm < 0.25 ? "10-25%" : "25%+";
      const rk = `${bDte}|${bOtm}`;
      const rv = acc.rejilla.get(rk) ?? { n: 0, prima: 0 };
      rv.n++; rv.prima += t.premium ?? 0; acc.rejilla.set(rk, rv);

      // ─ ESQUINA BARATA ─
      const enEsquina = otm >= CORNER_OTM[0] && otm <= CORNER_OTM[1] && dte >= CORNER_DTE[0] && dte <= CORNER_DTE[1];
      if (!enEsquina) continue;
      acc.esquina.total++;
      acc.esquinaDias.add(dia);
      acc.esquinaTickers.set(root, (acc.esquinaTickers.get(root) ?? 0) + 1);

      const medible = MEDIBLES.has(root) && cadenaCerca(root, dia, 0) != null;
      if (medible) acc.esquina.medible++;
      const salida = medible && cadenaCerca(root, masDias(dia, SALIDA_DIAS), 6) != null;
      if (salida) acc.esquina.conSalida++;

      if (cl === "suelta") {
        acc.esquina.suelta++;
        const alAsk = t.side === "ASKSIDE" || t.side === "ABOVE_ASK" || t.side === "AT_ASK";
        if (alAsk) {
          acc.esquina.sueltaAsk++;
          if (medible) acc.esquina.sueltaAskMedible++;
          if (salida) acc.esquina.sueltaAskConSalida++;
        }
      }
    }
  }
}

const out = {
  total: acc.total, primaTotal: acc.primaTotal, sinSymbol: acc.sinSymbol, sinCond: acc.sinCond,
  porNivel: acc.porNivel,
  diasAntesRuptura: acc.nAntes, diasDespuesRuptura: acc.nDespues,
  clase: acc.clase, side: acc.side, lado_x_clase: acc.lado_x_clase,
  nulosAntes: acc.nulos.antes, nulosDespues: acc.nulos.despues,
  topTickers: [...acc.tickers.entries()].sort((a, b) => b[1].prima - a[1].prima).slice(0, 25)
    .map(([t, e]) => ({ t, n: e.n, prima: e.prima, pctPrima: e.prima / acc.primaTotal, medible: MEDIBLES.has(t) })),
  hora: [...acc.hora.entries()].sort(),
  rejilla: [...acc.rejilla.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => ({ k, ...v })),
  esquina: acc.esquina,
  esquinaDias: acc.esquinaDias.size,
  esquinaTickers: [...acc.esquinaTickers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30),
  universoMedible: [...MEDIBLES].sort(),
  cadenaMax: Math.max(...[...diasCadena.values()].map((s) => Math.max(...[...s].map(Number)))),
};
fs.writeFileSync(SALIDA, JSON.stringify(out, null, 1));

// ── informe ──────────────────────────────────────────────────────────────────
const pc = (x, d = acc.total) => `${((x / d) * 100).toFixed(2)}%`;
console.log(`═══ CENSO · ${acc.total.toLocaleString("es-ES")} prints · prima $${(acc.primaTotal / 1e9).toFixed(1)}B ═══`);
for (const [k, v] of Object.entries(acc.porNivel)) console.log(`   ${k}: ${v.n.toLocaleString("es-ES")} prints · ${v.dias} días · ${v.desde} → ${v.hasta}`);
console.log(`\n── CLASE MECÁNICA DE LA CONDICIÓN ──`);
for (const [k, v] of Object.entries(acc.clase).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(12)} ${String(v).padStart(9)}  ${pc(v)}`);
console.log(`\n── LADO ──`);
for (const [k, v] of Object.entries(acc.side).sort((a, b) => b[1] - a[1])) console.log(`   ${k.padEnd(12)} ${String(v).padStart(9)}  ${pc(v)}`);
console.log(`\n── NULOS antes vs después del ${RUPTURA} ──`);
for (const c of CAMPOS) {
  const a = acc.nulosAntes?.[c] ?? acc.nulos.antes[c] ?? 0, d = acc.nulos.despues[c] ?? 0;
  if (a || d) console.log(`   ${c.padEnd(20)} antes ${String(a).padStart(8)}  después ${String(d).padStart(8)}`);
}
console.log(`\n── REJILLA plazo × distancia (dónde vive el flujo) ──`);
for (const r of out.rejilla.slice(0, 14)) console.log(`   ${r.k.padEnd(14)} n=${String(r.n).padStart(8)} ${pc(r.n)}  prima $${(r.prima / 1e9).toFixed(1)}B`);
console.log(`\n── TOP TICKERS por prima ──`);
for (const t of out.topTickers.slice(0, 12)) console.log(`   ${t.t.padEnd(7)} n=${String(t.n).padStart(7)} prima $${(t.prima / 1e9).toFixed(1)}B (${(t.pctPrima * 100).toFixed(1)}%)  ${t.medible ? "MEDIBLE" : "sin cadena"}`);
console.log(`\n═══ ESQUINA BARATA (${CORNER_OTM[0] * 100}–${CORNER_OTM[1] * 100}% fuera · ${CORNER_DTE[0]}–${CORNER_DTE[1]} días) ═══`);
console.log(`   prints en la esquina:        ${acc.esquina.total.toLocaleString("es-ES")}  (${pc(acc.esquina.total)} del flujo)`);
console.log(`   · con cadena de entrada:     ${acc.esquina.medible.toLocaleString("es-ES")}`);
console.log(`   · con cadena de salida +${SALIDA_DIAS}d: ${acc.esquina.conSalida.toLocaleString("es-ES")}   ← LO MEDIBLE HOY`);
console.log(`   de una sola pata:            ${acc.esquina.suelta.toLocaleString("es-ES")}`);
console.log(`   · suelta Y comprada al ask:  ${acc.esquina.sueltaAsk.toLocaleString("es-ES")}`);
console.log(`   · · medible (entrada):       ${acc.esquina.sueltaAskMedible.toLocaleString("es-ES")}`);
console.log(`   · · MEDIBLE ENTERA:          ${acc.esquina.sueltaAskConSalida.toLocaleString("es-ES")}   ← eventos de la regla`);
console.log(`   días distintos con esquina:  ${acc.esquinaDias.size}`);
console.log(`   última cadena en disco:      ${out.cadenaMax}`);
console.log(`\n   guardado en ${SALIDA}`);
