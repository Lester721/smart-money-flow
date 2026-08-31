# LA PALANCA — estado al 30 de agosto de 2026

> **Este documento SUSTITUYE a `LA-PALANCA-CONGELADA.md` (29 de agosto).** Aquel congeló una
> regla que hoy se ha medido en profundidad. Se conserva como histórico, no como referencia.

Lester, al final del día: *«¿ya tienes grabado cuáles son las reglas del grupo 27 y cuáles las
del grupo A?»*. La respuesta corta está abajo, y no es la que la pregunta esperaba.

---

## 1 · NO HAY «REGLA DE LOS 27» NI «REGLA DEL GRUPO A»

La idea de Lester —acciones distintas, tratamiento distinto— **es correcta y está medida**. Lo
que NO es el eje correcto es el grupo. Medido sobre 351 operaciones independientes:

| eje | separa | ¿funciona dentro del otro grupo? |
|---|---|---|
| grupo (27 = tecnología · A = defensivas) | +0.075 contra +0.133 | — |
| **volatilidad del subyacente** | **tranquilas +0.145 (t=2,18) · medias +0.074 · movidas +0.063** | **sí, 4 de 4 casillas** |

|  | tranquilas | movidas |
|---|---|---|
| los 27 | +0.088 | +0.048 |
| grupo A | +0.133 | +0.086 |

Las cuatro apuntan igual, así que la volatilidad **no es un disfraz** del «27 contra A».

**Y por qué no se puede hacer por nombre:** hay 351 operaciones independientes repartidas en 51
tickers = **7 por acción**. Con 7 datos no se calibra, se memoriza. Además una regla que dice
«a NVDA trátala así» no se puede probar jamás en un nombre nuevo: no es estrategia, es una lista.
La volatilidad se mide de antemano y **se aplica a una acción que no has visto nunca**.

⚠️ **Mecanismo NO explicado.** Mi hipótesis era que un −11% es 2 sigmas en PG (vol 19%) y menos
de 1 en AMD (vol 58%). Si fuera eso, normalizar el corte en desviaciones igualaría los tercios.
**No los iguala**: con corte en sigmas las tranquilas dan +0.347 (t=3,07) y las medias +0.059.
Hay algo real en las acciones tranquilas que no es sólo «el suceso es más raro». No sé qué es.

---

## 2 · LO QUE MURIÓ HOY

| | veredicto |
|---|---|
| **el umbral del 3%** (examen del grupo A) | **SUSPENDE.** Sharpe 0,60 contra 0,63 exigido. Y el pico del barrido se MUEVE: 2% en los 27, 5% en el A. Firma de ruido. **Retirado, no ajustado** |
| **el mínimo de $5.000 por contrato** | **no aporta nada.** −$2.348/año, Sharpe idéntico. Nació como ETIQUETA de una tabla en `r7` y en `r135` lo convertí en filtro sin medir. Entró en la regla congelada porque escribí el documento leyendo el código |
| **el aguante de 60 sesiones** | **destroza los dólares** en los dos grupos: 27 de $28.034 → $6.887 · A de $30.854 → $19.072 |
| **la rama de ARRIBA** (lejos de la media por arriba) | **muerta.** +5% arriba da −0.004. Juntar los dos lados EMPEORA (+0.095 contra +0.167). El efecto es *hundida*, no *lejos* |
| **la profundidad de la call** | **no importa.** El efecto baja con la profundidad pero la t se queda plana (2,01 · 2,20 · 2,07 · 2,22). Elegir profundidad es elegir beta, no ventaja |

---

## 3 · LO QUE SOBREVIVIÓ

**El gradiente de lo hundido.** Cuanto más por debajo de su media compra, más paga. Sobre 27+A
juntos, sin solapar (una entrada por ticker cada 180 días):

| corte | n | x dentro | x fuera | dif | t |
|---|---|---|---|---|---|
| −10% o más | 139 | 1.277 | 1.110 | +0.167 | 2.10 |
| −13% o más | 87 | 1.478 | 1.107 | +0.371 | **3.60** |

**Monótono** — cada escalón sube el efecto y sube la t. El ruido da picos que saltan; esto no.

**La media de 50 días le gana a la de 20**, a misma frecuencia, en **los 7 controles**
(10d t=2,15 · 20d t=2,11 · **50d t=2,83** · 100d t=2,74 · 200d t=2,06).

**Y la entrada nueva le gana a la vieja en cartera cuando hay muestra** — 10 de 10 con 8 a 20
huecos, en los dos grupos:

| huecos | 27: vieja → nueva | A: vieja → nueva |
|---|---|---|
| 8 | 0.41 → **0.54** | 0.62 → **0.69** |
| 10 | 0.42 → **0.59** | 0.64 → **0.71** |
| 12 | 0.50 → **0.61** | 0.62 → **0.68** |
| 16 | 0.58 → **0.62** | 0.66 → **0.70** |
| 20 | 0.62 → **0.66** | 0.70 → **0.73** |

---

## 4 · EL PROBLEMA QUE NO SE HA RESUELTO

**Cuanto más fiable se vuelve la medición, más converge LA PALANCA a SPY.**

| a 20 huecos (donde el número significa algo) | al año | Sharpe | caída |
|---|---|---|---|
| los 27, entrada nueva | $18.158 | 0.66 | −36% |
| grupo A, entrada nueva | $21.563 | 0.73 | −35% |
| **comprar SPY y dormir** | **$19.039** | **0.70** | **−34%** |

Los **$37.222/año publicados en la web** viven en 2 huecos, que es exactamente donde el número
no significa nada: dos versiones de la misma regla con 2 huecos comparten **0 de 49** operaciones.
El 43% de ese dinero es UNA operación (AMD, 25-ago-2025).

⚠️ **LA WEB SIGUE PUBLICANDO ESA CIFRA.** Pendiente de decisión de Lester: bajarla o avisarla.

---

## 5 · SIN MÍNIMO DE COSTE — decidido, para LOS DOS GRUPOS

**Lester, 30-ago-2026: «nos quedamos sin mínimo entonces».** El mínimo de $5.000 **sale de la
regla, en los 27 y en el grupo A.**

Medido limpio (MISMO fichero, misma elección de contrato, sólo se enciende y apaga el filtro),
con la entrada nueva y 2 huecos:

| | sin mínimo | con $5.000 |
|---|---|---|
| los 27 | **$45.100 · Sharpe 0.70** | $10.724 · 0.41 |
| grupo A | **$84.248 · Sharpe 0.97** | $33.299 · 0.73 |

### ⚠️ NO es lo mismo que se midió por la mañana, y no es una contradicción

Son **dos preguntas distintas** y las mezclé una vez:

| | qué compara | resultado |
|---|---|---|
| **FILTRAR** (r166, r187) | mismo fichero, misma elección de contrato, se descartan los baratos | depende de la entrada — ver abajo |
| **SUSTITUIR** (r186) | fichero construido con el mínimo: `elegir()` coge otro contrato más profundo o más largo | cambian DOS cosas a la vez, **no vale** para aislar el filtro |

Y filtrar **interactúa con la entrada**:

| efecto del mínimo | con la entrada VIEJA (bajo la media de 20) | con la entrada NUEVA (−7% bajo la de 50) |
|---|---|---|
| | **neutro** — Sharpe 0.48 → 0.48, −$2.348/año | **destructivo** — Sharpe 0.70 → 0.41 |

**El mecanismo:** con la entrada nueva, el **72-76% de los contratos elegibles cuestan menos de
$5.000** (mediana $2.680). La entrada nueva busca acciones desplomadas, y una acción hundida
tiene la call 25% dentro más barata. **El mínimo tira justo las operaciones que la regla existe
para cazar.** Con la entrada vieja las candidatas estaban a precio normal y el filtro apenas
mordía — por eso salía neutro.

Además el mínimo **bloquea la diversificación**: exige contratos de $5.000+ y a 10 huecos cada
plaza tiene $1.440-$2.880. Las filas «con $5.000 · 10 huecos» tienen **2, 4, 37 y 42 operaciones**
y clavan los números de SPY (Sharpe 0.70, caída −34%) porque **son** SPY.

---

## 5-bis · LA REGLA DEL GRUPO A — falta que Lester elija la EXPOSICIÓN

> Grupo A · call **25% dentro** · plazo **~400 días** · entrada cuando la acción está **más de un
> 7% por debajo de su media de 50 días** · aguante **120 sesiones** · suelo 0,50x ·
> **SIN mínimo de coste** · **10 huecos** · el ocioso en SPY · comprar al ask, vender al bid.

| exposición total | al año | Sharpe | **caída** | ops |
|---|---|---|---|---|
| LA PALANCA actual | $21.764 | 0.59 | −42% | 49 |
| **24% ← recomendado** | **$26.470** | **0.72** | **−45%** | 185 |
| 48% | $53.078 | 0.79 | −56% | 225 |
| 75% | $101.058 | 0.82 | −65% | 229 |
| comprar SPY | $19.039 | 0.70 | −34% | — |

Recomendado el 24% porque Lester empezó esto diciendo *«todavía no encontramos cómo evitar esa
caída del 43%»*, y el 48% y el 75% dan más dinero **empeorando justo eso**.

**Es lo primero del proyecto que pasa las cuatro pruebas a la vez:** 225 operaciones (no 49) ·
la mayor es el 10-15% del dinero (no el 43%) · 9-10 de 11 años positivos · y los tres umbrales
contiguos (−6/−7/−8%) dan $52.959 / $53.078 / $45.257, o sea que **no es un pico**.

### ⚠️ Esa regla NO funciona en los 27 cuando hay muestra

Ninguna de las 24 casillas probadas supera el Sharpe de SPY en los 27; en el grupo A casi todas.
A 10 huecos con 241 operaciones los 27 dan Sharpe 0,53 contra el 0,79 del grupo A.
A 2 huecos los 27 sí ganan ($45.100), pero ahí la mayor operación es el 58% del dinero.

Eso **le da la razón a Lester**: los dos grupos no responden igual. Ver
`palanca-el-eje-es-la-volatilidad` en memoria. Lo que NO se puede distinguir con 11 años: si es
«defensivas contra tecnológicas» o si al grupo A le tocó una buena década (los 27 arrastran
INTC, WBA, PYPL, DIS).

### ⛔ El filtro de volatilidad: PROBADO Y DESCARTADO como filtro

Por operación es real (tranquilas +0.145 t=2,18 · movidas +0.063 t=0,69, y 4 de 4 casillas dentro
de cada grupo). **Pero como FILTRO en cartera pierde**: deja 9 tickers de 24, las operaciones
caen de 44 a 28 y de 110 a 27, y el dinero se queda en SPY.
Grupo A, 2 huecos: $30.854 → **$16.654**. Pierde en todos los niveles de huecos.
Si sirve para algo será para **PESAR** (más dinero en las tranquilas sin dejar de operar las
demás). **Sin medir.**

## 5-ter · ✅ EL EXAMEN DEL GRUPO B — **APRUEBA** (30 de agosto de 2026)

Criterios congelados en `EXAMEN-grupo-B.mjs` ANTES de construir un solo camino de B.
Exposición **24%**, elegida por Lester.

| | grupo A *(donde se afinó)* | **grupo B** *(nunca visto)* |
|---|---|---|
| al año | $26.470 | **$26.216** |
| %/año | 17,6% | **17,6%** |
| caída | −45% | −44% |
| Sharpe | 0,72 | **0,70** |
| operaciones | 185 | **212** |
| la operación mayor | 17% | **11%** |
| años positivos | 9/11 | **9/11** |

**17,6% contra 17,6% en 36 empresas nunca vistas.** Primera replicación limpia del proyecto.
Y la mejora de la ENTRADA también replicó: entrada vieja $19.464 y Sharpe 0,60; entrada nueva
$26.216 y 0,70.

**La letra pequeña, que va siempre pegada al aprobado:**
1. El Sharpe **empata con SPY exactamente** (0,70 contra 0,70). Pasó el criterio por margen CERO.
   Gana más dinero, no gana en riesgo ajustado.
2. La caída es −44% contra el −34% de SPY. **Diez puntos más** — eso es lo que compran los
   $7.177/año de diferencia.
3. Vecinos: −6% da $25.457 (0,70) y −8% da $21.179 (0,66). El −7% es el mejor pero NO es un pico.

### Las tres versiones, una al lado de la otra

**LA REGLA NUEVA** (media 50 · −7% · 10 huecos · 24% · sin mínimo):

| universo | tks | al año | en 10,6 años | Sharpe | ops | la mayor | años+ |
|---|---|---|---|---|---|---|---|
| **los 27** (tecnología) | 27 | **$14.067** | $149.436 | **0,51** | 206 | **72%** | 6/11 |
| grupo A (defensivas) | 24 | $26.470 | $281.190 | 0,72 | 185 | 17% | 9/11 |
| grupo B (el examen) | 36 | $26.216 | $278.487 | 0,70 | 212 | 11% | 9/11 |
| **A+B (60 grandes caps)** | 60 | **$26.964** | **$286.431** | **0,71** | **251** | 18% | 8/11 |
| comprar SPY y dormir | — | $19.039 | $202.254 | 0,70 | — | — | — |

**LA PALANCA VIEJA** (media 20 · bajo la media · 2 huecos · 12% · con $5.000):

| universo | al año | Sharpe | ops | la mayor |
|---|---|---|---|---|
| los 27 | $15.381 | 0,48 | 52 | 71% |
| grupo A | $20.918 | 0,59 | 49 | 75% |
| grupo B | $30.519 | 0,70 | 46 | 46% |
| A+B | **$42.727** | **0,79** | **52** | **47%** |

⚠️ **La vieja parece mejor en A+B ($42.727 contra $26.964) y NO lo es.** Fíjese en la columna de
operaciones: **52, 49, 46, 52 — el mismo número en los cuatro universos**, porque 2 huecos × 120
sesiones lo tapan. Con 60 tickers no opera más, sólo **elige entre más candidatas** y se queda
con las más extremas. Por eso «mejora» al crecer el universo: es el efecto de concentración, no
una ventaja. La mayor operación sigue siendo el 47% del dinero.
La nueva opera 206-251 veces y su mayor es el 11-18%.

### ⛔ LOS 27 NO TIENEN VERSIÓN QUE FUNCIONE

Con la regla nueva dan $14.067 (Sharpe 0,51) y con la vieja $15.381 (0,48). **Las dos por debajo
de los $19.039 de comprar SPY.** Y la mayor operación es el 71-72% del dinero en ambas.
No es que haya que darles otra regla: es que en este universo, en este período, no hay nada.

## 5-quater · LAS REGLAS FINALES, tras el ultracode (30 ago, noche)

### ⚠️ Sólo hay UNA regla. No hay «regla de los 27» distinta de la de A+B.

Se buscó una específica para los 27 y **no se encontró ninguna validada**. Lo único que les
mejoraba (pesar por horquilla: $40.250 contra $27.593 a igual exposición) **no funciona en A+B**,
así que no es un hallazgo. Lo que cambia entre los dos universos no es la regla: es el resultado.

### LA REGLA (la misma para los dos)

> Call **10% dentro del dinero** (no 25% — lo cambió el ultracode) · vencimiento **~400 días** ·
> comprada AL ASK el día que la acción está **más de un 7% por debajo de su media de 50 sesiones**
> (se descarta si está por debajo de −30%: eso es un split) · se aguanta **120 sesiones** ·
> suelo **0,50x** · sin tope de ganancia · se vende AL BID ·
> **10 huecos** simultáneos, uno por ticker · **24% de exposición total** (2,4% por hueco) ·
> **sin mínimo de coste** · el ocioso en SPY ·
> **castigo 2,75%** (media horquilla REAL medida; el 1,38% de antes venía de una muestra
> demasiado líquida y se quedaba corto).

### Lo que produce cada universo

| | $/año | %/año | caída | Sharpe | ops | contra SPY |
|---|---|---|---|---|---|---|
| **A+B (60 grandes caps)** | **$36.702** | 20,7% | −47% | **0,73** | 282 | gana en dinero **y** en Sharpe |
| **los 27 (tecnología)** | **$23.156** | 16,8% | −47% | **0,61** | 263 | gana en dinero, **pierde** en Sharpe |
| comprar SPY y dormir | $19.039 | 14,9% | −34% | 0,70 | — | — |

**Con la profundidad al 25% los 27 daban $14.067 y Sharpe 0,51 — por debajo de SPY.** El cambio a
10% dentro los rescata a medias: ya ganan dinero, pero siguen sin ganar en riesgo ajustado.

**La decisión sobre los 27 es de Lester, no de la medición.** Operarlos añade dinero y empeora la
relación riesgo/beneficio de la cartera. No hay una regla que los arregle.

### ⚠️ LA WEB PUBLICA LA VERSIÓN DE ANTES DEL ULTRACODE

`lib/estrategias-por-ano.json` tiene la de **25% dentro con castigo 1,38%**: $26.964/año, 251 ops.
La actual (10% dentro, castigo 2,75%) da **$36.702 y 282 ops**. Pendiente de actualizar.

### El <3% de horquilla — PISTA, no regla

$27.618/0,80/−36% en A+B y $32.083/0,82/−36% en los 27. Los dos coinciden y es lo único medido
que bate a SPY en riesgo ajustado con la caída del índice. **Pero son 65 y 80 operaciones (~6 al
año).** No se opera: en el forward test se apunta la horquilla al lado de cada señal y se lee de
las dos maneras dentro de un año. Ver `horquilla-real-es-del-ticker` en memoria.

## 6 · LO QUE APRENDÍ HOY, Y ME COSTÓ

1. **Confundí «mejor t» con «más dinero».** La t por operación mide con qué fiabilidad una
   entrada le gana a las demás *al mismo aguante*. No mide cuánto paga. A 60 sesiones el
   multiplicador es 1,20 y a 120 es 1,35: la ventaja relativa sube porque el control también
   baja, y el billete es más pequeño. Presenté como mejora algo que pierde $21.000 al año.
2. **Quitar los solapes ANTES de filtrar** dio 20 operaciones en vez de 139. Se filtra primero.
3. **Un array sin ordenar no tiene período.** Leí `ops[0]` y `ops[último]` y di una alarma falsa.
4. **Dos procesos reventaron y salieron con código 0** (memoria agotada, argumentos cambiados).
   Un `exit 0` aquí no significa nada: hay que leer la salida.
5. **Un `//` a media línea se come el resto**, incluida la llave que cierra el bucle.
