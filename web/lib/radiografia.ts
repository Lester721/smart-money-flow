// RADIOGRAFÍA — mirar de qué está hecho un conjunto de datos ANTES de medir con él.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════════════════
//
// El 2026-08-16 se reportaron y retiraron TRES resultados en unas horas. Los tres tenían la
// estadística bien hecha. Los tres estaban medidos sobre datos que no podían contener la respuesta:
//
//   · "el flujo bate a su cubo +0,68% (t=17,6)"  → era la horquilla, 26% más estrecha en el flujo
//   · "aguantar calls largas da 3,54x"           → las que expiran sin valor DESAPARECEN de la caché
//   · "el OI lejos separa +27 puntos (t=5,59)"   → 570 de 573 valores eran CERO, porque el fichero
//                                                  de OI sólo guarda strikes a ±25% del precio
//
// El último es el que obliga a escribir esto. `oiLejos` medía "% del interés abierto en strikes
// >60% por encima". El descargador de OI filtra `Math.abs(k-s)/s > 0,25`. Un strike al +60% NO PUEDE
// estar en ese fichero. La t de 5,59 salía de comparar tres valores extremos contra 570 ceros.
//
// Lester, justo después: *"¿y qué vas a hacer para evitar este error?"* — y tiene razón en no
// aceptar "lo apunto como norma". Ese día ya se habían repetido dos errores que estaban apuntados
// como norma. Una regla que hay que recordar no es un arreglo. Un guardián que LANZA, sí.
//
// ═══ CÓMO SE USA ══════════════════════════════════════════════════════════════════════════
//
//   import { radiografia } from "../lib/radiografia";
//   radiografia(filas, ["oiLejos", "skew", "resultado"], "puente");   // ANTES de medir nada
//
// Lanza si un campo está muerto (todo cero, todo nulo, o sin variación). Imprime percentiles de
// los demás para que el que mira vea con qué está trabajando.

/** Qué se considera un campo muerto. Los valores por defecto son deliberadamente estrictos. */
export interface Umbrales {
  /** Fracción de ceros a partir de la cual el campo se considera muerto. */
  maxCeros?: number;
  /** Fracción de nulos/no-finitos a partir de la cual el campo se considera muerto. */
  maxNulos?: number;
  /** Nº mínimo de valores DISTINTOS. Un campo con 2 valores no ordena nada en tercios. */
  minDistintos?: number;
  /**
   * Campos donde el CERO es un resultado legítimo y esperable, no un hueco de datos.
   *
   * Hay que nombrarlos UNO A UNO y a propósito: la excepción no se concede por defecto ni se
   * consigue bajando `maxCeros`, porque entonces dejaría de proteger a los predictores.
   *
   * El caso que obligó a añadirlo (2026-08-16): al medir "comprar calls muy fuera del dinero y
   * aguantar" sobre 28 tickers —ya con perdedores dentro—, 778 de 1.356 meses dieron CERO EXACTO.
   * No es un fallo: es la tasa base real de la estrategia, la opción expira sin valor. Un pago de
   * lotería tiene el cero como resultado MODAL. El campo del RESULTADO puede estar lleno de ceros;
   * un PREDICTOR lleno de ceros sigue siendo un campo muerto.
   */
  cerosLegitimos?: string[];
}

const P = (v: number[], q: number) => v[Math.min(v.length - 1, Math.floor(v.length * q))];

/**
 * Radiografía de los campos indicados. **LANZA** si alguno está muerto.
 *
 * No es un aviso ni un console.warn: un campo muerto no da un resultado malo, da un resultado
 * PLAUSIBLE Y FALSO, que es peor. Se para aquí.
 */
export function radiografia<T extends object>(
  filas: T[],
  campos: (keyof T & string)[],
  nombre = "datos",
  u: Umbrales = {},
): void {
  const { maxCeros = 0.5, maxNulos = 0.5, minDistintos = 5, cerosLegitimos = [] } = u;
  if (!filas.length) throw new Error(`radiografía de "${nombre}": 0 filas. No hay nada que medir.`);

  const lineas: string[] = [];
  const muertos: string[] = [];

  for (const c of campos) {
    const crudos: unknown[] = filas.map((f) => f[c]);
    const nulos = crudos.filter((v) => v == null || (typeof v === "number" && !Number.isFinite(v))).length;
    const nums = crudos.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    const ceros = nums.filter((v) => v === 0).length;
    const distintos = new Set(nums).size;

    if (nulos >= filas.length * maxNulos)
      muertos.push(`"${c}": ${nulos} de ${filas.length} nulos o no finitos (${((nulos / filas.length) * 100).toFixed(1)}%)`);
    else if (nums.length && ceros >= nums.length * maxCeros && !cerosLegitimos.includes(c))
      muertos.push(`"${c}": ${ceros} de ${nums.length} son CERO EXACTO (${((ceros / nums.length) * 100).toFixed(1)}%)` +
                   ` — el descargador de este dato casi seguro filtra justo lo que quieres medir`);
    else if (nums.length && distintos < minDistintos)
      muertos.push(`"${c}": sólo ${distintos} valores distintos en ${nums.length} filas — no puede ordenar nada`);

    if (nums.length) {
      const s = [...nums].sort((a, b) => a - b);
      lineas.push(`  ${c.padEnd(14)} n=${String(nums.length).padStart(6)} · nulos ${String(nulos).padStart(5)} · ceros ${String(ceros).padStart(5)}` +
                  ` · min ${P(s, 0).toPrecision(3).padStart(10)} · p50 ${P(s, 0.5).toPrecision(3).padStart(10)} · max ${P(s, 1).toPrecision(3).padStart(10)}`);
    } else {
      lineas.push(`  ${c.padEnd(14)} SIN NINGÚN VALOR NUMÉRICO (${nulos} nulos de ${filas.length})`);
    }
  }

  console.log(`\n── radiografía de "${nombre}" · ${filas.length} filas ──`);
  for (const l of lineas) console.log(l);
  console.log("");

  if (muertos.length) {
    throw new Error(
      `radiografía de "${nombre}": ${muertos.length} campo(s) MUERTO(S). No se mide con esto.\n` +
      muertos.map((m) => `  ✗ ${m}`).join("\n") + `\n\n` +
      `  Un campo muerto no da un resultado malo: da uno PLAUSIBLE Y FALSO. El 2026-08-16 un campo\n` +
      `  con 570 ceros de 573 produjo una separación con t=5,59 que parecía el mejor hallazgo del\n` +
      `  proyecto. Antes de seguir: abrir el descargador de ese dato y leer sus filtros.`,
    );
  }
}
