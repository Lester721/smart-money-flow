// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 3 — «LA SEÑAL NO ES LO QUE DICE SER».  Autopsia del hallazgo «compra si AYER se movió
// más del 2%» (scripts/y3-la-calma-antes.mjs, envase A: ratio 1.51).
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ SE HACE AQUÍ, EN CRISTIANO
// El hallazgo dice: se compra una opción suelta (10% fuera del dinero, 60 días de plazo, se vende
// a los 30 días de bolsa) SÓLO si el día anterior el subyacente se movió más de un 2%. Eso sube
// el ratio de 1.12 a 1.51 y el acierto de 17.5% a 21.4%.
//
// Aquí NO se vuelve a preguntar si funciona: se pregunta QUÉ ES. Un filtro que dice «ayer hubo
// jaleo» puede ser en realidad cualquiera de estas cosas, y cada una se comprueba por separado:
//
//   1. UN TERMÓMETRO DE VOLATILIDAD DISFRAZADO. Si «ayer se movió 2%» sólo está diciendo «este
//      valor está movido últimamente», entonces ordenar por la volatilidad de los últimos 20 días
//      tendría que dar lo mismo, y el filtro no debería añadir nada DENTRO de cada montón de
//      volatilidad. Se mide con doble clasificación.
//   2. EL PRECIO DE LA CUNA CON OTRO NOMBRE. La cadena de ese mismo día ya lleva un precio para
//      el movimiento esperado: la cuna (call + put) en el dinero, dividida por el precio. Si la
//      señal sólo elige cadenas caras (o baratas), es esa medida y no la de ayer. Se mide la
//      correlación y se hace la doble clasificación.
//   3. EARNINGS. La entrada es SIEMPRE el primer día de bolsa del mes, así que «ayer» es el
//      ÚLTIMO día del mes anterior — que es cuando presentan resultados media docena de gigantes.
//      Si es eso, la señal dispararía mucho más al empezar febrero, mayo, agosto y noviembre.
//      Se cuenta el disparo mes a mes del calendario.
//   4. LA DERIVA DEL MERCADO. Si la mejora sólo aparece en las CALLS, no hay señal: hay un
//      mercado que sube. Se parte en calls y puts.
//   5. ¿ES ESTE VALOR O ES EL MERCADO? Se mira si SPY también se movió más del 2% ese mismo día.
//      Si toda la mejora está en los días en que se movió el mercado entero, la señal no es del
//      valor: es «compra el día después de un susto general».
//   6. BILLETES DE LOTERÍA. Un ratio se lo puede llevar un puñado de opciones de 30 centavos que
//      multiplican por 90. Se mira de qué precio de entrada sale el dinero ganado y qué pasa si
//      se exige que la opción cueste al menos $0.50 o $1.00 (lo que sí se puede llenar de verdad).
//
//   7. EL CONTROL QUE DECIDE — VEINTE BARAJADOS, no uno. El script original baraja una sola vez
//      (le pega a cada entrada la señal que ese mismo ticker tenía 13 entradas antes) y saca 1.17.
//      Una tirada no es una distribución. Aquí se hace con VEINTE desplazamientos (1 a 20 meses)
//      y además con DIEZ rotaciones de ticker (misma fecha, la señal de otro valor). Se enseña
//      la nube entera: mínimo, mediana, máximo, y cuántas de las tiradas llegan a 1.40.
//
// ── LAS REGLAS DE LA CASA, Y CÓMO SE CUMPLEN AQUÍ ─────────────────────────────────────────────
//  · SE COMPRA AL ASK Y SE VENDE AL BID. Los dos salen de la cadena en disco. Nunca punto medio.
//  · NINGÚN MODELO DE PRECIOS. El precio del subyacente sale de la paridad put-call SÓLO EN EL
//    VENCIMIENTO MÁS CERCANO (la versión corregida). La «volatilidad» se mide con precios que
//    existen: la cuna en el dinero de la propia cadena. No se ajusta Black-Scholes a nada.
//  · UN HUECO NO ES UN CERO. Si falta la cadena de salida o el vencimiento entero, se descarta y
//    se cuenta aparte. Si la cadena está y el contrato no aparece, vale 0: dato real.
//  · SÓLO EL PASADO en la señal: la ventana termina el día ANTES de la compra.
//  · Los montones de esta autopsia (volatilidad, precio de la cuna, coste) se hacen con la
//    muestra ENTERA a propósito, porque NO son una regla para operar sino una radiografía de con
//    qué se solapa la señal. Queda dicho aquí y se repite en la salida para que nadie lo lea como
//    una estrategia.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y3-lente3-la-senal-no-es-lo-que-dice.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";
const CACHE_FILAS = "scripts/cache-theta/_y3l3-filas.json";

const APUESTA = 1000;
const ASKMIN = 0.10;
const TOLK = 0.50;
const SALIDA = 30;
const MIN_DIAS_TICKER = 400;
const CALENT = 120;

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, et: "10% fuera · 60 días · salir a los 30 de bolsa" },
  { id: "B", dist: 0.05, dte: 90, et: " 5% fuera · 90 días · salir a los 30 de bolsa" },
];

// ── utilidades ────────────────────────────────────────────────────────────────────────────────
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
// PUNTO para decimales, COMA para miles — Lester vive en Puerto Rico.
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (100 * x).toFixed(1) + "%";
const dol = (n) => "$" + num(Math.round(n));

function corr(a, b) {
  const n = a.length; if (n < 3) return NaN;
  const ma = media(a), mb = media(b);
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
  return (saa > 0 && sbb > 0) ? sab / Math.sqrt(saa * sbb) : NaN;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1) PRECIO DEL SUBYACENTE — misma paridad corregida que el original (y misma caché)
// ══════════════════════════════════════════════════════════════════════════════════════════════
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

console.log(`\n${"═".repeat(102)}`);
console.log("  LENTE 3 — ¿QUÉ ES DE VERDAD «ayer se movió más del 2%»?");
console.log(`${"═".repeat(102)}`);
console.log(`  ${TICKERS.length} tickers usables · misma tubería, mismo envase, mismos precios que y3-la-calma-antes.mjs`);

let SPOT = null;
if (existsSync(CACHE_SPOT)) {
  try { SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8")); } catch { SPOT = null; }
  if (SPOT && !TICKERS.every((t) => SPOT[t])) SPOT = null;
}
if (!SPOT) {
  console.log("  Construyendo la serie de precios desde la cadena…");
  SPOT = {};
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const arr = new Array(dias.length).fill(null);
    for (let i = 0; i < dias.length; i++) {
      let c = null;
      try { c = JSON.parse(readFileSync(`${CDIR}/${sym}_d${dias[i]}.json`, "utf8")); } catch { continue; }
      arr[i] = spotOk(c, dias[i]);
    }
    SPOT[sym] = arr;
    process.stderr.write(`\r   ${sym}   `);
  }
  process.stderr.write("\n");
  writeFileSync(CACHE_SPOT, JSON.stringify(SPOT));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2) RETORNOS Y MEDIDAS DE AYER — idénticas al original (split neutralizado el propio día)
// ══════════════════════════════════════════════════════════════════════════════════════════════
const RET = {}, MED = {};
let huecoRetorno = 0;
for (const sym of TICKERS) {
  const s = SPOT[sym], n = s.length;
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) x = 0;   // parece split: se neutraliza ESE día, sin tabla ni futuro
    r[i] = x;
  }
  RET[sym] = r;
  const out = new Array(n).fill(null);
  for (let i = CALENT + 1; i < n; i++) {
    const r20 = r.slice(i - 20, i).filter((x) => x != null);
    const r120 = r.slice(i - 120, i).filter((x) => x != null);
    if (r20.length < 18 || r120.length < 110) continue;
    let d2 = 0, nulo = 0;
    for (let j = i - 1; j >= 1 && d2 < 250; j--) { if (r[j] == null) { if (j === i - 1) nulo = 1; break; } if (Math.abs(r[j]) > 0.02) break; d2++; }
    out[i] = {
      diasSin2: d2,
      nuloAyer: nulo,                       // ¿el «ayer» es un HUECO leído como jaleo?
      movAyer: r[i - 1] == null ? null : Math.abs(r[i - 1]),
      signoAyer: r[i - 1] == null ? null : Math.sign(r[i - 1]),
      rv20: sd(r20), rv120: sd(r120),
    };
  }
  MED[sym] = out;
}

// retorno diario de SPY por fecha — para separar «se movió el valor» de «se movió el mercado»
const RSPY = new Map();
{
  const dias = diasPorSim.get("SPY"), r = RET["SPY"];
  for (let i = 0; i < dias.length; i++) if (r[i] != null) RSPY.set(dias[i], r[i]);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3) LAS OPERACIONES — con campos de más para la autopsia
// ══════════════════════════════════════════════════════════════════════════════════════════════
const cacheCad = new Map();
const MAXC = 200;
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

/** La CUNA en el dinero de la propia cadena, ese mismo día, en el vencimiento que se va a comprar.
 *  Es el «movimiento esperado» que ya lleva puesto el mercado, leído de precios que EXISTEN
 *  (punto medio de call + punto medio de put del strike más cercano al precio), sin ningún modelo.
 *  Se usa SÓLO como radiografía, nunca como precio de una operación. */
function cunaATM(g, S) {
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  if (!(C[1] > 0) || !(P[1] > 0)) return null;
  return ((C[0] + C[1]) / 2 + (P[0] + P[1]) / 2) / S;
}

let filas = null;
if (existsSync(CACHE_FILAS)) { try { filas = JSON.parse(readFileSync(CACHE_FILAS, "utf8")); } catch { filas = null; } }

const san = { A: nuevoSan(), B: nuevoSan() };
function nuevoSan() { return { n: 0, huecos: 0, grupoAusente: 0, sinContrato: 0, coste: 0, horq: 0, sinValor: 0, trunc: 0 }; }

if (!filas) {
  filas = [];
  let entradas = 0;
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const vistos = new Set();
    for (let i = 0; i < dias.length; i++) {
      const dia = dias[i], mes = dia.slice(0, 6);
      if (vistos.has(mes)) continue;
      vistos.add(mes);
      const S = SPOT[sym][i];
      if (!(S > 0)) continue;
      const m = MED[sym][i];
      if (!m) continue;
      entradas++;
      const c = cadena(sym, dia);
      if (!c) continue;
      for (const env of ENVASES) {
        let exp = null, md = Infinity;
        for (const e of Object.keys(c)) { const dt = dteDe(dia, e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
        if (!exp || md > tolDte(env.dte)) { san[env.id].sinContrato += 2; continue; }
        const g = c[exp];
        const cuna = cunaATM(g, S);
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
          if (!ds) { san[env.id].huecos++; continue; }
          if (ds >= exp) { ds = exp; trunc = 1; }
          const cs = cadena(sym, ds);
          if (!cs) { san[env.id].huecos++; continue; }
          const grupo = cs[exp];
          if (!grupo) { san[env.id].huecos++; san[env.id].grupoAusente++; continue; }
          const salida = grupo[mejor.clave]?.[0] ?? 0;
          const s2 = san[env.id];
          s2.n++; s2.trunc += trunc; s2.coste += mejor.ask / S; s2.horq += (mejor.ask - mejor.bid) / mejor.ask;
          if (salida === 0) s2.sinValor++;
          // movimiento REALIZADO del subyacente hasta la salida (para la autopsia, no para el dinero)
          const Ssal = SPOT[sym][i + SALIDA] ?? null;
          filas.push({
            env: env.id, sym, dia, ano: dia.slice(0, 4), mesCal: dia.slice(4, 6), mes,
            tipo, ret: (salida - mejor.ask) / mejor.ask,
            ask: mejor.ask, bid: mejor.bid, S, K: mejor.K, exp, cuna,
            movAyer: m.movAyer, signoAyer: m.signoAyer, nuloAyer: m.nuloAyer,
            diasSin2: m.diasSin2, rv20: m.rv20, rv120: m.rv120,
            rSpyAyer: (() => { const idx = i - 1; const d = dias[idx]; return d != null && RSPY.has(d) ? RSPY.get(d) : null; })(),
            movReal: (Ssal > 0 && S > 0) ? Ssal / S - 1 : null,
            trunc, sal: salida,
          });
        }
      }
    }
    cacheCad.clear();
    process.stderr.write(`\r   ${sym} · ${num(entradas)} entradas · ${num(filas.length)} operaciones      `);
  }
  process.stderr.write("\n");
  writeFileSync(CACHE_FILAS, JSON.stringify({ filas, san }));
} else {
  const o = filas; filas = o.filas; Object.assign(san.A, o.san.A); Object.assign(san.B, o.san.B);
  console.log("  (operaciones leídas de la caché de esta misma autopsia)");
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  SANIDAD");
console.log(`${"═".repeat(102)}`);
for (const env of ENVASES) {
  const s = san[env.id];
  console.log(`  ENVASE ${env.id} — ${env.et}`);
  console.log(`    operaciones ${num(s.n)} · huecos descartados ${num(s.huecos)} (${pct(s.huecos / (s.huecos + s.n))}) · sin contrato ${num(s.sinContrato)}`);
  console.log(`    coste medio de entrada ${pct(s.coste / s.n)} del subyacente · horquilla media ${pct(s.horq / s.n)} de la prima · vencen sin valor ${pct(s.sinValor / s.n)}`);
}

// ── acumuladores ──────────────────────────────────────────────────────────────────────────────
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const ganMedio = (a) => (a.win ? a.gan / a.win : 0);
const perMedio = (a) => (a.n - a.win ? a.per / (a.n - a.win) : 0);
const rr = (a) => (a.n ? ratio(a).toFixed(2) : "n/d");
const mide = (fs) => { const a = acc(); for (const f of fs) suma(a, APUESTA * f.ret); return a; };

const SENAL = (f) => f.diasSin2 < 1;   // la regla exacta del hallazgo: ayer se movió más del 2%
const A = filas.filter((f) => f.env === "A");
const B = filas.filter((f) => f.env === "B");

console.log(`\n  REPRODUCCIÓN de la regla, para que se vea que se está mirando lo mismo:`);
for (const [id, fs] of [["A", A], ["B", B]]) {
  const base = mide(fs), con = mide(fs.filter(SENAL)), sin = mide(fs.filter((f) => !SENAL(f)));
  console.log(`    ${id}: sin regla ${rr(base)} (acierta ${pct(acierto(base))}, n=${num(base.n)}) · CON regla ${rr(con)} (acierta ${pct(acierto(con))}, n=${num(con.n)}) · los días tranquilos ${rr(sin)} (acierta ${pct(acierto(sin))})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// A) ¿ES UN HUECO LEÍDO COMO JALEO?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  A) ¿Cuántas veces «ayer» es en realidad un HUECO en los datos?");
console.log(`${"═".repeat(102)}`);
{
  const disp = A.filter(SENAL);
  const nulos = disp.filter((f) => f.nuloAyer === 1);
  console.log(`  entradas con la regla activada (envase A): ${num(disp.length)}`);
  console.log(`  de ellas, con el retorno de ayer AUSENTE (hueco, no un movimiento): ${num(nulos.length)} (${pct(nulos.length / disp.length)})`);
  if (nulos.length) {
    const c = mide(nulos), l = mide(disp.filter((f) => f.nuloAyer !== 1));
    console.log(`  ratio de esas operaciones-hueco: ${rr(c)} (n=${num(c.n)}) · ratio de las de movimiento de verdad: ${rr(l)} (n=${num(l.n)})`);
    console.log(`  ⚠️ un hueco no es un movimiento: si el ratio saliera de aquí, el hallazgo estaría roto.`);
  } else {
    console.log(`  ninguna. La regla dispara siempre por un movimiento real medido.`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// B) ¿ES UN TERMÓMETRO DE VOLATILIDAD? · ¿ES EL PRECIO DE LA CUNA?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  B) ¿CON QUÉ SE SOLAPA LA SEÑAL? — correlaciones y escaleras propias de cada medida");
console.log(`${"═".repeat(102)}`);
console.log("  (los montones de esta sección se cortan con la muestra ENTERA: es una radiografía,");
console.log("   no una regla para operar. Nadie puede usarla el día de la compra.)");
{
  const v = A.filter((f) => f.movAyer != null && f.rv20 > 0 && f.cuna > 0);
  const s = v.map((f) => (SENAL(f) ? 1 : 0));
  console.log(`\n  correlación de la señal (0/1) con:`);
  console.log(`    volatilidad de los últimos 20 días : ${corr(s, v.map((f) => f.rv20)).toFixed(3)}`);
  console.log(`    volatilidad de los últimos 120 días: ${corr(s, v.map((f) => f.rv120)).toFixed(3)}`);
  console.log(`    precio de la CUNA en el dinero (% del subyacente, misma cadena): ${corr(s, v.map((f) => f.cuna)).toFixed(3)}`);
  console.log(`    coste de la propia opción comprada (% del subyacente)          : ${corr(s, v.map((f) => f.ask / f.S)).toFixed(3)}`);
  console.log(`    volatilidad de 20 días ⇄ precio de la cuna: ${corr(v.map((f) => f.rv20), v.map((f) => f.cuna)).toFixed(3)}  (para ver cuánto se parecen entre sí)`);
}

function quintiles(fs, campo) {
  const v = fs.filter((f) => Number.isFinite(campo(f)));
  const ord = [...v].sort((a, b) => campo(a) - campo(b));
  const out = [];
  for (let k = 0; k < 5; k++) out.push(ord.slice(Math.floor(ord.length * k / 5), Math.floor(ord.length * (k + 1) / 5)));
  return out;
}

for (const [et, campo] of [
  ["volatilidad de los últimos 20 días", (f) => f.rv20],
  ["precio de la CUNA en el dinero", (f) => f.cuna],
  ["coste de la opción comprada (ask/precio)", (f) => f.ask / f.S],
  ["movimiento de AYER en bruto (sin umbral)", (f) => f.movAyer],
]) {
  const q = quintiles(A, campo);
  console.log(`\n  ── ordenando por ${et} (montón 1 = valor más bajo) ──`);
  console.log(`  | montón | n | ratio | acierta | ganador medio |`);
  console.log(`  |---|---|---|---|---|`);
  for (let k = 0; k < 5; k++) { const a = mide(q[k]); console.log(`  | ${k + 1} | ${num(a.n)} | **${rr(a)}** | ${pct(acierto(a))} | ${dol(ganMedio(a))} |`); }
}

// ── LA DOBLE CLASIFICACIÓN: ¿añade algo la señal DENTRO de cada montón de volatilidad? ─────────
for (const [et, campo] of [
  ["volatilidad de los últimos 20 días", (f) => f.rv20],
  ["precio de la CUNA en el dinero", (f) => f.cuna],
]) {
  const q = quintiles(A, campo);
  console.log(`\n  ── DOBLE CLASIFICACIÓN — dentro de cada montón de «${et}», ¿la señal añade? ──`);
  console.log(`  | montón | n con señal | ratio CON | acierta CON | n sin señal | ratio SIN | acierta SIN |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (let k = 0; k < 5; k++) {
    const c = mide(q[k].filter(SENAL)), s = mide(q[k].filter((f) => !SENAL(f)));
    console.log(`  | ${k + 1} | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${num(s.n)} | ${rr(s)} | ${pct(acierto(s))} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// C) ¿ES EARNINGS? — el disparo mes a mes del calendario
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  C) ¿ES EARNINGS? — la entrada es el PRIMER día del mes, así que «ayer» es el ÚLTIMO del mes anterior");
console.log(`${"═".repeat(102)}`);
console.log("  Si la señal fuese resultados, dispararía mucho más al empezar FEBRERO, MAYO, AGOSTO y");
console.log("  NOVIEMBRE (el último día de enero, abril, julio y octubre es plena temporada).");
{
  const MESES = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  console.log(`  | mes de entrada | ${MESES.join(" | ")} |`);
  console.log(`  |---|${MESES.map(() => "---").join("|")}|`);
  const tot = MESES.map((m) => A.filter((f) => f.mesCal === m).length);
  const dis = MESES.map((m) => A.filter((f) => f.mesCal === m && SENAL(f)).length);
  console.log(`  | operaciones | ${tot.map((x) => num(x)).join(" | ")} |`);
  console.log(`  | dispara | ${dis.map((x) => num(x)).join(" | ")} |`);
  console.log(`  | % dispara | ${MESES.map((m, i) => pct(dis[i] / tot[i])).join(" | ")} |`);
  console.log(`  | ratio CON señal | ${MESES.map((m) => rr(mide(A.filter((f) => f.mesCal === m && SENAL(f))))).join(" | ")} |`);
  const post = ["02", "05", "08", "11"];
  const dentro = mide(A.filter((f) => SENAL(f) && post.includes(f.mesCal)));
  const fuera = mide(A.filter((f) => SENAL(f) && !post.includes(f.mesCal)));
  const dentroTot = A.filter((f) => post.includes(f.mesCal)).length, fueraTot = A.length - dentroTot;
  console.log(`\n  entrando el 1 de feb/may/ago/nov : dispara ${pct(A.filter((f) => SENAL(f) && post.includes(f.mesCal)).length / dentroTot)} de las veces · ratio ${rr(dentro)} (n=${num(dentro.n)})`);
  console.log(`  los otros ocho meses            : dispara ${pct(A.filter((f) => SENAL(f) && !post.includes(f.mesCal)).length / fueraTot)} de las veces · ratio ${rr(fuera)} (n=${num(fuera.n)})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// D) ¿ES LA DERIVA DEL MERCADO? — calls contra puts
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  D) ¿LA MEJORA ESTÁ EN LAS CALLS Y EN LAS PUTS, O SÓLO EN LAS CALLS?");
console.log(`${"═".repeat(102)}`);
for (const [id, fs] of [["A", A], ["B", B]]) {
  console.log(`\n  ENVASE ${id}`);
  console.log(`  | lado | n sin regla | ratio sin regla | acierta | n CON regla | ratio CON regla | acierta | mejora |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  for (const t of ["C", "P"]) {
    const b = mide(fs.filter((f) => f.tipo === t)), c = mide(fs.filter((f) => f.tipo === t && SENAL(f)));
    console.log(`  | ${t === "C" ? "CALL" : "PUT "} | ${num(b.n)} | ${rr(b)} | ${pct(acierto(b))} | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${(ratio(c) - ratio(b)).toFixed(2)} |`);
  }
}
// y además: ¿importa el SIGNO del movimiento de ayer?
console.log(`\n  ¿Importa hacia dónde se movió ayer? (envase A, sólo con la regla activada)`);
console.log(`  | ayer | lado | n | ratio | acierta |`);
console.log(`  |---|---|---|---|---|`);
for (const sg of [1, -1]) for (const t of ["C", "P"]) {
  const a = mide(A.filter((f) => SENAL(f) && f.signoAyer === sg && f.tipo === t));
  console.log(`  | ${sg > 0 ? "SUBIÓ" : "BAJÓ "} | ${t === "C" ? "CALL" : "PUT "} | ${num(a.n)} | **${rr(a)}** | ${pct(acierto(a))} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// E) ¿ES ESTE VALOR O ES EL MERCADO ENTERO?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  E) ¿SE MOVIÓ ESTE VALOR, O SE MOVIÓ EL MERCADO? — SPY el mismo día de ayer");
console.log(`${"═".repeat(102)}`);
{
  const conSpy = A.filter((f) => f.rSpyAyer != null);
  const disp = conSpy.filter(SENAL);
  const mercado = disp.filter((f) => Math.abs(f.rSpyAyer) > 0.02);
  const propio = disp.filter((f) => Math.abs(f.rSpyAyer) <= 0.02);
  console.log(`  operaciones con el dato de SPY: ${num(conSpy.length)} de ${num(A.length)}`);
  const m = mide(mercado), p = mide(propio);
  console.log(`  la regla dispara y ADEMÁS SPY se movió >2% (susto general) : ratio ${rr(m)} · acierta ${pct(acierto(m))} · n=${num(m.n)} (${pct(m.n / disp.length)} de los disparos)`);
  console.log(`  la regla dispara y SPY estuvo tranquilo (movimiento propio): ratio ${rr(p)} · acierta ${pct(acierto(p))} · n=${num(p.n)}`);
  // y la señal del MERCADO sola, aplicada a todo
  const soloMercado = mide(conSpy.filter((f) => Math.abs(f.rSpyAyer) > 0.02));
  const soloMercadoNo = mide(conSpy.filter((f) => Math.abs(f.rSpyAyer) <= 0.02));
  console.log(`\n  SI SE IGNORA EL VALOR y sólo se mira a SPY: comprar cualquier ticker el día después de un SPY >2%`);
  console.log(`    ratio ${rr(soloMercado)} · acierta ${pct(acierto(soloMercado))} · n=${num(soloMercado.n)}   ·   el resto de los días: ${rr(soloMercadoNo)} (n=${num(soloMercadoNo.n)})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// F) ¿SON BILLETES DE LOTERÍA? — de qué precio de entrada sale el dinero
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  F) ¿DE QUÉ PRECIO DE ENTRADA SALE EL DINERO GANADO?");
console.log(`${"═".repeat(102)}`);
{
  const cortes = [[0.10, 0.25], [0.25, 0.50], [0.50, 1.00], [1.00, 2.00], [2.00, 5.00], [5.00, 1e9]];
  const disp = A.filter(SENAL);
  const totGan = mide(disp).gan;
  console.log(`  | precio de la opción | n | ratio | acierta | contratos con $1,000 | % del dinero GANADO |`);
  console.log(`  |---|---|---|---|---|---|`);
  for (const [lo, hi] of cortes) {
    const g = disp.filter((f) => f.ask >= lo && f.ask < hi);
    const a = mide(g);
    const ctr = g.length ? media(g.map((f) => 1000 / (f.ask * 100))) : 0;
    console.log(`  | $${lo.toFixed(2)}–${hi > 1e8 ? "∞" : "$" + hi.toFixed(2)} | ${num(a.n)} | ${rr(a)} | ${pct(acierto(a))} | ${num(ctr)} | ${pct(a.gan / totGan)} |`);
  }
  console.log(`\n  ¿Y si se exige una opción que se pueda llenar de verdad?`);
  console.log(`  | mínimo exigido | n CON regla | ratio CON | acierta | n sin regla | ratio sin regla |`);
  console.log(`  |---|---|---|---|---|---|`);
  for (const min of [0.10, 0.25, 0.50, 1.00, 2.00]) {
    const c = mide(A.filter((f) => SENAL(f) && f.ask >= min)), b = mide(A.filter((f) => f.ask >= min));
    console.log(`  | ask ≥ $${min.toFixed(2)} | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${num(b.n)} | ${rr(b)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// G) EL CONTROL QUE DECIDE — VEINTE BARAJADOS, y DIEZ rotaciones de ticker
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  G) EL BARAJADO, VEINTE VECES — la misma señal con el día equivocado");
console.log(`${"═".repeat(102)}`);
console.log("  Se le pega a cada entrada la señal que ESE MISMO ticker tenía k entradas antes (k = 1…20).");
console.log("  Conserva la mezcla de tickers y de épocas, y rompe sólo el enganche con la fecha.");
{
  const porTk = new Map();
  for (const f of A) { if (!porTk.has(f.sym)) porTk.set(f.sym, new Map()); porTk.get(f.sym).set(f.dia, f); }
  const diasTk = new Map();
  for (const [sym, m] of porTk) diasTk.set(sym, [...m.keys()].sort());

  const res = [];
  for (let k = 1; k <= 20; k++) {
    const sel = [];
    for (const f of A) {
      const ds = diasTk.get(f.sym);
      const j = ds.indexOf(f.dia) - k;
      if (j < 0) continue;
      const otra = porTk.get(f.sym).get(ds[j]);
      if (otra && SENAL(otra)) sel.push(f);
    }
    const a = mide(sel);
    res.push({ k, r: ratio(a), ac: acierto(a), n: a.n });
  }
  const real = mide(A.filter(SENAL));
  console.log(`\n  | desplazamiento (meses) | ${res.map((x) => x.k).join(" | ")} |`);
  console.log(`  |---|${res.map(() => "---").join("|")}|`);
  console.log(`  | ratio | ${res.map((x) => x.r.toFixed(2)).join(" | ")} |`);
  console.log(`  | acierta | ${res.map((x) => pct(x.ac)).join(" | ")} |`);
  const rs = res.map((x) => x.r).sort((a, b) => a - b);
  console.log(`\n  LA NUBE DE LOS 20 BARAJADOS: mínimo ${rs[0].toFixed(2)} · mediana ${rs[10].toFixed(2)} · máximo ${rs[19].toFixed(2)}`);
  console.log(`  la señal DE VERDAD: ${ratio(real).toFixed(2)}  ·  barajados que llegan o pasan de ella: ${rs.filter((x) => x >= ratio(real)).length} de 20`);
  console.log(`  barajados que llegan a 1.40 (el listón del encargo): ${rs.filter((x) => x >= 1.40).length} de 20`);
  const acs = res.map((x) => x.ac).sort((a, b) => a - b);
  console.log(`  acierto de los barajados: mínimo ${pct(acs[0])} · mediana ${pct(acs[10])} · máximo ${pct(acs[19])}  ·  el de verdad ${pct(acierto(real))}`);

  // rotación de TICKER: misma fecha, la señal de OTRO valor
  console.log(`\n  ── y el otro control: MISMA FECHA, la señal de OTRO ticker (rotación 1…10) ──`);
  const simbolos = [...porTk.keys()].sort();
  const res2 = [];
  for (let g = 1; g <= 10; g++) {
    const sel = [];
    for (const f of A) {
      const i = simbolos.indexOf(f.sym);
      const otro = simbolos[(i + g) % simbolos.length];
      const m = porTk.get(otro);
      const of_ = m?.get(f.dia);
      if (of_ && SENAL(of_)) sel.push(f);
    }
    const a = mide(sel);
    res2.push({ g, r: ratio(a), n: a.n, ac: acierto(a) });
  }
  console.log(`  | rotación | ${res2.map((x) => x.g).join(" | ")} |`);
  console.log(`  |---|${res2.map(() => "---").join("|")}|`);
  console.log(`  | ratio | ${res2.map((x) => x.r.toFixed(2)).join(" | ")} |`);
  console.log(`  | n | ${res2.map((x) => num(x.n)).join(" | ")} |`);
  const r2 = res2.map((x) => x.r).sort((a, b) => a - b);
  console.log(`  nube: mínimo ${r2[0].toFixed(2)} · mediana ${r2[5].toFixed(2)} · máximo ${r2[9].toFixed(2)}   (la de verdad ${ratio(real).toFixed(2)})`);
  console.log(`  ⚠️ ojo: esta rotación NO rompe la fecha, sólo el valor. Si sube por encima de 1.11 es que`);
  console.log(`     parte del efecto es del DÍA (mercado movido), no del valor concreto.`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// H) LO QUE DE VERDAD PASA DESPUÉS — ¿se mueve más el subyacente, o sólo se paga más?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  H) EL MECANISMO — ¿el subyacente se mueve más de lo que la cadena cobraba?");
console.log(`${"═".repeat(102)}`);
{
  const v = A.filter((f) => f.movReal != null && f.cuna > 0);
  const con = v.filter(SENAL), sin = v.filter((f) => !SENAL(f));
  const f1 = (g) => ({
    movMedio: media(g.map((f) => Math.abs(f.movReal))),
    cuna: media(g.map((f) => f.cuna)),
    coste: media(g.map((f) => f.ask / f.S)),
    rv20: media(g.map((f) => f.rv20)),
    supera10: g.filter((f) => Math.abs(f.movReal) > 0.10).length / g.length,
  });
  const a = f1(con), b = f1(sin);
  console.log(`  | | CON la regla | sin la regla |`);
  console.log(`  |---|---|---|`);
  console.log(`  | movimiento REALIZADO del subyacente en los 30 días (en valor absoluto) | ${pct(a.movMedio)} | ${pct(b.movMedio)} |`);
  console.log(`  | veces que se mueve más del 10% (que es lo que hace falta) | ${pct(a.supera10)} | ${pct(b.supera10)} |`);
  console.log(`  | precio de la CUNA que cobraba la cadena ese día | ${pct(a.cuna)} | ${pct(b.cuna)} |`);
  console.log(`  | coste de la opción comprada (% del subyacente) | ${pct(a.coste)} | ${pct(b.coste)} |`);
  console.log(`  | volatilidad de los 20 días anteriores | ${(100 * a.rv20).toFixed(2)}% | ${(100 * b.rv20).toFixed(2)}% |`);
  const sube = a.movMedio / b.movMedio - 1, cara = a.cuna / b.cuna - 1;
  console.log(`\n  el subyacente se mueve un ${pct(sube)} MÁS con la regla, y la cadena cobra un ${pct(cara)} más.`);
  console.log(`  (si lo primero es mayor que lo segundo, la señal está comprando movimiento por debajo de su precio)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// I) EL 2% MEDIDO CON LOS CIERRES REALES DE DISCO (2021-2026), no con la paridad
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  I) EL MISMO 2%, PERO MEDIDO CON LOS CIERRES REALES DEL SUBYACENTE (2021-2026)");
console.log(`${"═".repeat(102)}`);
console.log("  El precio deducido de la cadena tiene un error mediano del 0.055%, pero un 0.5% de los días");
console.log("  se pasa del 1%. Si el 2% de ayer fuese en parte ese ruido, con cierres reales se caería.");
{
  const CL = {};
  for (const sym of TICKERS) { const p = `${CIERRES}/${sym}.json`; if (existsSync(p)) { try { CL[sym] = JSON.parse(readFileSync(p, "utf8")); } catch {} } }
  // retorno real de ayer: se necesitan los dos cierres anteriores al día de la compra
  const diasIdx = new Map();
  for (const sym of TICKERS) diasIdx.set(sym, diasPorSim.get(sym));
  let conDato = 0, sinDato = 0, discrepan = 0;
  const marcadas = [];
  for (const f of A) {
    const cl = CL[f.sym]; if (!cl) { sinDato++; continue; }
    const ds = diasIdx.get(f.sym);
    const i = ds.indexOf(f.dia);
    const a1 = cl[ds[i - 1]], a2 = cl[ds[i - 2]];
    if (!(a1 > 0) || !(a2 > 0)) { sinDato++; continue; }
    conDato++;
    let x = a1 / a2 - 1;
    if (Math.abs(x) > 0.35) x = 0;
    const senalReal = Math.abs(x) > 0.02;
    if (senalReal !== SENAL(f)) discrepan++;
    marcadas.push({ f, senalReal });
  }
  console.log(`\n  operaciones con cierres reales disponibles: ${num(conDato)} de ${num(A.length)} · sin dato ${num(sinDato)}`);
  console.log(`  veces que la señal de la paridad y la de los cierres reales NO coinciden: ${num(discrepan)} (${pct(discrepan / conDato)})`);
  const conR = mide(marcadas.filter((x) => x.senalReal).map((x) => x.f));
  const conP = mide(marcadas.filter((x) => SENAL(x.f)).map((x) => x.f));
  const base = mide(marcadas.map((x) => x.f));
  console.log(`  sobre ESAS MISMAS operaciones (sólo 2021-2026):`);
  console.log(`    sin regla                      : ratio ${rr(base)} · acierta ${pct(acierto(base))} · n=${num(base.n)}`);
  console.log(`    regla con el precio de paridad : ratio ${rr(conP)} · acierta ${pct(acierto(conP))} · n=${num(conP.n)}`);
  console.log(`    regla con los CIERRES REALES   : ratio ${rr(conR)} · acierta ${pct(acierto(conR))} · n=${num(conR.n)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// J) LA ESCALERA DEL UMBRAL — ¿es el 2% o vale cualquier corte?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  J) ¿ES EL 2% O VALE CUALQUIER CORTE? — si sólo funciona en el 2% clavado, es sobreajuste");
console.log(`${"═".repeat(102)}`);
for (const [id, fs] of [["A", A], ["B", B]]) {
  console.log(`\n  ENVASE ${id} — «ayer se movió más de U»`);
  console.log(`  | U | n | ratio | acierta | ops/año | ratio del resto |`);
  console.log(`  |---|---|---|---|---|---|`);
  for (const u of [0.005, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05]) {
    const c = mide(fs.filter((f) => f.movAyer != null && f.movAyer > u));
    const r = mide(fs.filter((f) => f.movAyer != null && f.movAyer <= u));
    console.log(`  | ${(100 * u).toFixed(1)}% | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${num(c.n / 11)} | ${rr(r)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// K) ¿DE CUÁNTAS OPERACIONES SALE EL DINERO? — y cuántas apuestas DE VERDAD independientes hay
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  K) CONCENTRACIÓN — de cuántos billetes sale el dinero, y cuántas apuestas hay de verdad");
console.log(`${"═".repeat(102)}`);
{
  const disp = A.filter(SENAL);
  const g = disp.map((f) => APUESTA * f.ret).filter((d) => d > 0).sort((a, b) => b - a);
  const tot = mide(disp);
  console.log(`  n=${num(tot.n)} operaciones · ${num(g.length)} ganadoras · dinero ganado ${dol(tot.gan)} · perdido ${dol(tot.per)} · ratio ${rr(tot)}`);
  for (const k of [1, 5, 10, 20, 50]) {
    const s = g.slice(0, k).reduce((a, b) => a + b, 0);
    console.log(`    las ${num(k)} mejores aportan ${pct(s / tot.gan)} de lo ganado · ratio quitándolas ${((tot.gan - s) / tot.per).toFixed(2)}`);
  }
  const dias = new Set(disp.map((f) => f.dia));
  const eventos = new Set(disp.map((f) => `${f.sym}|${f.dia}`));
  console.log(`\n  ⚠️ las ${num(tot.n)} operaciones NO son ${num(tot.n)} apuestas independientes:`);
  console.log(`     son ${num(eventos.size)} sucesos (ticker+día) — la call y la put del mismo día son el MISMO suceso —`);
  console.log(`     repartidos en sólo ${num(dias.size)} fechas de calendario distintas.`);
  console.log(`     Y con 30 días de bolsa dentro, las entradas de meses seguidos se SOLAPAN.`);

  // ¿de qué celdas de la doble clasificación sale el dinero?
  const q = quintiles(A, (f) => f.rv20);
  console.log(`\n  reparto del dinero ganado por montón de volatilidad de 20 días (sólo con la regla):`);
  console.log(`  | montón de volatilidad | n | % de las operaciones | % del dinero ganado | ratio |`);
  console.log(`  |---|---|---|---|---|`);
  for (let k = 0; k < 5; k++) {
    const a = mide(q[k].filter(SENAL));
    console.log(`  | ${k + 1} | ${num(a.n)} | ${pct(a.n / tot.n)} | ${pct(a.gan / tot.gan)} | ${rr(a)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// L) EL BARAJADO, POR DENTRO — ¿por qué el barajado ya sube el acierto de 17.5% a 20%?
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  L) POR QUÉ EL BARAJADO YA ACIERTA MÁS QUE EL LISTÓN — la composición, no la fecha");
console.log(`${"═".repeat(102)}`);
console.log("  El barajado con el día equivocado ya acierta ~20% cuando el listón acierta 17.5%. No es");
console.log("  magia: al barajar dentro del mismo ticker se conserva QUÉ tickers y QUÉ épocas entran, y");
console.log("  el acierto sube solo con la volatilidad (12.4% → 24.0% del montón 1 al 5 de arriba).");
{
  const porTk = new Map();
  for (const f of A) { if (!porTk.has(f.sym)) porTk.set(f.sym, new Map()); porTk.get(f.sym).set(f.dia, f); }
  const diasTk = new Map();
  for (const [sym, m] of porTk) diasTk.set(sym, [...m.keys()].sort());
  const base = mide(A), real = mide(A.filter(SENAL));
  console.log(`\n  | quién | ratio | acierta | ganador medio | perdedor medio | volatilidad media de 20 días |`);
  console.log(`  |---|---|---|---|---|---|`);
  const rv = (fs) => (100 * media(fs.map((f) => f.rv20).filter(Number.isFinite))).toFixed(2) + "%";
  console.log(`  | listón (todas) | ${rr(base)} | ${pct(acierto(base))} | ${dol(ganMedio(base))} | ${dol(perMedio(base))} | ${rv(A)} |`);
  const filasBaraj = [];
  for (let k = 1; k <= 20; k++) {
    const sel = [];
    for (const f of A) {
      const ds = diasTk.get(f.sym);
      const j = ds.indexOf(f.dia) - k;
      if (j < 0) continue;
      const otra = porTk.get(f.sym).get(ds[j]);
      if (otra && SENAL(otra)) sel.push(f);
    }
    filasBaraj.push(sel);
  }
  const todosB = filasBaraj.flat();
  const b = mide(todosB);
  console.log(`  | los 20 barajados juntos | ${rr(b)} | ${pct(acierto(b))} | ${dol(ganMedio(b))} | ${dol(perMedio(b))} | ${rv(todosB)} |`);
  console.log(`  | la señal DE VERDAD | ${rr(real)} | ${pct(acierto(real))} | ${dol(ganMedio(real))} | ${dol(perMedio(real))} | ${rv(A.filter(SENAL))} |`);
  console.log(`\n  el acierto: listón ${pct(acierto(base))} → barajado ${pct(acierto(b))} → de verdad ${pct(acierto(real))}`);
  const gTot = acierto(real) - acierto(base), gComp = acierto(b) - acierto(base);
  console.log(`  de los ${(100 * gTot).toFixed(1)} puntos que sube el acierto, ${(100 * gComp).toFixed(1)} los da ya la MEZCLA (tickers y épocas movidos)`);
  console.log(`  y sólo ${(100 * (gTot - gComp)).toFixed(1)} los da acertar la FECHA.`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  PUERTAS ABIERTAS EN ESTA AUTOPSIA");
console.log(`${"═".repeat(102)}`);
console.log("  No se busca aquí ninguna regla nueva: se mide UNA sola regla ya fijada (el 2% de ayer)");
console.log("  desde 10 ángulos. Las tablas con varias filas (montones, umbrales, precios de entrada)");
console.log("  son radiografías descriptivas, no candidatas. Los controles del azar: 20 barajados por");
console.log("  desplazamiento + 10 rotaciones de ticker = 30 tiradas de control.");
console.log(`${"═".repeat(102)}\n`);
