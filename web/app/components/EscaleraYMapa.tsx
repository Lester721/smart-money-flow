"use client";

// La escalera de gamma y el mapa de liquidez, con UNA sola petición.
//
// Los dos necesitan lo mismo de /api/gex —la escalera necesita las barras por strike y el mapa
// necesita las cuatro patas del cóndor— así que comparten la llamada vía `lib/gexCliente` en vez
// de pedirla dos veces.
//
// Y van juntos a propósito: la escalera dice DÓNDE colocar las patas y el mapa dice A QUÉ PRECIO
// mandarlas. Uno es el mapa del terreno y el otro el peaje del camino.

import { useCallback, useEffect, useState } from "react";
import { pedirGex, type DatosGex } from "@/lib/gexCliente";
import GammaLadder from "./GammaLadder";
import MapaLiquidez from "./MapaLiquidez";

export default function EscaleraYMapa() {
  const [d, setD] = useState<DatosGex | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setD(await pedirGex()); } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  if (cargando && !d) return <div className="card"><p>Cargando la escalera de gamma…</p></div>;
  if (!d?.ok) return <div className="card"><b style={{ fontSize: 17 }}>Escalera de gamma</b>
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

  return (
    <>
      <MapaLiquidez patas={patas} hipotetico={hipotetico} />
      <GammaLadder barras={d.barras} spx={d.spx} muroCall={d.muroCall} muroPut={d.muroPut} giro={d.giro} />
    </>
  );
}
