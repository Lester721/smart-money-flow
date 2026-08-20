// SEGUIR EL PRINT · 1 — ¿ELIGE EL PRINT MEJOR QUE EL AZAR DENTRO DE LA ESQUINA BARATA?
//
// ═══ LA PREGUNTA, BIEN PLANTEADA ════════════════════════════════════════════════════════════
//
// Once métricas de MarketSnack fallaron, TODAS medidas igual: el campo AGREGADO POR (ticker, día)
// contra el retorno de la ACCIÓN. Un operador no hace eso. Ve UNA operación gigante entrar al ask
// y la sigue. Y el censo (print-0-censo.mjs) destapó por qué eso importa tanto:
//
//   **el 46,8% de los prints son PATAS DE UN SPREAD** — mismo ticker, mismo milisegundo, otro
//   contrato. Una pata de cóndor "al ask" no es una apuesta alcista: es media estructura neutral.
//   Las once métricas anteriores metían esas patas en el mismo saco que las apuestas de verdad.
//
// Aquí se separan y se mide lo único que importa: **¿elige el print mejor que el azar?**
//
// ═══ EL VEHÍCULO — la esquina barata, medida antes ══════════════════════════════════════════
//
// Comprar opciones al azar pierde −25,5% por operación. Pero el peaje varía ×12 dentro de la
// rejilla, y la esquina barata es 5% FUERA DEL DINERO · ~90 DÍAS DE PLAZO: peaje 5,2% de la prima,
// hace falta acertar el 52,8% para empatar (2,8 puntos a una moneda).
//
// ═══ CÓMO SE EJECUTA, PASO A PASO ══════════════════════════════════════════════════════════
//
//   1. el print ocurre a las HH:MM (ET) del día D · sólo se admiten prints ANTES de las 15:00,
//      para que quede una hora entre ver la señal y ejecutar
//   2. al CIERRE de D se compra la opción de la esquina (5% fuera, ~90 días) en la dirección del
//      print, **al ASK real** de la cadena de cierre
//   3. al cierre de D+k se vende **al BID real**. Si el contrato ya no tiene puja, vale CERO
//   4. CONTROL: la MISMA operación con la dirección echada a suertes = la media de las dos patas
//      (call y put de la misma esquina, mismo día, mismo ticker). Es el azar exacto, sin muestreo.
//   5. CONTROL 2: mismo día y misma dirección, pero TICKER SORTEADO entre los que cotizaban.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-1-seguir.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { pasarBarrera, informe, potencia, comprobarDescarte, listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25;
const SALIDAS = [5, 10, 23];                       // días de calendario en posición
const PRIMAS = [250e3, 1e6, 2.5e6];
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

// ── EL UNIVERSO ─────────────────────────────────────────────────────────────────────────────
const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop() ?? "20260806";

console.log(`\n${"═".repeat(102)}`);
console.log(`SEGUIR EL PRINT · 1 — ¿elige mejor que el azar dentro de la esquina barata?`);
console.log(`${"═".repeat(102)}`);
console.log(`  universo con cadena Y cierres: ${conCad.length} tickers · último día de cadena ${ULTIMO}`);
console.log(`  esquina: ${(DIST * 100).toFixed(0)}% fuera · ~${DTE_OBJ} días (±${TOL_DTE}) · compra al ASK, venta al BID\n`);

// ── 1. LOS PRINTS, DÍA A DÍA, CON LA MARCA DE "PATA DE SPREAD" ──────────────────────────────
// Día a día porque las patas comparten milisegundo Y día: no hace falta tener los 2M en memoria.
console.log(`## 1. Leyendo el flujo y marcando las patas de spread`);
const eventos = [];          // un print candidato por fila (aún sin filtrar por regla)
let leidos = 0, tras = 0;
const setCad = new Set(conCad);
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  leidos += crudos.length;
  // patas: (ticker, milisegundo) con más de UN contrato distinto
  const inst = new Map();
  const filas = [];
  for (const o of crudos) {
    const q = parseOCC(o.symbol);
    if (!q) continue;
    const k = `${q.raiz}|${o.timestamp}`;
    if (!inst.has(k)) inst.set(k, new Set());
    inst.get(k).add(`${q.exp}|${q.tipo}|${q.K}`);
    filas.push([o, q, k]);
  }
  const dY = dia.replace(/-/g, "");
  for (const [o, q, k] of filas) {
    if (!setCad.has(q.raiz)) continue;
    if (!setDias.get(q.raiz)?.has(dY)) continue;               // ese día no hay cadena: no se puede operar
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;                     // hace falta una hora hasta el cierre
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;                                  // MIDMKT no dice quién tenía prisa
    if (o.premium < PRIMAS[0]) continue;
    tras++;
    eventos.push({
      dia, dY, tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike,
      prem: o.premium, size: o.size, lado, patas: inst.get(k).size,
      dir: (q.tipo === "C" ? 1 : -1) * lado,                    // +1 alcista · −1 bajista
      et, oi: o.open_interest, vol: o.volume, S: o.asset_price,
      dtePrint: dias(dY, q.exp),
    });
  }
}
console.log(`   ${fmt(leidos)} prints leídos · ${fmt(tras)} sobreviven a (ticker con cadena · 9:30-15:00 ET · lado definido · ≥$${fmt(PRIMAS[0] / 1000)}k)`);
comprobarDescarte(leidos, tras, "criba de admisión de prints", 0.995);
{
  const sueltos = eventos.filter((e) => e.patas === 1).length;
  console.log(`   de ellos, ${fmt(sueltos)} son SUELTOS (${((100 * sueltos) / eventos.length).toFixed(1)}%) y ${fmt(eventos.length - sueltos)} son PATA de spread`);
}

// ── 2. LA REJILLA DE PRECIOS DE LA ESQUINA — se calcula UNA vez por (ticker, día) ────────────
// Se guardan las DOS patas (call y put) de cada (ticker, día): la elegida da el resultado de la
// regla y la MEDIA DE LAS DOS es el azar exacto, sin sorteo.
console.log(`\n## 2. Precios reales de la esquina para cada (ticker, día) · ${SALIDAS.join("/")} días de salida`);
const rejilla = new Map();       // "tk|dY" -> {C:{...}, P:{...}, ret:{k:{C,P}}}
let intentos = 0, conPrecio = 0;
const t0 = Date.now();
for (const tk of conCad) {
  limpiarCache();
  const misDias = diasPorTk.get(tk);
  const cl = cierres(tk);
  for (const dY of misDias) {
    if (dY > ULTIMO) continue;
    intentos++;
    const S = cl[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    if (!c || !p || c.exp !== p.exp) continue;                  // mismo vencimiento: si no, no son comparables
    const ret = {};
    for (const k of SALIDAS) {
      const salida = misDias.find((d) => d > dY && dias(dY, d) >= k);
      if (!salida || salida > c.exp) continue;
      const vC = bidSalida(tk, salida, c.exp, "C", c.K);
      const vP = bidSalida(tk, salida, p.exp, "P", p.K);
      if (vC === null || vP === null) continue;                 // sin cadena de salida NO se mide
      ret[k] = { C: vC / c.ask - 1, P: vP / p.ask - 1, salida, diasPos: dias(dY, salida) };
    }
    if (!Object.keys(ret).length) continue;
    conPrecio++;
    rejilla.set(`${tk}|${dY}`, {
      exp: c.exp, KC: c.K, KP: p.K, askC: c.ask, askP: p.ask, bidC: c.bid, bidP: p.bid,
      dte: c.dte, S, ret,
      peaje: ((c.ask - c.bid) / c.ask + (p.ask - p.bid) / p.ask) / 2,
      prima: ((c.ask + p.ask) / 2) * 100,
    });
  }
}
console.log(`   ${fmt(conPrecio)} de ${fmt(intentos)} (ticker, día) tienen las dos patas de la esquina con precio real y salida (${((100 * conPrecio) / intentos).toFixed(1)}%) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
{
  const porTk = new Map();
  for (const k of rejilla.keys()) { const t = k.split("|")[0]; porTk.set(t, (porTk.get(t) ?? 0) + 1); }
  const sinNada = conCad.filter((t) => !porTk.has(t));
  console.log(`   tickers con rejilla: ${porTk.size}/${conCad.length}${sinNada.length ? ` · SIN NINGUNA: ${sinNada.join(" ")}` : ""}`);
  const peajes = [...rejilla.values()].map((r) => r.peaje);
  const primas = [...rejilla.values()].map((r) => r.prima);
  console.log(`   peaje real de la esquina: p50 ${(100 * pctl(peajes, 0.5)).toFixed(1)}% de la prima · prima p50 $${fmt(pctl(primas, 0.5))} por contrato`);
}

// ── 3. RADIOGRAFÍA antes de medir ───────────────────────────────────────────────────────────
{
  const muestra = eventos.slice(0, 200000).map((e) => ({
    prem: e.prem, size: e.size, patas: e.patas, dir: e.dir, et: e.et, dtePrint: e.dtePrint,
    oi: e.oi, vol: e.vol,
  }));
  radiografia(muestra, ["prem", "size", "patas", "et", "dtePrint", "oi", "vol"], "prints candidatos", { minDistintos: 4 });
}

// ── 4. LAS REGLAS ───────────────────────────────────────────────────────────────────────────
// SE DECLARAN TODAS ANTES DE MIRAR NINGÚN RESULTADO. El listón de Bonferroni sale de contarlas.
const REGLAS = [];
for (const soloSueltos of [true, false])
  for (const lado of [1, -1])
    for (const minPrem of PRIMAS)
      REGLAS.push({
        nombre: `${soloSueltos ? "SUELTO" : "todos "} · ${lado === 1 ? "al ASK" : "al BID"} · ≥$${(minPrem / 1e6).toFixed(2)}M`,
        soloSueltos, lado, minPrem,
      });
const PRUEBAS = REGLAS.length * SALIDAS.length;
const LISTON = listonT(PRUEBAS);
console.log(`\n## 3. ${REGLAS.length} reglas × ${SALIDAS.length} salidas = ${PRUEBAS} pruebas declaradas · listón de Bonferroni |t| ≥ ${LISTON}\n`);

/** Una entrada por (ticker, día): la dirección del print MÁS GRANDE que pasa la regla ese día.
 *  Es lo que ve el operador —"la operación del día en ese activo"—, no un promedio. */
function entradas(regla) {
  const mejor = new Map();
  for (const e of eventos) {
    if (regla.soloSueltos && e.patas !== 1) continue;
    if (e.lado !== regla.lado) continue;
    if (e.prem < regla.minPrem) continue;
    const k = `${e.tk}|${e.dY}`;
    if (!rejilla.has(k)) continue;
    const a = mejor.get(k);
    if (!a || e.prem > a.prem) mejor.set(k, e);
  }
  return [...mejor.values()];
}

// ── 5. MEDIR ────────────────────────────────────────────────────────────────────────────────
const resultados = [];
for (const regla of REGLAS) {
  const ent = entradas(regla);
  for (const k of SALIDAS) {
    const filas = [];
    for (const e of ent) {
      const r = rejilla.get(`${e.tk}|${e.dY}`);
      const rr = r?.ret[k];
      if (!rr) continue;
      const elegido = e.dir === 1 ? rr.C : rr.P;
      const otro = e.dir === 1 ? rr.P : rr.C;
      filas.push({
        pnl: elegido, azar: (rr.C + rr.P) / 2, otro,
        ticker: e.tk, fecha: e.dia, fechaY: e.dY, dir: e.dir, prem: e.prem,
        prima: e.dir === 1 ? r.askC * 100 : r.askP * 100, diasPos: rr.diasPos, peaje: r.peaje,
      });
    }
    if (filas.length < 30) { resultados.push({ regla: regla.nombre, k, n: filas.length, vacio: true }); continue; }
    const pnl = filas.map((f) => f.pnl), azar = filas.map((f) => f.azar);
    const dif = filas.map((f) => f.pnl - f.azar);
    const acierto = filas.filter((f) => f.pnl > f.otro).length / filas.length;
    const ne = nEfectiva(filas, k);
    const tks = new Map();
    for (const f of filas) tks.set(f.ticker, (tks.get(f.ticker) ?? 0) + 1);
    const may = [...tks.entries()].sort((a, b) => b[1] - a[1])[0];
    resultados.push({
      regla: regla.nombre, k, n: filas.length,
      ret: media(pnl), azarRet: media(azar), dif: media(dif), tDif: tUna(dif),
      acierto, nEfTk: ne.porTicker, nEfVent: ne.ventanas,
      mayor: may ? { t: may[0], pct: may[1] / filas.length } : null,
      prima: media(filas.map((f) => f.prima)), diasPos: media(filas.map((f) => f.diasPos)),
      filas,
    });
  }
}

console.log(`  ${"regla".padEnd(30)} ${"sal".padStart(3)} ${"n".padStart(5)} ${"nEf".padStart(5)} ${"vent".padStart(4)}  ${"regla%".padStart(7)} ${"azar%".padStart(7)} ${"dif%".padStart(7)} ${"t".padStart(6)}  ${"acierto".padStart(7)}  mayor ticker`);
for (const r of resultados) {
  if (r.vacio) { console.log(`  ${r.regla.padEnd(30)} ${String(r.k).padStart(3)} ${String(r.n).padStart(5)}   — muestra corta`); continue; }
  const marca = Math.abs(r.tDif) >= LISTON ? " ◄" : "";
  console.log(`  ${r.regla.padEnd(30)} ${String(r.k).padStart(3)} ${String(r.n).padStart(5)} ${String(r.nEfTk).padStart(5)} ${String(r.nEfVent).padStart(4)}  ` +
    `${(100 * r.ret).toFixed(1).padStart(6)}% ${(100 * r.azarRet).toFixed(1).padStart(6)}% ${(100 * r.dif).toFixed(1).padStart(6)}% ${r.tDif.toFixed(2).padStart(6)}  ` +
    `${(100 * r.acierto).toFixed(1).padStart(6)}%  ${r.mayor.t} ${(100 * r.mayor.pct).toFixed(0)}%${marca}`);
}

// ── 6. LA BARRERA sobre las que asoman ──────────────────────────────────────────────────────
console.log(`\n${"═".repeat(102)}`);
console.log(`LA BARRERA — sólo se reporta lo que pase las cuatro cribas`);
console.log(`${"═".repeat(102)}`);
const candidatas = resultados.filter((r) => !r.vacio && Math.abs(r.tDif) >= LISTON).sort((a, b) => Math.abs(b.tDif) - Math.abs(a.tDif));
if (!candidatas.length) {
  console.log(`\n  Ninguna de las ${PRUEBAS} pruebas llega al listón |t| ≥ ${LISTON}.`);
  const mejor = resultados.filter((r) => !r.vacio).sort((a, b) => Math.abs(b.tDif) - Math.abs(a.tDif))[0];
  if (mejor) console.log(`  La más alta: ${mejor.regla} salida ${mejor.k} · dif ${(100 * mejor.dif).toFixed(2)}% · t=${mejor.tDif.toFixed(2)}`);
} else {
  for (const c of candidatas.slice(0, 6)) {
    const v = pasarBarrera(c.filas, (f) => f.pnl - f.azar, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
    console.log(`\n${informe(v, `${c.regla} · salida ${c.k}d`)}`);
  }
}

// ── 7. POTENCIA: ¿podía la muestra ver lo que buscamos? ─────────────────────────────────────
console.log(`\n${"═".repeat(102)}`);
console.log(`POTENCIA — un "no funciona" sólo vale si la prueba podía ver el efecto`);
console.log(`${"═".repeat(102)}\n`);
// El efecto que importa: pasar del 50% de acierto al 52,8% de empate mueve el retorno por
// operación en (0,528−0,50)×(mg−mf). Con mg≈+49% y mf≈−55%, son ~2,9 puntos de retorno.
const EFECTO = 0.029;
for (const k of SALIDAS) {
  const r = resultados.filter((x) => !x.vacio && x.k === k).sort((a, b) => b.n - a.n)[0];
  if (!r) continue;
  const p = potencia(r.filas.map((f) => ({ pnl: f.pnl - f.azar, ticker: f.ticker, fecha: f.fecha })), EFECTO);
  console.log(`  salida ${String(k).padStart(2)}d (${r.regla.trim()}, n=${r.n}): ${p.mensaje}`);
}

writeFileSync("scripts/print-1-seguir.json", JSON.stringify({
  liston: LISTON, pruebas: PRUEBAS, dist: DIST, dteObj: DTE_OBJ,
  filas: resultados.map(({ filas, ...r }) => r),
}, null, 1));
console.log(`\n  → scripts/print-1-seguir.json\n`);
