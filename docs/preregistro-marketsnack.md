# Pre-registro — ¿vale MarketSnack los $99 al mes?

**Escrito el 2026-08-12, ANTES de bajar o mirar un solo dato.** Ese es todo su sentido: si el
listón se fija después de ver los resultados, se fija donde los resultados lo permitan, y eso
pasa sin querer y sin mala fe. Ya nos costó meses una vez.

**Regla que no se toca:** este documento no se edita después de ver una medición. Si al medir
descubro que el diseño tenía un fallo, se anota el fallo **debajo**, con fecha, y se dice
claramente que el resultado ya no es un test limpio sino una exploración.

---

## La pregunta

Lester paga un mes. Su criterio, en sus palabras: *"no quiero pagar un segundo mes a menos que
tengamos una razón poderosa, y la razón poderosa es que podemos hacer dinero sustancial con su
plataforma."*

Y hay que encuadrarla bien, porque el 2026-08-12 por la mañana conseguimos **flujo de opciones
en tiempo real propio**, de ThetaData, que Lester ya paga. Así que la pregunta no es "¿sirve el
flujo de opciones?" sino:

> **¿Qué tiene MarketSnack que ThetaData no me da, y eso predice el precio lo suficiente
> como para ganar dinero después de costes?**

Lo que solo tienen ellos:
1. **`score`** — su puntuación propietaria (0-100). No la podemos reproducir.
2. **`sentiment`** — su etiqueta (bullish / bearish / neutral).
3. **Amplitud** — todos los tickers. Nosotros vigilamos 62 contratos de SPX.
4. **Su clasificación `side`** en operaciones donde nosotros no llegamos.

---

## Qué se mide

**Muestra:** operaciones del mercado entero con prima ≥ $1.000.000, sobre todo el histórico que
su API permita alcanzar. Se registra tal cual viene: `symbol, timestamp, score, sentiment, side,
premium, size, price, delta, gamma, implied_volatility, open_interest, asset_price`.

**Resultado a explicar:** el rendimiento del **subyacente** (no de la opción) desde el precio en
el momento de la operación (`asset_price`, que ellos ya dan) hasta el cierre de +1, +3 y +5 días
de mercado. El precio de cierre sale de ThetaData, no de ellos: **no se valida a alguien con sus
propios datos.**

**Las tres hipótesis, en orden:**
- **H1** — El `score` predice: a mayor score, mayor rendimiento posterior en la dirección que
  marca `sentiment`.
- **H2** — El desequilibrio compra/venta por ticker y día predice el rendimiento del día siguiente.
- **H3** — Su `side` aporta algo sobre lo que ya deducimos nosotros con bid/ask.

---

## Qué contaría como ÉXITO

Las cinco condiciones son **conjuntas**. Fallar una es fallar.

**1. Monotonía.** Ordenando por `score` en cinco grupos, el rendimiento tiene que subir de forma
monótona. No vale "el grupo de arriba gana": con miles de tickers, algún grupo gana siempre por
azar. Ver [[plan-mejorar-conviccion-eva]], donde esto ya fue el criterio.

**2. Significancia con muestra real.** t > 2 en la diferencia entre el grupo alto y el bajo, con
**n ≥ 200 eventos independientes**. Independientes quiere decir: no cuentan diez operaciones del
mismo ticker el mismo día como diez datos. Se agrega por ticker-día.

**3. Aguanta fuera de muestra.** Se parte el histórico por la mitad en el tiempo. El efecto tiene
que aparecer en **las dos mitades** con el mismo signo. Una sola mitad no cuenta.

**4. Sobrevive a los costes reales.** Los cuatro barrotes de siempre: bid/ask reales (no punto
medio), comisiones de Robinhood, strikes y vencimientos que existan, y filtro de cotizaciones
rotas. Recordar [[hallazgo-horquilla-porcentaje-de-la-prima]]: la horquilla se come un porcentaje
de la **prima**, no del nocional, y eso ha matado todo lo anterior.

**5. El listón de dinero.** Traducido a dólares al año sobre la cuenta real de Lester
($55.419, ver [[cuenta-real-de-lester]]), y **restando los $1.188 de la suscripción**, tiene que:
- superar a comprar y mantener SPY (~14%/año, ver [[conclusion-comprar-spy-gana]]), **y**
- dejar al menos **$5.000 al año netos**, a un tamaño cuya peor caída histórica él aceptaría.

Menos de eso no es "sustancial": es trabajar gratis con riesgo.

---

## Qué contaría como FRACASO — y qué se hace entonces

| resultado | decisión |
|---|---|
| Falla cualquiera de las 5 | **No renovar.** Se dice tal cual, sin adornos. |
| Sale bien pero solo en una mitad | **No renovar.** Es el patrón clásico de sobreajuste. |
| No hay histórico suficiente para n ≥ 200 | **No renovar.** "No sabemos" no justifica $1.188 al año. |
| Sale bien y cumple las cinco | **Renovar**, y montar la estrategia en papel antes de dinero real. |

**Un fracaso aquí no es un fracaso del mes.** Saber que el score no predice vale los $99: evita
pagar $1.188 al año durante años. Lo caro no es la suscripción, es quedarse con la duda.

---

---

# AMPLIACIÓN — 2026-08-12, después del primer veredicto

H1 y H2 fallaron limpiamente. Lester pide buscar más a fondo: *"Mucha gente usa esta aplicación
para tomar decisiones de inversión. Si esta aplicación puede ayudarnos a obtener una ventaja en el
mercado, necesito que la encuentres. Haz todas las pruebas que quieras."*

**Se declara la batería ENTERA aquí, antes de correr ninguna.** Es la única defensa contra
quedarme con la que gane por azar.

## El listón sube, porque son muchas pruebas

Con ~8 familias × 4 horizontes ≈ **32 pruebas**, al 5% habitual saldrían 1-2 "significativas"
solo por suerte. Corrección de Bonferroni: 0,05 / 32 ≈ 0,0016.

> **Umbral nuevo: |t| > 3,1** para que una prueba cuente. Además de monotonía y de aguantar en
> las dos mitades, que siguen siendo obligatorias.

**Corrección del mismo día, antes de correr nada:** Lester precisó que le interesan tres plazos —
*"day y swing principalmente"* y luego *"también para inversiones de meses"*. Se añaden los
horizontes **+21 días (~1 mes)** y **+63 días (~3 meses)**. Eso lleva las pruebas de ~32 a ~48,
así que el umbral sube a **|t| > 3,3** (0,05/48).

⚠️ Con datos del 15 de abril al 12 de agosto, un horizonte de 63 días **solo es medible para las
señales de las primeras semanas**. La muestra se encoge mucho y hay que enseñar la n al lado de
cada resultado: una t alta con n pequeña no vale nada.

Horizontes finales: **0 (intradía, day trading) · 1 · 3 · 5 (swing) · 21 · 63 (meses)**.

Cualquier cosa que pase esto se vuelve a probar **sobre un trozo de datos que no haya tocado**
antes de creérsela.

## Las pruebas, declaradas

| # | Qué |
|---|---|
| **A** | **Horizonte intradía.** Del precio en el momento de la operación (`asset_price`, que ellos dan) al cierre del MISMO día. Es el horizonte natural de una alerta en vivo. |
| **B** | **Comprar la OPCIÓN, no el subyacente.** Precio real de la opción de ThetaData, cruzando la horquilla entera. Es lo que haría de verdad quien sigue sus alertas. |
| **C** | **Valor como buscador.** ¿Un ticker-día que aparece en su cinta se mueve más que el mismo ticker en días donde no aparece? Prueba la "actividad inusual", no la dirección. |
| **D** | **Solo los extremos.** Score ≥ 90 y score ≥ 95 por separado. Puede que la señal viva solo en la cola. |
| **E** | **Rareza, no puntuación.** Prima del día frente a la prima típica de ese ticker. La misión original del agente es actividad *inusual*. |
| **F** | **Solo lo más agresivo.** Únicamente `ABOVE_ASK` y `BELOW_BID` — quien cruza por encima del ask tenía prisa de verdad. |
| **G** | **Sin índices.** SPX y SPXW son el 47% de la muestra y se comportan distinto. Quizá la señal esté en acciones sueltas y los índices la tapan. |
| **H** | **Solo prima muy grande.** ≥ $5M y ≥ $10M. Puede que el dinero de verdad esté más arriba. |

**Lo que NO se hará:** inventar una prueba nueva después de ver estos resultados y presentarla
como si hubiera estado en la lista. Si aparece una idea nueva, se anota abajo con fecha, se dice
que es posterior, y necesita datos frescos para valer.

---

## Trampas conocidas de las que hay que cuidarse

- **Sobreajuste por amplitud.** Con miles de tickers y varios horizontes hay cientos de
  combinaciones. Si pruebo veinte y me quedo con la mejor, encuentro señal en datos aleatorios.
  Las hipótesis y los horizontes están fijados **arriba** y no se amplían.
- **Mirar el futuro por la etiqueta de tiempo.** Ver [[trampa-etiquetas-de-tiempo]]: una barra se
  etiqueta por su INICIO. El precio de salida tiene que ser posterior al `timestamp` de la
  operación con margen, nunca de la misma barra.
- **La hora del mercado.** Ver [[hora-mercado-nunca-con-tz]]: nunca con `TZ` en Git Bash.
- **Confundir estructura con dirección.** Un desequilibrio vendedor persistente puede ser
  creadores de mercado haciendo su trabajo, no bajistas. Hay que separarlo antes de creérselo.
- **Validar a alguien con sus propios datos.** Los precios de salida vienen de ThetaData.

---

## Registro de lo que se vaya haciendo

*(se rellena según avance; el diseño de arriba no se toca)*

- **2026-08-12** — Escrito. Cookie funcionando. Comprobado que `flow_feed` pagina hacia atrás y
  **cruza días** (70 páginas → 1,9 días con filtro de prima ≥ $1M). El parámetro `period` no
  cambia el rango: solo sirve el paginador. Ritmo ≈ 37 páginas por sesión.

- **2026-08-12, prueba de MECÁNICA** (no es el resultado). Se corrió `medir-score.mjs` sobre los
  ~19 primeros días descargados solo para comprobar que el script no revienta. Corre bien:
  49.795 operaciones → 2.863 eventos ticker-día → 2.513 con rendimiento calculable.
  **El diseño de arriba NO se ha tocado y no se va a tocar.** La medición válida es sobre el
  histórico completo.

- **2026-08-12, observación sobre el diseño** (se anota, no se cambia nada): **el `score` no es
  continuo, está agrupado.** Las medias por quintil salen 9,7 · 58,8 · 72,6 · 76,8 · 81,8 — hay
  un salto enorme entre Q1 y Q2 y luego casi nada. O sea que los "quintiles" no parten un
  continuo: en la práctica separan "score cerca de 0" de "todo lo demás". Eso hace que la
  condición de monotonía sea más exigente de lo que yo pensaba al escribirla, porque Q3, Q4 y Q5
  apenas se distinguen entre sí en score. **Se deja como está**: cambiar el criterio después de
  ver la forma de los datos es exactamente lo que este documento existe para impedir. Si al final
  el resultado es "no pasa por monotonía", se dirá también que los grupos altos eran casi
  indistinguibles, para que la conclusión se lea con eso delante.
