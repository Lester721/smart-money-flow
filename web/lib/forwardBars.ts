// Barras para LIQUIDAR posiciones de los forward-tests.
//
// El bug que motiva este archivo (encontrado auditando el 2026-08-07): los scripts liquidaban
// con `barsByTicker.get(t.ticker)` y hacían `if (!bars) continue`. Ese mapa solo contiene los
// tickers que la corrida de HOY consiguió bajar, así que:
//
//   - si un ticker falla al bajar datos (throttle, símbolo mal enrutado, Terminal ocupado),
//     sus posiciones YA VENCIDAS se saltan EN SILENCIO y siguen "abiertas" para siempre;
//   - si un ticker deja de generar señales, sus posiciones viejas quedan huérfanas: ningún
//     `continue` vuelve a mirarlas nunca.
//
// El daño no es cosmético: las posiciones que no liquidan **no entran en las estadísticas**.
// Y no se pierden al azar — se pierden justo las de los tickers con problemas de datos. Eso
// sesga el win-rate hacia arriba, que es la dirección en la que uno menos quiere engañarse.
//
// AMD y SPY vencieron el 2026-08-05 y seguían abiertas dos días después por esto.

export interface DBar { time: string; close: number }

interface Posicion {
  ticker: string;
  status: string;
}

/**
 * Tickers que tienen posiciones abiertas pero NO tienen barras en esta corrida.
 * Puro: es la parte que hay que poder testear sin red.
 */
export function tickersSinBarras(ledger: Posicion[], conBarras: Iterable<string>): string[] {
  const ya = new Set(conBarras);
  const faltan = new Set<string>();
  for (const p of ledger) {
    if (p.status !== "open") continue;
    if (!ya.has(p.ticker)) faltan.add(p.ticker);
  }
  return [...faltan].sort();
}

/**
 * Rellena `barsByTicker` con los tickers que tienen posiciones abiertas y se quedaron sin
 * barras. Devuelve los que AUN ASÍ no se pudieron resolver — el llamador debe reportarlos,
 * nunca tragárselos.
 */
export async function asegurarBarrasDeLiquidacion(
  ledger: Posicion[],
  barsByTicker: Map<string, DBar[]>,
  fetchBars: (ticker: string) => Promise<DBar[]>,
  intentos = 3,
): Promise<{ rescatados: string[]; sinResolver: { ticker: string; motivo: string }[] }> {
  const rescatados: string[] = [];
  const sinResolver: { ticker: string; motivo: string }[] = [];

  for (const tk of tickersSinBarras(ledger, barsByTicker.keys())) {
    let bars: DBar[] = [];
    let motivo = "devolvió vacío";
    for (let i = 0; i < intentos && !bars.length; i++) {
      try {
        bars = await fetchBars(tk);
      } catch (e) {
        motivo = (e as Error).message;
      }
      if (!bars.length && i < intentos - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
    if (bars.length) { barsByTicker.set(tk, bars); rescatados.push(tk); }
    else sinResolver.push({ ticker: tk, motivo });
  }

  return { rescatados, sinResolver };
}

/** Posiciones abiertas cuyo vencimiento ya pasó — si esto no es 0 tras liquidar, algo falla. */
export function vencidasSinLiquidar<T extends Posicion & { expiryMs: number }>(ledger: T[], ahoraMs: number): T[] {
  return ledger.filter((p) => p.status === "open" && p.expiryMs < ahoraMs);
}
