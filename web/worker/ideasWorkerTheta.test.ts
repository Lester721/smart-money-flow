import { describe, it, expect } from "vitest";
import { pickByQuota, type Pick } from "./ideasWorkerTheta";

// ThetaData Standard solo deja suscribir ~10.000 contratos con quote (y sin quote no hay
// NBBO ni agresor). Elegirlos es, literalmente, decidir QUÉ VE Ideas. El riesgo real:
// SPY/QQQ tienen un open interest enorme y, ordenando solo por OI, se llevarían todos los
// cupos → Ideas ciega en el resto del mercado. Estos tests protegen ese reparto.

/** Genera `n` contratos de un símbolo con OI descendente desde `oiTop`. */
function picks(root: string, n: number, oiTop: number): Pick[] {
  return Array.from({ length: n }, (_, i) => ({
    root, expYmd: 20250117, strike: 100 + i, right: "C" as const, oi: oiTop - i,
  }));
}

describe("pickByQuota (reparto de cupos de Ideas)", () => {
  it("reparte la cuota pareja entre los símbolos", () => {
    const m = new Map([["AAPL", picks("AAPL", 50, 1000)], ["NVDA", picks("NVDA", 50, 900)], ["MSFT", picks("MSFT", 50, 800)]]);
    const out = pickByQuota(m, 30);
    expect(out).toHaveLength(30);
    for (const s of ["AAPL", "NVDA", "MSFT"]) {
      expect(out.filter((p) => p.root === s)).toHaveLength(10);
    }
  });

  it("NO deja que un símbolo de OI gigante acapare los cupos (la razón de existir)", () => {
    // SPY con OI 100x el de los demás: sin cuota se llevaría prácticamente todo.
    const m = new Map([
      ["SPY", picks("SPY", 500, 1_000_000)],
      ["HOOD", picks("HOOD", 500, 5_000)],
      ["SOFI", picks("SOFI", 500, 4_000)],
      ["F", picks("F", 500, 3_000)],
    ]);
    const out = pickByQuota(m, 100);
    const spy = out.filter((p) => p.root === "SPY").length;
    expect(spy).toBeLessThan(out.length); // no se lo lleva todo
    // cada símbolo conserva al menos su cuota (100/4 = 25)
    for (const s of ["HOOD", "SOFI", "F"]) {
      expect(out.filter((p) => p.root === s).length).toBeGreaterThanOrEqual(25);
    }
  });

  it("rellena los cupos que sobran con los de mayor OI global", () => {
    // 2 símbolos, max 25 → cuota = floor(25/2) = 12. NVDA solo tiene 5 contratos, así que
    // aporta 5 y deja 8 cupos libres: deben ir a los de más OI (AAPL), sin desperdiciarse.
    const m = new Map([["AAPL", picks("AAPL", 40, 9_000)], ["NVDA", picks("NVDA", 5, 100)]]);
    const out = pickByQuota(m, 25);
    expect(out).toHaveLength(25); // no se pierde ningún cupo
    expect(out.filter((p) => p.root === "NVDA").length).toBe(5);  // todo lo que tenía
    expect(out.filter((p) => p.root === "AAPL").length).toBe(20); // 12 de cuota + 8 de relleno
  });

  it("nunca excede el máximo ni repite contratos", () => {
    const m = new Map([["AAPL", picks("AAPL", 200, 500)], ["NVDA", picks("NVDA", 200, 400)]]);
    const out = pickByQuota(m, 37);
    expect(out.length).toBeLessThanOrEqual(37);
    const claves = out.map((p) => `${p.root}|${p.expYmd}|${p.strike}|${p.right}`);
    expect(new Set(claves).size).toBe(out.length);
  });

  it("aguanta símbolos con menos contratos que la cuota (sin inventar ni romper)", () => {
    const m = new Map([["AAPL", picks("AAPL", 3, 100)], ["NVDA", picks("NVDA", 100, 90)]]);
    const out = pickByQuota(m, 50);
    expect(out.filter((p) => p.root === "AAPL")).toHaveLength(3); // solo los que existen
    expect(out.length).toBeLessThanOrEqual(50);
  });

  it("casos borde: mapa vacío o máximo 0", () => {
    expect(pickByQuota(new Map(), 100)).toEqual([]);
    expect(pickByQuota(new Map([["AAPL", picks("AAPL", 10, 100)]]), 0)).toEqual([]);
  });
});
