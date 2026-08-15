"use client";

import { useEffect, useRef, useState } from "react";

// La ⓘ de siempre: se abre al pasar el ratón y también al pulsar (para móvil y para dejarla fija
// mientras se lee). Se cierra con Escape o pulsando fuera.
//
// POR QUÉ EXISTE. Lester, 2026-08-14, sobre la explicación del mecanismo del imán:
//
//   "Esta explicación es muy buena, necesito verla varias veces para internalizarla."
//
// Una explicación que sólo vive en un chat se pierde. Puesta al lado del dato —y rellenada con
// los números que está mirando en ese momento— se relee cada vez que hace falta, sin buscarla.

export default function Info({ titulo, children, ancho = 460 }: {
  titulo?: string; children: React.ReactNode; ancho?: number;
}) {
  const [abierto, setAbierto] = useState(false);
  const [fijo, setFijo] = useState(false);          // pulsado = se queda hasta que lo cierres
  const caja = useRef<HTMLSpanElement>(null);
  const globo = useRef<HTMLSpanElement>(null);
  // Desplazamiento para que el globo NUNCA se salga de la pantalla. Se mide después de pintarlo,
  // porque hasta entonces no se sabe dónde cae: depende de en qué columna esté la ⓘ y de lo ancha
  // que tenga el usuario la ventana. En 701 px se salía 17 px por la derecha.
  const [dx, setDx] = useState(0);

  useEffect(() => {
    if (!fijo) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) { setFijo(false); setAbierto(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setFijo(false); setAbierto(false); } };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [fijo]);

  const visible = abierto || fijo;

  useEffect(() => {
    if (!visible || !globo.current) { setDx(0); return; }
    const r = globo.current.getBoundingClientRect();
    const margen = 16;
    const exceso = r.right - (document.documentElement.clientWidth - margen);
    // Se desplaza a la izquierda lo justo, y nunca tanto que se salga por el otro lado.
    if (exceso > 0) setDx(-Math.min(exceso, Math.max(0, r.left - margen)));
  }, [visible]);

  return (
    <span ref={caja} style={{ position: "relative", display: "inline-flex", verticalAlign: "middle" }}>
      <button
        aria-label={titulo ? `Información: ${titulo}` : "Información"}
        aria-expanded={visible}
        onMouseEnter={() => setAbierto(true)}
        onMouseLeave={() => setAbierto(false)}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        onClick={(e) => { e.stopPropagation(); setFijo((f) => !f); }}
        style={{
          width: 17, height: 17, borderRadius: "50%", marginLeft: 7, padding: 0, cursor: "pointer",
          border: `1px solid ${visible ? "#3B82F6" : "rgba(148,163,184,.55)"}`,
          background: visible ? "#3B82F6" : "transparent",
          color: visible ? "#fff" : "rgba(148,163,184,.9)",
          fontSize: 11, fontWeight: 800, lineHeight: 1, display: "inline-flex",
          alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif",
        }}
      >i</button>

      {visible && (
        <span
          ref={globo}
          role="tooltip"
          style={{
            position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 40,
            transform: dx ? `translateX(${dx}px)` : undefined,
            width: `min(${ancho}px, calc(100vw - 40px))`, textAlign: "left",
            background: "#0F172A", border: "1px solid rgba(148,163,184,.28)", borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,.5)", padding: "13px 15px",
            fontSize: 13, fontWeight: 400, lineHeight: 1.6, color: "var(--text)",
            display: "block", whiteSpace: "normal",
          }}
        >
          {titulo && <b style={{ display: "block", marginBottom: 7, fontSize: 13.5 }}>{titulo}</b>}
          {children}
          {!fijo && (
            <span style={{ display: "block", marginTop: 9, fontSize: 11, color: "rgba(148,163,184,.7)" }}>
              Pulsa la ⓘ para dejarla fija mientras lees.
            </span>
          )}
        </span>
      )}
    </span>
  );
}
