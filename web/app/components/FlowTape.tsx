"use client";

import { useCallback, useEffect, useState } from "react";
import Info from "./Info";

// FLOW TAPE — quién pone el dinero y de qué lado, impresión a impresión.
//
// El último panel de MarketSnack que faltaba. Los demás dicen cuánta gamma hay y dónde está —
// el terreno. Éste dice **quién está jugando encima**.
//
// LO QUE AÑADIMOS SOBRE ELLOS: el desequilibrio en dólares arriba del todo. Ellos enseñan la
// cinta y te dejan sumarla con la vista; el número de si entró más prima por compra o por venta
// es la conclusión, y va primero.
//
// Y lo que NO se hace: si una impresión no tiene cotización de ese instante, se queda SIN LADO y
// se dice cuántas son. No se adivina el lado — sin bid/ask no hay forma de saber quién llevó la
// iniciativa, y rellenarlo sería inventar justo el dato que da valor al panel.

interface Impresion {
  hora: string; strike: number; right: "C" | "P"; size: number; price: number; prima: number;
  bid: number | null; ask: number | null; lado: "COMPRA" | "VENTA" | "entre medias" | null; spot: number | null;
}
interface Datos {
  ok: boolean; motivo?: string; dia: string; ms?: number;
  impresiones?: Impresion[]; totalNotables?: number; primaTotal?: number;
  primaCompra?: number; primaVenta?: number; sinLado?: number;
}

const C = { verde: "#12B76A", rojo: "#F04438", azul: "#3B82F6", tenue: "rgba(148,163,184,.75)", linea: "rgba(148,163,184,.18)" };
const $ = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${(x / 1000).toFixed(0)}K`);

export default function FlowTape() {
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [dia, setDia] = useState("");

  const cargar = useCallback(async (dd?: string) => {
    setCargando(true);
    try {
      const r = await fetch(`/api/gex/tape?tope=40${dd ? `&dia=${dd}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      setD(j);
      if (j.dia) setDia(j.dia);
    } finally { setCargando(false); }
  }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const imp = d?.impresiones ?? [];
  const compra = d?.primaCompra ?? 0, venta = d?.primaVenta ?? 0;
  const tot = compra + venta;
  const pctCompra = tot > 0 ? (compra / tot) * 100 : 50;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <b style={{ fontSize: 17 }}>Flow Tape · quién pone el dinero</b>
          <Info titulo="Cómo se sabe si fue compra o venta" ancho={480}>
            <p style={{ margin: "0 0 9px" }}>
              La operación en bruto trae strike, hora, tamaño y precio — <b>pero no trae el lado</b>.
              Para saberlo se cruza con la cotización de ese instante: si el precio está pegado al{" "}
              <b>ask</b>, alguien <b style={{ color: C.verde }}>compró con prisa</b>; si está pegado
              al <b>bid</b>, alguien <b style={{ color: C.rojo }}>vendió con prisa</b>.
            </p>
            <p style={{ margin: "0 0 9px" }}>
              Se usa la última cotización <b>en o antes</b> del instante de la operación, nunca una
              posterior — eso sería mirar al futuro.
            </p>
            <p style={{ margin: "0 0 9px" }}>
              <b>Quien cruza la horquilla tiene prisa</b>, y quien tiene prisa suele saber algo o
              necesitar cubrirse ya. Por eso el lado importa más que el tamaño: una compra agresiva
              de $2M dice más que una de $10M cruzada en el medio.
            </p>
            {(d?.sinLado ?? 0) > 0 && (
              <p style={{ margin: "0 0 9px" }}>
                Ahora mismo <b>{d!.sinLado} impresiones se quedaron sin lado</b> por no tener
                cotización de ese instante. <b>No se adivinan</b>: sin bid/ask no hay forma de
                saber quién llevó la iniciativa, y rellenarlo sería inventar justo el dato que da
                valor al panel.
              </p>
            )}
            <p style={{ margin: 0, fontSize: 12, color: C.tenue }}>
              Se muestran las <b>40 mayores del día</b> por prima. El desequilibrio de arriba se
              calcula sólo sobre esas 40, no sobre las {d?.totalNotables ?? "—"} del día entero.
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
          }}>{cargando ? "leyendo…" : "ver día"}</button>
        </div>
      </div>

      {d && !d.ok && (
        <div style={{ marginTop: 14, padding: 12, border: `1px solid ${C.linea}`, borderRadius: 10, color: C.tenue }}>
          {d.motivo}
        </div>
      )}

      {d?.ok && imp.length > 0 && (
        <>
          {/* La conclusión antes que la cinta. */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: C.verde }}><b>{$(compra)}</b> compra agresiva</span>
              <span style={{ color: C.tenue, fontSize: 12 }}>
                de las {imp.length} mayores · {d.totalNotables?.toLocaleString()} notables en el día
              </span>
              <span style={{ color: C.rojo }}>venta agresiva <b>{$(venta)}</b></span>
            </div>
            <div style={{ height: 8, borderRadius: 999, overflow: "hidden", display: "flex", background: "rgba(148,163,184,.12)" }}>
              <div style={{ width: `${pctCompra}%`, background: C.verde }} />
              <div style={{ width: `${100 - pctCompra}%`, background: C.rojo }} />
            </div>
            <div style={{ fontSize: 12, color: C.tenue, marginTop: 6 }}>
              {Math.abs(pctCompra - 50) < 8
                ? "Equilibrado: no hay un lado claro llevando la iniciativa."
                : pctCompra > 50
                  ? <>Manda la <b style={{ color: C.verde }}>compra</b> ({pctCompra.toFixed(0)}% de la prima agresiva).</>
                  : <>Manda la <b style={{ color: C.rojo }}>venta</b> ({(100 - pctCompra).toFixed(0)}% de la prima agresiva).</>}
              {(d.sinLado ?? 0) > 0 && <> · <b>{d.sinLado}</b> sin clasificar (sin cotización — no se adivinan).</>}
            </div>
          </div>

          <div style={{ marginTop: 14, maxHeight: 420, overflowY: "auto", display: "grid", gap: 6 }}>
            {imp.map((x, i) => {
              const col = x.lado === "COMPRA" ? C.verde : x.lado === "VENTA" ? C.rojo : C.tenue;
              return (
                <div key={`${x.hora}-${x.strike}-${i}`} style={{
                  border: `1px solid ${C.linea}`, borderLeft: `3px solid ${col}`,
                  borderRadius: 8, padding: "7px 11px",
                  display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
                }}>
                  <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 13, fontWeight: 700, minWidth: 74 }}>
                    {x.strike}{x.right}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", color: col, minWidth: 88 }}>
                    {x.lado ?? "SIN LADO"}
                  </span>
                  <b style={{ fontSize: 15, minWidth: 76 }}>{$(x.prima)}</b>
                  <span style={{ fontSize: 12, color: C.tenue }}>
                    {x.size.toLocaleString("es-ES")} @ ${x.price.toFixed(2)}
                    {x.bid != null && <> · bid/ask {x.bid.toFixed(2)}/{x.ask!.toFixed(2)}</>}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: C.tenue, fontVariantNumeric: "tabular-nums" }}>
                    {x.spot != null && <>SPX {x.spot.toLocaleString("es-ES")} · </>}{x.hora}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {d?.ok && imp.length === 0 && (
        <div style={{ marginTop: 14, color: C.tenue }}>Ninguna operación por encima del mínimo ese día.</div>
      )}
    </div>
  );
}
