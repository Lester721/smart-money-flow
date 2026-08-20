// vehiculo-comprar-opcion-2.mjs — LO QUE FALTABA AL PRIMER PASE
//
// El primer pase dio "comprar calls al azar gana +20%". Eso NO es una propiedad del vehículo:
// la ventana medible (2026-04-22 → 2026-08-06) fue un mercado alcista fuerte —SPY +8,1%,
// QQQ +9,1% en 106 días, ~30% anualizado—. Las calls ganaron porque subió todo, y las puts
// perdieron por lo mismo. Con 106 días no hay un solo mercado bajista dentro.
//
// Aquí se responden las tres preguntas que deciden si el vehículo sirve:
//
//   A. NEUTRAL A LA DIRECCIÓN — comprando call Y put a la vez (misma distancia, mismo plazo),
//      ¿cuánto cuesta simplemente POSEER opcionalidad? Ése es el precio del vehículo sin apuesta
//      direccional, y es el número contra el que se mide cualquier señal.
//   B. SESGO DE RESOLUCIÓN — a 30 y 90 días sólo se resuelven las entradas TEMPRANAS, porque los
//      cierres paran el 2026-08-06. ¿De qué fechas es realmente cada cubo?
//   C. QUÉ TENDRÍA QUE ACERTAR UNA SEÑAL — con el peaje medido, ¿qué % de acierto hace falta
//      para empatar, y cabe eso dentro de lo que 86 días pueden demostrar?
//
// Precios reales: compra al ASK, liquidación por intrínseco con el cierre REAL del subyacente.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const MSDIR = "scripts/cache-theta/marketsnack";
const CUENTA = 56389;

const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const ymd = (s) => s.replace(/-/g, "");
const dias = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));

const tickersCadena = [...new Set(readdirSync(CDIR).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]))].sort();
const diasCadena = {};
for (const t of tickersCadena) {
  const ds = readdirSync(CDIR).filter((f) => f.startsWith(`${t}_d2026`)).map((f) => f.slice(-13, -5)).sort().filter((d) => d >= "20260422");
  if (ds.length) diasCadena[t] = ds;
}
const cierres = {};
for (const t of Object.keys(diasCadena)) if (existsSync(`${CIERRES}/${t}.json`)) cierres[t] = JSON.parse(readFileSync(`${CIERRES}/${t}.json`, "utf8"));
const tickers = Object.keys(diasCadena).filter((t) => cierres[t]);

const DIST = [0.05, 0.10, 0.20];
const DTE = [7, 30, 90];
const TOL_DTE = { 7: 4, 30: 10, 90: 25 };
const ULTIMO = "20260806";

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
  if (Math.abs(distReal - dist) > dist * 0.30) return null;
  const [bid, ask] = cad[mejorExp][`${mejorK}|${tipo}`];
  return { expiracion: mejorExp, K: mejorK, bid, ask, dteReal: dias(hoy, mejorExp), distReal };
}

// ── barrido: guardamos call y put EMPAREJADAS por (ticker, día, dist, dte) ──
const pares = [];
for (const t of tickers) {
  for (const dY of diasCadena[t]) {
    if (dY > ULTIMO) continue;
    const S = cierres[t][dY];
    if (!(S > 0)) continue;
    const p = `${CDIR}/${t}_d${dY}.json`;
    if (!existsSync(p)) continue;
    let cad; try { cad = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
    if (!cad || !Object.keys(cad).length) continue;

    for (const dte of DTE) for (const dist of DIST) {
      const c = elegir(cad, S, dte, dist, "C", dY);
      const q = elegir(cad, S, dte, dist, "P", dY);
      if (!c || !q) continue;
      if (c.expiracion !== q.expiracion) continue;               // mismo vencimiento o no es un par
      if (!(c.ask > 0 && c.bid > 0 && q.ask > 0 && q.bid > 0)) continue;
      const ST = cierres[t][c.expiracion];
      if (!(ST > 0)) continue;                                    // sólo pares RESUELTOS

      const pagoC = Math.max(0, ST - c.K), pagoP = Math.max(0, q.K - ST);
      const retC = pagoC / c.ask - 1, retP = pagoP / q.ask - 1;
      // Cono: se compran las dos patas. Retorno sobre el capital total desplegado.
      const capital = (c.ask + q.ask) * 100;
      const retCono = (pagoC + pagoP) * 100 / capital - 1;
      pares.push({
        ticker: t, fecha: iso(dY), exp: c.expiracion, dist, dte, S, ST,
        movReal: ST / S - 1, movAbs: Math.abs(ST / S - 1),
        askC: c.ask, askP: q.ask, retC, retP, retCono, capital,
        peajeC: (c.ask - c.bid) / c.ask, peajeP: (q.ask - q.bid) / q.ask,
        neutral: (retC + retP) / 2,
      });
    }
  }
}

radiografia(pares, ["retCono", "movAbs", "capital", "neutral"], "pares call+put resueltos", { cerosLegitimos: [] });

// ═══════════════════════════════════════════════════════════════════════════════════════
// A. NEUTRAL A LA DIRECCIÓN
// ═══════════════════════════════════════════════════════════════════════════════════════
console.log("═".repeat(97));
console.log("A. NEUTRAL A LA DIRECCIÓN — comprar CALL y PUT a la vez: el precio de poseer opcionalidad");
console.log("═".repeat(97));
console.log("  Si comprar opciones fuese un negocio neutro, esto daría ~0%. Lo que da es el peaje real.\n");
console.log("  dist  dte      n   capital/par   retorno del CONO   t        $/año (1 par rodando)");
console.log("  " + "─".repeat(93));
const tabNeutral = [];
for (const dist of DIST) for (const dte of DTE) {
  const g = pares.filter((f) => f.dist === dist && f.dte === dte);
  if (g.length < 20) continue;
  const r = g.map((f) => f.retCono), cap = media(g.map((f) => f.capital));
  const dolarAno = cap * media(r) * (365 / dte);
  tabNeutral.push({ dist, dte, n: g.length, cap, ret: media(r), t: tDe(r), dolarAno });
  console.log(`  ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)} ${String(g.length).padStart(6)}   ${("$" + cap.toFixed(0)).padStart(10)}   ${(media(r) * 100).toFixed(1).padStart(13)}%   ${tDe(r).toFixed(2).padStart(6)}   ${("$" + dolarAno.toFixed(0)).padStart(16)}`);
}
const rTodos = pares.map((f) => f.retCono);
console.log(`\n  TODO junto: n=${pares.length.toLocaleString()} pares · retorno del cono ${(media(rTodos) * 100).toFixed(1)}% · t=${tDe(rTodos).toFixed(2)}`);
console.log(`  mediana ${(pctl(rTodos, 0.5) * 100).toFixed(1)}% · p90 ${(pctl(rTodos, 0.9) * 100).toFixed(1)}% · p99 ${(pctl(rTodos, 0.99) * 100).toFixed(1)}%`);
console.log(`  pares que pierden dinero: ${(100 * rTodos.filter((x) => x < 0).length / rTodos.length).toFixed(1)}%`);

// ═══════════════════════════════════════════════════════════════════════════════════════
// B. SESGO DE RESOLUCIÓN
// ═══════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(97));
console.log("B. SESGO DE RESOLUCIÓN — de qué fechas es realmente cada cubo");
console.log("═".repeat(97));
console.log("  Los cierres paran el 2026-08-06. Una compra a 90 días sólo se resuelve si se hizo antes");
console.log("  del 2026-05-08. El cubo de 90d NO cubre la ventana: cubre sus dos primeras semanas.\n");
console.log("  dte      n   entradas desde   hasta        sesiones distintas   % de las 74 sesiones");
console.log("  " + "─".repeat(93));
for (const dte of DTE) {
  const g = pares.filter((f) => f.dte === dte);
  if (!g.length) continue;
  const fs = [...new Set(g.map((f) => f.fecha))].sort();
  console.log(`  ${String(dte).padStart(3)} ${String(g.length).padStart(6)}   ${fs[0]}       ${fs.at(-1)}   ${String(fs.length).padStart(16)}   ${((100 * fs.length) / 74).toFixed(0).padStart(18)}%`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// C. QUÉ TENDRÍA QUE ACERTAR UNA SEÑAL
// ═══════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(97));
console.log("C. QUÉ TENDRÍA QUE ACERTAR UNA SEÑAL PARA EMPATAR");
console.log("═".repeat(97));
console.log("  Una señal elige LADO. Si acierta, se queda el pago de esa pata; si falla, pierde la prima.");
console.log("  El acierto necesario sale de los pagos reales medidos, no de un modelo.\n");
console.log("  dist  dte      n   pago si acierta   pago si falla   acierto p/ empatar   base (moneda)");
console.log("  " + "─".repeat(93));
const tabAcierto = [];
for (const dist of DIST) for (const dte of DTE) {
  const g = pares.filter((f) => f.dist === dist && f.dte === dte);
  if (g.length < 20) continue;
  // "acertar" = elegir la pata que acabó con valor. Pago medio de la pata ganadora vs la perdedora.
  const gana = [], falla = [];
  for (const f of g) {
    const [alto, bajo] = f.retC >= f.retP ? [f.retC, f.retP] : [f.retP, f.retC];
    gana.push(alto); falla.push(bajo);
  }
  const mg = media(gana), mf = media(falla);
  // p·mg + (1−p)·mf = 0  →  p = −mf / (mg − mf)
  const p = -mf / (mg - mf);
  tabAcierto.push({ dist, dte, n: g.length, mg, mf, p });
  console.log(`  ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)} ${String(g.length).padStart(6)}   ${(mg * 100).toFixed(0).padStart(13)}%   ${(mf * 100).toFixed(0).padStart(12)}%   ${(p * 100).toFixed(1).padStart(17)}%   ${"50%".padStart(13)}`);
}
console.log("\n  'acierto p/ empatar' es con PERFECTA elección del lado ganador — el techo absoluto de");
console.log("  cualquier señal. Una moneda acierta el 50%. La diferencia es lo que hay que ganarle al azar.");

// ── Traducción a dólares con el mejor caso plausible ──
console.log("\n" + "═".repeat(97));
console.log("EN DÓLARES AL AÑO — cuenta de $" + CUENTA.toLocaleString());
console.log("═".repeat(97));
const filasDol = [];
for (const a of tabAcierto) {
  const g = pares.filter((f) => f.dist === a.dist && f.dte === a.dte);
  const primaMedia = media(g.map((f) => (f.askC + f.askP) / 2)) * 100;
  for (const acierto of [0.50, 0.55, 0.60]) {
    const retOp = acierto * a.mg + (1 - acierto) * a.mf;
    filasDol.push({ dist: a.dist, dte: a.dte, acierto, prima: primaMedia, retOp, dolarAno: primaMedia * retOp * (365 / a.dte) });
  }
}
console.log("  dist  dte   capital/contrato   acierto 50%      55%           60%");
console.log("  " + "─".repeat(93));
for (const dist of DIST) for (const dte of DTE) {
  const fs = filasDol.filter((f) => f.dist === dist && f.dte === dte);
  if (fs.length !== 3) continue;
  console.log(`  ${(dist * 100).toFixed(0).padStart(3)}%  ${String(dte).padStart(3)}   ${("$" + fs[0].prima.toFixed(0)).padStart(14)}   ` +
    fs.map((f) => ("$" + f.dolarAno.toFixed(0)).padStart(11)).join("   "));
}
const mejor = filasDol.filter((f) => f.acierto === 0.55).sort((a, b) => b.dolarAno - a.dolarAno)[0];
console.log(`\n  Con un acierto del 55% —que es MÁS de lo que ninguna métrica de MS ha demostrado nunca en`);
console.log(`  este proyecto— el mejor cubo da $${mejor.dolarAno.toFixed(0)}/año por contrato de $${mejor.prima.toFixed(0)} (${(mejor.dist * 100).toFixed(0)}%, ${mejor.dte}d).`);
const nContratos = Math.floor(CUENTA * 0.10 / mejor.prima);
console.log(`  Comprometiendo el 10% de la cuenta ($${(CUENTA * 0.1).toFixed(0)}) = ${nContratos} contratos → $${(mejor.dolarAno * nContratos).toFixed(0)}/año.`);
console.log(`  Comparación: SPY al 14%/año sobre esos mismos $${(CUENTA * 0.1).toFixed(0)} da $${(CUENTA * 0.1 * 0.14).toFixed(0)}/año sin acertar nada.`);

writeFileSync("scripts/vehiculo-comprar-opcion-2.json", JSON.stringify({
  nPares: pares.length, neutral: tabNeutral, acierto: tabAcierto, dolares: filasDol,
  retConoGlobal: media(rTodos), tConoGlobal: tDe(rTodos),
  mercado: { spy: 0.081, qqq: 0.091, dias: 106 },
}, null, 1));
console.log("\n  → scripts/vehiculo-comprar-opcion-2.json");
