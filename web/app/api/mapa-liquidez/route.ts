// GET /api/mapa-liquidez — dónde se cruza DE VERDAD cada pata del cóndor.
//
// ═══ QUÉ PROBLEMA RESUELVE ══════════════════════════════════════════════════════════════════
//
// El bid/ask que ves en pantalla no es el precio al que se opera. Es el precio al que te
// atenderían AHORA MISMO si cruzaras sin pensar. La cinta enseña otra cosa: la mayoría de las
// operaciones se cruzan por dentro de la horquilla.
//
// Medido en su día sobre la cinta de MarketSnack: comprar el contrato que se está cruzando cuesta
// un peaje del 1,81% en vez del 12,75%. Sobre un cóndor eso son **$697 por operación**. Es lo
// único de MarketSnack que sobrevivió a todas las pruebas — y es ejecución, no señal.
//
// Aquí se reconstruye con datos PROPIOS (ThetaData `trade_quote`, que trae cada operación con el
// NBBO del instante), así que no depende de ninguna suscripción de terceros.
//
// ═══ CÓMO SE LEE ════════════════════════════════════════════════════════════════════════════
//
// Para cada operación:      posición = (precio − bid) / (ask − bid)
//
//     0,0 = se cruzó en el BID   ·   0,5 = en el medio   ·   1,0 = en el ASK
//
// La MEDIANA de esas posiciones dice dónde se cruza este contrato de verdad. Si la mediana es
// 0,45, un comprador razonable entra cerca del medio, no en el ask.
//
// ═══ LO QUE NO HACE ═════════════════════════════════════════════════════════════════════════
//
// No promete un relleno. La cinta dice dónde han cruzado OTROS, no dónde te van a atender a ti.
// Y con pocas operaciones la mediana no significa nada: por debajo de 10 prints se dice que la
// muestra es corta en vez de inventar un número.
//
// Nunca se estima un precio con un modelo. Si no hay cinta, no hay mapa.

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const MIN_PRINTS = 10;          // por debajo de esto la mediana no dice nada
const CONTRATO = 100;

const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

type Pata = { strike: number; right: "C" | "P"; accion: "vender" | "comprar" };

type Print = { hora: string; precio: number; bid: number; ask: number; tam: number; pos: number };

const mediana = (v: number[]) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// La HORA importa mucho más de lo que parece. Un cóndor 0DTE se coloca a las 11:00, y a las 15:30
// esos mismos contratos valen céntimos: el ahorro absoluto se encoge con la prima aunque el
// porcentaje de horquilla sea el mismo. Por eso el mapa se puede pedir "como estaba a las HH:MM".
async function cintaDe(exp: string, strike: number, right: "C" | "P", dia: string) {
  const ymd = dia.replace(/-/g, "");
  const url = `${B}/option/history/trade_quote?symbol=SPXW&expiration=${exp}&strike=${strike}&right=${right}` +
    `&start_date=${ymd}&end_date=${ymd}`;
  let txt = "";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(45_000), cache: "no-store" });
    if (!r.ok) return null;
    txt = await r.text();
  } catch { return null; }

  const lin = txt.trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iT = cab.indexOf("trade_timestamp"), iP = cab.indexOf("price");
  const iB = cab.indexOf("bid"), iA = cab.indexOf("ask"), iS = cab.indexOf("size");
  // UNA COLUMNA QUE NO EXISTE SE LEERÍA COMO CERO Y EL PANEL DIRÍA "TODO EN EL BID". Se corta.
  if ([iT, iP, iB, iA, iS].some((x) => x < 0)) return null;

  const prints: Print[] = [];
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const precio = Number(c[iP]), bid = Number(c[iB]), ask = Number(c[iA]), tam = Number(c[iS]);
    if (!(precio > 0) || !(ask > bid) || !(bid >= 0)) continue;
    const hora = String(c[iT]).slice(11, 19);
    // la posición se recorta a [0,1]: hay prints fuera de la horquilla (bloques, combos) y
    // dejarlos crudos ensucia la mediana sin aportar nada.
    const pos = Math.min(1, Math.max(0, (precio - bid) / (ask - bid)));
    prints.push({ hora, precio, bid, ask, tam: tam > 0 ? tam : 1, pos });
  }
  return prints.length ? prints : null;
}

function resumir(pata: Pata, todos: Print[] | null, hasta: string | null) {
  // "hasta" recorta la cinta a lo conocido a esa hora. Sin recorte, mirar el mapa de las 11:00
  // con datos de las 15:30 sería mirar al futuro.
  const prints = todos && hasta ? todos.filter((p) => p.hora <= hasta) : todos;
  const base = { ...pata, prints: prints?.length ?? 0, hasta };
  if (!prints || prints.length < MIN_PRINTS) {
    // ahorro CERO explícito, no ausente: un campo que falta se suma como NaN y envenena el total.
    return { ...base, hayMapa: false, ahorroPorContrato: 0, motivo: prints ? `sólo ${prints.length} operaciones` : "sin cinta" };
  }
  const ult = prints[prints.length - 1];
  const posMed = mediana(prints.map((p) => p.pos));
  const horq = ult.ask - ult.bid;

  // EL PRECIO DE CRUZAR: vender = te dan el bid; comprar = pagas el ask.
  const cruzando = pata.accion === "vender" ? ult.bid : ult.ask;
  // EL PRECIO REALISTA: donde se cruza este contrato, según la cinta de hoy.
  const realista = ult.bid + posMed * horq;
  // El ahorro tiene signo distinto según el lado: vendiendo, más alto es mejor.
  const ahorro = pata.accion === "vender" ? realista - cruzando : cruzando - realista;

  return {
    ...base,
    hayMapa: true,
    bid: ult.bid, ask: ult.ask, horquilla: horq,
    horquillaPct: horq / ((ult.bid + ult.ask) / 2),
    posicionMediana: posMed,
    cruzando, realista,
    ahorroPorContrato: ahorro * CONTRATO,
    volumen: prints.reduce((a, p) => a + p.tam, 0),
    ultimos: prints.slice(-12).reverse(),
  };
}

export async function GET(req: Request) {
  const t0 = Date.now();
  const u = new URL(req.url);
  const dia = u.searchParams.get("dia") || hoyET();
  const horaRaw = u.searchParams.get("hora");                 // "11:00" para ver el mapa de la entrada
  const hasta = horaRaw && /^\d{2}:\d{2}$/.test(horaRaw) ? `${horaRaw}:59` : null;
  const exp = (u.searchParams.get("exp") || dia).replace(/-/g, "");

  // Las cuatro patas llegan por parámetro; si no, se piden a /api/gex, que ya las calcula.
  let patas: Pata[] = [];
  const cc = u.searchParams.get("callCorta"), cl = u.searchParams.get("callLarga");
  const pc = u.searchParams.get("putCorta"), pl = u.searchParams.get("putLarga");
  if (cc && cl && pc && pl) {
    patas = [
      { strike: Number(cc), right: "C", accion: "vender" },
      { strike: Number(cl), right: "C", accion: "comprar" },
      { strike: Number(pc), right: "P", accion: "vender" },
      { strike: Number(pl), right: "P", accion: "comprar" },
    ];
  } else {
    try {
      const r = await fetch(`${u.origin}/api/gex`, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
      const g = await r.json();
      const s = g?.señal;
      if (!s?.callCorta) {
        return NextResponse.json({ ok: false, motivo: g?.motivo || "el panel de GEX no da las cuatro patas ahora mismo", dia });
      }
      patas = [
        { strike: s.callCorta, right: "C", accion: "vender" },
        { strike: s.callLarga, right: "C", accion: "comprar" },
        { strike: s.putCorta, right: "P", accion: "vender" },
        { strike: s.putLarga, right: "P", accion: "comprar" },
      ];
    } catch {
      return NextResponse.json({ ok: false, motivo: "no se pudo leer /api/gex", dia });
    }
  }

  // Las cuatro EN PARALELO: en serie son cuatro esperas de red seguidas.
  const cintas = await Promise.all(patas.map((p) => cintaDe(exp, p.strike, p.right, dia)));
  const detalle = patas.map((p, i) => resumir(p, cintas[i], hasta));

  const conMapa = detalle.filter((d) => d.hayMapa);
  const ahorroTotal = conMapa.reduce((a, d) => a + (d.ahorroPorContrato ?? 0), 0);

  return NextResponse.json({
    ok: true, dia, exp, hora: horaRaw ?? "ahora", ms: Date.now() - t0,
    patasConMapa: conMapa.length, patasTotales: detalle.length,
    ahorroTotal,
    // Si falta alguna pata, el total NO es el ahorro del cóndor entero. Se dice.
    completo: conMapa.length === detalle.length,
    detalle,
  });
}
