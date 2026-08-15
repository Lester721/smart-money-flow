// GET /api/gex/tape?dia=AAAA-MM-DD&min=250000&tope=40 — las operaciones grandes de SPX del día,
// una a una, con quién llevó la iniciativa (compra o venta agresiva).
//
// Es el único panel que dice **quién está poniendo el dinero y de qué lado**. Los demás dicen
// cuánta gamma hay y dónde está, que es el terreno; esto es quién está jugando encima.

import { NextResponse } from "next/server";
import { flowTape } from "@/lib/flowTape";
import { hoyET, ahoraET } from "@/lib/gexSpx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const t0 = Date.now();
  const q = new URL(req.url).searchParams;
  const dia = q.get("dia") || hoyET();
  const min = Math.max(Number(q.get("min")) || 250_000, 10_000);
  const tope = Math.min(Math.max(Number(q.get("tope")) || 40, 5), 120);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return NextResponse.json({ ok: false, motivo: `fecha no válida: ${dia}` });
  }

  const r = await flowTape(dia, "SPXW", min, tope);
  if (!r) {
    return NextResponse.json({
      ok: false,
      motivo: `sin operaciones para ${dia} (¿Terminal apagado? ¿festivo?)`,
      dia, ahora: ahoraET(),
    });
  }

  // El desequilibrio: cuánta prima entró por el lado comprador contra el vendedor. Es la lectura
  // del panel — la lista de impresiones es el detalle, esto es la conclusión.
  const con = r.impresiones.filter((x) => x.lado === "COMPRA" || x.lado === "VENTA");
  const compra = con.filter((x) => x.lado === "COMPRA").reduce((a, x) => a + x.prima, 0);
  const venta = con.filter((x) => x.lado === "VENTA").reduce((a, x) => a + x.prima, 0);
  const sinLado = r.impresiones.filter((x) => x.lado == null).length;
  // Las de varias patas NO cuentan en el desequilibrio: su precio contra el NBBO de una pierna
  // no dice nada sobre quién llevó la iniciativa.
  const fueraHorquilla = r.impresiones.filter((x) => x.lado === "fuera de horquilla").length;
  const variasPatas = r.impresiones.filter((x) => x.lado === "varias patas").length;

  return NextResponse.json({
    ok: true,
    dia, min, tope, ahora: ahoraET(), ms: Date.now() - t0,
    impresiones: r.impresiones,
    totalNotables: r.totalNotables,
    totalSimples: r.totalSimples,
    totalEstructuras: r.totalEstructuras,
    primaTotal: r.primaTotal,
    primaCompra: compra,
    primaVenta: venta,
    // Cuántas quedaron sin clasificar por no tener cotización. Se dice: no se rellena.
    sinLado,
    fueraHorquilla,
    variasPatas,
  });
}
