// PASO 2 — LAS SEÑALES DE MOVIMIENTO, todas observables a las 11:00 ET o antes.
//
// REGLA DE UNIDADES (la lección de la anatomía): un umbral en PUNTOS se endurece solo porque el
// índice va de 4.000 a 7.000. Cualquier señal que se vaya a cribar tiene que ser ADIMENSIONAL.
// El normalizador es el STRADDLE DEL DINERO A LAS 11:00 (`strad`): lo que el mercado cobra por el
// movimiento que queda hasta el cierre. Es un precio real, cotizado, y está en la propia cadena.
//
// Los campos con prefijo `z` son DESENLACE: existen para explicar, JAMÁS para decidir.
import { readFileSync } from "node:fs";

export const COMM = 0.03, ALA = 50;
export const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
export const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
export const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
export const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
export function racha(pls) { let a = 0, pico = 0, peor = 0; for (const p of pls) { a += p; if (a > pico) pico = a; if (a - pico < peor) peor = a - pico; } return peor; }
export function tWelch(a, b) {
  if (a.length < 3 || b.length < 3) return 0;
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length, se = Math.sqrt(va + vb);
  return se > 0 ? (media(a) - media(b)) / se : 0;
}

export function construir() {
  const D = JSON.parse(readFileSync("scripts/cache-dias/mov-dias.json", "utf8"));
  const fechas = Object.keys(D).sort();
  const filas = [];
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i], d = D[fecha];
    const i11 = d.h.indexOf("11:00");
    if (i11 < 1) continue;
    const ap = d.s[0], sp11 = d.s[i11], cierre = d.s[d.s.length - 1], strad = d.strad;
    if (!(ap > 0) || !(sp11 > 0) || !(cierre > 0) || !(strad > 0)) continue;

    // ── el camino de la MAÑANA: 09:35 → 11:00 (18 barras de 5 min) ──
    const m = d.s.slice(0, i11 + 1);
    let camino = 0, velMax = 0, giros = 0, dirPrev = 0;
    const rets = [];
    for (let j = 1; j < m.length; j++) {
      const dd = m[j] - m[j - 1];
      camino += Math.abs(dd);
      if (Math.abs(dd) > velMax) velMax = Math.abs(dd);
      rets.push(Math.log(m[j] / m[j - 1]));
      const dir = Math.sign(dd);
      if (dir !== 0) { if (dirPrev !== 0 && dir !== dirPrev) giros++; dirPrev = dir; }
    }
    const maxM = Math.max(...m), minM = Math.min(...m);
    const i1030 = d.h.indexOf("10:30");

    // ── AYER y ANTEAYER: sesión entera, del camino de esos días ──
    const ay = i > 0 ? D[fechas[i - 1]] : null, an = i > 1 ? D[fechas[i - 2]] : null;
    const cierreAy = ay ? ay.s[ay.s.length - 1] : null;
    const cierreAn = an ? an.s[an.s.length - 1] : null;
    const rangoAy = ay ? Math.max(...ay.s) - Math.min(...ay.s) : null;
    const rangoAn = an ? Math.max(...an.s) - Math.min(...an.s) : null;
    const i11ay = ay ? ay.h.indexOf("11:00") : -1;
    const tardeAy = ay && i11ay >= 0 ? Math.abs(ay.s[ay.s.length - 1] - ay.s[i11ay]) : null;

    // ── el cóndor: crédito REAL (bid de lo vendido, ask de lo comprado) y desenlace al cierre ──
    const pl = (d.cred - Math.min(Math.max(cierre - d.cCK, 0), d.cLK - d.cCK)
                       - Math.min(Math.max(d.pCK - cierre, 0), d.pCK - d.pLK)) * 100 - 8 * COMM;

    filas.push({
      fecha, ticker: "SPXW", ano: +fecha.slice(0, 4),
      ap, sp11, cierre, strad, ivAtm: d.ivAtm * 100, cred: d.cred * 100,

      // ═══ SEÑALES DE MOVIMIENTO · adimensionales (÷ straddle del dinero a las 11:00) ═══
      movSig:      Math.abs(sp11 - ap) / strad,                    // cuánto se ha movido desde la apertura
      movFirmado:  (sp11 - ap) / strad,                            // …con signo
      huecoSig:    cierreAy ? Math.abs(ap - cierreAy) / strad : null,   // el hueco contra el cierre de ayer
      huecoFirm:   cierreAy ? (ap - cierreAy) / strad : null,
      rangoSig:    (maxM - minM) / strad,                          // rango de la mañana
      posRango:    maxM > minM ? (sp11 - minM) / (maxM - minM) : 0.5,   // dónde está dentro del rango
      recorridoSig: camino / strad,                                // camino andado (VELOCIDAD acumulada)
      velMaxSig:   velMax / strad,                                 // la barra de 5 min más rápida
      vel30Sig:    i1030 >= 0 ? Math.abs(sp11 - d.s[i1030]) / strad : null,  // aceleración: última media hora
      eficiencia:  camino > 0 ? Math.abs(sp11 - ap) / camino : 0,  // ¿tendencia o sierra?
      zigzag:      giros,
      rvManana:    sd(rets) * Math.sqrt(78 * 252) * 100,           // volatilidad realizada de la mañana
      rvIv:        d.ivAtm > 0 ? (sd(rets) * Math.sqrt(78 * 252)) / d.ivAtm : null,  // realizada ÷ implícita
      rangoAyerSig: rangoAy != null ? rangoAy / strad : null,      // el rango de AYER, en σ de HOY
      rangoAnteSig: rangoAn != null ? rangoAn / strad : null,      // …y el de ANTEAYER
      tardeAyerSig: tardeAy != null ? tardeAy / strad : null,      // el movimiento de TARDE de ayer
      retAyer:     cierreAy && cierreAn ? (cierreAy / cierreAn - 1) * 100 : null,
      sepSig:      25 / strad,                                     // control: a cuántas σ está el corto

      // ═══ DESENLACE — NO decide nada ═══
      pl,
      zTardeSig:   Math.abs(cierre - sp11) / strad,
      zTardePts:   cierre - sp11,
    });
  }
  return filas;
}

/** Extremos que Lester pidió: la COLA, no la media. */
export function cola(fs, anos) {
  const pl = fs.map((f) => f.pl);
  const tot = pl.reduce((a, b) => a + b, 0);
  return {
    n: pl.length, total: tot, alAno: tot / anos, media: tot / pl.length,
    peor: Math.min(...pl), p1: pct(pl, 0.01), p5: pct(pl, 0.05),
    dd: racha(pl),
    p2000: pl.filter((x) => x < -2000).length / pl.length,
    p4000: pl.filter((x) => x < -4000).length / pl.length,
    acierto: pl.filter((x) => x > 0).length / pl.length,
  };
}
