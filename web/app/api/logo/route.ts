// GET /api/logo?ticker=XXX — sirve el logo de la empresa por proxy.
//
// DOS FUENTES, EN ESTE ORDEN:
//   1. Las gratuitas (financialmodelingprep, con parqet de reserva). No necesitan clave, así que
//      funcionan aunque Massive esté cancelado — que es el objetivo.
//   2. Massive, sólo si las otras no lo tienen Y la clave sigue puesta.
//
// El orden es a propósito: si las gratuitas van primero, el día que se cancele Massive no cambia
// nada. Si fuera al revés, todo seguiría funcionando hasta el día de la baja y ese día se caería
// sin que nadie lo hubiera probado.

import { traerLogo } from "@/lib/empresa";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = (searchParams.get("ticker") ?? "").trim().toUpperCase();
  if (!ticker) return new Response("ticker requerido", { status: 400 });

  const responder = (datos: ArrayBuffer, tipo: string) =>
    new Response(datos, { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=86400" } });

  try {
    const gratis = await traerLogo(ticker);
    if (gratis) return responder(gratis.datos, gratis.tipo);
  } catch { /* se prueba Massive abajo */ }

  // Reserva: Massive, mientras la clave exista.
  if (process.env.MASSIVE_API_KEY) {
    try {
      const { fetchLogoImage } = await import("@/lib/massive");
      const logo = await fetchLogoImage(ticker);
      if (logo) return responder(logo.data as ArrayBuffer, logo.contentType);
    } catch { /* nada */ }
  }

  // 404 y no 502: que no haya logo NO es un error del servidor. Hay tickers sin logo, y la
  // cabecera ya sabe pintarse sin él.
  return new Response("sin logo", { status: 404 });
}
