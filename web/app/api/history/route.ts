// GET /api/history?ticker=XXX — barras diarias del subyacente para la gráfica.

import { MassiveError } from "@/lib/massive";
// POR EL CONMUTADOR, NO POR MASSIVE DIRECTAMENTE. Con DATA_PROVIDER=theta esto sirve barras de
// ThetaData con máximo y mínimo reales; con "massive" se comporta igual que siempre. Antes esta
// ruta llamaba a Massive a pelo: sin la clave devolvía 200 con `bars: []`, o sea que desde fuera
// parecía funcionar mientras la web se quedaba sin datos. Un vacío silencioso.
import { fetchDailyBars } from "@/lib/flowProvider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) {
    return Response.json({ error: "ticker requerido" }, { status: 400 });
  }
  try {
    const bars = await fetchDailyBars(ticker);
    return Response.json({ ticker, bars });
  } catch (err) {
    const message = err instanceof MassiveError ? err.message : "Error al cargar histórico.";
    return Response.json({ error: message }, { status: 502 });
  }
}
