"use client";

// EL AVISO DE DATO VIEJO — la mitad que hace segura a la otra.
//
// Guardar la última foto del GEX sirve para revisar los paneles fuera de horario. Pero un panel
// que enseña la foto de ayer con la misma cara que el dato en vivo es exactamente el fallo
// silencioso que este proyecto lleva meses pagando: no falla, no avisa, y te deja creyendo algo
// que no es.
//
// Por eso el aviso es ámbar, va ARRIBA de la tarjeta, y dice la hora exacta de la captura y
// cuánto tiempo ha pasado. Y recuerda que la señal está anulada — la foto es para MIRAR.

const fmt = (iso?: string) => {
  if (!iso) return "?";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "?";
  return d.toLocaleString("es-ES", {
    timeZone: "America/New_York", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }) + " ET";
};

const hace = (iso?: string) => {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!isFinite(t)) return null;
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} días`;
};

export default function DatoViejo({
  viejo, capturadaEn, motivo, compacto = false,
}: {
  viejo?: boolean; capturadaEn?: string; motivo?: string; compacto?: boolean;
}) {
  if (!viejo) return null;

  if (compacto) {
    return (
      <span className="dviejo-chip" title={`${motivo ?? "sin datos en vivo"} · capturado ${fmt(capturadaEn)}`}>
        ⏸ foto de {fmt(capturadaEn)}
      </span>
    );
  }

  return (
    <div className="dviejo">
      <div className="dviejo-cab">
        <span className="dviejo-icono" aria-hidden="true">⏸</span>
        <b>Esto NO es el mercado en vivo</b>
        <span className="dviejo-cuando">{fmt(capturadaEn)}{hace(capturadaEn) ? ` · ${hace(capturadaEn)}` : ""}</span>
      </div>
      <p>
        Es la <strong>última foto guardada</strong>, para que puedas revisar los paneles con el
        mercado cerrado. {motivo ? <>Motivo: {motivo}.</> : null}
      </p>
      <p className="dviejo-señal">
        La <strong>señal está anulada</strong> a propósito: un crédito de ayer con los strikes de
        ayer no es una orden, es un recuerdo.
      </p>
    </div>
  );
}
