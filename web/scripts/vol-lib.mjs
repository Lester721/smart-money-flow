// VOLATILIDAD · la construcción de señales, compartida por todo lo que la mide.
//
// Vive aparte para que el retrato, el cruce y el control del azar midan EXACTAMENTE lo mismo.
//
// TODO lo que sale de aquí es observable a las 11:00 ET del propio día o antes. Las señales que
// miran a días anteriores usan SÓLO cierres/IV de sesiones ESTRICTAMENTE anteriores: nada de
// medias calculadas sobre la serie entera. Los campos que dependen del desenlace llevan prefijo
// `z` y no pueden entrar en ninguna criba.
//
// LAS DOS UNIDADES. Cada señal de nivel viaja en dos versiones:
//   · CRUDA      — puntos de IV, puntos del índice. Es como se escribe un umbral a mano.
//   · ADIMENSIONAL — dividida por su propia escala (IV de referencia, straddle del día).
// La anatomía demostró que el perfil del día malo NO cambió entre 2022-23 y 2024-26; lo que
// cambió fueron las unidades: la IV del dinero pasó de 35% a 25% (t=5,74) y los ±25 puntos del
// 0,61% del índice al 0,41% (t=36,6). Un umbral crudo elegido en un período está escrito en una
// moneda que ya no circula en el otro. Por eso las dos versiones se miden en paralelo: si la
// cruda pasa y la adimensional no, el "hallazgo" era la inflación del índice.

import { readFileSync } from "node:fs";

export const COMM = 0.03, PATAS = 8, ANCHO = 50;
export const CUENTA = 56389, EFECTIVO = 7977, COLATERAL = 5000;
export const P1 = "2022-2023", P2 = "2024-2026";
export const periodo = (f) => (f < "2024-01-01" ? P1 : P2);

export const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
export const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
export const pct = (v, q) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
export const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));

/** Peor racha acumulada: máxima caída de pico a valle de la curva de P&L acumulado. */
export function peorRacha(pls) {
  let acum = 0, pico = 0, peor = 0;
  for (const p of pls) { acum += p; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico); }
  return peor;
}

/** t de Welch entre dos grupos. */
export function tWelch(a, b) {
  if (a.length < 3 || b.length < 3) return 0;
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  const se = Math.sqrt(va + vb);
  return se > 0 ? (media(a) - media(b)) / se : 0;
}

/** t de una media contra cero. */
export function tMedia(v) {
  if (v.length < 3) return 0;
  const s = sd(v) / Math.sqrt(v.length);
  return s > 0 ? media(v) / s : 0;
}

/** Área bajo la curva ROC: P(un día malo puntúa por debajo de uno bueno). 0,5 = no distingue. */
export function auc(malos, buenos) {
  const n = malos.length, m = buenos.length;
  if (!n || !m) return NaN;
  const todos = [...malos.map((v) => [v, 1]), ...buenos.map((v) => [v, 0])].sort((a, b) => a[0] - b[0]);
  const rango = new Array(todos.length);
  for (let i = 0; i < todos.length;) {
    let j = i; while (j + 1 < todos.length && todos[j + 1][0] === todos[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) rango[k] = r;
    i = j + 1;
  }
  let suma = 0;
  for (let i = 0; i < todos.length; i++) if (todos[i][1] === 1) suma += rango[i];
  return (suma - (n * (n + 1)) / 2) / (n * m);
}

/** P&L de aguantar al cierre, en dólares por contrato. Precios reales en las cuatro patas. */
export function plCierre(cred, KC, KP, KCL, KPL, S) {
  const lC = Math.min(Math.max(S - KC, 0), KCL - KC);
  const lP = Math.min(Math.max(KP - S, 0), KP - KPL);
  return (cred - lC - lP) * 100 - PATAS * COMM;
}

/**
 * Los 1.121 días con todas las señales de volatilidad.
 *
 * @param retardo cuántos días de historia previa hacen falta antes de operar (por las medias de
 *                IV de 5 y 20 días). Los días sin esa historia se marcan `listo:false` y NO se
 *                excluyen de la muestra base — se excluyen sólo cuando se compara con un filtro
 *                que los necesita, y entonces se dice.
 */
export function cargar() {
  const CAM = JSON.parse(readFileSync("scripts/camino-1123-filas.json", "utf8"));
  const SON = JSON.parse(readFileSync("scripts/vol-sonrisa.json", "utf8"));
  const fechas = Object.keys(CAM).sort();

  const dias = [];
  const descartes = {};
  for (const f of fechas) {
    const d = CAM[f], s = SON[f];
    const tira = (m) => { descartes[m] = (descartes[m] ?? 0) + 1; };
    if (d.i11 < 0) { tira("sin marca de 11:00"); continue; }
    if (!(d.cred > 0)) { tira("crédito ≤ 0 a las 11:00"); continue; }
    if (!s) { tira("sin sonrisa"); continue; }

    const i11 = d.i11;
    const spM = d.sp.slice(0, i11 + 1);
    const s11 = d.sp[i11];
    if (!(s11 > 0)) { tira("subyacente 0 a las 11:00"); continue; }
    if (Math.abs(s11 / s.spot - 1) > 0.002) { tira("el spot de la sonrisa no cuadra con el del camino"); continue; }

    // ── volatilidad REALIZADA de la mañana, del camino de 5 minutos ──
    const rets = [];
    for (let j = 1; j < spM.length; j++) if (spM[j] > 0 && spM[j - 1] > 0) rets.push(Math.log(spM[j] / spM[j - 1]));
    if (rets.length < 10) { tira("menos de 10 tramos de 5 min antes de las 11:00"); continue; }
    const rvMan = sd(rets) * Math.sqrt(78 * 252) * 100;          // anualizada, en %

    // ── IV del dinero a las 11:00 ──
    const ivAtm = ((s.ivAtmC + s.ivAtmP) / 2) * 100;             // %
    const ivAtmCam = d.iv[i11] != null ? d.iv[i11] * 100 : null; // la del camino, para contrastar

    // ── SONRISA. Dos unidades: puntos fijos (donde se opera) y moneyness (comparable) ──
    const son25 = ((s.ivC25 + s.ivP25) / 2) * 100 - ivAtm;       // puntos de IV, strikes ±25 fijos
    const son75 = ((s.ivC75 + s.ivP75) / 2) * 100 - ivAtm;
    const son05 = ((s.ivC05 + s.ivP05) / 2) * 100 - ivAtm;       // a ±0,5% del índice
    const son15 = ((s.ivC15 + s.ivP15) / 2) * 100 - ivAtm;       // a ±1,5% del índice
    const skew25 = (s.ivP25 - s.ivC25) * 100;                    // sesgo put−call, puntos fijos
    const skew15 = (s.ivP15 - s.ivC15) * 100;                    // lo mismo en moneyness
    // versiones adimensionales: la sonrisa RELATIVA a la propia IV del día
    const son15Rel = (son15 / ivAtm) * 100;
    const son05Rel = (son05 / ivAtm) * 100;
    const skew15Rel = (skew15 / ivAtm) * 100;

    // ── el STRADDLE: el movimiento esperado que cotiza el mercado, en puntos y sin modelo ──
    const straddle = s.strBid;                                   // se cobra el BID: la versión conservadora
    const straddleAsk = s.strAsk;
    const sigmasCorto = straddle > 0 ? 25 / straddle : null;     // ¿a cuántos "movimientos esperados" está el corto?
    const sepPct = (25 / s11) * 100;                             // los 25 puntos como % del índice (unidad CRUDA)

    // ── lo que el mercado PAGA por vender: crédito real sobre riesgo máximo ──
    const credRel = (d.cred / ANCHO) * 100;                      // % del ancho del ala
    const credStr = straddle > 0 ? d.cred / straddle : null;     // crédito por unidad de movimiento esperado

    const pl = plCierre(d.cred, d.KC, d.KP, d.KCL, d.KPL, d.cierre);

    dias.push({
      fecha: f, ticker: "SPXW", periodo: periodo(f),
      s11, cierre: d.cierre, cred: d.cred, KC: d.KC, KP: d.KP, KCL: d.KCL, KPL: d.KPL, pl,
      // señales CRUDAS (unidades que cambian de valor con el nivel del índice o de la IV)
      ivAtm, rvMan, son25, son75, skew25, sepPct, credAbs: d.cred * 100,
      // señales ADIMENSIONALES
      rvIv: rvMan / ivAtm, son15Rel, son05Rel, skew15Rel, sigmasCorto, credRel, credStr,
      son15, son05, skew15, straddle, straddleAsk, ivAtmCam,
      // DESENLACE — nunca deciden nada
      zMovTarde: Math.abs(d.cierre - s11),
      zPerdidaTotal: pl <= -(ANCHO * 100 - d.cred * 100 - 5) ? 1 : 0,
    });
  }

  // ── señales que miran ATRÁS. Sólo sesiones estrictamente anteriores. ──
  for (let i = 0; i < dias.length; i++) {
    const prev5 = dias.slice(Math.max(0, i - 5), i).map((x) => x.ivAtm);
    const prev20 = dias.slice(Math.max(0, i - 20), i).map((x) => x.ivAtm);
    const d = dias[i];
    d.ivRel5 = prev5.length === 5 ? (d.ivAtm / media(prev5) - 1) * 100 : null;
    d.ivRel20 = prev20.length === 20 ? (d.ivAtm / media(prev20) - 1) * 100 : null;
    // rango percentil de la IV de hoy dentro de las 20 anteriores: adimensional por construcción
    d.ivPctil20 = prev20.length === 20 ? prev20.filter((x) => x < d.ivAtm).length / 20 : null;
    // la realizada de AYER (sesión entera) contra la implícita de HOY: prima de riesgo cruda
    const ant = dias[i - 1];
    d.rvAyerIv = null;
    if (ant) {
      const ca = CAM[ant.fecha];
      const ra = [];
      for (let j = 1; j < ca.sp.length; j++) if (ca.sp[j] > 0 && ca.sp[j - 1] > 0) ra.push(Math.log(ca.sp[j] / ca.sp[j - 1]));
      if (ra.length >= 20) d.rvAyerIv = (sd(ra) * Math.sqrt(78 * 252) * 100) / d.ivAtm;
    }
    d.listo = d.ivRel20 != null && d.rvAyerIv != null;
  }

  // ── PERCENTIL RODANTE sobre las 60 sesiones anteriores ──
  // La sonrisa relativa cambia un 260% de mediana entre los dos períodos (t=−16,6): un umbral
  // suyo escrito en 2022 no significa nada en 2025. El percentil rodante la vuelve comparable
  // por construcción, y sigue usando SÓLO días anteriores.
  for (const k of ["son15Rel", "straddle", "credRel", "skew15Rel"]) {
    for (let i = 0; i < dias.length; i++) {
      if (i < 60) { dias[i][k + "P60"] = null; continue; }
      const prev = dias.slice(i - 60, i).map((x) => x[k]);
      dias[i][k + "P60"] = prev.filter((x) => x < dias[i][k]).length / 60;
    }
  }

  return { dias, descartes };
}

/** Lo que a Lester le importa de una serie de días, en dólares. */
export function resumen(pls, anos) {
  if (!pls.length) return { n: 0, total: 0, alAno: 0, peor: NaN, p1: NaN, p5: NaN, racha: 0, es5: NaN, p2000: NaN, p4000: NaN, acierto: NaN };
  const total = pls.reduce((a, b) => a + b, 0);
  const p5 = pct(pls, 0.05);
  const cola = pls.filter((x) => x <= p5);
  return {
    n: pls.length, total, alAno: total / anos,
    peor: Math.min(...pls), p1: pct(pls, 0.01), p5,
    racha: peorRacha(pls),
    es5: media(cola),
    p2000: pls.filter((x) => x < -2000).length / pls.length * 100,
    p4000: pls.filter((x) => x < -4000).length / pls.length * 100,
    acierto: pls.filter((x) => x > 0).length / pls.length * 100,
  };
}
