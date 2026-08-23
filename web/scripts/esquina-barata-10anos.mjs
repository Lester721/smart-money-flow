// LA ESQUINA BARATA, SOBRE 10 AÑOS — el listón contra el que compite cualquier señal.
//
// ═══ POR QUÉ ESTO VA PRIMERO ════════════════════════════════════════════════════════════════
//
// La esquina barata (5% fuera del dinero, ~90 días de plazo, salir a los ~23) salió de matar
// MarketSnack: ahí el peaje cae del 26,9% al 5,2% y sólo hay que ganarle 2,8 puntos a una moneda.
// Con el mapa de liquidez encima baja a ~1 punto.
//
// PERO ese "comprar al azar pierde −25,5%" se midió sobre **86 días de un mercado alcista**
// (SPY +8,1% en 106 días). No es un listón: es una foto de un trimestre bueno.
//
// Sobre 10 años y varios regímenes —incluido 2018, 2020 y 2022— el número real puede ser muy
// distinto. Y ese número ES EL LISTÓN de todo lo que venga después: una señal que no lo supere
// no sirve, por muy significativa que sea.
//
// Así que aquí NO se prueba ninguna señal. Se establece el suelo, y con honestidad:
//   · ¿cuánto pierde (o gana) comprar al azar en esta esquina, año a año?
//   · ¿cuánto de eso es la deriva del mercado y cuánto es el vehículo?
//   · ¿el peaje del 5,2% se sostiene en 10 años o era propio de 2026?
//
// ═══ EL CONTROL QUE SEPARA LA DERIVA DEL VEHÍCULO ═══════════════════════════════════════════
//
// Comprar calls en un mercado que sube gana aunque el vehículo sea malo. Por eso se mide también
// el CONO: comprar la call Y la put a la vez. Si el cono pierde, lo que pierde es el vehículo;
// si las calls ganan pero el cono pierde, lo que ganaba era la subida del mercado, no la esquina.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/esquina-barata-10anos.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OTM = 5;                 // % fuera del dinero
const DTE_OBJ = 90;            // plazo objetivo
const DTE_TOL = 25;            // margen aceptable alrededor
const SALIR = 23;              // días de bolsa hasta la salida
const ASK_MIN = 0.10;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (x * 100).toFixed(1) + "%";
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);

// ── índice de días por ticker ───────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();
console.log(`\n## ${TICKERS.length} tickers · ${[...diasPorSim.values()].reduce((a, v) => a + v.length, 0).toLocaleString("es-ES")} días de cadena\n`);

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
/** El spot por paridad: el strike donde call y put valen casi lo mismo. */
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

// ── una operación de la esquina ─────────────────────────────────────────────
function operar(sym, dia, tipo) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  const dias = diasPorSim.get(sym);
  const iEntrada = dias.indexOf(dia);
  const iSalida = iEntrada + SALIR;
  if (iSalida >= dias.length) return null;              // la salida cae fuera de los datos
  const diaSalida = dias[iSalida];

  // el contrato: el más cercano a 5% fuera, con el plazo más cercano a 90 días
  const objetivo = tipo === "C" ? sp * (1 + OTM / 100) : sp * (1 - OTM / 100);
  let mejor = null, mejorD = Infinity;
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (Math.abs(dte - DTE_OBJ) > DTE_TOL) continue;
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== tipo) continue;
      const K = Number(clave.slice(0, -2));
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN)) continue;
      const d = Math.abs(K - objetivo) / sp + Math.abs(dte - DTE_OBJ) / 1000;
      if (d < mejorD) { mejorD = d; mejor = { exp, clave, K, bid, ask, dte }; }
    }
  }
  if (!mejor) return null;

  // SE COMPRA AL ASK. Se vende al BID del día de salida. Si el contrato ya no cotiza, vale 0.
  const gSal = cadena(sym, diaSalida)?.[mejor.exp];
  const salida = gSal?.[mejor.clave]?.[0] ?? 0;
  const spSal = cadena(sym, diaSalida) ? spotDe(cadena(sym, diaSalida)) : null;
  return {
    sym, dia, tipo, ano: dia.slice(0, 4),
    prima: mejor.ask, salida,
    ret: (salida - mejor.ask) / mejor.ask,
    horquilla: (mejor.ask - mejor.bid) / mejor.ask,
    movSubyacente: spSal ? (spSal - sp) / sp : null,
  };
}

// ── una entrada al mes por ticker, el primer día con cadena ─────────────────
const ops = [];
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const vistos = new Set();
  for (const d of dias) {
    const mes = d.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    for (const tipo of ["C", "P"]) { const o = operar(sym, d, tipo); if (o) ops.push(o); }
  }
  process.stdout.write(`\r   ${sym} · ${ops.length} operaciones   `);
}
console.log(`\n\n${ops.length.toLocaleString("es-ES")} operaciones (una al mes por ticker, call y put)\n`);
if (ops.length < 200) { console.error("Muestra insuficiente."); process.exit(1); }

// ── EL LISTÓN ───────────────────────────────────────────────────────────────
function resumen(nombre, sel) {
  const e = ops.filter(sel);
  if (e.length < 30) return null;
  const r = e.map((x) => x.ret);
  const sinValor = e.filter((x) => x.salida === 0).length / e.length;
  const t = media(r) / (sd(r) / Math.sqrt(r.length));
  console.log(`| ${nombre} | ${e.length.toLocaleString("es-ES")} | ${pct(sinValor)} | ${pct(media(r))} | ${pct(media(e.map((x) => x.horquilla)))} | ${t.toFixed(2)} |`);
  return { nombre, n: e.length, ret: media(r), t };
}

console.log(`### El vehículo, sin ninguna señal\n`);
console.log("| qué | n | expiran sin valor | retorno medio | horquilla | t |");
console.log("|---|---|---|---|---|---|");
resumen("**calls**", (x) => x.tipo === "C");
resumen("**puts**", (x) => x.tipo === "P");
resumen("**las dos (el cono)**", () => true);

console.log(`\n### Año a año — el cono, que aísla el vehículo de la deriva\n`);
console.log("| año | n | retorno medio del cono | calls | puts |");
console.log("|---|---|---|---|---|");
for (const a of [...new Set(ops.map((o) => o.ano))].sort()) {
  const e = ops.filter((o) => o.ano === a);
  if (e.length < 20) continue;
  const c = e.filter((x) => x.tipo === "C").map((x) => x.ret);
  const p = e.filter((x) => x.tipo === "P").map((x) => x.ret);
  console.log(`| ${a} | ${e.length} | **${pct(media(e.map((x) => x.ret)))}** | ${pct(media(c))} | ${pct(media(p))} |`);
}

// ── EL LISTÓN, EN LA FORMA QUE DECIDE ───────────────────────────────────────
const cono = media(ops.map((x) => x.ret));
const horq = media(ops.map((x) => x.horquilla));
console.log(`\n${"═".repeat(76)}`);
console.log(`  EL LISTÓN PARA CUALQUIER SEÑAL FUTURA:`);
console.log(`    comprar al azar en esta esquina da **${pct(cono)}** por operación (el cono, sin deriva)`);
console.log(`    la horquilla real de estos contratos es **${pct(horq)}** de la prima`);
console.log(`    → una señal tiene que separar MÁS de ${pct(Math.abs(cono))} para que la esquina dé dinero`);
console.log(`\n  (el estudio de MarketSnack midió −25,5% sobre 86 días de mercado alcista.`);
console.log(`   Esto son ${ops.length.toLocaleString("es-ES")} operaciones sobre ~10 años y varios regímenes.)`);
console.log("═".repeat(76));

// ═══ LA VARA DE LESTER, añadida el 2026-08-23 ═══════════════════════════════════════════════
//
// Sus palabras: «perder $1.000 para intentar ganar $10.000 o más, eso para mí valía la pena...
// si la estrategia tiene éxito 7 de 10 veces, perder $3.000 pero generar $70.000 lo hago con la
// felicidad más grande del mundo. Pero si es exitosa 2 de 10, gano $20.000 pero perdí $8.000 en
// el camino, no me va a gustar tanto.»
//
// Eso no es el neto: es CUÁNTO GANA POR CADA DÓLAR QUE PIERDE. Sus dos ejemplos dan 23 y 2,5.
// El retorno medio, que es lo único que este script daba hasta ahora, no distingue entre esos
// dos mundos — y para una estrategia convexa esa distinción ES la estrategia.
//
// Se mide con TAMAÑO IGUAL en cada intento ($1.000 arriesgado siempre), que es como se operaría
// de verdad: el que compra elige cuánto pone. Sumar primas de tickers distintos mediría el
// tamaño de los contratos, no la calidad de la estrategia.

const APUESTA = 1000;
const dolar = (o) => APUESTA * o.ret;          // mismo riesgo en cada intento

function vara(lista, etiqueta) {
  if (!lista.length) { console.log(`  ${etiqueta}: sin operaciones`); return null; }
  const d = lista.map(dolar);
  const gan = d.filter((x) => x > 0), per = d.filter((x) => x <= 0);
  const totalGan = gan.reduce((a, b) => a + b, 0);
  const totalPer = Math.abs(per.reduce((a, b) => a + b, 0));
  const ratio = totalPer > 0 ? totalGan / totalPer : Infinity;
  const orden = [...d].sort((a, b) => b - a);
  // ¿cuántos ganadores hacen falta para pagar TODAS las pérdidas?
  let acum = 0, cuantos = 0;
  for (const x of orden) { if (x <= 0) break; acum += x; cuantos++; if (acum >= totalPer) break; }
  console.log(
    `  ${etiqueta.padEnd(26)} n=${String(lista.length).padStart(5)} · acierta ${(100 * gan.length / d.length).toFixed(1).padStart(4)}% · ` +
    `gana $${Math.round(totalGan).toLocaleString("es-ES").padStart(8)} · pierde $${Math.round(totalPer).toLocaleString("es-ES").padStart(8)} · ` +
    `RATIO ${ratio.toFixed(2).padStart(5)} · neto $${Math.round(totalGan - totalPer).toLocaleString("es-ES").padStart(8)}`);
  console.log(
    `  ${"".padEnd(26)} el mayor billete pagó $${Math.round(orden[0]).toLocaleString("es-ES")} · ` +
    `hacen falta ${acum >= totalPer ? cuantos : "MÁS DE " + cuantos} ganadores para pagar TODAS las pérdidas · ` +
    `ganador medio $${gan.length ? Math.round(totalGan / gan.length) : 0} · perdedor medio $${per.length ? Math.round(totalPer / per.length) : 0}`);
  return { ratio, neto: totalGan - totalPer, acierto: gan.length / d.length };
}

console.log(`\n\n${"═".repeat(100)}`);
console.log(`  EL ENVASE VACÍO, CON LA VARA DE LESTER`);
console.log(`  (arriesgando $${APUESTA} en cada intento · sin ninguna señal · ${ops.length.toLocaleString("es-ES")} operaciones)`);
console.log(`${"═".repeat(100)}\n`);
vara(ops, "TODO (el cono)");
vara(ops.filter((o) => o.tipo === "C"), "sólo calls");
vara(ops.filter((o) => o.tipo === "P"), "sólo puts");
console.log(`\n  Año a año (el cono, que aísla el vehículo de la deriva del mercado):`);
for (const a of [...new Set(ops.map((o) => o.ano))].sort()) vara(ops.filter((o) => o.ano === a), `  ${a}`);

console.log(`\n${"═".repeat(100)}`);
console.log(`  CÓMO LEER ESTO`);
console.log(`  · RATIO = dólares ganados ÷ dólares perdidos. Sus dos ejemplos daban 23 y 2,5.`);
console.log(`  · Si el envase VACÍO ya da un ratio por encima de 1, sólo falta subir el acierto.`);
console.log(`  · Si da por debajo de 1, el envase pierde y ninguna señal lo arregla sola: habría`);
console.log(`    que cambiar el vehículo (otro plazo, otra distancia, otra salida) antes de buscar señales.`);
console.log(`${"═".repeat(100)}`);
