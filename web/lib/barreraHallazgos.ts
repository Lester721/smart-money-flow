// LA BARRERA — ningún hallazgo se reporta sin pasar sus cribas.
//
// POR QUÉ EXISTE. El 2026-08-14 le presenté a Lester un hallazgo con t=5,64, monótono y coherente
// en las dos mitades del período. Lo di por fuerte. Al ampliar la muestra resultó que **vivía en
// dos semanas y en un solo ticker**: NFLX era el 25% de los datos y el último tercio del tiempo
// daba t=7,43 mientras los otros dos daban 1,74 y 0,80.
//
// Lo cacé yo mismo, pero horas después y por casualidad. Y esa es la cuestión: **las cribas que
// lo habrían tumbado en el primer minuto ya las conocía**. No fallé por no saber, fallé por no
// aplicarlas antes de hablar.
//
// Su reproche, textual (2026-08-15):
//
//   "yo jodiéndome aquí para que tú, que se supone que conoces todo, se te ocurra fastidiar las
//    pruebas y tires mi esfuerzo al piso"
//
// Tiene razón, y una promesa de tener más cuidado no vale nada. Por eso esto NO es una guía: es
// una función que **se niega a devolver un hallazgo** si no pasa. Igual que
// `sin-precios-de-modelo.test.ts` no depende de que nadie recuerde no usar Black-Scholes.
//
// LAS CUATRO CRIBAS, y de dónde salió cada una:
//   1. MUESTRA        — n mínimo. Con 4 operaciones no se concluye nada (el cóndor).
//   2. CONCENTRACIÓN  — ningún activo por encima del 20%. De aquí murió el filtro de IV (sólo
//                       funcionaba en HOOD) y casi la Wheel.
//   3. TERCIOS        — el signo se repite en los TRES tercios de tiempo. Partir en dos MITADES
//                       aprobaba el hallazgo de la inusualidad; partir en tres lo mató.
//   4. ESTADÍSTICO    — |t| contra el listón de Bonferroni según cuántas pruebas se hicieron.
//                       Un t de 6,7 en un período pasó a −3,8 en el siguiente.

export interface FilaHallazgo {
  /** El resultado que se mide (retorno por operación, P&L, lo que sea). */
  pnl: number;
  /** Activo. Sirve para la criba de concentración. */
  ticker: string;
  /** AAAA-MM-DD. Sirve para la criba de tercios. */
  fecha: string;
}

export interface Veredicto {
  /** `false` = NO se puede reportar como hallazgo. Es lo único que importa. */
  pasa: boolean;
  motivos: string[];
  aprobadas: string[];
  detalle: {
    n: number;
    sep: number | null;
    t: number | null;
    listonT: number;
    tickerMayor: { ticker: string; pct: number } | null;
    tercios: { periodo: string; n: number; sep: number; t: number }[];
  };
}

const media = (v: number[]) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const varianza = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = media(v);
  return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1);
};
/** t de Welch entre dos grupos con varianzas distintas. */
export function tWelch(a: number[], b: number[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  const se = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length);
  return se > 0 ? (media(a) - media(b)) / se : 0;
}

/** Separación entre el tercio alto y el bajo según un criterio. */
function separar(filas: FilaHallazgo[], criterio: (f: FilaHallazgo) => number) {
  const ord = [...filas].sort((x, y) => criterio(y) - criterio(x));
  const k = Math.floor(ord.length / 3);
  if (k < 3) return null;
  const alto = ord.slice(0, k).map((f) => f.pnl);
  const bajo = ord.slice(-k).map((f) => f.pnl);
  return { sep: media(alto) - media(bajo), t: tWelch(alto, bajo), n: ord.length };
}

/**
 * Listón de |t| según cuántas pruebas se hayan hecho (Bonferroni). Con UNA prueba, 2. Con 30
 * pruebas —que es lo que llevamos hecho en una tarde más de una vez— sube a ~3,4.
 */
export function listonT(pruebas: number): number {
  if (pruebas <= 1) return 2;
  // Aproximación de la inversa normal para α=0,05 a dos colas dividido entre el nº de pruebas.
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}

export interface Opciones {
  /** Cuántas pruebas se han hecho sobre estos datos. Si no se sabe, PONER ALTO, no bajo. */
  pruebas?: number;
  nMinimo?: number;
  /** Cuota máxima de un solo activo. Por encima, el hallazgo puede ser de ese activo y no del criterio. */
  maxPorTicker?: number;
}

/**
 * Somete un criterio a las cuatro cribas. **Si `pasa` es false, no se reporta como hallazgo** —
 * ni con matices, ni "pero la tendencia es buena". Se dice que no pasó y por qué.
 */
export function pasarBarrera(
  filas: FilaHallazgo[],
  criterio: (f: FilaHallazgo) => number,
  opciones: Opciones = {},
): Veredicto {
  const { pruebas = 30, nMinimo = 200, maxPorTicker = 0.2 } = opciones;
  const motivos: string[] = [];
  const aprobadas: string[] = [];
  const liston = listonT(pruebas);

  // ── 1. MUESTRA ──
  if (filas.length < nMinimo) motivos.push(`muestra de ${filas.length}, hacen falta ${nMinimo}`);
  else aprobadas.push(`muestra ${filas.length} ≥ ${nMinimo}`);

  // ── 2. CONCENTRACIÓN POR ACTIVO ──
  const cuenta = new Map<string, number>();
  for (const f of filas) cuenta.set(f.ticker, (cuenta.get(f.ticker) ?? 0) + 1);
  let mayor: { ticker: string; pct: number } | null = null;
  for (const [t, n] of cuenta) {
    const pct = n / filas.length;
    if (!mayor || pct > mayor.pct) mayor = { ticker: t, pct };
  }
  if (mayor && mayor.pct > maxPorTicker) {
    motivos.push(`${mayor.ticker} es el ${(mayor.pct * 100).toFixed(1)}% de la muestra (máximo ${(maxPorTicker * 100).toFixed(0)}%) — el hallazgo puede ser de ese activo, no del criterio`);
  } else if (mayor) {
    aprobadas.push(`ningún activo pasa del ${(maxPorTicker * 100).toFixed(0)}% (mayor: ${mayor.ticker} ${(mayor.pct * 100).toFixed(1)}%)`);
  }

  // ── 3. TERCIOS DE TIEMPO ──
  const porFecha = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(porFecha.length / 3);
  const tercios: Veredicto["detalle"]["tercios"] = [];
  if (k >= 3) {
    for (let i = 0; i < 3; i++) {
      const g = i < 2 ? porFecha.slice(i * k, (i + 1) * k) : porFecha.slice(2 * k);
      const s = separar(g, criterio);
      if (s) tercios.push({ periodo: `${g[0].fecha}→${g[g.length - 1].fecha}`, n: g.length, sep: s.sep, t: s.t });
    }
  }
  if (tercios.length < 3) {
    motivos.push("no hay muestra para partir en tres tercios de tiempo — sin eso no se puede saber si el efecto vive en un solo período");
  } else {
    const signos = tercios.map((x) => Math.sign(x.sep));
    if (!(signos[0] === signos[1] && signos[1] === signos[2])) {
      motivos.push(`el signo NO se repite en los tres tercios (${tercios.map((x) => (x.sep >= 0 ? "+" : "−") + Math.abs(x.sep * 100).toFixed(1) + "%").join(" · ")}) — el efecto no es estable en el tiempo`);
    } else {
      aprobadas.push(`mismo signo en los tres tercios (${tercios.map((x) => (x.sep >= 0 ? "+" : "−") + Math.abs(x.sep * 100).toFixed(1) + "%").join(" · ")})`);
    }
  }

  // ── 4. ESTADÍSTICO ──
  const global = separar(filas, criterio);
  if (!global) {
    motivos.push("muestra insuficiente para calcular la separación");
  } else if (Math.abs(global.t) < liston) {
    motivos.push(`t = ${global.t.toFixed(2)}, por debajo del listón de ${liston} para ${pruebas} pruebas`);
  } else {
    aprobadas.push(`t = ${global.t.toFixed(2)} ≥ ${liston} (Bonferroni con ${pruebas} pruebas)`);
  }

  return {
    pasa: motivos.length === 0,
    motivos, aprobadas,
    detalle: {
      n: filas.length,
      sep: global?.sep ?? null,
      t: global?.t ?? null,
      listonT: liston,
      tickerMayor: mayor,
      tercios,
    },
  };
}

/**
 * ¿TENÍA FUERZA LA PRUEBA PARA DETECTAR ALGO? — la criba que le faltaba al lado negativo.
 *
 * Lester, 2026-08-15: *"pareces emocionado por destrozar a EVA, sin embargo deberías estar
 * emocionado por que pase"*. Tiene razón, y debajo del tono hay un fallo de método mío:
 *
 * **Estaba aplicando cuatro cribas a los resultados POSITIVOS y ninguna a los NEGATIVOS.**
 * Eso es escepticismo asimétrico, y empuja sistemáticamente a no encontrar nunca nada. Un
 * "no funciona" con muestra pequeña o ruido alto no significa que no haya efecto: significa que
 * **la prueba no podía verlo**. Y eso no es una conclusión, es una prueba mal dimensionada.
 *
 * Devuelve la separación mínima que la muestra podría haber detectado (potencia ~80%). Si el
 * efecto que se buscaba es más pequeño que eso, el "no hay nada" NO vale.
 *
 * @returns `detectable` = separación mínima detectable · `concluyente` = si un negativo se puede
 *          reportar como "no hay efecto" o sólo como "no lo pudimos ver"
 */
export function potencia(filas: FilaHallazgo[], efectoQueImporta: number): {
  detectable: number; concluyente: boolean; mensaje: string;
} {
  const pnls = filas.map((f) => f.pnl);
  const k = Math.floor(filas.length / 3);
  if (k < 3) return { detectable: Infinity, concluyente: false, mensaje: "muestra insuficiente para calcular la potencia" };
  const sd = Math.sqrt(varianza(pnls));
  // Separación mínima detectable con α=0,05 y potencia 80%: (1,96 + 0,84) × EE de la diferencia.
  const detectable = 2.8 * sd * Math.sqrt(2 / k);
  const concluyente = detectable <= Math.abs(efectoQueImporta);
  return {
    detectable, concluyente,
    mensaje: concluyente
      ? `con n=${filas.length} se podía detectar una separación de ${(detectable * 100).toFixed(2)}%, así que un negativo SÍ es concluyente frente a un efecto de ${(efectoQueImporta * 100).toFixed(2)}%`
      : `con n=${filas.length} sólo se detectaría una separación de ${(detectable * 100).toFixed(2)}%, MAYOR que el efecto de ${(efectoQueImporta * 100).toFixed(2)}% que se busca — un "no funciona" aquí significa "no lo pudimos ver", NO "no existe". Hace falta más muestra antes de descartar.`,
  };
}

/**
 * UN FILTRO QUE DESCARTA CASI TODO ES UN BUG, NO UN RESULTADO. Lanza excepción.
 *
 * De dónde sale: el 2026-08-13 puse en el backtest de EVA la línea correcta
 * `if (!q) return null;  // sin precio real no se inventa`. La línea está bien y la defiendo.
 * Pero le pasaba a `quoteCierre` el campo equivocado —`r.symbol`, que es el código OCC del
 * contrato, en vez de `r.underlying`— así que TODAS las peticiones devolvían null y el descarte
 * se comió el 100% de los flujos. El informe salió con ceros en los 12 tickers y yo se lo conté
 * a Lester como "no hay datos". Estuvo semanas así.
 *
 * Una salvaguarda contra datos inventados se convirtió en una trituradora silenciosa. Envolver
 * cada filtro con esto hace que el segundo caso grite en vez de parecerse al primero.
 *
 * @param antes   cuántas filas entraron
 * @param despues cuántas sobrevivieron
 * @param que     qué filtro es, para el mensaje
 * @param maxDescartePct  a partir de qué porcentaje se considera bug (por defecto 90%)
 */
export function comprobarDescarte(antes: number, despues: number, que: string, maxDescartePct = 0.9): void {
  if (antes === 0) return;
  const descartado = (antes - despues) / antes;
  if (descartado >= maxDescartePct) {
    throw new Error(
      `${que}: descartó ${antes - despues} de ${antes} filas (${(descartado * 100).toFixed(1)}%). ` +
      `Eso NO es un resultado, es un bug — casi siempre un argumento mal formado que hace que la ` +
      `fuente devuelva vacío. Comprobar QUÉ se está pidiendo antes de aceptar que "no hay datos".`,
    );
  }
}

/** Informe en texto, para pegarlo tal cual. Empieza por el veredicto: si no pasa, se ve primero. */
export function informe(v: Veredicto, nombre: string): string {
  const l: string[] = [];
  l.push(v.pasa ? `✅ ${nombre} — PASA LAS CUATRO CRIBAS` : `⛔ ${nombre} — NO SE PUEDE REPORTAR COMO HALLAZGO`);
  l.push("");
  if (!v.pasa) { for (const m of v.motivos) l.push(`  ✗ ${m}`); l.push(""); }
  for (const a of v.aprobadas) l.push(`  ✓ ${a}`);
  l.push("");
  l.push(`  n=${v.detalle.n} · separación ${v.detalle.sep != null ? (v.detalle.sep * 100).toFixed(2) + "%" : "—"} · t=${v.detalle.t?.toFixed(2) ?? "—"} (listón ${v.detalle.listonT})`);
  for (const t of v.detalle.tercios) {
    l.push(`    ${t.periodo}  n=${String(t.n).padStart(5)}  sep ${(t.sep * 100).toFixed(2).padStart(7)}%  t=${t.t.toFixed(2).padStart(6)}`);
  }
  if (!v.pasa) {
    l.push("");
    l.push("  No hay matices que valgan: si no pasa, no se cuenta como hallazgo.");
    l.push("  Se dice que no pasó, se dice por qué, y se busca más muestra o se descarta.");
  }
  return l.join("\n");
}
