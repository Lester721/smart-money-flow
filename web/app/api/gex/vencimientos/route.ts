// GET /api/gex/vencimientos?n=5 — el GEX de SPX **desglosado por vencimiento**.
//
// `/api/gex` da el 0DTE y lo da bien. Esto responde otra pregunta: **de toda la gamma que hay
// hoy en el tablero, ¿cuánta está en cada vencimiento?** Es la vista "Trading Session" de
// MarketSnack, y es la que más falta nos hacía: con la gamma agregada en un número no se ve si
// el peso está en el 0DTE o en el vencimiento de dentro de dos días.
//
// Importa para el cóndor: está medido que la gamma pega el doble a 1 día que a 10. Si el peso
// no está en el 0DTE, el mecanismo del que vive la estrategia no está donde lo suponemos.

import { NextResponse } from "next/server";
import { listarExpiraciones } from "@/lib/thetadata";
import { gexPorVencimiento, SYM_SPX, ahoraET, hoyET } from "@/lib/gexSpx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t0 = Date.now();
  const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get("n")) || 5, 1), 10);

  let expiraciones: string[] = [];
  try {
    expiraciones = await listarExpiraciones(SYM_SPX);
  } catch {
    expiraciones = [];
  }
  if (!expiraciones.length) {
    return NextResponse.json({
      ok: false,
      motivo: "el Theta Terminal no devolvió expiraciones (¿apagado? ¿sin suscripción de índices?)",
      dia: hoyET(), ahora: ahoraET(),
    });
  }

  const r = await gexPorVencimiento(expiraciones, n);
  if (!r) {
    return NextResponse.json({
      ok: false,
      motivo: "sin datos del Terminal para ningún vencimiento (¿festivo? ¿antes de la apertura?)",
      dia: hoyET(), ahora: ahoraET(),
    });
  }

  // El agregado va DESPUÉS del desglose, y a propósito: es el número que ya teníamos y el que
  // esconde la información. Se devuelve para poder comparar, no para mirarlo solo.
  const gexNetoTotal = r.filas.reduce((s, f) => s + f.gexNeto, 0);
  const dominante = r.filas.reduce((a, b) => (b.peso > a.peso ? b : a), r.filas[0]);

  return NextResponse.json({
    ok: true,
    dia: r.dia, hora: r.hora, ahora: ahoraET(), ms: Date.now() - t0,
    spx: r.spx,
    gexNetoTotal,
    // Cuál manda hoy y si es el de hoy mismo. Es la lectura, no el dato bruto.
    dominante: { exp: dominante.exp, dte: dominante.dte, peso: Math.round(dominante.peso * 1000) / 10 },
    elPesoEstaEn0dte: dominante.dte === 0,
    vencimientos: r.filas.map((f) => ({ ...f, peso: Math.round(f.peso * 1000) / 10 })),
  });
}
