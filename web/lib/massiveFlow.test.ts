import { describe, it, expect } from "vitest";
import {
  toQuoteLites,
  asOfQuote,
  primaryConditionId,
  occFromMassive,
  massiveTradesToRawTrades,
  selectContracts,
  type MassiveTrade,
  type MassiveQuote,
  type MassiveContractContext,
} from "./massiveFlow";
import type { RawContract } from "./types";
import { isMultiLegCondition } from "./conditions";
import { aggressionOf } from "./flow";

// ns de un instante dado (ms → ns)
const ns = (ms: number) => ms * 1_000_000;

describe("occFromMassive", () => {
  it("quita el prefijo O: → OCC de Victor", () => {
    expect(occFromMassive("O:AAPL260724C00315000")).toBe("AAPL260724C00315000");
  });
});

describe("asOfQuote (empareja trade con el BBO vigente)", () => {
  const quotes: MassiveQuote[] = [
    { bid_price: 5.0, ask_price: 5.4, sip_timestamp: ns(1000) },
    { bid_price: 5.1, ask_price: 5.5, sip_timestamp: ns(2000) },
    { bid_price: 5.2, ask_price: 5.6, sip_timestamp: ns(3000) },
  ];
  const qs = toQuoteLites(quotes);

  it("toma el último quote <= al instante del trade", () => {
    expect(asOfQuote(qs, 2500)?.bid).toBe(5.1); // entre 2000 y 3000 → el de 2000
    expect(asOfQuote(qs, 3000)?.ask).toBe(5.6); // exacto → ese
  });
  it("null si el trade es anterior al primer quote", () => {
    expect(asOfQuote(qs, 500)).toBeNull();
  });
});

describe("primaryConditionId (multileg > cancelado > primera)", () => {
  it("prioriza el multileg del array", () => {
    // 209=AUTO, 232=MLET(multileg) → debe elegir 232
    expect(primaryConditionId([209, 232])).toBe(232);
  });
  it("prioriza cancelado si no hay multileg", () => {
    // 209=AUTO, 201=CANC(cancelado) → 201
    expect(primaryConditionId([209, 201])).toBe(201);
  });
  it("si no hay especiales, la primera", () => {
    expect(primaryConditionId([227])).toBe(227); // SLAN
    expect(primaryConditionId([])).toBeUndefined();
  });
});

describe("massiveTradesToRawTrades", () => {
  const baseMs = Date.parse("2026-07-21T15:00:00Z");
  const ctx: MassiveContractContext = {
    massiveSymbol: "O:AAPL260724C00315000",
    strike: 315,
    expiration: "2026-07-24",
    isCall: true,
    openInterest: 5000,
    volume: 12000,
    underlyingBars: [[baseMs - 60000, 322.0], [baseMs, 322.5]],
  };
  const quotes: MassiveQuote[] = [
    { bid_price: 16.9, ask_price: 17.3, sip_timestamp: ns(baseMs - 500) },
  ];
  const trades: MassiveTrade[] = [
    { price: 17.3, size: 40, conditions: [209], sip_timestamp: ns(baseMs) }, // AT_ASK
    { price: 16.9, size: 25, conditions: [227], sip_timestamp: ns(baseMs + 10) }, // AT_BID
    { price: 17.75, size: 1, conditions: [209, 232], sip_timestamp: ns(baseMs + 20) }, // MLET
  ];

  const rows = massiveTradesToRawTrades(trades, quotes, ctx);

  it("empareja BBO y clasifica agresor (compatible con aggressionOf)", () => {
    expect(rows[0].side).toBe("AT_ASK");
    expect(aggressionOf(rows[0].side)).toBe("ask");
    expect(rows[0].sentiment).toBe("bullish");
    expect(rows[1].side).toBe("AT_BID");
    expect(aggressionOf(rows[1].side)).toBe("bid");
    expect(rows[0].bid_price).toBe(16.9);
    expect(rows[0].ask_price).toBe(17.3);
  });

  it("detecta MULTILEG real (condición 232=MLET)", () => {
    expect(rows[2].trade_condition_id).toBe(232);
    expect(isMultiLegCondition(rows[2].trade_condition_id)).toBe(true);
  });

  it("calcula griegas reales + OCC + premium", () => {
    expect(rows[0].symbol).toBe("AAPL260724C00315000");
    expect(rows[0].premium).toBeCloseTo(17.3 * 40 * 100, 4);
    expect(rows[0].delta).toBeGreaterThan(0.5); // call ITM corto plazo
    expect(rows[0].implied_volatility).toBeGreaterThan(0);
    expect(rows[0].asset_price).toBeCloseTo(322.5, 6);
  });
});

describe("selectContracts", () => {
  const mk = (ticker: string, vol: number, close: number, strike = 300, ct = "call"): RawContract => ({
    details: { ticker, strike_price: strike, expiration_date: "2026-08-21", contract_type: ct },
    day: { volume: vol, close },
    open_interest: 1000,
  });

  it("descarta sin volumen y los incapaces de llegar a minPremium", () => {
    const contracts = [
      mk("O:A", 0, 10), // sin volumen → fuera
      mk("O:B", 5, 2), // 5×2×100 = $1,000 < $100k → fuera
      mk("O:C", 500, 5), // 500×5×100 = $250k ≥ $100k → entra
    ];
    const sel = selectContracts(contracts, 100_000, 60);
    expect(sel.map((s) => s.ticker)).toEqual(["O:C"]);
  });

  it("ordena por volumen y respeta el cap", () => {
    const contracts = [mk("O:A", 100, 50), mk("O:B", 300, 50), mk("O:C", 200, 50)];
    const sel = selectContracts(contracts, 0, 2);
    expect(sel.map((s) => s.ticker)).toEqual(["O:B", "O:C"]); // top-2 por volumen
  });

  it("mapea call/put y campos", () => {
    const sel = selectContracts([mk("O:P", 100, 50, 290, "put")], 0, 10);
    expect(sel[0]).toMatchObject({ ticker: "O:P", strike: 290, isCall: false, volume: 100 });
  });
});
