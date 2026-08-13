// EL CREDIT SPREAD DE 5 DÍAS, CON PRECIOS REALES.
//
// Es la prueba que más importa del proyecto. La estrategia principal —Top⅓ EVA + IV/rv<1,1, 5d
// a 1σ, ~13%/año— está valorada con Black-Scholes y volatilidad realizada, exactamente el mismo
// modelo que acaba de inflar el 0DTE de −0,71% a +8,08%.
//
// Si aquí pasa lo mismo, el número que llevamos meses dando no existe.
// Si aguanta, es lo primero del proyecto que sobrevive sin muletas de modelo.
//
// QUÉ BAJA: para cada señal, el bid/ask de las DOS patas al CIERRE del día de entrada (que es
// cuando el backtest abre la posición). Dos peticiones por señal.
//
// Uso: node --import tsx scripts/cs-precios-reales.ts [ticker...]

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, barIdxOnOrAfter, type DBar, type Signal } from "../lib/backtestCore";
// ⛔ resultado NO válido: valora con modelo. Ver PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS.ts
import { bsPriceHistorico as bsPrice } from "../lib/PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta";
const TICKERS = (process.argv.slice(2).length ? process.argv.slice(2) : ["SPY", "QQQ", "AAPL", "MSFT", "NVDA"]);
const DTE = 5, SIGMA = 1;
// COMM: Robinhood no cobra comision por opciones, solo tasas regulatorias (~$0,03 por
// contrato). Poner $0,65 era asumir un broker tradicional y restaba ~2,2 puntos de riesgo que
// Lester NO paga. Lo detecto el, no yo.
const RIESGO = 1200, COMM = Number(process.env.CS_COMM ?? 0.03), CATASTROFE = -0.5;
const CONC = 4;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const ymdDe = (iso: string) => iso.replace(/-/g, "");

async function pMap<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** bid/ask al CIERRE del día `fecha` para ese contrato. null si no cotizó. */
async function quoteCierre(sym: string, exp: string, strike: number, right: "C" | "P", fecha: string): Promise<[number, number] | null> {
  const url = `${BASE}/v3/option/history/quote?symbol=${sym}&expiration=${exp}&date=${fecha}&interval=1h&strike=${strike}&right=${right}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return null;
    const l = (await r.text()).trim().split("\n");
    if (l.length < 2) return null;
    const h = l[0].split(",").map((x) => x.trim());
    const iB = h.indexOf("bid"), iA = h.indexOf("ask");
    if (iB < 0 || iA < 0) return null;
    for (let j = l.length - 1; j >= 1; j--) {          // el último con cotización = el cierre
      const c = l[j].split(",");
      const b = Number(c[iB]), a = Number(c[iA]);
      if (b > 0 && a > 0 && a >= b) return [b, a];
    }
  } catch { /* cae a null */ }
  return null;
}

interface Op { ms: number; ticker: string; ret: number; retModelo: number; retComprador: number; spreadRel: number; debito?: number }

// Los strikes REALES de cada expiración. Redondear a $1 fue un error grave: SPY cotiza de $1 en
// $1, pero AAPL/MSFT/NVDA/TSLA van de $2,50 o $5 en $5 lejos del dinero. Pedir strikes
// inexistentes daba 0-3% de cobertura en las acciones y un resultado agregado que era, en la
// practica, solo SPY+QQQ. Aqui se piden los listados y se ajusta al mas cercano.
const cacheStrikes = new Map<string, number[]>();
async function strikesDe(sym: string, exp: string): Promise<number[]> {
  const k = `${sym}|${exp}`;
  const hit = cacheStrikes.get(k);
  if (hit) return hit;
  let out: number[] = [];
  try {
    const r = await fetch(`${BASE}/v3/option/list/strikes?symbol=${sym}&expiration=${exp}`, { signal: AbortSignal.timeout(45_000) });
    if (r.ok) {
      const l = (await r.text()).trim().split("\n");
      const h = l[0].split(",").map((x) => x.trim());
      const iK = h.indexOf("strike");
      if (iK >= 0) out = l.slice(1).map((x) => Number((x.split(",")[iK] ?? "").replace(/"/g, ""))).filter((x) => x > 0).sort((a, b) => a - b);
    }
  } catch { /* lista vacia */ }
  cacheStrikes.set(k, out);
  return out;
}
const masCercano = (ks: number[], x: number) => ks.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), ks[0]);

// Las expiraciones REALES. Segundo error del mismo tipo: yo pedia el dia habil a +5, pero las
// acciones solo vencen los VIERNES. SPY y QQQ vencen casi a diario, asi que el agregado salia
// otra vez siendo solo SPY+QQQ disfrazado de 8 tickers. Aqui se pide la lista y se toma la
// primera expiracion EN O DESPUES del objetivo.
const cacheExp = new Map<string, string[]>();
async function expiracionesDe(sym: string): Promise<string[]> {
  const hit = cacheExp.get(sym);
  if (hit) return hit;
  let out: string[] = [];
  try {
    const r = await fetch(`${BASE}/v3/option/list/expirations?symbol=${sym}`, { signal: AbortSignal.timeout(60_000) });
    if (r.ok) {
      const l = (await r.text()).trim().split(String.fromCharCode(10));
      const h = l[0].split(",").map((x) => x.trim());
      const iE = h.indexOf("expiration");
      if (iE >= 0) out = l.slice(1).map((x) => (x.split(",")[iE] ?? "").replace(/[\"-]/g, "")).filter((x) => x.length === 8).sort();
    }
  } catch { /* vacia */ }
  cacheExp.set(sym, out);
  return out;
}

(async () => {
  const todas: Op[] = [];
  const resumen: string[] = [];

  for (const t of TICKERS) {
    const cache = `${DIR}/${t}_qcs5_.json`;
    const yaCache = existsSync(cache) ? (leer<Record<string, [number, number][]>>(cache) ?? {}) : {};

    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    }
    if (bars.length < 300 || !trades.length) { resumen.push(`${t}: sin datos`); continue; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    // Solo desde 2022: antes las cadenas son más pobres y la descarga se dispara sin aportar.
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k)
      .filter((s) => s.ivRatio < 1.1 && bars[s.entryIdx].time >= "2022-01-01");
    if (!top.length) { resumen.push(`${t}: sin señales desde 2022`); continue; }

    // Para cada señal: strikes reales (redondeados) y la expiración listada más cercana a +5d.
    interface Tarea { sig: Signal; fecha: string; exp: string; kC: number; kL: number; tipo: "C" | "P"; expIdx: number }
    const tareas: Tarea[] = [];
    let sinStrikes = 0;
    for (const sig of top) {
      const em = sig.spot * sig.rv * Math.sqrt(DTE / 365);
      if (!(em > 0)) continue;
      const bull = sig.dir === 1;
      // Objetivo: +5 dias naturales. La expiracion es la primera LISTADA en o despues.
      const objetivoYmd = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const exps = await expiracionesDe(t);
      const exp = exps.find((e) => e >= objetivoYmd);
      if (!exp) { sinStrikes++; continue; }
      // Y el indice de la barra de ESA expiracion, para liquidar el dia correcto.
      const expIso = `${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`;
      const expIdx = barIdxOnOrAfter(bars, Date.parse(`${expIso}T20:00:00Z`));
      if (expIdx < 0) { sinStrikes++; continue; }
      const ks = await strikesDe(t, exp);
      if (ks.length < 5) { sinStrikes++; continue; }
      const kC = masCercano(ks, bull ? sig.spot - SIGMA * em : sig.spot + SIGMA * em);
      // La pata larga: el strike listado mas cercano a 0,5em de distancia, pero que NO sea el
      // mismo que el corto. Si el incremento es grueso, el ancho real sale mayor de lo pedido —
      // y eso es correcto: es lo que se podria operar de verdad.
      const objetivo = bull ? kC - WIDTH_EM * em : kC + WIDTH_EM * em;
      const candidatos = ks.filter((k) => (bull ? k < kC : k > kC));
      if (!candidatos.length) { sinStrikes++; continue; }
      const kL = masCercano(candidatos, objetivo);
      if (kC === kL || kL <= 0) { sinStrikes++; continue; }
      tareas.push({ sig, fecha: ymdDe(bars[sig.entryIdx].time), exp, kC, kL, tipo: bull ? "P" : "C", expIdx });
    }
    if (sinStrikes) console.log(`  ${t}: ${sinStrikes} señales sin cadena utilizable`);

    const t0 = Date.now();
    let bajadas = 0;
    const res = await pMap(tareas, CONC, async (x) => {
      const clave = `${x.fecha}|${x.exp}|${x.kC}|${x.kL}|${x.tipo}`;
      if (yaCache[clave]) return { x, q: yaCache[clave] };
      const [q1, q2] = await Promise.all([
        quoteCierre(t, x.exp, x.kC, x.tipo, x.fecha),
        quoteCierre(t, x.exp, x.kL, x.tipo, x.fecha),
      ]);
      bajadas++;
      if (bajadas % 60 === 0) process.stdout.write(`\r  ${t}: ${bajadas}/${tareas.length}…`);
      if (!q1 || !q2) return { x, q: null };
      const par: [number, number][] = [q1, q2];
      yaCache[clave] = par;
      return { x, q: par };
    });
    writeFileSync(cache, JSON.stringify(yaCache), "utf8");

    const ops: Op[] = [];
    for (const { x, q } of res) {
      if (!q) continue;
      const [[b1, a1], [b2, a2]] = q;
      const credito = (b1 + a1) / 2 - (b2 + a2) / 2 - (COMM * 2) / 100;   // llenado al punto medio
      const ancho = Math.abs(x.kL - x.kC);
      const riesgo = ancho - credito;
      if (!(credito > 0) || !(riesgo > 0)) continue;
      const sExp = bars[x.expIdx].close;
      const bull = x.sig.dir === 1;
      const perd = bull
        ? Math.max(x.kC - sExp, 0) - Math.max(x.kL - sExp, 0)
        : Math.max(sExp - x.kC, 0) - Math.max(sExp - x.kL, 0);
      // DESCOMPOSICION: el MISMO spread (mismos strikes reales, mismo vencimiento) valorado con
      // Black-Scholes. Compararlo contra el precio real separa dos cosas que cambie a la vez:
      // cuanto pierde la estrategia por los PRECIOS y cuanto por la REJILLA de strikes.
      const T = (bars[x.expIdx].close && x.expIdx > x.sig.entryIdx)
        ? (x.expIdx - x.sig.entryIdx) / 252 : DTE / 365;
      const tipoBs = bull ? "put" : "call";
      const credMod = bsPrice(x.sig.spot, x.kC, T, x.sig.rv, tipoBs) - bsPrice(x.sig.spot, x.kL, T, x.sig.rv, tipoBs) - (COMM * 2) / 100;
      const riesgoMod = ancho - credMod;
      const retMod = credMod > 0 && riesgoMod > 0 ? (credMod - perd) / riesgoMod : NaN;
      // EL LADO CONTRARIO. Si vender pierde porque el mercado paga POCA prima, comprar deberia
      // ganar. El comprador paga el ask de la pata que compra y cobra el bid de la que vende —
      // asi que NO es simplemente -ret: paga su propio spread. Se calcula de verdad.
      const debito = a1 - b2 + (COMM * 2) / 100;          // compra la cercana, vende la lejana
      const retComp = debito > 0 ? (perd - debito) / debito : NaN;
      ops.push({ ms: x.sig.entryMs, ticker: t, ret: (credito - perd) / riesgo, retModelo: retMod, retComprador: retComp, debito, spreadRel: (a1 - b1) / ((a1 + b1) / 2) });
    }
    todas.push(...ops);
    resumen.push(`  ${t}: ${ops.length}/${tareas.length} señales con quotes · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    console.log(`\r${resumen[resumen.length - 1]}`);
  }

  console.log(`\n## CREDIT SPREAD 5d CON PRECIOS REALES · ${todas.length} operaciones (desde 2022)\n`);
  if (todas.length < 150) { console.log("muestra insuficiente"); return; }
  todas.sort((a, b) => a.ms - b.ms);

  const años = (a: Op[]) => (a[a.length - 1].ms - a[0].ms) / (365.25 * 86_400_000);
  const linea = (a: Op[], campo: "ret" | "retModelo" | "retComprador" = "ret") => {
    const r = a.map((x) => x[campo]).filter((x) => Number.isFinite(x)), m = media(r) * 100;
    return { n: a.length, m, cat: (r.filter((x) => x <= CATASTROFE).length / a.length) * 100, porAño: (a.length / años(a)) * (m / 100) * RIESGO };
  };
  const mid = Math.floor(todas.length / 2);
  console.log("| Tramo | n | Media | Catástrofes | $/año |");
  console.log("|---|---|---|---|---|");
  for (const [nom, sub] of [["COMPLETO", todas], ["vieja", todas.slice(0, mid)], ["nueva", todas.slice(mid)]] as const) {
    const r = linea(sub as Op[]);
    console.log(`| ${nom} | ${r.n} | ${r.m >= 0 ? "+" : ""}${r.m.toFixed(2)}% | ${r.cat.toFixed(1)}% | $${Math.round(r.porAño).toLocaleString("en-US")} |`);
  }
  console.log(`
### ¿Y si compramos en vez de vender?
`);
  console.log("| Tramo | n | Media del COMPRADOR | $/año |");
  console.log("|---|---|---|---|");
  for (const [nom, sub] of [["COMPLETO", todas], ["vieja", todas.slice(0, mid)], ["nueva", todas.slice(mid)]] as const) {
    const r = linea(sub as Op[], "retComprador");
    console.log(`| ${nom} | ${r.n} | ${r.m >= 0 ? "+" : ""}${r.m.toFixed(2)}% | $${Math.round(r.porAño).toLocaleString("en-US")} |`);
  }
  console.log(`   (el comprador paga SU propio spread: compra al ask y vende al bid, no es -1x el vendedor)`);
  // AUDITORIA DEL NUMERO BUENO. Una media de +29% que aparece al invertir el signo es casi
  // siempre un denominador roto: si el debito es diminuto, un acierto da +1900% y arrastra la
  // media entera. La MEDIANA y los extremos lo delatan enseguida.
  const rc = todas.map((x) => x.retComprador).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const q = (f: number) => rc[Math.floor(rc.length * f)] * 100;
  console.log(`
   AUDITORIA del comprador:`);
  console.log(`     mediana ${q(0.5).toFixed(1)}%  ·  p25 ${q(0.25).toFixed(1)}%  ·  p75 ${q(0.75).toFixed(1)}%  ·  p95 ${q(0.95).toFixed(1)}%  ·  max ${(rc[rc.length - 1] * 100).toFixed(0)}%`);
  console.log(`     gana en el ${((rc.filter((x) => x > 0).length / rc.length) * 100).toFixed(0)}% de las operaciones`);
  const sinTop = rc.slice(0, Math.floor(rc.length * 0.99));
  console.log(`     media SIN el 1% mejor: ${((sinTop.reduce((a, b) => a + b, 0) / sinTop.length) * 100).toFixed(2)}%`);
  const sinTop5 = rc.slice(0, Math.floor(rc.length * 0.95));
  console.log(`     media SIN el 5% mejor: ${((sinTop5.reduce((a, b) => a + b, 0) / sinTop5.length) * 100).toFixed(2)}%`);
  console.log(`     debito medio pagado: $${(todas.reduce((a, b) => a + (b.debito ?? 0), 0) / todas.length).toFixed(2)}`);
  // La misma auditoria al VENDEDOR. Si su -2,53% tambien lo deciden cuatro operaciones, entonces
  // no sabemos nada de ningun lado: el vehiculo seria indistinguible de un juego justo con esta
  // muestra, y decir "pierde" seria tan infundado como decir "gana".
  const rv2 = todas.map((x) => x.ret).sort((a, b) => a - b);
  const qq = (f: number) => rv2[Math.floor(rv2.length * f)] * 100;
  const sinPeor1 = rv2.slice(Math.ceil(rv2.length * 0.01));
  const sinPeor5 = rv2.slice(Math.ceil(rv2.length * 0.05));
  console.log(`
   AUDITORIA del vendedor (lo que veniamos haciendo):`);
  console.log(`     mediana ${qq(0.5).toFixed(1)}%  ·  p5 ${qq(0.05).toFixed(1)}%  ·  p95 ${qq(0.95).toFixed(1)}%  ·  min ${(rv2[0] * 100).toFixed(0)}%`);
  console.log(`     gana en el ${((rv2.filter((x) => x > 0).length / rv2.length) * 100).toFixed(0)}% de las operaciones`);
  console.log(`     media SIN el 1% PEOR: ${((sinPeor1.reduce((a, b) => a + b, 0) / sinPeor1.length) * 100).toFixed(2)}%`);
  console.log(`     media SIN el 5% PEOR: ${((sinPeor5.reduce((a, b) => a + b, 0) / sinPeor5.length) * 100).toFixed(2)}%`);
  const rm = linea(todas, "retModelo");
  console.log(`
### Descomposición — ¿los precios o la rejilla de strikes?
`);
  console.log(`   Black-Scholes con los strikes IDEALES (el backtest de siempre)  : **+3,20%**`);
  console.log(`   Black-Scholes con los strikes REALES (misma rejilla, otro precio): ${rm.m >= 0 ? "+" : ""}${rm.m.toFixed(2)}%   ← lo que cuesta la REJILLA`);
  console.log(`   Precios REALES con los strikes reales                            : ${linea(todas).m.toFixed(2)}%   ← lo que cuestan los PRECIOS`);
  const sp = todas.map((x) => x.spreadRel).sort((a, b) => a - b);
  console.log(`\n   Spread real de la pata corta: mediana ${(sp[Math.floor(sp.length / 2)] * 100).toFixed(1)}% · p90 ${(sp[Math.floor(sp.length * 0.9)] * 100).toFixed(1)}%`);
  console.log(`   El backtest con Black-Scholes daba **+3,2%** de media. Si aquí sale parecido, el`);
  console.log(`   modelo no nos estaba engañando. Si sale mucho menor, el 13%/año no existe.`);
})();
