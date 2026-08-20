// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPERAR · OPCIONES — motor compartido (el mismo que corrió opc-2-medir.mjs).
// Se extrae a una librería para que el CONTROL use exactamente el mismo código que la medición:
// si el control usara otro camino, la comparación no valdría nada.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";

export const CUENTA = 56389, EFECTIVO = 7977;

export function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
export function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }
export const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
export const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
export const tOf = (v) => (v.length > 1 && sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
export const pctl = (v, p) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))] : NaN; };
export const med = (v) => pctl(v, 50);
export const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
export const f0 = (x) => (Number.isFinite(x) ? Math.round(x).toLocaleString("es-ES") : "—");
export function rng(s0) { let a = s0 >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function rachas(s) { let peor = 0, act = 0, caida = 0, acum = 0, pico = 0; for (const x of s) { if (x < 0) { act++; peor = Math.max(peor, act); } else act = 0; acum += x; pico = Math.max(pico, acum); caida = Math.min(caida, acum - pico); } return { peor, caida }; }

export function cargar() {
  const NIV = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
  const nivPorFecha = new Map(NIV.filas.map((f) => [f.fecha, f]));
  const CACHE = readFileSync("scripts/opc-cache.ndjson", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  return { NIV, nivPorFecha, CACHE };
}

const idxTs = (d, hh) => d.ts.indexOf(hh);
const iK = (d, obj) => { let b = -1, mejor = Infinity; for (let i = 0; i < d.K.length; i++) { const x = Math.abs(d.K[i] - obj); if (x < mejor) { mejor = x; b = i; } } return b; };
const Q = (d, lado, i, j, cual) => { const A = lado > 0 ? (cual === "b" ? d.cb : d.ca) : (cual === "b" ? d.pb : d.pa); const v = A[i]?.[j]; return v >= 0 ? v : NaN; };

/** Compra al ASK, vende al BID. Al vencimiento, intrínseco exacto. Sin modelo. */
export function operar(d, lado, objetivo, vehiculo, salida) {
  const j0 = 0;
  const S0 = d.S[j0], Sfin = d.S[d.S.length - 1];
  if (!(S0 > 0) || !(Sfin > 0)) return { fuera: "subyacente muerto" };

  const iLargo = vehiculo === "ATM" || vehiculo === "VERT" ? iK(d, S0)
    : vehiculo === "OTM25" ? iK(d, S0 * (1 + lado * 0.0025))
    : iK(d, S0 * (1 + lado * 0.005));
  const iCorto = vehiculo === "VERT" ? iK(d, S0 * (1 + lado * 0.005)) : -1;
  if (iLargo < 0) return { fuera: "sin strike" };
  if (vehiculo === "VERT" && (iCorto < 0 || iCorto === iLargo)) return { fuera: "vertical sin ancho" };

  const Klargo = d.K[iLargo], Kcorto = vehiculo === "VERT" ? d.K[iCorto] : NaN;
  const askL = Q(d, lado, iLargo, j0, "a"), bidL = Q(d, lado, iLargo, j0, "b");
  if (!(askL > 0) || !(bidL >= 0)) return { fuera: "pata larga sin cotización" };

  let debito, ancho = NaN;
  if (vehiculo === "VERT") {
    const bidC = Q(d, lado, iCorto, j0, "b");
    if (!(bidC > 0)) return { fuera: "pata corta sin cotización" };
    ancho = Math.abs(Kcorto - Klargo);
    debito = askL - bidC;
    if (!(debito > 0) || debito >= ancho) return { fuera: "débito imposible" };
  } else debito = askL;
  const horquillaEntrada = askL - bidL;

  let valor, jSal = d.ts.length - 1, tocó = false;
  const intr = (S) => {
    const iL = Math.max(0, lado > 0 ? S - Klargo : Klargo - S);
    if (vehiculo !== "VERT") return iL;
    const iC = Math.max(0, lado > 0 ? S - Kcorto : Kcorto - S);
    return iL - iC;
  };
  const venderEn = (j) => {
    const b = Q(d, lado, iLargo, j, "b");
    if (!(b >= 0)) return NaN;
    if (vehiculo !== "VERT") return b;
    const a = Q(d, lado, iCorto, j, "a");
    if (!(a >= 0)) return NaN;
    return b - a;
  };

  if (salida === "VENC") valor = intr(Sfin);
  else if (salida === "TOCA") {
    for (let j = 1; j < d.ts.length; j++) {
      if ((lado > 0 && d.S[j] >= objetivo) || (lado < 0 && d.S[j] <= objetivo)) {
        const v = venderEn(j); if (Number.isFinite(v)) { valor = v; jSal = j; tocó = true; }
        break;
      }
    }
    if (!tocó) valor = intr(Sfin);
  } else {
    const j = idxTs(d, salida === "12:00" ? "12:00" : "15:55");
    if (j < 0) return { fuera: "sin sello de salida" };
    valor = venderEn(j); jSal = j;
  }
  if (!Number.isFinite(valor)) return { fuera: "sin cotización de salida" };
  valor = vehiculo === "VERT" ? Math.max(0, Math.min(valor, ancho)) : Math.max(0, valor);

  return { pnl: (valor - debito) * 100, coste: debito * 100, debito, valor, Klargo, Kcorto, ancho,
    horquillaEntrada, horquillaPct: 100 * horquillaEntrada / ((askL + bidL) / 2 || NaN),
    tocó, jSal, S0, Sfin, lado, riesgo: debito * 100 };
}

/** S1 · imán gamD en días de gamma neta NEGATIVA · S2 · punto de giro (flip), todos los días */
export function señal(f, cual) {
  if (cual === "S1") {
    if (!(f.niveles.gam?.netPunto < 0)) return null;
    const K = f.niveles.gamD?.imanNeto; if (!(K > 0)) return null;
    const lado = Math.sign(K - f.apertura); if (!lado) return null;
    return { lado, objetivo: K };
  }
  const K = f.niveles.gamD?.flip; if (!(K > 0)) return null;
  const lado = Math.sign(K - f.apertura); if (!lado) return null;
  return { lado, objetivo: K };
}
