// ANATOMÍA 3 · el constructor de señales, compartido por los dos scripts que lo miden.
//
// Vive aparte para que el retrato robot y la criba de cola midan EXACTAMENTE lo mismo. Si la
// definición de una señal se duplica, tarde o temprano las dos copias se separan y una tabla
// contradice a la otra sin que nadie sepa cuál está mal.
//
// TODO lo que sale de aquí es observable a las 11:00 ET o antes, MENOS los campos marcados como
// DESENLACE — que existen sólo para explicar por qué un día salió mal, nunca para decidir la
// entrada. Están agrupados al final y con prefijo `z` para que no se cuelen en una criba.

import { readFileSync, existsSync } from "node:fs";

const VDIR = "scripts/cache-theta/vol-indices";
export const ANCHO = 50;                    // ancho de las alas, en puntos
export const RIESGO_MAX = ANCHO * 100;      // $5.000 por cóndor antes de descontar el crédito

export const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
export const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
export const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
export const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));

/** Peor racha acumulada: máxima caída de pico a valle de la curva de P&L acumulado. */
export function drawdown(pls) {
  let acc = 0, pico = 0, peor = 0;
  for (const p of pls) { acc += p; if (acc > pico) pico = acc; const dd = acc - pico; if (dd < peor) peor = dd; }
  return peor;
}

/** Resumen de una serie de días: lo que a Lester le importa, en dólares y por año. */
export function resumen(fs, anosBase) {
  const pl = fs.map((f) => f.pl);
  if (!pl.length) return { n: 0, total: 0, alAno: 0, media: NaN, peor: NaN, p1: NaN, p5: NaN, dd: 0, acierto: NaN };
  return {
    n: pl.length,
    total: pl.reduce((a, b) => a + b, 0),
    alAno: pl.reduce((a, b) => a + b, 0) / anosBase,     // ojo: se divide por los años del PERÍODO
    media: media(pl),
    peor: Math.min(...pl),
    p1: pct(pl, 0.01),
    p5: pct(pl, 0.05),
    dd: drawdown(pl),
    acierto: pl.filter((x) => x > 0).length / pl.length,
  };
}

export function cargar() {
  const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
  const CAM = JSON.parse(readFileSync("scripts/anatomia3-camino.json", "utf8"));
  const V = {};
  const faltan = [];
  for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
    const f = `${VDIR}/${s}.json`;
    if (existsSync(f)) V[s] = JSON.parse(readFileSync(f, "utf8"));
    else faltan.push(s);
  }
  const clave = (f) => f.replace(/-/g, "");
  const anterior = (serie, fecha, n) => {
    const d = clave(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
    return ks.length >= n ? serie[ks[ks.length - n]] : null;
  };

  filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

  // integridad: el camino tiene que cuadrar con lo que ya estaba calculado
  let mal = 0;
  for (const f of filas) {
    const c = CAM[f.fecha];
    if (!c) { mal++; continue; }
    const i11 = c.h.indexOf("11:00");
    if (i11 < 0 || Math.abs(c.s[i11] - f.sp11) > 0.01 || Math.abs(c.s[c.s.length - 1] - f.cierre) > 0.01) mal++;
  }
  if (mal) throw new Error(`${mal} días donde el camino de 5 min NO cuadra con regimen-filas.json`);

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i], ant = filas[i - 1], ant2 = filas[i - 2];
    const c = CAM[f.fecha];
    const i11 = c.h.indexOf("11:00");
    const s = c.s.slice(0, i11 + 1);
    const ivs = c.iv.slice(0, i11 + 1);

    // ── FORMA del recorrido de la mañana ──
    let camino = 0, giros = 0, dirPrev = 0;
    const rets = [];
    for (let j = 1; j < s.length; j++) {
      const d = s[j] - s[j - 1];
      camino += Math.abs(d);
      rets.push(Math.log(s[j] / s[j - 1]));
      const dir = Math.sign(d);
      if (dir !== 0) { if (dirPrev !== 0 && dir !== dirPrev) giros++; dirPrev = dir; }
    }
    const neto = s[s.length - 1] - s[0];
    f.movManana = (f.sp11 / f.ap - 1) * 100;
    f.movMananaAbs = Math.abs(f.movManana);
    f.rangoManana = ((f.maxM - f.minM) / f.sp11) * 100;
    f.rangoMananaPts = f.maxM - f.minM;                          // en PUNTOS: la unidad de los strikes
    f.posRango = f.maxM > f.minM ? (f.sp11 - f.minM) / (f.maxM - f.minM) : 0.5;
    f.extremo = Math.abs(f.posRango - 0.5) * 2;
    f.recorrido = (camino / f.sp11) * 100;
    f.recorridoPts = camino;
    f.eficiencia = camino > 0 ? Math.abs(neto) / camino : 0;
    f.zigzag = giros;
    f.rvManana = sd(rets) * Math.sqrt(78 * 252) * 100;
    const i1030 = c.h.indexOf("10:30");
    f.acel = i1030 >= 0 ? Math.abs(f.sp11 / c.s[i1030] - 1) * 100 : null;

    // ── IV del dinero ──
    const iv11 = ivs[i11], iv0 = ivs.find((x) => x != null);
    f.ivAtm11 = iv11 != null ? iv11 * 100 : null;
    f.ivCambio = iv11 != null && iv0 ? (iv11 / iv0 - 1) * 100 : null;
    f.sigmaRatio = f.sigma ? 25 / f.sigma : null;
    f.rvIv = f.ivAtm11 ? f.rvManana / f.ivAtm11 : null;

    // ── hueco y AYER (sesión ENTERA de ayer) ──
    f.hueco = ant ? (f.ap / ant.cierre - 1) * 100 : null;
    f.huecoAbs = f.hueco != null ? Math.abs(f.hueco) : null;
    if (ant) {
      const ca = CAM[ant.fecha];
      f.rangoAyerReal = ((Math.max(...ca.s) - Math.min(...ca.s)) / ant.cierre) * 100;
      const ra = [];
      for (let j = 1; j < ca.s.length; j++) ra.push(Math.log(ca.s[j] / ca.s[j - 1]));
      f.rvAyer = sd(ra) * Math.sqrt(78 * 252) * 100;
      // el movimiento de TARDE de ayer, que es exactamente lo que hoy nos puede matar
      const i11a = ca.h.indexOf("11:00");
      f.tardeAyerPts = Math.abs(ca.s[ca.s.length - 1] - ca.s[i11a]);
    } else { f.rangoAyerReal = null; f.rvAyer = null; f.tardeAyerPts = null; }
    f.retAyer = ant && ant2 ? (ant.cierre / ant2.cierre - 1) * 100 : null;

    // ── índices de volatilidad, SIEMPRE cierre de AYER ──
    f.vix = V.VIX ? anterior(V.VIX, f.fecha, 1) : null;
    const vix2 = V.VIX ? anterior(V.VIX, f.fecha, 2) : null;
    f.vixCambio = f.vix && vix2 ? (f.vix / vix2 - 1) * 100 : null;
    const v9 = V.VIX9D ? anterior(V.VIX9D, f.fecha, 1) : null;
    const v3m = V.VIX3M ? anterior(V.VIX3M, f.fecha, 1) : null;
    const vv = V.VVIX ? anterior(V.VVIX, f.fecha, 1) : null;
    f.term9 = f.vix && v9 ? v9 / f.vix : null;
    f.term3m = f.vix && v3m ? f.vix / v3m : null;
    f.vvix = vv;
    f.vvixVix = vv && f.vix ? vv / f.vix : null;
    f.ivVsVix = f.ivAtm11 && f.vix ? f.ivAtm11 / f.vix : null;

    // ── calendario ──
    const dsem = new Date(f.fecha + "T00:00:00Z").getUTCDay();
    f.opex = (f.dia >= 15 && f.dia <= 21 && dsem === 5) ? 1 : 0;
    f.empleo = (f.dia <= 7 && dsem === 5) ? 1 : 0;
    // ÚLTIMO día de negociación del mes. La última fila del fichero NO se etiqueta: no sabemos si
    // su mes terminó ahí o si el fichero se acaba antes. Etiquetarla metía 2026-08-10 como fin de
    // mes cuando no lo es, y un día bueno colado dentro empeoraba la regla sin motivo.
    f.finMes = (filas[i + 1] && filas[i + 1].fecha.slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;
    f.vispera = 0;                                               // se rellena abajo
    f.primeroMes = (!ant || ant.fecha.slice(5, 7) !== f.fecha.slice(5, 7)) ? 1 : 0;

    // ── nivel del índice: los ±25 puntos son FIJOS y el índice subió un 63% en el período ──
    f.nivel = f.sp11;
    f.sepPct = (25 / f.sp11) * 100;                              // qué % del índice son los 25 puntos

    // ═══ DESENLACE — NO observable a las 11:00. Sólo para explicar, nunca para decidir. ═══
    f.zTardePts = f.cierre - f.sp11;                             // movimiento de 11:00 al cierre, en puntos
    f.zTardeAbs = Math.abs(f.zTardePts);
    f.zTardeSigmas = f.sigma ? f.zTardeAbs / f.sigma : null;     // ese movimiento en σ implícitas
    f.zRiesgoMax = RIESGO_MAX - f.credito;                       // lo máximo que se puede perder ese día
    f.zPlPorRiesgo = f.zRiesgoMax > 0 ? f.pl / f.zRiesgoMax : null;
    f.zPerdidaTotal = f.pl <= -(f.zRiesgoMax - 5) ? 1 : 0;       // ¿fue pérdida máxima?
    // el TRAMO FINAL: de 15:30 al cierre. Es donde cruza el desequilibrio de órdenes al cierre
    // (MOC) del reajuste de carteras de fin de mes. DESENLACE: sirve para probar el mecanismo.
    const i1530 = c.h.indexOf("15:30");
    f.zCierrePts = i1530 >= 0 ? c.s[c.s.length - 1] - c.s[i1530] : null;
    f.zCierreAbs = f.zCierrePts != null ? Math.abs(f.zCierrePts) : null;
    f.zCierreSigmas = f.zCierreAbs != null && f.sigma ? f.zCierreAbs / f.sigma : null;
  }
  // víspera del fin de mes, para separar "el día" de "la semana"
  for (let i = 0; i < filas.length; i++) filas[i].vispera = (filas[i + 1] && filas[i + 1].finMes === 1) ? 1 : 0;

  return { filas, faltan, CAM };
}
