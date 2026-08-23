# PRE-REGISTRO · MARIPOSA DE HIERRO 0DTE A LAS 15:00

**Congelado el 2026-08-22.** Este documento se escribe ANTES de que exista una sola operación en
directo. Su valor entero está en que nadie lo toque después: si dentro de un año los números en
vivo no se parecen a los de aquí, el que estaba equivocado es el backtest, no el mercado.

Cuaderno: `scripts/forward-mariposa-15h.mjs` → Redis, clave `forward:mariposa-15h`.
Se ve en la web en **/estado**, arriba del todo, junto a los demás cuadernos.

---

## LA REGLA

A las **15:00 ET**, y sólo si el SPX está por encima de su media de 5 cierres **Y** de la de 50
(calculadas con cierres estrictamente anteriores a hoy):

- se **venden** la call y la put del strike múltiplo de 5 más cercano al precio — las dos en el
  **mismo** strike; eso es lo que la hace una mariposa y no un cóndor
- se **compran** la call 50 puntos arriba y la put 50 puntos abajo
- **1 contrato**. Robinhood retiene $5.000 de colateral, el mismo que el cóndor.
- **no se cierra nunca**: se deja vencer a las 16:00
- precios cruzando la horquilla entera: lo vendido al bid, lo comprado al ask
- $0,03 por contrato y pata

**Sin mínimo de crédito.** El cóndor tiene el suyo ($100); ésta no. Es una diferencia
deliberada. Hay una SEGUNDA regla declarada más abajo que sí lleva umbral, y se mide desde este
mismo cuaderno sin tocar ésta.

---

## LO QUE EL BACKTEST DICE QUE DEBE PASAR

518 operaciones, 2022-01-03 a 2026-08-10, precios reales, peaje pagado en las cuatro patas y
dos veces (medido con `scripts/lib0dte.mjs`, y reproducido de forma independiente el mismo día
por `scripts/_cred-mariposa.mjs` con resultados idénticos al céntimo).

| | |
|---|---|
| Opera | 113 días al año (el filtro apaga algo más de la mitad) |
| Acierto | **66,6%** |
| Crédito | mediana **$790** · p10 $590 · p25 $655 · p90 $1.210 |
| Por operación | **+$101** |
| Al año, 1 contrato | **$11.405** |
| Mediana de la operación | $226 |
| Peor día | −$3.247 |
| Peor bajón de la caja | −$5.321 |
| Días fuera de las alas | **0 de 518** |

Año a año: 2022 +$8.903 (40 ops) · 2023 +$14.907 (125) · 2024 +$17.739 (145) ·
2025 +$8.494 (131) · 2026 +$2.422 (77, hasta el 10 de agosto).

**El listón que hay que batir:** «los tres síes» sobre los mismos días da **$6.722/año** con un
bajón de $7.092. La mariposa da más dinero y menos susto. (Ojo: la cifra de $11.552/año que
circulaba para el cóndor está MAL; el pre-registro congelado dice $7.366 y una reimplementación
independiente da $6.722. La diferencia era el número de años entre el que se divide.)

**Castigada con un 10% más de horquilla en contra en cada pata:** $10.943/año, todos los años
en positivo. Eso es lo que mató a esta estructura la vez anterior y esta vez aguanta.

---

## ⚠️ LAS CUATRO DEBILIDADES, ESCRITAS ANTES DE EMPEZAR

**1. NO CRUZA EL LISTÓN DE LAS MUCHAS PUERTAS.** 468 celdas medidas en el encargo que la
encontró, más las ~300 configuraciones que este proyecto ya había probado sobre estos mismos
días, ponen el listón honesto cerca de **t=4**. La regla da **t=3,41**. No llega. Es exactamente
el mismo agujero que tiene «los tres síes», y es la razón principal de que este cuaderno exista.

**2. SE VA APAGANDO.** Primera mitad $14.872/año, segunda $7.939 — la mitad. Por tercios:
$17.122 / $8.014 / $9.106. Los tres del mismo signo, pero cayendo. **Si el forward test da la
mitad de lo prometido, eso NO será una sorpresa: estaba escrito aquí.**

**3. EL FILTRO DE LAS MEDIAS NO ES NUEVO.** El MA5+MA50 salió de un barrido sobre estos MISMOS
días cuando se construyó «los tres síes» (está anotado como debilidad n.º 3 de su propio
pre-registro). Pegárselo ahora a la mariposa no es una comprobación independiente: es reutilizar
un filtro ya ajustado a este período. A su favor: mejora las 78 casillas donde se probó, sin una
sola excepción, y tiene lectura económica clara — no vendas seguro cuando el mercado está
cayendo.

**4. 2022 CASI NO ESTÁ PROBADO.** Sólo 40 operaciones en todo el año, porque el filtro de
tendencia apaga casi entero un mercado bajista. El único año de caídas grandes del período es el
que menos muestra tiene, y es el que decidiría si esto aguanta un susto de verdad.

---

## QUÉ CONTARÁ COMO FRACASO

Escrito ahora para no poder moverlo después:

- **crédito mediano por debajo de $590** (el p10 del backtest) de forma sostenida
- **acierto por debajo del 55%** con 30 cierres o más
- **cualquier día que acabe FUERA de las alas**, siendo el backtest 0 de 518. No sería mala
  suerte: sería la señal de que el mercado de las 15:00 no es el que se midió
- **P&L por operación negativo** con 60 cierres o más
- **frecuencia muy distinta de 113 operaciones al año**: si opera 200 o 50, el filtro no está
  haciendo lo que se midió

---

## LO QUE NO SE HARÁ

- no se toca la hora, ni el ala, ni el filtro de medias. NO se le añade el umbral de crédito a
  ESTA regla: el umbral es la segunda regla, declarada abajo, y se lee filtrando el mismo
  registro. Si se metiera aquí dejaríamos de tener el control contra el que compararlo
- **no se cierra ninguna operación antes del vencimiento, pase lo que pase.** Está medido: las
  282 formas de cerrar antes de tiempo pierden dinero, entre $3.753 y $69.077 al año, sin una
  sola excepción. Son cuatro patas y cerrar hace pagar la horquilla otra vez en las cuatro
- no se borra ninguna fila: las malas son el dato
- no se toca «los tres síes», que sigue corriendo intacto. Dentro de un año los dos cuadernos se
  comparan contra el mismo mercado y la diferencia es la regla

**El GEX se calcula y se guarda en cada fila pero NO veta nada.** Medido el 2026-08-22: no mejora
esta regla — la escalera de cinco montones no es monótona (15.773 / 6.208 / 27.011 / 21.653 /
28.037), el control barajado hace lo mismo, dentro de tercios de volatilidad se evapora
(t=0,37 / 1,32 / 0,04) y año a año se contradice. Se guarda para poder responder esa pregunta
más adelante sin montar un tercer cuaderno.

---

## LA SEGUNDA REGLA, DECLARADA HOY — «MARIPOSA CON UMBRAL»

**Congelada el 2026-08-23, antes de que exista una sola operación en directo.**

Idéntica a la de arriba en todo — misma hora, mismo ala, mismo filtro de medias, misma salida —
con **una sola condición añadida**:

> se opera sólo si el crédito es **≥ 30% de la cuna al dinero de las 09:35**
> (call ATM al ask + put ATM al ask, medidas esa mañana)

El cuaderno guarda `cuna0935` y `creditoSobreCuna` en **cada fila**, así que esta variante se
evalúa **desde el mismo registro** filtrando por ese campo. No hay un segundo cuaderno: los dos
no se pueden desincronizar y las dos reglas ven exactamente el mismo mercado desde el día uno.

**Por qué 30% y no otro número.** Salió de un barrido de nueve umbrales sobre el backtest, y eso
son nueve puertas más abiertas sobre una muestra que ya se usó para elegir la hora, el ala y las
medias. **No es una comprobación independiente y por eso está aquí declarada como una regla
aparte, no metida en la principal.** Lester lo señaló bien: esperar meses para empezar a medirla
sólo perdería meses. Se declara ahora, se mide desde mañana, y en unos meses la diferencia entre
las dos es una medición limpia.

**Lo que el backtest dice que debe pasar con el umbral (372 de las 518 operaciones):**

| | sin umbral | con umbral ≥30% |
|---|---|---|
| operaciones | 518 | 372 (−28%) |
| $/año | $11.405 | $11.140 (−2%) |
| $ por operación | $101 | $138 |
| peor día | −$3.247 | −$2.965 |

O sea: **el mismo dinero, operando un 28% menos días.** Los 146 días que se salta valían, entre
todos, aproximadamente cero — no eran perdedores, eran ruido con $5.000 de colateral puesto.

**Qué contaría como que el umbral SÍ aporta:** que a igualdad de dinero opere menos días y su
peor día sea mejor. **Qué contaría como que NO:** que gane menos dinero sin mejorar el peor día,
o que las dos den lo mismo (entonces el umbral es ruido y se retira).

**Aviso:** con ~46% de días con señal y un 28% menos por el umbral, esta variante opera unas 81
veces al año. Hacen falta muchos meses para distinguirlas. Ninguna lectura antes de 60 cierres
de la variante significa nada.

---

## POR QUÉ EXISTE ESTE DOCUMENTO

Porque **todo lo que se podía medir sobre 2022-2026 ya se gastó en elegir esta regla**. No queda
un trozo de historia limpio donde comprobarla: la elegimos mirando toda la que hay. La única
prueba honesta que le queda es el futuro, y el futuro sólo cuenta si la regla estaba escrita
antes.

Y porque en este proyecto ya ha pasado lo contrario: un hallazgo que se ajusta después de verlo
correr deja de ser una prueba y se convierte en un recuerdo.
