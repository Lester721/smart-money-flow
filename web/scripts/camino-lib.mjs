// CAMINO · utilidades compartidas — carga de los 1.122 días y cuentas de la mesa.
//
// Todo lo que sale de aquí usa PRECIOS REALES: bid al vender, ask al comprar, en las cuatro patas
// y también al salir. El punto medio no aparece en ningún resultado.

import { readFileSync } from "node:fs";

export const COMM = 0.03;          // $ por pata (tasas de Robinhood)
export const PATAS = 8;            // 4 al abrir + 4 al cerrar; se cobran igual si se aguanta
export const CUENTA = 56389;       // la cuenta de Lester
export const EFECTIVO = 7977;      // el cuello de botella real
export const COLATERAL = 5000;     // por cóndor, comprobado en pantalla

/** Carga el fichero de caminos y calcula lo que se repite en todos los análisis. */
export function cargar(path = "scripts/camino-1123-filas.json") {
  const crudo = JSON.parse(readFileSync(path, "utf8"));
  const dias = [];
  let sinCredito = 0;
  for (const f of Object.keys(crudo).sort()) {
    const d = crudo[f];
    if (d.i11 < 0) continue;
    if (!(d.cred > 0)) { sinCredito++; continue; }
    const { KC, KP, KCL, KPL, cred, cierre } = d;
    const pl = plCierre(cred, KC, KP, KCL, KPL, cierre);
    // Camino desde la entrada
    const h = d.h.slice(d.i11), sp = d.sp.slice(d.i11);
    const sal = d.sal.slice(d.i11), iv = d.iv.slice(d.i11);
    const salC = d.salC.slice(d.i11), salP = d.salP.slice(d.i11);
    // CONTRAFACTUAL — sólo para diagnóstico, nunca para una cifra operable
    const midC = d.midC.slice(d.i11), midP = d.midP.slice(d.i11);
    const salMid = midC.map((x, i) => (x == null || midP[i] == null ? null : x + midP[i]));
    const margen = sp.map((s) => Math.min(KC - s, s - KP));          // puntos hasta el corto
    // Mañana (observable antes de la entrada)
    const spM = d.sp.slice(0, d.i11 + 1);
    dias.push({
      f, ticker: "SPXW", fecha: f,
      KC, KP, KCL, KPL, cred, cierre, pl,
      s11: d.sp[d.i11], h, sp, sal, salC, salP, midC, midP, salMid, iv, margen,
      ivEntrada: d.iv[d.i11],
      rangoMan: Math.max(...spM) - Math.min(...spM),
      aperturaMan: spM[spM.length - 1] - spM[0],
      anchoAla: Math.max(KCL - KC, KP - KPL),
    });
  }
  if (sinCredito) console.log(`   (${sinCredito} días sin crédito positivo a las 11:00 — se dicen, no se rellenan)`);
  return dias;
}

/** P&L de aguantar al cierre, en dólares por contrato. */
export function plCierre(cred, KC, KP, KCL, KPL, S) {
  const lC = Math.min(Math.max(S - KC, 0), KCL - KC);
  const lP = Math.min(Math.max(KP - S, 0), KP - KPL);
  return (cred - lC - lP) * 100 - PATAS * COMM;
}

/** P&L de cerrar en la marca i (paga ask, cobra bid). null si esa marca no tiene precio. */
export function plSalida(d, i) {
  const c = d.sal[i];
  return c == null ? null : (d.cred - c) * 100 - PATAS * COMM;
}

export const idx = (d, hora) => d.h.indexOf(hora);
export const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
export const pct = (v, q) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))];
};
export const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : `$${Math.round(x).toLocaleString("es-ES")}`);

/** Peor racha acumulada (máxima caída de pico a valle) de una serie de P&L en orden. */
export function peorRacha(pls) {
  let acum = 0, pico = 0, peor = 0;
  for (const p of pls) { acum += p; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico); }
  return peor;
}

/** Área bajo la curva ROC: probabilidad de que un día malo puntúe por debajo de uno bueno. */
export function auc(valoresMalos, valoresBuenos) {
  const n = valoresMalos.length, m = valoresBuenos.length;
  if (!n || !m) return NaN;
  const todos = [...valoresMalos.map((v) => [v, 1]), ...valoresBuenos.map((v) => [v, 0])].sort((a, b) => a[0] - b[0]);
  // rangos con empates promediados
  const rango = new Array(todos.length);
  for (let i = 0; i < todos.length;) {
    let j = i; while (j + 1 < todos.length && todos[j + 1][0] === todos[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rango[k] = r;
    i = j + 1;
  }
  let suma = 0;
  for (let i = 0; i < todos.length; i++) if (todos[i][1] === 1) suma += rango[i];
  return (suma - (n * (n + 1)) / 2) / (n * m);   // 0,5 = no distingue; 0 ó 1 = separa del todo
}

export const P1 = "2022-2023", P2 = "2024-2026";
export const periodo = (f) => (f < "2024-01-01" ? P1 : P2);
