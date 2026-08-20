// URGENCIA — motor compartido: LA REJILLA del vehículo y LOS EVENTOS del flujo.
//
// Vehículo fijo (la esquina barata ya medida): 5% FUERA DEL DINERO · ~90 DÍAS · salida corta.
// Se COMPRA al ASK real de la cadena de cierre del día del print y se VENDE al BID real del día
// de salida. Punto medio sólo se calcula aparte, y sólo para responder "¿es precio u horquilla?".
//
// Nada posterior al instante de decidir entra: el print tiene que ser anterior a las 15:00 ET y
// la compra es al cierre de ESE MISMO día.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import { cadena, cierres, diasDe, tickersConCadena, elegirEsquina, limpiarCache, dias } from "./print-lib.mjs";
import { conditionOf } from "../lib/conditions.ts";

export const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25;
export const SALIDAS = [3, 5, 10];
export const CUENTA = 56389;

// ── clases de operación por código OPRA real ───────────────────────────────────────────────
const UNA_PATA = new Set(["AUTO", "REOP", "ISOI", "SLAN", "SLAI", "SLCN", "SLCI", "SLFT"]);
const MULTI    = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MESL", "MASL", "MFSL"]);
const BASURA   = new Set(["CANC", "OSEQ", "CNCL", "LATE", "CNCO", "OPEN", "CNOL", "OPNL", "MCTP", "EXHT"]);
export function claseOp(id) {
  const c = conditionOf(id);
  if (!c) return "SIN_CODIGO";
  if (BASURA.has(c.code)) return "BASURA";
  if (MULTI.has(c.code)) return "MULTI";
  if (UNA_PATA.has(c.code)) return "UNA_PATA";
  return "OTRO";
}

// ── la escalera de urgencia, verificada en el censo ────────────────────────────────────────
//   MIDMKT 0,50 · ASKSIDE 0,58 · AT_ASK 1,00 · ABOVE_ASK 1,52   (y su espejo por debajo)
export const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
export const VENTA  = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
export const ESCALON = { MIDMKT: 0, ASKSIDE: 1, AT_ASK: 2, ABOVE_ASK: 3, BIDSIDE: 1, AT_BID: 2, BELOW_BID: 3 };

const CACHE_REJ = "scripts/cache-theta/marketsnack/urg2-rejilla.json";

/**
 * REJILLA: por (ticker, día) la call y la put de la esquina barata con sus precios reales, y el
 * resultado a cada horizonte de salida. Se cachea en disco porque cuesta minutos.
 */
export function rejilla(forzar = false) {
  if (!forzar && existsSync(CACHE_REJ)) return JSON.parse(readFileSync(CACHE_REJ, "utf8"));
  const conCad = tickersConCadena().filter((t) => cierres(t));
  const out = {};
  let n = 0;
  for (const tk of conCad) {
    limpiarCache();
    const md = diasDe(tk).filter((d) => d >= "20260401");
    const cl = cierres(tk);
    const ULT = md[md.length - 1];
    for (const dY of md) {
      const S = cl[dY];
      if (!(S > 0)) continue;
      const cad = cadena(tk, dY);
      if (!cad) continue;
      const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
      const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
      if (!c || !p) continue;
      const fila = { S, C: { exp: c.exp, K: c.K, bid: c.bid, ask: c.ask, dte: c.dte, d: c.distReal },
                     P: { exp: p.exp, K: p.K, bid: p.bid, ask: p.ask, dte: p.dte, d: p.distReal }, sal: {} };
      for (const h of SALIDAS) {
        const sd = md.find((d) => d > dY && dias(dY, d) >= h);
        if (!sd || sd > c.exp || sd > p.exp || sd > ULT) continue;
        const cs = cadena(tk, sd);
        if (!cs) continue;
        const qC = cs[c.exp]?.[`${c.K}|C`], qP = cs[p.exp]?.[`${p.K}|P`];
        const cerrado = cierres(tk)[sd];
        fila.sal[h] = {
          d: sd, diasReales: dias(dY, sd),
          // REAL: compro al ask, vendo al bid
          rC: (qC ? qC[0] : 0) / c.ask - 1,
          rP: (qP ? qP[0] : 0) / p.ask - 1,
          // MEDIO a MEDIO: sólo para separar "precio" de "horquilla". NO es un P&L.
          mC: (qC ? (qC[0] + qC[1]) / 2 : 0) / ((c.ask + c.bid) / 2) - 1,
          mP: (qP ? (qP[0] + qP[1]) / 2 : 0) / ((p.ask + p.bid) / 2) - 1,
          rS: cerrado > 0 ? cerrado / S - 1 : null,
          cotC: !!qC, cotP: !!qP,
        };
      }
      if (Object.keys(fila.sal).length) { out[`${tk}|${dY}`] = fila; n++; }
    }
  }
  writeFileSync(CACHE_REJ, JSON.stringify(out));
  console.error(`  rejilla: ${n} (ticker,día) con esquina barata completa → ${CACHE_REJ}`);
  return out;
}

const CACHE_EV = "scripts/cache-theta/marketsnack/urg2-eventos.json";

/**
 * EVENTOS: un print = una fila. Se guardan TODOS los que caen en horario y en un ticker con
 * cadena; el filtrado por lado / prima / clase se hace después, para no rebobinar 2 M de filas
 * cada vez que cambia un umbral.
 */
export function eventos(forzar = false) {
  if (!forzar && existsSync(CACHE_EV)) return JSON.parse(readFileSync(CACHE_EV, "utf8"));
  const conCad = new Set(tickersConCadena().filter((t) => cierres(t)));
  const out = [];
  for (const dia of diasFlujo("100k")) {
    const dY = dia.replace(/-/g, "");
    for (const o of leerDia(dia, "100k")) {
      const q = parseOCC(o.symbol);
      if (!q || !conCad.has(q.raiz)) continue;
      const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
      if (!(et >= 9.5 && et < 15)) continue;          // decidir antes del cierre, comprar al cierre
      const s = o.side;
      if (!COMPRA.has(s) && !VENTA.has(s) && s !== "MIDMKT") continue;
      const h = o.ask_price - o.bid_price;
      const pos = h > 0 ? (o.price - o.bid_price) / h : null;
      out.push({
        dY, tk: q.raiz, tipo: q.tipo, exp: q.exp, K: q.strike,
        prem: o.premium, size: o.size, oi: o.open_interest, vol: o.volume,
        side: s, esc: ESCALON[s] ?? 0, pos, et,
        cls: claseOp(o.trade_condition_id),
        // dirección declarada: comprar call / vender put = alcista
        dir: (COMPRA.has(s) ? 1 : VENTA.has(s) ? -1 : 0) * (q.tipo === "C" ? 1 : -1),
        dteP: dias(dY, q.exp),
      });
    }
  }
  writeFileSync(CACHE_EV, JSON.stringify(out));
  console.error(`  eventos: ${out.length} prints en ticker con cadena y en horario → ${CACHE_EV}`);
  return out;
}
