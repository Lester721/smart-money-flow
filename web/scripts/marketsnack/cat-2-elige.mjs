// CATÁLOGO · PASO 2 — ¿EL FEED DE FLUJO *ELIGE* MEJOR QUE EL AZAR?
//
// La pregunta NO es "¿la señal predice el retorno de la acción?" (eso ya está muerto,
// 11 métricas agregadas por ticker-día). La pregunta es la del operador:
//
//   dentro de la ESQUINA BARATA (3–8% fuera del dinero, 60–120 días, salida a 23 días),
//   ¿comprar EL CONTRATO QUE ACABA DE APARECER EN LA CINTA rinde más que comprar
//   un contrato SORTEADO de esa misma esquina?
//
// PRECIOS REALES: se entra al ASK de la cadena de ese día y se sale al BID de la cadena
// de 23 días naturales después. Nunca punto medio, nunca Black-Scholes.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/cat-2-elige.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";
import { TRADE_CONDITIONS } from "../../lib/conditions.ts";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const SALIDA = path.resolve("scripts/marketsnack/cat-2-salida.json");

const CODE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));
const SUELTA = new Set(["AUTO", "ISOI", "SLAN", "SLAI", "SLCN", "SLCI", "SLFT", "REOP"]);
const MULTI = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MESL", "MASL", "MFSL"]);
const AL_ASK = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const AL_BID = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);

const OTM = [0.03, 0.08];
const DTE = [60, 120];
const HOLD = 23;          // días naturales
const TOL = 6;            // tolerancia para encontrar cadena de salida
const SOLAPE = 16;        // días de bolsa dentro de 23 naturales → factor de n efectiva

// ── datos de apoyo ───────────────────────────────────────────────────────────
const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) cierres.set(f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8")));

const diasCadena = new Map();
for (const f of fs.readdirSync(CADENAS)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
  if (!m) continue;
  if (!diasCadena.has(m[1])) diasCadena.set(m[1], new Set());
  diasCadena.get(m[1]).add(m[2]);
}
const UNIV = [...diasCadena.keys()].filter((t) => cierres.has(t)).sort();
const ES_UNIV = new Set(UNIV);

const cacheCadena = new Map();
function cadena(t, d) {
  const k = `${t}|${d}`;
  if (cacheCadena.has(k)) return cacheCadena.get(k);
  const p = path.join(CADENAS, `${t}_d${d}.json`);
  let v = null;
  if (fs.existsSync(p)) { try { v = JSON.parse(fs.readFileSync(p, "utf8")); } catch { v = null; } }
  if (cacheCadena.size > 3000) cacheCadena.clear();
  cacheCadena.set(k, v);
  return v;
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
function mas(d, n) { const x = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return ymd(x); }
function entre(a, b) { return Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000); }
function diaCadena(t, d, tol) { const s = diasCadena.get(t); if (!s) return null; for (let i = 0; i <= tol; i++) { const x = mas(d, i); if (s.has(x)) return x; } return null; }

/** [bid, ask] del contrato en la cadena del día, o null */
function cotiza(t, dia, venc, strike, tipo) {
  const c = cadena(t, dia); if (!c) return null;
  const e = c[venc]; if (!e) return null;
  const q = e[`${strike}|${tipo}`]; if (!q) return null;
  const [bid, ask] = q;
  if (!(ask > 0) || bid == null) return null;
  return [bid, ask];
}

/** todos los contratos de la esquina barata en la cadena de ese día */
function esquinaDe(t, dia, tipo) {
  const c = cadena(t, dia); if (!c) return [];
  const spot = cierres.get(t)?.[dia]; if (!(spot > 0)) return [];
  const out = [];
  for (const venc of Object.keys(c)) {
    const dte = entre(dia, venc);
    if (dte < DTE[0] || dte > DTE[1]) continue;
    for (const k of Object.keys(c[venc])) {
      const [sStr, tp] = k.split("|");
      if (tp !== tipo) continue;
      const strike = +sStr;
      const otm = tp === "C" ? (strike - spot) / spot : (spot - strike) / spot;
      if (otm < OTM[0] || otm > OTM[1]) continue;
      const [bid, ask] = c[venc][k];
      if (!(ask > 0) || bid == null) continue;
      out.push({ venc, strike, tipo: tp, bid, ask });
    }
  }
  return out;
}

// azar reproducible
let semilla = 20260820;
function rnd() { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; }

/** retorno real de comprar al ask hoy y vender al bid dentro de HOLD días */
function operar(t, dia, venc, strike, tipo) {
  const dIn = diaCadena(t, dia, 0); if (!dIn) return null;
  const qIn = cotiza(t, dIn, venc, strike, tipo); if (!qIn) return null;
  const dOut = diaCadena(t, mas(dia, HOLD), TOL); if (!dOut) return null;
  if (entre(dOut, venc) < 1) return null;               // vencería antes de salir
  const qOut = cotiza(t, dOut, venc, strike, tipo);
  const ask = qIn[1];
  const bid = qOut ? qOut[0] : 0;                        // sin cotización = vale 0, no se rellena
  if (!(ask >= 0.05)) return null;                       // contrato de céntimos: horquilla infinita
  return { ret: bid / ask - 1, ask, bid, dIn, dOut };
}

// ── recoger los eventos del feed ─────────────────────────────────────────────
const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const eventos = new Map();   // clave día|contrato -> mejor print

for (const NIVEL of ["100k", "1000k"]) {
  const DIR = path.resolve(`scripts/cache-theta/marketsnack/flujo-${NIVEL}`);
  if (!fs.existsSync(DIR)) continue;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".jsonl.gz")).sort()) {
    const dia = f.replace(".jsonl.gz", "").replace(/-/g, "");
    const inp = fs.createReadStream(path.join(DIR, f)).pipe(zlib.createGunzip());
    for await (const l of rl.createInterface({ input: inp })) {
      if (!l.trim()) continue;
      let x; try { x = JSON.parse(l); } catch { continue; }
      const m = P.exec(x.symbol ?? ""); if (!m) continue;
      const [, root, yy, tipo, str] = m;
      if (!ES_UNIV.has(root)) continue;
      const c = CODE.get(x.trade_condition_id);
      if (!c || (!SUELTA.has(c) && !MULTI.has(c))) continue;   // fuera basura y stock+opción
      const venc = `20${yy}`, strike = +str / 1000;
      const dte = entre(dia, venc);
      if (dte < DTE[0] || dte > DTE[1]) continue;
      let spot = x.asset_price ?? cierres.get(root)?.[dia];
      if (!(spot > 0)) continue;
      const otm = tipo === "C" ? (strike - spot) / spot : (spot - strike) / spot;
      if (otm < OTM[0] || otm > OTM[1]) continue;

      const k = `${dia}|${root}|${venc}|${strike}|${tipo}`;
      const prev = eventos.get(k);
      const ev = {
        dia, root, venc, strike: String(strike), tipo,
        prima: x.premium ?? 0, size: x.size ?? 0, side: x.side, cond: c,
        suelta: SUELTA.has(c), alAsk: AL_ASK.has(x.side), alBid: AL_BID.has(x.side),
        oi: x.open_interest ?? null, hora: x.timestamp,
      };
      if (!prev || ev.prima > prev.prima) eventos.set(k, ev);
    }
  }
}

// ── medir ────────────────────────────────────────────────────────────────────
const grupos = {};
function reg(g, fila) { (grupos[g] ??= []).push(fila); }

let intentos = 0, sinPrecio = 0;
for (const ev of eventos.values()) {
  intentos++;
  const r = operar(ev.root, ev.dia, ev.venc, ev.strike, ev.tipo);
  if (!r) { sinPrecio++; continue; }
  const fila = { ...ev, ret: r.ret, ask: r.ask, bid: r.bid };

  reg("TODO_EL_FEED", fila);
  if (ev.suelta && ev.alAsk) reg("SUELTA_AL_ASK", fila);
  if (ev.suelta && ev.alBid) reg("SUELTA_AL_BID", fila);
  if (!ev.suelta) reg("PATA_DE_SPREAD", fila);
  if (ev.suelta && ev.alAsk && ev.prima >= 1e6) reg("SUELTA_ASK_1M", fila);
  if (ev.suelta && ev.alAsk && ev.tipo === "C") reg("SUELTA_ASK_CALL", fila);
  if (ev.suelta && ev.alAsk && ev.tipo === "P") reg("SUELTA_ASK_PUT", fila);

  // ── CONTROL 1 · mismo ticker, mismo día, mismo tipo, CONTRATO SORTEADO ──
  const pool = esquinaDe(ev.root, r.dIn, ev.tipo);
  if (pool.length) {
    const c1 = pool[Math.floor(rnd() * pool.length)];
    const rc = operar(ev.root, ev.dia, c1.venc, String(c1.strike), c1.tipo);
    if (rc) reg("AZAR_CONTRATO", { ...fila, ret: rc.ret });
  }
  // ── CONTROL 2 · día y tipo iguales, TICKER SORTEADO ──
  for (let i = 0; i < 6; i++) {
    const t2 = UNIV[Math.floor(rnd() * UNIV.length)];
    const d2 = diaCadena(t2, ev.dia, 0); if (!d2) continue;
    const p2 = esquinaDe(t2, d2, ev.tipo); if (!p2.length) continue;
    const c2 = p2[Math.floor(rnd() * p2.length)];
    const rc = operar(t2, ev.dia, c2.venc, String(c2.strike), c2.tipo);
    if (rc) { reg("AZAR_TICKER", { ...fila, root: t2, ret: rc.ret }); }
    break;
  }
}

// ── estadística ──────────────────────────────────────────────────────────────
function media(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
function sd(a) { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }

/** t sobre la SERIE DIARIA (equipondera el día) — los prints del mismo día no son independientes */
function tDiario(filas) {
  const porDia = new Map();
  for (const f of filas) { (porDia.get(f.dia) ?? porDia.set(f.dia, []).get(f.dia)).push(f.ret); }
  const serie = [...porDia.entries()].sort().map(([d, v]) => ({ d, r: media(v), n: v.length }));
  if (serie.length < 4) return null;
  const r = serie.map((x) => x.r);
  const m = media(r), s = sd(r);
  return { media: m, t: m / (s / Math.sqrt(r.length)), dias: serie.length, nEf: serie.length / SOLAPE, serie };
}
function resumen(filas) {
  if (!filas || filas.length < 4) return null;
  const rets = filas.map((f) => f.ret);
  const td = tDiario(filas);
  const cuenta = new Map();
  for (const f of filas) cuenta.set(f.root, (cuenta.get(f.root) ?? 0) + 1);
  const may = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0];
  // tercios de tiempo
  const ord = [...filas].sort((a, b) => a.dia.localeCompare(b.dia));
  const k = Math.floor(ord.length / 3);
  const tercios = k >= 3 ? [0, 1, 2].map((i) => {
    const g = i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k);
    return { periodo: `${g[0].dia}→${g[g.length - 1].dia}`, n: g.length, media: media(g.map((x) => x.ret)) };
  }) : [];
  return {
    n: filas.length,
    mediaPrint: media(rets),
    ganadoras: rets.filter((x) => x > 0).length / rets.length,
    aCero: rets.filter((x) => x <= -0.999).length / rets.length,
    tDiario: td?.t ?? null, mediaDia: td?.media ?? null, dias: td?.dias ?? null, nEf: td?.nEf ?? null,
    tickerMayor: may ? { t: may[0], pct: may[1] / filas.length } : null,
    tercios,
  };
}

const res = {};
for (const [g, filas] of Object.entries(grupos)) res[g] = resumen(filas);

const CAP = 56389;
function dolares(r, capitalPorOp = 500) {
  if (!r) return null;
  const opsAno = (r.n / (res.TODO_EL_FEED?.dias ?? 1)) * 252;
  return { opsAno, dolaresAlAno: opsAno * capitalPorOp * r.mediaPrint, capitalComprometido: capitalPorOp * Math.max(1, opsAno / (252 / HOLD)) };
}

fs.writeFileSync(SALIDA, JSON.stringify({ eventos: eventos.size, intentos, sinPrecio, universo: UNIV, res }, null, 1));

console.log(`═══ ¿ELIGE EL FEED MEJOR QUE EL AZAR? · esquina ${OTM[0] * 100}–${OTM[1] * 100}% fuera · ${DTE[0]}–${DTE[1]} días · salida ${HOLD}d ═══`);
console.log(`   universo con cadena: ${UNIV.length} tickers — ${UNIV.join(" ")}`);
console.log(`   eventos únicos (día×contrato): ${eventos.size.toLocaleString("es-ES")}  ·  sin precio real: ${sinPrecio.toLocaleString("es-ES")}\n`);
const F = (x, d = 2) => x == null ? "  —  " : (x >= 0 ? "+" : "") + (x * 100).toFixed(d) + "%";
console.log(`grupo                 n     ret/op   gana   a cero   t(diario)  días   nEf   mayor ticker`);
for (const [g, r] of Object.entries(res)) {
  if (!r) { console.log(`${g.padEnd(18)}  (sin muestra)`); continue; }
  console.log(
    `${g.padEnd(18)} ${String(r.n).padStart(5)}  ${F(r.mediaPrint).padStart(8)}  ${(r.ganadoras * 100).toFixed(0).padStart(3)}%  ${(r.aCero * 100).toFixed(0).padStart(4)}%   ${(r.tDiario ?? 0).toFixed(2).padStart(7)}  ${String(r.dias).padStart(4)}  ${(r.nEf ?? 0).toFixed(1).padStart(4)}   ${r.tickerMayor.t} ${(r.tickerMayor.pct * 100).toFixed(0)}%`,
  );
}
console.log(`\n── TERCIOS DE TIEMPO (mismo signo o no) ──`);
for (const [g, r] of Object.entries(res)) {
  if (!r?.tercios?.length) continue;
  console.log(`   ${g.padEnd(18)} ${r.tercios.map((x) => F(x.media)).join("  ")}`);
}
console.log(`\n── DIFERENCIA CONTRA EL AZAR ──`);
for (const g of ["TODO_EL_FEED", "SUELTA_AL_ASK", "SUELTA_ASK_1M", "SUELTA_ASK_CALL", "SUELTA_ASK_PUT", "PATA_DE_SPREAD", "SUELTA_AL_BID"]) {
  const a = res[g], b = res.AZAR_CONTRATO, c = res.AZAR_TICKER;
  if (!a || !b) continue;
  console.log(`   ${g.padEnd(18)} vs azar-contrato ${F(a.mediaPrint - b.mediaPrint)}   vs azar-ticker ${F(a.mediaPrint - (c?.mediaPrint ?? 0))}`);
}
console.log(`\n   guardado en ${SALIDA}`);
