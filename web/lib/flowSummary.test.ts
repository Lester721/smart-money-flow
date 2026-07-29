import { describe, it, expect } from "vitest";
import { flowSummary } from "./flowSummary";
import type { AggressionScore, ConvictionScore, FlowRow } from "./flow";
import type { StructureScore } from "./structure";

const mk = (type: "call" | "put", aggression: "ask" | "bid" | "mid", premium: number): FlowRow =>
  ({ type, aggression, premium } as unknown as FlowRow);

const agg = (ratio: number): AggressionScore =>
  ({ score: Math.round(ratio * 10), ratio } as AggressionScore);
const conv = (score: number): ConvictionScore => ({ score } as ConvictionScore);
const lowLiq = (v: boolean): StructureScore =>
  ({ notional: { lowLiquidity: v } } as StructureScore);

describe("flowSummary", () => {
  it("null si no hay filas", () => {
    expect(flowSummary("AAPL", [], agg(0.5), conv(5), null)).toBeNull();
    expect(flowSummary("AAPL", null, agg(0.5), conv(5), null)).toBeNull();
  });

  it("compra de calls al ask → alcista", () => {
    const rows = [mk("call", "ask", 2e6), mk("call", "ask", 3e6)];
    const s = flowSummary("AAPL", rows, agg(0.9), conv(8), null)!;
    expect(s.lean).toBe("alcista");
    expect(s.text).toContain("ALCISTA");
    expect(s.text).toContain("calls");
  });

  it("compra de puts al ask → bajista", () => {
    const rows = [mk("put", "ask", 4e6), mk("put", "ask", 5e6)];
    const s = flowSummary("TSLA", rows, agg(0.85), conv(9), null)!;
    expect(s.lean).toBe("bajista");
    expect(s.dirScore).toBeLessThan(50); // marcador al lado bajista
    expect(s.text).toContain("BAJISTA");
    expect(s.text).toContain("puts");
    expect(s.text).toContain("pesado"); // $9M ≥ $5M
  });

  it("vender puts (al bid) también empuja alcista", () => {
    const rows = [mk("put", "bid", 3e6), mk("put", "bid", 3e6)];
    const s = flowSummary("NVDA", rows, agg(0.2), conv(6), null)!;
    expect(s.lean).toBe("alcista");
  });

  it("flujo balanceado → mixto", () => {
    const rows = [mk("call", "ask", 2e6), mk("put", "ask", 2e6)];
    const s = flowSummary("SPY", rows, agg(0.5), conv(4), null)!;
    expect(s.lean).toBe("mixto");
  });

  it("baja liquidez → warning; alta liquidez → sin warning", () => {
    const rows = [mk("call", "ask", 2e6)];
    expect(flowSummary("X", rows, agg(0.9), conv(7), lowLiq(true))!.warning).toContain("liquidez");
    expect(flowSummary("X", rows, agg(0.9), conv(7), lowLiq(false))!.warning).toBeNull();
  });
});
