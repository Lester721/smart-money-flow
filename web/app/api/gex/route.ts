// GET /api/gex — el GEX de SPX 0DTE, calculado EN VIVO contra el Theta Terminal.
//
// Las tres peticiones van EN PARALELO: en serie tardan 13 s y a la vez 4,6 s. El open interest
// se sella a las 06:30 y no cambia en todo el día, así que se cachea en memoria.
//
// Black-Scholes se usa SOLO para convertir la IV REAL del mercado en gamma. Nunca genera un
// precio: cada bid/ask que sale de aquí es el del mercado. Comprobado el 2026-08-10 contra la
// gamma sacada sin modelo (segunda diferencia de precios): coinciden al 2% en la franja que
// concentra el 67% de la gamma.

import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const SYM = "SPXW";
const SEP = 25, ALA = 50, PASO = 5;

const nd = (x: number) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const phi = (x: number) => 0.3989423 * Math.exp(-x * x / 2);
const d1f = (S: number, K: number, T: number, v: number) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const gammaBS = (S: number, K: number, T: number, v: number) => phi(d1f(S, K, T, v)) / (S * v * Math.sqrt(T));
const deltaCall = (S: number, K: number, T: number, v: number) => nd(d1f(S, K, T, v));
const deltaPut = (S: number, K: number, T: number, v: number) => nd(d1f(S, K, T, v)) - 1;

const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ahoraET = () => new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }).slice(0, 5);

interface Q { bid: number; ask: number; mid: number; iv: number; operable: boolean }
type Csv = { cab: string[]; filas: string[][] } | null;

async function csv(ruta: string): Promise<Csv> {
  try {
    const r = await fetch(`${B}/${ruta}`, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
    const txt = await r.text();
    if (!r.ok || txt.length < 200 || txt.split("\n")[0].includes(" ")) return null;
    const lin = txt.trim().split("\n");
    return { cab: lin[0].split(","), filas: lin.slice(1).map((l) => l.split(",")) };
  } catch { return null; }
}

// El open interest no cambia en toda la sesión: se cachea por día.
let cacheOI: { dia: string; oi: { C: Map<number, number>; P: Map<number, number> } } | null = null;
async function abrirInteres(dia: string) {
  if (cacheOI?.dia === dia) return cacheOI.oi;
  const d = await csv(`option/history/open_interest?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}`);
  if (!d) return null;
  const iK = d.cab.indexOf("strike"), iR = d.cab.indexOf("right"), iO = d.cab.indexOf("open_interest");
  const oi = { C: new Map<number, number>(), P: new Map<number, number>() };
  for (const c of d.filas) { const v = +c[iO]; if (v > 0) oi[c[iR].replace(/"/g, "") === "CALL" ? "C" : "P"].set(+c[iK], v); }
  cacheOI = { dia, oi };
  return oi;
}

// Volumen y prima negociada HOY, exactos: el endpoint ohlc trae `volume` y `vwap` por barra,
// así que la prima es Σ volumen × vwap × 100 — el precio al que se cruzó de verdad, no una
// estimación con el cierre. (El endpoint eod no sirve intradía: publica después del cierre.)
async function actividad(dia: string, lado: "P" | "C") {
  const d = await csv(`option/history/ohlc?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}&right=${lado}&interval=30m`);
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

async function cadena(dia: string, lado: "P" | "C") {
  const d = await csv(`option/history/greeks/implied_volatility?symbol=${SYM}&expiration=${dia}&start_date=${dia}&end_date=${dia}&right=${lado}&interval=5m`);
  if (!d) return null;
  const jK = d.cab.indexOf("strike"), jT = d.cab.indexOf("timestamp"), jB = d.cab.indexOf("bid"),
        jA = d.cab.indexOf("ask"), jM = d.cab.indexOf("midpoint"), jV = d.cab.indexOf("implied_vol"), jU = d.cab.indexOf("underlying_price");
  let ultima = "";
  for (const c of d.filas) { const h = c[jT].slice(11, 16); if (+c[jU] > 0 && h > ultima) ultima = h; }
  const q = new Map<number, Q>(); let U = 0;
  for (const c of d.filas) {
    if (c[jT].slice(11, 16) !== ultima) continue;
    const u = +c[jU]; if (u > 0) U = u;
    const bid = +c[jB], ask = +c[jA], mid = +c[jM], iv = +c[jV];
    // Se exige ASK, no bid: una opción muy fuera del dinero cotiza 0,00 × 0,05 — tiene ask pero
    // no bid, y sigue teniendo gamma y open interest. Con `bid > 0` desaparecía medio gráfico al
    // filo del cierre y salía todo cargado a un lado.
    if (!(ask > 0) || ask < bid || !(mid > 0) || !(iv > 0.01) || iv > 4) continue;
    // La horquilla ancha NO invalida la IV, solo el precio al que se podría operar. Se marca y
    // se decide más abajo: para MEDIR gamma vale; para poner una orden encima, no.
    // (Sin esto el gráfico salía cojo: las opciones dentro del dinero, con horquilla ancha al
    //  cierre, desaparecían y solo se veía media campana.)
    q.set(+c[jK], { bid, ask, mid, iv, operable: bid > 0 && (ask - bid) / mid <= 0.5 });
  }
  return { q, U, hora: ultima };
}


// ── LA ÚLTIMA FOTO BUENA ─────────────────────────────────────────────────────
//
// Lester: "los paneles se pueden quedar con el último dato de manera que pueda validarlos?".
// Sí, y hace falta: fuera de horario el Terminal no sirve nada y toda la pantalla se queda en
// "sin datos", así que no hay forma de revisar un panel por la tarde.
//
// LA CONDICIÓN INNEGOCIABLE: el dato viejo NO puede parecerse al vivo. Sale marcado con
// `viejo: true` y con la hora exacta en que se capturó, y los paneles lo pintan en ámbar. Un
// panel que enseña la foto de ayer como si fuera de ahora es el fallo silencioso que este
// proyecto lleva meses pagando.
//
// Y LA SEÑAL SE ANULA. Lo que se guarda es la foto para MIRARLA, no para decidir con ella: al
// servirla se sustituye `señal` por un "no operar" explícito. Un crédito de ayer con los
// strikes de ayer no es una orden, es un recuerdo.
const FOTO = "data/gex-ultima-foto.json";

function guardarFoto(cuerpo: Record<string, unknown>) {
  try {
    if (!existsSync("data")) mkdirSync("data", { recursive: true });
    writeFileSync(FOTO, JSON.stringify({ ...cuerpo, capturadaEn: new Date().toISOString() }), "utf8");
  } catch { /* que no se pueda guardar no puede tumbar la respuesta buena */ }
}

function leerFoto(motivo: string) {
  try {
    if (!existsSync(FOTO)) return null;
    const f = JSON.parse(readFileSync(FOTO, "utf8"));
    return {
      ...f,
      viejo: true,
      motivoDelViejo: motivo,
      // LA SEÑAL NO SOBREVIVE A LA FOTO. Ver el panel es una cosa; operarlo, otra.
      señal: { operar: false, motivo: "dato viejo — no se decide con una foto" },
    };
  } catch { return null; }
}

export async function GET() {
  const t0 = Date.now();
  const dia = hoyET();
  // las tres a la vez: 4,6 s en vez de 13 s
  const [oi, P, C, actP, actC] = await Promise.all([
    abrirInteres(dia), cadena(dia, "P"), cadena(dia, "C"), actividad(dia, "P"), actividad(dia, "C"),
  ]);
  if (!oi || !P || !C || !(C.U > 0)) {
    const foto = leerFoto("sin datos del Terminal (¿apagado? ¿festivo? ¿fuera de horario?)");
    if (foto) return NextResponse.json(foto);
    return NextResponse.json({ ok: false, motivo: "sin datos del Terminal (¿apagado? ¿festivo? ¿antes de abrir?)", dia, ahora: ahoraET() });
  }
  const U = C.U, hora = C.hora;
  const T = Math.max((16 * 60 - (+hora.slice(0, 2) * 60 + +hora.slice(3))) / 60 / 24 / 365, 1 / 24 / 365);

  // ── LA TABLA POR STRIKE, UNA SOLA VEZ ────────────────────────────────────────────────────
  //
  // FALLO QUE ESTO ARREGLA, y lo vio Lester en pantalla: «¿por qué no tengo barras rojas encima
  // del precio?». El panel decía que los 152 strikes por encima del precio tenían CERO puts,
  // cuando el 7700 del 21 de agosto tenía 5.589 de verdad. Y por debajo desaparecían 75 calls.
  // Media cadena, y no sólo en el dibujo: el total de GEX salía del mismo bucle.
  //
  // LA CAUSA: una opción DENTRO del dinero es casi todo valor intrínseco, así que su volatilidad
  // implícita no se puede despejar y el proveedor la devuelve como 0,00000. El filtro de
  // `cadena()` exige iv > 0,01, así que tiraba la fila entera — y como las puts por encima del
  // precio están TODAS dentro del dinero, desaparecía el lado rojo completo de la mitad de
  // arriba. Es el patrón de siempre aquí: un campo que no existe se lee como cero.
  //
  // EL ARREGLO, y no es un apaño: por paridad put-call, la call y la put del MISMO strike y
  // vencimiento tienen la MISMA volatilidad implícita y la MISMA gamma. Así que se toma la IV
  // del lado que sí se despeja —siempre el que está FUERA del dinero— y se usa para las dos
  // patas. La gamma se calcula UNA vez por strike y se aplica a los dos intereses abiertos.
  // Antes se calculaba dos veces con dos IV distintas, lo cual además era matemáticamente falso.
  const ivDe = (K: number) => {
    const qC = C.q.get(K), qP = P.q.get(K);
    // el lado de FUERA del dinero es el que da una IV fiable; el de dentro la hereda
    const v = K >= U ? (qC?.iv ?? qP?.iv) : (qP?.iv ?? qC?.iv);
    return v != null && v > 0.01 && v <= 4 ? v : null;
  };
  const tabla: { K: number; iv: number; oC: number; oP: number }[] = [];
  for (const K of new Set<number>([...oi.C.keys(), ...oi.P.keys()])) {
    const oC = oi.C.get(K) ?? 0, oP = oi.P.get(K) ?? 0;
    if (!oC && !oP) continue;
    const iv = ivDe(K);
    if (iv == null) continue;              // sin IV en NINGUNO de los dos lados: no se inventa
    tabla.push({ K, iv, oC, oP });
  }
  tabla.sort((a, b) => a.K - b.K);

  // gamma en dólares por strike
  const barras: { strike: number; call: number; put: number; oiCall: number; oiPut: number }[] = [];
  let gC = 0, gP = 0, nominal = 0;
  for (const { K, iv, oC, oP } of tabla) {
    const g = gammaBS(U, K, T, iv);
    if (!isFinite(g) || g <= 0) continue;
    const unidad = g * 100 * U * U * 0.01;  // gamma en dólares por contrato: la MISMA para C y P
    const $C = unidad * oC, $P = unidad * oP;
    if (!isFinite($C) || !isFinite($P)) continue;
    // Nominal AJUSTADO POR DELTA: lo que los dealers tienen que cubrir de verdad, no el
    // nominal bruto. (El bruto con este open interest daría ~$297B; ajustado, ~$25B.)
    const dC = deltaCall(U, K, T, iv), dP = deltaPut(U, K, T, iv);
    if (isFinite(dC)) nominal += Math.abs(dC) * oC * 100 * U;
    if (isFinite(dP)) nominal += Math.abs(dP) * oP * 100 * U;
    gC += $C; gP += $P;
    barras.push({ strike: K, call: $C, put: $P, oiCall: oC, oiPut: oP });
  }
  const net = gC - gP;

  // muros y punto de giro
  const cerca = barras.filter((b) => Math.abs(b.strike - U) / U < 0.03);
  const muroCall = cerca.filter((b) => b.strike > U).sort((a, b) => b.call - a.call)[0]?.strike ?? null;
  const muroPut = cerca.filter((b) => b.strike < U).sort((a, b) => b.put - a.put)[0]?.strike ?? null;
  // PUNTO DE GIRO DE GAMMA: el nivel de precio donde el GEX neto cambiaría de signo.
  // La primera versión lo buscaba acumulando barras y devolvía null casi siempre — eso no es el
  // giro, es otra cosa. Lo correcto es RECALCULAR el GEX neto suponiendo el índice en distintos
  // niveles y ver dónde cruza el cero: la gamma de cada strike depende de dónde esté el precio.
  // Usa LA MISMA tabla que las barras: antes este bucle repetía el fallo de las opciones dentro
  // del dinero por su cuenta, así que el punto de giro también salía de media cadena.
  const netoEn = (S: number) => {
    let a = 0, b = 0;
    for (const { K, iv, oC, oP } of tabla) {
      const g = gammaBS(S, K, T, iv); if (!isFinite(g) || g <= 0) continue;
      const unidad = g * 100 * S * S * 0.01; if (!isFinite(unidad)) continue;
      a += unidad * oC; b += unidad * oP;
    }
    return a - b;
  };
  let giro: number | null = null;
  {
    const paso = U * 0.0005;
    let prev = netoEn(U * 0.97), prevS = U * 0.97;
    for (let S = U * 0.97 + paso; S <= U * 1.03; S += paso) {
      const v = netoEn(S);
      if ((prev < 0 && v >= 0) || (prev > 0 && v <= 0)) {
        giro = Math.round((prevS + (S - prevS) * (0 - prev) / (v - prev)) * 100) / 100;
        break;
      }
      prev = v; prevS = S;
    }
  }

  // ¿CUÁNTAS VECES AGUANTA UN MURO A ESTA DISTANCIA? — lo que ninguna herramienta enseña.
  // Medido sobre los 652 días: un muro pegado al precio (0-0,3%) aguanta el 58-65% de las veces;
  // uno a 0,6-1% aguanta el 92%. La distancia decide, no el tamaño de la barra.
  let aguante: { call: number | null; put: number | null; distCall: number | null; distPut: number | null; n: number } | null = null;
  try {
    const m = JSON.parse(readFileSync(join(process.cwd(), "data/gex/muros.json"), "utf8")) as
      { n: number; tabla: { desde: number; hasta: number; aguantaC: number | null; aguantaP: number | null }[] };
    const dC = muroCall != null ? ((muroCall - U) / U) * 100 : null;
    const dP = muroPut != null ? ((U - muroPut) / U) * 100 : null;
    const busca = (d: number | null, campo: "aguantaC" | "aguantaP") =>
      d == null ? null : (m.tabla.find((t) => d >= t.desde && d < t.hasta)?.[campo] ?? null);
    aguante = { call: busca(dC, "aguantaC"), put: busca(dP, "aguantaP"),
                distCall: dC != null ? Math.round(dC * 100) / 100 : null,
                distPut: dP != null ? Math.round(dP * 100) / 100 : null, n: m.n };
  } catch { /* sin estadística de muros */ }

  // contexto histórico: 652 días medidos
  let historia: { n: number; percentil: number | null; aciertoConSeñal: number; mediaConSeñal: number } | null = null;
  try {
    const h = JSON.parse(readFileSync(join(process.cwd(), "data/gex/historia.json"), "utf8")) as { gex: number; ret: number | null }[];
    const netM = net / 1e6;
    const menores = h.filter((x) => x.gex < netM).length;
    const señal = h.filter((x) => x.gex > 0 && x.ret != null);
    historia = { n: h.length, percentil: Math.round((menores / h.length) * 100),
      aciertoConSeñal: Math.round((señal.filter((x) => (x.ret ?? 0) > 0).length / señal.length) * 100),
      mediaConSeñal: Math.round((señal.reduce((s, x) => s + (x.ret ?? 0), 0) / señal.length) * 100) / 100 };
  } catch { /* sin histórico */ }

  // la señal
  const red = (x: number) => Math.round(x / PASO) * PASO;
  const Kc = red(U) + SEP, Kp = red(U) - SEP;
  const c = C.q.get(Kc), cA = C.q.get(Kc + ALA), p = P.q.get(Kp), pA = P.q.get(Kp - ALA);
  let señal: Record<string, unknown> = { operar: false, motivo: net > 0 ? "faltan strikes cotizados" : "GEX negativo — el veto" };
  if (net > 0 && c?.operable && cA?.operable && p?.operable && pA?.operable) {
    const credito = c.bid + p.bid - cA.ask - pA.ask;
    señal = { operar: credito > 0.2, credito: Math.round(credito * 100),
      riesgoMax: Math.round((ALA - credito) * 100),
      callCorta: Kc, callLarga: Kc + ALA, putCorta: Kp, putLarga: Kp - ALA,
      deltaCorta: Math.round(deltaCall(U, Kc, T, c.iv) * 1000) / 1000,
      rangoGanador: [Kp, Kc], precios: { callCorta: c.bid, callLarga: cA.ask, putCorta: p.bid, putLarga: pA.ask } };
  }

  const cuerpo = {
    ok: true, dia, hora, ahora: ahoraET(), ms: Date.now() - t0,
    spx: Math.round(U * 100) / 100,
    minutosAlCierre: Math.round(T * 365 * 24 * 60),
    gexNeto: Math.round(net / 1e6), gexCalls: Math.round(gC / 1e6), gexPuts: Math.round(gP / 1e6),
    oiTotal: [...oi.C.values()].reduce((a, b) => a + b, 0) + [...oi.P.values()].reduce((a, b) => a + b, 0),
    nominal: Math.round(nominal / 1e6),
    volumen: actP.volumen + actC.volumen,
    primaDia: Math.round((actP.prima + actC.prima) / 1e6),
    muroCall, muroPut, giro, barras, historia, aguante, señal, viejo: false,
  };
  guardarFoto(cuerpo);
  return NextResponse.json(cuerpo);
}
