"use client";

// El mapa de liquidez, enganchado al latido del GEX.
//
// Saca de /api/gex las cuatro patas del cóndor de hoy y se las pasa al mapa. Comparte la petición
// con los demás paneles vía `lib/gexCliente`, así que no añade ni una llamada al Terminal.
//
// Aquí vivía también la escalera de gamma. Se retiró el 2026-08-21: enseñaba los mismos números
// que Gamma Exposure —comprobado al decimal— y lo único suyo, las columnas de interés abierto, se
// mudó a ese panel.

import { useGexVivo } from "@/lib/gexCliente";
import MapaLiquidez from "./MapaLiquidez";

export default function MapaLiquidezVivo() {
  const { d, cargando } = useGexVivo();

  if (cargando && !d) return <div className="card"><p>Cargando el mapa de liquidez…</p></div>;
  if (!d?.ok) return <div className="card"><b style={{ fontSize: 17 }}>Mapa de liquidez</b>
    <p className="muted">{d?.motivo ?? "sin datos del Terminal"}</p></div>;

  const s = d.señal;
  // LAS PATAS AUNQUE NO SE OPERE. El panel de GEX sólo las construye los días con señal, pero el
  // mapa de liquidez es útil igual: enseña cómo está la ejecución HOY en los strikes que tocarían.
  // Confundir "hoy no se opera" con "hoy no hay datos" deja el panel en blanco sin motivo.
  const R = (x: number) => Math.round(x / 5) * 5;               // SPXW cotiza de 5 en 5
  const patas = s?.callCorta && s?.callLarga && s?.putCorta && s?.putLarga
    ? { callCorta: s.callCorta, callLarga: s.callLarga, putCorta: s.putCorta, putLarga: s.putLarga }
    : d.spx
      ? { callCorta: R(d.spx + 45), callLarga: R(d.spx + 45) + 50, putCorta: R(d.spx - 45), putLarga: R(d.spx - 45) - 50 }
      : null;
  const hipotetico = !s?.callCorta;

  return <MapaLiquidez patas={patas} hipotetico={hipotetico} />;
}
