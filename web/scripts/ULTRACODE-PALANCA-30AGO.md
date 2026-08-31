# LA PALANCA — síntesis del 30 de agosto

**Qué es esto.** Ocho equipos buscaron por separado cómo mejorar la estrategia que compramos
hoy ("LA PALANCA"). Cinco de esos ocho pasaron después por un verificador adversario, cuyo
trabajo era intentar tumbarlos. Este documento coge **sólo lo que sobrevivió**, lo mide todo
junto con el mismo código, y dice qué se adopta y qué no.

**El resultado en una frase:** de todo lo propuesto sobrevive **un solo cambio**, y es el más
simple de todos — **comprar la call un 10 % dentro del dinero en vez de un 25 %**. Ni un dial
más. Todo lo demás que se propuso mejora la corrida completa y se desmorona en alguna ventana
de tiempo o en alguno de los dos universos.

---

## 1. Qué es la regla actual (para quien no ha visto nada)

Cuando una acción cierra **más de un 7 % por debajo de su media de las últimas 50 sesiones**
(y no más de un 30 %), se compra una **opción call** sobre ella:

| Pieza | Valor actual |
|---|---|
| Cuánto dentro del dinero | 25 % |
| Vencimiento | ~400 días |
| Precio de compra | al ASK (el caro) |
| Cuánto se aguanta | 120 sesiones |
| Venta forzosa si se hunde | a 0,50× lo pagado |
| Tope de ganancia | ninguno |
| Precio de venta | al BID (el barato) |
| Plazas simultáneas | 10, del 2,4 % del patrimonio cada una (24 % de exposición) |
| El dinero que no está en opciones | en SPY |

Se mide sobre dos universos de acciones (**A+B**, 60 nombres, y **los 27**, tecnológicas) y
siempre con la **mediana de 41 capitales de partida** distintos, para que un resultado no
dependa de haber empezado con la cifra afortunada.

**Los listones:**

| | $/año | %/año | caída | Sharpe | operaciones |
|---|---|---|---|---|---|
| Regla actual, A+B | $26.964 | 18,5 % | −47,8 % | 0,715 | 251 |
| Regla actual, los 27 | $14.067 | 12,7 % | −42,2 % | 0,506 | 206 |
| Comprar SPY y no hacer nada | $19.039 | 14,9 % | −34 % | 0,70 | 0 |

*(Los dos primeros los he reproducido al dígito con mi propio código antes de tocar nada.)*

---

## 2. La regla mejorada

> **LA PALANCA, exactamente igual que hoy, con UN cambio: la call se compra
> 10 % dentro del dinero en vez de 25 %.**
>
> Todo lo demás intacto: ~400 días de vencimiento, entrada al ask con la acción entre −7 % y
> −30 % de su media de 50, 120 sesiones de aguante, suelo 0,50×, sin tope de ganancia, salida
> al bid, 10 plazas al 2,4 %, sin coste mínimo por contrato, el ocioso en SPY, castigo de
> ejecución 1,38 %.
>
> En el motor: `CF={tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0}`
> y el fichero de caminos `sincosteAB-p10-d400.json` (A+B) / `sincoste-p10-d400.json` (los 27).

### La tabla que pediste

| | $/año | %/año | caída | Sharpe | operaciones | operación mayor |
|---|---|---|---|---|---|---|
| **A+B — actual (25 % dentro)** | $26.964 | 18,5 % | −47,8 % | 0,715 | 251 | 6,7 % |
| **A+B — mejorada (10 % dentro)** | **$43.408** | **22,3 %** | **−46,5 %** | **0,782** | **282** | 5,5 % |
| **Los 27 — actual** | $14.067 | 12,7 % | −42,2 % | 0,506 | 206 | 7,0 % |
| **Los 27 — mejorada** | **$25.477** | **17,8 %** | −46,9 % | **0,643** | **265** | 7,9 % |

*"Operación mayor" = cuánto pesa la mejor operación sobre todo lo ganado en bruto. Ninguna
pasa del 8 %, muy lejos del 30 % que sería lotería.*

### Pero ese titular NO es la expectativa. Ésta sí

La corrida completa 2016-2026 es la ventana donde mejor sale. Medida en **diez ventanas de
tiempo distintas**, la mejora es más modesta y **nunca destruye**:

| Ventana | A+B actual | A+B mejorada | × | 27 actual | 27 mejorada | × |
|---|---|---|---|---|---|---|
| Todo 2016-2026 | 26.964 | 43.408 | 1,61 | 14.067 | 25.477 | 1,81 |
| Sin entradas de 2020 | 27.324 | 30.323 | 1,11 | 14.166 | 30.812 | 2,18 |
| Sin entradas de 2025 | 27.170 | 32.861 | 1,21 | 14.060 | 20.705 | 1,47 |
| **Sin 2020 NI 2025** | 25.815 | 25.644 | **0,99** | 14.244 | 25.914 | 1,82 |
| Calendario 2016-19 | 13.712 | 14.337 | 1,05 | 10.128 | 16.804 | 1,66 |
| Calendario 2020-22 (la crisis) | 5.933 | 6.864 | 1,16 | 1.786 | 3.203 | 1,79 |
| **Calendario 2021-24** | 12.811 | 12.767 | **1,00** | 5.429 | 5.010 | **0,92** |
| Calendario 2023-26 | 24.229 | 28.949 | 1,19 | 13.030 | 13.798 | 1,06 |
| 1.ª mitad | 15.344 | 20.931 | 1,36 | 13.762 | 19.771 | 1,44 |
| 2.ª mitad | 15.266 | 20.825 | 1,36 | 7.031 | 6.533 | **0,93** |
| **MEDIANA** | | | **1,19** | | | **1,66** |
| **PEOR CASILLA** | | | **0,99** | | | **0,92** |

**Cómo se lee:** de veinte casillas (10 ventanas × 2 universos), diecisiete están por encima
de 1,00 y las otras tres son **empates** (0,99 · 0,92 · 0,93), no derrumbes. La frase honesta
es: *"gana entre un 19 % y un 66 % de mediana, y en su peor ventana empata"*. **No** es
"$43.408 al año".

---

## 3. Lo que la mejora SÍ hace y lo que NO hace

### SÍ: más operaciones. Y esto es lo más sólido de todo el trabajo

La razón es aritmética, no de mercado: la call al 10 % dentro **cuesta un 36 % menos**
(mediana $1.960 contra $3.045 en A+B; $1.920 contra $2.680 en los 27). Como en cada plaza
caben `contratos = parte entera de (hueco ÷ coste)`, el contrato barato entra donde el caro
no cabía.

Operaciones, contrato 25 % → 10 %, **en las veinte casillas**:

| Ventana | A+B | Los 27 |
|---|---|---|
| Todo | 251 → **282** | 206 → **265** |
| Sin 2020 | 216 → 248 | 174 → 226 |
| Sin 2020 ni 2025 | 198 → 230 | 157 → 208 |
| 2016-19 | 85 → 101 | 59 → 76 |
| 2020-22 | 70 → 94 | 55 → 81 |
| 2021-24 | 78 → 101 | 63 → 87 |
| 2023-26 | 75 → 95 | 54 → 77 |
| 2.ª mitad | 101 → 137 | 77 → 107 |

**Veinte de veinte, +12 % a +29 %, sin una sola excepción.** Y rompe el techo de ~250
operaciones en diez años que se daba por insuperable sin tocar plazas ni aguante.

### NO: más precisión por operación. Esto hay que decirlo claro

Medido operación a operación, sin cartera de por medio (inmune al tamaño y al camino de la
cuenta), la escalera del contrato es así:

| Contrato | A+B multiplicador medio | A+B acierto | A+B desviación | 27 medio | 27 acierto |
|---|---|---|---|---|---|
| 5 % dentro | 1,198 | 44,2 % | 1,03 | 1,145 | 37,1 % |
| **10 % dentro** | **1,197** | **47,4 %** | **0,93** | **1,143** | **39,5 %** |
| 15 % dentro | 1,190 | 50,0 % | 0,86 | 1,134 | 41,6 % |
| 20 % dentro | 1,181 | 52,4 % | 0,78 | 1,111 | 42,9 % |
| **25 % dentro (hoy)** | **1,172** | **54,1 %** | **0,72** | **1,095** | **43,9 %** |

El multiplicador medio sube muy poco (+2,5 puntos en A+B, +4,8 en los 27), **el acierto BAJA**
(54,1 % → 47,4 % y 43,9 % → 39,5 %) y **la dispersión sube** un 29 %. En una muestra
independiente (una entrada por ticker cada 180 días) la diferencia casi desaparece en los 27
(1,186 → 1,194).

**Traducción:** el contrato barato **no acierta más**. Gana porque cada dólar compra más
apalancamiento y porque el billete barato cabe en plazas donde el caro no cabía. Es más
dinero y más operaciones, **no** más puntería.

### ¿Es sólo apalancamiento disfrazado?

No, y lo he medido. El contrato barato invierte de media el 21,2 % del patrimonio contra el
18,9 % de la regla actual, así que parte de la ganancia podría ser sólo eso. **Bajando su
tamaño hasta que las dos exposiciones sean idénticas** (2,157 % por plaza en vez de 2,4 %;
exposición 18,88 % contra 18,87 %):

| | $/año | Sharpe | caída | operaciones |
|---|---|---|---|---|
| A+B actual | 26.964 | 0,715 | −47,8 % | 251 |
| A+B 10 % dentro, **misma exposición** | **36.976** | 0,754 | −47,5 % | **286** |
| Los 27 actual | 14.067 | 0,506 | −42,2 % | 206 |
| Los 27 10 % dentro, **misma exposición** | **17.903** | 0,544 | −44,4 % | **256** |

**+37 % y +27 % con el mismo dinero invertido.** No es apalancamiento por la puerta de atrás.
(Mediana de las diez ventanas con exposición igualada: ×1,15 en A+B y ×1,27 en los 27; peor
casilla 0,91 y 0,87, siempre la ventana 2020-2022, que es la de menos dinero de todas.)

### Los tres avisos que hay que leer antes de tocar dinero

1. **En los 27 la caída EMPEORA**: de −42,2 % a −46,9 %, y empeora en todas las ventanas. En
   A+B mejora un poco (−47,8 % → −46,5 %). Si lo que se quiere es menos susto, este cambio no
   es el camino.
2. **El Sharpe de A+B no es fiable.** Sube de 0,715 a 0,782 en la corrida completa, pero por
   ventanas sube en 5, baja en 3 y empata en 2; en concreto **sin 2020 ni 2025 baja**
   (0,687 contra 0,740). En los 27 sí sube en 7 de 10. La mejora de Sharpe en A+B **hay que
   retirarla del titular**.
3. **La ventana 2020-2022 es ruido.** Ahí la escalera del contrato no es monótona en ningún
   universo (A+B: $2.597 · $6.864 · $3.764 · $4.978 · $5.933 para 5/10/15/20/25 %). Son 94 y
   81 operaciones y $3-7 mil al año: cualquier lectura de esa ventana sola no decide nada.

---

## 4. Las vecinas del dial (obligatorio: ¿es una casilla afortunada?)

Sólo se mueve **un** dial, así que hay que enseñar la escalera entera. Corrida completa:

| Contrato | A+B $/año | A+B Sharpe | A+B ops | 27 $/año | 27 Sharpe | 27 ops |
|---|---|---|---|---|---|---|
| 5 % dentro | 40.289 | 0,712 | 298 | 35.248 | 0,716 | 280 |
| **10 % dentro (propuesta)** | **43.408** | **0,782** | **282** | **25.477** | **0,643** | **265** |
| 15 % dentro | 38.417 | 0,771 | 272 | 18.992 | 0,569 | 249 |
| 20 % dentro | 29.111 | 0,706 | 264 | 12.293 | 0,455 | 227 |
| 25 % dentro (hoy) | 26.964 | 0,715 | 251 | 14.067 | 0,506 | 206 |

Es una **meseta**: moviendo el dial un paso a cada lado se obtiene $40.289 o $38.417 en A+B y
$35.248 o $18.992 en los 27. Nada se cae a la mitad. El escalón está entre el 15 % y el 20 %,
lejos de la propuesta.

**Por qué el 10 % y no el 5 %**, que en los 27 es mucho mejor ($35.248, y gana en las diez
ventanas): porque **en A+B el 5 % se cae** — 0,44 en la ventana 2020-22, 0,74 en 2021-24,
0,87 en 2023-26 y 0,91 en la 2.ª mitad, con Sharpe plano (0,712 contra 0,715). Un hallazgo
que sólo funciona en un universo no es un hallazgo. El 10 % es el **centro de la meseta en
los dos**.

**Por qué no el 15 %**, que la verificación 4 daba por igual de bueno: porque en la ventana
2020-2022 se hunde en los dos universos (0,63 en A+B y 0,48 en los 27) mientras el 10 % da
1,16 y 1,79. Con la salvedad del aviso 3 de arriba: esa ventana es ruidosa.

---

## 5. Los otros controles que la regla mejorada pasa

**Capital de partida** (el control que la verificación 1 exigió, porque el redondeo a
contratos enteros crea escalones que la banda de ±10 % no ve). $/año, contrato 25 % → 10 %:

| Capital | A+B | Los 27 |
|---|---|---|
| $15.000 | 6.527 → **7.076** | 4.197 → 3.757 ✗ |
| $30.000 | 13.983 → **20.918** | 7.467 → 7.122 ✗ |
| $60.000 | 26.964 → **43.408** | 14.067 → **25.477** |
| **$73.874 (la cuenta real)** | 36.528 → **51.190** | 19.151 → **39.843** |
| $120.000 | 57.903 → **79.992** | 42.687 → **58.935** |
| $240.000 | 142.570 → **227.247** | 74.986 → **126.983** |
| $480.000 | 272.971 → **475.207** | 192.280 → **259.527** |

Gana en 12 de 14 casillas. Las dos que pierde son cuentas de $15.000 y $30.000 en los 27, y
pierde poco (−10 % y −5 %). Con la cuenta real de Lester **gana en los dos universos y por
mucho**.

**Castigo de ejecución** (por si la horquilla real es peor que la supuesta). Doblándolo y
cuadruplicándolo:

| Castigo | A+B 25 % | A+B 10 % | 27 25 % | 27 10 % |
|---|---|---|---|---|
| 1,38 % (el supuesto) | 26.964 | 43.408 | 14.067 | 25.477 |
| 2,76 % | 26.198 | **36.684** | 13.603 | **23.041** |
| 5,52 % | 23.236 | **28.544** | 11.467 | **17.356** |

Con **cuatro veces** el coste de ejecución supuesto el contrato barato sigue ganando en los
dos universos. La ventaja no se la come la horquilla.

**Auditoría del fichero de datos.** Los ficheros del 10 % los construyó la vía 6 desde las
cadenas reales. Comprobado por mí: cambia **una sola cosa** (profundidad real mediana 0,10
contra 0,25; vencimiento real mediano 385 contra 386 días), los campos son los mismos y —lo
importante— **el fichero barato NO tiene una puerta de supervivencia a su favor**: los caminos
que se cortan sin motivo (dato que falta) son el 5,74 % en el del 10 % contra el 6,50 % en el
del 25 % en A+B, y 5,11 % contra 5,49 % en los 27. Los caminos cortos del contrato barato
(47 % contra 34 % por debajo de 120 sesiones) son casi todos el **suelo de 0,50×**
disparándose antes, que es la estrategia funcionando, no datos que falten.

---

## 6. Todo lo demás que se probó, y por qué no entra

Se midió cada mejora **sola** y luego **todas las combinaciones** (2 hoyos × 3 números de
plazas × con y sin escalado de tamaño × con y sin modulación por SPY = 24 configuraciones por
universo y por profundidad de contrato, y después la batería de diez ventanas sobre las diez
mejores). Éste es el resultado.

| Idea (de qué vía viene) | En la corrida completa | Por qué NO entra |
|---|---|---|
| **Escalar el tamaño con lo hundida que esté la acción, con tope 2×** (rescate de la verificación 2) | A+B ×1,23 · 27 ×1,13, Sharpe arriba en los dos | **Se desintegra en la crisis.** En la ventana 2020-2022 da 0,63 · 0,56 · 0,54 · 0,29 · 0,24 según la variante. En cuanto se combina con cualquier otra cosa, una de las dos ventanas de crisis se hunde. El gradiente por operación es real, pero la respuesta de tamaño está sobredimensionada. |
| **Modular el tamaño según SPY esté bajo su media de 50** (rescate de la verificación 3) | A+B ×1,18 · 27 ×1,21 sobre el contrato actual | Funciona sobre el contrato del 25 % (peor casilla 0,95/1,01, aceptable) pero **deja de funcionar sobre el contrato barato**: sobre el 10 % la peor casilla cae a 0,75 en A+B (ventana 2020-22). No se suma: se pisa con el cambio que sí adoptamos. |
| **Bajar el hoyo de −7 % a −5 %** (rescate de la verificación 5) | A+B ×1,17 · 27 ×1,19, y +7 y +25 operaciones | **El dial es ruido.** Barrido de −4 % a −10 % sobre el contrato actual: A+B $26k/32k/31k/**27k**/34k/28k/25k y los 27 $14k/17k/15k/**14k**/17k/17k/16k. Salta un ±25 % sin patrón. Y por ventanas su peor casilla es 0,87 en A+B y 0,79 en los 27. Sobre el contrato barato el −7 % actual es incluso el mínimo del barrido en A+B. **No se toca.** |
| **Más plazas y más pequeñas** (rescate de la verificación 1) | Sobre el contrato actual, 16 plazas: A+B ×1,01 con caída −41,2 % y los 27 ×1,13 con caída −38,4 % | Es un cambio de **riesgo**, no de dinero, y por ventanas su peor casilla es 0,85/0,97. Sobre el contrato barato el dial se vuelve **inestable en los 27**: 10 plazas ×1,81, 11 ×1,81, **12 ×1,08**. Un paso y se cae un 40 %: casilla afortunada. Se queda en 10. |
| **Dos posiciones por acción** (vía 2) | A+B ×1,84 · 27 ×1,40 con 343 y 334 operaciones | La 2.ª mitad de los 27 da **0,64 y 0,63**. Es exactamente lo que la verificación 1 dijo: doblar paga en A+B y no en los 27. |
| **Freno de mercado: no abrir con SPY hundido** (vía 8, sin verificar) | Sobre el contrato barato: A+B ×0,94 · 27 ×2,11, y baja la caída a −39 %/−41 % | **En A+B pierde dinero** y quita 43 operaciones (282 → 239), que es lo contrario del encargo. Como máquina de quitar susto en los 27 es lo mejor que hay; como titular, no. |
| **Filtro de volatilidad > 30 %** (vía 7, verificada) | Los 27 $16.739 → $24.701, Sharpe 0,55 → 0,69 | Verificado, pero **es un hallazgo de un solo universo**: en A+B aporta un +2 % que cae dentro del ruido del placebo. Y quita el 27 % de las operaciones. |
| **Revisión condicional a mitad de camino** (vía 3) | A+B ×1,03 · 27 ×1,09 | Su propio autor la retiró: sin 2020 pierde en los dos trozos de A+B. |

**Conclusión del punto 2 del encargo:** las mejoras **no se suman, se pisan**. La mejor
combinación de la corrida completa (contrato al 10 % + escalado de profundidad + modulación
por SPY: A+B $51.817 y los 27 $30.330) tiene su peor ventana en **0,80 y 0,26**. La mejor
sola —el contrato al 10 % y nada más— tiene su peor ventana en **0,99 y 0,92**. Nos quedamos
con la mejor sola, como manda el encargo.

---

## 7. Hoja de ruta: qué falta para ir más lejos, con números

El encargo pide más precisión y más operaciones. Lo entregado es **más operaciones y más
dinero**; la **precisión sigue pendiente**. Esto es lo que hay que construir, por orden de
valor.

### 7.1. La pieza que más vale, y es una descarga, no un análisis: la SALIDA CONDICIONAL

El cuello de botella conocido es que 10 plazas × 120 sesiones de aguante topan en ~250
operaciones. El contrato barato lo sube a 282/265, pero la palanca de verdad es soltar la
plaza **cuando la acción recupera su media de 50**, no a los 120 días fijos. El motor **ya
tiene el mando** (`usarRec`, que lee `o.iRec`), pero **el campo `iRec` no está en ninguno de
los ficheros de caminos** — lo he comprobado: los campos son `tk, dC, ma, coste, spot, K, exp,
profReal, dteReal, dSal`. Hay que reconstruir los ficheros añadiéndolo en el descargador.
Es lo único que puede dar más operaciones sin bajar el aguante en seco (bajarlo a 60 ya se
probó y destroza los dólares).

### 7.2. Un fallo silencioso que hay que arreglar antes de barrer el aguante

En el fichero de A+B **el camino más largo es de 130 sesiones** (mediana 130, máximo 130). Eso
significa que `plazo = 150` o `plazo = 180` **devuelven exactamente lo mismo que 130 sin dar
ningún error**. Cualquier barrido del aguante hacia arriba en A+B está midiendo aire. En los
27 el fichero llega a 250. Para cerrar ese eje hay que reconstruir `sincosteAB-p*-d400` con
al menos 200 sesiones de camino.

### 7.3. Lo que estuvo más cerca de dar PRECISIÓN, y qué le falta exactamente

**El filtro de volatilidad realizada > 30 %** (vía 7, la única de las cinco verificaciones que
salió `aguanta = true`). En los 27 es fuerte de verdad: $16.739 → $24.701, Sharpe 0,55 → 0,69,
y ninguno de 20 placebos que tiran operaciones al azar lo iguala. En A+B su aporte es +2 % y
cae dentro del ruido. **Qué le falta, con número:** medir en A+B la versión **relativa** (la
volatilidad del nombre dividida por la mediana del día), que en la propia verificación ya dio
$32.960 con Sharpe 0,73 y **249 operaciones** — más dinero que el corte absoluto y 43
operaciones más. Hay que pasarla por el protocolo completo (diez ventanas, dos universos,
placebos). Y hace falta **meter SPY en `precios-A.json` y `precios-B.json`**: hoy no está, y
por eso la variante "volatilidad contra la del SPY" devolvió cero operaciones en A+B y sacó
una fila que parecía un resultado y era el SPY pelado.

### 7.4. El filtro de estado de mercado: es un problema de MUESTRA, no de idea

Exigir que SPY esté bajo su media de 50 el día de la compra añadió +2,4 puntos de rentabilidad
anual en A+B y +3,0 en los 27 **entre 2016 y 2021**, fuera de la banda del azar en los dos
(p=1,7 % y p=0,0 %), y sobrevive a quitar 2020. **Entre 2021 y 2026 no añade nada.** La razón
está medida: en esa segunda ventana quedan 82 operaciones filtradas en A+B y 58 en los 27,
por debajo del suelo de 100, y además agrupadas en pocos episodios de mercado. **Para que esa
ventana decida por sí sola hacen falta ~200 operaciones filtradas**, o sea del orden de **150
tickers** (2,5 veces el universo A+B). Volver a medirlo sobre los mismos 60 nombres sólo va a
repetir el empate.

### 7.5. Lo que decidiría entre el 10 % y el 5 % dentro del dinero

Hoy no se puede decidir: en A+B manda el 10 % ($43.408 contra $40.289) y en los 27 manda el
5 % ($35.248 contra $25.477), y por operación la escalera va al revés que por cartera. Hacen
falta **dos cosas**:

- un **tercer universo** (el grupo C) como examen fuera de muestra;
- **bajar 2012-2015** con el mismo descargador cambiando sólo la fecha de inicio. El efecto es
  enorme en 2016-2019 y desaparece en 2021-2024; con sólo diez años y 59-108 operaciones por
  ventana de cuatro años **no se puede separar "cambió el régimen" de "fue suerte"**. Dos
  ventanas independientes más lo resolverían.

### 7.6. Lo que hay que dejar de probar (todo medido, no hace falta repetirlo)

Escalado de tamaño por profundidad sin tope; escalado con tope 2× combinado con cualquier otra
cosa; hoyo a −5 % o a cualquier otro sitio; dos posiciones por acción; más de 11 plazas sobre
el contrato barato; freno de mercado como titular; revisión condicional a mitad de camino;
tope de ganancia; arrastre; subir el suelo de 0,50; salir cuando la acción recupera su media
de 50 con los datos de hoy.

---

## 8. Ficheros

Todo lo de este documento se puede rehacer con estos scripts, en
`C:/Users/leste/dev/eva/web/scripts/`. **`motor-cartera.mjs` NO se ha tocado.**

| Fichero | Qué hace |
|---|---|
| `motor-uc.mjs` | Copia de `motor-cartera.mjs` con cuatro mandos nuevos (`porTicker`/`sepDias`, `kProf`/`topeProf`/`umbralProf`, `kBajo`/`kAlto`) y el P&L realizado por operación. Con los valores por defecto es idéntico al original. |
| `uc-lab.mjs` | Laboratorio común: carga precios, calcula la media de 50 de cada acción y la del SPY, la volatilidad de 100 sesiones, y hace **siempre** la mediana de 41 capitales. |
| `uc-01-base.mjs` | Reproduce los dos listones al dígito. |
| `uc-02-solos.mjs` | Cada mejora por separado. |
| `uc-03-combo.mjs` | El factorial de 24 combinaciones por universo y profundidad. |
| `uc-04-ventanas.mjs` | La batería de diez ventanas sobre las diez mejores combinaciones. |
| `uc-05-huecos.mjs` | Curva fina de plazas, freno de mercado y dos-por-ticker, con ventanas. |
| `uc-06-escalera.mjs` | La escalera del contrato 5/10/15/20/25 % con ventanas y cifras absolutas. |
| `uc-07-hoyo.mjs` | El dial del hoyo de −4 % a −10 % con ventanas. |
| `uc-08-controles.mjs` | Barrido de capital, castigo de ejecución y auditoría del fichero. |
| `uc-09-audit.mjs` | Por qué los caminos del contrato barato son más cortos (suelo, no truncamiento). |
| `uc-10-expo.mjs` | El control de exposición igualada. |
| `uc-11-porop.mjs` | Estadística por operación, sin cartera. |
| `uc-cmp.mjs` · `uc-cmp2.mjs` · `uc-cmp3.mjs` | Las tablas comparativas. |

Se corren así:

```
UNI=AB PROF=10 node --max-old-space-size=10240 uc-06-escalera.mjs
UNI=27 PROF=25 node --max-old-space-size=10240 uc-06-escalera.mjs
```

`UNI` es `AB` o `27`; `PROF` es `5`, `10`, `15`, `20` o `25`.
