// vehiculo-comprar-opcion.mjs — ¿QUÉ ECONOMÍA TIENE COMPRAR UNA OPCIÓN?
//
// Va PRIMERO y sin ninguna señal. Antes de preguntar si un panel de MarketSnack sirve para
// comprar calls o puts, hay que saber cuánto cuesta el vehículo. Cuatro preguntas:
//
//   1. SOLAPAMIENTO — qué tickers del flujo de MS tienen cadena real de precios.
//   2. PEAJE        — la horquilla como % de la prima, y cuánto tiene que moverse el subyacente
//                     sólo para EMPATAR comprando al ask.
//   3. PAGO         — comprando al azar y aguantando a vencimiento: % que expiran sin valor,
//                     pago medio, p90, p99. El CONTROL contra el que se compara cualquier señal.
//   4. RITMO        — cuántas oportunidades hay en 86 días y cuántas caben enteras en la ventana.
//
// PRECIOS REALES. Se compra al ASK. Se liquida a vencimiento por el valor intrínseco calculado
// con el CIERRE REAL del subyacente. Ningún Black-Scholes, ningún punto medio.
//
// TRAMPA CONOCIDA DEL FICHERO DE CADENAS: el descargador (bajar-cadenas-todos-los-dias.ts, línea
// 57) descarta toda fila con `bid <= 0`. Las opciones que no valen nada NO ESTÁN en el fichero.
// Por eso el pago a vencimiento NO se lee de la cadena del día del vencimiento (sesgaría hacia
// arriba: sólo sobrevivirían las ganadoras): se calcula del cierre del subyacente. La cadena del
// día del vencimiento se usa sólo para VALIDAR el intrínseco, no para producir el resultado.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const MSDIR = "scripts/cache-theta/marketsnack";
const CUENTA = 56389;
const RUPTURA = "2026-07-16";

const ymd = (s) => s.replace(/-/g, "");
const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dias = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

// ═══════════════════════════════════════════════════════════════════════════════════════
// 1. SOLAPAMIENTO
// ═══════════════════════════════════════════════════════════════════════════════════════

const tickersCadena = [...new Set(
  readdirSync(CDIR).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]),
)].sort();

// Sólo los que tienen cadena DENTRO de la ventana del flujo (2026-04-22 → …).
const diasCadena = {};
for (const t of tickersCadena) {
  const ds = readdirSync(CDIR).filter((f) => f.startsWith(`${t}_d2026`)).map((f) => f.slice(-13, -5)).sort();
  const enVentana = ds.filter((d) => d >= "20260422");
  if (enVentana.length) diasCadena[t] = enVentana;
}

const censo = JSON.parse(readFileSync(`${MSDIR}/censo-roots.json`, "utf8"));
const enAmbos = censo.roots.filter((r) => diasCadena[r.t]);
const filasCubiertas = enAmbos.reduce((a, r) => a + r.n, 0);

console.log("═".repeat(95));
console.log("1. SOLAPAMIENTO — qué se puede medir de verdad");
console.log("═".repeat(95));
console.log(`  tickers con cadena en la ventana : ${Object.keys(diasCadena).length}`);
console.log(`  roots distintos en el flujo de MS: ${censo.roots.length}`);
console.log(`  tickers en AMBOS                 : ${enAmbos.length}`);
console.log(`  filas de MS cubiertas            : ${filasCubiertas.toLocaleString()} de ${censo.total.toLocaleString()} = ${(100 * filasCubiertas / censo.total).toFixed(1)}%`);
console.log(`\n  ticker    filas MS   días MS   días cadena`);
for (const r of enAmbos) console.log(`  ${r.t.padEnd(7)} ${String(r.n).padStart(9)} ${String(r.d).padStart(9)} ${String(diasCadena[r.t].length).padStart(13)}`);
const noCub = censo.roots.filter((r) => !diasCadena[r.t]).slice(0, 8);
console.log(`\n  los mayores SIN cadena (no medibles): ${noCub.map((r) => `${r.t} ${(100 * r.n / censo.total).toFixed(1)}%`).join(" · ")}`);

// Días del flujo de MS
const diasFlujo = readdirSync(`${MSDIR}/flujo-1000k`).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const ultimoCierre = "2026-08-06";
const diasMedibles = diasFlujo.filter((d) => d <= ultimoCierre);
console.log(`\n  días de flujo MS: ${diasFlujo.length} (${diasFlujo[0]} → ${diasFlujo.at(-1)})`);
console.log(`  días con cadena Y cierre        : ${diasMedibles.length} (${diasMedibles[0]} → ${diasMedibles.at(-1)})`);
console.log(`  ✗ ${diasFlujo.length - diasMedibles.length} días de flujo NO tienen cadena: las cadenas y los cierres paran el ${ultimoCierre}.`);

// ═══════════════════════════════════════════════════════════════════════════════════════
// CARGA: cierres + cadenas
// ═══════════════════════════════════════════════════════════════════════════════════════

const cierres = {};
for (const t of Object.keys(diasCadena)) {
  const p = `${CIERRES}/${t}.json`;
  if (existsSync(p)) cierres[t] = JSON.parse(readFileSync(p, "utf8"));
}
const tickers = Object.keys(diasCadena).filter((t) => cierres[t]);

// Aviso de splits: un salto de cierre >35% en un día rompería el emparejamiento strike↔precio.
const sospechosos = [];
for (const t of tickers) {
  const ds = Object.keys(cierres[t]).filter((d) => d >= "20260401" && d <= "20260806").sort();
  for (let i = 1; i < ds.length; i++) {
    const r = cierres[t][ds[i]] / cierres[t][ds[i - 1]] - 1;
    if (Math.abs(r) > 0.35) sospechosos.push(`${t} ${ds[i]} ${(r * 100).toFixed(0)}%`);
  }
}
console.log(`  posibles splits en la ventana   : ${sospechosos.length ? sospechosos.join(", ") : "ninguno (ningún salto >35% en un día)"}`);

const DIST = [0.05, 0.10, 0.20];
const DTE = [7, 30, 90];
const TOL_DTE = { 7: 4, 30: 10, 90: 25 };
const TOL_DIST = 0.30; // el strike elegido no puede desviarse >30% relativo de la distancia pedida

/** Elige de una cadena el contrato más cercano a (dte, distancia, tipo). Devuelve null si no llega. */
function elegir(cad, S, dteObj, dist, tipo, hoy) {
  let mejorExp = null, mejorDD = Infinity;
  for (const exp of Object.keys(cad)) {
    const d = dias(hoy, exp);
    if (d < 1) continue;
    const dd = Math.abs(d - dteObj);
    if (dd < mejorDD) { mejorDD = dd; mejorExp = exp; }
  }
  if (!mejorExp || mejorDD > TOL_DTE[dteObj]) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mejorK = null, mejorKD = Infinity;
  for (const clave of Object.keys(cad[mejorExp])) {
    const [ks, r] = clave.split("|");
    if (r !== tipo) continue;
    const K = Number(ks);
    const kd = Math.abs(K - objetivo);
    if (kd < mejorKD) { mejorKD = kd; mejorK = K; }
  }
  if (mejorK == null) return null;
  const distReal = tipo === "C" ? mejorK / S - 1 : 1 - mejorK / S;
  if (Math.abs(distReal - dist) > dist * TOL_DIST) return null;
  const [bid, ask] = cad[mejorExp][`${mejorK}|${tipo}`];
  return { expiracion: mejorExp, K: mejorK, bid, ask, dteReal: dias(hoy, mejorExp), distReal };
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// BARRIDO
// ═══════════════════════════════════════════════════════════════════════════════════════

const filas = [];
let sinCierreExp = 0, conCadenaExp = 0;
const validaIntrinseco = [];

for (const t of tickers) {
  for (const dY of diasCadena[t]) {
    const d = iso(dY);
    if (d < diasFlujo[0] || d > ultimoCierre) continue;
    const S = cierres[t][dY];
    if (!(S > 0)) continue;
    const p = `${CDIR}/${t}_d${dY}.json`;
    if (!existsSync(p)) continue;
    let cad;
    try { cad = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
    if (!cad || !Object.keys(cad).length) continue;

    for (const dte of DTE) for (const dist of DIST) for (const tipo of ["C", "P"]) {
      const c = elegir(cad, S, dte, dist, tipo, dY);
      if (!c) continue;
      if (!(c.ask > 0) || !(c.bid > 0) || c.ask < c.bid) continue;

      // PEAJE — round trip: compras al ask, vendes al bid. Coste como % de lo pagado.
      const peaje = (c.ask - c.bid) / c.ask;
      // Movimiento del subyacente necesario para EMPATAR aguantando a vencimiento.
      const beS = tipo === "C" ? c.K + c.ask : c.K - c.ask;
      const movEmpate = tipo === "C" ? beS / S - 1 : 1 - beS / S;

      // PAGO — sólo si el vencimiento cae dentro de la ventana de cierres.
      let pago = null, mult = null, ret = null;
      const cierreExp = cierres[t][c.expiracion];
      if (cierreExp > 0) {
        pago = tipo === "C" ? Math.max(0, cierreExp - c.K) : Math.max(0, c.K - cierreExp);
        mult = pago / c.ask;          // múltiplo sobre la prima pagada
        ret = mult - 1;               // retorno por operación
        // validación: si el contrato SIGUE en la cadena del día del vencimiento, ¿cuadra el bid?
        const pe = `${CDIR}/${t}_d${c.expiracion}.json`;
        if (existsSync(pe)) {
          try {
            const ce = JSON.parse(readFileSync(pe, "utf8"));
            const v = ce?.[c.expiracion]?.[`${c.K}|${tipo}`];
            if (v) { conCadenaExp++; validaIntrinseco.push({ bid: v[0], intr: pago, dif: v[0] - pago }); }
          } catch { /* ignora */ }
        }
      } else if (c.expiracion <= ymd(ultimoCierre)) sinCierreExp++;

      filas.push({
        ticker: t, fecha: d, tipo, dist, dte, K: c.K, exp: c.expiracion,
        S, bid: c.bid, ask: c.ask, peaje, movEmpate,
        dteReal: c.dteReal, distReal: c.distReal,
        pago, mult, ret, resuelta: ret != null ? 1 : 0,
        tramo: d < RUPTURA ? "antes" : "despues",
      });
    }
  }
}

console.log(`\n  contratos construidos: ${filas.length.toLocaleString()} · resueltos a vencimiento: ${filas.filter((f) => f.resuelta).length.toLocaleString()}`);
if (sinCierreExp) console.log(`  ⚠ ${sinCierreExp} vencimientos dentro de la ventana sin cierre del subyacente (días no bursátiles / huecos)`);

// ── RADIOGRAFÍA antes de medir nada ──
radiografia(filas, ["peaje", "movEmpate", "ask", "bid", "S", "dteReal"], "contratos comprables");
const resueltas = filas.filter((f) => f.resuelta);
radiografia(resueltas, ["mult", "ret"], "operaciones liquidadas a vencimiento", { cerosLegitimos: ["mult"] });

// Validación del intrínseco contra el bid del día del vencimiento
if (validaIntrinseco.length > 30) {
  const difs = validaIntrinseco.map((v) => v.dif);
  console.log(`\n  VALIDACIÓN del intrínseco: ${validaIntrinseco.length} contratos que aún cotizaban el día del vencimiento.`);
  console.log(`    bid real − intrínseco: p10 ${pct(difs, 0.1).toFixed(2)} · mediana ${pct(difs, 0.5).toFixed(2)} · p90 ${pct(difs, 0.9).toFixed(2)} $`);
  console.log(`    (si la mediana es ≈0 el intrínseco es una liquidación honesta; si es muy negativa, liquidar a vencimiento SOBREVALORA)`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 2. EL PEAJE
// ═══════════════════════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(95));
console.log("2. EL PEAJE — la horquilla como % de la prima, y el movimiento para EMPATAR");
console.log("═".repeat(95));
console.log("  compra al ASK · venta al BID · el 'empate' es el movimiento del subyacente que hace");
console.log("  falta para recuperar exactamente la prima pagada, aguantando a vencimiento.\n");
console.log("  tipo dist  dte     n   prima($)  horquilla%prima   mover p/ empatar   dte real  dist real");
console.log("  " + "─".repeat(91));
const tabPeaje = [];
for (const tipo of ["C", "P"]) for (const dist of DIST) for (const dte of DTE) {
  const g = filas.filter((f) => f.tipo === tipo && f.dist === dist && f.dte === dte);
  if (g.length < 20) continue;
  const pe = g.map((f) => f.peaje), mv = g.map((f) => f.movEmpate), pr = g.map((f) => f.ask * 100);
  const row = {
    tipo, dist, dte, n: g.length,
    prima: media(pr), peaje: media(pe), peajeMed: pct(pe, 0.5), mov: media(mv),
    dteReal: media(g.map((f) => f.dteReal)), distReal: media(g.map((f) => f.distReal)),
  };
  tabPeaje.push(row);
  console.log(`  ${tipo}   ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)} ${String(g.length).padStart(6)}  ${row.prima.toFixed(0).padStart(8)}   ` +
    `${(row.peaje * 100).toFixed(1).padStart(5)}% (med ${(row.peajeMed * 100).toFixed(1)}%)   ${(row.mov * 100).toFixed(1).padStart(6)}%           ${row.dteReal.toFixed(0).padStart(3)}     ${(row.distReal * 100).toFixed(1).padStart(5)}%`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 3. EL PAGO — control al azar
// ═══════════════════════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(95));
console.log("3. EL PAGO — comprando AL AZAR y aguantando a vencimiento (el CONTROL)");
console.log("═".repeat(95));
console.log("  liquidación por intrínseco con el CIERRE REAL del subyacente el día del vencimiento.\n");
console.log("  tipo dist  dte     n   sin valor%   pago medio   p90     p99    retorno medio   t");
console.log("  " + "─".repeat(91));
const tabPago = [];
for (const tipo of ["C", "P"]) for (const dist of DIST) for (const dte of DTE) {
  const g = resueltas.filter((f) => f.tipo === tipo && f.dist === dist && f.dte === dte);
  if (g.length < 20) continue;
  const m = g.map((f) => f.mult), r = g.map((f) => f.ret);
  const cero = m.filter((x) => x === 0).length / m.length;
  const t = media(r) / (sd(r) / Math.sqrt(g.length));
  tabPago.push({ tipo, dist, dte, n: g.length, cero, medio: media(m), p90: pct(m, 0.9), p99: pct(m, 0.99), ret: media(r), t });
  console.log(`  ${tipo}   ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)} ${String(g.length).padStart(6)}   ${(cero * 100).toFixed(1).padStart(6)}%    ` +
    `${media(m).toFixed(2).padStart(6)}x  ${pct(m, 0.9).toFixed(2).padStart(6)}x ${pct(m, 0.99).toFixed(2).padStart(6)}x   ${(media(r) * 100).toFixed(1).padStart(7)}%   ${t.toFixed(2).padStart(6)}`);
}

const todosRet = resueltas.map((f) => f.ret);
const tGlobal = media(todosRet) / (sd(todosRet) / Math.sqrt(todosRet.length));
console.log(`\n  TODO junto: n=${todosRet.length.toLocaleString()} · sin valor ${(100 * todosRet.filter((x) => x === -1).length / todosRet.length).toFixed(1)}% · ` +
  `pago medio ${media(resueltas.map((f) => f.mult)).toFixed(3)}x · retorno medio ${(media(todosRet) * 100).toFixed(1)}% · t=${tGlobal.toFixed(2)}`);

// Los dos tramos de la ruptura del 16 de julio
console.log(`\n  LOS DOS TRAMOS (ruptura de la tubería de MS el ${RUPTURA}):`);
const tramos = {};
for (const tr of ["antes", "despues"]) {
  const g = resueltas.filter((f) => f.tramo === tr);
  if (!g.length) { console.log(`    ${tr}: 0 operaciones`); continue; }
  const r = g.map((f) => f.ret);
  const tt = media(r) / (sd(r) / Math.sqrt(g.length));
  tramos[tr] = { n: g.length, ret: media(r), mult: media(g.map((f) => f.mult)), cero: g.filter((f) => f.mult === 0).length / g.length, t: tt,
    desde: g.map((f) => f.fecha).sort()[0], hasta: g.map((f) => f.fecha).sort().at(-1) };
  console.log(`    ${tr.padEnd(8)} n=${String(g.length).padStart(5)} (${tramos[tr].desde}→${tramos[tr].hasta}) · sin valor ${(tramos[tr].cero * 100).toFixed(1)}% · pago ${tramos[tr].mult.toFixed(3)}x · retorno ${(tramos[tr].ret * 100).toFixed(1)}% · t=${tt.toFixed(2)}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// 4. EL RITMO + n EFECTIVA
// ═══════════════════════════════════════════════════════════════════════════════════════

console.log("\n" + "═".repeat(95));
console.log("4. EL RITMO — cuántas oportunidades caben en la ventana, y cuál es la n EFECTIVA");
console.log("═".repeat(95));

const diasConDato = [...new Set(filas.map((f) => f.fecha))].sort();
const spanDias = dias(ymd(diasConDato[0]), ymd(diasConDato.at(-1)));
console.log(`  ventana medible: ${diasConDato.length} sesiones · ${spanDias} días naturales (${diasConDato[0]} → ${diasConDato.at(-1)})`);
console.log(`  oportunidades brutas (ticker × día × dte × dist × tipo): ${filas.length.toLocaleString()}`);
console.log(`  de ellas resueltas dentro de la ventana                : ${resueltas.length.toLocaleString()} (${(100 * resueltas.length / filas.length).toFixed(1)}%)`);

console.log(`\n  n EFECTIVA — dos solapamientos que hay que descontar:`);
console.log(`    (a) en el TIEMPO: una posición a ${DTE.join("/")} días se solapa con la del día siguiente.`);
console.log(`        períodos NO solapados = ${spanDias} días naturales / plazo:`);
const nEfPorTicker = {};
for (const dte of DTE) {
  const periodos = spanDias / dte;
  const nT = new Set(resueltas.filter((f) => f.dte === dte).map((f) => f.ticker)).size;
  nEfPorTicker[dte] = { periodos, tickers: nT, nEf: periodos * nT };
  console.log(`          ${String(dte).padStart(3)}d → ${periodos.toFixed(1)} períodos independientes × ${nT} tickers = ${(periodos * nT).toFixed(0)} apuestas no solapadas`);
}
console.log(`    (b) entre TICKERS: los 27 son casi todos del mismo mercado (QQQ, SPY, NVDA, AMD,`);
console.log(`        MSFT, META, AAPL, INTC, TSLA, ORCL = 93% del flujo cubierto). Un día malo del`);
console.log(`        Nasdaq las tumba a todas a la vez, así que la n efectiva REAL es aún menor.`);

// Cuánto capital hay que comprometer y qué son los resultados en dólares al año
console.log("\n" + "═".repeat(95));
console.log("EN DÓLARES AL AÑO — cuenta de $" + CUENTA.toLocaleString());
console.log("═".repeat(95));
const anual = [];
for (const tipo of ["C", "P"]) for (const dist of DIST) for (const dte of DTE) {
  const g = resueltas.filter((f) => f.tipo === tipo && f.dist === dist && f.dte === dte);
  if (g.length < 20) continue;
  const prima = media(g.map((f) => f.ask * 100));      // capital por contrato
  const retMedio = media(g.map((f) => f.ret));
  const opsAno = 365 / dte;                             // ciclos al año con UN contrato rodando
  const dolarPorOp = prima * retMedio;
  anual.push({ tipo, dist, dte, prima, retMedio, opsAno, dolarAno: dolarPorOp * opsAno, n: g.length });
}
anual.sort((a, b) => b.dolarAno - a.dolarAno);
console.log("  tipo dist  dte   capital/contrato   ret medio   ciclos/año   $/año (1 contrato)");
console.log("  " + "─".repeat(91));
for (const a of anual) console.log(`  ${a.tipo}   ${(a.dist * 100).toFixed(0).padStart(3)}%  ${String(a.dte).padStart(3)}   ${("$" + a.prima.toFixed(0)).padStart(12)}   ${(a.retMedio * 100).toFixed(1).padStart(8)}%   ${a.opsAno.toFixed(1).padStart(8)}   ${("$" + (a.dolarAno).toFixed(0)).padStart(14)}`);

const mejor = anual[0];
console.log(`\n  el mejor cubo al azar: ${mejor.tipo} a ${(mejor.dist * 100).toFixed(0)}% y ${mejor.dte}d → $${mejor.dolarAno.toFixed(0)}/año por contrato de $${mejor.prima.toFixed(0)} de capital.`);

// ── CUÁNTO tendría que separar una señal para pagar el peaje ──
console.log("\n" + "═".repeat(95));
console.log("EL LISTÓN QUE SALE DE AQUÍ");
console.log("═".repeat(95));
const peajeGlobal = media(filas.map((f) => f.peaje));
console.log(`  peaje medio (horquilla / prima)            : ${(peajeGlobal * 100).toFixed(1)}%`);
console.log(`  → una señal que no mejore el resultado en más de ${(peajeGlobal * 100).toFixed(1)} puntos porcentuales de la`);
console.log(`    prima no compra nada: se la come la horquilla antes de empezar.`);
for (const dte of DTE) {
  const nEf = nEfPorTicker[dte].nEf;
  const g = resueltas.filter((f) => f.dte === dte);
  if (g.length < 20) continue;
  const s = sd(g.map((f) => f.ret));
  const detectable = 2.8 * s / Math.sqrt(nEf / 2);
  console.log(`  a ${String(dte).padStart(2)}d: sd del retorno ${(s * 100).toFixed(0)}% · n efectiva ${nEf.toFixed(0)} → separación mínima detectable ≈ ${(detectable * 100).toFixed(0)} pp`);
}
console.log(`  listón de t con 30 pruebas: ${listonT(30)}`);

writeFileSync("scripts/vehiculo-comprar-opcion.json", JSON.stringify({
  solapamiento: { tickersCadena: Object.keys(diasCadena).length, rootsMS: censo.roots.length, enAmbos: enAmbos.length,
    filasCubiertas, filasTotalMS: censo.total, pctCubierto: filasCubiertas / censo.total,
    diasFlujo: diasFlujo.length, diasMedibles: diasMedibles.length,
    detalle: enAmbos.map((r) => ({ t: r.t, filasMS: r.n, diasMS: r.d, diasCadena: diasCadena[r.t].length })) },
  peaje: tabPeaje, pago: tabPago, anual, tramos, nEfectiva: nEfPorTicker,
  contratos: filas.length, resueltas: resueltas.length, peajeGlobal, spanDias, sesiones: diasConDato.length,
  validaIntrinseco: validaIntrinseco.length,
}, null, 1));
console.log("\n  → scripts/vehiculo-comprar-opcion.json");
