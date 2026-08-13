// LA REGLA: put semanal de QQQ, 3% por debajo, vendida el viernes a media sesión.
//
// Es lo único que ha sobrevivido a las cuatro barreras Y a la auditoría (315 viernes,
// 2020-2026, COVID incluido): **13,5%/año con 7-8% de caída máxima**, contra el SPY que dio
// 13,5% con 34%. Mismo retorno, una quinta parte del susto. Positivo los siete años.
//
// Tres detalles que NO son cosméticos, cada uno medido:
//
//  1. NO AL CIERRE. La prima de media sesión es ~115-123% de la del cierre: el viernes por
//     la tarde el mercado descuenta el fin de semana y la IV se hunde. Vender al cierre baja
//     el resultado a 10,1%/año Y dobla la caída (14%).
//     La hora exacta da igual mientras no sea el cierre — de 11:00 a 15:00 es una MESETA
//     (13,7 / 13,5 / 13,2 / 13,9 / 13,0). Por eso el default es mediodía y no la hora que
//     salió más alta en la muestra, que sería elegir el ganador a dedo.
//     A las 09:30 no se puede: la subasta de apertura no deja cotizaciones utilizables.
//
//  2. UNA PATA, no un vertical. El coste del bid/ask es un porcentaje de la PRIMA, no del
//     nominal. Por eso murieron los spreads: dos patas que cruzar y una prima pequeña.
//
//  3. RECOMPRAR el viernes de vencimiento si acaba dentro del dinero — NUNCA aceptar la
//     asignación. Cuesta ~$80 de más sobre el valor intrínseco; dejarla abierta al fin de
//     semana costó $57 de media por asignación y hasta $2.404 en el peor caso (2024-08-02),
//     y hundía el resultado varios puntos.
//
// CORREGIDO el 2026-08-10: la primera medición dijo 15,1% porque el precio salía de las barras
// OHLC de acciones, que se etiquetan por la hora en que EMPIEZAN y cuyo `close` es el precio de
// MEDIA HORA DESPUÉS. Al cruzarlo con cotizaciones selladas a las 10:00, el strike se elegía con
// media hora de futuro — subía el strike justo los días en que ya se sabía que el mercado
// estaba subiendo. Aquí el precio sale del MISMO feed que la cotización (griegas de opciones,
// columna underlying_price), que sí es una foto del mismo instante.
//
// Ver web/scripts/noche-2026-08-10/ para reproducirlo entero.

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";

/** Distancia del strike por debajo del spot. Barrido: 1%→+10,4 · 2%→+11,0 · 3%→+11,3 · 5%→+9,0 (medido al cierre). */
export const OTM = 0.03;
/**
 * Hora de entrada, en la rejilla de 30 minutos del mercado.
 *
 * Mediodía por robustez, no porque sea la mejor: de 11:00 a 15:00 el resultado es plano
 * (13,7 / 13,5 / 13,2 / 13,9 / 13,0). Coger las 14:00 —la más alta— sería elegir el ganador
 * de la muestra. Lo que sí importa es NO vender al cierre: ahí baja a 10,1% y la caída se dobla.
 */
export const HORA_ENTRADA = "12:00";
/** Comisión de Robinhood por contrato. */
export const COMISION = 0.03;
/** Horquilla relativa máxima: por encima no hay mercado, solo un número en la pantalla. */
export const HORQUILLA_MAX = 0.5;

export interface Cotizacion { strike: number; bid: number; ask: number; mid: number }

interface Csv { header: string[]; rows: string[][] }
const unq = (s: string) => s.replace(/^"|"$/g, "");
const idx = (h: string[], n: string) => h.indexOf(n);

async function getCsv(path: string): Promise<Csv | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(120_000) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const lines = (await res.text()).trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  // Los errores del Terminal son prosa o HTML; un header CSV no tiene espacios ni "<".
  if (lines[0].includes(" ") || lines[0].includes("<")) return null;
  return { header: lines[0].split(",").map(unq), rows: lines.slice(1).map((l) => l.split(",").map(unq)) };
}

/** El viernes siguiente a una fecha dada (YYYY-MM-DD). Si `fecha` es viernes, devuelve el de la semana que viene. */
export function viernesSiguiente(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  do { d.setUTCDate(d.getUTCDate() + 1); } while (d.getUTCDay() !== 5);
  return d.toISOString().slice(0, 10);
}

export const esViernes = (ymd: string) => new Date(`${ymd}T00:00:00Z`).getUTCDay() === 5;

/**
 * Precio del subyacente a una hora concreta.
 *
 * Sale del endpoint de GRIEGAS de opciones, no del de acciones: la suscripción de acciones
 * no da intradía de todos los años, y la de opciones sí. Filtrado a un solo strike son 2 KB
 * por petición en vez de 18 MB. Validado contra el cierre diario: 0,51% de error medio.
 */
export async function spotIntradia(
  symbol: string, fechaYmd: string, expYmd: string, strikeSonda: number, hora = HORA_ENTRADA,
): Promise<number | null> {
  for (const k of [Math.round(strikeSonda), Math.round(strikeSonda) + 1, Math.round(strikeSonda) - 1]) {
    const csv = await getCsv(
      `/v3/option/history/greeks/implied_volatility?symbol=${symbol}&expiration=${expYmd}` +
      `&start_date=${fechaYmd}&end_date=${fechaYmd}&right=P&strike=${k}&interval=30m`,
    );
    if (!csv) continue;
    const iT = idx(csv.header, "timestamp"), iU = idx(csv.header, "underlying_price");
    if (iT < 0 || iU < 0) continue;
    for (const r of csv.rows) {
      if (r[iT]?.slice(11, 16) !== hora) continue;
      const u = Number(r[iU]);
      if (u > 0) return u;
    }
  }
  return null;
}

/** La cadena de puts cotizada a una hora concreta, ya con el filtro de cotización rota puesto. */
export async function cadenaIntradia(
  symbol: string, expYmd: string, fechaYmd: string, hora = HORA_ENTRADA,
): Promise<Cotizacion[]> {
  const csv = await getCsv(
    `/v3/option/history/quote?symbol=${symbol}&expiration=${expYmd}` +
    `&start_date=${fechaYmd}&end_date=${fechaYmd}&right=P&interval=30m`,
  );
  if (!csv) return [];
  const iK = idx(csv.header, "strike"), iT = idx(csv.header, "timestamp"),
        iB = idx(csv.header, "bid"), iA = idx(csv.header, "ask");
  if (iK < 0 || iT < 0 || iB < 0 || iA < 0) return [];
  const out: Cotizacion[] = [];
  for (const r of csv.rows) {
    if (r[iT]?.slice(11, 16) !== hora) continue;
    const bid = Number(r[iB]), ask = Number(r[iA]), strike = Number(r[iK]);
    if (!(bid > 0) || !(ask > 0) || ask < bid) continue;
    const mid = (bid + ask) / 2;
    if ((ask - bid) / mid > HORQUILLA_MAX) continue;
    out.push({ strike, bid, ask, mid });
  }
  return out;
}

export interface Candidata {
  symbol: string; fecha: string; hora: string; exp: string;
  spot: number; strike: number; bid: number; ask: number;
  /** Se cobra el punto medio: es como opera Lester y como está medido el backtest. */
  credito: number;
  /** Colateral en efectivo de un contrato. */
  colateral: number;
  otmReal: number;
  horquillaRel: number;
}

/**
 * Arma la operación del viernes: el strike listado más cercano al 3% por debajo del spot
 * DE ESA HORA, con la cotización real de esa misma hora.
 *
 * Devuelve null si no hay cadena, si no hay spot, o si el strike más cercano se queda a más
 * del 1% del objetivo (eso significa que la rejilla de strikes no da para colocarlo donde toca).
 */
export async function candidataDelViernes(
  symbol: string, fechaYmd: string, hora = HORA_ENTRADA, otm = OTM,
): Promise<Candidata | null> {
  const exp = viernesSiguiente(fechaYmd);
  const cadena = await cadenaIntradia(symbol, exp, fechaYmd, hora);
  if (!cadena.length) return null;

  // Sonda para el spot: el strike central de la cadena sirve de punto de partida.
  const strikes = cadena.map((c) => c.strike).sort((a, b) => a - b);
  const spot = await spotIntradia(symbol, fechaYmd, exp, strikes[Math.floor(strikes.length / 2)], hora);
  if (!(spot != null && spot > 0)) return null;

  const objetivo = spot * (1 - otm);
  let mejor: Cotizacion | null = null, dif = Infinity;
  for (const c of cadena) {
    if (c.strike > spot) continue;
    const d = Math.abs(c.strike - objetivo);
    if (d < dif) { dif = d; mejor = c; }
  }
  if (!mejor || dif > spot * 0.01) return null;

  return {
    symbol, fecha: fechaYmd, hora, exp, spot,
    strike: mejor.strike, bid: mejor.bid, ask: mejor.ask,
    credito: mejor.mid, colateral: mejor.strike * 100,
    otmReal: (spot - mejor.strike) / spot,
    horquillaRel: (mejor.ask - mejor.bid) / mejor.mid,
  };
}

/**
 * El precio de RECOMPRAR la put el día del vencimiento, al cierre.
 *
 * Se paga el ASK: recomprar es cruzar la horquilla en tu contra, y fingir lo contrario sería
 * regalarse dinero justo en las semanas malas, que es donde importa.
 */
export async function recompraAlVencimiento(
  symbol: string, expYmd: string, strike: number,
): Promise<{ ask: number } | null> {
  const csv = await getCsv(
    `/v3/option/history/eod?symbol=${symbol}&expiration=${expYmd}` +
    `&start_date=${expYmd}&end_date=${expYmd}&strike=${strike}&right=P`,
  );
  if (!csv?.rows.length) return null;
  const iA = idx(csv.header, "ask"), iB = idx(csv.header, "bid");
  if (iA < 0) return null;
  const r = csv.rows[csv.rows.length - 1];
  const ask = Number(r[iA]), bid = Number(r[iB]);
  return ask > 0 && ask >= bid ? { ask } : null;
}

/** Cierre del subyacente de un día (para saber si acabó dentro del dinero). */
export async function cierreSubyacente(symbol: string, ymd: string): Promise<number | null> {
  const csv = await getCsv(`/v3/stock/history/eod?symbol=${symbol}&start_date=${ymd}&end_date=${ymd}`);
  if (!csv?.rows.length) return null;
  const iC = idx(csv.header, "close");
  if (iC < 0) return null;
  const c = Number(csv.rows[csv.rows.length - 1][iC]);
  return c > 0 ? c : null;
}

export interface OperacionCerrada {
  recompra: number | null;
  pnl: number;
  retorno: number;
  asignadaEvitada: boolean;
}

/** Desenlace de una operación abierta, con el precio real de recompra. */
export function cerrar(
  credito: number, strike: number, cierreExp: number, recompraAsk: number | null,
): OperacionCerrada {
  const dentro = cierreExp < strike;
  if (!dentro) {
    const pnl = credito * 100 - COMISION;
    return { recompra: null, pnl, retorno: pnl / (strike * 100), asignadaEvitada: false };
  }
  // Si no hay cotización de recompra, el suelo es el valor intrínseco — nunca menos.
  const ask = recompraAsk ?? Math.max(strike - cierreExp, 0);
  const pnl = (credito - ask) * 100 - 2 * COMISION;
  return { recompra: ask, pnl, retorno: pnl / (strike * 100), asignadaEvitada: true };
}
