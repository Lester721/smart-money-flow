// GET /api/gex/intradia?dia=AAAA-MM-DD&paso=15 — cómo se movieron el precio y los muros durante
// la sesión, y cuántas veces el precio CRUZÓ cada muro.
//
// La vista de arriba da la FOTO del instante. Esto da la PELÍCULA, que es lo que dice si la pared
// aguantó: saber que el muro está en 7790 no es lo mismo que ver si el precio rebotó tres veces
// ahí o lo atravesó sin despeinarse.
//
// Se puede pedir cualquier día pasado — incluidos los del forward-test del cóndor.

import { NextResponse } from "next/server";
import { gexIntradia } from "@/lib/gexIntradia";
import { hoyET, ahoraET } from "@/lib/gexSpx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t0 = Date.now();
  const q = new URL(req.url).searchParams;
  const dia = q.get("dia") || hoyET();
  const paso = Math.min(Math.max(Number(q.get("paso")) || 15, 5), 60);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return NextResponse.json({ ok: false, motivo: `fecha no válida: ${dia} (se espera AAAA-MM-DD)` });
  }

  const r = await gexIntradia(dia, paso);
  if (!r) {
    return NextResponse.json({
      ok: false,
      motivo: `sin datos intradía para ${dia} (¿Terminal apagado? ¿festivo? ¿antes de la apertura?)`,
      dia, ahora: ahoraET(),
    });
  }

  const p = r.puntos;
  const spx = p.map((x) => x.spx);
  const ultimo = p[p.length - 1];

  return NextResponse.json({
    ok: true,
    dia: r.dia, paso, ahora: ahoraET(), ms: Date.now() - t0,
    puntos: p,
    // La LECTURA, no sólo los datos. Cero cruces = la pared aguantó toda la sesión.
    crucesMuroCall: r.crucesMuroCall,
    crucesMuroPut: r.crucesMuroPut,
    rango: { min: Math.min(...spx), max: Math.max(...spx) },
    // El recorrido en % dice si fue un día quieto (bueno para vender rango) o movido.
    recorridoPct: Math.round(((Math.max(...spx) - Math.min(...spx)) / spx[0]) * 10000) / 100,
    cierre: ultimo?.spx ?? null,
    apertura: p[0]?.spx ?? null,
  });
}
