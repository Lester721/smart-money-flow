> ## ⛔ CORRECCIÓN — leer ANTES que el informe
>
> **El hallazgo principal de este informe es falso.** Se midió esa misma madrugada, unas horas
> después de escribirlo, y no se sostiene.
>
> El informe dice que el cóndor se deshincha porque vende a **±25 puntos fijos** mientras el SPX
> sube, y que por eso el crédito cayó de $1.165 a $600. **La mecánica va al revés:** vender más
> cerca del dinero paga **MÁS**, no menos — medido, $960 a 0,28% del índice contra $595 a 0,52%.
> Si la estructura se ha ido acercando al dinero, el crédito debería subir.
>
> Año a año (±25 fijos, días GEX+, entrada 11:00):
>
> | Año | Separación | Acierto | Crédito | Nunca tocado | Retorno |
> |---|---|---|---|---|---|
> | 2024 | 0,448% | 73% | $865 | 59% | 4,33% |
> | 2025 | 0,415% | 70% | $725 | 58% | 2,95% |
> | 2026 | **0,347%** | **77%** | $595 | **65%** | **4,87%** |
>
> Según se acercaba al dinero, el cóndor **mejoró**. El crédito lo mueve la volatilidad (el índice
> se movió 0,371% / 0,444% / 0,370% esos tres años), no la distancia de los strikes. Y
> re-especificar al 0,44% constante da 4,85% en 2026 contra 4,87% del fijo: lo mismo.
>
> Los créditos en vivo tampoco eran una tubería rota: agosto en caché da mediana $580 con mínimo
> $355, y el día 10 pagó $355.
>
> **Lo único del informe que sí queda en pie sobre esto:** que había un agujero sin contar. Pero es
> otro — el 61% de los días con GEX positivo no tienen cadena en el fichero, con cobertura del 15%
> en 2024, 45% en 2025 y 70% en 2026. Comprobado que NO son los días malos (los que faltan se
> mueven menos, así que la medición es conservadora), pero con sólo 22 operaciones de 2024, decir
> "positivo en tres años" es más flojo de lo que parecía.
>
> Medido en `web/scripts/gex-2026/gex-condor-{porcentaje,cobertura,deriva,ultimos-dias}.mjs`.
> **El resto del informe —lo que cayó y por qué, y los mecanismos de mercado— sigue en pie.**

> **Cómo se hizo:** 20 agentes en cuatro fases (inventario · candidatas · verificación adversarial ·
> síntesis), lanzados el 2026-08-15 a petición de Lester: *"te reto a que encuentres las piezas en
> este rompecabezas para crear el cohete que romperá el muro"*.
>
> Los agentes trabajaron **sólo con lo escrito** en la memoria del proyecto y el repositorio, sin
> red y sin ThetaData. Cada candidata pasó por dos verificadores con encargos opuestos: uno
> intentando demostrar que ya se había probado y muerto, otro que era inviable en la práctica.
>
> **Las seis candidatas examinadas cayeron. Las seis.** Lo que queda en la lista es lo que sigue en
> pie después de quitar lo roto.

# INFORME — 22 días, qué hay de verdad en la mesa

*Todas las cifras vienen del inventario y de los ficheros de memoria. Donde no hay número, digo "no medido". No he tocado la red ni ThetaData.*

---

## Antes de empezar: cuatro palabras que voy a usar

- **Horquilla**: la diferencia entre lo que te pagan si vendes (bid) y lo que te cuesta si compras (ask). Es el peaje de entrar y salir.
- **n**: cuántas operaciones o días *independientes* tiene una medición. Si mides el mismo día ocho veces, n sigue siendo 1.
- **t**: cuánto destaca un resultado por encima del ruido. Con **una sola** prueba, t=2 significa "una entre veinte de que sea casualidad". Pero si has probado 30 cosas, hace falta t≈3,4 para decir lo mismo. Este proyecto ha probado cientos.
- **Tres tercios**: partir el tiempo en tres trozos y exigir que funcione en los tres. Partir en dos mitades aprobó a EVA; partir en tres la mató. Ese es el listón ahora.

---

## 1. LO QUE DE VERDAD TENEMOS

### 1.1 Una sola estrategia medida y viva

**Cóndor de hierro 0DTE en SPXW, solo los días de GEX neto positivo.**

- 654 días (2024-2026 completos), cotizaciones reales cruzando la horquilla entera, comisiones dentro.
- Se opera 143 días (22% de los días): acierto 73% con 39 pérdidas, media **+3,93%**, mediana +9,80%, **t = 2,09**.
- En dinero: ~55 operaciones/año × 3,93% × $5.000 de riesgo ≈ **$10.800/año por contrato**.
- **El control es lo que la sostiene**: la misma estructura en días de GEX negativo da +0,22% con t=0,10 (n=206). O sea: no es la estructura, es el filtro.
- Aguanta castigo de ejecución: −5% de crédito → +3,08% · −10% → +2,23% · −20% → +0,53%.
- Sin el 10% de días mejores: +1,09% (no vive de cuatro golpes de suerte).
- Los tres años positivos: 2024 +4,33% · 2025 +2,95% · 2026 +4,87%.
- Legarla en dos verticales (obligatorio en Robinhood) no cuesta nada: +2,81% contra +2,79%.

**Y lo que hay escrito en su contra, en el mismo fichero**: t=2,09 está en el filo; hay una selección leve de ~0,7 puntos (los días descartados por falta de crédito rendían +2,46% con mariposa contra +3,14%); y **ningún año por separado es significativo** (n=22 en 2024).

### 1.2 El aviso que está sonando ahora mismo

El forward-test en vivo lleva 2 cierres y el **crédito viene un 43% por debajo**: mediano $410 contra $725 del backtest, tres seguidos por debajo ($205, $410, $335). P&L por operación −$33 contra +$196 esperado.

Con 2 cierres eso no dice nada de rentabilidad — hacen falta ~30. Pero el crédito sí dice algo hoy, y es feo: **en los 143 días del backtest no hay ni uno solo con crédito de $205 o menos** (el percentil 10 es $380). Y no es deslizamiento de ejecución: el forward-test lee la misma foto de 5 minutos que el backtest. O sea que la diferencia es del mercado o de cómo se eligen los strikes, no de la orden.

Además el crédito lleva encogiéndose todo el período medido:

| Semestre | Crédito mediano |
|---|---|
| 2024-H1 | $1.165 |
| 2024-H2 | $835 |
| 2025-H1 | $960 |
| 2025-H2 | $635 |
| 2026-H1 | $585 |
| 2026-H2 | $600 |

Y hay una explicación mecánica a mano: la estructura vende a **±25 puntos fijos**, y el SPX ha subido. Esos 25 puntos eran el 0,477% del índice y hoy son el 0,329%. Se está vendiendo cada vez más cerca del dinero mientras el riesgo sigue clavado en $5.000. El forward-test tiene una alarma pre-registrada: si la mediana baja de $600, "la regla no se sostiene". Los últimos 20 días con señal dan mediana $610.

### 1.3 Tres mecanismos medidos (no son estrategias, son física del mercado)

1. **La horquilla se cobra como % de la PRIMA, no del nominal.** Al dinero se lleva el 0,8% de la prima; a un 8% fuera, el 5,9%. La horquilla casi no crece con la distancia y la prima se hunde 23 veces. **Esto explica casi todas las muertes del proyecto.**
2. **La gamma pega el doble a un día que a diez** (SPY +0,354 contra +0,171, sobre ~2.630 días). Es lo que empuja hacia el 0DTE.
3. **El precio se aquieta cerca del muro de gamma** (0,115% contra 0,176% en los 30 min siguientes) y en días de GEX positivo el índice se mueve 0,244% contra 0,411% en negativo. *Aviso: la comparación cerca/lejos del muro no tiene n ni t escritos.*

Y una cosa que sí está validada de verdad: **nuestro GEX no está roto**. Contra MarketSnack, el open interest sale exacto (357K contra 357K) y el signo coincide. El forward-test no está midiendo una tubería averiada.

### 1.4 Cosas medidas, vivas... y que no caben en la cuenta

- **Put semanal de QQQ 3% fuera, a mediodía**: 13,5%/año con 7% de caída. Pierde contra SPY en dinero (14,2% con 34% de caída), gana claro en susto.
- **Mezcla 50/50 put + comprar QQQ**: 18,1%/año con **18% de caída**, contra SPY 16,6% con 36%. Es lo único medido que empata en dinero y gana claramente en caída. La put está plana cuando el QQQ baja (correlación 0,50).
- **La Wheel**: cinco activos positivos y ninguno llega a t=2 (HOOD +0,520% t=1,59 · PLTR +0,475% t=1,54 · AFRM +0,380% · SOFI +0,198% · COIN +0,077%). Ni confirmada ni descartada.

**El problema es el mismo en las tres: no caben.** Una put de QQQ al 3% pide $70.134 de colateral. Un put de HOOD, $9.500. Y hay $7.897 en efectivo.

### 1.5 La restricción que decide todo

Cuenta $55.419. De ellos, **$47.260 son 500 acciones de HOOD (85%)** con $9.505 de pérdida abierta. Efectivo: **$7.897**.

El cóndor que sí funciona arriesga $5.000 por operación = **el 63% de su efectivo**. Y su propio Monte Carlo, con su distribución real, dice que al 10% de la cuenta por operación se pierde 1 de cada 5 veces.

**Esto no es un detalle de tamaño: es la restricción principal del proyecto.** Casi todo lo que se ha medido y funciona, no se puede ejecutar. No es una recomendación sobre qué hacer con HOOD — esa decisión es suya — pero es el hecho que hay que tener delante.

### 1.6 El listón

Comprar y mantener SPY: **14,1-16,6%/año** con 34% de caída, cabe sin restricción de tamaño y **no cuesta tiempo**. Sobre $55.419 son unos $7.800-9.200/año. Todo se compara contra eso.

### 1.7 Lo que hay guardado y sin usar

7,7 GB de datos reales en disco. Lo relevante:

- **Cadenas EOD completas 2016-2026** (1,44 GB, 8 tickers). Las mediciones con precios reales solo usan de 2021-2022 en adelante. **2016-2020 —con el desplome de 2018 y el crash de 2020— nunca ha entrado en nada.**
- 3,3 GB de IV a 5 minutos de SPXW 0DTE (de aquí salió el cóndor).
- 1.075 sesiones de SPY 0DTE (941 MB), usadas por un solo script y para una sola estructura.
- Un día de flujo firmado en vivo: 873.750 operaciones con lado. **Un solo día.**
- Flujo histórico 2024-2026 de 8 tickers: 191.838 operaciones notables, sin tocar.

### 1.8 Dos huecos que no puedo rellenar yo

- **Cuánto tiempo puede dedicar al día**: no medido. Las dos candidatas vivas exigen estar delante entre las 11:00 y las 15:00.
- **Su tolerancia a la caída, en un número suyo**: no medido. Los indicios se contradicen.

Y dos comprobaciones de bróker que bloquean la única candidata viva y que **no están hechas**: si Robinhood le deja operar SPX/SPXW con su nivel, y si retiene colateral por las dos verticales por separado (si es que sí, son ~$10.000 y no cabe ni un contrato).

---

## 2. LAS CANDIDATAS QUE SOBREVIVIERON

Antes de la lista, la verdad incómoda: **las seis ideas que se sometieron a examen adversarial esta ronda cayeron todas**. Ninguna sobrevivió. Lo que sigue no son ideas nuevas brillantes: es lo que queda en pie después de quitar lo que ya se rompió, ordenado por evidencia previa dividida por esfuerzo.

---

### 1º — Dejar correr el forward-test del cóndor (esfuerzo: CERO)

**Qué es.** Ya está corriendo en Railway, entrando a las 11:00, escribiendo con `origen: railway`, con precios reales de cuatro cotizaciones.

**Qué la apoya.** Es **la única prueba fuera de muestra de verdad que tiene el proyecto**. Todo lo demás son mediciones sobre el pasado, y este proyecto ya ha visto cuatro veces cómo algo que brillaba en el pasado moría al llegar datos nuevos.

**Qué habría que medir.** Nada nuevo: contar. Hacen falta ~30 cierres. Van 2. Y hay una alarma pre-registrada: crédito mediano por debajo de $600 invalida la regla.

**Coste.** Cero horas. **Y una regla dura: no tocarlo.** Cambiar la hora de entrada o meter un filtro reinicia el único contador honesto que existe.

---

### 2º — Cerrar el agujero del crédito (esfuerzo: HORAS, datos en disco)

**Qué es.** Averiguar por qué en vivo se cobran $205-$410 cuando en 143 días históricos nunca se bajó de ~$380. Hay dos explicaciones posibles y son opuestas: o hay un fallo en cómo se eligen los strikes en vivo (arreglable, la estrategia sigue), o la estructura está **mal especificada** desde el principio.

**Qué la apoya.** La sospecha de mala especificación tiene número: ±25 puntos era el 0,477% del índice en 2024 y es el 0,329% hoy. La estrategia lleva dos años y medio derivando hacia el dinero sin que nadie lo decidiera. Y el crédito mediano cae en paralelo: $1.165 → $600.

**Qué habría que medir.** Con `data/gex/historia.json` y los 3,3 GB del caché, ya en disco: re-especificar la separación como **porcentaje del índice** (lo que el backtest promedió de hecho) en vez de puntos fijos, y volver a correr con el protocolo completo — tres tercios de tiempo, control en GEX negativo en cero, criterio escrito **antes** de mirar. Y comprobar si $410 cae dentro de la distribución de la estructura bien especificada.

**Coste.** Horas. Sin red, sin descargas.

**Aviso honesto.** Esto puede matar la única candidata viva. Ese es exactamente el motivo de hacerlo ahora y no dentro de un mes.

---

### 3º — Meter 2016-2020 en lo que ya está medido (esfuerzo: HORAS-DÍAS, datos en disco)

**Qué es.** Hay 1,44 GB de cadenas con bid/ask real de 2016 a 2026 y las mediciones solo usan de 2021-2022 en adelante.

**Qué la apoya.** El precedente propio, y es contundente: el credit spread a 5 días daba +5,6% con 14 de 14 celdas robustas en el año calmo; al meter 2022 se quedó en +0,9% y 6 de 16. **Añadir un mal año es la forma más barata que tiene este proyecto de matar un espejismo.** Y 2018 y 2020 están en el disco, gratis.

**Qué habría que medir.** Cualquier hallazgo "vivo" pasado por esos años. No produce estrategias nuevas: produce confianza o entierros, que es lo que falta.

**Coste.** Horas o días. Con una comprobación previa obligatoria: el propio código avisa de que "antes las cadenas son más pobres", así que hay que verificar la calidad antes de creerse nada.

---

### 4º — Vender al dinero, no lejos (esfuerzo: HORAS — pero hoy no es ejecutable)

**Qué es.** El mecanismo raíz medido dice que la horquilla se lleva el 0,8% de la prima al dinero y el 5,9% a un 8% fuera. Todo lo que ha muerto en este proyecto murió vendiendo lejos. **El único sitio donde el peaje no muerde es al dinero, y ahí casi no se ha mirado.**

**Qué la apoya.** La comprobación directa está escrita: vender la put AL DINERO en QQQ da 12,4%/año al medio y 12,2% al bid — la horquilla ni se nota. Y existe una referencia externa con 29 años publicados (el índice PUT de CBOE, puts al dinero mensuales totalmente colateralizadas) que nunca se ha replicado aquí.

**Qué falla, y es importante.** La memoria tiene **tres cifras distintas para lo mismo** — "vender la put al dinero en QQQ": 12,4%/año, 9,3%/año y 7,2%/año (esta última con 25% de caída y 67% de acierto, claramente peor que el 3% fuera). No consta en ningún sitio por qué difieren. **Antes de construir nada encima, hay que reconciliar esas tres cifras**; si no, se estaría edificando sobre un número que ya sabemos que no es único.

**Coste.** Horas, con los datos de QQQ/SPY ya en disco.

**Bloqueo de ejecución.** Una put al dinero de QQQ son ~$72.000 de colateral. De IWM, ~$30.000. Con $7.897 no cabe ninguna. Esto se puede *medir*, pero hoy no se puede *operar*.

---

### 5º — Earnings (esfuerzo: DÍAS, evidencia previa CERO)

Los días de resultados nunca se han aislado. Está el primero en la lista de pendientes desde hace semanas, y hay cadenas de 8 tickers para 10 años en disco.

**Sé honesto con la expectativa**: la evidencia previa dentro de este proyecto es *cero* (no se ha medido), y el pariente más cercano —filtrar por IV cara— salió sobreajustado (t=4,38 en HOOD, no replicó en AAPL ni TSLA). No es una promesa, es un hueco.

---

### 6º — La Wheel, y en concreto el ticker U (esfuerzo: DÍAS, evidencia DÉBIL)

Los cinco activos positivos siguen sin llegar a t=2. El examen adversarial mostró que MARA, RBLX y DKNG **ya estaban** medidos dentro de las 1.916 operaciones de la prueba de régimen, así que solo U queda genuinamente sin tocar — y tres de los cuatro tienen horquillas del 8,7% al 11,8%, territorio de "no operarla" por la regla de liquidez del propio proyecto. Además no cabe en la cuenta.

**Recomendación: aparcarla.** No está muerta, pero no es donde están las horas.

---

### No en la lista, y por qué

**El día de flujo firmado (873.750 operaciones).** Es un dato precioso y es **un solo día**. Con n=1 no se mide nada. Si el recolector vuelve a correr y se juntan 30-40 días, sube directamente al top de esta lista. Hoy no.

---

## 3. LO QUE CAYÓ Y POR QUÉ

Agrupado por **causa de muerte**, porque eso es lo que decide si algo puede revivir.

**A) Muertos por la horquilla — no revivirán nunca.** El mecanismo es aritmético, no estadístico. Aquí murieron: todas las verticales de crédito (−2,53% con precios reales, 1.173 operaciones, pierde en las dos mitades), el credit spread a 90 días (−23,26% sobre riesgo *acertando el 61%*), el 0DTE lejos del dinero (−0,525% **con 93% de acierto**), y comprar el flujo señalado (la horquilla se lleva el 1,81% de la prima solo por entrar y salir). Regla que sale de ahí: **un 94-99% de acierto es una alarma, no un logro.**

**B) Muertos por ruido.** EVA entera: ni un ingrediente mantiene el signo en tres tercios de tiempo (el IV proxy pasa de t=+6,7 a t=−3,8 al período siguiente). El filtro de IV cara. Los filtros de régimen MA200 — donde el filtro **invertido** iba mejor, que es la firma exacta del ruido. Podrían revivir solo con muestra nueva, grande e independiente; nunca con más análisis de los mismos datos.

**C) Muertos por concentración.** Las tres celdas de 0DTE con t>2 tenían una sola pérdida cada una... y era el mismo día (2026-04-13).

**D) Muertos por bugs propios.** Black-Scholes con IV = volatilidad realizada inflaba el crédito un 140%; 54 de 64 vencimientos del ledger no existían; un look-ahead de media hora infló un 13,5% a 15,1%. La idea no quedó juzgada, el método sí. Black-Scholes está encerrado con un test que vigila.

**E) Muertos por ser malos.** Los stops (pierden en 19 de 20 combinaciones; cortan más ganadoras que perdedoras — y en su cuenta real las recompras le costaron $2.718). Acercarse al dinero en semanales (el óptimo estaba justo donde ya estaba). Las calls cubiertas mecánicas (9 de 9 negativas, hasta −110,7%/año). El score de MarketSnack (57 pruebas, 0 pasan).

**Y las seis de esta ronda:**

| Idea | Por qué cayó |
|---|---|
| Cóndor GEX+ portado a SPY (dos versiones) | SPY es americana y de entrega física: el cierre cae entre la corta y el ala el 38,6-43,0% de los días → 100 acciones (~$71.000-77.300) contra $7.897 de efectivo. Y si cierras a las 15:30 para esquivarlo, pasa de +2,26% a −1,54%. Además el tercio bajista de 2022-2023 —la razón entera del ejercicio— da t=0,04, y el control de GEX negativo deja de dar cero. |
| Umbral de crédito mínimo | La premisa está refutada en los propios datos: el año de crédito **más bajo** (2026, $595) es el de **mejor** resultado (+4,87%). Y todos los umbrales bajan la t (2,09 → 1,11-1,94). Los "tercios de crédito" resultaron ser un filtro de fecha disfrazado. |
| Strikes en el muro de gamma | Prueba pareada, mismos 31 días: muro +3,06% contra ±25 fijo +3,05%. Diferencia t=0,00. Y la premisa era un error de categoría: el "58-65% de aguante" es del muro cuando está pegado al precio, no de un strike a 0,32% (que aguanta 84-88%). |
| Wheel filtrada por prima extra | Pasa el listón propio en 1 de 5 tickers. Y cada celda del listón tiene n≈25 con ruido 3,5 veces mayor que el efecto buscado: el criterio no es medible ni con datos perfectos. |
| GEX confirmado intradía | Falla su propio criterio (mejora en 4 de 8 horas, debía ser 8 de 8) y **en dólares pierde en las 8 de 8**: sube el % por operación tirando el 30-42% de los días. A las 11:00 descarta justamente los días buenos (+5,80% los descartados contra +3,12% los que deja). |

---

## 4. EL SIGUIENTE PASO CONCRETO

**Cerrar el agujero del crédito del cóndor: comprobar si la estructura está mal especificada.**

Es lo único que compra información decisiva por hora invertida, porque toca la **única** candidata viva y su resultado es binario: o la salva o la mata, y en los dos casos ahorra semanas.

**Paso 0 — dos comprobaciones de cinco minutos en la app, antes de nada:**

1. ¿Robinhood le deja operar SPX/SPXW con su nivel 3? **No está comprobado en ningún sitio.** Si la respuesta es no, todo lo demás sobra.
2. ¿Retiene colateral por las dos verticales por separado? Si es que sí, son ~$10.000 contra $7.897 de efectivo y no cabe ni un contrato.

**Paso 1 — la medición** (horas, todo en disco, sin red, sin descargas):

Re-especificar la separación del cóndor como **porcentaje del índice** en lugar de ±25 puntos fijos, y volver a correr los 654 días con el protocolo completo.

**Criterio escrito ANTES de correr, y que no se toca después:**
- Los **tres tercios de tiempo** positivos.
- El control de GEX negativo se queda en cero (como el +0,22% / t=0,10 de ahora).
- **No se elige la mejor celda del barrido.** Se enseña la meseta entera o no vale.
- Se reporta cuántos días se caen por falta de crédito y qué habrían rendido.

**Paso 2 — la pregunta que lo cierra:** ¿los $410 y $335 de crédito en vivo caen dentro de la distribución de la estructura bien especificada, o siguen fuera de rango? Si caen dentro, el problema era la especificación y la estrategia sigue en pie con números nuevos. Si siguen fuera, hay un fallo en la selección de strikes en vivo y hay que encontrarlo antes de meter un dólar más.

**Lo que NO hay que hacer mientras tanto:** tocar el forward-test. Es el único contador honesto que existe y necesita ~30 cierres.

---

## LA RESPUESTA A SU PREGUNTA

Pidió las piezas del rompecabezas para construir el cohete que rompa el muro.

**Hoy no hay cohete.** Hay una pieza que aguanta (el cóndor GEX+, t=2,09, en el filo, con el crédito avisando), tres mecanismos de mercado medidos que explican por qué murió casi todo lo demás, un GEX validado contra una fuente externa, 7,7 GB de datos reales de los que una parte grande no ha entrado en ninguna medición, y —esto vale más que cualquier hallazgo— un método que ya detecta espejismos antes de que cuesten dinero. Ese método es real y es caro de conseguir: le ha ahorrado meter capital en seis estrategias que parecían funcionar.

**Qué haría falta para que hubiera cohete**, en orden:

1. **Capital que se pueda mover.** Con $7.897 de efectivo, lo único medido que funciona arriesga el 63% de ese efectivo en una operación, cuando su propio Monte Carlo dice que al 10% se pierde 1 de cada 5 veces. Mientras el 85% esté en un solo activo, la medición no es el cuello de botella: el tamaño lo es. La decisión sobre eso es suya, no mía.
2. **Un hallazgo con t claramente por encima de 2 en los tres tercios**, no en el filo, con precios reales, y que quepa en menos de $1.000 de riesgo por operación.
3. **Datos independientes nuevos**: días de flujo firmado (hay uno), los años 2016-2020 (están en disco, gratis), y los ~30 cierres del forward-test.

Y una cosa que sí está resuelta y no conviene olvidar: **el listón es comprar el índice, 14,1-16,6%/año sin tiempo y sin dolores de cabeza.** Cualquier cosa que construyamos tiene que ganarle a eso, no a cero.