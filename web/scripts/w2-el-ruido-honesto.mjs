// ══════════════════════════════════════════════════════════════════════════════════════════════
// «EL RUIDO DE AYER, MEDIDO HONESTAMENTE»
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ EXISTE ESTE SCRIPT, EN CRISTIANO
// La señal B se enunció así: «compra si AYER el subyacente se movió más del 2%». Dio 1.51.
// PERO el envase que la midió entra UNA VEZ AL MES POR TICKER, siempre el PRIMER día de bolsa.
// Es decir: su «ayer» era SIEMPRE el ÚLTIMO día de bolsa del mes anterior. Nunca se probó otro día.
// Un escéptico abrió dos puertas más (11ª y 21ª sesión) y la corrigió a 1.08.
//
// Aquí se hace lo definitivo: se abre UNA ENTRADA CADA DÍA DE BOLSA, en los 40 tickers, y sobre
// esa base se contesta todo:
//   1. ¿sigue funcionando cuando el «ayer» es cualquier día y no fin de mes?
//   2. ¿importa el día de la semana del «ayer»?
//   3. ¿importa que sea fin de mes? (día 1 del mes contra mitad de mes, MISMA regla)
//   4. ¿el umbral del 2% es el bueno? Se barren 1%, 1.5%, 2%, 3% y la versión RELATIVA
//      (el movimiento de ayer en el quinto más alto de la propia historia del ticker).
//   5. ¿la ventana? ayer · últimos 2 · últimos 3 · últimos 5.
//   6. ¿la frecuencia? mensual (1ª sesión) · semanal (1ª sesión de cada semana) · diaria (todas).
//
// ── LAS REGLAS DE LA CASA, Y CÓMO SE CUMPLEN AQUÍ ─────────────────────────────────────────────
//  · SE COMPRA AL ASK Y SE VENDE AL BID, de la cadena real en disco. Nunca punto medio.
//  · NINGÚN MODELO DE PRECIOS. El precio del subyacente sale de la PARIDAD PUT-CALL (identidad de
//    no-arbitraje) y SÓLO EN EL VENCIMIENTO MÁS CERCANO — la versión corregida de z1.
//  · UN HUECO NO ES UN CERO: si falta la cadena del día de salida, o el vencimiento entero dentro
//    de ella, la operación SE DESCARTA y se cuenta aparte. Si la cadena está y el contrato no
//    aparece, es que no tiene comprador: vale 0 y se pierde el 100%. Dato real.
//  · SÓLO EL PASADO: el movimiento se mide con días que TERMINAN EL DÍA ANTES de la compra, y el
//    percentil de la versión relativa se calcula contra los días ESTRICTAMENTE ANTERIORES del
//    propio ticker (nunca la historia entera aplicada hacia atrás).
//  · SPLITS SIN MIRAR AL FUTURO: se neutraliza el retorno del propio día cuando pasa del 35%,
//    decisión que se toma ESE día con lo que se ve ESE día. Sin tabla de splits.
//
// ⚠️ EL SOLAPAMIENTO. Con entrada diaria y 30 sesiones de aguante, dos entradas seguidas comparten
//    29/30 del camino. La n de las tablas NO son apuestas independientes. Se informa aparte la
//    n EFECTIVA (entradas del mismo ticker separadas por 30 sesiones o más). Queda dicho.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/w2-el-ruido-honesto.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";   // el mismo que usan y3 y su lente 3b
const CACHE_FILAS = "scripts/cache-theta/_w2-filas.json";

const APUESTA = 1000;
const ASKMIN = 0.10;      // la regla del listón
const TOLK = 0.50;
const SALIDA = 30;        // días de bolsa hasta vender
const MIN_DIAS_TICKER = 400;
const CALENT = 250;       // 1 año de historia antes de poder entrar (lo pide el percentil propio)
const MIN_PASADO_RK = 250;

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, et: "10% fuera · 60 días · salir a los 30 de bolsa" },
  { id: "B", dist: 0.05, dte: 90, et: " 5% fuera · 90 días · salir a los 30 de bolsa" },
];

// ── utilidades ────────────────────────────────────────────────────────────────────────────────
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
// PUNTO para decimales, COMA para miles — Lester vive en Puerto Rico.
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const dol = (n) => "$" + num(Math.round(n));

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

// ── índice de días por ticker ─────────────────────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TODOS = [...diasPorSim.keys()].sort();
const TICKERS = TODOS.filter((t) => diasPorSim.get(t).length >= MIN_DIAS_TICKER);
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);

console.log(`\n${"═".repeat(104)}`);
console.log("  EL RUIDO DE AYER, MEDIDO HONESTAMENTE — entrada TODOS los días de bolsa");
console.log(`${"═".repeat(104)}`);
console.log(`  cadenas en disco : ${TODOS.length} tickers · ${num(TOTDIAS)} días`);
console.log(`  usables aquí     : ${TICKERS.length} tickers con al menos ${MIN_DIAS_TICKER} días`);
console.log(`  descartados      : ${TODOS.filter((t) => !TICKERS.includes(t)).join(", ") || "ninguno"}`);

// ── el precio del subyacente (caché compartida con y3) ────────────────────────────────────────
let SPOT = null;
if (existsSync(CACHE_SPOT)) {
  try { SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8")); } catch { SPOT = null; }
  if (SPOT && !TICKERS.every((t) => SPOT[t])) SPOT = null;
}
if (!SPOT) {
  console.log(`\n  Construyendo la serie de precios desde la cadena (paridad put-call, vencimiento más cercano)…`);
  SPOT = {};
  const t0 = Date.now();
  let leidos = 0;
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const arr = new Array(dias.length).fill(null);
    for (let i = 0; i < dias.length; i++) {
      let c = null;
      try { c = JSON.parse(readFileSync(`${CDIR}/${sym}_d${dias[i]}.json`, "utf8")); leidos++; } catch { continue; }
      arr[i] = spotOk(c, dias[i]);
    }
    SPOT[sym] = arr;
    process.stderr.write(`\r   spots ${sym} · ${num(leidos)} cadenas · ${Math.round((Date.now() - t0) / 1000)}s      `);
  }
  process.stderr.write("\n");
  writeFileSync(CACHE_SPOT, JSON.stringify(SPOT));
}
// sanidad: la caché tiene que casar día a día con el índice de ficheros
for (const sym of TICKERS) {
  if (SPOT[sym].length !== diasPorSim.get(sym).length) {
    throw new Error(`la caché de precios de ${sym} tiene ${SPOT[sym].length} días y el disco ${diasPorSim.get(sym).length}`);
  }
}

// ── VALIDACIÓN del precio contra los cierres REALES ───────────────────────────────────────────
{
  const errs = [];
  let cubiertos = 0;
  for (const sym of TICKERS) {
    const p = `${CIERRES}/${sym}.json`;
    if (!existsSync(p)) continue;
    cubiertos++;
    let cl = null;
    try { cl = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
    const dias = diasPorSim.get(sym);
    for (let i = 0; i < dias.length; i++) {
      const real = cl[dias[i]], mio = SPOT[sym][i];
      if (!(real > 0) || !(mio > 0)) continue;
      errs.push(Math.abs(mio / real - 1));
    }
  }
  errs.sort((a, b) => a - b);
  console.log(`\n  VALIDACIÓN del precio deducido contra los cierres reales de disco:`);
  console.log(`    ${cubiertos} tickers con cierres reales · ${num(errs.length)} días comparados`);
  console.log(`    error mediano ${(100 * errs[errs.length >> 1]).toFixed(3)}% · peor 10% ${(100 * errs[Math.floor(errs.length * 0.9)]).toFixed(3)}% · peor 1% ${(100 * errs[Math.floor(errs.length * 0.99)]).toFixed(3)}%`);
  console.log(`    días con más de 1% de error: ${pct(errs.filter((x) => x > 0.01).length / errs.length)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1) LA SEÑAL, DÍA A DÍA — todo causal, ventana que TERMINA EL DÍA ANTES
// ══════════════════════════════════════════════════════════════════════════════════════════════
const VENTANAS = [1, 2, 3, 5];
const SEN = {};            // sym -> array por índice de día: {mov:[4], rk:[4], sesMes, dowAyer, priSem}
let splitsNeutralizados = 0;

/** inserta v en el array ORDENADO s manteniéndolo ordenado */
function inserta(s, v) {
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
  s.splice(lo, 0, v);
}
/** fracción del array ORDENADO que queda por debajo de v, con los empates repartidos */
function rango(s, v) {
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
  const men = lo;
  lo = 0; hi = s.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m + 1; else hi = m; }
  return (men + lo) / (2 * s.length);
}

for (const sym of TICKERS) {
  const s = SPOT[sym], dias = diasPorSim.get(sym), n = s.length;
  // retornos, splits neutralizados EL PROPIO DÍA
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) { splitsNeutralizados++; x = 0; }
    r[i] = x;
  }
  // posición de la sesión dentro de su mes, y primera sesión de cada semana
  const sesMes = new Array(n).fill(-1);
  {
    let mes = null, k = 0;
    for (let i = 0; i < n; i++) {
      const m = dias[i].slice(0, 6);
      if (m !== mes) { mes = m; k = 0; }
      sesMes[i] = k++;
    }
  }
  const priSem = new Array(n).fill(false);
  {
    let ultSem = null;
    for (let i = 0; i < n; i++) {
      const d = new Date(ms(dias[i]));
      // clave de semana: el lunes de esa semana (getUTCDay: 0=domingo)
      const dow = d.getUTCDay();
      const lun = new Date(d.getTime() - ((dow + 6) % 7) * 86_400_000);
      const k = lun.toISOString().slice(0, 10);
      if (k !== ultSem) { ultSem = k; priSem[i] = true; }
    }
  }

  const pas = VENTANAS.map(() => []);   // pasado ORDENADO del mismo estadístico, por ventana
  const out = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    // estadístico del día i = mayor |retorno| de las últimas W sesiones TERMINADAS EN i-1
    const mov = new Array(VENTANAS.length).fill(null);
    for (let w = 0; w < VENTANAS.length; w++) {
      const W = VENTANAS[w];
      if (i - W < 1) continue;
      let mx = 0, ok = true;
      for (let j = i - W; j <= i - 1; j++) { if (r[j] == null) { ok = false; break; } mx = Math.max(mx, Math.abs(r[j])); }
      if (ok) mov[w] = mx;
    }
    const rk = new Array(VENTANAS.length).fill(null);
    for (let w = 0; w < VENTANAS.length; w++) {
      if (mov[w] == null) continue;
      if (pas[w].length >= MIN_PASADO_RK) rk[w] = rango(pas[w], mov[w]);
    }
    out[i] = {
      mov, rk, sesMes: sesMes[i], priSem: priSem[i],
      dowAyer: new Date(ms(dias[i - 1])).getUTCDay(),
    };
    // sólo DESPUÉS de puntuar se mete el valor de hoy en el pasado (nunca se puntúa contra sí mismo)
    for (let w = 0; w < VENTANAS.length; w++) if (mov[w] != null) inserta(pas[w], mov[w]);
  }
  SEN[sym] = out;
}
console.log(`\n  Señal calculada. Retornos neutralizados por parecer split (|mov| > 35%): ${splitsNeutralizados}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2) LAS OPERACIONES — UNA ENTRADA CADA DÍA DE BOLSA, dos envases, call y put
// ══════════════════════════════════════════════════════════════════════════════════════════════
const cacheCad = new Map();
const MAXC = 80;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cacheCad.has(k)) { const v = cacheCad.get(k); cacheCad.delete(k); cacheCad.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cacheCad.size >= MAXC) cacheCad.delete(cacheCad.keys().next().value);
  cacheCad.set(k, v);
  return v;
}

let filas = null, san = null, meta = null;
if (existsSync(CACHE_FILAS)) {
  try { const o = JSON.parse(readFileSync(CACHE_FILAS, "utf8")); filas = o.filas; san = o.san; meta = o.meta; } catch { filas = null; }
  if (filas && (meta?.calent !== CALENT || meta?.v !== 2)) filas = null;
}

if (!filas) {
  filas = [];
  san = { A: nuevoSan(), B: nuevoSan() };
  let entradas = 0, sinSpot = 0, sinSenal = 0;
  const t0 = Date.now();
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    for (let i = CALENT; i < dias.length; i++) {
      const S = SPOT[sym][i];
      if (!(S > 0)) { sinSpot++; continue; }
      const sg = SEN[sym][i];
      if (!sg || sg.mov[3] == null) { sinSenal++; continue; }   // sin las 5 sesiones previas, no hay señal
      entradas++;
      const c = cadena(sym, dias[i]);
      if (!c) continue;
      for (const env of ENVASES) {
        let exp = null, md = Infinity;
        for (const e of Object.keys(c)) { const dt = dteDe(dias[i], e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
        if (!exp || md > tolDte(env.dte)) { san[env.id].sinContrato += 2; continue; }
        const g = c[exp];
        for (const tipo of ["C", "P"]) {
          const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
          let mejor = null, dd = Infinity;
          for (const [clave, ba] of Object.entries(g)) {
            if (clave.slice(-1) !== tipo) continue;
            if (!(ba[1] >= ASKMIN)) continue;
            const K = Number(clave.slice(0, -2));
            const d = Math.abs(K - objetivo);
            if (d < dd) { dd = d; mejor = { K, clave, bid: ba[0], ask: ba[1] }; }
          }
          if (!mejor) { san[env.id].sinContrato++; continue; }
          const distReal = tipo === "C" ? mejor.K / S - 1 : 1 - mejor.K / S;
          if (Math.abs(distReal - env.dist) > env.dist * TOLK) { san[env.id].sinContrato++; continue; }
          let ds = dias[i + SALIDA] ?? null, trunc = 0;
          if (!ds) { san[env.id].huecos++; continue; }                       // HUECO, no cero
          if (ds >= exp) { ds = exp; trunc = 1; }
          const cs = cadena(sym, ds);
          if (!cs) { san[env.id].huecos++; continue; }                       // HUECO, no cero
          const grupo = cs[exp];
          if (!grupo) { san[env.id].huecos++; san[env.id].grupoAusente++; continue; }  // HUECO, no cero
          const salida = grupo[mejor.clave]?.[0] ?? 0;                       // sin puja = 0. Dato real.
          const s2 = san[env.id];
          s2.n++; s2.trunc += trunc; s2.coste += mejor.ask / S; s2.horq += (mejor.ask - mejor.bid) / mejor.ask;
          if (salida === 0) s2.sinValor++;
          filas.push([env.id === "A" ? 0 : 1, sym, i, dias[i], tipo === "C" ? 0 : 1, (salida - mejor.ask) / mejor.ask,
            dteDe(dias[i], exp), dteDe(ds, exp), mejor.ask / S]);
        }
      }
    }
    cacheCad.clear();
    process.stderr.write(`\r   ${sym} · ${num(entradas)} entradas · ${num(filas.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s      `);
  }
  process.stderr.write("\n");
  meta = { calent: CALENT, entradas, sinSpot, sinSenal, v: 2 };
  writeFileSync(CACHE_FILAS, JSON.stringify({ filas, san, meta }));
}
function nuevoSan() { return { n: 0, huecos: 0, grupoAusente: 0, sinContrato: 0, trunc: 0, coste: 0, horq: 0, sinValor: 0 }; }

// rehidratar a objetos con la señal enganchada
const F = filas.map(([e, sym, i, dia, t, ret, dteReal, vencMenosSalida, coste]) => {
  const sg = SEN[sym][i];
  return { env: e === 0 ? "A" : "B", sym, i, dia, ano: dia.slice(0, 4), tipo: t === 0 ? "C" : "P", ret, sg,
    dteReal, vencMenosSalida, coste };
});

console.log(`\n${"═".repeat(104)}`);
console.log("  SANIDAD — antes de mirar ningún resultado");
console.log(`${"═".repeat(104)}`);
console.log(`  entradas (TODOS los días de bolsa, tras ${CALENT} sesiones de calentado): ${num(meta.entradas)}`);
console.log(`  días descartados sin precio deducible: ${num(meta.sinSpot)} · sin las 5 sesiones previas: ${num(meta.sinSenal)}`);
for (const env of ENVASES) {
  const s = san[env.id];
  console.log(`\n  ENVASE ${env.id} — ${env.et}`);
  console.log(`    operaciones medidas : ${num(s.n)}`);
  console.log(`    HUECOS descartados  : ${num(s.huecos)} (${pct(s.huecos / (s.huecos + s.n))}) — de ellos ${num(s.grupoAusente)} por faltar el vencimiento entero en la cadena del día de salida`);
  console.log(`    sin contrato que encaje (strike lejos o ask < $${ASKMIN.toFixed(2)}) : ${num(s.sinContrato)}`);
  console.log(`    coste medio de entrada : ${pct(s.coste / s.n)} del subyacente · horquilla media ${pct(s.horq / s.n)} de la prima`);
  console.log(`    vencen SIN VALOR (bid 0 el día de salida) : ${pct(s.sinValor / s.n)}`);
  console.log(`    salidas truncadas al vencimiento : ${pct(s.trunc / s.n)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3) MAQUINARIA DE MEDIDA
// ══════════════════════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const ganMedio = (a) => (a.win ? a.gan / a.win : 0);
const perMedio = (a) => (a.n - a.win ? a.per / (a.n - a.win) : 0);
const rr = (a) => (a.n >= 20 ? ratio(a).toFixed(2) : "n/d");
const mide = (fs) => { const a = acc(); for (const f of fs) suma(a, APUESTA * f.ret); return a; };

const ANOS = [...new Set(F.map((f) => f.ano))].sort();
const ANOSPAN = Number(ANOS[ANOS.length - 1]) - Number(ANOS[0]) + 1;
const CRISIS = ["2018", "2020", "2022", "2025"];
console.log(`\n  Años cubiertos: ${ANOS[0]}-${ANOS[ANOS.length - 1]} (${ANOSPAN} años de calendario)`);

// frecuencias de entrada
const FRECS = [
  { id: "MENSUAL", et: "1ª sesión del mes (LA DEL HALLAZGO)", f: (x) => x.sg.sesMes === 0 },
  { id: "SEMANAL", et: "1ª sesión de cada semana", f: (x) => x.sg.priSem },
  { id: "DIARIA", et: "todos los días de bolsa", f: () => true },
];

// reglas
const REGLAS = [];
for (let w = 0; w < VENTANAS.length; w++) {
  for (const u of [0.01, 0.015, 0.02, 0.03]) {
    REGLAS.push({ id: `${VENTANAS[w]}d>${(100 * u).toFixed(1)}%`, w, tipo: "fijo", u,
      et: `movimiento de más del ${(100 * u).toFixed(1)}% en ${VENTANAS[w] === 1 ? "AYER" : `los últimos ${VENTANAS[w]} días`}`,
      f: (x) => x.sg.mov[w] != null && x.sg.mov[w] > u });
  }
  REGLAS.push({ id: `${VENTANAS[w]}d top20%`, w, tipo: "rel", u: 0.80,
    et: `${VENTANAS[w] === 1 ? "AYER" : `los últimos ${VENTANAS[w]} días`}: en el quinto más movido de su propia historia`,
    f: (x) => x.sg.rk[w] != null && x.sg.rk[w] >= 0.80 });
}

// n EFECTIVA: dentro de un ticker, una entrada nueva sólo cuenta si empieza tras cerrar la anterior
function nEfectiva(fs) {
  const porTk = new Map();
  for (const f of fs) { if (!porTk.has(f.sym)) porTk.set(f.sym, []); porTk.get(f.sym).push(f.i); }
  let n = 0;
  for (const v of porTk.values()) {
    v.sort((a, b) => a - b);
    let ult = -1e9;
    for (const i of v) if (i - ult >= SALIDA) { n++; ult = i; }
  }
  return n;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4) LA PREGUNTA 1 — ¿SIGUE FUNCIONANDO CUANDO EL «AYER» ES CUALQUIER DÍA?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  PREGUNTA 1 — LA REGLA ORIGINAL («ayer se movió más del 2%») EN LAS TRES FRECUENCIAS");
console.log(`${"═".repeat(104)}`);
const REGLA_ORIG = REGLAS.find((x) => x.id === "1d>2.0%");
for (const env of ENVASES) {
  console.log(`\n  ENVASE ${env.id} — ${env.et}`);
  console.log(`  | frecuencia de entrada | n SIN regla | ratio SIN | acierta SIN | n CON regla | ratio CON | acierta CON | dispara | ops/año | n efectiva |`);
  console.log(`  |---|---|---|---|---|---|---|---|---|---|`);
  for (const fr of FRECS) {
    const t = F.filter((x) => x.env === env.id && fr.f(x));
    const c = t.filter(REGLA_ORIG.f);
    const b = mide(t), a = mide(c);
    console.log(`  | ${fr.et} | ${num(b.n)} | ${rr(b)} | ${pct(acierto(b))} | ${num(a.n)} | **${rr(a)}** | ${pct(acierto(a))} | ${pct(a.n / b.n)} | ${num(a.n / ANOSPAN)} | ${num(nEfectiva(c))} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5) LA PREGUNTA 3 — ¿ES EL FIN DE MES?  (día 1 contra mitad de mes, MISMA regla)
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  PREGUNTA 3 — ¿ES EL FIN DE MES? · misma regla del 2%, distintas posiciones dentro del mes");
console.log(`${"═".repeat(104)}`);
const POSIS = [
  { et: "1ª sesión del mes (el «ayer» = último día del mes anterior)", f: (x) => x.sg.sesMes === 0 },
  { et: "2ª a 5ª sesión", f: (x) => x.sg.sesMes >= 1 && x.sg.sesMes <= 4 },
  { et: "MITAD DE MES (9ª a 13ª sesión)", f: (x) => x.sg.sesMes >= 8 && x.sg.sesMes <= 12 },
  { et: "última semana del mes (18ª en adelante)", f: (x) => x.sg.sesMes >= 17 },
  { et: "cualquier sesión MENOS la 1ª", f: (x) => x.sg.sesMes >= 1 },
];
for (const env of ENVASES) {
  console.log(`\n  ENVASE ${env.id}`);
  console.log(`  | posición dentro del mes | n SIN | ratio SIN | n CON | ratio CON | acierta SIN → CON | dispara |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const p of POSIS) {
    const t = F.filter((x) => x.env === env.id && p.f(x));
    const c = t.filter(REGLA_ORIG.f);
    const b = mide(t), a = mide(c);
    console.log(`  | ${p.et} | ${num(b.n)} | ${rr(b)} | ${num(a.n)} | **${rr(a)}** | ${pct(acierto(b))} → ${pct(acierto(a))} | ${pct(a.n / b.n)} |`);
  }
}
// ¿con qué frecuencia dispara la regla en cada posición del mes? (el efecto calendario, desnudo)
{
  console.log(`\n  ¿CADA CUÁNTO DISPARA la regla del 2% según la sesión del mes? (envase A, una fila por sesión)`);
  console.log(`  | sesión del mes | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 |`);
  const disp = [], rats = [];
  for (let k = 0; k < 20; k++) {
    const t = F.filter((x) => x.env === "A" && x.sg.sesMes === k);
    const c = t.filter(REGLA_ORIG.f);
    disp.push(t.length ? pct(c.length / t.length) : "n/d");
    rats.push(rr(mide(c)));
  }
  console.log(`  |---|${new Array(20).fill("---").join("|")}|`);
  console.log(`  | dispara | ${disp.join(" | ")} |`);
  console.log(`  | ratio CON regla | ${rats.join(" | ")} |`);
}

// ── EL DESCUBRIMIENTO DE AL LADO: ¿el ENVASE VACÍO también depende del día del mes? ───────────
// El envase A publicado da 1.11 entrando el día 1. Entrando todos los días da 0.97. Eso NO es la
// señal: es el envase. Aquí se mira slot por slot, y se buscan las dos causas mecánicas posibles
// (que el plazo real conseguido y la distancia al vencimiento del día de salida cambien con la
// posición dentro del mes, por culpa de los vencimientos mensuales del tercer viernes).
console.log(`\n${"═".repeat(104)}`);
console.log("  EL ENVASE VACÍO, SIN NINGUNA REGLA, SEGÚN LA SESIÓN DEL MES — ¿es el día 1 especial de por sí?");
console.log(`${"═".repeat(104)}`);
for (const env of ENVASES) {
  const filaR = [], filaN = [], filaDte = [], filaGap = [], filaCoste = [], filaAc = [];
  for (let k = 0; k < 20; k++) {
    const t = F.filter((x) => x.env === env.id && x.sg.sesMes === k);
    const a = mide(t);
    filaR.push(rr(a)); filaN.push(num(a.n)); filaAc.push(pct(acierto(a)));
    filaDte.push((t.reduce((s, x) => s + x.dteReal, 0) / t.length).toFixed(0));
    filaGap.push((t.reduce((s, x) => s + x.vencMenosSalida, 0) / t.length).toFixed(0));
    filaCoste.push(pct(t.reduce((s, x) => s + x.coste, 0) / t.length));
  }
  const rsOtras = [];
  for (let k = 1; k < 20; k++) rsOtras.push(ratio(mide(F.filter((x) => x.env === env.id && x.sg.sesMes === k))));
  rsOtras.sort((a, b) => a - b);
  console.log(`\n  ENVASE ${env.id}`);
  console.log(`  | sesión del mes | ${Array.from({ length: 20 }, (_, i) => i + 1).join(" | ")} |`);
  console.log(`  |---|${new Array(20).fill("---").join("|")}|`);
  console.log(`  | ratio SIN regla | ${filaR.join(" | ")} |`);
  console.log(`  | acierta | ${filaAc.join(" | ")} |`);
  console.log(`  | plazo real conseguido (días) | ${filaDte.join(" | ")} |`);
  console.log(`  | del día de salida al vencimiento (días) | ${filaGap.join(" | ")} |`);
  console.log(`  | prima / subyacente | ${filaCoste.join(" | ")} |`);
  console.log(`  | n | ${filaN.join(" | ")} |`);
  console.log(`  las otras 19 sesiones, sin regla: mínimo ${rsOtras[0].toFixed(2)} · mediana ${rsOtras[9].toFixed(2)} · máximo ${rsOtras[18].toFixed(2)}  ·  la 1ª sesión ${ratio(mide(F.filter((x) => x.env === env.id && x.sg.sesMes === 0))).toFixed(2)}`);
}
// y la regla del 2%, slot a slot, contra la nube de los otros 19 slots
{
  const rs = [];
  for (let k = 1; k < 20; k++) rs.push(ratio(mide(F.filter((x) => x.env === "A" && x.sg.sesMes === k && REGLA_ORIG.f(x)))));
  rs.sort((a, b) => a - b);
  const r0 = ratio(mide(F.filter((x) => x.env === "A" && x.sg.sesMes === 0 && REGLA_ORIG.f(x))));
  console.log(`\n  LA REGLA DEL 2%, SLOT A SLOT (envase A): la 1ª sesión da ${r0.toFixed(2)};`);
  console.log(`  las otras 19 sesiones: mínimo ${rs[0].toFixed(2)} · mediana ${rs[9].toFixed(2)} · máximo ${rs[18].toFixed(2)} · cuántas llegan a 1.40: ${rs.filter((x) => x >= 1.40).length} de 19`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6) LA PREGUNTA 2 — ¿IMPORTA EL DÍA DE LA SEMANA DEL «AYER»?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  PREGUNTA 2 — EL DÍA DE LA SEMANA DEL «AYER» (entrada diaria, envase A)");
console.log(`${"═".repeat(104)}`);
const DOW = { 1: "lunes", 2: "martes", 3: "miércoles", 4: "jueves", 5: "viernes" };
for (const env of ENVASES) {
  console.log(`\n  ENVASE ${env.id}`);
  console.log(`  | «ayer» fue un… | n SIN | ratio SIN | n CON regla 2% | ratio CON | acierta CON | dispara |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const d of [1, 2, 3, 4, 5]) {
    const t = F.filter((x) => x.env === env.id && x.sg.dowAyer === d);
    const c = t.filter(REGLA_ORIG.f);
    const b = mide(t), a = mide(c);
    console.log(`  | ${DOW[d]} | ${num(b.n)} | ${rr(b)} | ${num(a.n)} | **${rr(a)}** | ${pct(acierto(a))} | ${pct(a.n / b.n)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7) LAS PREGUNTAS 4 y 5 — EL BARRIDO DE UMBRAL Y VENTANA, sobre entrada DIARIA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  PREGUNTAS 4 y 5 — UMBRAL × VENTANA, con entrada TODOS LOS DÍAS");
console.log(`${"═".repeat(104)}`);
const RESUM = [];
for (const env of ENVASES) {
  const t = F.filter((x) => x.env === env.id);
  const b = mide(t);
  console.log(`\n  ENVASE ${env.id} — sin regla: ratio ${ratio(b).toFixed(2)} · acierta ${pct(acierto(b))} · n=${num(b.n)} · ${num(b.n / ANOSPAN)} ops/año`);
  console.log(`  | regla | n | ratio | acierta | ganador medio | perdedor medio | dispara | ops/año | n efectiva | ratio del RESTO |`);
  console.log(`  |---|---|---|---|---|---|---|---|---|---|`);
  for (const rg of REGLAS) {
    const c = t.filter(rg.f), resto = t.filter((x) => !rg.f(x));
    const a = mide(c), rst = mide(resto);
    if (env.id === "A") RESUM.push({ rg, a, n: a.n, r: ratio(a) });
    console.log(`  | ${rg.et} | ${num(a.n)} | **${rr(a)}** | ${pct(acierto(a))} | ${dol(ganMedio(a))} | ${dol(perMedio(a))} | ${pct(a.n / b.n)} | ${num(a.n / ANOSPAN)} | ${num(nEfectiva(c))} | ${rr(rst)} |`);
  }
}
// las mismas reglas, pero con entrada MENSUAL (para ver de dónde salía el 1.51)
console.log(`\n  LAS MISMAS REGLAS CON ENTRADA MENSUAL (1ª sesión) — envase A. Aquí es donde vivía el hallazgo:`);
console.log(`  | regla | n | ratio MENSUAL | ratio DIARIA | acierta MENSUAL | acierta DIARIA |`);
console.log(`  |---|---|---|---|---|---|`);
for (const rg of REGLAS) {
  const m = mide(F.filter((x) => x.env === "A" && x.sg.sesMes === 0 && rg.f(x)));
  const d = mide(F.filter((x) => x.env === "A" && rg.f(x)));
  console.log(`  | ${rg.et} | ${num(m.n)} | **${rr(m)}** | ${rr(d)} | ${pct(acierto(m))} | ${pct(acierto(d))} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8) EL EXAMEN COMPLETO — de la regla original y de la mejor del barrido
// ══════════════════════════════════════════════════════════════════════════════════════════════
function examen(rg, envId, filtroFrec, titulo) {
  const t = F.filter((x) => x.env === envId && filtroFrec(x));
  const c = t.filter(rg.f);
  const b = mide(t), a = mide(c);
  console.log(`\n${"═".repeat(104)}`);
  console.log(`  ${titulo}`);
  console.log(`${"═".repeat(104)}`);
  console.log(`  regla: ${rg.et}`);
  console.log(`  SIN regla : n=${num(b.n)} · ratio ${ratio(b).toFixed(2)} · acierta ${pct(acierto(b))} · ganador ${dol(ganMedio(b))} · perdedor ${dol(perMedio(b))}`);
  console.log(`  CON regla : n=${num(a.n)} · ratio ${ratio(a).toFixed(2)} · acierta ${pct(acierto(a))} · ganador ${dol(ganMedio(a))} · perdedor ${dol(perMedio(a))}`);
  console.log(`  ${num(a.n / ANOSPAN)} operaciones al año de calendario · n EFECTIVA (sin solape) ${num(nEfectiva(c))}`);

  // año a año
  console.log(`\n  Año a año:`);
  console.log(`  | año | ${ANOS.join(" | ")} |`);
  console.log(`  |---|${ANOS.map(() => "---").join("|")}|`);
  const porAno = ANOS.map((y) => mide(c.filter((x) => x.ano === y)));
  const porAnoB = ANOS.map((y) => mide(t.filter((x) => x.ano === y)));
  console.log(`  | n CON | ${porAno.map((x) => num(x.n)).join(" | ")} |`);
  console.log(`  | ratio CON | ${porAno.map((x) => rr(x)).join(" | ")} |`);
  console.log(`  | acierta CON | ${porAno.map((x) => (x.n >= 20 ? pct(acierto(x)) : "n/d")).join(" | ")} |`);
  console.log(`  | ratio SIN | ${porAnoB.map((x) => rr(x)).join(" | ")} |`);
  const malos = porAno.filter((x) => x.n >= 20 && ratio(x) < 1).length;
  const conta = porAno.filter((x) => x.n >= 20).length;
  console.log(`  años por debajo de 1: ${malos} de ${conta}`);
  console.log(`  las cuatro crisis: ${CRISIS.map((y) => { const x = mide(c.filter((z) => z.ano === y)); return `${y} ${rr(x)}`; }).join(" · ")}`);

  // TERCIOS (no dos mitades)
  const corte1 = ANOS[Math.floor(ANOS.length / 3)], corte2 = ANOS[Math.floor((2 * ANOS.length) / 3)];
  const t1 = mide(c.filter((x) => x.ano < corte1));
  const t2 = mide(c.filter((x) => x.ano >= corte1 && x.ano < corte2));
  const t3 = mide(c.filter((x) => x.ano >= corte2));
  console.log(`\n  POR TERCIOS: ${ANOS[0]}-${Number(corte1) - 1} ${rr(t1)} (n=${num(t1.n)}) · ${corte1}-${Number(corte2) - 1} ${rr(t2)} (n=${num(t2.n)}) · ${corte2}-${ANOS[ANOS.length - 1]} ${rr(t3)} (n=${num(t3.n)})`);
  const sin20 = mide(c.filter((x) => !(x.dia >= "20200201" && x.dia <= "20200531")));
  console.log(`  quitando febrero-mayo de 2020: ${rr(sin20)} (n=${num(sin20.n)})`);

  // concentración por ticker y por evento
  const tks = new Map();
  for (const f of c) { if (!tks.has(f.sym)) tks.set(f.sym, acc()); suma(tks.get(f.sym), APUESTA * f.ret); }
  const lt = [...tks.entries()].map(([k, v]) => ({ k, v, r: ratio(v) })).sort((x, y) => y.v.gan - x.v.gan);
  let ac2 = 0, cuantos = 0;
  for (const x of lt) { if (x.v.gan <= 0) break; ac2 += x.v.gan; cuantos++; if (ac2 >= a.gan / 2) break; }
  console.log(`\n  Por ticker: ${lt.length} tickers · ${lt.filter((x) => x.r > 1).length} con ratio > 1 · ${cuantos} juntan la mitad del dinero ganado`);
  console.log(`  mejores: ${lt.slice(0, 5).map((x) => `${x.k} ${x.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  peores : ${lt.slice(-5).map((x) => `${x.k} ${x.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  ratio quitando ${lt[0].k} entero: ${((a.gan - lt[0].v.gan) / (a.per - lt[0].v.per)).toFixed(2)}`);
  console.log(`  mayor billete ${dol(a.max)} · ratio quitándolo ${((a.gan - a.max) / a.per).toFixed(2)}`);
  console.log(`  calls ${rr(mide(c.filter((x) => x.tipo === "C")))} · puts ${rr(mide(c.filter((x) => x.tipo === "P")))}`);

  return { b, a, malos, conta, cuantos, tercios: [ratio(t1), ratio(t2), ratio(t3)], sin2020: ratio(sin20), nEf: nEfectiva(c), tks: lt.length };
}

const infoOrig = examen(REGLA_ORIG, "A", () => true, "EXAMEN — LA REGLA ORIGINAL DEL 2%, CON ENTRADA DIARIA (envase A)");
const infoOrigMes = examen(REGLA_ORIG, "A", (x) => x.sg.sesMes === 0, "EXAMEN — LA MISMA REGLA, ENTRANDO SÓLO EL DÍA 1 DEL MES (envase A) — el hallazgo original");

const mejor = RESUM.filter((x) => x.n >= 2000).sort((x, y) => y.r - x.r)[0];
const infoMejor = examen(mejor.rg, "A", () => true, `EXAMEN — LA MEJOR DEL BARRIDO CON ENTRADA DIARIA (envase A)`);
const infoMejorB = examen(mejor.rg, "B", () => true, `LA MISMA, EN EL ENVASE B`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9) EL BARAJADO — 20 desplazamientos
// ══════════════════════════════════════════════════════════════════════════════════════════════
// La señal con el día equivocado: se le pega a cada entrada el valor que ese MISMO TICKER tenía
// k MESES antes (k×21 sesiones). Desplazamientos fijos, no Math.random. Conserva la mezcla de
// tickers y la forma de la distribución, y rompe sólo el enganche con la fecha. Se desplaza en
// meses (no en días) porque con entrada diaria un desplazamiento de 1 día sigue casi pegado.
function barajado(rg, envId, etiqueta) {
  const t = F.filter((x) => x.env === envId);
  const porTk = new Map();
  for (const sym of TICKERS) porTk.set(sym, SEN[sym]);
  const res = [];
  for (let k = 1; k <= 20; k++) {
    const sel = [];
    for (const f of t) {
      const j = f.i - k * 21;
      if (j < 1) continue;
      const otra = porTk.get(f.sym)[j];
      if (otra && rg.f({ sg: otra })) sel.push(f);
    }
    res.push(mide(sel));
  }
  const real = mide(t.filter(rg.f));
  const rs = res.map((x) => ratio(x)).sort((x, y) => x - y);
  const as = res.map((x) => acierto(x)).sort((x, y) => x - y);
  console.log(`\n  ── ${etiqueta} · regla: ${rg.et}`);
  console.log(`  | desplazamiento (meses) | ${res.map((_, i) => i + 1).join(" | ")} |`);
  console.log(`  |---|${res.map(() => "---").join("|")}|`);
  console.log(`  | ratio | ${res.map((x) => ratio(x).toFixed(2)).join(" | ")} |`);
  console.log(`  nube de los 20: mínimo ${rs[0].toFixed(2)} · mediana ${((rs[9] + rs[10]) / 2).toFixed(2)} · máximo ${rs[19].toFixed(2)}   ·   la señal de verdad ${ratio(real).toFixed(2)}`);
  console.log(`  barajados que igualan o pasan a la señal: ${rs.filter((x) => x >= ratio(real)).length} de 20 · que llegan a 1.40: ${rs.filter((x) => x >= 1.40).length} de 20`);
  console.log(`  acierto barajado: mínimo ${pct(as[0])} · mediana ${pct((as[9] + as[10]) / 2)} · máximo ${pct(as[19])}  ·  el de verdad ${pct(acierto(real))}`);
  return { mediana: (rs[9] + rs[10]) / 2, max: rs[19], real: ratio(real) };
}
console.log(`\n${"═".repeat(104)}`);
console.log("  EL BARAJADO — 20 desplazamientos (la señal de k meses antes del mismo ticker)");
console.log(`${"═".repeat(104)}`);
const barOrig = barajado(REGLA_ORIG, "A", "regla original del 2%, entrada DIARIA");
const barMejor = barajado(mejor.rg, "A", "la mejor del barrido, entrada DIARIA");

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 10) RESUMEN
// ══════════════════════════════════════════════════════════════════════════════════════════════
const puertas = REGLAS.length * ENVASES.length * FRECS.length;
console.log(`\n${"═".repeat(104)}`);
console.log("  RESUMEN");
console.log(`${"═".repeat(104)}`);
console.log(`  PUERTAS ABIERTAS: ${REGLAS.length} reglas (${VENTANAS.length} ventanas × 5 umbrales) × ${ENVASES.length} envases × ${FRECS.length} frecuencias = ${puertas} mediciones,`);
console.log(`  más ${POSIS.length} posiciones dentro del mes y 5 días de la semana. Ninguna se eligió después de mirar.`);
console.log(`  base sin regla, envase A, entrada diaria: ratio ${ratio(infoOrig.b).toFixed(2)} · acierta ${pct(acierto(infoOrig.b))} · n=${num(infoOrig.b.n)}`);
console.log(`  REGLA ORIGINAL (ayer > 2%):`);
console.log(`     entrando el día 1 del mes : ratio ${ratio(infoOrigMes.a).toFixed(2)} · acierta ${pct(acierto(infoOrigMes.a))} · n=${num(infoOrigMes.a.n)}`);
console.log(`     entrando TODOS los días   : ratio ${ratio(infoOrig.a).toFixed(2)} · acierta ${pct(acierto(infoOrig.a))} · n=${num(infoOrig.a.n)} · ${num(infoOrig.a.n / ANOSPAN)} ops/año`);
console.log(`     barajado (mediana de 20)  : ${barOrig.mediana.toFixed(2)} · máximo ${barOrig.max.toFixed(2)}`);
console.log(`     tercios: ${infoOrig.tercios.map((x) => x.toFixed(2)).join(" · ")} · años por debajo de 1: ${infoOrig.malos} de ${infoOrig.conta}`);
console.log(`  MEJOR DEL BARRIDO (entrada diaria): ${mejor.rg.et}`);
console.log(`     ratio ${ratio(infoMejor.a).toFixed(2)} · acierta ${pct(acierto(infoMejor.b))} → ${pct(acierto(infoMejor.a))} · n=${num(infoMejor.a.n)} · ${num(infoMejor.a.n / ANOSPAN)} ops/año`);
console.log(`     barajado (mediana de 20) ${barMejor.mediana.toFixed(2)} · tercios ${infoMejor.tercios.map((x) => x.toFixed(2)).join(" · ")} · sin 2020 ${infoMejor.sin2020.toFixed(2)}`);
console.log(`     envase B: ratio ${ratio(infoMejorB.a).toFixed(2)} · acierta ${pct(acierto(infoMejorB.a))}`);
console.log(`${"═".repeat(104)}\n`);
