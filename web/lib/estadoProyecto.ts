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
  /** Una línea, en palabras llanas. Sin jerga. */
  queEs: string;
  /** El número que resume. En dólares al año siempre que se pueda. */
  numero?: string;
  /** Los hechos que lo sostienen (o que lo mataron). */
  evidencia?: string[];
  /** La objeción honesta. Obligatoria en todo lo que no esté cerrado. */
  pega?: string;
  /** Qué haría falta para moverlo. */
  siguiente?: string;
  /** Sólo en pendientes: 1 es lo primero. */
  prioridad?: number;
  actualizado: string;
};

export const ACTUALIZADO = "2026-08-21";

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
    numero: "$6.341 al año con 1 contrato",
    evidencia: [
      "175 operaciones de 841 días (opera el 21% de los días)",
      "94% de acierto · $121 de media por operación",
      "peor día −$4.725 · caída máxima acumulada −$7.093",
      "retiene $5.380 de colateral por contrato",
      "año a año: 2023 $892 · 2024 $5.053 · 2025 $5.713 · 2026 $9.504",
      "pre-registrado ANTES de medirlo, con sus cuatro debilidades escritas",
      "en forward test desde el 19 de agosto (cuaderno forward:tres-sies)",
    ],
    pega:
      "No cruza el listón de Bonferroni: t=3,57 contra el 4,0 que le tocaría por las ~300 configuraciones probadas sobre los mismos días. Y opera cada vez más — 4% de los días en 2023, 40% en 2026 — así que casi toda la evidencia viene de los últimos meses. Con 2 contratos la caída máxima sería −$14.187, el número que Lester dijo que le destroza.",
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
    pega:
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
    numero: "18,1% al año contra 16,6% del SPY",
    evidencia: [
      "empata en dinero con comprar el índice, pero la caída es 18% contra 36%",
      "la put está PLANA en las bajadas (correlación 0,50 con el índice)",
      "medido con precios reales de bid/ask, no de modelo",
    ],
    pega:
      "NO está en forward test. Es el hueco más grande de la lista: la estrategia con mejor perfil de susto del proyecto no se está verificando en directo. Y no vender al cierre — eso ya se midió y empeora.",
    siguiente: "Montarle un forward test como el del cóndor. Prioridad alta.",
    actualizado: "2026-08-21",
  },

  // ══════════════════════════════════════════════════════════════════════════
  // PENDIENTE
  // ══════════════════════════════════════════════════════════════════════════
  {
    id: "gex-vivo",
    titulo: "El GEX vivo, con el interés abierto real",
    estado: "pendiente",
    prioridad: 1,
    queEs:
      "Recalcular los muros de gamma durante la sesión, como hace el panel de MarketSnack, y responder si el muro tiene vida propia o simplemente persigue al precio.",
    evidencia: [
      "los 1.123 días de interés abierto de SPXW terminaron de bajar el 20 de agosto",
      "la primera medición SIN interés abierto dio correlación 0,761 — pero era un artefacto: sin el peso, el imán es el strike cercano al dinero por construcción",
    ],
    pega:
      "La versión congelada del GEX ya salió que describe pero no predice: el muro para el precio el 38,8% de las veces contra el 43,2% de una raya al azar. La versión viva podría no ser distinta.",
    siguiente: "Correr gex-vivo.mjs con el OI real. Los datos ya están pagados y en disco.",
    actualizado: "2026-08-21",
  },
  {
    id: "forward-mezcla",
    titulo: "Forward test de la mezcla put + índice",
    estado: "pendiente",
    prioridad: 2,
    queEs:
      "Poner en directo la estrategia con mejor perfil de caída que tenemos, igual que se hizo con el cóndor.",
    pega:
      "Que no esté ya montado es un descuido: es la única estrategia medida que reduce el susto a la mitad y no la estamos verificando.",
    siguiente: "Cuaderno en Redis + cron de Railway, copiando la forma de forward-tres-sies.",
    actualizado: "2026-08-21",
  },
  {
    id: "direccional-minutos",
    titulo: "El pase direccional de minutos",
    estado: "pendiente",
    prioridad: 3,
    queEs:
      "La idea de Lester: con gamma negativa, el imán del GEX podría dar dirección aprovechable en una operación de 5 a 10 minutos.",
    pega: "Tiene que ganarle a 0,209 puntos por operación, que es lo que da entrar al azar.",
    siguiente: "Depende del GEX vivo. Va después del punto 1.",
    actualizado: "2026-08-21",
  },
  {
    id: "earnings",
    titulo: "Earnings",
    estado: "pendiente",
    prioridad: 4,
    queEs:
      "Comprar el cono antes de resultados es la apuesta de movimiento clásica y nunca la hemos medido. Tenemos cadenas de 2016-2026 para 40 tickers.",
    pega:
      "El listón ya lo sabemos y es duro: comprar la opción cuesta ~3% por operación. La ventaja tiene que superar eso, no cero.",
    siguiente: "Cruzar el calendario de resultados con las cadenas en disco.",
    actualizado: "2026-08-21",
  },
  {
    id: "wheel",
    titulo: "Wheel: backtest y monitoreo",
    estado: "pendiente",
    prioridad: 5,
    queEs: "Falta hacerle lo mismo que al credit spread: backtest completo y forward test en directo.",
    evidencia: ["los 5 activos medidos salen positivos pero ninguno es concluyente (HOOD +0,52, PLTR +0,48)"],
    pega: "La inclinación es débil; sólo un forward test puede resolverla.",
    actualizado: "2026-08-21",
  },
  {
    id: "trimestre-semestre",
    titulo: "Trimestre y semestre",
    estado: "pendiente",
    prioridad: 6,
    queEs: "Los dos huecos vacíos de la combinación por horizontes.",
    pega:
      "El semestral no llega al mínimo de muestra con 8 tickers (170 < 200). Hay que bajar unos 20 símbolos más antes de poder medirlo.",
    actualizado: "2026-08-21",
  },
  {
    id: "clave-theta",
    titulo: "Rotar la clave de ThetaData",
    estado: "pendiente",
    prioridad: 7,
    queEs:
      "La clave va como argumento de java, o sea visible en la lista de procesos para cualquier cosa que corra en la máquina.",
    siguiente: "Rotarla y pasarla por variable de entorno cuando se suelte el Terminal.",
    actualizado: "2026-08-21",
  },
  {
    id: "nombre",
    titulo: 'Quitar el nombre "Tito Metralleta"',
    estado: "pendiente",
    prioridad: 8,
    queEs: "De todas partes del repo.",
    pega:
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
    pega:
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
    pega:
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
    titulo: "EVA · el scorecard",
    estado: "cerrado",
    queEs: "El sistema de puntuación con pesos, medido en grande y con precios reales.",
    evidencia: [
      "19.465 operaciones: no separa. Una ventaja del 10% se habría visto y no está",
      "comprando a largo: 0 de 12, concluyente. El +0,7% que parecía hallazgo era peaje de liquidez",
      "ninguno de sus ingredientes es estable: el proxy de IV pasa de t=+6,7 a t=−3,8 en el período siguiente",
    ],
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
    pega: "Describe, no predice. Falta medir la versión VIVA, que es lo pendiente número 1.",
    actualizado: "2026-08-21",
  },
  {
    id: "cerrado-venta-prima",
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
    pega: "Lo único que escala el cóndor es el tamaño, y el tamaño escala el susto igual.",
    actualizado: "2026-08-21",
  },
];

export const RESUMEN = {
  desde: "2026-07-24",
  loQueFunciona: ITEMS.filter((i) => i.estado === "funciona").length,
  enPrueba: ITEMS.filter((i) => i.estado === "en-prueba").length,
  pendiente: ITEMS.filter((i) => i.estado === "pendiente").length,
  cerrado: ITEMS.filter((i) => i.estado === "cerrado").length,
};
