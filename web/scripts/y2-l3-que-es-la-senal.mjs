// LENTE 3 — ¿QUÉ ES DE VERDAD LA SEÑAL DE "LA OPCIÓN ESTÁ CARA"?
//
// Re-ejecuta el pipeline de y2-esta-barata-la-opcion.mjs (mismo envase, mismas reglas de la casa,
// mismo spot por paridad SÓLO en el vencimiento más cercano) y le añade las preguntas de la
// lente 3, que no son "¿gana?" sino "¿QUÉ es lo que está midiendo?":
//
//   1. AUDITORÍA DE CEROS. Al salir se lee el bid del contrato. Si la clave no está en la cadena
//      de salida, el código original lo cuenta como 0 (pérdida del 100%). Aquí se separan los dos
//      casos: bid 0 de verdad vs. clave AUSENTE. Un hueco no es un cero.
//
//   2. VEINTE BARAJADOS, no uno. Desplazando la señal 5..24 meses dentro del mismo ticker, y
//      SIEMPRE comparando contra el listón del MISMO subconjunto (el barajado pierde los primeros
//      meses de cada ticker; compararlo con el listón entero es hacer trampa a favor de la señal).
//
//   3. VEINTE BARAJADOS CRUZADOS. A cada operación se le pega la señal que tenía OTRO ticker el
//      MISMO mes. Si eso también funciona, la señal no es del ticker: es del mercado ese mes.
//
//   4. ¿ES UN TERMÓMETRO DE MERCADO? Se mide cuántos tickers disparan a la vez cada mes, cuántos
//      meses distintos aportan la mitad del dinero, y qué pasa si se sustituye la señal propia por
//      la MEDIANA de los OTROS tickers ese mes (dejando fuera el propio).
//
//   5. ¿ES OTRA COSA CON OTRO NOMBRE? Solapamiento del disparo con: la cuña sola, el movimiento
//      real solo, la aceleración de volatilidad (rv20/rv120), el coste de la prima, la horquilla,
//      y la señal del propio SPY. Y se corre la regla con cada uno de esos en lugar de la señal.
//
//   6. ¿ES EARNINGS? Se marcan los días de salto idiosincrático grande (el ticker se mueve mucho
//      más que SPY ese día) como proxy de resultados — DIAGNÓSTICO, usa el futuro A PROPÓSITO y
//      NUNCA entra en ninguna regla — y se mira si el disparo se agolpa en ciertas semanas del
//      trimestre y en ciertos meses del calendario.
//
//   7. ¿ES LA DERIVA? Calls y puts por separado, contra su propio listón, y por año.
//
//   8. EL MECANISMO. ¿La señal acierta el movimiento FUTURO? Se mide el movimiento realizado de
//      los 30 días siguientes (de precios reales de la cadena) con y sin señal.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-l3-que-es-la-senal.mjs
//      (con REUSE=1 reaprovecha el volcado de operaciones del scratchpad)

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const VOLCADO = "scripts/cache-theta/_y2l3-ops.json";

const ENVASES = {
  A: { dist: 0.10, dte: 60, salida: 30, etiqueta: "A · 10% fuera · 60 días · salir a los 30 de bolsa" },
  B: { dist: 0.05, dte: 90, salida: 30, etiqueta: "B · 5% fuera · 90 días · salir a los 30 de bolsa" },
};
const ASKMIN = 0.10;
const TOLK = 0.50;
const APUESTA = 1000;
const VENTANAS_RV = [20, 60, 120];
const VENT_PCTL = 250;
const MIN_PCTL = 150;
const ANOSCAL = 10.6;

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const linea = (t) => { console.log(`\n${"═".repeat(104)}\n  ${t}\n${"═".repeat(104)}`); };

// ── la vara ─────────────────────────────────────────────────────────────────
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
function suma(a, o) { const d = APUESTA * o.ret; a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
function mide(v) { const a = acc(); for (const o of v) suma(a, o); return a; }
const R = (a) => (a && a.n ? ratio(a).toFixed(2) : " n/d");

// ════════════════════════════════════════════════════════════════════════════
// EL PASE (idéntico al original salvo por los campos extra de diagnóstico)
// ════════════════════════════════════════════════════════════════════════════
let OPS, SAN;
if (process.env.REUSE === "1" && existsSync(VOLCADO)) {
  const j = JSON.parse(readFileSync(VOLCADO, "utf8"));
  OPS = j.ops; SAN = j.san;
  console.log(`\n## reaprovechando el volcado: ${num(OPS.length)} operaciones\n`);
} else {
  const diasPorSim = new Map();
  for (const f of readdirSync(CDIR)) {
    const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
    if (!m) continue;
    if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
    diasPorSim.get(m[1]).push(m[2]);
  }
  for (const v of diasPorSim.values()) v.sort();
  const TICKERS = [...diasPorSim.keys()].sort();
  console.log(`\n## ${TICKERS.length} tickers · ${num([...diasPorSim.values()].reduce((a, v) => a + v.length, 0))} días de cadena\n`);

  const cache = new Map(); const MAXC = 200;
  function cadena(sym, dia) {
    const k = `${sym}|${dia}`;
    if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
    const f = `${CDIR}/${sym}_d${dia}.json`;
    let v = null;
    if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
    if (cache.size >= MAXC) cache.delete(cache.keys().next().value);
    cache.set(k, v); return v;
  }
  function spotOk(c, hoy) {
    let exp = null, md = Infinity;
    for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
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
  function expObjetivo(c, hoy, objetivo) {
    let mejor = null, md = Infinity, dtReal = 0;
    for (const e of Object.keys(c)) {
      const dt = dteDe(hoy, e); if (dt < 1) continue;
      const x = Math.abs(dt - objetivo);
      if (x < md) { md = x; mejor = e; dtReal = dt; }
    }
    if (!mejor || md > tolDte(objetivo)) return null;
    return { exp: mejor, dte: dtReal };
  }
  function cunaDe(c, exp, S) {
    const g = c[exp]; if (!g) return null;
    let K = null, dm = Infinity;
    for (const cl of Object.keys(g)) {
      if (cl.slice(-1) !== "C") continue;
      const k = Number(cl.slice(0, -2)); if (!g[`${k}|P`]) continue;
      const d = Math.abs(k - S); if (d < dm) { dm = d; K = k; }
    }
    if (K == null || Math.abs(K / S - 1) > 0.05) return null;
    const askC = g[`${K}|C`][1], askP = g[`${K}|P`][1];
    if (!(askC > 0) || !(askP > 0)) return null;
    return (askC + askP) / S;
  }
  function contratoEsquina(c, exp, S, dist, tipo) {
    const g = c[exp]; if (!g) return null;
    const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
    let mej = null, dm = Infinity;
    for (const [cl, ba] of Object.entries(g)) {
      if (cl.slice(-1) !== tipo) continue;
      if (!(ba[1] >= ASKMIN)) continue;
      const K = Number(cl.slice(0, -2)); const d = Math.abs(K - objetivo);
      if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
    }
    if (!mej) return null;
    const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
    if (Math.abs(distReal - dist) > dist * TOLK) return null;
    return { ...mej, distReal };
  }

  OPS = [];
  let entradas = 0, huecos = 0, ceroReal = 0, claveAusente = 0;
  const audSpot = [];
  const t0 = Date.now();
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const cl = existsSync(`${CIERRES}/${sym}.json`) ? JSON.parse(readFileSync(`${CIERRES}/${sym}.json`, "utf8")) : null;
    const serie = [], vistos = new Set(), entradasIdx = [];
    for (let i = 0; i < dias.length; i++) {
      const d = dias[i]; const c = cadena(sym, d);
      if (!c) { serie.push(null); continue; }
      const S = spotOk(c, d);
      if (!S) { serie.push(null); continue; }
      if (cl && cl[d] > 0) audSpot.push(Math.abs(S / cl[d] - 1));
      const fila = { d, S, cuna: {}, dte: {}, exp: {} };
      for (const [k, e] of Object.entries(ENVASES)) {
        const eo = expObjetivo(c, d, e.dte); if (!eo) continue;
        fila.exp[k] = eo.exp; fila.dte[k] = eo.dte;
        const u = cunaDe(c, eo.exp, S); if (u != null) fila.cuna[k] = u;
      }
      serie.push(fila);
      const mes = d.slice(0, 6);
      if (!vistos.has(mes)) { vistos.add(mes); entradasIdx.push(i); }
    }
    const ret = new Array(dias.length).fill(null);
    for (let i = 1; i < dias.length; i++) {
      const a = serie[i - 1], b = serie[i];
      if (!a || !b || dteDe(a.d, b.d) > 5) continue;
      const r = Math.log(b.S / a.S);
      if (Math.abs(r) > 0.35) continue;
      ret[i] = r;
    }
    const coc = {}; for (const k of Object.keys(ENVASES)) { coc[k] = {}; for (const w of VENTANAS_RV) coc[k][w] = new Array(dias.length).fill(null); }
    const rvSerie = {}; for (const w of VENTANAS_RV) rvSerie[w] = new Array(dias.length).fill(null);
    for (let i = 0; i < dias.length; i++) {
      const f = serie[i]; if (!f) continue;
      for (const w of VENTANAS_RV) {
        const v = [];
        for (let j = i - 1; j >= 0 && v.length < w; j--) if (ret[j] != null) v.push(ret[j]);
        if (v.length < Math.round(w * 0.8)) continue;
        const s = sd(v); if (!(s > 0)) continue;
        rvSerie[w][i] = s;
        for (const k of Object.keys(ENVASES)) {
          if (f.cuna[k] == null || !f.dte[k]) continue;
          const mov = s * Math.sqrt(Math.max(1, f.dte[k] * 252 / 365));
          if (mov > 0) coc[k][w][i] = f.cuna[k] / mov;
        }
      }
    }
    const cunaSerie = {}; for (const k of Object.keys(ENVASES)) cunaSerie[k] = serie.map((f) => (f && f.cuna[k] != null ? f.cuna[k] : null));
    // aceleración de volatilidad: lo que se ha movido últimamente contra lo que se movía antes
    const acelSerie = new Array(dias.length).fill(null);
    for (let i = 0; i < dias.length; i++) if (rvSerie[20][i] != null && rvSerie[120][i] != null && rvSerie[120][i] > 0) acelSerie[i] = rvSerie[20][i] / rvSerie[120][i];

    function percentilar(s) {
      const out = new Array(s.length).fill(null);
      for (let i = 0; i < s.length; i++) {
        if (s[i] == null) continue;
        let n = 0, menores = 0;
        for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { if (s[j] == null) continue; n++; if (s[j] < s[i]) menores++; }
        if (n < MIN_PCTL) continue;
        out[i] = menores / n;
      }
      return out;
    }
    const pc = {}, pcCuna = {}, pcRv = {};
    for (const k of Object.keys(ENVASES)) { pc[k] = {}; for (const w of VENTANAS_RV) pc[k][w] = percentilar(coc[k][w]); }
    for (const k of Object.keys(ENVASES)) pcCuna[k] = percentilar(cunaSerie[k]);
    for (const w of VENTANAS_RV) pcRv[w] = percentilar(rvSerie[w]);
    const pcAcel = percentilar(acelSerie);

    for (const i of entradasIdx) {
      const f = serie[i]; if (!f) continue;
      const c = cadena(sym, dias[i]); if (!c) continue;
      entradas++;
      for (const [k, e] of Object.entries(ENVASES)) {
        const exp = f.exp[k]; if (!exp) continue;
        const iSal = i + e.salida;
        // movimiento realizado FUTURO (diagnóstico del mecanismo, jamás dentro de una regla)
        let movFwd = null;
        if (serie[iSal]) movFwd = Math.log(serie[iSal].S / f.S);
        for (const tipo of ["C", "P"]) {
          const ct = contratoEsquina(c, exp, f.S, e.dist, tipo);
          if (!ct) continue;
          if (dias[iSal] == null) { huecos++; continue; }
          let ds = dias[iSal], trunc = 0;
          if (ds >= exp) { ds = exp; trunc = 1; }
          const cs = cadena(sym, ds); if (!cs) { huecos++; continue; }
          const grupo = cs[exp]; if (!grupo) { huecos++; continue; }
          const presente = grupo[ct.clave] !== undefined;
          if (presente) { if (grupo[ct.clave][0] === 0) ceroReal++; } else claveAusente++;
          const salida = grupo[ct.clave]?.[0] ?? 0;
          const señal = {}, sRv = {};
          for (const w of VENTANAS_RV) { señal[w] = pc[k][w][i]; sRv[w] = pcRv[w][i]; }
          OPS.push({
            env: k, sym, dia: dias[i], ano: dias[i].slice(0, 4), mes: dias[i].slice(0, 6), tipo,
            ret: (salida - ct.ask) / ct.ask, salida, ask: ct.ask, presente: presente ? 1 : 0,
            coste: ct.ask / f.S, distReal: ct.distReal, horq: (ct.ask - ct.bid) / ct.ask,
            dteReal: f.dte[k], trunc, cuna: f.cuna[k] ?? null,
            s: señal, sCuna: pcCuna[k][i], sRv, sAcel: pcAcel[i], movFwd,
            rv60: rvSerie[60][i], acel: acelSerie[i],
          });
        }
      }
    }
    cache.clear();
    process.stderr.write(`\r   ${sym} · ${num(OPS.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
  }
  process.stderr.write("\n");
  const s = [...audSpot].sort((a, b) => a - b);
  SAN = { entradas, huecos, ceroReal, claveAusente, spotMed: s[s.length >> 1], spotP99: s[Math.floor(s.length * 0.99)], nSpot: s.length };
  try { writeFileSync(VOLCADO, JSON.stringify({ ops: OPS, san: SAN })); } catch (e) { console.log("  (no se pudo volcar: " + e.message + ")"); }
}

// el saltón idiosincrático como proxy de resultados — SÓLO DIAGNÓSTICO (usa el futuro a propósito)
// se marca por ticker el 2% de días con mayor |retorno| medido de spot a spot entre entradas… ver §6.

// ════════════════════════════════════════════════════════════════════════════
linea("SANIDAD — la reproducción");
console.log(`  entradas ${num(SAN.entradas)} · huecos descartados ${num(SAN.huecos)} · operaciones ${num(OPS.length)}`);
console.log(`  spot contra los cierres reales: error mediano ${pct(SAN.spotMed)} · peor 1% ${pct(SAN.spotP99)} (${num(SAN.nSpot)} días)`);
console.log(`\n  §1 AUDITORÍA DE CEROS — ¿cuántos "vale 0" son de verdad y cuántos son una clave que no está?`);
console.log(`    salidas con bid 0 REAL (el contrato está en la cadena y nadie puja) : ${num(SAN.ceroReal)}`);
console.log(`    salidas con la CLAVE AUSENTE en la cadena de salida (leído como 0)  : ${num(SAN.claveAusente)}`);
console.log(`    fracción de las operaciones que son clave ausente: ${pct(SAN.claveAusente / (OPS.length + SAN.huecos))}`);

const A = OPS.filter((o) => o.env === "A");
const B = OPS.filter((o) => o.env === "B");
for (const [k, v] of [["A", A], ["B", B]]) {
  const a = mide(v);
  console.log(`  ENVASE ${k}: n=${num(a.n)} ratio ${R(a)} acierta ${pct(acierto(a))} · ganador ${usd(a.gan / a.win)} · perdedor ${usd(a.per / (a.n - a.win))}`);
}

// la regla del hallazgo
const REGLA = (o) => o.s[60] != null && o.s[60] > 0.80;
const TIENE = (o) => o.s[60] != null;
const baseA = A.filter(TIENE), baseB = B.filter(TIENE);
const selA = baseA.filter(REGLA), selB = baseB.filter(REGLA);
console.log(`\n  LA REGLA DEL HALLAZGO (percentil > 80, ventana 60 d):`);
console.log(`    envase A: n=${num(selA.length)} ratio ${R(mide(selA))} acierta ${pct(acierto(mide(selA)))} · listón ${R(mide(baseA))} / ${pct(acierto(mide(baseA)))}`);
console.log(`    envase B: n=${num(selB.length)} ratio ${R(mide(selB))} acierta ${pct(acierto(mide(selB)))} · listón ${R(mide(baseB))} / ${pct(acierto(mide(baseB)))}`);

// si la clave ausente se descarta como HUECO (regla de la casa 3), ¿aguanta?
linea("§1b — QUÉ PASA SI LA CLAVE AUSENTE SE TRATA COMO HUECO (se descarta) en vez de como cero");
console.log(`  | envase | trato | n | ratio | acierta |`);
console.log(`  |---|---|---|---|---|`);
for (const [k, base, sel] of [["A", baseA, selA], ["B", baseB, selB]]) {
  const s2 = sel.filter((o) => o.presente), b2 = base.filter((o) => o.presente);
  console.log(`  | ${k} | como CERO (original) | ${num(sel.length)} | ${R(mide(sel))} | ${pct(acierto(mide(sel)))} |`);
  console.log(`  | ${k} | como HUECO (descartada) | ${num(s2.length)} | ${R(mide(s2))} | ${pct(acierto(mide(s2)))} |`);
  console.log(`  | ${k} | listón como HUECO | ${num(b2.length)} | ${R(mide(b2))} | ${pct(acierto(mide(b2)))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// §2 y §3 — LOS BARAJADOS
// ════════════════════════════════════════════════════════════════════════════
// índice: por ticker y envase, mes -> señal de ese mes (la primera operación del mes)
const MESES_G = [...new Set(OPS.map((o) => o.mes))].sort();
const idxMesG = new Map(MESES_G.map((m, i) => [m, i]));
const sigTM = new Map();   // `${env}|${sym}|${mes}` -> señal
for (const o of OPS) { const k = `${o.env}|${o.sym}|${o.mes}`; if (!sigTM.has(k)) sigTM.set(k, o.s); }
const TICK = [...new Set(OPS.map((o) => o.sym))].sort();

function barajaLag(o, lag) {
  const j = idxMesG.get(o.mes) - lag;
  if (j < 0) return null;
  return sigTM.get(`${o.env}|${o.sym}|${MESES_G[j]}`) ?? null;
}
function barajaCruce(o, salto) {
  const i = TICK.indexOf(o.sym);
  const otro = TICK[(i + salto) % TICK.length];
  return sigTM.get(`${o.env}|${otro}|${o.mes}`) ?? null;
}

function tablaBaraja(base, real, fn, args, titulo) {
  console.log(`\n  ${titulo}`);
  console.log(`  | desplazamiento | n | ratio barajado | acierta | listón del MISMO subconjunto |`);
  console.log(`  |---|---|---|---|---|`);
  const rs = [], ac = [];
  for (const g of args) {
    const conSig = base.map((o) => ({ o, sg: fn(o, g) })).filter((x) => x.sg && x.sg[60] != null);
    const sel = conSig.filter((x) => x.sg[60] > 0.80).map((x) => x.o);
    const lis = conSig.map((x) => x.o);
    if (sel.length < 100) { console.log(`  | ${g} | ${sel.length} | muestra corta | | |`); continue; }
    const a = mide(sel), l = mide(lis);
    rs.push(ratio(a)); ac.push(acierto(a));
    console.log(`  | ${g} | ${num(a.n)} | **${R(a)}** | ${pct(acierto(a))} | ${R(l)} / ${pct(acierto(l))} |`);
  }
  const s = [...rs].sort((x, y) => x - y);
  const peores = rs.filter((x) => x >= ratio(real)).length;
  console.log(`  RESUMEN de ${rs.length} barajados: peor ${s[0]?.toFixed(2)} · mediana ${mediana(rs).toFixed(2)} · mejor ${s[s.length - 1]?.toFixed(2)}`);
  console.log(`  acierto barajado: mediana ${pct(mediana(ac))} · mejor ${pct(Math.max(...ac))}   (el de verdad: ratio ${R(real)}, acierta ${pct(acierto(real))})`);
  console.log(`  barajados que igualan o superan al de verdad: ${peores} de ${rs.length}`);
  return { rs, ac };
}

linea("§2 — VEINTE BARAJADOS POR DESPLAZAMIENTO DE MESES (mismo ticker, mes equivocado)");
const LAGS = Array.from({ length: 20 }, (_, i) => i + 5);   // 5..24 meses
tablaBaraja(baseA, mide(selA), barajaLag, LAGS, "ENVASE A · la misma regla (>80) con la señal de N meses antes del mismo ticker");

linea("§3 — VEINTE BARAJADOS CRUZANDO TICKERS (mismo mes, ticker equivocado)");
const SALTOS = Array.from({ length: 20 }, (_, i) => i + 1);
const cruceA = tablaBaraja(baseA, mide(selA), barajaCruce, SALTOS, "ENVASE A · la señal que tenía OTRO ticker ese MISMO mes");

// ════════════════════════════════════════════════════════════════════════════
// §4 — ¿ES UN TERMÓMETRO DEL MERCADO?
// ════════════════════════════════════════════════════════════════════════════
linea("§4 — ¿DISPARA A LA VEZ EN TODOS LOS TICKERS? (si sí, no son 127 apuestas al año, son unos pocos meses)");
{
  // por mes: cuántos tickers con señal disponible, cuántos disparan
  const porMes = new Map();
  for (const o of baseA) {
    if (o.tipo !== "C") continue;              // una fila por ticker-mes
    if (!porMes.has(o.mes)) porMes.set(o.mes, { n: 0, f: 0 });
    const x = porMes.get(o.mes); x.n++; if (o.s[60] > 0.80) x.f++;
  }
  const fr = [...porMes.entries()].filter(([, x]) => x.n >= 10).map(([m, x]) => ({ m, p: x.f / x.n, n: x.n }));
  fr.sort((a, b) => b.p - a.p);
  console.log(`  meses con al menos 10 tickers: ${fr.length}`);
  console.log(`  fracción de tickers que disparan cada mes — mediana ${pct(mediana(fr.map((x) => x.p)))}`);
  const todos = fr.filter((x) => x.p >= 0.80).length, ninguno = fr.filter((x) => x.p <= 0.05).length;
  console.log(`  meses donde dispara el 80% o más de los tickers: ${todos} (${pct(todos / fr.length)})`);
  console.log(`  meses donde no dispara casi ninguno (5% o menos): ${ninguno} (${pct(ninguno / fr.length)})`);
  console.log(`  si el disparo fuese independiente por ticker, con una tasa media del 20% casi ningún mes pasaría del 80%.`);
  console.log(`  los 10 meses de más disparo: ${fr.slice(0, 10).map((x) => `${x.m} ${pct(x.p)}`).join(" · ")}`);

  // concentración del dinero por MES
  const gm = new Map();
  for (const o of selA) { const d = APUESTA * o.ret; if (!gm.has(o.mes)) gm.set(o.mes, { g: 0, p: 0 }); const x = gm.get(o.mes); if (d > 0) x.g += d; else x.p += -d; }
  const tot = mide(selA);
  const orden = [...gm.entries()].sort((a, b) => b[1].g - a[1].g);
  let ac2 = 0, cuantos = 0;
  for (const [, x] of orden) { ac2 += x.g; cuantos++; if (ac2 >= tot.gan / 2) break; }
  console.log(`\n  CONCENTRACIÓN EN EL TIEMPO: ${gm.size} meses distintos con operaciones · ${cuantos} meses juntan la MITAD de todo lo ganado`);
  console.log(`  los 6 meses que más aportan: ${orden.slice(0, 6).map(([m, x]) => `${m} ${usd(x.g)}`).join(" · ")}`);
  // ratio quitando los 3 mejores meses
  const top3 = new Set(orden.slice(0, 3).map(([m]) => m));
  const sinTop3 = mide(selA.filter((o) => !top3.has(o.mes)));
  const lisSinTop3 = mide(baseA.filter((o) => !top3.has(o.mes)));
  console.log(`  ratio quitando los 3 meses que más aportan: ${R(sinTop3)} (n=${num(sinTop3.n)}) · el listón sin esos meses ${R(lisSinTop3)}`);
}

linea("§4b — SUSTITUIR LA SEÑAL PROPIA POR LA DE LOS DEMÁS (mediana de los OTROS tickers ese mes)");
{
  // mediana cruzada dejando fuera el propio ticker
  const porMesVals = new Map();
  for (const [k, s] of sigTM.entries()) {
    const [env, sym, mes] = k.split("|");
    if (env !== "A" || s[60] == null) continue;
    if (!porMesVals.has(mes)) porMesVals.set(mes, []);
    porMesVals.get(mes).push({ sym, v: s[60] });
  }
  const medOtros = (mes, sym) => {
    const v = (porMesVals.get(mes) ?? []).filter((x) => x.sym !== sym).map((x) => x.v);
    return v.length >= 10 ? mediana(v) : null;
  };
  const tabla = [];
  const conM = baseA.map((o) => ({ o, m: medOtros(o.mes, o.sym) })).filter((x) => x.m != null);
  const lis = mide(conM.map((x) => x.o));
  // el mercado caro (mediana de los demás > 0.60 / > 0.80)
  for (const [et, f] of [["la mediana de LOS DEMÁS > 0.60", (m) => m > 0.60], ["la mediana de LOS DEMÁS > 0.80", (m) => m > 0.80]]) {
    const sel = conM.filter((x) => f(x.m)).map((x) => x.o);
    tabla.push([et, mide(sel)]);
  }
  // la propia, dentro del mismo subconjunto
  tabla.push(["la señal PROPIA > 0.80 (misma muestra)", mide(conM.filter((x) => x.o.s[60] > 0.80).map((x) => x.o))]);
  // la propia MENOS el mercado: lo que le queda de específico
  const resid = conM.map((x) => ({ o: x.o, r: x.o.s[60] - x.m }));
  const rs = [...resid.map((x) => x.r)].sort((a, b) => a - b);
  const q80 = rs[Math.floor(rs.length * 0.80)];
  tabla.push([`sólo lo ESPECÍFICO del ticker (propia − mercado, quinto más alto)`, mide(resid.filter((x) => x.r > q80).map((x) => x.o))]);
  // propia alta Y mercado bajo  /  propia alta Y mercado alto
  tabla.push(["propia > 0.80 Y el mercado tranquilo (mediana < 0.50)", mide(conM.filter((x) => x.o.s[60] > 0.80 && x.m < 0.50).map((x) => x.o))]);
  tabla.push(["propia > 0.80 Y el mercado también caro (mediana > 0.60)", mide(conM.filter((x) => x.o.s[60] > 0.80 && x.m > 0.60).map((x) => x.o))]);
  console.log(`  listón de esta muestra: ratio ${R(lis)} · acierta ${pct(acierto(lis))} (n=${num(lis.n)})`);
  console.log(`\n  | regla | n | ops/año | ratio | acierta |`);
  console.log(`  |---|---|---|---|---|`);
  for (const [et, a] of tabla) console.log(`  | ${et} | ${num(a.n)} | ${(a.n / ANOSCAL).toFixed(0)} | **${R(a)}** | ${pct(acierto(a))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// §5 — ¿ES OTRA COSA CON OTRO NOMBRE?
// ════════════════════════════════════════════════════════════════════════════
linea("§5 — SOLAPAMIENTO: cuando la señal dispara, ¿qué OTRA cosa está también en su quinto más alto?");
{
  const disparo = baseA.filter(REGLA);
  const otras = [
    ["la CUÑA sola (lo que cobran por el movimiento)", (o) => o.sCuna],
    ["el MOVIMIENTO real de 60 d (al revés: quinto más BAJO)", (o) => (o.sRv[60] == null ? null : 1 - o.sRv[60])],
    ["el MOVIMIENTO real de 120 d (al revés)", (o) => (o.sRv[120] == null ? null : 1 - o.sRv[120])],
    ["la ACELERACIÓN de volatilidad (rv 20 d / rv 120 d)", (o) => o.sAcel],
    ["el MOVIMIENTO real de 20 d", (o) => o.sRv[20]],
  ];
  console.log(`  (por puro azar, el solapamiento sería del 20%)\n`);
  console.log(`  | la otra cosa | de los disparos, ¿cuántos la tienen también en su quinto más alto? |`);
  console.log(`  |---|---|`);
  for (const [et, f] of otras) {
    const v = disparo.map(f).filter((x) => x != null);
    const s = v.filter((x) => x > 0.80).length;
    console.log(`  | ${et} | ${pct(s / v.length)} |`);
  }
  console.log(`\n  Y AL REVÉS — la misma regla (quinto más alto) usando cada cosa EN LUGAR de la señal:`);
  console.log(`  | señal usada | n | ops/año | ratio | acierta |`);
  console.log(`  |---|---|---|---|---|`);
  const lis = mide(baseA);
  console.log(`  | (ninguna — el listón) | ${num(lis.n)} | ${(lis.n / ANOSCAL).toFixed(0)} | ${R(lis)} | ${pct(acierto(lis))} |`);
  console.log(`  | **la señal del hallazgo** | ${num(selA.length)} | ${(selA.length / ANOSCAL).toFixed(0)} | **${R(mide(selA))}** | ${pct(acierto(mide(selA)))} |`);
  for (const [et, f] of otras) {
    const sel = baseA.filter((o) => f(o) != null && f(o) > 0.80);
    if (sel.length < 100) continue;
    const a = mide(sel);
    console.log(`  | ${et} | ${num(a.n)} | ${(a.n / ANOSCAL).toFixed(0)} | ${R(a)} | ${pct(acierto(a))} |`);
  }
  // cosas mecánicas del propio contrato
  console.log(`\n  ¿Y es simplemente que la prima está cara / la horquilla ancha? (quintiles del propio contrato)`);
  console.log(`  | corte | n | ratio | acierta |`);
  console.log(`  |---|---|---|---|`);
  for (const [et, campo] of [["coste de la prima (ask ÷ precio de la acción)", "coste"], ["horquilla (% de la prima)", "horq"]]) {
    const v = baseA.map((o) => o[campo]).sort((a, b) => a - b);
    const q80 = v[Math.floor(v.length * 0.8)], q20 = v[Math.floor(v.length * 0.2)];
    const hi = mide(baseA.filter((o) => o[campo] > q80)), lo = mide(baseA.filter((o) => o[campo] < q20));
    console.log(`  | ${et} — quinto MÁS ALTO | ${num(hi.n)} | ${R(hi)} | ${pct(acierto(hi))} |`);
    console.log(`  | ${et} — quinto MÁS BAJO | ${num(lo.n)} | ${R(lo)} | ${pct(acierto(lo))} |`);
  }
  const dsp = baseA.filter(REGLA), nod = baseA.filter((o) => !REGLA(o));
  console.log(`\n  coste medio de la prima: con señal ${pct(media(dsp.map((o) => o.coste)))} · sin señal ${pct(media(nod.map((o) => o.coste)))}`);
  console.log(`  horquilla media: con señal ${pct(media(dsp.map((o) => o.horq)))} · sin señal ${pct(media(nod.map((o) => o.horq)))}`);
  console.log(`  distancia real media: con señal ${pct(media(dsp.map((o) => o.distReal)))} · sin señal ${pct(media(nod.map((o) => o.distReal)))}`);
  console.log(`  plazo real medio: con señal ${media(dsp.map((o) => o.dteReal)).toFixed(1)} d · sin señal ${media(nod.map((o) => o.dteReal)).toFixed(1)} d`);
}

// ════════════════════════════════════════════════════════════════════════════
// §6 — ¿ES EL CALENDARIO DE RESULTADOS?
// ════════════════════════════════════════════════════════════════════════════
linea("§6 — ¿SE AGOLPA EN CIERTAS SEMANAS? (mes del calendario y fase del trimestre)");
{
  const porMesCal = new Map();
  for (const o of baseA) {
    if (o.tipo !== "C") continue;
    const m = o.mes.slice(4, 6);
    if (!porMesCal.has(m)) porMesCal.set(m, { n: 0, f: 0 });
    const x = porMesCal.get(m); x.n++; if (o.s[60] > 0.80) x.f++;
  }
  const NM = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  console.log(`  | mes de entrada | ticker-meses | dispara | ratio con señal | n |`);
  console.log(`  |---|---|---|---|---|`);
  for (let i = 1; i <= 12; i++) {
    const m = String(i).padStart(2, "0"); const x = porMesCal.get(m); if (!x) continue;
    const a = mide(selA.filter((o) => o.mes.slice(4, 6) === m));
    console.log(`  | ${NM[i - 1]} | ${x.n} | ${pct(x.f / x.n)} | ${R(a)} | ${a.n} |`);
  }
  const fs = [...porMesCal.values()].map((x) => x.f / x.n);
  console.log(`  disparo por mes del calendario: menor ${pct(Math.min(...fs))} · mayor ${pct(Math.max(...fs))}`);
  console.log(`  Si fuese el calendario de resultados, los meses posteriores a la temporada (feb/may/ago/nov)`);
  console.log(`  tendrían un disparo claramente distinto de los demás. Enero/abril/julio/octubre = ${pct(media([1, 4, 7, 10].map((i) => { const x = porMesCal.get(String(i).padStart(2, "0")); return x.f / x.n; })))}`);
  console.log(`  febrero/mayo/agosto/noviembre = ${pct(media([2, 5, 8, 11].map((i) => { const x = porMesCal.get(String(i).padStart(2, "0")); return x.f / x.n; })))}`);
  console.log(`  marzo/junio/septiembre/diciembre = ${pct(media([3, 6, 9, 12].map((i) => { const x = porMesCal.get(String(i).padStart(2, "0")); return x.f / x.n; })))}`);
}

// ════════════════════════════════════════════════════════════════════════════
// §7 — ¿ES LA DERIVA DEL MERCADO? calls y puts
// ════════════════════════════════════════════════════════════════════════════
linea("§7 — CALLS Y PUTS POR SEPARADO, contra su propio listón");
{
  console.log(`  | envase | lado | listón n / ratio / acierta | con señal n / ratio / acierta | mejora del ratio |`);
  console.log(`  |---|---|---|---|---|`);
  for (const [k, base] of [["A", baseA], ["B", baseB]]) for (const tipo of ["C", "P"]) {
    const l = mide(base.filter((o) => o.tipo === tipo));
    const s = mide(base.filter((o) => o.tipo === tipo && REGLA(o)));
    console.log(`  | ${k} | ${tipo === "C" ? "calls" : "puts"} | ${num(l.n)} / ${R(l)} / ${pct(acierto(l))} | ${num(s.n)} / ${R(s)} / ${pct(acierto(s))} | ${(ratio(s) - ratio(l)).toFixed(2)} |`);
  }
  console.log(`\n  LAS CALLS SOLAS, año a año (¿la mejora está siempre o sólo cuando el mercado sube?)`);
  console.log(`  | año | calls listón | calls con señal | puts listón | puts con señal |`);
  console.log(`  |---|---|---|---|---|`);
  for (const y of [...new Set(baseA.map((o) => o.ano))].sort()) {
    const f = (t, sig) => mide(baseA.filter((o) => o.ano === y && o.tipo === t && (sig ? REGLA(o) : true)));
    const a = f("C", false), b = f("C", true), c = f("P", false), d = f("P", true);
    console.log(`  | ${y} | ${R(a)} (${a.n}) | ${R(b)} (${b.n}) | ${R(c)} (${c.n}) | ${R(d)} (${d.n}) |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// §8 — EL MECANISMO: ¿acierta el movimiento futuro?
// ════════════════════════════════════════════════════════════════════════════
linea("§8 — EL MECANISMO: ¿la señal avisa de que la acción se va a mover más?");
{
  const con = baseA.filter((o) => REGLA(o) && o.movFwd != null && o.tipo === "C");
  const sin = baseA.filter((o) => !REGLA(o) && o.movFwd != null && o.tipo === "C");
  const abs = (v) => v.map((o) => Math.abs(o.movFwd));
  console.log(`  movimiento absoluto de la acción en los 30 días siguientes (de precios reales):`);
  console.log(`    con señal: mediana ${pct(mediana(abs(con)))} · media ${pct(media(abs(con)))} (n=${num(con.length)})`);
  console.log(`    sin señal: mediana ${pct(mediana(abs(sin)))} · media ${pct(media(abs(sin)))} (n=${num(sin.length)})`);
  const gran = (v, u) => v.filter((o) => Math.abs(o.movFwd) > u).length / v.length;
  for (const u of [0.10, 0.15, 0.20]) console.log(`    se mueve más de un ${(u * 100).toFixed(0)}%: con señal ${pct(gran(con, u))} · sin señal ${pct(gran(sin, u))}`);
  console.log(`  dirección media de esos 30 días: con señal ${pct(media(con.map((o) => o.movFwd)))} · sin señal ${pct(media(sin.map((o) => o.movFwd)))}`);
  // lo que hace falta para que la opción pague: el movimiento tiene que superar la distancia
  console.log(`\n  ¿Y lo que el mercado COBRABA? (la cuña, que es lo que hay que superar)`);
  console.log(`    cuña al dinero: con señal ${pct(media(con.map((o) => o.cuna)))} · sin señal ${pct(media(sin.map((o) => o.cuna)))}`);
  console.log(`    movimiento futuro ÷ cuña: con señal ${(media(abs(con)) / media(con.map((o) => o.cuna))).toFixed(3)} · sin señal ${(media(abs(sin)) / media(sin.map((o) => o.cuna))).toFixed(3)}`);
}

// ════════════════════════════════════════════════════════════════════════════
linea("PUERTAS ABIERTAS EN ESTA LENTE");
console.log(`  20 barajados por meses + 20 barajados cruzando tickers + 6 reglas del mercado`);
console.log(`  + 5 señales alternativas + 4 cortes mecánicos + 12 meses del calendario + 4 de calls/puts`);
console.log(`  = 71 miradas. Ninguna se propone como estrategia: son diagnóstico.`);
console.log(`${"═".repeat(104)}\n`);
