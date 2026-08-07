import { describe, it, expect } from "vitest";
import { occFor, monthChunks, resolverSubyacente, segmentosPorSimbolo } from "./thetadata";
import { parseOcc } from "./occ";

// El cliente de ThetaData construye los símbolos OCC a mano. Si el formato se desvía
// aunque sea un dígito, parseOcc devuelve null y TODO el pipeline (Ideas, flujo, griegas)
// se rompe en silencio: los trades se descartan sin error. De ahí estos tests.
describe("occFor (símbolo OCC)", () => {
  it("arma el formato canónico ROOT+YYMMDD+C/P+strike*1000 a 8 dígitos", () => {
    expect(occFor("AAPL", "2024-11-08", 220, true)).toBe("AAPL241108C00220000");
    expect(occFor("TSLA", "2026-11-20", 305, false)).toBe("TSLA261120P00305000");
  });

  it("preserva strikes fraccionarios (medios y cuartos de punto)", () => {
    expect(occFor("AAPL", "2024-11-15", 222.5, true)).toBe("AAPL241115C00222500");
    expect(occFor("SPY", "2025-01-17", 601.25, false)).toBe("SPY250117P00601250");
  });

  it("rellena a 8 dígitos con strikes chicos y aguanta strikes de índice", () => {
    expect(occFor("F", "2025-06-20", 5.5, true)).toBe("F250620C00005500");
    expect(occFor("SPX", "2025-03-21", 4800, true)).toBe("SPX250321C04800000");
  });

  it("hace round-trip con parseOcc — el invariante que sostiene el pipeline", () => {
    const casos: Array<[string, string, number, boolean]> = [
      ["AAPL", "2024-11-08", 220, true],
      ["NVDA", "2025-01-17", 137.5, false],
      ["F", "2025-06-20", 5.5, true],
      ["SPX", "2025-03-21", 4800, true],
    ];
    for (const [root, exp, strike, isCall] of casos) {
      const info = parseOcc(occFor(root, exp, strike, isCall));
      expect(info, `parseOcc no pudo leer ${root} ${exp} ${strike}`).not.toBeNull();
      expect(info!.underlying).toBe(root);
      expect(info!.expiration).toBe(exp);
      expect(info!.strike).toBe(strike);
      expect(info!.type).toBe(isCall ? "call" : "put");
    }
  });
});

// ThetaData rechaza rangos históricos de más de 1 mes ("Bulk history requests are limited to
// no more than 1 month"), así que troceamos. Si un trozo se pasa de 28 días la llamada falla
// entera; si quedan huecos, se pierden días de flujo sin que nadie lo note.
describe("monthChunks (troceo de rangos)", () => {
  it("deja un solo trozo cuando el rango cabe", () => {
    expect(monthChunks("20240101", "20240101")).toEqual([["20240101", "20240101"]]);
    expect(monthChunks("20240101", "20240128")).toEqual([["20240101", "20240128"]]);
  });

  it("parte en cuanto se pasa de 28 días", () => {
    const c = monthChunks("20240101", "20240129");
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual(["20240101", "20240128"]);
    expect(c[1]).toEqual(["20240129", "20240129"]);
  });

  it("ningún trozo excede el límite de 1 mes de ThetaData", () => {
    const ms = (y: string) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
    for (const [s, e] of monthChunks("20190101", "20221231")) {
      const dias = (ms(e) - ms(s)) / 86_400_000 + 1;
      expect(dias).toBeLessThanOrEqual(28);
      expect(dias).toBeGreaterThan(0);
    }
  });

  it("cubre el rango completo, contiguo y sin solapes", () => {
    const chunks = monthChunks("20240101", "20241231");
    expect(chunks[0][0]).toBe("20240101");
    expect(chunks[chunks.length - 1][1]).toBe("20241231");
    const ms = (y: string) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
    for (let i = 1; i < chunks.length; i++) {
      // cada trozo empieza justo al día siguiente del anterior: sin huecos ni repeticiones
      expect(ms(chunks[i][0]) - ms(chunks[i - 1][1])).toBe(86_400_000);
    }
  });

  it("cruza fin de año sin romperse", () => {
    const c = monthChunks("20241220", "20250120");
    expect(c[0][0]).toBe("20241220");
    expect(c[c.length - 1][1]).toBe("20250120");
    expect(c.length).toBeGreaterThan(1);
  });
});

// SPX y SPXW se cayeron de TODAS las corridas del forward-test de Ideas durante días: se
// pedían a `/v3/stock/...` y un índice no es una acción. El error se tragaba en silencio, así
// que parecían el mismo hipo pasajero que un ticker throttleado. De ahí estos tests.
describe("resolverSubyacente (índices vs acciones)", () => {
  it("las raíces semanales apuntan a su índice base", () => {
    expect(resolverSubyacente("SPXW")).toEqual({ symbol: "SPX", esIndice: true });
    expect(resolverSubyacente("NDXP")).toEqual({ symbol: "NDX", esIndice: true });
  });

  it("los índices se marcan como índice", () => {
    for (const s of ["SPX", "NDX", "RUT", "VIX", "XSP"]) {
      expect(resolverSubyacente(s).esIndice).toBe(true);
    }
  });

  it("las acciones pasan intactas y NO se marcan como índice", () => {
    // Ojo con SPY: es un ETF que sigue al SPX, pero cotiza como acción. Marcarlo como índice
    // lo mandaría a la ruta equivocada y lo volvería a tirar del ledger.
    for (const s of ["SPY", "QQQ", "AAPL", "NVDA", "GLD", "MU", "HOOD"]) {
      expect(resolverSubyacente(s)).toEqual({ symbol: s, esIndice: false });
    }
  });
});

// META perdió su 2021 ENTERO en una corrida (2026-08-07) y solo se notó porque el log decía
// "5 años" donde debía decir 6: Facebook se renombró a Meta el 2022-06-09, y pedir META en
// 2021 devuelve "No data found". Para un backtest de 10 años serían SEIS años perdidos.
describe("segmentosPorSimbolo (empresas que cambiaron de nombre)", () => {
  it("un rango entero antes del cambio va con el nombre viejo", () => {
    expect(segmentosPorSimbolo("META", "20210101", "20211231"))
      .toEqual([{ symbol: "FB", start: "20210101", end: "20211231" }]);
  });

  it("un rango entero después del cambio va con el nombre nuevo", () => {
    expect(segmentosPorSimbolo("META", "20230101", "20231231"))
      .toEqual([{ symbol: "META", start: "20230101", end: "20231231" }]);
  });

  it("un rango que CRUZA el cambio se parte en dos, sin huecos ni solapes", () => {
    const s = segmentosPorSimbolo("META", "20220101", "20221231");
    expect(s).toEqual([
      { symbol: "FB", start: "20220101", end: "20220608" },
      { symbol: "META", start: "20220609", end: "20221231" },
    ]);
  });

  it("la víspera se calcula con fechas reales, no restando 1 al número", () => {
    // Restar 1 a 20220609 da 20220608 y parece correcto, pero con un cambio a día 1 daría
    // 20220100 — que no es un día y rompe el troceado mensual aguas abajo.
    const [viejo] = segmentosPorSimbolo("META", "20220101", "20221231");
    expect(viejo.end).toMatch(/^\d{4}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/);
  });

  it("un ticker que nunca cambió de nombre sale de una pieza", () => {
    expect(segmentosPorSimbolo("AAPL", "20160101", "20261231"))
      .toEqual([{ symbol: "AAPL", start: "20160101", end: "20261231" }]);
  });
});
