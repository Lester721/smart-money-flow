// CATÁLOGO · PASO 8 — LOS DÓLARES, con precios reales de la cadena (nada estimado).
//
// Traduce las dos reglas candidatas a $/año sobre $56.389, diciendo cuánto capital
// se compromete. El coste por operación sale del ASK REAL de cada contrato, no de una media
// inventada.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/cat-8-dolares.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const CODE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));
const SUELTA = new Set(["AUTO", "ISOI", "SLAN", "SLAI", "SLCN", "SLCI", "SLFT", "REOP"]);
const MULTI = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MESL", "MASL", "MFSL"]);
const AL_ASK = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const HOLD = 23, TOL = 6, CAP = 56389;
const OTM = [0.03, 0.08], DTE = [60, 120];

const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) cierres.set(f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8")));
const diasCadena = new Map();
for (const f of fs.readdirSync(CADENAS)) { const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!m) continue; if (!diasCadena.has(m[1])) diasCadena.set(m[1], new Set()); diasCadena.get(m[1]).add(m[2]); }
const ES_UNIV = new Set([...diasCadena.keys()].filter((t) => cierres.has(t)));
const cache = new Map();
function cadena(t, d) { const k = `${t}|${d}`; if (cache.has(k)) return cache.get(k); const p = path.join(CADENAS, `${t}_d${d}.json`); let v = null; if (fs.existsSync(p)) { try { v = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} } if (cache.size > 3000) cache.clear(); cache.set(k, v); return v; }
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const mas = (d, n) => { const x = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
const entre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000);
function diaCad(t, d, tol) { const s = diasCadena.get(t); if (!s) return null; for (let i = 0; i <= tol; i++) { const x = mas(d, i); if (s.has(x)) return x; } return null; }
function cot(t, d, v, s, tp) { const q = cadena(t, d)?.[v]?.[`${s}|${tp}`]; if (!q) return null; const [b, a] = q; return a > 0 && b != null ? [b, a] : null; }

const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const ev = new Map();
for (const NIVEL of ["100k", "1000k"]) {
  const DIR = path.resolve(`scripts/cache-theta/marketsnack/flujo-${NIVEL}`);
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".jsonl.gz")).sort()) {
    const dia = f.replace(".jsonl.gz", "").replace(/-/g, "");
    const inp = fs.createReadStream(path.join(DIR, f)).pipe(zlib.createGunzip());
    for await (const l of rl.createInterface({ input: inp })) {
      if (!l.trim()) continue;
      let x; try { x = JSON.parse(l); } catch { continue; }
      const m = P.exec(x.symbol ?? ""); if (!m) continue;
      const [, root, yy, tipo, str] = m;
      if (!ES_UNIV.has(root)) continue;
      const c = CODE.get(x.trade_condition_id); if (!c || (!SUELTA.has(c) && !MULTI.has(c))) continue;
      const venc = `20${yy}`, strike = +str / 1000, dte = entre(dia, venc);
      if (dte < DTE[0] || dte > DTE[1]) continue;
      const spot = x.asset_price ?? cierres.get(root)?.[dia]; if (!(spot > 0)) continue;
      const otm = tipo === "C" ? (strike - spot) / spot : (spot - strike) / spot;
      if (otm < OTM[0] || otm > OTM[1]) continue;
      const k = `${dia}|${root}|${venc}|${strike}|${tipo}`;
      const cand = { dia, root, venc, strike: String(strike), tipo, prima: x.premium ?? 0, suelta: SUELTA.has(c), alAsk: AL_ASK.has(x.side) };
      const p = ev.get(k); if (!p || cand.prima > p.prima) ev.set(k, cand);
    }
  }
}

const filas = [];
for (const e of ev.values()) {
  const dIn = diaCad(e.root, e.dia, 0); if (!dIn) continue;
  const qIn = cot(e.root, dIn, e.venc, e.strike, e.tipo); if (!qIn || !(qIn[1] >= 0.05)) continue;
  const dOut = diaCad(e.root, mas(e.dia, HOLD), TOL); if (!dOut || entre(dOut, e.venc) < 1) continue;
  const qOut = cot(e.root, dOut, e.venc, e.strike, e.tipo); if (!qOut) continue;
  filas.push({ ...e, ask: qIn[1], ret: qOut[0] / qIn[1] - 1 });
}

const media = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const DIAS = new Set(filas.map((f) => f.dia)).size;
function dinero(nombre, g, opsPorSemana) {
  if (!g.length) return console.log(`${nombre}: sin muestra`);
  const costeMedio = media(g.map((f) => f.ask)) * 100;
  const ret = media(g.map((f) => f.ret));
  const señalesAlAno = (g.length / DIAS) * 252;
  const ops = opsPorSemana != null ? opsPorSemana * 52 : señalesAlAno;
  const simult = ops / (252 / HOLD);
  const capital = costeMedio * simult;
  const dol = ops * costeMedio * ret;
  console.log(
    `${nombre.padEnd(34)} n=${String(g.length).padStart(4)}  señales/año ${String(Math.round(señalesAlAno)).padStart(5)}  ` +
    `coste/op $${costeMedio.toFixed(0).padStart(5)}  ret/op ${(ret * 100).toFixed(2).padStart(7)}%  ` +
    `ops/año ${String(Math.round(ops)).padStart(4)}  capital $${Math.round(capital).toLocaleString("es-ES").padStart(7)} (${(capital / CAP * 100).toFixed(0)}%)  ` +
    `${dol >= 0 ? "+" : "−"}$${Math.abs(Math.round(dol)).toLocaleString("es-ES")}/año`,
  );
  return { n: g.length, costeMedio, ret, señalesAlAno, ops, capital, dolaresAlAno: dol };
}

console.log(`═══ DÓLARES CON PRECIOS REALES · ${filas.length} eventos · ${DIAS} sesiones · $${CAP.toLocaleString("es-ES")} ═══\n`);
console.log(`(“señales/año” = cuántas veces salta la regla · “ops/año” = cuántas se toman)\n`);
const R = {};
R.feedTodo = dinero("FEED · todo, esquina barata", filas, 2);
R.feedSueltaAsk = dinero("FEED · 1 pata, al ask", filas.filter((f) => f.suelta && f.alAsk), 2);
R.feedSueltaAsk1M = dinero("FEED · 1 pata, al ask, ≥$1M", filas.filter((f) => f.suelta && f.alAsk && f.prima >= 1e6), 2);
R.feedSueltaNoAsk1M = dinero("CONTROL · 1 pata, NO al ask, ≥$1M", filas.filter((f) => f.suelta && !f.alAsk && f.prima >= 1e6), 2);
R.feedSpread1M = dinero("CONTROL · pata de spread ≥$1M", filas.filter((f) => !f.suelta && f.prima >= 1e6), 2);
console.log("");
R.todasSeñales = dinero("FEED · 1 pata al ask, TODAS", filas.filter((f) => f.suelta && f.alAsk), null);

fs.writeFileSync(path.resolve("scripts/marketsnack/cat-8-salida.json"), JSON.stringify({ dias: DIAS, n: filas.length, R }, null, 1));
console.log(`\n   guardado en scripts/marketsnack/cat-8-salida.json`);
