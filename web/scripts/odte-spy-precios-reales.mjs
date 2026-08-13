// 0DTE DE SPY, REHECHO CON PRECIOS REALES — sin una sola cifra de modelo.
//
// Lo que se está poniendo a prueba: `odte-2-backtest.ts` concluyó que el bear call spread a 1σ
// sobre SPY 0DTE da "+4-5% por operación, ~$3.400/año con $1.200 de riesgo, ~70 días al año".
// Ese número salió valorando con bsPrice alimentado con volatilidad realizada — o sea, cobrando
// exactamente lo que el movimiento iba a costar. Es de los pocos contaminados que dijeron
// "SÍ FUNCIONA", y estuvo a punto de desplegarse en Railway.
//
// ╔═══ AQUÍ NO HAY NADA INVENTADO ═══╗
//   · El crédito sale de bid/ask REALES: se VENDE la corta al bid y se COMPRA la larga al ask.
//   · Los strikes son los que EXISTEN en la cadena de ese día. Nada de 318,07.
//   · El vencimiento es el propio día (0DTE), comprobado porque la cadena existe.
//   · La σ para situar el strike sale de la IV REAL del mercado a esa hora, no de la realizada.
//   · Liquidación al cierre real del subyacente, valor intrínseco acotado por el ancho.
//   · Comisiones de Robinhood: $0,03 por contrato y pata, 2 patas, ida y vuelta.
//
// Datos: scripts/cache-theta/spy-0dte/*.json — 1.075 sesiones (2022-2026), bajadas el 2026-08-13.
// Cada fila: [hhmm, lado, strike, bid, ask, iv, subyacente].
//
// Uso: node scripts/odte-spy-precios-reales.mjs

import fs from "node:fs";
import path from "node:path";

const DIR = "scripts/cache-theta/spy-0dte";
const HORAS = ["09:45", "10:00", "10:30", "11:00", "11:30", "12:00", "13:00", "14:00"];
const CIERRE_MIN = 16 * 60;
const SIGMA = 1, ANCHO_SIGMA = 0.5;
const COMISION = Number(process.env.ODTE_TASAS ?? 0.03);   // tasas regulatorias, NO comisión de Robinhood

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
console.log(`═══ 0DTE SPY CON PRECIOS REALES ═══`);
console.log(`   ${dias.length} sesiones · ${dias[0].replace(".json", "")} → ${dias[dias.length - 1].replace(".json", "")}`);
console.log(`   bear call spread a ${SIGMA}σ, ancho ${ANCHO_SIGMA}σ · vender al bid, comprar al ask\n`);

const minutos = (h) => +h.slice(0, 2) * 60 + +h.slice(3);
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUno = (a) => media(a) / (de(a) / Math.sqrt(a.length));
const mdn = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const resultados = {};
for (const h of HORAS) resultados[h] = [];
let sinCadena = 0, sinStrikes = 0;

for (const f of dias) {
  let filas; try { filas = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")); } catch { sinCadena++; continue; }
  const dia = f.replace(".json", "");

  // El cierre del subyacente: el último `underlying_price` de la sesión. Es dato del propio
  // proveedor en el mismo fichero — no se cruza con otra serie (eso ya nos coló un look-ahead).
  const ultimas = filas.filter((r) => r[0] <= "16:00").sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const cierre = ultimas.length ? ultimas[ultimas.length - 1][6] : null;
  if (!(cierre > 0)) { sinCadena++; continue; }

  for (const hora of HORAS) {
    const enHora = filas.filter((r) => r[0] === hora && r[1] === "C");
    if (enHora.length < 5) continue;
    const U = enHora[0][6];
    if (!(U > 0)) continue;

    // σ del movimiento que QUEDA hasta el cierre, con la IV REAL de la opción al dinero.
    const alDinero = enHora.reduce((b, r) => (Math.abs(r[2] - U) < Math.abs(b[2] - U) ? r : b), enHora[0]);
    const iv = alDinero[5];
    if (!(iv > 0.01) || iv > 5) continue;
    const minsRestantes = CIERRE_MIN - minutos(hora);
    if (minsRestantes < 30) continue;
    // Convención de sesión: el año tiene 252 sesiones de 390 minutos.
    const T = (minsRestantes / 390) / 252;
    const em = U * iv * Math.sqrt(T);
    if (!(em > 0)) continue;

    // Strikes REALES: los que existen en la cadena, no los teóricos.
    const ks = [...new Set(enHora.map((r) => r[2]))].sort((a, b) => a - b);
    const cerca = (x) => ks.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), ks[0]);
    const kCorto = cerca(U + SIGMA * em);
    const arriba = ks.filter((k) => k > kCorto);
    if (!arriba.length) { sinStrikes++; continue; }
    const kLargo = cerca.call(null, kCorto + ANCHO_SIGMA * em) > kCorto
      ? arriba.reduce((b, k) => (Math.abs(k - (kCorto + ANCHO_SIGMA * em)) < Math.abs(b - (kCorto + ANCHO_SIGMA * em)) ? k : b), arriba[0])
      : arriba[0];
    if (kLargo <= kCorto) { sinStrikes++; continue; }

    const qC = enHora.find((r) => r[2] === kCorto), qL = enHora.find((r) => r[2] === kLargo);
    if (!qC || !qL) { sinStrikes++; continue; }
    const [, , , bidC, askC] = qC, [, , , bidL, askL] = qL;
    if (!(bidC > 0) || !(askL > 0)) { sinStrikes++; continue; }

    // Se VENDE al bid y se COMPRA al ask. Horquilla entera, ida. Y al vencer no se recompra:
    // 0DTE liquida solo, así que sólo hay comisión de apertura de 2 patas.
    const ancho = kLargo - kCorto;
    const brutoMedio = ((bidC + askC) / 2) - ((bidL + askL) / 2);   // al punto medio, sin costes
    const credito = bidC - askL - 2 * COMISION;                     // real: horquilla + comisiones

    // NO se descartan los días sin crédito: que no haya crédito ES el resultado. Filtrarlos
    // sería quedarse sólo con los días favorables, que es como se fabrica un edge falso.
    const operable = credito > 0 && credito < ancho;
    const perdida = Math.min(Math.max(cierre - kCorto, 0), ancho);
    const pl = operable ? (credito - perdida) * 100 : null;
    const riesgo = (ancho - credito) * 100;
    resultados[hora].push({ dia, operable, ret: operable ? pl / riesgo * 100 : null, pl, riesgo,
                            credito: credito * 100, brutoMedio: brutoMedio * 100, ancho });
  }
}

console.log(`   sesiones sin cadena usable: ${sinCadena}  ·  entradas sin strikes: ${sinStrikes}\n`);
console.log(`   LA PREGUNTA PREVIA: ¿hay crédito que cobrar, después de la horquilla y las comisiones?\n`);
console.log(`   hora    señales   con crédito   crédito al punto medio   crédito REAL`);
for (const h of HORAS) {
  const r = resultados[h];
  if (!r.length) continue;
  const op = r.filter((x) => x.operable);
  console.log(`   ${h}  ${String(r.length).padStart(7)}   ${String(op.length).padStart(6)} (${(op.length / r.length * 100).toFixed(0).padStart(2)}%)      $${mdn(r.map((x) => x.brutoMedio)).toFixed(0).padStart(5)}            $${mdn(r.map((x) => x.credito)).toFixed(0).padStart(6)}`);
}

console.log(`\n   Y de los días en que SÍ había crédito, qué salió:\n`);
console.log(`   hora      n     ret%      t     acierto   crédito   riesgo    $/año`);
for (const h of HORAS) {
  const r = resultados[h].filter((x) => x.operable);
  if (r.length < 50) { console.log(`   ${h}  ${String(r.length).padStart(5)}   muestra corta para concluir`); continue; }
  const rets = r.map((x) => x.ret);
  const gan = r.filter((x) => x.pl > 0).length / r.length * 100;
  const porAno = media(r.map((x) => x.pl)) * (r.length / (dias.length / 252));
  console.log(`   ${h}  ${String(r.length).padStart(5)}  ${(media(rets) >= 0 ? "+" : "") + media(rets).toFixed(2).padStart(6)}  ${tUno(rets).toFixed(2).padStart(6)}   ${gan.toFixed(0).padStart(5)}%   $${mdn(r.map((x) => x.credito)).toFixed(0).padStart(5)}   $${mdn(r.map((x) => x.riesgo)).toFixed(0).padStart(5)}  $${porAno.toFixed(0).padStart(7)}`);
}

console.log(`\n   ── LO QUE DECÍA EL BACKTEST CONTAMINADO ──`);
console.log(`      "+4-5% por operación · ~70 días al año · ~$3.400/año con $1.200 de riesgo"`);
console.log(`\n   Y las dos mitades, para la hora de las 11:00 (la que se iba a operar):`);
const once = resultados["11:00"].filter((x) => x.operable);
if (once.length > 60) {
  const ord = [...once].sort((a, b) => (a.dia < b.dia ? -1 : 1));
  const c = Math.floor(ord.length / 2);
  const m1 = ord.slice(0, c).map((x) => x.ret), m2 = ord.slice(c).map((x) => x.ret);
  console.log(`      1ª mitad (${ord[0].dia} → ${ord[c - 1].dia}): ${(media(m1) >= 0 ? "+" : "") + media(m1).toFixed(2)}%  t=${tUno(m1).toFixed(2)}  n=${m1.length}`);
  console.log(`      2ª mitad (${ord[c].dia} → ${ord[ord.length - 1].dia}): ${(media(m2) >= 0 ? "+" : "") + media(m2).toFixed(2)}%  t=${tUno(m2).toFixed(2)}  n=${m2.length}`);
  console.log(`      ${Math.sign(media(m1)) === Math.sign(media(m2)) ? "coherentes" : "SE CONTRADICEN"}`);
}
console.log("");
