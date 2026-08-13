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
import { readFileSync } from "node:fs";
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

export async function GET() {
  const t0 = Date.now();
  const dia = hoyET();
  // las tres a la vez: 4,6 s en vez de 13 s
  const [oi, P, C, actP, actC] = await Promise.all([
    abrirInteres(dia), cadena(dia, "P"), cadena(dia, "C"), actividad(dia, "P"), actividad(dia, "C"),
  ]);
  if (!oi || !P || !C || !(C.U > 0)) {
    return NextResponse.json({ ok: false, motivo: "sin datos del Terminal (¿apagado? ¿festivo? ¿antes de abrir?)", dia, ahora: ahoraET() });
  }
  const U = C.U, hora = C.hora;
  const T = Math.max((16 * 60 - (+hora.slice(0, 2) * 60 + +hora.slice(3))) / 60 / 24 / 365, 1 / 24 / 365);

  // gamma en dólares por strike
  const barras: { strike: number; call: number; put: number; oiCall: number; oiPut: number }[] = [];
  const mapa = new Map<number, { call: number; put: number; oiCall: number; oiPut: number }>();
  let gC = 0, gP = 0, nominal = 0;
  for (const [lado, ch] of [["C", C] as const, ["P", P] as const]) {
    for (const [K, q] of ch.q) {
      const o = oi[lado].get(K); if (!o) continue;
      const g = gammaBS(U, K, T, q.iv); if (!isFinite(g) || g <= 0) continue;
      const $ = g * o * 100 * U * U * 0.01;
      if (!isFinite($)) continue;
      // Nominal AJUSTADO POR DELTA: lo que los dealers tienen que cubrir de verdad, no el
      // nominal bruto. (El bruto con este open interest daría ~$297B; ajustado, ~$25B.)
      const dl = lado === "C" ? deltaCall(U, K, T, q.iv) : deltaPut(U, K, T, q.iv);
      if (isFinite(dl)) nominal += Math.abs(dl) * o * 100 * U;
      if (lado === "C") gC += $; else gP += $;
      const m = mapa.get(K) ?? { call: 0, put: 0, oiCall: 0, oiPut: 0 };
      if (lado === "C") { m.call = $; m.oiCall = o; } else { m.put = $; m.oiPut = o; }
      mapa.set(K, m);
    }
  }
  for (const [strike, v] of [...mapa.entries()].sort((a, b) => a[0] - b[0])) barras.push({ strike, ...v });
  const net = gC - gP;

  // muros y punto de giro
  const cerca = barras.filter((b) => Math.abs(b.strike - U) / U < 0.03);
  const muroCall = cerca.filter((b) => b.strike > U).sort((a, b) => b.call - a.call)[0]?.strike ?? null;
  const muroPut = cerca.filter((b) => b.strike < U).sort((a, b) => b.put - a.put)[0]?.strike ?? null;
  // PUNTO DE GIRO DE GAMMA: el nivel de precio donde el GEX neto cambiaría de signo.
  // La primera versión lo buscaba acumulando barras y devolvía null casi siempre — eso no es el
  // giro, es otra cosa. Lo correcto es RECALCULAR el GEX neto suponiendo el índice en distintos
  // niveles y ver dónde cruza el cero: la gamma de cada strike depende de dónde esté el precio.
  const netoEn = (S: number) => {
    let a = 0, b = 0;
    for (const [lado, ch] of [["C", C] as const, ["P", P] as const])
      for (const [K, q] of ch.q) {
        const o = oi[lado].get(K); if (!o) continue;
        const g = gammaBS(S, K, T, q.iv); if (!isFinite(g) || g <= 0) continue;
        const $ = g * o * 100 * S * S * 0.01; if (!isFinite($)) continue;
        if (lado === "C") a += $; else b += $;
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

  return NextResponse.json({
    ok: true, dia, hora, ahora: ahoraET(), ms: Date.now() - t0,
    spx: Math.round(U * 100) / 100,
    minutosAlCierre: Math.round(T * 365 * 24 * 60),
    gexNeto: Math.round(net / 1e6), gexCalls: Math.round(gC / 1e6), gexPuts: Math.round(gP / 1e6),
    oiTotal: [...oi.C.values()].reduce((a, b) => a + b, 0) + [...oi.P.values()].reduce((a, b) => a + b, 0),
    nominal: Math.round(nominal / 1e6),
    volumen: actP.volumen + actC.volumen,
    primaDia: Math.round((actP.prima + actC.prima) / 1e6),
    muroCall, muroPut, giro, barras, historia, aguante, señal,
  });
}
