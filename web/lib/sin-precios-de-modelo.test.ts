// LA BARRERA — que ningún resultado vuelva a salir de un modelo.
//
// Este test existe porque una regla que hay que recordar no es una barrera. Durante meses los
// backtests y forward-tests valoraron opciones con Black-Scholes alimentado con volatilidad
// REALIZADA. En venta de prima el dinero sale del hueco entre la implícita y la realizada;
// meterle la realizada asume que ese hueco es cero y el backtest te devuelve tu propio supuesto
// disfrazado de resultado. El credit spread pasó de +3,20% a −2,53% al usar precios reales.
//
// No lo detectó ninguna auditoría. Salió de una pregunta suelta de Lester.
//
// Lo que hace este test: enumerar los archivos que valoran con modelo. **La lista sólo puede
// ENCOGER.** Si alguien añade uno nuevo, el test falla y hay que justificarlo por escrito.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(import.meta.dirname, "..");
const MODULO = "PRECIO-TEORICO-NO-USAR-PARA-RESULTADOS";

/**
 * Archivos que TODAVÍA valoran con modelo. Son deuda conocida, no permiso.
 *
 * Los tres forward-tests están PARADOS a propósito (se niegan a correr) hasta que su valoración
 * diaria use quoteCierre(). Los demás son backtests históricos cuyos resultados NO son válidos.
 *
 * Para quitar uno de aquí: que use bid/ask reales. Para añadir uno: explicar por qué, aquí.
 */
const DEUDA_CONOCIDA = new Set([
  // parados, no registran nada
  "scripts/forward-ideas.ts",   // parado: depende de los pesos de EVA, pendientes de revisar
  // forward-wheel.ts SALIÓ de aquí el 2026-08-13: ya usa putReal/valorPutReal (bid al vender,
  // ask al recomprar). Esta lista sólo encoge.
  // backtests históricos: resultados no válidos
  "scripts/backtest-composite.ts", "scripts/backtest-eva-vs-victor.ts",
  "scripts/backtest-management.ts", "scripts/backtest-mgmt-spread.ts",
  "scripts/backtest-oos.ts", "scripts/backtest-pnl.ts", "scripts/backtest-regimen-oos.ts",
  "scripts/backtest-strategy.ts", "scripts/backtest-wheel.ts",
  "scripts/mejora-2b-gex.ts", "scripts/mejora-2c-gex-expiracion.ts",
  "scripts/mejora-7-distancia.ts", "scripts/odte-2-backtest.ts",
  "scripts/odte-3-momentum-lester.ts", "scripts/odte-forward.ts",
  // usos legítimos: comparan el modelo CONTRA el precio real para medir cuánto miente
  "scripts/cs-precios-reales.ts", "scripts/validar-precio-real.ts",
  // librerías que alimentan a los backtests de arriba
  "lib/backtestCore.ts", "lib/ironCondor.ts", "lib/wheel.ts",
  // los tests del propio módulo
  "lib/blackScholes.test.ts", "lib/greeks.test.ts",
]);

function recorrer(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "data" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) recorrer(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

describe("ningún resultado sale de un modelo", () => {
  // Se busca el IMPORT, no la mención: varios archivos nombran el módulo en un comentario para
  // explicar por qué NO lo usan, y eso no es valorar con modelo.
  const importa = (s: string) => new RegExp(`^\\s*import[^\\n]*${MODULO}`, "m").test(s);
  const culpables = recorrer(RAIZ)
    .filter((p) => !p.includes(MODULO) && !p.endsWith("sin-precios-de-modelo.test.ts"))
    .filter((p) => importa(readFileSync(p, "utf8")))
    .map((p) => p.slice(RAIZ.length + 1).replace(/\\/g, "/"));

  it("no aparecen archivos nuevos que valoren con modelo", () => {
    const nuevos = culpables.filter((f) => !DEUDA_CONOCIDA.has(f));
    expect(nuevos, `\nEstos valoran con modelo y NO estaban en la lista:\n  ${nuevos.join("\n  ")}\n\n` +
      "Si es un resultado (crédito, prima, P&L), tiene que salir de bid/ask reales.\n" +
      "Si de verdad es sólo para comparar contra un precio real, añádelo a DEUDA_CONOCIDA " +
      "explicando por qué.\n").toEqual([]);
  });

  it("la lista sólo encoge: no quedan entradas muertas", () => {
    const muertas = [...DEUDA_CONOCIDA].filter((f) => !culpables.includes(f));
    expect(muertas, `\nYa no valoran con modelo — quítalos de DEUDA_CONOCIDA:\n  ${muertas.join("\n  ")}\n`)
      .toEqual([]);
  });

  it("los tres forward-tests siguen parados mientras valoren con modelo", () => {
    for (const f of ["scripts/forward-ideas.ts"]) {
      const s = readFileSync(join(RAIZ, f), "utf8");
      if (!s.includes(MODULO)) continue;          // ya arreglado: no hace falta el freno
      expect(s, `${f} valora con modelo pero NO tiene el freno que impide que registre`)
        .toContain("PARADO");
    }
  });
});
