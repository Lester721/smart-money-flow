// GET /api/forward-gex — el ledger del forward-test en papel del cóndor 0DTE + GEX.
//
// Lee el JSON que escribe scripts/forward-gex-condor.mjs. NO calcula nada nuevo: solo cuenta lo
// que ya pasó, y lo compara contra lo que el backtest dijo que debía pasar. Esa comparación es
// todo el sentido del forward-test — si en vivo se separa, la regla no se sostiene.

import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Op {
  dia: string; hora: string; registradoEn: string; spx: number;
  gexNeto: number; gexCalls: number; gexPuts: number;
  estado: "abierta" | "cerrada" | "sin señal"; motivo?: string;
  callCorta?: number; callLarga?: number; putCorta?: number; putLarga?: number;
  credito?: number; riesgoMax?: number; cierreSPX?: number; pl?: number;
}

// Lo que el backtest dijo (654 días, 2024-2026). Fijo: es contra esto que se compara.
const BACKTEST = { señalPct: 22, acierto: 73, credito: 725, porOperacion: 196, n: 143 };

export async function GET() {
  let ops: Op[] = [];
  try {
    ops = JSON.parse(readFileSync(join(process.cwd(), "data/forward/gex-condor.json"), "utf8")) as Op[];
  } catch {
    return NextResponse.json({ ok: true, vacio: true, backtest: BACKTEST, ops: [] });
  }
  ops.sort((a, b) => (a.dia < b.dia ? 1 : -1));

  const conSeñal = ops.filter((o) => o.estado !== "sin señal");
  const cerradas = conSeñal.filter((o) => o.estado === "cerrada" && o.pl != null);
  const ganadoras = cerradas.filter((o) => (o.pl ?? 0) > 0);
  const creditos = [...cerradas.map((o) => (o.credito ?? 0) * 100)].sort((a, b) => a - b);
  const total = cerradas.reduce((s, o) => s + (o.pl ?? 0), 0);

  return NextResponse.json({
    ok: true, vacio: false, backtest: BACKTEST,
    dias: ops.length,
    señales: conSeñal.length,
    señalPct: ops.length ? Math.round((conSeñal.length / ops.length) * 100) : null,
    abiertas: conSeñal.filter((o) => o.estado === "abierta").length,
    cerradas: cerradas.length,
    acierto: cerradas.length ? Math.round((ganadoras.length / cerradas.length) * 100) : null,
    creditoMediano: creditos.length ? Math.round(creditos[Math.floor(creditos.length / 2)]) : null,
    total: Math.round(total),
    porOperacion: cerradas.length ? Math.round(total / cerradas.length) : null,
    // Con menos de 30 cierres esto no distingue nada. La web lo dice en grande.
    suficiente: cerradas.length >= 30,
    ops: ops.slice(0, 40),
  });
}
