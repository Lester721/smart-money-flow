# El GEX por vencimiento — ¿dónde está la gamma?

> Sección del Manual de EVA. Escrita el 2026-08-14 explicándosela a Lester en directo, con los
> datos que había en pantalla en ese momento. Se irá ampliando con sus preguntas.
>
> Panel: `/0dte`, segundo bloque · API: `GET /api/gex/vencimientos` · cálculo: `lib/gexSpx.ts`

## Qué es la gamma, sin tecnicismos

Cuando alguien compra una opción, quien se la vende **no quiere apostar**: quiere cobrar y
quedarse neutral. Para eso compra o vende acciones del índice y se tapa.

Lo importante: **cuánto tiene que taparse depende de dónde esté el precio.** Si el índice se
mueve, ese vendedor está *obligado* a comprar o vender aunque no quiera. La **gamma** es esa
obligación. No es una opinión de nadie: es una fuerza mecánica.

- **Gamma positiva** → la cobertura **frena** el mercado. Si sube, venden; si baja, compran.
  Amortiguador.
- **Gamma negativa** → **amplifica**. Si sube, compran más; si baja, venden más. Acelerador.

## Por qué hacía falta separarlo por vencimiento

Antes teníamos **un solo número**: "hay +$29B de gamma". Suena informativo y no lo es, porque no
dice **dónde** está.

Y dónde está es decisivo, porque está medido en este mismo proyecto que **la gamma aprieta el
doble a un día que a diez** (tabla de horizontes en `/0dte`, ~2.630 días por ticker, 2016-2026).
Es una fuerza de corto plazo: los dealers se cubren en horas, no en semanas.

Así que $29B repartidos en vencimientos lejanos **no es lo mismo** que $20B concentrados en hoy,
aunque el total se parezca.

**El panel lo resuelve con una frase, no con una tabla que haya que interpretar:**
*"El peso está en el 0DTE"* o *"El peso NO está en el 0DTE"*. Si algún día dice lo segundo, el
suelo sobre el que pisa el cóndor 0DTE está más blando de lo que sugiere el número agregado.

## Ejemplo real (2026-08-14, 10:35 ET, SPX 7.790,56)

| vencimiento | DTE | GEX neto | peso | muro calls | muro puts |
|---|---|---|---|---|---|
| 2026-08-14 | 0 | +$20,4B | **63,1%** | 7800 | 7800 |
| 2026-08-17 | 3 | +$4,6B | 17% | 7850 | 7775 |
| 2026-08-18 | 4 | +$1,5B | 6,7% | 7800 | 7800 |
| 2026-08-19 | 5 | +$2,4B | 8,3% | 7800 | 7725 |
| 2026-08-20 | 6 | −$142M | 4,9% | 7800 | 7700 |

## Los muros, y cuándo dejan de ser muros

El **muro de calls** es el strike con más gamma del lado de las calls; el de puts, igual. Se
llaman muros porque el precio tiende a **frenarse** ahí: cuando el índice se acerca, la cobertura
empuja en contra.

**Cuando los dos coinciden en el mismo strike deja de ser una barrera y se comporta como un
imán.** En el ejemplo, ambos muros del 0DTE están en 7800 con el índice en 7790: el precio tiende
a quedarse pegado ahí hasta el cierre. Es el escenario que le gusta a un cóndor, que gana si el
índice se queda quieto.

## Qué es "el tablero" — y qué NO es

Lo preguntó Lester el 2026-08-14: *"¿qué significa el 65% de la gamma del tablero?"*. Estaba mal
escrito y sugería "toda la gamma del mercado", que es falso.

**El peso de cada vencimiento = su gamma / la suma de los cinco.** Ejemplo real (2026-08-14, 16:00):

| vencimiento | DTE | gamma calls | gamma puts | suma |
|---|---|---|---|---|
| 2026-08-14 | 0 | $17.682M | $18.390M | **$36.072M** |
| 2026-08-17 | 3 | $10.301M | $7.519M | $17.820M |
| 2026-08-18 | 4 | $4.159M | $3.036M | $7.195M |
| 2026-08-19 | 5 | $5.675M | $3.410M | $9.085M |
| 2026-08-20 | 6 | $2.485M | $2.845M | $5.330M |
| | | | **TOTAL** | **$75.502M** |

`36.072 / 75.502 = 47,8%`

Dos detalles del cálculo:

- **Se suman calls y puts en valor absoluto, no el neto.** Un vencimiento con mucha gamma repartida
  a los dos lados manda aunque su neto sea casi cero: hay mucho que cubrir, aunque se compense.
- **"El tablero" son los CINCO vencimientos más cercanos, no todo el mercado.** Hay opciones de SPX
  a meses vista que no se cuentan. El porcentaje significa «de la gamma de los próximos días».

## ⚠️ El reloj — y una corrección de la que me pillaron

**Compara siempre a la misma hora.** Eso se mantiene. Pero el motivo que di primero era falso.

El 2026-08-14 por la mañana escribí que *"el peso del 0DTE sube solo según avanza la sesión"*,
basándome en comparar **nuestro** dato de las 16:00 (56,4%) con el de **MarketSnack** a las 12:15
(32%). **Dos fuentes distintas y dos días distintos** — exactamente la trampa que este proyecto
tiene apuntada como regla, y caí en ella yo.

Con la comparación limpia —misma fuente, mismo día— sale al revés:

```
2026-08-14  12:25 →  65,0%
2026-08-14  16:00 →  47,8%      BAJÓ
```

**Por qué:** hay dos fuerzas opuestas. La gamma crece como 1/√T según se acerca el vencimiento,
pero al final del día **las opciones muy fuera del dinero del 0DTE dejan de cotizar** cuando ya no
valen nada, y aportan cero. Menos strikes contando, menos gamma total en ese vencimiento.

**No tenemos medido el patrón.** Así que la regla práctica se mantiene —dos lecturas a horas
distintas no son comparables— pero por "cambia de forma que no sabemos", no por "sube".

## Detalles del cálculo que conviene saber

- **El peso es la cuota de gamma ABSOLUTA** (calls + puts), no la del neto. Un vencimiento con
  mucha gamma repartida a los dos lados manda en el tablero aunque su neto sea casi cero.
- **El nominal va ajustado por delta.** El bruto infla por diez (~$297B contra ~$25B) y no
  significa nada: lo que importa es lo que los dealers tienen que cubrir de verdad.
- **La IV es la real del mercado**, no una estimación. Black-Scholes se usa sólo para convertir
  esa IV en gamma — mercado → griega, nunca modelo → precio.
- **Si el Terminal está apagado, el panel lo dice y no enseña números.** No se rellena nada.

## Preguntas de Lester — índice

> **Cada pregunta suya va aquí con sus palabras**, no reformulada. Si preguntó algo es que el
> manual no lo explicaba, así que la pregunta es el mejor índice que existe de lo que falta.
> Todas son del 2026-08-14, la primera sesión en que se sentó a mirar el panel.

| Su pregunta | Respuesta corta | Dónde está entera |
|---|---|---|
| *"¿Qué debo ver o buscar del gamma exposure cuando lo estoy viendo?"* | Tres cosas y en este orden: el **signo y el percentil**, **dónde está** la gamma, y **la distancia a los muros** — que es la que casi nadie mira y la que más decide | [Qué mirar, en orden](#qué-mirar-en-orden) |
| *"¿Qué se supone que me dice?"* | Si hoy el mercado tiene **freno o acelerador**. Nada más | [Lo que dice, en una frase](#lo-que-dice-en-una-frase) |
| *"¿Cómo puedo usar esta información?"* | Para elegir **qué tipo** de operación encaja hoy, **dónde** poner las patas cortas, y sobre todo **cuándo no operar** | [La tabla de decisión](#la-tabla-de-decisión) |
| *"No entendí lo de que los muros te dicen dónde poner las patas cortas. No sé la diferencia entre las largas y las cortas"* | **Corta = la que vendes**, define dónde ganas. **Larga = la que compras**, es el seguro y define cuánto puedes perder | [Patas cortas y largas](#patas-cortas-y-largas--cómo-se-arma-un-spread) |
| *"No sé cómo sacarle valor a la tabla de vencimientos"* | Tres usos: saber si el freno de hoy es real, encontrar los **strikes que se repiten** como muro en varios vencimientos (los sólidos), y detectar un vencimiento a contracorriente | [Por qué hacía falta separarlo](#por-qué-hacía-falta-separarlo-por-vencimiento) |
| *"¿A qué te refieres con que el peso está en el 0DTE? ¿Cómo lo sabes?"* | Gamma de ese vencimiento dividida entre la suma de los cinco. La aritmética completa está en el panel | [Qué es "el tablero"](#qué-es-el-tablero--y-qué-no-es) |
| *"¿Qué significa el 65% de la gamma del tablero?"* | Que dos de cada tres dólares de gamma **de los próximos días** están en el vencimiento de hoy. **No** es el 65% de todo el mercado — eso estaba mal escrito | [Qué es "el tablero"](#qué-es-el-tablero--y-qué-no-es) |

**Lo que salió de estas preguntas, además de las respuestas:**

1. El **Panel de decisión** de `/0dte` — nació de su frase *"no me falta información, me falta que
   la información llegue ordenada en el momento de decidir"*.
2. Una **corrección**: al buscar los números para explicarle el peso del 0DTE, salió que mi
   afirmación de que "sube durante la sesión" era falsa. Ver [El reloj](#️-el-reloj--y-una-corrección-de-la-que-me-pillaron).

**Preguntar "¿cómo lo sabes?" es lo que más rápido encuentra los errores.**

---

# Cómo se USA el GEX para decidir

> Añadido el 2026-08-14 contestando a Lester: *"¿qué debo ver o buscar? ¿qué se supone que me
> dice? ¿cómo puedo usar esta información?"* — con los datos que había en pantalla ese momento.

## Lo que dice, en una frase

**Si hoy el mercado tiene freno o acelerador.**

- **GEX positivo** → los dealers venden cuando sube y compran cuando baja. Freno, rangos.
- **GEX negativo** → lo contrario. Acelerador, rangos que se rompen.

## Lo que NO dice — la confusión más cara

**No dice si va a subir o bajar.** Ni una palabra sobre dirección. Dice cómo se va a *comportar*
el precio, no hacia dónde va. Quien lo venda como señal direccional o no lo entiende o está
vendiendo algo.

## Qué mirar, en orden

**1. El signo y el PERCENTIL.** El número absoluto no dice nada: "+$17B" podría ser un día flojo.
El percentil contra los 652 días medidos sí. Percentil 88 = de los días más amortiguados de los
últimos dos años.

**2. Dónde está la gamma** (panel de vencimientos). Si el peso está en el 0DTE, el freno actúa
hoy. Si está en un vencimiento lejano, el freno de hoy es más flojo que lo que sugiere el total.

**3. LA DISTANCIA A LOS MUROS.** El hallazgo más útil que tenemos, medido sobre 652 días:

| distancia del muro al precio | veces que aguanta |
|---|---|
| pegado (~0,1%) | **58–65%** |
| a 0,6–1% | **92%** |

> **Lo que decide no es lo alto que sea el muro, es lo lejos que esté.**

Un muro enorme pegado al precio es poco fiable; uno moderado a un 0,8% aguanta casi siempre.

## La tabla de decisión

| lo que ves | lo que encaja |
|---|---|
| GEX muy positivo + muros lejos | vender rango (cóndor, spreads): el freno trabaja a favor |
| GEX negativo | **no vender rango.** Los muros se rompen |
| GEX positivo pero muros pegados | régimen bueno, **entrada mala**. Esperar |

El uso que más dinero ahorra es el tercero: saber cuándo **no** operar.

## Caso real — 2026-08-14, 11:30 ET

```
SPX 7.784,30 · GEX +$17.504M · percentil 88 de 652 días
muro CALL 7790 (a 0,07%) · muro PUT 7775 (a 0,12%) · giro 7770,45
SEÑAL: operar · crédito $240 · riesgo $4.760
```

**El sistema dice "operar". La lectura correcta es no hacerlo:**

1. **$4.760 de riesgo por $240 de premio.** Uno a veinte: hay que acertar >95% sólo para empatar.
2. Los muros que sostienen la operación **aguantan 58% y 65%**, porque están pegados al precio.
3. El backtest prometía 73% de acierto y **$725** de crédito. Hoy son **$240**. Y las cuatro
   señales en vivo van $205, $410, $335, $220 — **todas por debajo**.

Ese hueco entre lo que promete el backtest y lo que paga el mercado es lo que ha matado todo lo
demás probado este verano. Ver [[hallazgo-horquilla-porcentaje-de-la-prima]].

## La honestidad de fondo

El GEX es **lo único del proyecto que ha mostrado señal repetible**. Cobrarlo es otra cosa: el
cóndor 0DTE sigue vivo y sin confirmar, con el crédito real a la mitad del backtest y 4
operaciones de las ~30 que hacen falta.

**Uso honesto hoy: filtro de contexto, no generador de órdenes.** Te dice si el suelo está firme
o resbaladizo. Sobre suelo resbaladizo no se vende rango. Sobre suelo firme, todavía hay que
decidir si el precio que pagan compensa.

---

# Patas cortas y largas — cómo se arma un spread

> Lester, 2026-08-14: *"no sé la diferencia entre las largas y las cortas en el diseño de los
> spreads"*. Va aquí porque sin esto la frase "los muros te dicen dónde poner las patas cortas"
> no significa nada.

Un cóndor de hierro son **cuatro opciones**:

```
vender call 7810   ← PATA CORTA    cobras $0,75
comprar call 7860  ← pata larga    pagas  $0,15
vender put  7760   ← PATA CORTA    cobras $0,85
comprar put  7710  ← pata larga    pagas  $0,20
```

**La corta es la que vendes: de ahí sale el dinero. La larga es la que compras: es el seguro.**

| | qué define |
|---|---|
| **Cortas** (7760 y 7810) | **dónde ganas.** Si el índice cierra entre esos dos números, te quedas todo el crédito |
| **Largas** (7710 y 7860) | **cuánto puedes perder.** Sin ellas una caída fuerte no tiene fondo; con ellas el daño se corta en seco |

La distancia entre corta y larga —50 puntos— **es exactamente el riesgo**: 50 × $100 = $5.000,
menos el crédito cobrado.

## Por qué conecta con los muros

El muro es donde el precio tiende a frenarse. Así que **la pata corta se pone justo por fuera del
muro**: estás apostando a que el precio no lo atraviesa. La larga va más lejos y sólo existe para
que, si te equivocas, la pérdida tenga suelo.

**Por eso la distancia importa tanto.** Si el muro está pegado al precio y sólo aguanta el 58-61%,
estás poniendo tu pata corta detrás de una pared endeble.

## El número que descarta operaciones más rápido

**Acierto necesario para empatar = riesgo / (riesgo + crédito).**

Ejemplo real del 2026-08-14 a las 12:40: riesgo $4.880, crédito $120.

```
4880 / (4880 + 120) = 97,6%
```

**Hay que acertar el 97,6% de las veces sólo para no perder dinero**, y el muro más flojo aguanta
el 61%. No cuadra, y no hace falta más análisis para verlo.

Ese cálculo es lo que hace ahora el **Panel de decisión** de `/0dte`, automáticamente y en verde o
rojo, para no tener que cruzar tres sitios de la pantalla como hubo que hacer ese día.
