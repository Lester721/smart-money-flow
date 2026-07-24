import { describe, it, expect } from "vitest";
import {
  bsPrice,
  bsDelta,
  bsVega,
  bsTheta,
  impliedVol,
  tradeGreeks,
} from "./greeks";

describe("impliedVol", () => {
  it("recupera la IV con la que se generó el precio (round-trip)", () => {
    const [S, K, T, sigma] = [100, 100, 0.25, 0.3];
    const priceCall = bsPrice(S, K, T, sigma, true);
    const iv = impliedVol(priceCall, S, K, T, true);
    expect(iv).not.toBeNull();
    expect(iv!).toBeCloseTo(0.3, 3);
  });

  it("funciona igual para puts", () => {
    const [S, K, T, sigma] = [120, 130, 0.5, 0.45];
    const p = bsPrice(S, K, T, sigma, false);
    const iv = impliedVol(p, S, K, T, false);
    expect(iv!).toBeCloseTo(0.45, 3);
  });

  it("devuelve null si el precio está por debajo del intrínseco", () => {
    // Call con S=110, K=100 → intrínseco 10; precio 5 es imposible
    expect(impliedVol(5, 110, 100, 0.25, true)).toBeNull();
  });

  it("devuelve null con insumos inválidos (T<=0)", () => {
    expect(impliedVol(3, 100, 100, 0, true)).toBeNull();
  });
});

describe("bsDelta", () => {
  it("call ATM tiene delta cercana a 0.5", () => {
    const d = bsDelta(100, 100, 0.25, 0.3, true)!;
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(0.6);
  });

  it("cumple la paridad delta_put = delta_call − 1", () => {
    const [S, K, T, iv] = [105, 100, 0.3, 0.35];
    const dc = bsDelta(S, K, T, iv, true)!;
    const dp = bsDelta(S, K, T, iv, false)!;
    expect(dp).toBeCloseTo(dc - 1, 10);
  });

  it("call muy ITM → delta ~1; call muy OTM → delta ~0", () => {
    expect(bsDelta(200, 100, 0.25, 0.3, true)!).toBeGreaterThan(0.98);
    expect(bsDelta(50, 100, 0.25, 0.3, true)!).toBeLessThan(0.02);
  });

  it("devuelve null con insumos inválidos", () => {
    expect(bsDelta(0, 100, 0.25, 0.3, true)).toBeNull();
    expect(bsDelta(100, 100, -1, 0.3, true)).toBeNull();
  });
});

describe("vega y theta", () => {
  it("vega es positiva para una opción viva", () => {
    expect(bsVega(100, 100, 0.25, 0.3)).toBeGreaterThan(0);
  });
  it("theta (r=0) es negativa y igual para call y put", () => {
    const tc = bsTheta(100, 100, 0.25, 0.3, true);
    const tp = bsTheta(100, 100, 0.25, 0.3, false);
    expect(tc).toBeLessThan(0);
    expect(tc).toBeCloseTo(tp, 10);
  });
});

describe("tradeGreeks", () => {
  it("desde el precio de la operación devuelve un set consistente", () => {
    const [S, K, T, sigma] = [325, 320, 3 / 365, 0.35];
    const price = bsPrice(S, K, T, sigma, true);
    const g = tradeGreeks(price, S, K, T, true);
    expect(g.iv!).toBeCloseTo(0.35, 2);
    expect(g.delta!).toBeGreaterThan(0.5); // ITM call de corto plazo
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.vega).toBeGreaterThan(0);
    expect(g.theta).toBeLessThan(0);
  });

  it("precio imposible → todo null/0", () => {
    const g = tradeGreeks(1, 200, 100, 0.25, true); // precio < intrínseco (100)
    expect(g.iv).toBeNull();
    expect(g.delta).toBeNull();
  });
});
