// Utilidades comunes de la serie "cola": señales observables a las 11:00 y métricas de COLA.
// Las señales se copian tal cual de scripts/regimen-18.mjs (mismo lector, mismas reglas de futuro).
import { readFileSync, existsSync } from "node:fs";

export const VDIR = "scripts/cache-theta/vol-indices";
export const CAPITAL = 56389, COLATERAL = 5000, DIAS_ANO = 252;

export const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
export const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
export const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
export const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };

/** Carga las 653 filas y les cuelga TODAS las señales observables a las 11:00. */
export function cargar() {
  const F = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
  const V = {};
  for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
    const f = VDIR + "/" + s + ".json";
    if (existsSync(f)) V[s] = JSON.parse(readFileSync(f, "utf8"));
  }
  const clave = (f) => f.replace(/-/g, "");
  // ULTIMO cierre ESTRICTAMENTE anterior: el de hoy son 5 horas de futuro.
  const anterior = (serie, fecha, n) => {
    const d = clave(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
    return ks.length >= n ? serie[ks[ks.length - n]] : null;
  };
  const cierres = {}; for (const f of F) cierres[clave(f.fecha)] = f.cierre;
  const clavesCierre = Object.keys(cierres).sort();

  for (let i = 0; i < F.length; i++) {
    const f = F[i], ant = F[i - 1];
    f.sigmaPct = (f.sigma / f.sp11) * 100;                 // sigma del resto de sesion, en %
    f.sigmaRatio = 25 / f.sigma;                           // cuantas sigma son los +-25 fijos
    f.movManana = Math.abs(f.sp11 / f.ap - 1) * 100;
    f.extremo = f.maxM > f.minM ? Math.abs((f.sp11 - f.minM) / (f.maxM - f.minM) - 0.5) * 2 : null;
    f.hueco = ant ? Math.abs(f.ap / ant.cierre - 1) * 100 : null;
    f.rangoAyer = ant ? ((ant.maxM - ant.minM) / ant.cierre) * 100 : null;
    f.vix = V.VIX ? anterior(V.VIX, f.fecha, 1) : null;
    const vixA2 = V.VIX ? anterior(V.VIX, f.fecha, 2) : null;
    f.vixCambio = f.vix && vixA2 ? (f.vix / vixA2 - 1) * 100 : null;
    const v9 = V.VIX9D ? anterior(V.VIX9D, f.fecha, 1) : null;
    const v3m = V.VIX3M ? anterior(V.VIX3M, f.fecha, 1) : null;
    f.term9 = f.vix && v9 ? v9 / f.vix : null;
    f.term3m = f.vix && v3m ? f.vix / v3m : null;
    f.vvix = V.VVIX ? anterior(V.VVIX, f.fecha, 1) : null;
    const ks = clavesCierre.filter((k) => k < clave(f.fecha));
    const ult = (n) => ks.slice(-n).map((k) => cierres[k]);
    const m200 = ult(200); f.ma200 = m200.length === 200 ? (f.sp11 / media(m200) - 1) * 100 : null;
    const m60 = ult(60); f.distMax = m60.length === 60 ? (f.sp11 / Math.max(...m60) - 1) * 100 : null;
    let bajadas = 0;
    for (let k = ks.length - 1; k > 0 && bajadas < 10; k--) { if (cierres[ks[k]] < cierres[ks[k - 1]]) bajadas++; else break; }
    f.diasBajada = bajadas;
    // PERDIDA MAXIMA POSIBLE de un contrato: el ancho del ala menos lo cobrado. Se sabe al entrar.
    f.riesgoMax = 50 * 100 - f.credito + 8 * 0.03;
  }
  return F;
}

/**
 * Metricas de COLA de una serie de P&L diarios (ya multiplicados por el tamano de ese dia).
 * `nCalendario` = dias de calendario del periodo completo: al saltarse dias el ano NO se acorta.
 */
export function metricas(pls, nCalendario) {
  const anos = nCalendario / DIAS_ANO;
  const total = pls.reduce((a, b) => a + b, 0);
  const operados = pls.filter((x) => x !== 0);
  let acc = 0, pico = 0, dd = 0;
  for (const x of pls) { acc += x; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; }
  return {
    total, anual: total / anos, n: operados.length,
    peor: pls.length ? Math.min(...pls) : 0,
    p1: pct(pls, 0.01), p5: pct(pls, 0.05),
    dd, media: operados.length ? total / operados.length : 0,
    acierto: operados.length ? operados.filter((x) => x > 0).length / operados.length : 0,
  };
}

/** La curva de tamanos -> P&L diario. `tam` es un array de n de contratos por dia. */
export const aplicar = (F, tam) => F.map((f, i) => f.pl * tam[i]);
