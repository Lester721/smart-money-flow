// La prueba de la barrera es que HABRÍA TUMBADO el hallazgo que se me escapó.
//
// No basta con que la función compile: tiene que rechazar exactamente los casos que en agosto
// llegaron a Lester como "hallazgo fuerte" y resultaron ser ruido. Cada test de aquí reproduce
// un error real del proyecto.

import { describe, it, expect } from "vitest";
import { pasarBarrera, listonT, comprobarDescarte, type FilaHallazgo } from "./barreraHallazgos";

/** Genera filas con una separación controlada entre el tercio alto y el bajo por criterio. */
function filas(opciones: {
  n: number; tickers: string[]; desde: string; dias: number;
  /** Separación por período: [1er tercio, 2º, 3º]. Positiva = el criterio alto rinde más. */
  sepPorTercio: [number, number, number];
}): FilaHallazgo[] {
  const { n, tickers, desde, dias, sepPorTercio } = opciones;
  const out: FilaHallazgo[] = [];
  const base = Date.parse(desde + "T00:00:00Z");
  for (let i = 0; i < n; i++) {
    const t = Math.floor((i / n) * 3);                       // en qué tercio de tiempo cae
    const sep = sepPorTercio[Math.min(t, 2)];
    const criterio = i % 3;                                   // 0 bajo, 1 medio, 2 alto
    const señal = criterio === 2 ? sep / 2 : criterio === 0 ? -sep / 2 : 0;
    // Ruido determinista, para que el test no dependa del azar.
    const ruido = ((i * 2654435761) % 1000) / 1000 * 0.02 - 0.01;
    out.push({
      pnl: señal + ruido,
      ticker: tickers[i % tickers.length],
      fecha: new Date(base + Math.floor((i / n) * dias) * 86_400_000).toISOString().slice(0, 10),
    });
  }
  return out;
}
/** El criterio es el índice: recrea el orden con el que se generó la señal. */
const criterio = (_f: FilaHallazgo, i?: number) => i ?? 0;
const porPnlSimulado = (fs: FilaHallazgo[]) => {
  const idx = new Map(fs.map((f, i) => [f, i % 3]));
  return (f: FilaHallazgo) => idx.get(f) ?? 0;
};

describe("la barrera rechaza lo que en agosto pasó por hallazgo", () => {
  it("TUMBA el efecto que sólo vive en el último tercio (el caso de la inusualidad)", () => {
    // Negativo en los 10 primeros meses, fuerte en las últimas semanas: exactamente lo que pasó.
    const fs = filas({ n: 1500, tickers: ["A", "B", "C", "D", "E"], desde: "2025-08-14", dias: 365,
                       sepPorTercio: [-0.05, 0.02, 0.26] });
    const v = pasarBarrera(fs, porPnlSimulado(fs), { pruebas: 8 });
    expect(v.pasa).toBe(false);
    expect(v.motivos.join(" ")).toMatch(/no se repite en los tres tercios/i);
  });

  it("TUMBA el efecto concentrado en un solo activo (el caso de NFLX al 25%)", () => {
    const fs = filas({ n: 1200, tickers: ["NFLX", "NFLX", "NFLX", "B", "C"], desde: "2025-08-14",
                       dias: 365, sepPorTercio: [0.2, 0.2, 0.2] });
    const v = pasarBarrera(fs, porPnlSimulado(fs), { pruebas: 8 });
    expect(v.pasa).toBe(false);
    expect(v.motivos.join(" ")).toMatch(/NFLX es el .* de la muestra/);
  });

  it("TUMBA la muestra pequeña (el caso del cóndor con 4 operaciones)", () => {
    const fs = filas({ n: 30, tickers: ["A", "B", "C"], desde: "2026-08-01", dias: 10,
                       sepPorTercio: [0.3, 0.3, 0.3] });
    const v = pasarBarrera(fs, porPnlSimulado(fs), { pruebas: 8 });
    expect(v.pasa).toBe(false);
    expect(v.motivos.join(" ")).toMatch(/muestra de 30/);
  });

  it("TUMBA lo que no llega al listón de Bonferroni con muchas pruebas", () => {
    // Separación real pero pequeña: pasaría con una sola prueba, no con treinta.
    const fs = filas({ n: 1200, tickers: ["A", "B", "C", "D", "E"], desde: "2025-08-14", dias: 365,
                       sepPorTercio: [0.004, 0.004, 0.004] });
    const conUna = pasarBarrera(fs, porPnlSimulado(fs), { pruebas: 1 });
    const conTreinta = pasarBarrera(fs, porPnlSimulado(fs), { pruebas: 30 });
    expect(conTreinta.detalle.listonT).toBeGreaterThan(conUna.detalle.listonT);
  });

  it("DEJA PASAR lo que es estable en tiempo, repartido y significativo", () => {
    const fs = filas({ n: 1500, tickers: ["A", "B", "C", "D", "E", "F"], desde: "2025-08-14",
                       dias: 365, sepPorTercio: [0.2, 0.22, 0.19] });
    const v = pasarBarrera(fs, porPnlSimulado(fs), { pruebas: 8 });
    expect(v.pasa).toBe(true);
    expect(v.motivos).toEqual([]);
    expect(v.aprobadas.length).toBe(4);
  });
});

describe("el listón sube con el número de pruebas", () => {
  it("con una prueba es 2; con muchas, bastante más", () => {
    expect(listonT(1)).toBe(2);
    expect(listonT(8)).toBeGreaterThan(2.6);
    expect(listonT(30)).toBeGreaterThan(3.1);
    expect(listonT(30)).toBeGreaterThan(listonT(8));
  });
});

describe("un filtro que descarta casi todo es un bug (el caso de r.symbol)", () => {
  it("lanza excepción cuando el descarte se come el 100%", () => {
    expect(() => comprobarDescarte(933, 0, "salida a precio real")).toThrow(/NO es un resultado, es un bug/);
  });
  it("lanza también con el 95%, no sólo con el 100%", () => {
    expect(() => comprobarDescarte(1000, 50, "cotización de salida")).toThrow(/descartó 950 de 1000/);
  });
  it("deja pasar un descarte normal", () => {
    expect(() => comprobarDescarte(1000, 800, "sin bid/ask")).not.toThrow();
  });
});
