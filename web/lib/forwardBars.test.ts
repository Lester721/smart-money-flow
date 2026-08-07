import { describe, it, expect } from "vitest";
import { tickersSinBarras, asegurarBarrasDeLiquidacion, vencidasSinLiquidar } from "./forwardBars";

// Bug real (2026-08-07): AMD y SPY vencieron el 5 de agosto y seguían "abiertas" dos días
// después. Los scripts liquidaban solo con las barras que la corrida de HOY consiguió bajar,
// y las que faltaban se saltaban en silencio. Lo grave no es que no cierren: es que quedan
// FUERA de las estadísticas, y no al azar — se pierden justo las de los tickers con problemas
// de datos, sesgando el win-rate hacia arriba.

const abierta = (ticker: string, expiryMs = 0) => ({ ticker, status: "open", expiryMs });
const cerrada = (ticker: string, expiryMs = 0) => ({ ticker, status: "closed", expiryMs });

describe("tickersSinBarras", () => {
  it("señala los tickers con posiciones abiertas y sin barras", () => {
    const ledger = [abierta("AMD"), abierta("SPY"), abierta("AAPL")];
    expect(tickersSinBarras(ledger, ["AAPL"])).toEqual(["AMD", "SPY"]);
  });

  it("ignora las posiciones ya cerradas — no hay nada que liquidar", () => {
    expect(tickersSinBarras([cerrada("AMD"), abierta("SPY")], [])).toEqual(["SPY"]);
  });

  it("no repite un ticker con varias posiciones abiertas", () => {
    expect(tickersSinBarras([abierta("AMD"), abierta("AMD"), abierta("AMD")], [])).toEqual(["AMD"]);
  });

  it("con todo cubierto no pide nada", () => {
    expect(tickersSinBarras([abierta("AMD")], ["AMD"])).toEqual([]);
  });
});

describe("asegurarBarrasDeLiquidacion", () => {
  const barra = [{ time: "2026-08-05", close: 100 }];

  it("rescata al ticker que faltaba y lo mete en el mapa", async () => {
    const mapa = new Map([["AAPL", barra]]);
    const r = await asegurarBarrasDeLiquidacion([abierta("AMD"), abierta("AAPL")], mapa, async () => barra);
    expect(r.rescatados).toEqual(["AMD"]);
    expect(r.sinResolver).toEqual([]);
    expect(mapa.get("AMD")).toEqual(barra);
  });

  it("reporta —NO se traga— el ticker que sigue sin barras", async () => {
    const mapa = new Map<string, typeof barra>();
    const r = await asegurarBarrasDeLiquidacion([abierta("SPX")], mapa, async () => { throw new Error("no es una acción"); }, 2);
    expect(r.rescatados).toEqual([]);
    expect(r.sinResolver).toEqual([{ ticker: "SPX", motivo: "no es una acción" }]);
  });

  it("reintenta: si el primer intento falla y el segundo va, lo rescata igual", async () => {
    const mapa = new Map<string, typeof barra>();
    let n = 0;
    const r = await asegurarBarrasDeLiquidacion([abierta("AMD")], mapa, async () => (++n === 1 ? [] : barra), 3);
    expect(n).toBe(2);
    expect(r.rescatados).toEqual(["AMD"]);
  });

  it("no toca a los que ya tenían barras (no gasta llamadas de más)", async () => {
    const mapa = new Map([["AAPL", barra]]);
    let llamadas = 0;
    await asegurarBarrasDeLiquidacion([abierta("AAPL")], mapa, async () => { llamadas++; return barra; });
    expect(llamadas).toBe(0);
  });
});

describe("vencidasSinLiquidar (red de seguridad)", () => {
  it("caza exactamente el caso de AMD y SPY", () => {
    const ahora = Date.parse("2026-08-07T00:00:00Z");
    const l = [
      abierta("AMD", Date.parse("2026-08-05T20:00:00Z")),  // venció: zombi
      abierta("SPY", Date.parse("2026-08-05T20:00:00Z")),  // venció: zombi
      abierta("AAPL", Date.parse("2026-11-04T20:00:00Z")), // futura: sana
      cerrada("MSFT", Date.parse("2026-08-01T20:00:00Z")), // vencida pero cerrada: sana
    ];
    expect(vencidasSinLiquidar(l, ahora).map((z) => z.ticker)).toEqual(["AMD", "SPY"]);
  });
});
