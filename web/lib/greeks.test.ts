import { describe, it, expect } from "vitest";
import { bsVega, bsTheta, tradeGreeks } from "./greeks";
import { bsPriceHistorico as bsPrice } from "./PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS";

describe("tradeGreeks (wrapper sobre blackScholes)", () => {
  it("recupera la IV del precio y arma un set consistente (call ITM corto plazo)", () => {
    const [S, K, T, sigma] = [325, 320, 3 / 365, 0.35];
    const price = bsPrice(S, K, T, sigma, "call");
    const g = tradeGreeks(price, S, K, T, true);
    expect(g.iv!).toBeCloseTo(0.35, 2);
    expect(g.delta!).toBeGreaterThan(0.5);
    expect(g.delta!).toBeLessThan(1);
    expect(g.gamma).toBeGreaterThan(0);
    expect(g.vega).toBeGreaterThan(0);
    expect(g.theta).toBeLessThan(0);
  });

  it("funciona igual para puts (delta negativa)", () => {
    const [S, K, T, sigma] = [120, 130, 0.5, 0.45];
    const price = bsPrice(S, K, T, sigma, "put");
    const g = tradeGreeks(price, S, K, T, false);
    expect(g.iv!).toBeCloseTo(0.45, 2);
    expect(g.delta!).toBeLessThan(0);
  });

  it("deep-ITM que imprime bajo el intrínseco → delta límite ±1 (no null/0)", () => {
    // Put $335, subyacente $322 → intrínseco ~13; imprime a $8.50 (bajo intrínseco)
    const p = tradeGreeks(8.5, 322, 335, 3 / 365, false);
    expect(p.iv).toBeNull();
    expect(p.delta).toBe(-1);
    // Call deep-ITM análogo → +1
    const c = tradeGreeks(3, 200, 100, 0.25, true);
    expect(c.delta).toBe(1);
  });

  it("precio inválido y no deep-ITM → delta null", () => {
    const g = tradeGreeks(0, 100, 120, 0.25, true); // OTM, precio 0
    expect(g.iv).toBeNull();
    expect(g.delta).toBeNull();
  });
});

describe("vega y theta", () => {
  it("vega es positiva para una opción viva", () => {
    expect(bsVega(100, 100, 0.25, 0.3)).toBeGreaterThan(0);
    expect(bsVega(0, 100, 0.25, 0.3)).toBe(0); // insumos inválidos
  });
  it("theta es negativa (decaimiento de valor temporal), call y put", () => {
    expect(bsTheta(100, 100, 0.25, 0.3, true)).toBeLessThan(0);
    expect(bsTheta(100, 100, 0.25, 0.3, false)).toBeLessThan(0);
  });
});
