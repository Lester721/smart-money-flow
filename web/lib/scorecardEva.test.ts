import { describe, it, expect } from "vitest";
import {
  EVA_WEIGHTS, classifyIntent, evaVetos, evaModifiers, verdictFor, evaScore,
  type EvaScores, type VetoInputs, type ModifierInputs,
} from "./scorecardEva";

const OK_VETO: VetoInputs = { totalOI: 5000, volume: 1000, ivRank: 40, dte: 45 };
const NO_MODS: ModifierInputs = { intentIndeterminate: false, wideSpread: false, lowLiquidity: false, earningsWithinDte: false, gexConfluence: false };
const allScores = (n: number): EvaScores => ({
  aggression: n, conviction: n, unusuality: n, structure: n, ivContext: n, validation: n,
});

describe("EVA_WEIGHTS", () => {
  it("suman 100 y Convicción pesa más que Agresividad (recalibración)", () => {
    const total = Object.values(EVA_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(total).toBe(100);
    expect(EVA_WEIGHTS.conviction).toBeGreaterThan(EVA_WEIGHTS.aggression);
  });
});

describe("classifyIntent", () => {
  it("compra agresiva con Vol>OI = BTO (call alcista, put bajista)", () => {
    expect(classifyIntent("ABOVE_ASK", true, true)).toEqual({ intent: "BTO", bias: "alcista" });
    expect(classifyIntent("AT_ASK", true, false)).toEqual({ intent: "BTO", bias: "bajista" });
  });
  it("venta agresiva = STO (venta de prima: call bajista, put alcista)", () => {
    expect(classifyIntent("BELOW_BID", false, true)).toEqual({ intent: "STO", bias: "bajista" });
    expect(classifyIntent("AT_BID", false, false)).toEqual({ intent: "STO", bias: "alcista" });
  });
  it("mid o sin exceededOI en compra = indeterminado", () => {
    expect(classifyIntent("MIDMKT", true, true).intent).toBe("indeterminado");
    expect(classifyIntent("AT_ASK", false, true).intent).toBe("indeterminado");
  });
});

describe("evaVetos", () => {
  it("sin problemas → sin vetos", () => {
    expect(evaVetos(OK_VETO)).toEqual([]);
  });
  it("OI bajo, volumen bajo, IVRank extremo + DTE corto (spread ya NO vetea)", () => {
    expect(evaVetos({ ...OK_VETO, totalOI: 100 })).toContain("OI<250");
    expect(evaVetos({ ...OK_VETO, volume: 50 })).toContain("volumen<100");
    expect(evaVetos({ ...OK_VETO, ivRank: 100, dte: 7 })).toContain("IVRank100+DTE<14");
  });
  it("IVRank 100 pero DTE largo NO vetea", () => {
    expect(evaVetos({ ...OK_VETO, ivRank: 100, dte: 30 })).toEqual([]);
  });
});

describe("evaModifiers", () => {
  it("acumula factores; spread ancho ×0.60 tiene prioridad sobre baja liquidez", () => {
    expect(evaModifiers({ ...NO_MODS }).factor).toBe(1);
    expect(evaModifiers({ ...NO_MODS, lowLiquidity: true }).factor).toBeCloseTo(0.7);
    expect(evaModifiers({ ...NO_MODS, wideSpread: true }).factor).toBeCloseTo(0.6);
    expect(evaModifiers({ ...NO_MODS, wideSpread: true, lowLiquidity: true }).factor).toBeCloseTo(0.6);
    expect(evaModifiers({ ...NO_MODS, gexConfluence: true }).factor).toBeCloseTo(1.1);
    expect(evaModifiers({ ...NO_MODS, intentIndeterminate: true, wideSpread: true }).factor).toBeCloseTo(0.48);
  });
});

describe("verdictFor", () => {
  it("bandas de decisión del spec", () => {
    expect(verdictFor(90)).toEqual({ verdict: "CONVICCION_ALTA", sizeR: 1.0 });
    expect(verdictFor(75)).toEqual({ verdict: "CONVICCION_MEDIA", sizeR: 0.5 });
    expect(verdictFor(60)).toEqual({ verdict: "OBSERVACION", sizeR: 0 });
    expect(verdictFor(40)).toEqual({ verdict: "DESCARTE", sizeR: 0 });
  });
});

describe("evaScore", () => {
  it("scores altos, sin vetos ni modificadores → alta convicción", () => {
    const r = evaScore(allScores(9), OK_VETO, NO_MODS);
    expect(r.composite).toBe(90);
    expect(r.verdict).toBe("CONVICCION_ALTA");
    expect(r.vetoed).toBe(false);
  });
  it("un veto (OI bajo) fuerza composite 0 y DESCARTE, sin importar los scores", () => {
    const r = evaScore(allScores(10), { ...OK_VETO, totalOI: 100 }, NO_MODS);
    expect(r.composite).toBe(0);
    expect(r.vetoed).toBe(true);
    expect(r.vetos).toContain("OI<250");
    expect(r.verdict).toBe("DESCARTE");
  });
  it("spread ancho ahora PENALIZA (no vetea): baja el score pero no lo mata", () => {
    const r = evaScore(allScores(9), OK_VETO, { ...NO_MODS, wideSpread: true });
    expect(r.vetoed).toBe(false);
    expect(r.composite).toBeCloseTo(54); // 90 × 0.60
  });
  it("modificador de baja liquidez recorta el score (×0.70)", () => {
    const base = evaScore(allScores(8), OK_VETO, NO_MODS).composite; // 80
    const mod = evaScore(allScores(8), OK_VETO, { ...NO_MODS, lowLiquidity: true }).composite;
    expect(base).toBe(80);
    expect(mod).toBeCloseTo(56);
  });
  it("normaliza por peso activo: si falta una categoría, sigue 0-100", () => {
    const r = evaScore({ ...allScores(10), validation: null }, OK_VETO, NO_MODS);
    expect(r.composite).toBe(100);
    expect(r.activeWeight).toBe(90);
  });
  it("confluencia GEX topa en 100", () => {
    const r = evaScore(allScores(10), OK_VETO, { ...NO_MODS, gexConfluence: true });
    expect(r.composite).toBe(100);
  });
});
