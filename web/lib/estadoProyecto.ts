// EL ESTADO DEL PROYECTO — la fuente única de la verdad.
//
// ═══ POR QUÉ EXISTE ═════════════════════════════════════════════════════════════════════════
//
// Llevamos más de cien mediciones desde el 24 de julio de 2026. Hasta hoy lo único que las unía
// era la memoria de Claude y los mensajes de commit. Eso tiene dos fallos:
//
//   · lo que se cerró se puede volver a proponer sin darse cuenta (y ha pasado)
//   · lo que quedó a medias desaparece en silencio, que es peor
//
// Este fichero es la lista. Se edita a mano cuando cambia algo, y la página /estado lo pinta.
// Si un resultado no está aquí, para el proyecto no existe.
//
// ═══ REGLA DE ESCRITURA ═════════════════════════════════════════════════════════════════════
//
// Cada entrada lleva su PEGA. Un hallazgo sin su objeción escrita al lado es propaganda, no
// una nota de trabajo. Y los números van en dólares al año, no en porcentajes por operación.

export type EstadoItem = "funciona" | "en-prueba" | "pendiente" | "cerrado";

export type Item = {
  id: string;
  titulo: string;
  estado: EstadoItem;
  /** Ids de /api/forward-tests que esta entrada cubre. Sirve para que la pagina detecte SOLA
   *  cuando hay un cuaderno corriendo que no esta en la lista. Sin esto, la lista escrita a
   *  mano y los cuadernos que escriben en Redis se separan y nadie se entera: el 31 de agosto
   *  la seccion decia "2 en prueba" habiendo DIEZ cuadernos escribiendo, con el credit spread
   *  marcado como CERRADO mientras acumulaba 253 operaciones. */
  cuadernos?: string[];
  /** Una línea, en palabras llanas. Sin jerga. */
  queEs: string;
  /** El número que resume. En dólares al año siempre que se pueda. */
  numero?: string;
  /** Los hechos que lo sostienen (o que lo mataron). */
  evidencia?: string[];
  /** La objeción honesta. Obligatoria en todo lo que no esté cerrado. */
  enContra?: string;
  /** Qué haría falta para moverlo. */
  siguiente?: string;
  /** Sólo en pendientes: 1 es lo primero. */
  prioridad?: number;
  actualizado: string;
};

// Se calcula al final del fichero, a partir de la fecha más nueva de las fichas.
// Escrito a mano decía 2026-08-22 cuando la ficha más reciente era del 31: nueve días de
// retraso en la frase que dice cuándo se actualizó. Lester, 31-ago-2026: "asegúrate de que
// esto siempre está actualizado".

export const ITEMS: Item[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // LO QUE ESTÁ VIVO
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "condor-tres-sies",
    titulo: "Cóndor 0DTE de SPX · los tres síes",
    estado: "en-prueba",
    queEs:
      "A las 11:00, tres preguntas: ¿SPX sobre su media de 5 sesiones? ¿sobre la de 50? ¿el cóndor de ±45 con alas de 50 paga al menos $100? Los tres síes → 1 contrato, y se aguanta al cierre.",
    cuadernos: ["tres-sies"],
    numero: "$6.380 al año con 1 contrato",
    evidencia: [
      "en el backtest: 201 operaciones · 94% de acierto · $127 de media por operación",
      "peor operación −$4.725 · caída máxima acumulada −$7.093",
      "MÁXIMO 2 PERDEDORAS SEGUIDAS en las 201 del backtest (el cóndor crudo encadena 6)",
      "año a año: 2022 $4.328 · 2023 $887 · 2024 $5.053 · 2025 $5.713 · 2026 $9.504",
      "en 2022 operó sólo 13 días de 219 y ganó los 13; el mismo cóndor sin filtro perdió $22.074 ese año",
      "retiene ~$5.000 de colateral por contrato",
      "pre-registrado ANTES de medirlo, con sus cuatro debilidades escritas",
      "en forward test desde el 21 de agosto — la muestra en directo va debajo, y se actualiza sola",
    ],
    enContra:
      "El 2022 que parece salvarlo son 13 operaciones: eso no prueba que resista un año malo, prueba que casi no juega — y cuál de esos 13 días le tocó puede ser suerte. No cruza el listón de Bonferroni: t=3,57 contra el 4,0 que le tocaría por las ~300 configuraciones probadas sobre los mismos días. Opera cada vez más (6% de los días en 2022, 40% en 2026), así que casi toda la evidencia viene de los últimos meses. Con 2 contratos la caída máxima sería −$14.187, el número que Lester dijo que le destroza.",
    siguiente: "Dejar correr el forward test. Es lo único que puede resolverlo.",
    actualizado: "2026-08-21",
  },
  {
    id: "mapa-liquidez",
    titulo: "El mapa de liquidez",
    estado: "funciona",
    queEs:
      "Comprar el contrato que la cinta acaba de imprimir, en vez de uno cualquiera de la cadena. Es el único contrato de toda la cadena que en ese momento está barato.",
    numero: "$697 de peaje ahorrado por operación",
    evidencia: [
      "peaje del 1,81% contra el 12,75% de un contrato cualquiera",
      "es lo único de MarketSnack que ha resistido todas las pruebas",
    ],
    enContra:
      "Es ejecución, no señal: dice CÓMO comprar barato, no QUÉ comprar. Sin una estrategia que necesite comprar opciones, no vale nada. Y medido sobre los prints de ≥$1M, comprar al precio del print sólo ahorra un 0,2% más que el ask de la cadena — el ahorro grande aparece en otra población.",
    siguiente: "Guardado para cuando exista algo que comprar.",
    actualizado: "2026-08-21",
  },
  {
    id: "mezcla-put-indice",
    titulo: "La mezcla: mitad QQQ, mitad venta de puts",
    estado: "funciona",
    queEs:
      "La cartera partida por la mitad: la mitad en QQQ y la mitad vendiendo puts semanales al 3% fuera del dinero, a media sesión.",
    numero: "$5.906 al año sobre $50.000 · la mitad de caída que el índice",
    evidencia: [
      "316 semanas medidas, 2020-2026, con bid/ask reales",
      "peor caída seguida −$8.930 contra −$18.368 de comprar QQQ a secas",
      "2022 costó −$3.494; comprar QQQ costó −$11.821 ese año",
      "máximo 5 perdedoras seguidas · 59% de acierto",
      "la put está PLANA en las bajadas (correlación 0,50 con el índice)",
    ],
    enContra:
      "GANA MENOS DINERO que comprar QQQ a secas: $5.906 al año contra $6.792. Lo que compra no es rentabilidad, es tranquilidad — y hay que decidir si esos $886 al año valen dormir mejor. Y NO está en forward test: es el hueco más grande de la lista. No vender al cierre; eso ya se midió y empeora.",
    siguiente: "Montarle un forward test como el del cóndor. Prioridad alta.",
    actualizado: "2026-08-21",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PENDIENTE
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "mariposa-15h",
    titulo: "Mariposa de hierro 0DTE a las 15:00 — la mejor candidata sobre la mesa",
    estado: "en-prueba",
    prioridad: 1,
    queEs:
      "A las 15:00, y sólo si el SPX está por encima de su media de 5 cierres Y de la de 50: vender la mariposa de hierro al dinero sobre SPXW del mismo día (vender la call y la put del strike pegado al precio, comprar la call 50 puntos arriba y la put 50 abajo). Un contrato. NO se cierra nunca: se deja vencer.",
    cuadernos: ["mariposa", "mariposa-umbral"],
    numero: "$11.405/año con un contrato · caída máxima $5.321 · peor día $3.247 · acierta 2 de cada 3",
    evidencia: [
      "gana MÁS y asusta MENOS que el cóndor de los tres síes medido sobre los mismos días ($6.722/año con caída de $7.092)",
      "ningún año perdedor: 2022 +$8.903 · 2023 +$14.907 · 2024 +$17.739 · 2025 +$8.494 · 2026 +$2.422 (hasta el 10 de agosto)",
      "NO cerrarla antes es la mitad del negocio: las 282 formas de cerrar antes de tiempo pierden dinero, entre $3.753 y $69.077 al año. Son cuatro patas y cerrar hace pagar la horquilla otra vez en las cuatro",
      "la hora manda: a las 10:00 pierde $23.377/año; de 13:00 a 15:00 es donde paga. Es el otro lado de lo medido en compra — una 0DTE comprada por la tarde pierde entre el 9% y el 19% por operación",
      "el 100% de los 518 días acabó dentro de las alas: a las 15:00 sólo queda una hora y al índice le cuesta recorrer 50 puntos en una hora",
      "castigada con un 10% más de horquilla en contra en cada pata sigue dando $10.943/año con todos los años en positivo",
      "colateral $5.000 en Robinhood, el mismo que el cóndor que ya corre",
    ],
    enContra:
      "NO cruza el listón de las muchas puertas: 468 casillas en este encargo más ~300 previas del proyecto ponen el listón cerca de 4 y da 3,41 — el mismo agujero que tiene el cóndor. Se está apagando (primera mitad $14.872/año, segunda $7.939). El filtro de las medias NO es nuevo: salió de un barrido sobre estos mismos días al construir los tres síes, así que reutilizarlo no es comprobación independiente. Y 2022 casi no está probado: sólo 40 operaciones, porque el filtro apaga el mercado bajista, que es justo el año que decidiría si aguanta un susto.",
    siguiente:
      "Pre-registrarla APARTE, con la geometría y la hora congeladas por escrito, y abrir cuaderno en Railway como se hizo con el cóndor. NO tocar la regla del cóndor que ya está corriendo. El forward test es la única prueba fuera de muestra que queda: todo lo medible sobre 2022-2026 ya se usó para elegirla.",
    actualizado: "2026-08-22",
  },
  {
    id: "combi-6x4",
    titulo: "COMBINADO · La Palanca + Missile, 6 huecos × 4%",
    estado: "en-prueba",
    cuadernos: ["combi6x4"],
    queEs:
      "Las DOS reglas sobre UNA sola cuenta de $60.000, con el dinero parado descansando en SPY. Un HUECO es una compra viva a la vez: aquí caben 6, y en cada una entran $2.400. Cada día cierra lo que toca, luego mira el Missile (su señal caduca: el golpe fue ayer y se compra hoy) y luego La Palanca con lo que quede. Corre desde el 1 de septiembre de 2026.",
    numero: "compras de $2.400 · el reparto que Lester dice que se atrevería a llevar",
    evidencia: [
      "mide lo que ningún otro cuaderno puede: CUÁNTO SE ESTORBAN las dos reglas al compartir una sola cuenta, apuntado una a una",
      "en el backtest este reparto da $55.923 al año, con Sharpe 0,83 — el mejor de los cuatro repartos medidos",
      "en la primera corrida abrió DAL ($1.970) y CVS ($1.815), donde el reparto congelado no abría NINGUNA de las seis señales",
      "la caída, PARTIDA: la parte del SPY (que se cura sola) es −$46.097 y la de la estrategia (que sólo se cura si sigues) −$64.187",
    ],
    enContra:
      "Los $55.923 salen de los MISMOS datos que produjeron la regla, así que no son una prueba: son la misma opinión repetida. Este cuaderno existe para convertirlos en prueba, o para tumbarlos. Y la caída del backtest es −51% de TODA la cuenta, no de lo arriesgado: sobre $60.000 son $29.400. Esa caída tiene dos mitades que no duelen igual — la parte de SPY se recupera sola si no vendes, y la parte de la estrategia sólo se recupera si sigues abriendo posiciones, que es lo difícil.",
    siguiente:
      "Dejarlo correr. Con ~6 señales al año del Missile más las de La Palanca, antes de un año cualquier lectura es prematura.",
    actualizado: "2026-09-01",
  },
  {
    id: "combi-4x6",
    titulo: "COMBINADO · La Palanca + Missile, 4 huecos × 6%",
    estado: "en-prueba",
    cuadernos: ["combi4x6"],
    queEs:
      "El mismo cuaderno que el de arriba con una sola diferencia: el dinero va en 4 compras de $3.600 en vez de 6 de $2.400. Mismo capital comprometido, repartido en menos manos. Corre desde el 1 de septiembre de 2026.",
    numero: "compras de $3.600 · «mi próximo paso, quiero ver cómo se siente»",
    evidencia: [
      "con la mediana de lo que cuesta un contrato hoy en $3.620, es el primer reparto que alcanza a comprar la mitad de las señales",
      "en el backtest gana algo más que el de 6 huecos y la caída total parece casi igual (−53% contra −51%)",
      "PERO al partir la caída deja de parecerse: la parte que sólo se cura si sigues operando pasa de −$64.187 a −$120.821, casi el doble",
      "y no compensa por el otro lado: con 4 huecos la ESTRATEGIA gana menos ($338.617 contra $376.506); lo que sube es lo que aporta el SPY parado",
    ],
    enContra:
      "Concentra el doble del dolor que no se cura solo, y para sacarle MENOS a la parte que lo produce. Cada compra pesa el 6% de la cuenta, así que una que salga mal duele más. Corre al lado del de 6 huecos a propósito — la comparación entre los dos sólo vale hacia adelante, porque en el backtest los dos números salen de los mismos datos.",
    siguiente:
      "Compararlo con el de 6 huecos dentro de un año: cuál compró más señales y cuál se pudo aguantar sin abandonarlo.",
    actualizado: "2026-09-01",
  },
  {
    id: "la-palanca",
    titulo: "LA PALANCA · calls muy dentro del dinero",
    estado: "en-prueba",
    cuadernos: ["la-palanca"],
    queEs:
      "El día que una acción cierra más de un 7% por debajo de su media de 50 sesiones, se compra una call 10% dentro del dinero con vencimiento a ~400 días. Se aguanta 120 sesiones o hasta que valga la mitad. 10 posiciones a la vez sobre 60 grandes capitalizaciones, con el dinero parado en SPY.",
    numero: "$36.702 al año contra los $19.039 de comprar SPY · caída −47% contra −34%",
    evidencia: [
      "APROBÓ EL EXAMEN FUERA DE MUESTRA el 30 de agosto: afinada en 24 empresas dio 17,6% al año, y en 36 que nunca había visto dio 17,6%",
      "los criterios se escribieron ANTES de construir un solo camino del grupo B",
      "281 operaciones · acierta el 46% · la mayor pesa el 10% del dinero (la versión vieja: 43%)",
      "un barrido multiagente encontró que la call 10% dentro bate a la de 25%: cuesta un 41% menos y entra donde la cara no cabía",
      "sobrevive a quitar 2020 y 2025 enteros, y a pagar la horquilla dos veces",
    ],
    enContra:
      "El Sharpe apenas supera a comprar SPY y dormir (0,73 contra 0,70): se gana más porque se asume más, no por acertar más. El 65% del dinero lo pone el SPY parado, no las opciones. Y con una cuenta de $60.000 cada hueco es de $1.440, así que sólo caben 18 de 58 empresas — y las que caben son las de PEOR horquilla (VZ 10,4%, ZTS 9,0%). La primera posición real entró pagando un 14,29%.",
    siguiente:
      "Ver si el corte de horquilla menor del 3% aguanta: da Sharpe 0,80-0,82 con la caída de SPY en los dos universos, pero son ~6 operaciones al año. El cuaderno apunta la horquilla de cada entrada sin filtrar, para poder leerlo de las dos maneras dentro de un año.",
    actualizado: "2026-08-31",
  },
  {
    id: "tsla-missile",
    titulo: "TSLA's Missile · sólo TSLA",
    estado: "en-prueba",
    cuadernos: ["tsla-missile"],
    queEs:
      "Cuando en TSLA entra una sola operación de más de $500.000 pagada al ask después de las 14:00, y ese contrato vale 12 veces o más el interés abierto que tenía la víspera, se compra al día siguiente al cierre. Se sale a 1,50x, a 0,50x, o a los 60 días.",
    numero: "34 señales · +11,34% por operación · acierta 82% · t=4,23",
    evidencia: [
      "seis de seis años positivos: 2021 +39% · 2022 +13% · 2023 +32% · 2024 +3% · 2025 +4% · 2026 +40%",
      "22,2% al año con caída del 10%",
      "con 673 controles, los días CON golpe dieron +10,40% y los días SIN golpe −0,51%: la señal elige el día",
    ],
    enContra:
      "Todo eso es EN MUESTRA, sobre el único ticker alrededor del cual se construyó la regla, con 34 operaciones. La tabla mágica, como regla general, está CERRADA: falló dos exámenes fuera de muestra y su lado dominante pierde −5,21% con t=−5,36 sobre 580 entradas. En TSLA no se pudo tumbar, pero 34 señales sobre UN nombre es exactamente donde vive la casualidad. No queda historia con la que validarlo: sólo se puede hacia adelante.",
    actualizado: "2026-08-31",
  },
  {
    id: "condor-gex",
    titulo: "Cóndor 0DTE · filtro de GEX",
    estado: "en-prueba",
    cuadernos: ["gex-condor"],
    queEs:
      "El mismo cóndor de SPX del día, pero sólo se abre cuando el GEX (el gamma que tienen los creadores de mercado) es positivo. Usa alas de ±25, que es la geometría más ajustada de las tres.",
    numero: "en el backtest: +3,93% por operación · t=2,09 · positivo en 8 horas del día y en 3 años",
    evidencia: [
      "el control en GEX negativo da CERO: la separación no es un artefacto del cóndor",
      "cuatro de cuatro fuera de muestra en la primera medición",
    ],
    enContra:
      "Es la versión con PEOR caída de las tres con GEX: −$20.356 en el backtest. Y el GEX vivo, medido aparte sobre 85.021 barras con interés abierto real, NO predice el precio — describe dónde hay muros. Que aquí funcione y allí no es una contradicción sin resolver.",
    actualizado: "2026-08-31",
  },
  {
    id: "condor-sinfiltro",
    titulo: "Cóndor 0DTE · sin filtro (el CONTROL)",
    estado: "en-prueba",
    cuadernos: ["condor-sinfiltro"],
    queEs:
      "El mismo cóndor, abierto TODOS los días sin condición ninguna. No está para operarlo: está para saber cuánto aportan de verdad los filtros de los otros tres.",
    numero: "es el listón contra el que se miden los demás",
    evidencia: [
      "sin un control, un filtro que no aporta nada se ve igual que uno que sí",
      "en el backtest, el cóndor crudo perdió $22.074 en 2022 mientras el de los tres síes ganaba los 13 días que operó",
    ],
    enContra:
      "No se opera nunca. Si algún día sale mejor que los filtrados, la conclusión no es operarlo: es que los filtros no valen y hay que cerrarlos.",
    actualizado: "2026-08-31",
  },
  {
    id: "condor-tendencia",
    titulo: "Cóndor 0DTE · filtro de tendencia",
    estado: "en-prueba",
    cuadernos: ["condor-tendencia"],
    queEs:
      "El mismo cóndor, abierto sólo cuando SPX está por encima de sus medias. Es la mitad del filtro de los tres síes, sin la condición del crédito mínimo.",
    numero: "sirve para separar qué parte del filtro de los tres síes hace el trabajo",
    evidencia: [
      "los tres síes son tres condiciones a la vez; sin desmontarlas no se sabe cuál aporta",
      "si este da lo mismo que los tres síes, la condición del crédito de $100 sobra",
    ],
    enContra:
      "Con dos cuadernos midiendo variantes de lo mismo, el riesgo es leer el que salga mejor. Los dos se leen juntos o no se leen.",
    actualizado: "2026-08-31",
  },
  {
    id: "fwd-credit-spread",
    titulo: "Credit spread · el cuaderno en directo",
    estado: "en-prueba",
    cuadernos: ["ledger"],
    queEs:
      "Vende un vertical de crédito a la distancia que marca la volatilidad del subyacente, en seis combinaciones de plazo y distancia a la vez, y lo deja vencer. Corre desde el 3 de agosto.",
    numero: "la estrategia está CERRADA como conclusión — este cuaderno existe para comprobarla",
    evidencia: [
      "el 31 de agosto se resolvió la contradicción que llevaba semanas escrita: NO la había",
      "el backtest dio −2,53% en la celda de 5 días a 1σ sobre CUATRO AÑOS con un crash dentro",
      "el cuaderno da +1,07% en esa misma celda sobre 17 días tranquilos: es el mismo hallazgo, no uno distinto",
      "ya estaba medido que el edge de 5 días es artefacto del año calmo; el robusto era el de 90 días",
    ],
    enContra:
      "La forma ya se ve y es la de vender prima: 240 ganadoras de +3,84% contra 13 perdedoras de −46,7%, TRES de ellas pérdida total del riesgo. Hacen falta 13 ganadoras para pagar UNA perdedora media, así que el resultado lo deciden las perdedoras y no el 95% de acierto. Y esas operaciones son una rejilla de seis combinaciones a la vez, no una cartera que puedas tener.",
    siguiente:
      "Esperar a la primera caída de verdad. Hasta entonces el número sólo dice que en 17 días tranquilos se acierta mucho, que ya lo sabíamos.",
    actualizado: "2026-08-31",
  },
  {
    id: "fwd-wheel",
    titulo: "Wheel · el cuaderno en directo",
    estado: "en-prueba",
    cuadernos: ["wheel"],
    queEs:
      "Vende puts fuera del dinero a 0,15 y 0,25 de delta, a 15 y 30 días, sobre 12 acciones. Se cierra al recuperar la mitad de la prima o se deja vencer. Corre desde el 4 de agosto.",
    // Sin cifras a mano: el recuento vive en la banda de "lo que esta pasando ahora", justo
    // debajo de esta ficha. Cuando estuvo escrito aqui decia "7 cerrados" con 19 en la tabla.
    numero: "12 acciones · 2 deltas × 2 plazos, todas las celdas a la vez",
    evidencia: [
      "las cerradas van ganando TODAS, con algo menos de un cuarto de punto de media sobre el colateral",
      "motivos de cierre sensatos: «gestión 50%» y «expiró sin valor»",
      "el backtest dejó 5 activos positivos pero NINGUNO concluyente (HOOD +0,52 · PLTR +0,48)",
    ],
    enContra:
      "El 100% de acierto no dice nada: vender puts a 0,15 de delta acierta casi siempre por construcción, y todavía no ha habido NI UNA asignación — sólo hemos visto la mitad buena de la distribución. Con ese delta toca ~1 asignación de cada 7, y ganando 0,24% cada vez, una sola que cueste más del 1,7% se lleva la racha entera. Además el colateral comprometido pasa de $11 millones, más de 150 veces la cuenta real: el +0,24% es el rendimiento de una celda, no de una cartera que puedas tener.",
    siguiente:
      "Que ocurra la primera asignación. Y arreglar que 12 puts vencidos el 28 de agosto sigan abiertos: ThetaData devuelve «sin datos» para algunos tickers y el script los salta en silencio.",
    actualizado: "2026-08-31",
  },
  {
    id: "fwd-ideas",
    titulo: "Ideas · el scorecard de EVA en directo",
    estado: "en-prueba",
    cuadernos: ["ideas"],
    queEs:
      "Toma las señales que el scorecard de EVA marca como de más convicción y abre con ellas un vertical de crédito. Corre desde el 19 de agosto.",
    numero: "la conclusión del backtest es que NO separa — este cuaderno la comprueba en directo",
    evidencia: [
      "medido en el backtest sobre 19.465 operaciones con precios reales: el scorecard no separa ganadoras de perdedoras",
      "y comprando a largo tampoco: 0 de 12, concluyente",
      "en directo va a −7,54% con 31% de acierto en 16 operaciones, coherente con esa conclusión",
    ],
    enContra:
      "16 operaciones no confirman nada, ni a favor ni en contra. Y va en la misma dirección que el backtest, así que lo más probable es que sólo esté repitiendo lo que ya sabíamos. Si algún día saliera positivo, la primera sospecha sería la muestra, no el hallazgo.",
    actualizado: "2026-08-31",
  },
  {
    id: "triple-negativo",
    titulo: "El «triple negativo» — reevaluar cuando haya muestra",
    estado: "pendiente",
    prioridad: 1,
    queEs:
      "Una alarma de tres luces (gamma en el spot, gamma total y skew de IV) que dice «hoy no te metas». En cristiano: los días que la enciende, el mercado se mueve más y el cóndor lo pasa mal.",
    numero: "la alarma acierta, pero grita casi siempre cuando ya estás a salvo",
    evidencia: [
      "de los 412 días que enciende la alarma, en 350 tu regla de medias YA te tenía fuera — la alarma llega tarde",
      "quedan 62 días donde las medias dicen «adelante» y la alarma dice «no». Son los únicos que importan",
      "en esos 62 días el cóndor dio −1 de media contra +7 los otros — pero con 62 días eso puede ser mala suerte y no lo sabemos distinguir",
      "sobre los 1.112 días el efecto SÍ existe y es sólido: 19 menos por operación los días de alarma",
      "añadirlo hoy subiría de .541 a .134 al año, pero eso sale de quitar 21 días de 201 que ya sabíamos malos DESPUÉS de pasar",
    ],
    enContra:
      "La tercera luz (el skew de puts) está encendida el 99% de los días, así que en realidad es un DOBLE negativo con una bombilla decorativa. Y su etiqueta de «bajista» es falsa: esos días SPX sube +0,03% de media, no baja.",
    siguiente:
      "ESPERAR. El forward test va añadiendo días de esos 62 por su cuenta. Cuando lleguen a unos 200 se puede decidir de verdad; con 62 no. Revisar en unos meses, no antes — y si entonces sale bien, se pre-registra APARTE y se abre cuaderno nuevo, sin tocar la regla que está corriendo.",
    actualizado: "2026-08-22",
  },
  {
    id: "forward-mezcla",
    titulo: "Forward test de la mezcla put + índice",
    estado: "cerrado",
    queEs:
      "Poner en directo la mitad QQQ + mitad venta de puts, como se hizo con el cóndor.",
    numero: "no hay ventaja que verificar: es un reparto de la cartera, no una señal",
    evidencia: [
      "Lester: «¿para qué quiero hacer un forward test de mitad QQQ, mitad venta de put? ¿porque me da más efectivo para comprar QQQ?»",
      "tenía razón. Un forward test sirve para ver si una VENTAJA medida sobrevive en directo. La mezcla no tiene ventaja: gana casi lo mismo que el índice (18,1% contra 16,6% con dividendos) con la mitad de susto (18% contra 36%)",
      "eso no es algo que descubra un cuaderno en papel: es una decisión de cuánto riesgo quiere llevar, y ya está medida sobre la historia entera",
      "el cóndor sí necesitaba cuaderno porque su ventaja depende de precios de ejecución que sólo se ven en directo. La mezcla se ejecuta con dos órdenes de mercado al mes",
    ],
    enContra:
      "Lo que SÍ queda abierto es la decisión, no la medición: cuánto de la cuenta va a la mezcla. Eso está en el pendiente de la combinación por horizontes.",
    actualizado: "2026-08-22",
  },
  {
    id: "earnings",
    titulo: "Earnings",
    estado: "pendiente",
    prioridad: 3,
    queEs:
      "Comprar el cono antes de resultados es la apuesta de movimiento clásica y nunca la hemos medido. Tenemos cadenas de 2016-2026 para 40 tickers.",
    enContra:
      "El listón ya lo sabemos y es duro: comprar la opción cuesta ~3% por operación. La ventaja tiene que superar eso, no cero.",
    siguiente: "Cruzar el calendario de resultados con las cadenas en disco.",
    actualizado: "2026-08-21",
  },
  {
    id: "wheel",

    // El monitoreo YA existe y lleva escribiendo desde el 4 de agosto; lo que falta es el backtest a escala. OJO: el 100% de acierto no dice nada — vender puts a 0,15 de delta acierta casi siempre por construccion, y aun no ha habido NI UNA asignacion.
    titulo: "Wheel: backtest y monitoreo",
    estado: "pendiente",
    prioridad: 4,
    queEs: "Falta hacerle lo mismo que al credit spread: backtest completo y forward test en directo.",
    evidencia: ["los 5 activos medidos salen positivos pero ninguno es concluyente (HOOD +0,52, PLTR +0,48)"],
    enContra: "La inclinación es débil; sólo un forward test puede resolverla.",
    actualizado: "2026-08-21",
  },
  {
    id: "trimestre-semestre",
    titulo: "Trimestre y semestre",
    estado: "pendiente",
    prioridad: 5,
    queEs: "Los dos huecos vacíos de la combinación por horizontes.",
    enContra:
      "El semestral no llega al mínimo de muestra con 8 tickers (170 < 200). Hay que bajar unos 20 símbolos más antes de poder medirlo.",
    actualizado: "2026-08-21",
  },
  {
    id: "clave-theta",
    titulo: "Rotar la clave de ThetaData",
    estado: "pendiente",
    prioridad: 6,
    queEs:
      "La clave va como argumento de java, o sea visible en la lista de procesos para cualquier cosa que corra en la máquina.",
    siguiente: "Rotarla y pasarla por variable de entorno cuando se suelte el Terminal.",
    actualizado: "2026-08-21",
  },
  {
    id: "nombre",
    titulo: "Quitar el nombre viejo del proyecto",
    estado: "cerrado",
    queEs: "De todas partes del repo.",
    enContra:
      "Cuidado: la carpeta de memoria de Claude se deriva de la ruta del proyecto. Si se renombra sin llevársela, se pierde todo el historial.",
    actualizado: "2026-08-21",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // CERRADO — está aquí para NO volver a proponerlo
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "cerrado-comprar-direccional",
    titulo: "Comprar calls o puts como apuesta direccional",
    estado: "cerrado",
    queEs:
      "La conclusión que explica de una vez por qué han muerto todas las ideas de compra del proyecto.",
    numero: "el vehículo cuesta −3,0%; la mejor señal que existe vale +0,3%",
    evidencia: [
      "seguir el print exacto de la cinta: +0,3% sobre un contrato vecino, t=19, n=28.688, las dos mitades idénticas",
      "es el efecto más ESTABLE de todo el proyecto — y aun así es una décima parte del peaje",
      "el comprador con prisa (paga por encima del ask) lleva MENOS información, no más: 0,1% contra 0,3%",
      "ni el tamaño del print ni el plazo agrandan el efecto",
    ],
    enContra:
      "Regla que sale de aquí: antes de medir otra idea de comprar opciones direccionales, comprobar si la ventaja esperada supera el ~3% que cuesta la operación. Si no lo supera, no hace falta medirla.",
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-marketsnack",
    titulo: "MarketSnack como fuente de señal",
    estado: "cerrado",
    queEs: "83 días de cinta, 178.445 prints, $864.600 millones de prima. Todo medido.",
    evidencia: [
      "su score no predice: t=0,62 sobre 3.321 eventos, y las mitades se contradicen",
      "las 11 métricas de sus paneles: planas",
      "separar las patas de spread de las solas: las SOLAS son las más flojas (t=0,37) — la explicación que teníamos era falsa",
      "el corte por tamaño de print rebota sin orden: $1M t=1,78 · $10M t=−0,42 · $25M t=0,70",
    ],
    enContra:
      "Lo único que se salva es el mapa de liquidez, que es ejecución. Como señal, no renovar la suscripción.",
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-cadena",
    titulo: "Señales sacadas de la cadena de opciones",
    estado: "cerrado",
    queEs: "Doce combinaciones medidas contra el vehículo justo (la esquina barata). Doce muertas.",
    evidencia: [
      "sesgo, estructura temporal, prima lejos del dinero, momento a 3 meses — por call, put y cono",
      "la que parecía viva (prima lejos) tenía la métrica rota: SUMAR primas mide cuántos strikes lista la cadena, no cuánta prima hay (correlación 0,756 con el recuento). Lo destapó ver que SPY caía en el tercio 'más volátil'",
      "el z contra su propia historia —el que le habría dado sentido del tiempo— da t=0,14 y las mitades con signo opuesto",
    ],
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-eva",

    // El cuaderno sigue corriendo para comprobar en directo la conclusion del backtest (19.465 operaciones, no separa).
    titulo: "EVA · el scorecard",
    estado: "cerrado",
    queEs: "El sistema de puntuación con pesos, medido en grande y con precios reales.",
    evidencia: [
      "en el backtest, 19.465 operaciones: no separa. Una ventaja del 10% se habría visto y no está",
      "comprando a largo: 0 de 12, concluyente. El +0,7% que parecía hallazgo era peaje de liquidez",
      "ninguno de sus ingredientes es estable: el proxy de IV pasa de t=+6,7 a t=−3,8 en el período siguiente",
    ],
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-gex-vivo",
    titulo: "El GEX vivo como brújula para operar a minutos",
    estado: "cerrado",
    queEs:
      "La última excusa que le quedaba al GEX: el panel de Victor se recalcula durante la sesión y el nuestro estaba congelado. Ya no. Medido con el interés abierto real sobre 85.021 barras de 5 minutos y cuatro años y medio.",
    numero: "lo mejor de la rejilla, 0,053 puntos · el listón del azar está en 0,209",
    evidencia: [
      "ir hacia el imán: −0,020 a 5 min · −0,018 a 15 min · −0,072 a 60 min",
      "con gamma NEGATIVA e invirtiendo (la hipótesis de Lester): 0,002 puntos, y las dos mitades con SIGNO OPUESTO",
      "EL IMÁN BARAJADO LO HACE MEJOR QUE EL REAL: 0,124 puntos a 30 min (t=3,1) contra −0,021 del verdadero",
      "lo bueno: los muros vivos SÍ son independientes (correlación 0,229 con el precio, se mueven el 7-10% de las barras) — no son un espejo del precio",
    ],
    enContra:
      "Que el barajado gane al real no es señal débil: es ausencia de señal. El positivo del barajado es la deriva del mercado por el sesgo direccional del interés abierto. El GEX vivo vale como MAPA (dónde está la posición grande), no como brújula. Sigue vivo y sin contradicción el GEX como FILTRO del cóndor 0DTE, que es elegir días, no dirección.",
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-gex-niveles",
    titulo: "El GEX como niveles que predicen",
    estado: "cerrado",
    queEs: "Si los muros de gamma frenan el precio.",
    numero: "el muro para el precio el 38,8% de las veces; una raya al azar, el 43,2%",
    evidencia: [
      "1.122 días con muros y punto de giro calculados",
      "la estrategia derivada da −$1.988 al año contra $7.951 de simplemente comprar SPY",
    ],
    enContra: "Describe, no predice. Falta medir la versión VIVA, que es lo pendiente número 1.",
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-venta-prima",

    // El cuaderno sigue corriendo A PROPOSITO: el backtest con precios reales daba −2,53% y en directo sale POSITIVO. Uno de los dos esta mal y con 253 operaciones cerradas ya no se puede aplazar.
    titulo: "La familia de venta de prima (credit spreads, calls cubiertas)",
    estado: "cerrado",
    queEs: "Vender prima sistemáticamente, en sus varias formas.",
    evidencia: [
      "credit spread con bid/ask reales: −2,53%. El +13%/año nunca existió",
      "el modelo inflaba el crédito un 140%, y los vencimientos que usaba no existían",
      "calls cubiertas: 9 de 9 negativas. El hallazgo de HOOD (t=4,38) no replica en AAPL ni TSLA",
      "los filtros de régimen (MA200) empeoran: vender puts ES el mercado, con n=1.916",
    ],
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-filtros-condor",
    titulo: "Filtrar el cóndor por régimen o gestionarlo",
    estado: "cerrado",
    queEs: "Buscar un indicador que diga qué días no operar, o una regla de salida.",
    evidencia: [
      "16 regímenes medidos: nada filtra. El crédito compensa el riesgo extra, por eso el VIX sale plano",
      "29 de 30 reglas de gestión pierden; la que queda es aguantar",
      "acercarse al dinero empeora y los stops pierden 19 de 20",
      "el filtro de amplitud se cae fuera de muestra: $11.552/año en vez de $18.770, y 2023 pierde",
    ],
    enContra: "Lo único que escala el cóndor es el tamaño, y el tamaño escala el susto igual.",
    actualizado: "2026-08-21",
  },
];

/** La fecha más nueva de todas las fichas. NUNCA a mano. */
export const ACTUALIZADO = ITEMS.map((i) => i.actualizado).filter(Boolean).sort().pop() ?? "";

export const RESUMEN = {
  desde: "2026-07-24",
  loQueFunciona: ITEMS.filter((i) => i.estado === "funciona").length,
  enPrueba: ITEMS.filter((i) => i.estado === "en-prueba").length,
  pendiente: ITEMS.filter((i) => i.estado === "pendiente").length,
  cerrado: ITEMS.filter((i) => i.estado === "cerrado").length,
};
