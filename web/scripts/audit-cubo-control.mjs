// AUDITORÍA ADVERSARIA DEL CUBO DE CONTROL de eva-comprar-largo.mjs
// SOLO LECTURA. No toca ningún fichero del test.
//
// Uso:
//   node --max-old-space-size=6144 scripts/audit-cubo-control.mjs barato   (solo el JSON)
//   node --max-old-space-size=6144 scripts/audit-cubo-control.mjs caro     (re-anda las cadenas)
//
// Preguntas:
//   1. ¿El cubo se va a contratos más BARATOS (más OTM) que el tratamiento?
//   2. ¿La HORQUILLA relativa del tratamiento es más estrecha que la de su cubo?
//      Si lo es, comprar al ask y vender al bid da ventaja MECÁNICA sin elegir mejor.
//   3. ¿La tasa de AUSENCIA (= −100% de retorno) es mayor en el cubo que en el tratamiento?
//   4. ¿El cubo excluye correctamente el propio contrato?

import { readFileSync, existsSync, readdirSync } from "node:fs";

const MODO = process.argv[2] || "barato";
const CDIR = "scripts/cache-theta/cadenas";
const HORIZONTES = [30, 90, 180, 365];
const CUBO_EXP_DIAS = 30, CUBO_PRIMA_LO = 0.5, CUBO_PRIMA_HI = 2.0, CUBO_MIN = 5;

const sinG = (s) => String(s).replace(/-/g, "");
const aIso = (d) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const ms = (ymd) => Date.parse(aIso(ymd) + "T00:00:00Z");
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tCero = (v) => media(v) / (sd(v) / Math.sqrt(v.length));
const pct = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(3)}%`;

const filas = JSON.parse(readFileSync("scripts/eva-largo-filas.json", "utf8"));
console.log(`filas: ${filas.length.toLocaleString("es-ES")}\n`);

// ══════════════════════════════════════════════════════════════════════════════
// 3. AUSENCIAS — ausente = bid 0 = retorno −100%. Si el cubo se ausenta más, gana el tratamiento.
// ══════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(96));
console.log("AUSENCIAS · un contrato ausente en la cadena de salida vale −100% de retorno");
console.log("═".repeat(96));
console.log("horiz       n     ausenciaT   ausenciaC   exceso C−T   ·  ese exceso × (−100%) =  ¿cuánto de la diferencia?");
const dPorH = {};
for (const H of HORIZONTES) {
  const m = filas.filter((f) => f.h[H]).map((f) => f.h[H]);
  dPorH[H] = m.map((x) => x.d);
  const aT = media(m.map((x) => (x.ausenteT ? 1 : 0)));
  const aC = media(m.map((x) => x.ausentesC / x.n));
  const dTot = media(dPorH[H]);
  const explicado = (aC - aT) * 1.0;   // cada ausencia mete −100% en ese lado
  console.log(`${String(H).padStart(4)} d ${String(m.length).padStart(7)}   ` +
    `${(aT * 100).toFixed(3).padStart(8)}%  ${(aC * 100).toFixed(3).padStart(8)}%  ${((aC - aT) * 100).toFixed(3).padStart(9)}%   ` +
    `·  ${pct(explicado).padStart(9)}  de  ${pct(dTot)}  =  ${((explicado / dTot) * 100).toFixed(0)}%`);
}

console.log("\n" + "─".repeat(96));
console.log("LA MISMA DIFERENCIA, QUITANDO LAS AUSENCIAS DE LOS DOS LADOS");
console.log("(solo filas donde el tratamiento NO se ausenta y NINGÚN miembro del cubo se ausenta)");
console.log("─".repeat(96));
console.log("horiz    n(todas)  dif(todas)   t   ·   n(limpias)  dif(limpias)    t     ·  n(con ausencias)  dif");
for (const H of HORIZONTES) {
  const m = filas.filter((f) => f.h[H]).map((f) => f.h[H]);
  const limpias = m.filter((x) => !x.ausenteT && x.ausentesC === 0).map((x) => x.d);
  const sucias = m.filter((x) => x.ausenteT || x.ausentesC > 0).map((x) => x.d);
  const todas = m.map((x) => x.d);
  const f = (v) => v.length > 2 ? `${String(v.length).padStart(6)}  ${pct(media(v)).padStart(9)}  ${tCero(v).toFixed(2).padStart(7)}` : `${String(v.length).padStart(6)}        —        —`;
  console.log(`${String(H).padStart(4)} d  ${f(todas)}  ·  ${f(limpias)}  ·  ${f(sucias)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Clustering: filas duplicadas del MISMO contrato el mismo día inflan la n y la t.
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(96));
console.log("INDEPENDENCIA · ¿cuántas filas son el MISMO contrato el MISMO día? (la t asume filas independientes)");
console.log("═".repeat(96));
for (const H of HORIZONTES) {
  const sel = filas.filter((f) => f.h[H]);
  const grupos = new Map();
  for (const f of sel) {
    const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(f.h[H].d);
  }
  // una fila por contrato-día (todas las duplicadas tienen la MISMA d, salvo cubo idéntico)
  const porContrato = [...grupos.values()].map((v) => media(v));
  // y por ticker-día (aún más conservador)
  const gTD = new Map();
  for (const f of sel) {
    const k = `${f.ticker}|${f.dia}`;
    if (!gTD.has(k)) gTD.set(k, []);
    gTD.get(k).push(f.h[H].d);
  }
  const porTickerDia = [...gTD.values()].map((v) => media(v));
  const todas = sel.map((f) => f.h[H].d);
  console.log(`${String(H).padStart(4)} d · filas ${String(todas.length).padStart(6)} t=${tCero(todas).toFixed(2).padStart(6)}` +
    ` · contratos únicos ${String(porContrato.length).padStart(6)} t=${tCero(porContrato).toFixed(2).padStart(6)}` +
    ` · ticker-día únicos ${String(porTickerDia.length).padStart(5)} t=${tCero(porTickerDia).toFixed(2).padStart(6)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Horquilla del TRATAMIENTO (ya está en el JSON). El cubo hace falta ir a las cadenas.
// ══════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(96));
console.log("HORQUILLA RELATIVA DEL TRATAMIENTO (spreadRel = (ask−bid)/ask, cadena de entrada)");
console.log("═".repeat(96));
const sr = filas.map((f) => f.spreadRel).filter((x) => x != null && Number.isFinite(x));
sr.sort((a, b) => a - b);
console.log(`  n=${sr.length}  media ${(media(sr) * 100).toFixed(2)}%  mediana ${(sr[Math.floor(sr.length / 2)] * 100).toFixed(2)}%  p10 ${(sr[Math.floor(sr.length * 0.1)] * 100).toFixed(2)}%  p90 ${(sr[Math.floor(sr.length * 0.9)] * 100).toFixed(2)}%`);

if (MODO === "barato") { console.log("\n(modo barato: no se han abierto las cadenas. Correr con `caro` para el cubo)"); process.exit(0); }

// ══════════════════════════════════════════════════════════════════════════════
// MODO CARO — se reconstruye el cubo EXACTAMENTE igual que el medidor y se mide:
//   · ask medio del cubo / ask del tratamiento   (¿el cubo es más barato?)
//   · horquilla relativa media del cubo vs la del tratamiento
//   · moneyness (|K−S|/S) del tratamiento vs cubo, con S estimado por paridad
//   · el retorno PUNTO MEDIO a punto medio (sin horquilla) → si la diferencia se cae, era mecánica
//   · comprobación de que el propio contrato NO está en el cubo
// ══════════════════════════════════════════════════════════════════════════════
const diasPorSimbolo = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  (diasPorSimbolo.get(m[1]) ?? diasPorSimbolo.set(m[1], []).get(m[1])).push(m[2]);
}
for (const v of diasPorSimbolo.values()) v.sort();

const cacheCad = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cacheCad.get(k);
  if (hit !== undefined) { cacheCad.delete(k); cacheCad.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cacheCad.set(k, v);
  if (cacheCad.size > 250) cacheCad.delete(cacheCad.keys().next().value);
  return v;
}

/** Subyacente estimado por paridad: el strike donde |midCall − midPut| es mínimo, en el vto más cercano. */
function spotEstimado(cad) {
  let mejor = null;
  const exps = Object.keys(cad).sort();
  for (const exp of exps.slice(0, 4)) {
    const g = cad[exp];
    for (const clave of Object.keys(g)) {
      if (!clave.endsWith("|C")) continue;
      const K = Number(clave.slice(0, -2));
      const p = g[`${K}|P`];
      const c = g[clave];
      if (!p || !c) continue;
      const mc = (c[0] + c[1]) / 2, mp = (p[0] + p[1]) / 2;
      const dif = Math.abs(mc - mp);
      if (!mejor || dif < mejor.dif) mejor = { dif, S: K + mc - mp };
    }
    if (mejor) break;
  }
  return mejor ? mejor.S : null;
}

// Filas ordenadas por (ticker,día) para que la caché LRU acierte.
const orden = [...filas].sort((a, b) => (a.ticker + a.dia).localeCompare(b.ticker + b.dia));
const acc = {};   // por horizonte
for (const H of HORIZONTES) acc[H] = { dHorq: [], dMid: [], srT: [], srC: [], askRat: [], mnyT: [], mnyC: [], dteT: [], dteC: [], tk: [], fe: [], rg: [], amnyT: [], amnyC: [] };
let propioEnCubo = 0, cubosRevisados = 0, cuboDistinto = 0, sinSpot = 0;

function diaSalida(sym, objetivo) {
  const dias = diasPorSimbolo.get(sym);
  if (!dias) return null;
  let lo = 0, hi = dias.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] >= objetivo) { res = dias[m]; hi = m - 1; } else lo = m + 1; }
  if (!res) return null;
  return (ms(res) - ms(objetivo)) / 86_400_000 <= 10 ? res : null;
}

let hechas = 0;
for (const f of orden) {
  const cadEnt = cadena(f.ticker, f.dia);
  if (!cadEnt) continue;
  const expYmd = sinG(f.exp);
  const clave = `${f.strike}|${f.right}`;
  const askEnt = f.askEnt, msExp = ms(expYmd), msEnt = ms(f.dia);

  const universo = [];
  for (const [exp, grupo] of Object.entries(cadEnt)) {
    const mE = ms(exp);
    if (Math.abs(mE - msExp) > CUBO_EXP_DIAS * 86_400_000) continue;
    for (const [k, ba] of Object.entries(grupo)) {
      if (k.slice(-1) !== f.right) continue;
      if (!(ba[1] > 0)) continue;
      if (ba[1] < askEnt * CUBO_PRIMA_LO || ba[1] > askEnt * CUBO_PRIMA_HI) continue;
      universo.push({ exp, msExp: mE, clave: k, bid: ba[0], ask: ba[1], K: Number(k.slice(0, -2)) });
    }
  }
  const conPropio = universo.length;
  const cubo = universo.filter((u) => !(u.exp === expYmd && u.clave === clave));
  cubosRevisados++;
  if (conPropio === cubo.length) propioEnCubo++;          // el propio NO estaba → no se pudo excluir
  if (cubo.length !== f.cubo) cuboDistinto++;             // reconstrucción no idéntica: avisar
  if (cubo.length < CUBO_MIN) continue;

  const S = spotEstimado(cadEnt);
  if (S == null) sinSpot++;

  for (const H of HORIZONTES) {
    const m = f.h[H];
    if (!m) continue;
    const dSal = m.diaSal;
    const cadSal = cadena(f.ticker, dSal);
    if (!cadSal) continue;
    const msObj = ms(dSal);

    const entT = cadEnt[expYmd]?.[clave]; if (!entT) continue;
    const salT = cadSal[expYmd]?.[clave];
    const midEntT = (entT[0] + entT[1]) / 2;
    const midSalT = salT ? (salT[0] + salT[1]) / 2 : 0;
    if (!(midEntT > 0)) continue;
    const rT_horq = ((salT ? salT[0] : 0) - entT[1]) / entT[1];
    const rT_mid = (midSalT - midEntT) / midEntT;

    let sH = 0, sM = 0, cN = 0, sSr = 0, sAsk = 0, sMny = 0, sDte = 0, cMny = 0, sAMny = 0;
    for (const u of cubo) {
      if (u.msExp <= msObj) continue;
      const sal = cadSal[u.exp]?.[u.clave];
      const midEnt = (u.bid + u.ask) / 2;
      if (!(u.ask > 0) || !(midEnt > 0)) continue;
      const midSal = sal ? (sal[0] + sal[1]) / 2 : 0;
      sH += ((sal ? sal[0] : 0) - u.ask) / u.ask;
      sM += (midSal - midEnt) / midEnt;
      sSr += (u.ask - u.bid) / u.ask;
      sAsk += u.ask / askEnt;
      sDte += (u.msExp - msEnt) / 86_400_000;
      if (S != null) { sMny += (u.K - S) / S; sAMny += Math.abs(u.K - S) / S; cMny++; }
      cN++;
    }
    if (cN < CUBO_MIN) continue;
    if (msExp <= msObj) continue;

    acc[H].dHorq.push(rT_horq - sH / cN);
    acc[H].dMid.push(rT_mid - sM / cN);
    acc[H].srT.push((entT[1] - entT[0]) / entT[1]);
    acc[H].srC.push(sSr / cN);
    acc[H].askRat.push(sAsk / cN);
    acc[H].dteT.push((msExp - msEnt) / 86_400_000);
    acc[H].dteC.push(sDte / cN);
    acc[H].tk.push(f.ticker); acc[H].fe.push(f.dia); acc[H].rg.push(f.right);
    if (S != null && cMny > 0) {
      acc[H].mnyT.push((Number(f.strike) - S) / S);
      acc[H].mnyC.push(sMny / cMny);
      acc[H].amnyT.push(Math.abs(Number(f.strike) - S) / S);
      acc[H].amnyC.push(sAMny / cMny);
    }
  }
  if (++hechas % 4000 === 0) console.error(`  ... ${hechas}/${orden.length}`);
}

console.log("\n" + "═".repeat(112));
console.log("¿EL CUBO EXCLUYE EL PROPIO CONTRATO?");
console.log("═".repeat(112));
console.log(`  cubos reconstruidos: ${cubosRevisados}`);
console.log(`  casos en que el propio contrato NO estaba en el universo (nada que excluir): ${propioEnCubo}`);
console.log(`  cubos cuyo tamaño NO coincide con el guardado en el JSON: ${cuboDistinto}`);
console.log(`  días sin spot estimable: ${sinSpot}`);

console.log("\n" + "═".repeat(112));
console.log("QUÉ METE EL CUBO · tratamiento vs media de su cubo");
console.log("═".repeat(112));
console.log("horiz     n     ask cubo/ask trat.   horquilla T   horquilla C   T−C      moneyness T   moneyness C     DTE T   DTE C");
for (const H of HORIZONTES) {
  const a = acc[H];
  if (a.dHorq.length < 3) continue;
  console.log(`${String(H).padStart(4)} d ${String(a.dHorq.length).padStart(6)}   ` +
    `${media(a.askRat).toFixed(3).padStart(14)}   ` +
    `${(media(a.srT) * 100).toFixed(2).padStart(10)}%   ${(media(a.srC) * 100).toFixed(2).padStart(10)}%   ${((media(a.srT) - media(a.srC)) * 100).toFixed(2).padStart(6)}%   ` +
    `${(media(a.mnyT) * 100).toFixed(2).padStart(10)}%   ${(media(a.mnyC) * 100).toFixed(2).padStart(10)}%   ` +
    `${media(a.dteT).toFixed(0).padStart(7)} ${media(a.dteC).toFixed(0).padStart(7)}`);
}

console.log("\n" + "═".repeat(112));
console.log("LA PRUEBA DE FUEGO · la MISMA diferencia pareada, medida punto-medio a punto-medio");
console.log("(si el efecto vive en la horquilla, aquí se cae; si es elección de contrato, aguanta)");
console.log("═".repeat(112));
console.log("horiz      n     con horquilla (ask→bid)    t      ·   punto medio (mid→mid)     t      ·   cuánto era horquilla");
for (const H of HORIZONTES) {
  const a = acc[H];
  if (a.dHorq.length < 3) continue;
  const dh = media(a.dHorq), dm = media(a.dMid);
  console.log(`${String(H).padStart(4)} d ${String(a.dHorq.length).padStart(7)}   ` +
    `${pct(dh).padStart(12)}   ${tCero(a.dHorq).toFixed(2).padStart(7)}    ·   ` +
    `${pct(dm).padStart(12)}   ${tCero(a.dMid).toFixed(2).padStart(7)}    ·   ${pct(dh - dm).padStart(11)}  (${(((dh - dm) / dh) * 100).toFixed(0)}%)`);
}

// ── ¿Es CAUSAL la horquilla? Ordenar por la ventaja de horquilla (srC − srT) y ver la diferencia
console.log("\n" + "═".repeat(112));
console.log("PRUEBA CAUSAL · quintiles por VENTAJA DE HORQUILLA del tratamiento (srC − srT, en puntos)");
console.log("(si el efecto es mecánico, la diferencia sube monótona con la ventaja; el mid no debería moverse igual)");
console.log("═".repeat(112));
for (const H of HORIZONTES) {
  const a = acc[H];
  if (a.dHorq.length < 500) continue;
  const idx = a.dHorq.map((_, i) => i).sort((x, y) => (a.srC[x] - a.srT[x]) - (a.srC[y] - a.srT[y]));
  const k = Math.floor(idx.length / 5);
  const li = [`${String(H).padStart(4)} d  `];
  for (let q = 0; q < 5; q++) {
    const g = idx.slice(q * k, q === 4 ? idx.length : (q + 1) * k);
    const vent = media(g.map((i) => a.srC[i] - a.srT[i]));
    li.push(`Q${q + 1} ventaja ${(vent * 100).toFixed(2).padStart(6)}pp → dif ${pct(media(g.map((i) => a.dHorq[i]))).padStart(9)} | mid ${pct(media(g.map((i) => a.dMid[i]))).padStart(9)}`);
  }
  console.log(li.join("\n         "));
  console.log("");
}

// ── El subgrupo SIN ventaja de horquilla: ¿queda algo?
console.log("═".repeat(112));
console.log("SUBGRUPO SIN VENTAJA MECÁNICA · filas donde el tratamiento NO tiene la horquilla más estrecha (srT ≥ srC)");
console.log("═".repeat(112));
console.log("horiz    n(con ventaja)  dif     t     ·   n(sin ventaja)  dif     t");
for (const H of HORIZONTES) {
  const a = acc[H];
  if (a.dHorq.length < 500) continue;
  const con = [], sin = [];
  for (let i = 0; i < a.dHorq.length; i++) (a.srT[i] < a.srC[i] ? con : sin).push(a.dHorq[i]);
  const f = (v) => v.length > 2 ? `${String(v.length).padStart(6)}  ${pct(media(v)).padStart(9)}  ${tCero(v).toFixed(2).padStart(6)}` : `${String(v.length).padStart(6)}      —       —`;
  console.log(`${String(H).padStart(4)} d   ${f(con)}   ·  ${f(sin)}`);
}

// ── Lo que sobrevive al mid: ¿aguanta las cribas? (concentración + tercios + agrupación)
console.log("\n" + "═".repeat(112));
console.log("EL RESIDUO (mid→mid) BAJO LAS CRIBAS · concentración, tercios y agrupación por ticker-día");
console.log("═".repeat(112));
for (const H of HORIZONTES) {
  const a = acc[H];
  if (a.dMid.length < 500) continue;
  const cnt = new Map();
  for (const t of a.tk) cnt.set(t, (cnt.get(t) ?? 0) + 1);
  const may = [...cnt].sort((x, y) => y[1] - x[1])[0];
  const idx = a.dMid.map((_, i) => i).sort((x, y) => a.fe[x].localeCompare(a.fe[y]));
  const k = Math.floor(idx.length / 3);
  const ter = [0, 1, 2].map((i) => {
    const g = i < 2 ? idx.slice(i * k, (i + 1) * k) : idx.slice(2 * k);
    return { p: `${a.fe[g[0]]}→${a.fe[g[g.length - 1]]}`, d: media(g.map((j) => a.dMid[j])), t: tCero(g.map((j) => a.dMid[j])) };
  });
  const gTD = new Map();
  for (let i = 0; i < a.dMid.length; i++) {
    const key = `${a.tk[i]}|${a.fe[i]}`;
    if (!gTD.has(key)) gTD.set(key, []);
    gTD.get(key).push(a.dMid[i]);
  }
  const clus = [...gTD.values()].map((v) => media(v));
  console.log(`${String(H).padStart(4)} d · mid ${pct(media(a.dMid))} t=${tCero(a.dMid).toFixed(2)}` +
    ` · mayor ticker ${may[0]} ${((may[1] / a.dMid.length) * 100).toFixed(1)}%` +
    ` · agrupado ticker-día n=${clus.length} ${pct(media(clus))} t=${tCero(clus).toFixed(2)}`);
  for (const t of ter) console.log(`          tercio ${t.p}  ${pct(t.d).padStart(10)}  t=${t.t.toFixed(2).padStart(6)}`);
  // por ticker
  const porT = new Map();
  for (let i = 0; i < a.dMid.length; i++) { if (!porT.has(a.tk[i])) porT.set(a.tk[i], []); porT.get(a.tk[i]).push(a.dMid[i]); }
  console.log("          " + [...porT].sort((x, y) => y[1].length - x[1].length)
    .map(([t, v]) => `${t} ${pct(media(v))}(n=${v.length})`).join("  "));
}

// ── Moneyness absoluta, separada por tipo
console.log("\n" + "═".repeat(112));
console.log("MONEYNESS · |K−S|/S (distancia al dinero) y (K−S)/S por tipo — S estimado por paridad put/call");
console.log("═".repeat(112));
for (const H of HORIZONTES) {
  const a = acc[H];
  if (a.amnyT.length < 100) continue;
  const iC = [], iP = [];
  for (let i = 0; i < a.amnyT.length; i++) (a.rg[i] === "C" ? iC : iP).push(i);
  const g = (idx) => idx.length > 2
    ? `T ${(media(idx.map((i) => a.mnyT[i])) * 100).toFixed(2).padStart(6)}%  C ${(media(idx.map((i) => a.mnyC[i])) * 100).toFixed(2).padStart(6)}%`
    : "—";
  console.log(`${String(H).padStart(4)} d · |dist| T ${(media(a.amnyT) * 100).toFixed(2)}%  cubo ${(media(a.amnyC) * 100).toFixed(2)}%` +
    `  ·  calls(n=${iC.length}) ${g(iC)}  ·  puts(n=${iP.length}) ${g(iP)}`);
}
