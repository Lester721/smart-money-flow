// LA REPETICION · 6 — EL PUENTE y la POTENCIA. Qué haría falta para que esto valiera dinero.
//
// Lo medido: la repetición no aporta nada sobre el tamaño. Pero un "no" sin potencia no es un
// resultado, es una prueba mal dimensionada. Aquí se dice CUANTO se podía haber visto.
//
// Y se prueba el único puente que queda en pie: el flujo elige un contrato que le gana a sus
// gemelos por +0,21%/op — poco, pero medido con precios reales y ya con el peaje dentro. Ese
// +0,21% está enterrado bajo un rincón que pierde −3,07%. La forma de cobrarlo SIN el rincón es
// un VERTICAL: comprar el contrato golpeado y vender su vecino de al lado (mismo vencimiento,
// mismo tipo). Robinhood los ejecuta de un botón. Aquí se mide si el peaje de CUATRO patas se
// come la ventaja o no.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/rep-6-puente.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, nEfectiva,
} from "./print-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const SALIDA = 5, VENTANA = 5, MIN_DIA = 5e5;
const LISTON = listonT(120);
const TOL_DTE_GEM = 15, TOL_MNY = 0.02, TOL_HORQ = 0.25;

const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const MULTI = new Set([232, 233, 234, 235, 236, 238, 239, 246, 247]);
const BASURA = new Set([201, 202, 203, 204, 205, 206, 207, 208, 248]);
const ACCOPC = new Set([237, 240, 241, 242, 243, 244, 245]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const setCad = new Set(conCad);
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop();
const tPorDia = (f, c) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(x[c]); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, m: media(d) };
};

console.log(`\n${"#".repeat(104)}`);
console.log(`LA REPETICION · 6 — POTENCIA y PUENTE`);
console.log(`${"#".repeat(104)}\n`);

// ── serie y eventos (idéntico a los pases anteriores) ───────────────────────────────────────
const serie = new Map(), meta = new Map();
const diasF = diasFlujo("100k");
for (const dia of diasF) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const dY = dia.replace(/-/g, "");
  const g = new Map();
  for (const o of crudos) {
    const cid = o.trade_condition_id;
    if (BASURA.has(cid) || ACCOPC.has(cid) || MULTI.has(cid)) continue;
    const q = parseOCC(o.symbol);
    if (!q || !setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    let a = g.get(o.symbol);
    if (!a) { a = { ask: 0, bid: 0 }; g.set(o.symbol, a); }
    if (lado === 1) a.ask += o.premium; else a.bid += o.premium;
    if (!meta.has(o.symbol)) meta.set(o.symbol, { tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike });
  }
  for (const [sym, a] of g) {
    if (a.ask + a.bid < 2.5e5) continue;
    if (!serie.has(sym)) serie.set(sym, new Map());
    serie.get(sym).set(dY, a);
  }
}
const calF = diasF.map((d) => d.replace(/-/g, ""));
const idxCal = new Map(calF.map((d, i) => [d, i]));
const eventos = [];
for (const [sym, m] of serie) {
  const mm = meta.get(sym);
  for (const [d, hoy] of m) {
    if (hoy.ask < MIN_DIA) continue;
    const i = idxCal.get(d);
    if (i == null) continue;
    const desde = calF[Math.max(0, i - VENTANA + 1)];
    let tot = 0, diasAct = 0;
    for (const [dd, a] of m) {
      if (dd < desde || dd > d) continue;
      tot += a.ask;
      if (a.ask >= MIN_DIA) diasAct++;
    }
    if (tot < 1e6) continue;
    eventos.push({ sym, tk: mm.tk, exp: mm.exp, tipo: mm.tipo, K: mm.K, dY: d, tot, diasAct });
  }
}

// ── medir: contrato, gemelos, y el VERTICAL contra el vecino ────────────────────────────────
const porTk = new Map();
for (const e of eventos) { if (!porTk.has(e.tk)) porTk.set(e.tk, []); porTk.get(e.tk).push(e); }
const filas = [];
for (const [tk, lista] of porTk) {
  limpiarCache();
  const md = diasPorTk.get(tk), cl = cierres(tk);
  const porDia = new Map();
  for (const e of lista) { if (!porDia.has(e.dY)) porDia.set(e.dY, []); porDia.get(e.dY).push(e); }
  for (const [dY, es] of porDia) {
    if (dY > ULTIMO) continue;
    const S = cl?.[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const dSal = md.find((d) => d > dY && dias(dY, d) >= SALIDA);
    if (!dSal) continue;
    const cadSal = cadena(tk, dSal);
    if (!cadSal) continue;
    const univ = [];
    for (const exp of Object.keys(cad)) {
      const dte = dias(dY, exp);
      if (dte < 1 || exp <= dSal) continue;
      for (const clave of Object.keys(cad[exp])) {
        const [ks, tipo] = clave.split("|");
        const K = Number(ks);
        const [bid, aa] = cad[exp][clave];
        if (!(aa > 0) || !(bid > 0)) continue;
        const q = cadSal[exp]?.[clave];
        univ.push({
          exp, K, tipo, dte, mny: tipo === "C" ? K / S - 1 : 1 - K / S,
          ask: aa, bid, horq: (aa - bid) / aa,
          sBid: q ? q[0] : 0, sAsk: q ? q[1] : 0,           // cotización REAL del día de salida
          ret: (q ? q[0] : 0) / aa - 1,
        });
      }
    }
    if (!univ.length) continue;
    const idx = new Map(univ.map((u) => [`${u.exp}|${u.K}|${u.tipo}`, u]));
    for (const e of es) {
      const yo = idx.get(`${e.exp}|${e.K}|${e.tipo}`);
      if (!yo) continue;
      const gem = univ.filter((u) => u !== yo && u.tipo === yo.tipo
        && Math.abs(u.dte - yo.dte) <= TOL_DTE_GEM
        && Math.abs(u.mny - yo.mny) <= TOL_MNY
        && Math.abs(u.horq - yo.horq) <= TOL_HORQ * yo.horq);
      if (gem.length < 3) continue;

      // EL VERTICAL: la pata corta es el gemelo del MISMO vencimiento y mismo tipo más cercano
      // en strike. Sin eso no es una vertical de Robinhood, es un calendario.
      const mismos = gem.filter((u) => u.exp === yo.exp);
      let vert = null;
      if (mismos.length) {
        let corto = mismos[0];
        for (const u of mismos) if (Math.abs(u.K - yo.K) < Math.abs(corto.K - yo.K)) corto = u;
        const debe = yo.ask - corto.bid;                    // compro al ask, vendo al bid
        const cobro = yo.sBid - corto.sAsk;                 // vendo al bid, recompro al ask
        if (debe > 0.01) vert = { ret: cobro / debe - 1, debe: debe * 100, anchura: Math.abs(corto.K - yo.K) };
      }
      filas.push({
        ticker: tk, fechaY: dY, fecha: `${dY.slice(0, 4)}-${dY.slice(4, 6)}-${dY.slice(6, 8)}`,
        tipo: e.tipo, diasAct: e.diasAct, tot: e.tot, mny: yo.mny, dte: yo.dte,
        prima: yo.ask * 100, ret: yo.ret, gemR: media(gem.map((g) => g.ret)),
        exceso: yo.ret - media(gem.map((g) => g.ret)),
        vertRet: vert ? vert.ret : null, vertDebe: vert ? vert.debe : null, vertAncho: vert ? vert.anchura : null,
        diasPos: dias(dY, dSal),
      });
    }
  }
}
console.log(`  ${fmt(filas.length)} eventos medidos · con vertical construible: ${fmt(filas.filter((f) => f.vertRet != null).length)}\n`);

// ── 1. POTENCIA ─────────────────────────────────────────────────────────────────────────────
console.log(`${"=".repeat(104)}`);
console.log(`1. POTENCIA — ¿podía esta prueba haber visto que repetir aporta?`);
console.log(`${"=".repeat(104)}\n`);
const pot = [];
for (const [lo, hi, et] of [[-9, 0.05, "cerca (<5% fuera)"], [0.05, 9, "lejos (>=5% fuera)"], [-9, 9, "todos"]]) {
  const u = filas.filter((f) => f.diasAct === 1 && f.tot >= 1e6 && f.mny >= lo && f.mny < hi);
  const r = filas.filter((f) => f.diasAct >= 2 && f.tot >= 1e6 && f.mny >= lo && f.mny < hi);
  if (u.length < 40 || r.length < 40) continue;
  const s = Math.sqrt((sd(u.map((x) => x.exceso)) ** 2 + sd(r.map((x) => x.exceso)) ** 2) / 2);
  const nArm = 2 / (1 / u.length + 1 / r.length);
  const det = 2.8 * s * Math.sqrt(2 / nArm);
  const dif = media(r.map((x) => x.exceso)) - media(u.map((x) => x.exceso));
  console.log(`  ${et.padEnd(22)} un día n=${String(u.length).padStart(4)} · varios n=${String(r.length).padStart(4)}`);
  console.log(`     diferencia observada  ${(100 * dif).toFixed(2).padStart(6)} puntos`);
  console.log(`     mínima DETECTABLE     ${(100 * det).toFixed(2).padStart(6)} puntos (potencia 80%)`);
  console.log(`     ${Math.abs(dif) < det ? `-> una ventaja de la repetición MENOR de ${(100 * det).toFixed(2)} puntos no se vería. El "no aporta" vale hasta ahí, no más.` : "-> la diferencia observada es mayor que el mínimo detectable."}`);
  // cuántos eventos harían falta para ver una ventaja que MERECIERA la pena (1 punto/op)
  const nNec = Math.ceil(2 * (2.8 * s / 0.01) ** 2);
  console.log(`     para cerrar una ventaja de 1,00 punto/op harían falta ~${fmt(nNec)} eventos por grupo`);
  console.log(`        hoy hay ${r.length} de repetición en 86 días -> ${fmt(Math.ceil(86 * nNec / Math.max(1, r.length)))} días de flujo en total (${(86 * nNec / Math.max(1, r.length) / 252).toFixed(1)} años)\n`);
  pot.push({ et, nUno: u.length, nVarios: r.length, dif, detectable: det, nNecesario: nNec, diasNecesarios: Math.ceil(86 * nNec / Math.max(1, r.length)) });
}

// ── 2. EL PUENTE: el vertical ───────────────────────────────────────────────────────────────
console.log(`${"=".repeat(104)}`);
console.log(`2. EL PUENTE — cobrar la ventaja como VERTICAL en vez de como opción suelta`);
console.log(`${"=".repeat(104)}\n`);
const conV = filas.filter((f) => f.vertRet != null && Number.isFinite(f.vertRet));
console.log(`  ${"corte".padEnd(26)} ${"n".padStart(5)} ${"suelta".padStart(9)} ${"su gemelo".padStart(10)} ${"ventaja".padStart(9)}  ${"VERTICAL".padStart(9)} ${"t vert".padStart(7)} ${"débito".padStart(8)}`);
const puente = [];
for (const [f, et] of [
  [conV, "todo el flujo al ask"],
  [conV.filter((x) => x.mny >= 0.05), "lejos (>=5% fuera)"],
  [conV.filter((x) => x.diasAct >= 2), "acumulado en varios días"],
  [conV.filter((x) => x.diasAct >= 2 && x.mny >= 0.05), "acumulado Y lejos"],
  [conV.filter((x) => x.tot >= 2.5e6), ">=$2,5M"],
]) {
  if (f.length < 40) continue;
  const mS = media(f.map((x) => x.ret)), mG = media(f.map((x) => x.gemR)), mE = media(f.map((x) => x.exceso));
  const mV = media(f.map((x) => x.vertRet)), tV = tPorDia(f, "vertRet").t;
  console.log(`  ${et.padEnd(26)} ${String(f.length).padStart(5)} ${(100 * mS).toFixed(2).padStart(8)}% ${(100 * mG).toFixed(2).padStart(9)}% ${(100 * mE).toFixed(2).padStart(8)}%  ${(100 * mV).toFixed(2).padStart(8)}% ${tV.toFixed(2).padStart(7)} ${("$" + fmt(media(f.map((x) => x.vertDebe)))).padStart(8)}`);
  puente.push({ et, n: f.length, suelta: mS, gemelo: mG, ventaja: mE, vertical: mV, tVert: tV, debito: media(f.map((x) => x.vertDebe)) });
}
console.log(`\n  LEER ASI: "ventaja" es lo que el flujo elige de más sobre un gemelo, ya con el peaje de dos`);
console.log(`  patas dentro. "VERTICAL" es lo que queda cuando se paga el peaje de CUATRO patas para`);
console.log(`  aislarla. Si el vertical sale peor que la ventaja, el peaje se la ha comido.\n`);

// ── 3. DINERO ───────────────────────────────────────────────────────────────────────────────
console.log(`${"=".repeat(104)}`);
console.log(`3. EN DOLARES AL AÑO sobre $${fmt(CUENTA)}`);
console.log(`${"=".repeat(104)}\n`);
const dinero = [];
for (const [f, et, campo, campoPrima] of [
  [conV.filter((x) => x.mny >= 0.05), "opción suelta, lejos", "ret", "prima"],
  [conV.filter((x) => x.mny >= 0.05), "vertical, lejos", "vertRet", "vertDebe"],
  [conV.filter((x) => x.diasAct >= 2 && x.mny >= 0.05), "vertical, acumulado y lejos", "vertRet", "vertDebe"],
]) {
  if (f.length < 40) continue;
  const prima = media(f.map((x) => x[campoPrima]));
  const m = media(f.map((x) => x[campo]));
  const diasPos = media(f.map((x) => x.diasPos));
  const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / prima));
  const anual = nCtr * prima * m * (365 / diasPos);
  const ac = (100 * f.filter((x) => x[campo] > 0).length) / f.length;
  console.log(`  ${et.padEnd(30)} ${String(f.length).padStart(4)} ops · $${fmt(prima).padStart(6)}/op · ${String(nCtr).padStart(2)} ctr = $${fmt(nCtr * prima).padStart(6)} · ${(100 * m).toFixed(2).padStart(7)}%/op · acierto ${ac.toFixed(1)}% · ${("$" + fmt(anual)).padStart(9)}/año`);
  dinero.push({ et, n: f.length, prima, nCtr, comprometido: nCtr * prima, media: m, anual, acierto: ac, opsAno: f.length / 86 * 252 });
}
console.log(`\n  Referencia obligada: comprar SPY con el mismo capital, ~14%/año.`);

writeFileSync("scripts/rep-6-puente.json", JSON.stringify({ LISTON, pot, puente, dinero }, null, 1));
console.log(`\n  -> scripts/rep-6-puente.json\n`);
