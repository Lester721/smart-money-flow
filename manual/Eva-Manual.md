# Manual de Eva

### Guía del agente de opciones

_Cómo leer el flujo institucional para tomar decisiones informadas._

> Eva no es asesor financiero ni ejecuta órdenes. Te da contexto; las decisiones y el riesgo son tuyas.


## 1. ¿Qué es Eva?

Eva es un agente de análisis de **opciones**. Su trabajo es detectar **actividad inusual del dinero institucional** y darte **contexto accionable**: hacia dónde apuesta el dinero grande, con cuánta convicción, dónde están los muros de precio, y qué tan fiable es la señal.

Eva **no predice el futuro** ni **ejecuta órdenes**, y **no es asesoría de inversión**. Te da inteligencia; las decisiones y el riesgo son tuyos.


## 2. Las 4 secciones del navegador

| Sección | Para qué sirve |
|---|---|
| Ticker | Análisis completo de una acción: sentiment, flujo, muros y sub-agentes. |
| Ideas | Radar de TODO el mercado: dónde hay flujo institucional notable ahora mismo. |
| Wheel | Screener de la estrategia Wheel (venta de puts cash-secured para ingreso). |
| Time & Sales | El tape en crudo: cada operación notable con su agresor y griegas. |


## 3. La vista Ticker: Estudiante vs Pro

Arriba de todo eliges el modo:

| Modo | Qué ves |
|---|---|
| Estudiante | Lo esencial y simple: un veredicto, 3 escenarios (alcista/base/bajista) y el precio esperado. |
| Pro | Todo el detalle: el resumen, el sentiment, los 6 sub-agentes, los muros y el feed de operaciones. |

Recomendación: empieza en **Estudiante**; sube a **Pro** cuando quieras el detalle.


## 4. El resumen en lenguaje sencillo

Al **tope del modo Pro** hay un párrafo que traduce todos los números a una frase que puedes leer en 5 segundos. Ejemplo real (AAPL):

> 📉 El flujo se inclina bajista — Flujo institucional pesado en AAPL ($24.1M notable), concentrado en calls y puts, ejecutado agresivo (comprando al ask) — 73% del dinero entró al ask, Convicción 8/10. El posicionamiento se inclina BAJISTA.

Léelo primero; luego baja y ata cada dato con el detalle. **Este resumen se arma solo con los datos reales, no lo inventa ningún modelo.**


## 5. AI Sentiment Score (direccional)

Este medidor te dice **dos cosas separadas**:

| Qué es | Qué mide |
|---|---|
| DIRECCIÓN (etiqueta + marcador) | Hacia dónde apuesta el flujo: Bearish (bajista) · Neutral · Bullish (alcista). |
| FUERZA (0-100) | Qué tan fuerte es la señal (promedio de los 6 sub-agentes). Alta ≥60, media 45-59, baja <45. |

![El medidor: la barra va de Bearish a Bullish y el marcador señala la DIRECCIÓN del flujo; la fuerza (0-100) es un dato aparte.](img/sentiment.png)

_El medidor: la barra va de Bearish a Bullish y el marcador señala la DIRECCIÓN del flujo; la fuerza (0-100) es un dato aparte._

**Importante:** una señal puede ser **fuerte pero bajista** (mucho dinero comprando puts agresivo). Por eso Eva separa dirección de fuerza — no confundas 'fuerte' con 'alcista'.


## 6. Los 6 sub-agentes (el corazón de Eva)

El sentiment sale del promedio de estos 6. Cada uno mira una cosa distinta:

| Sub-agente | Qué mide / qué buscar | Peso |
|---|---|---|
| Agresividad | ¿Compran al ASK con fuerza? Mucho dinero al ask = urgencia direccional. | 20% |
| Convicción | Calidad del flujo: spread apretado, un solo lado dominante, ejecución fuerte. | 20% |
| Inusualidad | ¿Griegas de grado institucional? Tamaño, delta alta, vencimientos, gamma. | 20% |
| Estructura | ¿Dónde se acumula el dinero? (muros GEX) y la liquidez de la cadena. | 15% |
| Contexto IV | ¿La volatilidad implícita está limpia o inflada? Evita pagar prima cara. | 10% |
| Confirmación de Precio | ¿El precio VALIDÓ flujos pasados o los absorbió? (el backtest, ver §9). | 15% |

![Cada sub-agente puntúa 0-10; el AI Sentiment Score es su promedio ponderado por los pesos.](img/subagentes.png)

_Cada sub-agente puntúa 0-10; el AI Sentiment Score es su promedio ponderado por los pesos._


### El scorecard puesto a prueba (bitácora — se actualiza)

No basta con saber qué mira cada sub-agente: hay que medir cuáles de verdad dan ventaja. Aquí anoto cada avance de backtest, con números reales, para irte enseñando el score. (n = tamaño de la muestra: cuántos casos entraron en la prueba; mientras más grande, más confiable el %.)

| Fecha | Qué se probó | Resultado |
|---|---|---|
| 2026-07-31 | Comprar el contrato del flujo (**calls y puts**, en largo; sostener 10 sesiones) filtrando por la señal **Inusualidad** — que ya junta 6 sub-señales: **tamaño + delta + theta + gamma + patas + vencimiento** — y cruzándola con el **Agresor** (compra al ask). | **55% de win** con Inusualidad alta (vs 39% baja). El cruce con el agresor apuntó igual, con muestra chica. Preliminar: **n = 29 casos**, 3 tickers; falta re-correr limpio. |

_Resultados preliminares de backtest, NO promesas ni consejo. El fin es didáctico: aprender, con evidencia, qué señales separan ganadores de perdedores. Un número prometedor con muestra chica puede evaporarse con más datos._


## 7. Muros de strikes (GEX) y movimiento esperado

En la tarjeta PRO 'Strike Walls' ves:

| Elemento | Qué significa |
|---|---|
| Muro de calls (dorado) | Strike con mucho dinero en calls arriba del precio = suele actuar de RESISTENCIA. |
| Muro de puts (morado) | Strike con mucho dinero en puts abajo del precio = suele actuar de SOPORTE. |
| Nivel imán | El nivel de mayor peso: hacia donde el precio tiende a gravitar. |
| Cono de movimiento esperado | El rango estadístico (±1σ ≈ 68%, ±2σ ≈ 95%) según IV y tiempo. |

![Oro = muros de calls (resistencia) arriba del precio; morado = muros de puts (soporte) abajo; la franja es el cono ±1σ.](img/walls.png)

_Oro = muros de calls (resistencia) arriba del precio; morado = muros de puts (soporte) abajo; la franja es el cono ±1σ._


## 8. Reglas de liquidez (aviso clave)

> ⚠️ Si la cadena de opciones es POCO LÍQUIDA (bajo volumen/OI, spreads anchos), Eva marca la señal como 'datos poco fiables' y recomienda NO operarla. SIEMPRE lee este aviso primero — una señal sobre datos malos no vale nada.


## 9. Cómo Eva 'aprende' todos los días

Sí, Eva aprende — y aquí está exactamente cómo, dónde y en qué acciones:

| Paso | Qué pasa / dónde |
|---|---|
| 1. Guarda | CADA vez que analizas un ticker (y cada vez que corre el radar /ideas), Eva guarda los flujos que vio. |
| 2. Espera | Deja pasar las sesiones siguientes (hasta ~20 días de mercado). |
| 3. Valida | Mira qué hizo el precio DESPUÉS: ¿validó el flujo (se movió a favor) o lo absorbió? Mide cuánto se movió a favor y en contra, y cuántas sesiones tardó. |
| 4. Puntúa | De ahí sale el sub-agente 'Confirmación de Precio' y la 'Memoria': el HIT RATE histórico de ese ticker. |

**En cuáles acciones corre:** al cargar cualquier ticker (rutas de validación y predicción) y en el radar de Ideas. **Mientras más uses Eva en un ticker, más historial acumula y más confiable se vuelve su lectura de '¿este patrón ha funcionado antes?'.**

> 💡 Esto es la base de la CONFIANZA: no 'creemos' que la señal funciona — Eva lo mide contra lo que el precio realmente hizo. (Próximo paso pendiente: un 'chequeo de confianza' que mida el backtest de los 6 sub-agentes uno por uno.)


## 10. Ejemplos de estrategia (educativo, NO consejo)

Cómo la información de Eva **suele mapearse** a estrategias comunes de opciones. Son ejemplos educativos, no recomendaciones:

| Lo que Eva muestra | Estrategia que algunos usan |
|---|---|
| Sesgo alcista + convicción alta | Comprar calls, o un call debit spread (direccional, riesgo definido). |
| Sesgo bajista + convicción alta | Comprar puts, o un put debit spread. |
| Muro de calls fuerte arriba (resistencia) | Call credit spread por debajo del muro (apuesta a que no lo rompe). |
| Muro de puts fuerte abajo (soporte) | Cash-secured put en el soporte (la Wheel) para cobrar prima. |
| IV inflada (Contexto IV bajo) | Vender prima (credit spreads); comprar prima sale caro. |
| IV baja + señal direccional | Comprar prima (calls/puts) sale más barato. |

_Ninguna de estas es una recomendación. Cada estrategia tiene riesgo; el tamaño y la decisión son tuyos._


## 11. Mis recomendaciones (de Claude)

| Recomendación | Por qué |
|---|---|
| Lee SIEMPRE el aviso de liquidez primero | Una señal sobre datos poco fiables no sirve, por buena que se vea. |
| El flujo es una pista, no una confesión | Ese call/put institucional PUEDE ser un hedge, no una apuesta. No lo sigas a ciegas. |
| Gestión de riesgo > cualquier señal | La consistencia se gana NO perdiendo: tamaño de posición, no arriesgues lo que no puedes perder. |
| Usa la Memoria / Confirmación de Precio | Deja que el backtest te diga cuánto confiar en cada ticker, con números. |
| Empieza chico, valida, escala | Prueba la señal con tamaño pequeño antes de apostar en serio. |

_Eva y yo no somos asesores financieros. Damos contexto y análisis; las decisiones de inversión — y su riesgo — son enteramente tuyas._


## 12. Glosario

| Término | Qué es |
|---|---|
| Agresor (ask/bid) | Quién forzó la operación: al ASK = comprador agresivo; al BID = vendedor agresivo. |
| Premium | El dinero total de una operación (precio × contratos × 100). |
| Notional | El valor nominal expuesto (OI × 100 × strike). |
| Open Interest (OI) | Contratos abiertos vivos en ese strike. |
| Delta | Cuánto se mueve la opción por $1 del subyacente. Cerca de ±1 = muy direccional. |
| Gamma | Qué tan rápido cambia la delta. Zona institucional ~0.01-0.08. |
| Theta | El decaimiento diario por el paso del tiempo (juega en contra del comprador). |
| IV (volatilidad implícita) | La volatilidad que el mercado le pone al precio de la opción. |
| GEX (Gamma Exposure) | Dónde se concentra la gamma de la cadena = los 'muros' de soporte/resistencia. |
| Muro | Un strike con tanto dinero/gamma que el precio tiende a frenarse ahí. |
| Cono (±1σ/±2σ) | El rango de precio esperado por estadística (68% / 95%). |
| Multileg | Una operación de varias patas a la vez (spread) — más difícil de leer que una sola pata. |
| LEAP | Opción de vencimiento largo (~1 año o más). |
| Hit rate | % de veces que el precio validó el flujo históricamente (el backtest de Eva). |
| n (tamaño de muestra) | Cuántos casos entraron en una prueba. Un % sobre n grande es más confiable que sobre n chico. |
