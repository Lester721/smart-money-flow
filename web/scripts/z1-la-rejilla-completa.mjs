// LA REJILLA COMPLETA — distancia × plazo × salida, con la vara del RATIO.
//
// ═══ POR QUÉ ESTO EXISTE ════════════════════════════════════════════════════════════════════
//
// El "listón" del proyecto (comprar una opción suelta 5% fuera del dinero, ~90 días de plazo,
// vendiéndola a los 23 días de bolsa) da un RATIO de 1,03: por cada dólar perdido se gana 1,03.
// Es decir, el envase vacío no gana ni pierde.
//
// PERO esos tres números —5%, 90 días, 23 de salida— nunca se barrieron. Salieron de un estudio
// de cuatro meses (scripts/esquina-1-rejilla.mjs), elegidos mirando el RETORNO MEDIO, y luego se
// midieron sobre diez años. Con una distribución tan torcida como ésta (la mayoría de las veces
// pierdes todo, de vez en cuando ganas 12 veces lo puesto), el retorno medio y el ratio NO eligen
// la misma casilla.
//
// Aquí se barren las tres a la vez:
//     distancia fuera del dinero:  2% · 3% · 5% · 8% · 10% · 15%
//     plazo:                       30 · 45 · 60 · 90 · 120 · 180 días
//     salida:                      5 · 10 · 15 · 23 · 30 · 45 días de bolsa, y AGUANTAR A VENCIMIENTO
// Son 6×6×7 = 252 casillas, y cada una se mide dos veces: con el ask mínimo de $0,10 del listón
// y sin él. 504 mediciones en total. Eso son muchas puertas, así que la ganadora NO se acepta
// por ser la ganadora: tiene que aguantar año a año y no depender de cuatro tickers.
//
// ═══ LA VARA ════════════════════════════════════════════════════════════════════════════════
//
//     RATIO = dólares ganados en total ÷ dólares perdidos en total,
//     arriesgando SIEMPRE $1.000 por intento (que es como se opera: el que compra elige cuánto pone).
//
// No se usa la t como criterio. Una estrategia que compra convexidad vive de la cola: que el
// dinero salga de pocos eventos ES el diseño, no un defecto.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//
//   · se COMPRA al ASK y se VENDE al BID. Nunca punto medio.
//   · ningún modelo de precios. Si el precio no está en la cadena, la operación no existe.
//   · un HUECO no es un cero: si falta la cadena del día de salida, la operación se descarta y
//     se cuenta aparte. Si la cadena SÍ está y el contrato no aparece, es que no tiene puja:
//     vale 0 y se pierde el 100%. Eso es un dato real, no un hueco.
//   · sólo el pasado: el contrato se elige con la cadena de ese mismo día.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z1-la-rejilla-completa.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";

const DISTS = [0.02, 0.03, 0.05, 0.08, 0.10, 0.15];
const DTES = [30, 45, 60, 90, 120, 180];
const SALIDAS = [5, 10, 15, 23, 30, 45, "V"];   // "V" = aguantar a vencimiento
const ASKMINS = [0.10, 0.0];                     // 0.0 = cualquier ask > 0
const TOLK = 0.50;   // cuánto puede apartarse el strike disponible de la distancia pedida
const APUESTA = 1000;

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));   // margen proporcional: 90 → ±25, como el listón

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (100 * x).toFixed(1) + "%";
const eur = (n) => Math.round(n).toLocaleString("es-ES");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

// ── índice de días por ticker ───────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
let TICKERS = [...diasPorSim.keys()].sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${TOTDIAS.toLocaleString("es-ES")} días de cadena`);
console.log(`## ${DISTS.length}×${DTES.length}×${SALIDAS.length} = ${DISTS.length * DTES.length * SALIDAS.length} casillas × ${ASKMINS.length} umbrales de ask = ${DISTS.length * DTES.length * SALIDAS.length * ASKMINS.length} mediciones\n`);

// ── caché LRU de cadenas ────────────────────────────────────────────────────
const cache = new Map();
const MAXC = 320;
let lecturas = 0, fallos = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); lecturas++; } catch { v = null; } }
  else fallos++;
  if (cache.size >= MAXC) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}
/** ═══ EL SPOT, ARREGLADO ═══════════════════════════════════════════════════════════════════
 *  esquina-barata-10anos.mjs busca el strike donde call y put valen lo mismo MIRANDO TODA LA
 *  CADENA A LA VEZ. Eso sólo es el contado en el vencimiento más cercano: a dos años vista la
 *  call y la put se cruzan en el PRECIO A FUTURO, que está por encima. Como mira todos los
 *  vencimientos, se queda con el más largo y devuelve un precio inflado.
 *  Medido contra los cierres reales de disco (scripts/z1-auditar-spot.mjs, 2.838 días de 2021-2026):
 *     el viejo se pasa más de un 2% el 13,5% de los días y más de un 5% el 2,6%.
 *     éste tiene un error mediano del 0,04% y del 0,16% en el peor 10%.
 *  Sigue siendo paridad put-call pura —una identidad de no-arbitraje, no un modelo—, sólo que
 *  aplicada donde vale:  S = K + mid(call) − mid(put)  en el vencimiento más cercano. */
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
/** El spot VIEJO, sólo para reproducir el listón publicado y enseñar en qué se equivocaba. */
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}

// ── acumuladores ────────────────────────────────────────────────────────────
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));

const celdas = new Map();
function celda(key) {
  let c = celdas.get(key);
  if (!c) {
    c = { n: 0, huecos: 0, trunc: 0, sumCoste: 0, sumDist: 0, sumHorq: 0, sinValor: 0,
          T: acc(), C: acc(), P: acc(), anos: new Map(), tks: new Map(), mayor: null };
    celdas.set(key, c);
  }
  return c;
}
function anota(key, o) {
  const c = celda(key);
  const d = APUESTA * o.ret;
  c.n++; c.sumCoste += o.coste; c.sumDist += o.distReal; c.sumHorq += o.horq;
  if (o.salida === 0) c.sinValor++;
  if (o.trunc) c.trunc++;
  suma(c.T, d); suma(c[o.tipo], d);
  if (!c.anos.has(o.ano)) c.anos.set(o.ano, acc());
  suma(c.anos.get(o.ano), d);
  if (!c.tks.has(o.sym)) c.tks.set(o.sym, acc());
  suma(c.tks.get(o.sym), d);
  if (!c.mayor || d > c.mayor.d) c.mayor = { d, sym: o.sym, dia: o.dia, tipo: o.tipo, K: o.K, exp: o.exp };
}

// contadores globales de sanidad
let entradas = 0, sinSpot = 0, sinContrato = 0, huecosGlob = 0, opsGlob = 0, grupoAusente = 0;

// ── réplica del listón (misma regla exacta que esquina-barata-10anos.mjs) ────
const repl = { laxa: acc(), bueno: acc(), dist: [], n: 0 };

// ── el barrido ──────────────────────────────────────────────────────────────
const t0 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const idx = new Map(dias.map((d, i) => [d, i]));
  const vistos = new Set();

  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i];
    const mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;          // una entrada al mes por ticker
    vistos.add(mes);
    const ano = dia.slice(0, 4);

    const c = cadena(sym, dia);
    if (!c) continue;
    const sp = spotOk(c, dia);
    if (!sp) { sinSpot++; continue; }
    entradas++;

    // ── expiración elegida por cada plazo objetivo ──────────────────────────
    const expPorDte = new Array(DTES.length).fill(null);
    const dtesReales = new Array(DTES.length).fill(0);
    for (let j = 0; j < DTES.length; j++) {
      let mejor = null, md = Infinity;
      for (const e of Object.keys(c)) {
        const dt = dteDe(dia, e);
        if (dt < 1) continue;
        const x = Math.abs(dt - DTES[j]);
        if (x < md) { md = x; mejor = e; dtesReales[j] = dt; }
      }
      if (mejor && md <= tolDte(DTES[j])) expPorDte[j] = mejor;
    }

    // ── mejor strike por (expiración, distancia, lado, umbral de ask) ───────
    const expsUnicas = [...new Set(expPorDte.filter(Boolean))];
    const mejores = new Map();   // exp -> array [dist][tipo][askmin]
    for (const e of expsUnicas) {
      const tabla = DISTS.map(() => ({ C: [null, null], P: [null, null] }));
      const objC = DISTS.map((d) => sp * (1 + d));
      const objP = DISTS.map((d) => sp * (1 - d));
      for (const [clave, ba] of Object.entries(c[e])) {
        const tipo = clave.slice(-1);
        if (tipo !== "C" && tipo !== "P") continue;
        const K = Number(clave.slice(0, -2));
        const ask = ba[1];
        if (!(ask > 0)) continue;
        const obj = tipo === "C" ? objC : objP;
        for (let a = 0; a < DISTS.length; a++) {
          const dd = Math.abs(K - obj[a]);
          for (let m = 0; m < ASKMINS.length; m++) {
            if (ask < ASKMINS[m]) continue;
            const cur = tabla[a][tipo][m];
            if (!cur || dd < cur.dd) tabla[a][tipo][m] = { dd, K, bid: ba[0], ask, clave };
          }
        }
      }
      mejores.set(e, tabla);
    }

    // ── días de salida por offset de bolsa ──────────────────────────────────
    const diaSal = SALIDAS.map((s) => (s === "V" ? null : (dias[i + s] ?? null)));

    // ── recorrer la rejilla ─────────────────────────────────────────────────
    for (let j = 0; j < DTES.length; j++) {
      const exp = expPorDte[j];
      if (!exp) continue;
      const tabla = mejores.get(exp);
      for (let a = 0; a < DISTS.length; a++) {
        for (const tipo of ["C", "P"]) {
          for (let m = 0; m < ASKMINS.length; m++) {
            const ct = tabla[a][tipo][m];
            if (!ct) { sinContrato++; continue; }
            const distReal = tipo === "C" ? ct.K / sp - 1 : 1 - ct.K / sp;
            if (Math.abs(distReal - DISTS[a]) > DISTS[a] * TOLK) { sinContrato++; continue; }

            for (let s = 0; s < SALIDAS.length; s++) {
              const key = `${a}|${j}|${s}|${m}`;
              let ds, trunc = 0;
              if (SALIDAS[s] === "V") ds = exp;
              else {
                ds = diaSal[s];
                if (!ds) { celda(key).huecos++; huecosGlob++; continue; }
                if (ds >= exp) { ds = exp; trunc = 1; }   // la salida cae más allá del vencimiento
              }
              const cs = cadena(sym, ds);
              if (!cs) { celda(key).huecos++; huecosGlob++; continue; }
              const grupo = cs[exp];
              if (!grupo) { celda(key).huecos++; huecosGlob++; grupoAusente++; continue; }
              const salida = grupo[ct.clave]?.[0] ?? 0;   // sin puja = 0. Dato real.
              opsGlob++;
              anota(key, {
                sym, dia, ano, tipo, K: ct.K, exp, trunc,
                ret: (salida - ct.ask) / ct.ask, salida,
                coste: ct.ask / sp, distReal, horq: (ct.ask - ct.bid) / ct.ask,
              });
            }
          }
        }
      }
    }

    // ── réplica exacta del listón: 5% / 90±25 / salir a los 23 / ask ≥ 0,10 ──
    // Se hace DOS VECES: con el spot VIEJO (para demostrar que esta tubería reproduce el número
    // publicado al dólar) y con el spot ARREGLADO (para ver qué era en realidad ese 1,03).
    for (const cual of ["viejo", "bueno"]) {
      const sp = cual === "viejo" ? spotDe(c) : spotOk(c, dia);
      if (!sp) continue;
      const dSal = dias[i + 23];
      if (dSal) {
        for (const tipo of ["C", "P"]) {
          const objetivo = tipo === "C" ? sp * 1.05 : sp * 0.95;
          let mej = null, md = Infinity;
          for (const [e, g] of Object.entries(c)) {
            const dt = dteDe(dia, e);
            if (Math.abs(dt - 90) > 25) continue;
            for (const [clave, ba] of Object.entries(g)) {
              if (clave.slice(-1) !== tipo) continue;
              const K = Number(clave.slice(0, -2));
              if (!(ba[1] >= 0.10)) continue;
              const d = Math.abs(K - objetivo) / sp + Math.abs(dt - 90) / 1000;
              if (d < md) { md = d; mej = { e, clave, ask: ba[1] }; }
            }
          }
          if (mej) {
            const cs = cadena(sym, dSal);
            const grupo = cs?.[mej.e];
            const laxa = grupo?.[mej.clave]?.[0] ?? 0;          // regla del listón: ausente = 0
            const d = APUESTA * (laxa - mej.ask) / mej.ask;
            if (cual === "viejo") {
              repl.n++;
              suma(repl.laxa, d);
              const K = Number(mej.clave.slice(0, -2));
              repl.dist.push(tipo === "C" ? K / spotOk(c, dia) - 1 : 1 - K / spotOk(c, dia));
            } else suma(repl.bueno, d);
          }
        }
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym} · ${entradas} entradas · ${opsGlob.toLocaleString("es-ES")} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD — antes de mirar ningún resultado
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}`);
console.log("  SANIDAD");
console.log(`${"═".repeat(100)}`);
console.log(`  días de entrada usados (uno al mes por ticker) : ${entradas.toLocaleString("es-ES")}`);
console.log(`  entradas descartadas por no poder deducir el spot: ${sinSpot}`);
console.log(`  combinaciones sin contrato que encaje (strike demasiado lejos o ask por debajo del umbral): ${sinContrato.toLocaleString("es-ES")}`);
console.log(`  operaciones medidas : ${opsGlob.toLocaleString("es-ES")}`);
console.log(`  HUECOS descartados  : ${huecosGlob.toLocaleString("es-ES")} (${pct(huecosGlob / (huecosGlob + opsGlob))}) — de ellos ${grupoAusente.toLocaleString("es-ES")} por faltar el vencimiento entero en la cadena del día de salida`);
console.log(`  ficheros de cadena leídos: ${lecturas.toLocaleString("es-ES")} · no encontrados: ${fallos.toLocaleString("es-ES")}`);

{
  const c5 = celda(`${DISTS.indexOf(0.05)}|${DTES.indexOf(90)}|${SALIDAS.indexOf(23)}|0`);
  console.log(`\n  Coste de entrada, casilla 5% / 90 días / ask ≥ $0,10:`);
  console.log(`    prima media = ${pct(c5.sumCoste / c5.n)} del subyacente  (esperado entre 1% y 6% — si no, hay un fallo)`);
  console.log(`    distancia real media conseguida = ${pct(c5.sumDist / c5.n)}  (se pidió 5,0%)`);
  console.log(`    horquilla media = ${pct(c5.sumHorq / c5.n)} de la prima`);
  console.log(`    vencen sin valor = ${pct(c5.sinValor / c5.n)}`);
}
console.log(`\n  Coste de entrada y distancia real conseguida, por casilla de distancia (plazo 90, ask ≥ $0,10):`);
console.log(`  | distancia pedida | distancia real | prima / subyacente | horquilla | vencen sin valor |`);
console.log(`  |---|---|---|---|---|`);
for (let a = 0; a < DISTS.length; a++) {
  const c = celda(`${a}|${DTES.indexOf(90)}|${SALIDAS.indexOf(23)}|0`);
  if (!c.n) continue;
  console.log(`  | ${pct(DISTS[a])} | ${pct(c.sumDist / c.n)} | ${pct(c.sumCoste / c.n)} | ${pct(c.sumHorq / c.n)} | ${pct(c.sinValor / c.n)} |`);
}
console.log(`\n  Coste de entrada por plazo (5% fuera, ask ≥ $0,10):`);
console.log(`  | plazo | prima / subyacente | horquilla | vencen sin valor a los 23 días |`);
console.log(`  |---|---|---|---|`);
for (let j = 0; j < DTES.length; j++) {
  const c = celda(`${DISTS.indexOf(0.05)}|${j}|${SALIDAS.indexOf(23)}|0`);
  if (!c.n) continue;
  console.log(`  | ${DTES[j]} d | ${pct(c.sumCoste / c.n)} | ${pct(c.sumHorq / c.n)} | ${pct(c.sinValor / c.n)} |`);
}

// ── réplica del listón ──────────────────────────────────────────────────────
console.log(`\n${"═".repeat(100)}`);
console.log("  RÉPLICA DEL LISTÓN — ¿reproduce esta tubería el 1,03 conocido?");
console.log(`${"═".repeat(100)}`);
console.log(`  el listón publicado    : n=6.924 · acierta 33,3% · gana $2.852.081 · pierde $2.781.514 · RATIO 1,03`);
console.log(`  reproducido aquí       : n=${repl.laxa.n} · acierta ${pct(repl.laxa.win / repl.laxa.n)} · gana $${eur(repl.laxa.gan)} · pierde $${eur(repl.laxa.per)} · RATIO ${ratio(repl.laxa).toFixed(2)}`);
const dm = [...repl.dist].sort((a, b) => a - b);
console.log(`\n  PERO ese "5% fuera del dinero" NO era el 5%. Medido con el spot bueno, los contratos que`);
console.log(`  el listón compraba estaban de media al ${pct(media(repl.dist))} del dinero (mediana ${pct(dm[dm.length >> 1])}),`);
console.log(`  y el ${pct(repl.dist.filter((x) => x < 0).length / repl.dist.length)} de ellos estaban DENTRO del dinero, no fuera.`);
console.log(`  El mismo 5% / 90 días / 23, pero midiendo la distancia desde el precio de verdad:`);
console.log(`  corregido              : n=${repl.bueno.n} · acierta ${pct(repl.bueno.win / repl.bueno.n)} · gana $${eur(repl.bueno.gan)} · pierde $${eur(repl.bueno.per)} · RATIO ${ratio(repl.bueno).toFixed(2)}`);

// ════════════════════════════════════════════════════════════════════════════
// EL MAPA ENTERO
// ════════════════════════════════════════════════════════════════════════════
function mapa(m, etiqueta) {
  console.log(`\n${"═".repeat(100)}`);
  console.log(`  EL MAPA — RATIO DEL CONO (call+put). ${etiqueta}`);
  console.log(`  Filas = distancia fuera del dinero · columnas = plazo. El listón es 1,03.`);
  console.log(`${"═".repeat(100)}`);
  for (let s = 0; s < SALIDAS.length; s++) {
    const et = SALIDAS[s] === "V" ? "AGUANTAR A VENCIMIENTO" : `salir a los ${SALIDAS[s]} días de bolsa`;
    console.log(`\n  ── ${et} ──`);
    console.log(`  | dist \\ plazo | ${DTES.map((d) => `${d}d`.padStart(6)).join(" | ")} |`);
    console.log(`  |---|${DTES.map(() => "---").join("|")}|`);
    for (let a = 0; a < DISTS.length; a++) {
      const fila = [];
      for (let j = 0; j < DTES.length; j++) {
        const c = celdas.get(`${a}|${j}|${s}|${m}`);
        if (!c || c.n < 200) { fila.push("   n/d"); continue; }
        const r = ratio(c.T);
        const trunc = c.trunc / c.n > 0.5 ? "≡" : (c.trunc / c.n > 0.05 ? "·" : " ");
        fila.push((r.toFixed(2) + trunc).padStart(6));
      }
      console.log(`  | ${pct(DISTS[a]).padStart(5)} | ${fila.join(" | ")} |`);
    }
  }
  console.log(`\n  ≡ = más de la mitad de esas operaciones llegaron al vencimiento antes que al día de salida`);
  console.log(`      (la casilla es de hecho "aguantar a vencimiento").  · = entre el 5% y el 50%.`);
}
mapa(0, "ask mínimo $0,10 (la regla del listón)");
mapa(1, "SIN ask mínimo (cualquier ask > 0)");

// ── cuántas casillas pasan del listón ───────────────────────────────────────
function inventario(m, etiqueta) {
  const lista = [];
  for (let a = 0; a < DISTS.length; a++) for (let j = 0; j < DTES.length; j++) for (let s = 0; s < SALIDAS.length; s++) {
    const c = celdas.get(`${a}|${j}|${s}|${m}`);
    if (!c || c.n < 200) continue;
    lista.push({ a, j, s, c, r: ratio(c.T), degenerada: c.trunc / c.n > 0.5 });
  }
  const validas = lista.filter((x) => !x.degenerada || SALIDAS[x.s] === "V");
  const sobre = validas.filter((x) => x.r > 1.03);
  console.log(`\n  ${etiqueta}: ${lista.length} casillas con muestra suficiente, ${validas.length} no degeneradas.`);
  console.log(`    por encima del listón (1,03): ${sobre.length}  (${pct(sobre.length / validas.length)})`);
  console.log(`    por encima de 1,10: ${validas.filter((x) => x.r > 1.10).length} · por encima de 1,20: ${validas.filter((x) => x.r > 1.20).length} · por debajo de 1,00: ${validas.filter((x) => x.r < 1.00).length}`);
  return lista;
}
console.log(`\n${"═".repeat(100)}`);
console.log("  ¿CUÁNTAS CASILLAS BATEN EL LISTÓN?");
console.log(`${"═".repeat(100)}`);
const lista0 = inventario(0, "con ask mínimo $0,10");
const lista1 = inventario(1, "sin ask mínimo");

// ── el podio ────────────────────────────────────────────────────────────────
function ficha(x, m) {
  const c = x.c;
  const et = SALIDAS[x.s] === "V" ? "vencimiento" : `${SALIDAS[x.s]}d bolsa`;
  return `${pct(DISTS[x.a]).padStart(5)} / ${String(DTES[x.j]).padStart(3)}d / ${et.padEnd(12)}` +
    ` | n=${String(c.n).padStart(5)} | cono ${ratio(c.T).toFixed(2).padStart(5)} | calls ${ratio(c.C).toFixed(2).padStart(5)} | puts ${ratio(c.P).toFixed(2).padStart(5)}` +
    ` | acierta ${pct(c.T.win / c.T.n).padStart(6)} | gan.medio $${eur(c.T.gan / Math.max(1, c.T.win)).padStart(6)} | perd.medio $${eur(c.T.per / Math.max(1, c.T.n - c.T.win)).padStart(5)}` +
    ` | mayor $${eur(c.T.max).padStart(7)}`;
}
for (const [m, lista, et] of [[0, lista0, "ask ≥ $0,10"], [1, lista1, "sin ask mínimo"]]) {
  console.log(`\n${"═".repeat(100)}`);
  console.log(`  EL PODIO — ${et}  (excluidas las casillas degeneradas, salvo las de vencimiento)`);
  console.log(`${"═".repeat(100)}`);
  const ord = lista.filter((x) => !x.degenerada || SALIDAS[x.s] === "V").sort((a, b) => b.r - a.r);
  for (const x of ord.slice(0, 15)) console.log("  " + ficha(x, m));
  console.log(`  ... y la peor:`);
  for (const x of ord.slice(-3)) console.log("  " + ficha(x, m));
}

// ════════════════════════════════════════════════════════════════════════════
// LAS TRES PREGUNTAS QUE HAY QUE CONTESTAR EXPLÍCITAMENTE
// ════════════════════════════════════════════════════════════════════════════
function agrega(filtro, m) {
  const t = acc(), cc = acc(), pp = acc();
  let n = 0, coste = 0, dist = 0;
  for (let a = 0; a < DISTS.length; a++) for (let j = 0; j < DTES.length; j++) for (let s = 0; s < SALIDAS.length; s++) {
    if (!filtro(a, j, s)) continue;
    const c = celdas.get(`${a}|${j}|${s}|${m}`);
    if (!c || c.n < 200) continue;
    if (c.trunc / c.n > 0.5 && SALIDAS[s] !== "V") continue;
    for (const [dst, src] of [[t, c.T], [cc, c.C], [pp, c.P]]) { dst.n += src.n; dst.win += src.win; dst.gan += src.gan; dst.per += src.per; dst.max = Math.max(dst.max, src.max); }
    n += c.n; coste += c.sumCoste; dist += c.sumDist;
  }
  return { t, cc, pp, n, coste: coste / n, dist: dist / n };
}
console.log(`\n${"═".repeat(100)}`);
console.log("  1) ALEJARSE DEL DINERO — ¿más convexo o sólo más caro por el tick?");
console.log(`${"═".repeat(100)}`);
console.log(`  (promediando todas las casillas de plazo y salida no degeneradas)`);
console.log(`  | distancia | ask ≥ $0,10: cono / calls / puts / acierto | sin ask mínimo: cono / calls / puts / acierto | prima |`);
console.log(`  |---|---|---|---|`);
for (let a = 0; a < DISTS.length; a++) {
  const x0 = agrega((aa) => aa === a, 0), x1 = agrega((aa) => aa === a, 1);
  console.log(`  | ${pct(DISTS[a])} | ${ratio(x0.t).toFixed(2)} / ${ratio(x0.cc).toFixed(2)} / ${ratio(x0.pp).toFixed(2)} / ${pct(x0.t.win / x0.t.n)} | ${ratio(x1.t).toFixed(2)} / ${ratio(x1.cc).toFixed(2)} / ${ratio(x1.pp).toFixed(2)} / ${pct(x1.t.win / x1.t.n)} | ${pct(x0.coste)} |`);
}
console.log(`\n${"═".repeat(100)}`);
console.log("  2) EL PLAZO — menos desgaste por día, pero más prima que recuperar");
console.log(`${"═".repeat(100)}`);
console.log(`  | plazo | ask ≥ $0,10: cono / calls / puts / acierto | sin ask mínimo: cono | prima |`);
console.log(`  |---|---|---|---|`);
for (let j = 0; j < DTES.length; j++) {
  const x0 = agrega((a, jj) => jj === j, 0), x1 = agrega((a, jj) => jj === j, 1);
  console.log(`  | ${DTES[j]} d | ${ratio(x0.t).toFixed(2)} / ${ratio(x0.cc).toFixed(2)} / ${ratio(x0.pp).toFixed(2)} / ${pct(x0.t.win / x0.t.n)} | ${ratio(x1.t).toFixed(2)} | ${pct(x0.coste)} |`);
}
console.log(`\n${"═".repeat(100)}`);
console.log("  3) AGUANTAR A VENCIMIENTO CONTRA SALIR ANTES — la comparación que nadie había hecho");
console.log(`${"═".repeat(100)}`);
console.log(`  | salida | ask ≥ $0,10: cono / calls / puts | acierto | ganador medio | perdedor medio | mayor billete | sin ask mínimo: cono |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (let s = 0; s < SALIDAS.length; s++) {
  const x0 = agrega((a, j, ss) => ss === s, 0), x1 = agrega((a, j, ss) => ss === s, 1);
  if (!x0.t.n) continue;
  const et = SALIDAS[s] === "V" ? "**vencimiento**" : `${SALIDAS[s]} d bolsa`;
  console.log(`  | ${et} | ${ratio(x0.t).toFixed(2)} / ${ratio(x0.cc).toFixed(2)} / ${ratio(x0.pp).toFixed(2)} | ${pct(x0.t.win / x0.t.n)} | $${eur(x0.t.gan / x0.t.win)} | $${eur(x0.t.per / (x0.t.n - x0.t.win))} | $${eur(x0.t.max)} | ${ratio(x1.t).toFixed(2)} |`);
}
console.log(`\n  Mismo cuadro pero SÓLO con las casillas donde salir antes no llega al vencimiento`);
console.log(`  (distancia libre, plazo ≥ 90 días, para que las 7 salidas sean comparables de verdad):`);
console.log(`  | salida | cono | calls | puts | acierto | n |`);
console.log(`  |---|---|---|---|---|---|`);
for (let s = 0; s < SALIDAS.length; s++) {
  const x = agrega((a, j, ss) => ss === s && DTES[j] >= 90, 0);
  if (!x.t.n) continue;
  const et = SALIDAS[s] === "V" ? "**vencimiento**" : `${SALIDAS[s]} d bolsa`;
  console.log(`  | ${et} | ${ratio(x.t).toFixed(2)} | ${ratio(x.cc).toFixed(2)} | ${ratio(x.pp).toFixed(2)} | ${pct(x.t.win / x.t.n)} | ${x.t.n.toLocaleString("es-ES")} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// LA GANADORA, A EXAMEN
// ════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set([].concat(...[...celdas.values()].map((c) => [...c.anos.keys()])))].sort();

function examen(x, m, titulo) {
  const c = x.c;
  console.log(`\n${"═".repeat(100)}`);
  console.log(`  ${titulo}: ${pct(DISTS[x.a])} fuera · ${DTES[x.j]} días de plazo · salir ${SALIDAS[x.s] === "V" ? "a vencimiento" : `a los ${SALIDAS[x.s]} días de bolsa`} · ${m === 0 ? "ask ≥ $0,10" : "sin ask mínimo"}`);
  console.log(`${"═".repeat(100)}`);
  console.log(`  cono  : n=${c.T.n} · acierta ${pct(c.T.win / c.T.n)} · gana $${eur(c.T.gan)} · pierde $${eur(c.T.per)} · RATIO ${ratio(c.T).toFixed(2)}`);
  console.log(`  calls : n=${c.C.n} · acierta ${pct(c.C.win / c.C.n)} · RATIO ${ratio(c.C).toFixed(2)}`);
  console.log(`  puts  : n=${c.P.n} · acierta ${pct(c.P.win / c.P.n)} · RATIO ${ratio(c.P).toFixed(2)}`);
  console.log(`  ganador medio $${eur(c.T.gan / c.T.win)} · perdedor medio $${eur(c.T.per / (c.T.n - c.T.win))} · vencen sin valor ${pct(c.sinValor / c.n)}`);
  console.log(`  mayor billete: $${eur(c.mayor.d)} (${c.mayor.sym} ${c.mayor.tipo} ${c.mayor.K} venc. ${c.mayor.exp}, entrada ${c.mayor.dia})`);
  console.log(`  ratio quitando ESE evento: ${((c.T.gan - c.mayor.d) / c.T.per).toFixed(2)}`);
  const top10 = 0;
  console.log(`\n  Año a año:`);
  console.log(`  | año | n | ratio | acierta | gana | pierde |`);
  console.log(`  |---|---|---|---|---|---|`);
  let anosMalos = 0;
  for (const a of ANOS) {
    const y = c.anos.get(a);
    if (!y || y.n < 20) continue;
    if (ratio(y) < 1) anosMalos++;
    console.log(`  | ${a} | ${y.n} | **${ratio(y).toFixed(2)}** | ${pct(y.win / y.n)} | $${eur(y.gan)} | $${eur(y.per)} |`);
  }
  const tks = [...c.tks.entries()].map(([k, v]) => ({ k, v, r: ratio(v), neto: v.gan - v.per })).sort((a, b) => b.neto - a.neto);
  const totalGan = c.T.gan;
  let ac = 0, cuantos = 0;
  for (const t of tks) { if (t.v.gan <= 0) break; ac += t.v.gan; cuantos++; if (ac >= totalGan / 2) break; }
  console.log(`\n  Por ticker: ${tks.length} tickers · ${tks.filter((t) => t.r > 1).length} con ratio > 1 · ${cuantos} tickers aportan la mitad de todo lo ganado`);
  console.log(`  mejores: ${tks.slice(0, 5).map((t) => `${t.k} ${t.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  peores : ${tks.slice(-5).map((t) => `${t.k} ${t.r.toFixed(2)}`).join(" · ")}`);
  // el ratio quitando el mejor ticker
  const sinMejor = { gan: c.T.gan - tks[0].v.gan, per: c.T.per - tks[0].v.per };
  console.log(`  ratio quitando ${tks[0].k} entero: ${(sinMejor.gan / sinMejor.per).toFixed(2)}`);
  console.log(`  años con ratio por debajo de 1: ${anosMalos} de ${ANOS.filter((a) => (c.anos.get(a)?.n ?? 0) >= 20).length}`);
  return { anosMalos, cuantos, tks };
}

function vecindad(x, m) {
  console.log(`\n  Vecindad de la ganadora (¿meseta o diente solitario?) — ratio del cono:`);
  for (let da = -1; da <= 1; da++) for (let dj = -1; dj <= 1; dj++) {
    const a = x.a + da, j = x.j + dj;
    if (a < 0 || a >= DISTS.length || j < 0 || j >= DTES.length) continue;
    const c = celdas.get(`${a}|${j}|${x.s}|${m}`);
    if (!c || c.n < 200) continue;
    const marca = da === 0 && dj === 0 ? "  ←— ELLA" : "";
    console.log(`    ${pct(DISTS[a]).padStart(5)} / ${String(DTES[j]).padStart(3)}d : ${ratio(c.T).toFixed(2)} (n=${c.T.n})${marca}`);
  }
  console.log(`  Y cambiando sólo la salida, con la misma distancia y plazo:`);
  for (let s = 0; s < SALIDAS.length; s++) {
    const c = celdas.get(`${x.a}|${x.j}|${s}|${m}`);
    if (!c || c.n < 200) continue;
    const deg = c.trunc / c.n > 0.5 ? "  (llega al vencimiento)" : "";
    console.log(`    salida ${String(SALIDAS[s]).padStart(3)} : ${ratio(c.T).toFixed(2)} (n=${c.T.n})${deg}${s === x.s ? "  ←— ELLA" : ""}`);
  }
}

const ganadora = lista0.filter((x) => !x.degenerada || SALIDAS[x.s] === "V").sort((a, b) => b.r - a.r)[0];
const infoG = examen(ganadora, 0, "LA GANADORA (ask ≥ $0,10)");
vecindad(ganadora, 0);

const liston = { a: DISTS.indexOf(0.05), j: DTES.indexOf(90), s: SALIDAS.indexOf(23), c: celda(`${DISTS.indexOf(0.05)}|${DTES.indexOf(90)}|${SALIDAS.indexOf(23)}|0`) };
liston.r = ratio(liston.c.T);
examen(liston, 0, "EL LISTÓN, en esta misma tubería");

// ════════════════════════════════════════════════════════════════════════════
// EL FILTRO QUE DECIDE — con 252 puertas, la ganadora sola no vale nada.
// Una casilla sólo cuenta si bate el listón en las DOS mitades del período y
// aguanta las cuatro crisis por separado.
// ════════════════════════════════════════════════════════════════════════════
function mitades(c) {
  const a = acc(), b = acc();
  for (const [y, v] of c.anos) {
    const d = Number(y) <= 2020 ? a : b;
    d.n += v.n; d.win += v.win; d.gan += v.gan; d.per += v.per;
  }
  return [ratio(a), ratio(b), a.n, b.n];
}
const CRISIS = ["2018", "2020", "2022", "2025"];
console.log(`\n${"═".repeat(100)}`);
console.log("  EL FILTRO QUE DECIDE — ¿alguna casilla aguanta partida en dos y en las cuatro crisis?");
console.log(`${"═".repeat(100)}`);
for (const [m, lista, et] of [[0, lista0, "ask ≥ $0,10"], [1, lista1, "sin ask mínimo"]]) {
  const validas = lista.filter((x) => !x.degenerada || SALIDAS[x.s] === "V");
  const dobles = validas.filter((x) => { const [p, s] = mitades(x.c); return p > 1.03 && s > 1.03; });
  const todosAnos = validas.filter((x) => ANOS.every((y) => { const v = x.c.anos.get(y); return !v || v.n < 20 || ratio(v) >= 1.00; }));
  const crisisOk = validas.filter((x) => CRISIS.every((y) => { const v = x.c.anos.get(y); return v && v.n >= 20 && ratio(v) >= 1.00; }));
  console.log(`\n  ${et}: de ${validas.length} casillas no degeneradas —`);
  console.log(`    baten 1,03 en 2016-2020 Y en 2021-2026 : ${dobles.length}`);
  console.log(`    ningún año por debajo de 1,00           : ${todosAnos.length}`);
  console.log(`    las cuatro crisis (2018/2020/2022/2025) por encima de 1,00 : ${crisisOk.length}`);
  if (crisisOk.length) for (const x of crisisOk.slice(0, 10)) console.log(`      · ${pct(DISTS[x.a])} / ${DTES[x.j]}d / ${SALIDAS[x.s]} → cono ${x.r.toFixed(2)}`);
}
console.log(`\n  Las 12 mejores casillas (ask ≥ $0,10), año a año — ratio del cono:`);
console.log(`  | casilla | total | ${ANOS.join(" | ")} | 16-20 | 21-26 |`);
console.log(`  |---|---|${ANOS.map(() => "---").join("|")}|---|---|`);
for (const x of lista0.filter((y) => !y.degenerada || SALIDAS[y.s] === "V").sort((a, b) => b.r - a.r).slice(0, 12)) {
  const fila = ANOS.map((y) => { const v = x.c.anos.get(y); return (!v || v.n < 20) ? " n/d" : ratio(v).toFixed(2); });
  const [p, s] = mitades(x.c);
  console.log(`  | ${pct(DISTS[x.a])}/${DTES[x.j]}d/${SALIDAS[x.s]} | **${x.r.toFixed(2)}** | ${fila.join(" | ")} | ${p.toFixed(2)} | ${s.toFixed(2)} |`);
}
{
  const [p, s] = mitades(liston.c);
  console.log(`  | EL LISTÓN 5%/90d/23 | ${liston.r.toFixed(2)} | ${ANOS.map((y) => { const v = liston.c.anos.get(y); return (!v || v.n < 20) ? " n/d" : ratio(v).toFixed(2); }).join(" | ")} | ${p.toFixed(2)} | ${s.toFixed(2)} |`);
}

// ── la casilla ESTABLE: la que maximiza la PEOR de sus dos mitades ──────────
const estable = lista0.filter((x) => !x.degenerada || SALIDAS[x.s] === "V")
  .map((x) => { const [p, s] = mitades(x.c); return { ...x, peor: Math.min(p, s) }; })
  .sort((a, b) => b.peor - a.peor)[0];
const infoE = examen(estable, 0, "LA CASILLA ESTABLE (la que mejor aguanta la mitad más floja)");
vecindad(estable, 0);

// ── resumen para el informe ─────────────────────────────────────────────────
console.log(`\n${"═".repeat(100)}`);
console.log("  RESUMEN");
console.log(`${"═".repeat(100)}`);
const gc = ganadora.c;
console.log(`  celdas medidas: ${DISTS.length * DTES.length * SALIDAS.length * ASKMINS.length}`);
console.log(`  mejor casilla (ask ≥ $0,10): ${pct(DISTS[ganadora.a])} fuera · ${DTES[ganadora.j]} días · salir ${SALIDAS[ganadora.s] === "V" ? "a vencimiento" : SALIDAS[ganadora.s] + " días de bolsa"}`);
console.log(`  ratio cono ${ratio(gc.T).toFixed(3)} · calls ${ratio(gc.C).toFixed(3)} · puts ${ratio(gc.P).toFixed(3)} · n=${gc.T.n} · acierto ${pct(gc.T.win / gc.T.n)}`);
console.log(`  años por debajo de 1: ${infoG.anosMalos} · tickers que aportan la mitad: ${infoG.cuantos}`);
console.log(`  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"═".repeat(100)}\n`);
