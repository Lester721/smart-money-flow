# Research: mejorar el credit spread + diseñar el 0DTE

**Fecha:** 8 de agosto de 2026 · **Estado:** propuestas, NADA aplicado todavía.

Lester pidió research de verdad —literatura, traders reconocidos, evidencia— para (a) mejorar la
estrategia de credit spread y (b) diseñar una de 0DTE. Pidió expresamente ver las propuestas
antes de que se toque el código.

---

## PARTE 1 — Su historial real de QQQ (el hallazgo más importante)

Antes de leer a nadie: se midieron sus 104 días operados en QQQ (abr 2024 – may 2025, vía la
API de Robinhood). Lo que recuerda y lo que pasó no coinciden.

### Lo que pasó de verdad

| | |
|---|---|
| P&L total | **+$5.908** — fue rentable, no perdió |
| Días operados | 104 · **81% ganadores** |
| Ganancia media | $187 · **Pérdida media $490** (2,6×) |
| Mejor día | +$990 · Peor día **−$2.500** |

### Y el reparto que lo explica todo

| Periodo | Días | P&L | Media/día |
|---|---|---|---|
| **16 abr – 2 ago 2024** | 43 | **+$10.219** | +$238 |
| 5 ago 2024 – may 2025 | 61 | **−$4.311** | −$71 |

Los meses: abr +629, may +2.406, jun +1.020, **jul +5.174**, **ago −3.250**, y después
**nueve meses que sumaron −$71**. No fueron "dos pérdidas fuertes": fue un edge que existió
cuatro meses y luego desapareció durante nueve.

### Qué cambió el 5 de agosto de 2024

Es la fecha del desarme del *carry trade* del yen — el mayor salto de volatilidad desde 2020.
Antes: mercado alcista y tranquilo, VIX 12–14. Vender puts en ese régimen imprime dinero, y
eso **no es habilidad, es beta a un mercado calmado**.

Sus peores días fueron el 7 jun (−$2.100), 22–23 ago (−$3.390) y 29 ago (−$1.844).

### El tamaño era el problema, no la estrategia

En julio operaba **80–90 contratos**. Un credit spread de QQQ con $1 de ancho arriesga $100 por
contrato → **$9.000 de riesgo máximo por operación**.

Con SU distribución real de 104 días, el criterio de Kelly da **30,4%** del capital, y el
Kelly/4 que se usa en la práctica, **7,6%**.

> ⚠ Calculado solo sobre la racha buena, Kelly daba **75,6%**. La diferencia entre 75,6% y
> 30,4% *es* el sesgo de selección. Simular hacia adelante un periodo elegido porque fue bueno
> da cifras absurdas (salieron $23.000 millones). Se descartó y se rehízo con los 104 días.

**20.000 simulaciones de 250 días sobre su distribución real, cuenta de $60.000:**

| Riesgo/op | Mediana | Percentil 5 | Caída típica | Prob. de perder |
|---|---|---|---|---|
| 0,5% | $69.270 | $60.842 | 5% | 3% |
| 1% | $79.882 | $61.432 | 10% | 4% |
| **2%** | **$103.254** | **$61.344** | **19%** | **4%** |
| 3% | $130.563 | $58.000 | 28% | 6% |
| 5% | $193.508 | $47.403 | 45% | 8% |
| 10% | $282.294 | $11.440 | **78%** | **21%** |

El mismo edge, cambiando solo el tamaño, va de "duplicar la cuenta con una caída del 19%" a
"perder el 80% una de cada cinco veces". **Este supuesto es generoso**: asume que el edge de
2024-25 se repite, y los nueve meses posteriores a agosto dieron −$71.

---

## PARTE 2 — Lo que dice la evidencia

### 2.1 · El 0DTE incondicional NO tiene edge después de costes

El estudio más directo (7 familias de estrategias, entrada 10:00 ET, coste = medio spread +
0,5 pb de slippage):

| Estrategia | Sharpe bruto | **Sharpe neto** |
|---|---|---|
| Iron butterfly / condor | 0,77 | **−0,20** |
| Straddle / strangle | 0,56 | 0,39 |
| Put ratio spread | 1,18 | **0,93** |
| Cesta diversificada (top 3) | 1,12 | **0,82** |

Conclusión textual: *la exposición incondicional a 0DTE es difícil de justificar como
asignación permanente*. La prima de riesgo de varianza existe pero es **económicamente
pequeña**, y los costes se comen la mayor parte.

**Lo que sí sobrevive** necesita tres cosas: (1) tratar el *timing* como **clasificación
direccional**, no como predicción de retorno; (2) diversificar entre estructuras; (3)
presupuesto explícito de riesgo de cola.

> El iron condor —la estructura que más se vende en cursos de 0DTE— es justo la que pasa de
> +0,77 bruto a **−0,20 neto**.

### 2.2 · El tamaño de posición es donde está la mejora medible

*Sizing the Risk: Kelly, VIX, and Hybrid Approaches in Put-Writing on Index Options* (2025)
compara tres métodos sobre venta de puts de índice:

| Método | Config | Retorno anual | Caída máxima |
|---|---|---|---|
| Kelly | 1 DTE, 5% OTM | 20–25% | **<1%** |
| VIX-Rank | 5 DTE, ATM | 66,9% | severa |
| **Kelly-VIX híbrido** | 5 DTE, 5% OTM | 10–11% | **<11%** |

Fuera de muestra (2024): el híbrido dio 22–23% con 9–10% de caída. La regla del híbrido es
simple: **multiplicar la fracción de Kelly por (1 − percentil del VIX)** — se encoge cuando la
volatilidad está alta y se expande cuando está tranquila.

Y dos hallazgos que tocan directamente nuestra estrategia:
- **Lejos del dinero gana**: 5–10% OTM da mejor retorno ajustado a riesgo que ATM.
- **Plazo ultra-corto gana** en ratio de información: 0–1 DTE por encima de 5 DTE.

### 2.3 · La gamma de los dealers es real e intradía

Más del **59% del volumen de opciones del SPX es 0DTE**. Una opción que expira hoy tiene gamma
extrema, y un solo strike puede generar más flujo de cobertura que toda una cadena mensual.

Con gamma positiva los dealers **amortiguan** (venden subidas, compran caídas) y el precio se
"clava" en los strikes; con gamma negativa **amplifican**. Por la tarde la gamma ATM del 0DTE
se vuelve extrema y el clavado al strike más cercano es más fuerte.

**Esto coincide exactamente con lo que medimos nosotros el 8 ago 2026**: el efecto de la gamma
es +0,354 a un día y +0,171 a diez. Nuestro dato y la literatura dicen lo mismo por caminos
independientes.

### 2.4 · Sobre la prima de riesgo de varianza

La VRP del S&P promedia **2–4 puntos de volatilidad** (Copenhagen Business School). Existe,
pero es pequeña. Euan Sinclair añade el matiz que nos afecta: la tendencia de la IV a superar a
la volatilidad realizada **es consistente en índices y normalmente NO está presente en opciones
de acciones sueltas**.

> Nuestra estrategia opera 6 acciones y 2 índices. Si Sinclair tiene razón, la parte de acciones
> está vendiendo una prima que puede no existir. **Es contrastable con nuestros datos.**

---

## PARTE 3 — Propuestas para el credit spread (NO aplicadas)

Ordenadas por valor esperado. Todas se prueban con el protocolo de siempre: criterio fijado
antes de correr, validación fuera de muestra, y auditoría antes de reportar.

### P1 · Tamaño dinámico por régimen de volatilidad ★ la más prometedora

**Qué:** hoy arriesgamos un 2% fijo por operación. Cambiarlo por `2% × (1 − percentil de rv)`,
que es el híbrido Kelly-VIX de la literatura.

**Por qué:** nuestro propio hallazgo dice *"lo que decide el año no es cuántas ganas sino cuánto
pesan las pocas que pierdes"*. El tamaño ataca la cola directamente; los filtros de dirección no.
Y es lo único de esta lista con evidencia académica reciente y resultado fuera de muestra.

**Criterio de éxito (fijado ya):** debe subir el $/año **y** bajar la caída máxima, en las dos
mitades del periodo. Si solo mejora una, no se adopta.

### P2 · Comprobar la tesis de Sinclair: índices sí, acciones no

**Qué:** partir los 10 años en índices (SPY, QQQ) contra acciones y comparar la prima capturada.

**Por qué:** si la VRP no existe en acciones sueltas, estaríamos vendiendo prima que no está ahí
y todo el edge vendría de los índices — o al revés. Es una pregunta que **ya podemos responder
con los datos en caché**, sin bajar nada.

**Ojo:** nuestro dato actual apunta a lo CONTRARIO (acciones +4,00% vs índices +0,22%). Si se
confirma, contradice a Sinclair y hay que entender por qué antes de fiarse de ninguno de los dos.

### P3 · Barrer distancias más lejanas (5–10% OTM)

**Qué:** hoy vendemos a 1σ. A 5 días con vol del 20%, 1σ ≈ 2,7% — más cerca que el 5–10% OTM
que la literatura encuentra óptimo.

**Cuidado:** ya hicimos un barrido de distancia con validación a ciegas. Esto es **volver a
probar con un rango más ancho**, no repetir lo mismo. Si el resultado anterior se sostiene en el
rango nuevo, se cierra el tema.

### P4 · Diversificar estructuras

**Qué:** hoy solo hacemos credit spread vertical. La cesta diversificada da Sharpe neto 0,82
frente a estructuras sueltas más bajas.

**Por qué es la última:** multiplica la superficie de código y de error, y el beneficio
esperado es menor que el de P1. No antes de que P1 esté resuelta.

---

## PARTE 4 — Diseño de la estrategia 0DTE

### La regla que la gobierna todo

> **No operar 0DTE de forma incondicional.** La evidencia dice que es negativo después de
> costes. Solo tiene sentido como *overlay táctico* con filtro y con presupuesto de cola.

### Los cuatro filtros, y de dónde sale cada uno

| # | Filtro | Origen |
|---|---|---|
| 1 | **Solo SPY/QQQ**, nunca acciones | Nuestro dato: el mecanismo de gamma solo aparece donde el nocional de OI es enorme (ρ=0,83) |
| 2 | **Solo con gamma positiva** | Dealers amortiguan → el precio se clava. A 1 día el efecto es el doble que a 10 (dato nuestro) |
| 3 | **Dirección por convicción de EVA** | "Timing como clasificación direccional, no predicción de retorno" (evidencia) |
| 4 | **Tamaño por régimen** | Kelly-VIX híbrido; y la lección de sus propios $9.000 de riesgo por operación |

### Lo que NO hay que hacer

- ❌ **Iron condor.** Es lo que más se enseña y pasa de +0,77 bruto a **−0,20 neto**.
- ❌ **Vender delta 0,07–0,11 sin filtro.** Es lo que él hacía: 93% de aciertos y aun así el
  edge se evaporó al cambiar el régimen.
- ❌ **Tamaño fijo en contratos.** Es lo que convirtió una buena racha en nueve meses planos.

### Lo que hay que medir antes de arriesgar un dólar

1. ¿El régimen de gamma separa el resultado **intradía**? (a 1 día ya sabemos que sí)
2. ¿Sobrevive a los costes reales? — el spread bid/ask del 0DTE es lo que mató al iron condor
3. ¿La ventana 11:00–13:15 aporta algo, o es indiferente? Su ventana coincide con lo que la
   práctica recomienda (media mañana, tendencia ya establecida), pero **no está medido**

### Lo que costaría

| | |
|---|---|
| Spot intradía | ✅ `fetchSpotSeries`, sin suscripción de acciones |
| OI del día (incl. dte=0) | ✅ ya en caché |
| Precios de opciones 0DTE | ✅ mismo endpoint EOD |
| **Descarga intradía** | ⚠ 390 datos/día en vez de 1 — acotar a SPY y pocos años |

---

## Resumen en una línea

El research no encontró una estrategia mágica: encontró que **el tamaño de posición es la
variable que más mueve el resultado**, que el 0DTE incondicional pierde después de costes, y
que el mecanismo de gamma que ya confirmamos es exactamente el que la literatura describe.

## Fuentes

- [0DTE Option Pricing — Bandi, Fusari, Renò (SSRN, Journal of Finance)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4503344)
- [Risk and reward: New insights on 0DTE option trading — JHU Carey](https://carey.jhu.edu/news/risk-reward-insights-0dte-option-trading)
- [Sizing the Risk: Kelly, VIX, and Hybrid Approaches in Put-Writing on Index Options (arXiv 2508.16598)](https://arxiv.org/html/2508.16598v1)
- [0DTE strategies — paper anotado (estrategias, Sharpe bruto vs neto)](https://github.com/vilkovgr/0dte-strategies/blob/main/docs/paper/paper-annotated.md)
- [0DTEs: Trading, Gamma Risk and Volatility Propagation — Dim](https://westernfinance-portal.org/viewpaper?n=950096)
- [0DTE Index Options and Market Volatility — Cboe](https://cdn.cboe.com/resources/education/research_publications/gammasqueezes.pdf)
- [Understanding 0DTE Gamma Exposure — MenthorQ](https://menthorq.com/guide/understanding-0dte-gamma-exposure/)
- [Book Review: Positional Option Trading, Euan Sinclair — Robot Wealth](https://robotwealth.com/positional-option-trading-by-euan-sinclair-a-review/)
- [Systematic Short-Vol Strategies: harvesting the VRP — StrikeWatch](https://www.strike-watch.com/lab/variance-risk-premium-systematic-trading-guide)
