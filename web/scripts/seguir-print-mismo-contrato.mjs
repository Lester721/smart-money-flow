// SEGUIR EL PRINT — comprar EL MISMO CONTRATO que golpearon.
//
// ═══ LA REGLA QUE SE MIDE ═══════════════════════════════════════════════════════════════════
//   1. aparece un print de prima ≥ P, iniciado por el COMPRADOR (al ask) y de UNA SOLA PATA
//      (código OPRA real; las patas de spread son el 56% de la cinta y NO expresan dirección)
//   2. el print es de ANTES de las 15:00 ET → queda una hora para reaccionar
//   3. al CIERRE de ese día se compra EL MISMO CONTRATO (mismo vencimiento, mismo strike, mismo
//      tipo) al ASK REAL de la cadena de cierre
//   4. se vende al BID REAL de la cadena a 1, 3, 5 y 10 días
//
// ═══ EL CONTROL ═════════════════════════════════════════════════════════════════════════════
//   500 sorteos por evento, mismo ticker · mismo día · MISMO VENCIMIENTO:
//     · azarTotal — strike y tipo sorteados            → ¿elige el print algo, lo que sea?
//     · azarTipo  — strike sorteado, tipo el del print → ¿elige el STRIKE?
//     · horq5     — mismo tipo y HORQUILLA parecida (5 vecinos) → mata la trampa de liquidez que
//                   ya se comió dos hallazgos de este proyecto
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-mismo-contrato.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, limpiarCache,
  dias, media, tUna, fmt, rng,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const PRIMAS = [250e3, 500e3, 1e6, 2.5e6, 5e6, 10e6];
const SALIDAS = [1, 3, 5, 10];
const SORTEOS = 500;
const TOL_SAL = 4;                      // margen de días para encontrar cadena de salida
const PRUEBAS = PRIMAS.length * SALIDAS.length;
const LISTON = listonT(PRUEBAS);

// Códigos OPRA que son SIN DUDA de una sola pata. Todo lo demás fuera: multi-pata (MLET/MLAT/
// MLCT/MLFT/CBMO/MCTP), "contra una pata" (MESL/MASL/MFSL/TESL/TASL/TFSL — MarketSnack los
// clasifica MAL como single leg), acciones+opción (TLET/TLCT/TLFT/TLAT), canceladas y tardías.
const UNA_PATA = new Set([209, 210, 219, 227, 228, 229, 230, 231]);
const ASK = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
// CONTROL DECISIVO: los mismos prints gigantes pero ejecutados AL BID (vendedor con prisa).
// Si comprar detras del comprador y detras del vendedor da lo mismo, no se esta midiendo
// agresividad compradora: se esta midiendo liquidez.
const BID = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);
const HORA_TOPE = 19;                   // < 19:00 UTC = < 15:00 ET (EDT todo el período)
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const setCad = new Set(conCad);
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260420")]));
const guion = (d) => d.replace(/(\d{4})(\d\d)(\d\d)/, "$1-$2-$3");

console.log("\n" + "=".repeat(104));
console.log("SEGUIR EL PRINT — comprar EL MISMO CONTRATO, al ask real, salir al bid real");
console.log("=".repeat(104));
console.log(`  ${conCad.length} tickers con cadena Y cierres · ${PRUEBAS} pruebas -> liston |t| >= ${LISTON}`);
console.log(`  una sola pata (codigos ${[...UNA_PATA].join(",")}) · al ask · antes de las 15:00 ET\n`);

// ── 1. LOS EVENTOS ──────────────────────────────────────────────────────────────────────────
console.log("## 1. Leyendo la cinta y quedandome con los prints que disparan la regla");
const ev = new Map();     // ticker|D|exp|tipo|K -> {primaMax, nPrints, hora}
let leidos = 0, pasan = 0;
const descarte = { fuera: 0, multipata: 0, noAsk: 0, tarde: 0, chica: 0, occ: 0, expirada: 0 };
for (const dia of diasFlujo("100k")) {
  const D = dia.replace(/-/g, "");
  for (const o of leerDia(dia, "100k")) {
    leidos++;
    if (!(o.premium >= PRIMAS[0])) { descarte.chica++; continue; }
    if (!UNA_PATA.has(o.trade_condition_id)) { descarte.multipata++; continue; }
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) { descarte.noAsk++; continue; }
    if (Number(o.timestamp.slice(11, 13)) >= HORA_TOPE) { descarte.tarde++; continue; }
    const q = parseOCC(o.symbol);
    if (!q) { descarte.occ++; continue; }
    if (!setCad.has(q.raiz)) { descarte.fuera++; continue; }
    if (dias(D, q.exp) < 2) { descarte.expirada++; continue; }
    pasan++;
    const k = `${lado}|${q.raiz}|${D}|${q.exp}|${q.tipo}|${q.strike}`;
    const p = ev.get(k);
    if (!p) ev.set(k, { lado, primaMax: o.premium, primaTot: o.premium, nPrints: 1, hora: o.timestamp.slice(11, 16) });
    else { p.nPrints++; p.primaTot += o.premium; if (o.premium > p.primaMax) p.primaMax = o.premium; }
  }
}
console.log(`   prints leidos ${fmt(leidos)} · pasan el filtro ${fmt(pasan)} · contratos-dia distintos ${fmt(ev.size)}`);
console.log(`   descartes: prima<250k ${fmt(descarte.chica)} · no una pata ${fmt(descarte.multipata)} · no al ask ${fmt(descarte.noAsk)}`
  + ` · >=15:00 ${fmt(descarte.tarde)} · sin cadena ${fmt(descarte.fuera)} · vence ya ${fmt(descarte.expirada)}\n`);

// ── 2. PRECIOS REALES: entrada al ask, salida al bid, y los sorteos ─────────────────────────
console.log("## 2. Precios reales de cadena — entrada al ASK, salida al BID");
const porTicker = new Map();
for (const [k, v] of ev) {
  const [, t, D, exp, tipo, Ks] = k.split("|");
  if (!porTicker.has(t)) porTicker.set(t, []);
  porTicker.get(t).push({ ticker: t, fechaY: D, exp, tipo, K: Number(Ks), ...v });
}

const diaSalida = (t, D, k) => {
  for (const d of diasPorTk.get(t)) { const x = dias(D, d); if (x >= k && x <= k + TOL_SAL) return d; }
  return null;
};

const _cand = new Map();
/** Todos los contratos de ESA expiracion con cotizacion de entrada Y de salida. */
function candidatos(t, D, exp, dSal) {
  const key = `${t}|${D}|${exp}|${dSal}`;
  if (_cand.has(key)) return _cand.get(key);
  const cE = cadena(t, D), cS = cadena(t, dSal);
  let out = null;
  if (cE && cE[exp]) {
    const salida = cS && cS[exp] ? cS[exp] : null;
    out = [];
    for (const clave of Object.keys(cE[exp])) {
      const [ks, tp] = clave.split("|");
      const [bid, ask] = cE[exp][clave];
      if (!(ask > 0) || !(bid > 0)) continue;
      const v = salida ? salida[clave] : null;
      const bidS = v ? v[0] : 0;          // no esta en la cadena de salida => sin puja => 0
      out.push({ K: Number(ks), tipo: tp, ask, horq: (ask - bid) / ask, ret: (bidS - ask) / ask });
    }
  }
  if (_cand.size > 300) _cand.clear();
  _cand.set(key, out);
  return out;
}

const filas = [];
let sinEntrada = 0, sinSalida = 0, sinCad = 0;
let semilla = 12345;
for (const t of [...porTicker.keys()].sort()) {
  const lista = porTicker.get(t).sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  for (const e of lista) {
    const cE = cadena(t, e.fechaY);
    if (!cE) { sinCad++; continue; }
    const clave = `${e.K}|${e.tipo}`;
    const q = cE[e.exp] ? cE[e.exp][clave] : null;
    if (!q || !(q[1] > 0) || !(q[0] > 0)) { sinEntrada++; continue; }
    const [bidE, askE] = q;
    const S = (cierres(t) || {})[e.fechaY] ?? null;   // las claves de cierres son AAAAMMDD
    const fila = {
      ticker: t, fecha: guion(e.fechaY), fechaY: e.fechaY, lado: e.lado,
      exp: e.exp, tipo: e.tipo, K: e.K, prima: e.primaMax, primaTot: e.primaTot,
      nPrints: e.nPrints, horaN: Number(e.hora.slice(0, 2)) + Number(e.hora.slice(3)) / 60 - 4,
      ask: askE, horq: (askE - bidE) / askE, dte: dias(e.fechaY, e.exp),
      dist: S ? (e.tipo === "C" ? e.K / S - 1 : 1 - e.K / S) : null,
      indice: INDICES.has(t) ? 1 : 0,
    };
    let algo = false;
    for (const k of SALIDAS) {
      const dSal = diaSalida(t, e.fechaY, k);
      if (!dSal) continue;
      if (dias(e.fechaY, e.exp) <= dias(e.fechaY, dSal)) continue;   // vence antes de salir
      const cS = cadena(t, dSal);
      if (!cS) continue;
      const vs = cS[e.exp] ? cS[e.exp][clave] : null;
      const bidS = vs ? vs[0] : 0;
      fila[`r${k}`] = (bidS - askE) / askE;
      // DIAGNOSTICO (no es dinero): medio a medio, para separar el PEAJE del movimiento de precio.
      const midE = (bidE + askE) / 2, midS = vs ? (vs[0] + vs[1]) / 2 : 0;
      fila[`m${k}`] = (midS - midE) / midE;
      fila[`vivo${k}`] = vs ? 1 : 0;
      fila[`sal${k}`] = dSal;
      algo = true;
      const cands = candidatos(t, e.fechaY, e.exp, dSal);
      if (cands && cands.length >= 6) {
        const mismoTipo = cands.filter((c) => c.tipo === e.tipo);
        const vecinos = mismoTipo.filter((c) => c.K !== e.K)
          .sort((a, b) => Math.abs(a.horq - fila.horq) - Math.abs(b.horq - fila.horq)).slice(0, 5);
        const r = rng(semilla++);
        const sortear = (arr) => {
          if (!arr.length) return null;
          let s = 0;
          for (let i = 0; i < SORTEOS; i++) s += arr[Math.floor(r() * arr.length)].ret;
          return s / SORTEOS;
        };
        fila[`a${k}`] = sortear(cands);
        fila[`b${k}`] = sortear(mismoTipo.length >= 3 ? mismoTipo : []);
        fila[`h${k}`] = sortear(vecinos);
        if (k === 5) {
          fila.horqVec = vecinos.length ? media(vecinos.map((c) => c.horq)) : null;
          fila.horqAzar = media(cands.map((c) => c.horq));
          fila.nCand = cands.length;
        }
      }
    }
    if (algo) filas.push(fila); else sinSalida++;
  }
  limpiarCache(); _cand.clear();
}
console.log(`   filas medibles ${fmt(filas.length)} · sin cotizacion de entrada ${fmt(sinEntrada)}`
  + ` · sin ninguna salida ${fmt(sinSalida)} · sin cadena ${fmt(sinCad)}\n`);

console.log(`   arm ASK ${fmt(filas.filter((f) => f.lado === 1).length)} · arm BID (control) ${fmt(filas.filter((f) => f.lado === -1).length)}\n`);
radiografia(filas, ["prima", "primaTot", "nPrints", "ask", "horq", "dte", "dist", "horaN", "r5", "a5", "h5"],
  "eventos del print", { minDistintos: 4 });

writeFileSync("scripts/seguir-print-filas.json", JSON.stringify(filas));
console.log(`   -> scripts/seguir-print-filas.json (${fmt(filas.length)} filas)\n`);
