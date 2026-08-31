// ¿CUÁL TICKER ESTÁ BARATO HOY COMPARADO CON LOS DEMÁS?
//
// ═══ LA PREGUNTA ════════════════════════════════════════════════════════════════════════════
//
// Todas las demás familias preguntan CUÁNDO comprar: miran un ticker y lo comparan consigo
// mismo en el tiempo. Ésta pregunta QUÉ comprar: mira los ~35 tickers el MISMO día y los ordena
// del más barato al más caro. Comparar dos cosas a la vez suele ser más robusto que comparar
// una cosa consigo misma, porque las dos viven el mismo mercado: si hoy todo está caro porque
// hay miedo, eso afecta a los 35 por igual y se cancela al ordenarlos.
//
// ═══ CÓMO SE MIDE "LO CARO QUE ESTÁ" ════════════════════════════════════════════════════════
//
//   lo que cuesta el movimiento  =  (cuna al dinero) / precio,  dividido por raíz(plazo/365)
//   lo que la acción se mueve    =  desviación de los últimos 60 días de bolsa, anualizada
//   CARESTÍA = lo primero entre lo segundo.   Bajo = barato.
//
// La "cuna al dinero" es el strike más cercano al contado, call + put, a punto medio. Eso es
// SEÑAL, no dinero: para comprar se sigue pagando el ASK y para vender se cobra el BID.
// Dividir por raíz(plazo) es aritmética, no un modelo de precios: sólo pone en la misma escala
// un plazo de 55 días y uno de 66. NO hay Black-Scholes en ninguna parte.
//
// LA SEÑAL ES EL PUESTO EN LA FILA, no el valor. Cada día se ordenan los tickers con datos y se
// compra el 1º, el 2º, el 3º… Así da igual que el mercado entero esté caro o barato.
//
// ═══ EL CONTADO, ARREGLADO ══════════════════════════════════════════════════════════════════
// Paridad put-call SÓLO en el vencimiento más cercano (copiado de z1-la-rejilla-completa.mjs).
// Mirando toda la cadena a la vez, los vencimientos lejanos cruzan en el precio A FUTURO y el
// contado sale inflado.
//
// ═══ SPLITS ═════════════════════════════════════════════════════════════════════════════════
// Las cadenas NO están ajustadas por splits. Un 4x1 aparece como un −75% en un día y envenenaría
// la desviación de 60 días. Se descarta cualquier día cuyo movimiento pase del ±35% ANTES de
// medir — es una regla causal (mira sólo ese día), no una tabla de splits construida con el
// futuro. Se cuenta cuántos días se tiran.
//
// ═══ EL ENVASE (fijado, no se toca) ═════════════════════════════════════════════════════════
//   A: 10% fuera del dinero · 60 días de plazo · vender a los 30 días de bolsa   (listón 1.11)
//   B:  5% fuera del dinero · 90 días de plazo · vender a los 30 días de bolsa
//   Se compra al ASK, se vende al BID. Una entrada al mes. Call y put por separado.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   · ASK para comprar, BID para vender. Nunca punto medio en el dinero.
//   · Ningún modelo de precios.
//   · Un HUECO (falta la cadena del día de salida) se descarta y se cuenta aparte. Un contrato
//     que está en la cadena pero no cotiza vale 0: eso es un dato real.
//   · SÓLO EL PASADO: la desviación de 60 días termina el día ANTERIOR a la compra.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y7-cual-ticker-esta-barato.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE = "scripts/cache-theta/_y7-serie.json";

const APUESTA = 1000;
const TOLK = 0.50;            // cuánto puede apartarse el strike disponible de la distancia pedida
const ASKMIN = 0.10;          // el mismo umbral del listón publicado
const VENTANA_RV = 60;        // días de bolsa para la desviación realizada
const SALIDA = 30;            // días de bolsa hasta vender
const MIN_UNIVERSO = 12;      // mínimo de tickers ese día para que la fila signifique algo
const SALTO_BARAJADO = 7;     // desplazamiento fijo en meses para el control (nunca Math.random)

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60 },
  { id: "B", dist: 0.05, dte: 90 },
];

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (100 * x).toFixed(1) + "%";
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));

// ── índice de días por ticker ───────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
// SPXW y SPX son el mismo subyacente que SPX; NDX/SPX son índices sin cadena completa temprana,
// pero se dejan: la fila los ordena igual que a los demás. No se excluye nada a mano.
let TICKERS = [...diasPorSim.keys()].sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));

const TOTDIAS = TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${TOTDIAS.toLocaleString("en-US")} días de cadena`);

// ── lectura de cadenas ──────────────────────────────────────────────────────
let lecturas = 0, noEncontrados = 0;
function cadena(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) { noEncontrados++; return null; }
  try { const v = JSON.parse(readFileSync(f, "utf8")); lecturas++; return v; } catch { return null; }
}

/** Contado por paridad put-call EN EL VENCIMIENTO MÁS CERCANO. */
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

/** Cuna al dinero en el vencimiento más cercano a `dteObj`: (call+put)/contado, a punto medio. */
function cunaAlDinero(c, hoy, S, dteObj) {
  let exp = null, md = Infinity, dtr = 0;
  for (const e of Object.keys(c)) {
    const d = dteDe(hoy, e);
    if (d < 1) continue;
    const x = Math.abs(d - dteObj);
    if (x < md) { md = x; exp = e; dtr = d; }
  }
  if (!exp || md > tolDte(dteObj)) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  if (dm > S * 0.05) return null;          // no hay strike razonablemente al dinero
  const C = g[`${K}|C`], P = g[`${K}|P`];
  if (!(C[1] > 0) || !(P[1] > 0)) return null;
  const mid = (C[0] + C[1]) / 2 + (P[0] + P[1]) / 2;
  if (!(mid > 0)) return null;
  return { cuna: mid / S, dte: dtr };
}

/** Mejor contrato a `dist` fuera del dinero en el vencimiento más cercano a `dteObj`. */
function contrato(c, hoy, S, dteObj, dist, tipo) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) {
    const d = dteDe(hoy, e);
    if (d < 1) continue;
    const x = Math.abs(d - dteObj);
    if (x < md) { md = x; exp = e; }
  }
  if (!exp || md > tolDte(dteObj)) return null;
  const g = c[exp];
  const obj = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mejor = null, dd = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo) continue;
    if (!(ba[1] >= ASKMIN)) continue;
    const K = Number(cl.slice(0, -2));
    const d = Math.abs(K - obj);
    if (d < dd) { dd = d; mejor = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mejor) return null;
  const distReal = tipo === "C" ? mejor.K / S - 1 : 1 - mejor.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return { ...mejor, exp, distReal, dte: dteDe(hoy, exp) };
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 1 — serie diaria por ticker: contado + cuna al dinero de 60 y 90 días.
// Se cachea a disco: son 2,6 GB de cadenas y una segunda pasada no aporta nada.
// ════════════════════════════════════════════════════════════════════════════
let SERIE;
if (existsSync(CACHE) && !process.env.REHACER) {
  SERIE = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log(`## serie diaria leída de la caché (${Object.keys(SERIE).length} tickers)`);
} else {
  SERIE = {};
  const t0 = Date.now();
  let hechos = 0;
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const s = {};
    for (const dia of dias) {
      const c = cadena(sym, dia);
      if (!c) continue;
      const S = spotOk(c, dia);
      if (!S) continue;
      const c60 = cunaAlDinero(c, dia, S, 60);
      const c90 = cunaAlDinero(c, dia, S, 90);
      s[dia] = [S, c60 ? +c60.cuna.toFixed(6) : null, c60 ? c60.dte : 0,
                   c90 ? +c90.cuna.toFixed(6) : null, c90 ? c90.dte : 0];
    }
    SERIE[sym] = s;
    hechos++;
    process.stderr.write(`\r   serie ${hechos}/${TICKERS.length} · ${sym} · ${Object.keys(s).length} días · ${Math.round((Date.now() - t0) / 1000)}s      `);
  }
  process.stderr.write("\n");
  writeFileSync(CACHE, JSON.stringify(SERIE));
  console.log(`## serie diaria construida y guardada en ${CACHE}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 2 — desviación realizada de 60 días, SÓLO CON EL PASADO
// ════════════════════════════════════════════════════════════════════════════
let saltosRaros = 0, retTot = 0;
const RV = {};   // sym -> {dia: desviación anualizada usando hasta el día ANTERIOR}
for (const sym of TICKERS) {
  const s = SERIE[sym] || {};
  const dias = Object.keys(s).sort();
  const rv = {};
  const rets = [];         // log-retornos limpios, en orden
  for (let i = 0; i < dias.length; i++) {
    // la ventana termina AYER: se calcula ANTES de meter el retorno de hoy
    if (rets.length >= VENTANA_RV) {
      const v = rets.slice(-VENTANA_RV);
      const d = sd(v);
      if (d > 0) rv[dias[i]] = d * Math.sqrt(252);
    }
    if (i > 0) {
      const a = s[dias[i - 1]][0], b = s[dias[i]][0];
      if (a > 0 && b > 0) {
        const r = Math.log(b / a);
        retTot++;
        if (Math.abs(r) > 0.35) saltosRaros++;    // corporate action, no movimiento de mercado
        else rets.push(r);
      }
    }
  }
  RV[sym] = rv;
}
console.log(`## desviación de ${VENTANA_RV} días lista · ${retTot.toLocaleString("en-US")} retornos · ${saltosRaros} descartados por salto >35% (splits)`);

// ════════════════════════════════════════════════════════════════════════════
// PASO 3 — días de entrada COMUNES (uno al mes) y la fila de ese día
// ════════════════════════════════════════════════════════════════════════════
const diasConDatos = new Map();   // dia -> [syms]
for (const sym of TICKERS) for (const dia of Object.keys(SERIE[sym] || {})) {
  if (!diasConDatos.has(dia)) diasConDatos.set(dia, []);
  diasConDatos.get(dia).push(sym);
}
const todosDias = [...diasConDatos.keys()].sort();
const entradaDeMes = new Map();
for (const d of todosDias) {
  const mes = d.slice(0, 6);
  if (!entradaDeMes.has(mes) && diasConDatos.get(d).length >= MIN_UNIVERSO) entradaDeMes.set(mes, d);
}
const DIAS_ENTRADA = [...entradaDeMes.values()].sort();
console.log(`## ${DIAS_ENTRADA.length} días de entrada (el primero de cada mes con al menos ${MIN_UNIVERSO} tickers): ${DIAS_ENTRADA[0]} → ${DIAS_ENTRADA[DIAS_ENTRADA.length - 1]}`);

// filas por día y por envase
const FILA = { A: new Map(), B: new Map() };   // dia -> [{sym, carestia}] ordenado de barato a caro
let sinCuna = 0, sinRV = 0;
for (const dia of DIAS_ENTRADA) {
  for (const env of ENVASES) {
    const iC = env.id === "A" ? 1 : 3, iD = env.id === "A" ? 2 : 4;
    const lista = [];
    for (const sym of diasConDatos.get(dia)) {
      const r = SERIE[sym][dia];
      const cuna = r[iC], dte = r[iD];
      if (!(cuna > 0) || !(dte > 0)) { sinCuna++; continue; }
      const rv = RV[sym]?.[dia];
      if (!(rv > 0)) { sinRV++; continue; }
      const costeAnual = cuna / Math.sqrt(dte / 365);
      lista.push({ sym, carestia: costeAnual / rv, rv, costeAnual });
    }
    lista.sort((a, b) => a.carestia - b.carestia);
    FILA[env.id].set(dia, lista);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 4 — las operaciones. Envase fijo, se compra al ASK y se vende al BID.
// ════════════════════════════════════════════════════════════════════════════
const OPS = { A: [], B: [] };
let huecos = 0, opsN = 0, sinContrato = 0, sinSpot = 0;
const t1 = Date.now();

for (let ie = 0; ie < DIAS_ENTRADA.length; ie++) {
  const dia = DIAS_ENTRADA[ie];
  for (const sym of diasConDatos.get(dia)) {
    const dias = diasPorSim.get(sym);
    const i = dias.indexOf(dia);
    if (i < 0) continue;
    const dSal = dias[i + SALIDA] ?? null;
    const c = cadena(sym, dia);
    if (!c) continue;
    const S = spotOk(c, dia);
    if (!S) { sinSpot++; continue; }
    const memoSal = new Map();
    const cadSalida = (d) => { if (!memoSal.has(d)) memoSal.set(d, cadena(sym, d)); return memoSal.get(d); };

    for (const env of ENVASES) {
      const fila = FILA[env.id].get(dia);
      const pos = fila.findIndex((x) => x.sym === sym);
      if (pos < 0) continue;                        // sin señal ese día: fuera del estudio
      for (const tipo of ["C", "P"]) {
        const ct = contrato(c, dia, S, env.dte, env.dist, tipo);
        if (!ct) { sinContrato++; continue; }
        if (!dSal) { huecos++; continue; }
        let salidaDia = dSal, trunc = 0;
        if (salidaDia >= ct.exp) { salidaDia = ct.exp; trunc = 1; }
        const cs = cadSalida(salidaDia);
        if (!cs) { huecos++; continue; }
        const grupo = cs[ct.exp];
        if (!grupo) { huecos++; continue; }
        const salida = grupo[ct.clave]?.[0] ?? 0;   // sin puja = 0. Dato real.
        opsN++;
        // ── ¿qué hizo DESPUÉS el subyacente? (diagnóstico, no entra en la decisión) ──
        const S0 = SERIE[sym][dia]?.[0], S1 = SERIE[sym][salidaDia]?.[0];
        let movFut = null;
        if (S0 > 0 && S1 > 0) {
          const r = Math.abs(Math.log(S1 / S0));
          const ndias = dias.indexOf(salidaDia) - i;
          if (r <= 0.35 && ndias > 0) movFut = r / Math.sqrt(ndias / 252);   // anualizado
        }
        OPS[env.id].push({
          sym, dia, ie, ano: dia.slice(0, 4), tipo,
          pos, nfila: fila.length, frac: fila.length > 1 ? pos / (fila.length - 1) : 0,
          carestia: fila[pos].carestia, rv: fila[pos].rv, costeAnual: fila[pos].costeAnual, movFut,
          d: APUESTA * (salida - ct.ask) / ct.ask,
          coste: ct.ask / S, horq: (ct.ask - ct.bid) / ct.ask,
          cero: salida === 0 ? 1 : 0, trunc,
        });
      }
    }
  }
  if (ie % 10 === 0) process.stderr.write(`\r   ops ${ie}/${DIAS_ENTRADA.length} · ${opsN.toLocaleString("en-US")} operaciones · ${Math.round((Date.now() - t1) / 1000)}s      `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log("  SANIDAD");
console.log(`${"═".repeat(96)}`);
console.log(`  operaciones medidas         : ${opsN.toLocaleString("en-US")}   (A: ${OPS.A.length.toLocaleString("en-US")} · B: ${OPS.B.length.toLocaleString("en-US")})`);
console.log(`  HUECOS descartados          : ${huecos.toLocaleString("en-US")}  (${pct(huecos / (huecos + opsN))})`);
console.log(`  combinaciones sin contrato   : ${sinContrato.toLocaleString("en-US")}  (strike demasiado lejos, plazo fuera de tolerancia o ask < $${ASKMIN.toFixed(2)})`);
console.log(`  entradas sin contado         : ${sinSpot}`);
console.log(`  días-ticker sin cuna al dinero: ${sinCuna.toLocaleString("en-US")} · sin desviación de 60 días: ${sinRV.toLocaleString("en-US")}`);
console.log(`  ficheros de cadena leídos    : ${lecturas.toLocaleString("en-US")} · no encontrados: ${noEncontrados.toLocaleString("en-US")}`);
for (const env of ENVASES) {
  const o = OPS[env.id];
  const tamFila = media(o.map((x) => x.nfila));
  console.log(`  ENVASE ${env.id} (${pct(env.dist)} fuera · ${env.dte} días): prima media = ${pct(media(o.map((x) => x.coste)))} del subyacente · horquilla = ${pct(media(o.map((x) => x.horq)))} de la prima · vencen sin valor = ${pct(media(o.map((x) => x.cero)))} · truncadas al vencimiento = ${o.filter((x) => x.trunc).length}`);
  console.log(`             tamaño medio de la fila = ${tamFila.toFixed(1)} tickers`);
}

// ════════════════════════════════════════════════════════════════════════════
// EL MEDIDOR
// ════════════════════════════════════════════════════════════════════════════
function mide(ops) {
  let gan = 0, per = 0, win = 0;
  for (const o of ops) { if (o.d > 0) { gan += o.d; win++; } else per += -o.d; }
  return {
    n: ops.length, ratio: per > 0 ? gan / per : NaN, acierto: ops.length ? win / ops.length : NaN,
    gan, per, neto: gan - per,
    ganMedio: win ? gan / win : NaN, perMedio: ops.length - win ? per / (ops.length - win) : NaN,
  };
}
const linea = (etq, m) => `  ${etq.padEnd(28)} n=${String(m.n).padStart(6)}  ratio ${n2(m.ratio).padStart(5)}  acierto ${pct(m.acierto).padStart(6)}  ganador ${usd(m.ganMedio).padStart(8)}  perdedor ${usd(m.perMedio).padStart(6)}  neto ${usd(m.neto).padStart(10)}`;

const ANOS = [...new Set(OPS.A.map((o) => o.ano))].sort();
const AÑOS_CLAVE = ["2018", "2020", "2022", "2025"];
const ANOS_SPAN = (ANOS.length ? (Number(ANOS[ANOS.length - 1]) - Number(ANOS[0]) + 1) : 1);

for (const env of ENVASES) {
  const ops = OPS[env.id];
  const base = mide(ops);
  console.log(`\n${"═".repeat(96)}`);
  console.log(`  ENVASE ${env.id} — ${pct(env.dist)} fuera del dinero · ${env.dte} días · salir a los ${SALIDA} días de bolsa`);
  console.log(`${"═".repeat(96)}`);
  console.log(linea("SIN SEÑAL (todos)", base));

  // ── la escalera completa por puesto en la fila ────────────────────────────
  console.log(`\n  LA ESCALERA — por puesto en la fila (1 = el más barato del día)`);
  const maxPos = Math.max(...ops.map((o) => o.pos));
  for (let p = 0; p <= maxPos; p++) {
    const m = mide(ops.filter((o) => o.pos === p));
    if (m.n < 20) continue;
    console.log(linea(`   puesto ${String(p + 1).padStart(2)}`, m));
  }

  // ── por décimos de la fila (robusto al tamaño cambiante del universo) ─────
  console.log(`\n  POR TRAMOS de la fila (fracción del camino de barato a caro)`);
  for (let q = 0; q < 10; q++) {
    const m = mide(ops.filter((o) => o.frac >= q / 10 && o.frac < (q + 1) / 10 + (q === 9 ? 0.001 : 0)));
    console.log(linea(`   tramo ${q + 1}/10 ${q === 0 ? "(barato)" : q === 9 ? "(caro)" : ""}`, m));
  }

  // ── los cortes que pidió el encargo ──────────────────────────────────────
  console.log(`\n  LOS CORTES`);
  const cortes = {};
  for (const k of [3, 5, 10]) cortes[`top${k}`] = ops.filter((o) => o.pos < k);
  cortes["caros5"] = ops.filter((o) => o.pos >= o.nfila - 5);
  cortes["caros3"] = ops.filter((o) => o.pos >= o.nfila - 3);
  const etiq = { top3: "3 MÁS BARATOS", top5: "5 MÁS BARATOS", top10: "10 MÁS BARATOS", caros5: "5 MÁS CAROS (control)", caros3: "3 MÁS CAROS (control)" };
  for (const k of ["top3", "top5", "top10", "caros10", "caros5", "caros3"]) {
    if (!cortes[k]) continue;
    const m = mide(cortes[k]);
    console.log(linea(etiq[k], m) + `  · ${(m.n / ANOS_SPAN).toFixed(0)} ops/año`);
  }

  // ── año a año para los tres cortes baratos y el listón ────────────────────
  console.log(`\n  AÑO A AÑO (ratio · n)`);
  const cols = [["todos", ops], ["top10", cortes.top10], ["top5", cortes.top5], ["top3", cortes.top3], ["caros5", cortes.caros5]];
  console.log("   año   " + cols.map(([e]) => e.padStart(14)).join(""));
  for (const a of ANOS) {
    const fila = cols.map(([, arr]) => { const m = mide(arr.filter((o) => o.ano === a)); return `${n2(m.ratio)}·${m.n}`.padStart(14); }).join("");
    console.log(`   ${a}  ` + fila);
  }
  const bajo1 = (arr) => ANOS.filter((a) => { const m = mide(arr.filter((o) => o.ano === a)); return m.n > 0 && !(m.ratio >= 1); }).length;
  console.log("   años por debajo de 1: " + cols.map(([e, arr]) => `${e} ${bajo1(arr)}/${ANOS.length}`).join(" · "));

  // ── años clave por separado ──────────────────────────────────────────────
  console.log(`\n  LOS AÑOS QUE DECIDEN`);
  for (const a of AÑOS_CLAVE) {
    const m5 = mide(cortes.top5.filter((o) => o.ano === a)), mt = mide(ops.filter((o) => o.ano === a));
    console.log(`   ${a}: top5 ratio ${n2(m5.ratio)} (n=${m5.n})  ·  todos ${n2(mt.ratio)} (n=${mt.n})`);
  }
  // sin febrero-mayo de 2020
  const fuera2020 = (o) => !(o.ano === "2020" && ["02", "03", "04", "05"].includes(o.dia.slice(4, 6)));
  console.log(`   quitando feb-may de 2020: top5 ratio ${n2(mide(cortes.top5.filter(fuera2020)).ratio)}  ·  todos ${n2(mide(ops.filter(fuera2020)).ratio)}`);

  // ── ¿de cuántos tickers sale la mitad del dinero ganado? ──────────────────
  console.log(`\n  CONCENTRACIÓN (top5)`);
  const porTk = new Map();
  for (const o of cortes.top5) if (o.d > 0) porTk.set(o.sym, (porTk.get(o.sym) || 0) + o.d);
  const orden = [...porTk.entries()].sort((a, b) => b[1] - a[1]);
  const totGan = orden.reduce((a, x) => a + x[1], 0);
  let acum = 0, cuantos = 0;
  for (const [, g] of orden) { acum += g; cuantos++; if (acum >= totGan / 2) break; }
  console.log(`   hacen falta ${cuantos} tickers para juntar la mitad del dinero ganado (de ${orden.length} con ganancias)`);
  console.log(`   los 6 que más ponen: ` + orden.slice(0, 6).map(([s, g]) => `${s} ${usd(g)}`).join(" · "));

  // ── ¿la señal elige siempre los mismos? ──────────────────────────────────
  console.log(`\n  ¿SIEMPRE LOS MISMOS? — reparto de los elegidos (top5, por día-ticker)`);
  const veces = new Map();
  const diasSenal = new Set();
  for (const dia of DIAS_ENTRADA) {
    const f = FILA[env.id].get(dia); if (!f || !f.length) continue;
    diasSenal.add(dia);
    for (const x of f.slice(0, 5)) veces.set(x.sym, (veces.get(x.sym) || 0) + 1);
  }
  const nd = diasSenal.size;
  const ord = [...veces.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`   ${ord.length} tickers distintos aparecen entre los 5 más baratos, en ${nd} días de entrada`);
  console.log(`   los 10 más repetidos: ` + ord.slice(0, 10).map(([s, v]) => `${s} ${pct(v / nd)}`).join(" · "));
  const cuota = ord.map(([, v]) => v / (nd * 5));
  let ac = 0, ct = 0; for (const q of cuota) { ac += q; ct++; if (ac >= 0.5) break; }
  console.log(`   ${ct} tickers se llevan la mitad de las plazas (si fuera 1 por día sería una preferencia disfrazada)`);

  // ── EL BARAJADO: la misma señal con el día equivocado ─────────────────────
  const idxDia = new Map(DIAS_ENTRADA.map((d, i) => [d, i]));
  const rangoBarajado = new Map();   // `${dia}|${sym}` -> puesto según la fila de otro día
  for (let i = 0; i < DIAS_ENTRADA.length; i++) {
    const j = (i + SALTO_BARAJADO) % DIAS_ENTRADA.length;
    const otra = FILA[env.id].get(DIAS_ENTRADA[j]) || [];
    otra.forEach((x, p) => rangoBarajado.set(`${DIAS_ENTRADA[i]}|${x.sym}`, p));
  }
  const conBaraja = ops.map((o) => ({ ...o, posB: rangoBarajado.get(`${o.dia}|${o.sym}`) })).filter((o) => o.posB != null);
  console.log(`\n  EL BARAJADO (misma señal, la fila de ${SALTO_BARAJADO} meses después · desplazamiento fijo, sin azar)`);
  console.log(linea("   top5 BARAJADO", mide(conBaraja.filter((o) => o.posB < 5))));
  console.log(linea("   top3 BARAJADO", mide(conBaraja.filter((o) => o.posB < 3))));

  // ── call vs put ──────────────────────────────────────────────────────────
  console.log(`\n  POR LADO (top5)`);
  console.log(linea("   sólo CALLS", mide(cortes.top5.filter((o) => o.tipo === "C"))));
  console.log(linea("   sólo PUTS ", mide(cortes.top5.filter((o) => o.tipo === "P"))));

  // ── la carestía media de los elegidos, para ver que la señal SEPARA ──────
  const car = (arr) => media(arr.map((x) => x.carestia));
  const cB = [], cC = [];
  for (const dia of DIAS_ENTRADA) { const f = FILA[env.id].get(dia); if (!f || f.length < 10) continue; cB.push(car(f.slice(0, 5))); cC.push(car(f.slice(-5))); }
  console.log(`\n  CARESTÍA media: los 5 baratos = ${n2(media(cB))} · los 5 caros = ${n2(media(cC))}  (opción/movimiento real; 1.00 = la opción cuesta justo lo que la acción se mueve)`);

  // ── EL DIAGNÓSTICO: ¿el mercado ya sabe? ─────────────────────────────────
  // Si "barato" sólo significa "esta acción se va a mover MENOS que antes", entonces el descuento
  // no es un regalo: es un pronóstico correcto. Aquí se compara, por tramo de la fila:
  //   antes  = desviación de los 60 días PREVIOS (lo que se usó para ordenar)
  //   después= movimiento realizado durante la tenencia, anualizado (NO entra en la decisión)
  const conMov = ops.filter((o) => o.movFut != null);
  console.log(`\n  ¿EL MERCADO YA LO SABE? — movimiento ANTES vs DESPUÉS por tramo (n con dato = ${conMov.length.toLocaleString("en-US")})`);
  console.log(`    tramo            antes   después   después/antes   pagado   después/pagado`);
  for (let q = 0; q < 10; q += 3) {
    const g = conMov.filter((o) => o.frac >= q / 10 && o.frac < (q + 3) / 10 + (q === 9 ? 0.001 : 0));
    if (!g.length) continue;
    const antes = media(g.map((o) => o.rv)), desp = media(g.map((o) => o.movFut)), pag = media(g.map((o) => o.costeAnual));
    console.log(`    ${String(q + 1).padStart(2)}-${String(Math.min(10, q + 3)).padStart(2)}/10 (n=${String(g.length).padStart(5)})  ${pct(antes).padStart(6)}  ${pct(desp).padStart(7)}   ${n2(desp / antes).padStart(9)}   ${pct(pag).padStart(6)}   ${n2(desp / pag).padStart(9)}`);
  }
  const g0 = conMov.filter((o) => o.pos < 5), g1 = conMov.filter((o) => o.pos >= o.nfila - 5);
  const rr = (g) => media(g.map((o) => o.movFut)) / media(g.map((o) => o.costeAnual));
  console.log(`    los 5 BARATOS: se movieron ${pct(media(g0.map((o) => o.movFut)))} habiendo pagado ${pct(media(g0.map((o) => o.costeAnual)))} → ${n2(rr(g0))}`);
  console.log(`    los 5 CAROS  : se movieron ${pct(media(g1.map((o) => o.movFut)))} habiendo pagado ${pct(media(g1.map((o) => o.costeAnual)))} → ${n2(rr(g1))}`);
}

console.log(`\n${"═".repeat(96)}`);
console.log(`  PUERTAS ABIERTAS: 2 envases × (3 cortes baratos + 2 de control + 10 tramos) = 30 mediciones.`);
console.log(`  Una sola definición de carestía, una sola ventana (60 días), una sola salida (${SALIDA} días). No se barrió nada más.`);
console.log(`${"═".repeat(96)}\n`);
