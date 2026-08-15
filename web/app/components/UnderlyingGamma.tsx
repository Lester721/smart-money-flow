"use client";

import { useCallback, useEffect, useState } from "react";
import Info from "./Info";

// UNDERLYING & GAMMA — el panel de MarketSnack, con lo que ellos no ponen: LOS CRUCES.
//
// Los demás paneles dan la FOTO del instante. Éste da la PELÍCULA, y responde la única pregunta
// que la foto no puede: **¿el precio respetó los muros o los cruzó?**
//
// Saber que el muro está en 7790 no es lo mismo que ver si el precio rebotó tres veces ahí o lo
// atravesó sin despeinarse. Es la diferencia entre saber dónde está la pared y saber si aguanta.
//
// Y los muros SE MUEVEN durante la sesión (la IV cambia cada 5 minutos), así que se dibujan como
// líneas, no como rayas fijas. Eso también se ve aquí y en ningún otro sitio.

interface Punto { hora: string; spx: number; gexNeto: number; gexCalls: number; gexPuts: number; muroCall: number | null; muroPut: number | null }
interface Datos {
  ok: boolean; motivo?: string; dia: string; paso?: number; ms?: number;
  puntos?: Punto[]; crucesMuroCall?: number; crucesMuroPut?: number;
  rango?: { min: number; max: number }; recorridoPct?: number; cierre?: number | null; apertura?: number | null;
}

const C = { verde: "#12B76A", rojo: "#F04438", azul: "#3B82F6", ambar: "#F79009", tenue: "rgba(148,163,184,.75)", linea: "rgba(148,163,184,.18)" };
const M = (x: number) => (Math.abs(x) >= 1000 ? `${(x / 1000).toFixed(1)}B` : `${Math.round(x)}M`);

export default function UnderlyingGamma() {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [dia, setDia] = useState("");

  const cargar = useCallback(async (dd?: string) => {
    setCargando(true);
    try {
      const r = await fetch(`/api/gex/intradia?paso=15${dd ? `&dia=${dd}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      setD(j);
      if (j.dia) setDia(j.dia);
    } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const p = d?.puntos ?? [];

  // ── geometría del gráfico ──
  const W = 100, Hp = 46, Hg = 16, GAP = 4;      // en unidades de viewBox (%), escala luego con CSS
  const xs = (i: number) => (p.length > 1 ? (i / (p.length - 1)) * W : 0);
  const todos = p.flatMap((x) => [x.spx, x.muroCall ?? x.spx, x.muroPut ?? x.spx]);
  const lo = Math.min(...todos), hi = Math.max(...todos);
  const pad = (hi - lo) * 0.08 || 1;
  const ys = (v: number) => Hp - ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * Hp;
  const maxG = Math.max(1, ...p.map((x) => Math.abs(x.gexNeto)));

  const linea = (sel: (x: Punto) => number | null) => p
    .map((x, i) => { const v = sel(x); return v == null ? null : `${xs(i)},${ys(v)}`; })
    .filter(Boolean).join(" ");

  const aguantaron = (d?.crucesMuroCall ?? 0) === 0 && (d?.crucesMuroPut ?? 0) === 0;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ fontSize: 17 }}>Underlying &amp; Gamma</b>
          <Info titulo="Qué añade este panel sobre los de arriba" ancho={500}>
            <p style={{ margin: "0 0 9px" }}>
              Los otros paneles dan la <b>foto</b> del instante. Éste da la <b>película</b>, y
              responde lo único que la foto no puede: <b>¿el precio respetó los muros o los cruzó?</b>
            </p>
            <p style={{ margin: "0 0 9px" }}>
              Saber que el muro está en un strike no es lo mismo que ver si el precio rebotó tres
              veces ahí o lo atravesó sin despeinarse. <b>Los cruces son el número que convierte
              el gráfico en una conclusión</b>: cero cruces significa que la pared aguantó la sesión
              entera.
            </p>
            {d?.ok && (
              <p style={{ margin: "0 0 9px" }}>
                Hoy: <b style={{ color: (d.crucesMuroCall ?? 0) === 0 ? C.verde : C.rojo }}>{d.crucesMuroCall} cruces</b> del
                muro de calls y <b style={{ color: (d.crucesMuroPut ?? 0) === 0 ? C.verde : C.rojo }}>{d.crucesMuroPut}</b> del
                de puts, con un recorrido del <b>{d.recorridoPct}%</b> entre el máximo y el mínimo.
              </p>
            )}
            <p style={{ margin: "0 0 9px" }}>
              <b>Los muros se mueven.</b> La IV cambia cada 5 minutos, así que el strike de mayor
              gamma no es el mismo a las 10:00 que a las 15:30. Por eso se dibujan como líneas y no
              como rayas fijas — verlos moverse es información que no da ningún otro panel.
            </p>
            <p style={{ margin: 0, fontSize: 12, color: C.tenue }}>
              Se reconstruye del histórico de ThetaData, no de un registro nuestro: se puede pedir
              cualquier día pasado. Y cuesta lo mismo que la foto del instante, porque la petición
              de IV ya traía todas las marcas del día — antes las tirábamos.
            </p>
          </Info>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
            style={{ background: "transparent", color: "inherit", border: `1px solid ${C.linea}`,
                     borderRadius: 8, padding: "5px 9px", fontSize: 13, colorScheme: "dark" }} />
          <button onClick={() => cargar(dia)} disabled={cargando} style={{
            border: `1px solid ${C.linea}`, background: "transparent", color: "inherit",
            borderRadius: 8, padding: "6px 12px", cursor: cargando ? "default" : "pointer", fontSize: 13,
          }}>{cargando ? "calculando…" : "ver día"}</button>
        </div>
      </div>

      {d && !d.ok && (
        <div style={{ marginTop: 14, padding: 12, border: `1px solid ${C.linea}`, borderRadius: 10, color: C.tenue }}>
          {d.motivo}
          <div style={{ fontSize: 12, marginTop: 6 }}>No se rellena con nada: si no hay dato, no hay gráfico.</div>
        </div>
      )}

      {d?.ok && p.length > 1 && (
        <>
          {/* La conclusión primero, el gráfico después. */}
          <div style={{
            marginTop: 14, padding: "10px 14px", borderRadius: 10,
            border: `1px solid ${aguantaron ? "rgba(18,183,106,.35)" : "rgba(240,68,56,.35)"}`,
            background: aguantaron ? "rgba(18,183,106,.08)" : "rgba(240,68,56,.08)",
          }}>
            <b>{aguantaron ? "Los dos muros aguantaron toda la sesión" : "Algún muro se cruzó"}</b>
            {" — el de calls "}<b>{d.crucesMuroCall}</b>{" veces, el de puts "}<b>{d.crucesMuroPut}</b>.
            <span style={{ color: C.tenue }}>
              {" "}Recorrido del día: <b style={{ color: "inherit" }}>{d.recorridoPct}%</b>{" "}
              ({d.rango?.min.toLocaleString("es-ES")} – {d.rango?.max.toLocaleString("es-ES")}).
            </span>
          </div>

          <svg viewBox={`0 -2 ${W} ${Hp + GAP + Hg + 4}`} preserveAspectRatio="none"
               style={{ width: "100%", height: 340, marginTop: 12, overflow: "visible" }}>
            {/* muros: líneas, porque SE MUEVEN durante la sesión */}
            <polyline points={linea((x) => x.muroCall)} fill="none" stroke={C.verde} strokeWidth={0.35}
                      strokeDasharray="1.2 1" opacity={0.85} vectorEffect="non-scaling-stroke" />
            <polyline points={linea((x) => x.muroPut)} fill="none" stroke={C.rojo} strokeWidth={0.35}
                      strokeDasharray="1.2 1" opacity={0.85} vectorEffect="non-scaling-stroke" />
            {/* el precio, encima de todo */}
            <polyline points={linea((x) => x.spx)} fill="none" stroke={C.azul} strokeWidth={0.5}
                      vectorEffect="non-scaling-stroke" />
            {/* GEX neto abajo, mismo eje de tiempo */}
            {p.map((x, i) => {
              const h = (Math.abs(x.gexNeto) / maxG) * Hg;
              return <rect key={x.hora} x={xs(i) - W / p.length / 2.6} y={Hp + GAP + (Hg - h)}
                           width={W / p.length / 1.3} height={Math.max(h, 0.15)}
                           fill={x.gexNeto >= 0 ? C.verde : C.rojo} opacity={0.5} />;
            })}
          </svg>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12, color: C.tenue, marginTop: 4 }}>
            <span><span style={{ color: C.azul }}>—</span> precio SPX</span>
            <span><span style={{ color: C.verde }}>┄</span> muro de calls</span>
            <span><span style={{ color: C.rojo }}>┄</span> muro de puts</span>
            <span>barras de abajo: GEX neto ({M(Math.max(...p.map((x) => Math.abs(x.gexNeto))))} máx.)</span>
            <span style={{ marginLeft: "auto" }}>{p[0].hora} → {p[p.length - 1].hora} ET · cada {d.paso} min</span>
          </div>
        </>
      )}
    </div>
  );
}
