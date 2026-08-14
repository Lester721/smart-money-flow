// GEX de SPX por vencimiento, contra el Theta Terminal.
//
// POR QUÉ EXISTE: `/api/gex` calcula el GEX de UN vencimiento — el de hoy — y lo hace bien.
// Pero al agregar todo en un solo número se pierde la información que MarketSnack sí enseña:
// **qué vencimiento manda hoy**. En su captura del 2026-08-12 se ve que el 14 de agosto pesaba
// el 38% de la gamma y el 0DTE solo el 32%; con un número agregado eso es invisible.
//
// Nos importa de verdad, no es cosmético: está medido que **la gamma pega el doble a 1 día que
// a 10**. Si el peso está en un vencimiento a 2 días y no en el 0DTE, el mecanismo sobre el que
// se apoya el cóndor 0DTE no está donde creemos que está.
//
// SOBRE BLACK-SCHOLES: aquí se usa SOLO para convertir la IV REAL del mercado en gamma. Nunca
// genera un precio. Es la misma dirección legítima que en `/api/gex` (mercado → griega), no la
// prohibida (modelo → precio). Ver `lib/sin-precios-de-modelo.test.ts`.
//
// Los ayudantes están duplicados a propósito respecto de `app/api/gex/route.ts`: esa ruta
// funciona y se valida contra MarketSnack, así que no se toca sin poder comprobarlo en pantalla.
// DEUDA CONOCIDA: unificar las dos cuando se puedan verificar juntas.

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
export const SYM_SPX = "SPXW";

const phi = (x: number) => 0.3989423 * Math.exp((-x * x) / 2);
const nd = (x: number) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};
const d1f = (S: number, K: number, T: number, v: number) => (Math.log(S / K) + ((v * v) / 2) * T) / (v * Math.sqrt(T));
const gammaBS = (S: number, K: number, T: number, v: number) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));
const deltaCall = (S: number, K: number, T: number, v: number) => nd(d1f(S, K, T, v));
const deltaPut = (S: number, K: number, T: number, v: number) => nd(d1f(S, K, T, v)) - 1;

/** La hora del mercado NUNCA con la variable TZ: en Git Bash sobre Windows devuelve UTC sin avisar. */
export const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
export const ahoraET = () =>
  new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }).slice(0, 5);

type Csv = { cab: string[]; filas: string[][] } | null;

async function csv(ruta: string): Promise<Csv> {
  try {
    const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
    const txt = await r.text();
    if (!r.ok || txt.length < 200 || txt.split("\n")[0].includes(" ")) return null;
    const lin = txt.trim().split("\n");
    return { cab: lin[0].split(","), filas: lin.slice(1).map((l) => l.split(",")) };
  } catch {
    return null;
  }
}

// El open interest se sella a las 06:30 y no cambia en toda la sesión. Se cachea POR VENCIMIENTO
// (un Map, no una sola casilla): con una sola casilla, recorrer 5 vencimientos la invalidaría en
// cada vuelta y no cachearía nada.
const cacheOI = new Map<string, { C: Map<number, number>; P: Map<number, number> }>();
let cacheOIDia = "";

async function abrirInteres(exp: string, dia: string) {
  if (cacheOIDia !== dia) { cacheOI.clear(); cacheOIDia = dia; }
  const hit = cacheOI.get(exp);
  if (hit) return hit;
  const d = await csv(`option/history/open_interest?symbol=${SYM_SPX}&expiration=${exp}&start_date=${dia}&end_date=${dia}`);
  if (!d) return null;
  const iK = d.cab.indexOf("strike"), iR = d.cab.indexOf("right"), iO = d.cab.indexOf("open_interest");
  if (iK < 0 || iR < 0 || iO < 0) return null;
  const oi = { C: new Map<number, number>(), P: new Map<number, number>() };
  for (const c of d.filas) {
    const v = +c[iO];
    if (v > 0) oi[c[iR].replace(/"/g, "") === "CALL" ? "C" : "P"].set(+c[iK], v);
  }
  cacheOI.set(exp, oi);
  return oi;
}

interface Q { bid: number; ask: number; mid: number; iv: number }

/** IV real del mercado, última marca disponible del día. Devuelve también el subyacente. */
async function cadena(exp: string, dia: string, lado: "P" | "C") {
  const d = await csv(
    `option/history/greeks/implied_volatility?symbol=${SYM_SPX}&expiration=${exp}&start_date=${dia}&end_date=${dia}&right=${lado}&interval=5m`,
  );
  if (!d) return null;
  const jK = d.cab.indexOf("strike"), jT = d.cab.indexOf("timestamp"), jB = d.cab.indexOf("bid"),
    jA = d.cab.indexOf("ask"), jM = d.cab.indexOf("midpoint"), jV = d.cab.indexOf("implied_vol"),
    jU = d.cab.indexOf("underlying_price");
  if (jK < 0 || jT < 0 || jV < 0 || jU < 0) return null;
  let ultima = "";
  for (const c of d.filas) { const h = c[jT].slice(11, 16); if (+c[jU] > 0 && h > ultima) ultima = h; }
  const q = new Map<number, Q>();
  let U = 0;
  for (const c of d.filas) {
    if (c[jT].slice(11, 16) !== ultima) continue;
    const u = +c[jU]; if (u > 0) U = u;
    const bid = +c[jB], ask = +c[jA], mid = +c[jM], iv = +c[jV];
    // Se exige ASK y no bid: una opción muy fuera del dinero cotiza 0,00 × 0,05 — no tiene bid
    // pero sí gamma y open interest. Filtrando por bid desaparece medio gráfico.
    if (!(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
    q.set(+c[jK], { bid, ask, mid, iv });
  }
  return { q, U, hora: ultima };
}

/** Volumen y prima negociada hoy en ese vencimiento. La prima es Σ volumen × vwap × 100: el
 *  precio al que se cruzó de verdad, no una estimación con el cierre. */
async function actividad(exp: string, dia: string, lado: "P" | "C") {
  const d = await csv(
    `option/history/ohlc?symbol=${SYM_SPX}&expiration=${exp}&start_date=${dia}&end_date=${dia}&right=${lado}&interval=30m`,
  );
  if (!d) return { volumen: 0, prima: 0 };
  const iV = d.cab.indexOf("volume"), iW = d.cab.indexOf("vwap");
  let volumen = 0, prima = 0;
  for (const c of d.filas) {
    const v = +c[iV], w = +c[iW];
    if (!(v > 0)) continue;
    volumen += v;
    if (w > 0) prima += v * w * 100;
  }
  return { volumen, prima };
}

export interface GexVencimiento {
  exp: string;              // AAAA-MM-DD
  dte: number;              // días naturales hasta el vencimiento (0 = hoy)
  gexNeto: number;          // millones de $ por movimiento del 1%
  gexCalls: number;
  gexPuts: number;
  nominal: number;          // millones de $, AJUSTADO POR DELTA
  oi: number;
  volumen: number;
  primaDia: number;         // millones de $ negociados hoy
  muroCall: number | null;  // strike con más gamma de calls
  muroPut: number | null;
  peso: number;             // 0..1 — cuánto de la gamma total del tablero está aquí
}

/** Días naturales entre dos fechas AAAA-MM-DD. Con Date.UTC para que no lo mueva la zona horaria. */
function dteEntre(hoy: string, exp: string): number {
  const p = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round((p(exp) - p(hoy)) / 86_400_000);
}

/**
 * GEX de cada uno de los próximos `n` vencimientos de SPX.
 *
 * Devuelve `null` si el Terminal no responde — el llamador decide qué decir. **Nunca se rellena
 * con un supuesto**: un GEX inventado se lee igual que uno real y no hay forma de notarlo.
 */
export async function gexPorVencimiento(
  expiraciones: string[],
  n = 5,
): Promise<{ dia: string; hora: string; spx: number; filas: GexVencimiento[] } | null> {
  const dia = hoyET();
  // `listarExpiraciones` devuelve AAAAMMDD y `hoyET()` AAAA-MM-DD. Comparar los dos formatos
  // como texto NO da error: da un resultado silencioso y equivocado — "20260102" > "2026-08-13"
  // porque el "0" va después del "-". Sin esta normalización pasaban TODAS las expiraciones y se
  // cogían las cinco primeras del listado, de enero, que no tienen datos hoy.
  const conGuiones = (e: string) => (e.includes("-") ? e : `${e.slice(0, 4)}-${e.slice(4, 6)}-${e.slice(6, 8)}`);
  const proximas = [...new Set(expiraciones.map(conGuiones))].filter((e) => e >= dia).sort().slice(0, n);
  if (!proximas.length) return null;

  const filas: GexVencimiento[] = [];
  let spx = 0, hora = "";

  // Secuencial por vencimiento (el Terminal admite 4 peticiones a la vez y cada vencimiento ya
  // lanza 5). En paralelo se atragantaría y devolvería nulos que parecerían "sin datos".
  for (const exp of proximas) {
    const [oi, P, C, actP, actC] = await Promise.all([
      abrirInteres(exp, dia), cadena(exp, dia, "P"), cadena(exp, dia, "C"),
      actividad(exp, dia, "P"), actividad(exp, dia, "C"),
    ]);
    if (!oi || !P || !C || !(C.U > 0)) continue;   // ese vencimiento no tiene datos: se omite, no se inventa

    spx = C.U;
    if (C.hora > hora) hora = C.hora;

    // Tiempo hasta el vencimiento, en años. Para el 0DTE se cuentan las horas que quedan hasta
    // las 16:00; para el resto, los días. Un mínimo de 1 hora evita que T=0 haga estallar la gamma.
    //
    // ⚠️ CUIDADO AL LEER EL PESO DEL 0DTE CERCA DEL CIERRE. La gamma va como 1/√T, así que al
    // filo de las 16:00 el suelo de 1 hora la multiplica por ~5 frente a la misma posición vista
    // por la mañana. Medido el 2026-08-13 a las 16:00 el 0DTE salía con el 56,4% del tablero;
    // MarketSnack, a las 12:15, daba 32%. **No son mediciones comparables**: el peso del 0DTE
    // sube solo según avanza la sesión, sin que nadie haya abierto una posición.
    // Para comparar entre días hay que hacerlo SIEMPRE a la misma hora.
    const dte = dteEntre(dia, exp);
    const minsAlCierre = 16 * 60 - (+C.hora.slice(0, 2) * 60 + +C.hora.slice(3));
    const T = dte === 0
      ? Math.max(minsAlCierre / 60 / 24 / 365, 1 / 24 / 365)
      : Math.max(dte / 365, 1 / 24 / 365);

    let gC = 0, gP = 0, nominal = 0, oiTotal = 0;
    const gammaPorStrike = { C: new Map<number, number>(), P: new Map<number, number>() };

    for (const [lado, ch] of [["C", C] as const, ["P", P] as const]) {
      for (const [K, q] of ch.q) {
        const o = oi[lado].get(K);
        if (!o) continue;
        const g = gammaBS(spx, K, T, q.iv);
        if (!isFinite(g) || g <= 0) continue;
        const $ = g * o * 100 * spx * spx * 0.01;
        if (!isFinite($)) continue;
        // Nominal AJUSTADO POR DELTA: lo que los dealers tienen que cubrir de verdad. El bruto
        // infla por diez (~$297B contra ~$25B ajustado) y no significa nada.
        const dl = lado === "C" ? deltaCall(spx, K, T, q.iv) : deltaPut(spx, K, T, q.iv);
        if (isFinite(dl)) nominal += Math.abs(dl) * o * 100 * spx;
        if (lado === "C") gC += $; else gP += $;
        gammaPorStrike[lado].set(K, $);
        oiTotal += o;
      }
    }
    if (!(gC > 0 || gP > 0)) continue;

    const mayor = (m: Map<number, number>) => {
      let k: number | null = null, v = 0;
      for (const [kk, vv] of m) if (vv > v) { v = vv; k = kk; }
      return k;
    };

    filas.push({
      exp, dte,
      gexNeto: Math.round((gC - gP) / 1e6),
      gexCalls: Math.round(gC / 1e6),
      gexPuts: Math.round(gP / 1e6),
      nominal: Math.round(nominal / 1e6),
      oi: oiTotal,
      volumen: actP.volumen + actC.volumen,
      primaDia: Math.round((actP.prima + actC.prima) / 1e6),
      muroCall: mayor(gammaPorStrike.C),
      muroPut: mayor(gammaPorStrike.P),
      peso: 0,   // se rellena abajo, cuando se conoce el total
    });
  }

  if (!filas.length) return null;

  // El peso es la cuota de gamma ABSOLUTA (calls + puts), no la del neto: un vencimiento con
  // mucha gamma repartida a los dos lados manda en el tablero aunque su neto sea casi cero.
  const total = filas.reduce((s, f) => s + Math.abs(f.gexCalls) + Math.abs(f.gexPuts), 0);
  if (total > 0) for (const f of filas) f.peso = (Math.abs(f.gexCalls) + Math.abs(f.gexPuts)) / total;

  return { dia, hora: hora || ahoraET(), spx: Math.round(spx * 100) / 100, filas };
}
