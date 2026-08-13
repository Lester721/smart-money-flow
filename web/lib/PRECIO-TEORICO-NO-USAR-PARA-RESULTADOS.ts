// ⛔ PRECIO TEÓRICO — NO USAR PARA NINGÚN RESULTADO ⛔
//
// Este archivo se llama así a propósito. Si aparece en un diff, es una bandera roja.
//
// ╔═══ QUÉ PASÓ ═══╗
// Durante meses los backtests y forward-tests valoraron las opciones con Black-Scholes
// alimentado con la volatilidad REALIZADA. En una estrategia de vender prima el dinero sale
// exactamente del hueco entre la implícita —lo que te pagan— y la realizada —lo que de verdad
// se movió. Meter la realizada como si fuera la implícita ASUME QUE ESE HUECO ES CERO. El
// backtest deja de medir el mercado y pasa a devolverte tu propio supuesto disfrazado de
// resultado.
//
// Coste real: el credit spread daba +3,20%. Con precios reales daba −2,53%. Los cinco puntos
// de diferencia ERAN el supuesto. Meses de trabajo encima de una fantasía, y no lo detectó
// ninguna auditoría — salió de una pregunta suelta de Lester.
//
// ╔═══ EL ÚNICO USO LEGÍTIMO ═══╗
// Medir CUÁNTO miente el modelo, poniéndolo al lado del precio real. Eso es lo que hace
// scripts/cs-precios-reales.ts y es como se le pudo poner número al daño.
//
// Nunca para calcular un crédito, una prima, un valor de salida ni un P&L. Si el número es la
// fuente del beneficio, tiene que ser una cotización real: bid y ask, cruzando la horquilla.
//
// ╔═══ EL CERROJO ═══╗
// La función exige un flag explícito. Usarla por descuido es imposible; usarla a propósito
// queda escrito en el código y se ve en la revisión.
//
// Y hay un test —lib/sin-precios-de-modelo.test.ts— que FALLA si cualquier backtest o
// forward-test importa esto. Esa es la barrera de verdad: no depende de que nadie se acuerde.

import { normCdf } from "./expectedMove";
import { RISK_FREE, type OptionType } from "./blackScholes";

/**
 * Precio teórico de una europea. **Sólo para comparar contra un precio real.**
 *
 * Lanza si no se le pasa `{ soloParaComparar: true }`. El flag no es burocracia: obliga a que
 * quien lo use lo escriba, y así queda visible en el diff para siempre.
 */
/**
 * ⛔ ATAJO PARA SCRIPTS HISTÓRICOS YA CONTAMINADOS. No usar en nada nuevo.
 *
 * Existe sólo para que los ~22 backtests viejos sigan compilando —si no, `next build` falla y
 * no se despliega la web—. Sus resultados NO son válidos: valoran con modelo.
 *
 * Que un script importe esto es la marca de que sus números no valen. El test
 * `lib/sin-precios-de-modelo.test.ts` los enumera, y la lista sólo debe encoger.
 *
 * @deprecated Arreglar el script con bid/ask reales y quitar este import.
 */
export function bsPriceHistorico(
  spot: number, strike: number, T: number, iv: number, type: OptionType, r = RISK_FREE,
): number {
  return precioTeorico(spot, strike, T, iv, type,
    { soloParaComparar: true, porQue: "script histórico contaminado; resultado NO válido" }, r);
}

export function precioTeorico(
  spot: number, strike: number, T: number, iv: number, type: OptionType,
  opciones: { soloParaComparar: true; porQue: string },
  r = RISK_FREE,
): number {
  if (!opciones?.soloParaComparar) {
    throw new Error(
      "precioTeorico() sólo vale para COMPARAR contra un precio real. Un resultado (crédito, " +
      "prima, P&L) tiene que salir de bid/ask reales. Si has llegado aquí buscando un precio " +
      "para operar o para un backtest, la respuesta es bajar la cotización, no modelarla.",
    );
  }
  if (!opciones.porQue) throw new Error("precioTeorico() exige `porQue`: contra qué precio real se compara.");
  if (!(spot > 0) || !(strike > 0) || !(T > 0) || !(iv > 0)) return 0;
  const d1 = (Math.log(spot / strike) + (r + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);
  const disc = strike * Math.exp(-r * T);
  return type === "call"
    ? spot * normCdf(d1) - disc * normCdf(d2)
    : disc * normCdf(-d2) - spot * normCdf(-d1);
}
