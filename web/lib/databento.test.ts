import { describe, it, expect } from "vitest";
import {
  osiToOcc,
  sideFor,
  underlyingAt,
  recordsToRawTrades,
  type DbRecord,
  type ContractContext,
} from "./databento";
import { parseOcc } from "./occ";
import { aggressionOf } from "./flow";

describe("osiToOcc", () => {
  it("quita el padding de espacios del root (Databento → OCC de Victor)", () => {
    expect(osiToOcc("AAPL  260724C00320000")).toBe("AAPL260724C00320000");
    // y el OCC resultante es parseable por el parser de Victor
    const occ = parseOcc(osiToOcc("AAPL  260724C00320000"));
    expect(occ).toEqual({
      underlying: "AAPL",
      expiration: "2026-07-24",
      type: "call",
      strike: 320,
    });
  });
});

describe("sideFor (agresor por BBO exacto)", () => {
  it("clasifica y es compatible con aggressionOf de Victor", () => {
    expect(sideFor(7.05, 6.65, 7.05)).toBe("AT_ASK");
    expect(sideFor(7.2, 6.65, 7.05)).toBe("ABOVE_ASK");
    expect(sideFor(5.5, 5.5, 7.0)).toBe("AT_BID");
    expect(sideFor(5.4, 5.5, 7.0)).toBe("BELOW_BID");
    expect(sideFor(6.35, 5.5, 7.0)).toBe("MIDMKT");
    // el string producido lo entiende el clasificador de Victor
    expect(aggressionOf(sideFor(7.2, 6.65, 7.05))).toBe("ask");
    expect(aggressionOf(sideFor(5.4, 5.5, 7.0))).toBe("bid");
    expect(aggressionOf(sideFor(6.35, 5.5, 7.0))).toBe("mid");
  });
});

describe("underlyingAt", () => {
  const bars: [number, number][] = [
    [1000, 100],
    [2000, 101],
    [3000, 102],
  ];
  it("toma la última barra <= al instante del trade", () => {
    expect(underlyingAt(bars, 2500)).toBe(101);
    expect(underlyingAt(bars, 3000)).toBe(102);
    expect(underlyingAt(bars, 500)).toBe(100); // antes de la primera → primera
  });
});

describe("recordsToRawTrades", () => {
  const t = (iso: string, price: string, size: number, bid: string, ask: string): DbRecord => ({
    hd: { ts_event: iso },
    action: "T",
    price,
    size,
    levels: [{ bid_px: bid, ask_px: ask }],
  });

  const day = "2026-07-21T15:00:00Z";
  const dayMs = Date.parse(day);
  const ctx: ContractContext = {
    osiSymbol: "AAPL  260724C00320000",
    strike: 320,
    expiration: "2026-07-24",
    isCall: true,
    openInterest: 7094,
    volume: 21775,
    underlyingBars: [[dayMs - 60000, 326.5], [dayMs, 326.8]],
  };

  const records: DbRecord[] = [
    t(day, "9.10", 62, "8.90", "9.10"), // AT_ASK → comprador
    t(day, "8.50", 55, "8.50", "9.00"), // AT_BID → vendedor
    t(day, "8.75", 3, "8.50", "9.00"), // MIDMKT
    { action: "N", price: "9", size: 5 }, // no-trade → se ignora
  ];

  const rows = recordsToRawTrades(records, ctx);

  it("ignora los registros que no son operaciones", () => {
    expect(rows).toHaveLength(3);
  });

  it("produce el OCC, side, premium y sentimiento correctos", () => {
    expect(rows[0].symbol).toBe("AAPL260724C00320000");
    expect(rows[0].side).toBe("AT_ASK");
    expect(rows[0].sentiment).toBe("bullish");
    expect(rows[0].premium).toBeCloseTo(9.1 * 62 * 100, 6);
    expect(rows[1].side).toBe("AT_BID");
    expect(rows[1].sentiment).toBe("bearish");
    expect(rows[2].side).toBe("MIDMKT");
    expect(rows[2].sentiment).toBe("neutral");
  });

  it("calcula griegas reales por operación (delta de call ITM entre 0 y 1, IV>0)", () => {
    // subyacente ~326.8 vs strike 320 → call ITM → delta alta
    expect(rows[0].delta).toBeGreaterThan(0.5);
    expect(rows[0].delta).toBeLessThan(1);
    expect(rows[0].implied_volatility).toBeGreaterThan(0);
    expect(rows[0].gamma).toBeGreaterThan(0);
    expect(rows[0].asset_price).toBeCloseTo(326.8, 6);
    expect(rows[0].bid_price).toBe(8.9);
    expect(rows[0].ask_price).toBe(9.1);
  });

  it("ids incrementales y timestamp preservado", () => {
    expect(rows.map((r) => r.id)).toEqual([0, 1, 2]);
    expect(rows[0].timestamp).toBe(day);
  });
});
