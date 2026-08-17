
# EL BARBELL — el cóndor 0DTE paga los billetes de lotería

Cóndor: SPXW 0DTE, entrada 11:00, ±25 puntos, alas 50. Billetes: calls a >365 días
y >60% / >100% fuera del dinero, ticker AL AZAR entre los 28. 500 semillas por especificación.

## 1. Radiografía del dato — ANTES de medir

SPXW 0DTE: **653 sesiones** 2024-01-02 → 2026-08-10
Cadenas EOD (calendario de SPY): **651 sesiones** 20240102 → 20260806

Filtro del descargador (`scripts/bajar-cadenas-todos-los-dias.ts` línea 57): `expiration=*` —
**sin filtro de strike**, al contrario que el fichero de OI que arruinó el hallazgo del puente— y
`b>0 && a>0 && a>=b`. Consecuencia que HAY que modelar: **un call sin bid no está en el fichero.**
Ausente = bid 0 = el billete no vale nada. Aquí eso NO se lee como "sin dato".
Comprobado en el fichero: 58.067 cotizaciones de muestra, **0 con bid = 0**. El filtro es real.

Fechas de compra: el **primer día hábil de cada mes**, 32 meses (20240102 → 20260803).

## 2. Precálculo de los billetes (una pasada por cada ticker)

Guardián del cero silencioso: **0 casos** de call dentro del dinero sin cotización. Ningún billete se marcó a cero por perderle la pista al contrato.
Ficheros de cadena leídos: **17.991**. Billetes construidos: **873**;
(ticker, mes, umbral) sin ningún strike por encima del umbral: **895**.
Marcas diarias: 170.730 con bid > 0 y 25.380 a CERO (el billete ya no cotiza).
Splits detectados el día que ocurren y verificados contra la cadena del día siguiente:
  · NVDA 20240607→20240610 ratio bruto 9.926 → 10:1
  ·     ajustado: NVDA 20250117 K 780 → 78 (×10 contratos), bid real 47.85
  ·     ajustado: NVDA 20250117 K 970 → 97 (×10 contratos), bid real 33.2
  ·     ajustado: NVDA 20250620 K 1010 → 101 (×10 contratos), bid real 33.75
  ·     ajustado: NVDA 20250620 K 1320 → 132 (×10 contratos), bid real 21.95
  ·     ajustado: NVDA 20250620 K 1450 → 145 (×10 contratos), bid real 17.65
  ·     ajustado: NVDA 20250620 K 1810 → 181 (×10 contratos), bid real 9.25
  ·     ajustado: NVDA 20250620 K 1340 → 134 (×10 contratos), bid real 21
  ·     ajustado: NVDA 20250620 K 1670 → 167 (×10 contratos), bid real 11.9
  ·     ajustado: NVDA 20250620 K 1840 → 184 (×10 contratos), bid real 9.15
  · WMT 20240223→20240226 ratio bruto 2.946 → 3:1
Billetes que llegan vivos al final del dato (sin desenlace): **444**.
Billetes cuyo ticker deja de tener dato antes del vencimiento (WBA, comprada): **0**.

### Qué tickers pueden dar billete, y cuántos meses de 32

**>60% fuera:** AMD 32 · F 32 · META 32 · NKE 32 · NVDA 32 · TSLA 32 · AAPL 31 · INTC 30 · BA 28 · CRM 26 · PFE 26 · PYPL 26 · UNH 24 · DIS 23 · ORCL 23 · MSFT 20 · WBA 20 · XOM 19 · COST 16 · T 14 · SPY 13 · CSCO 10 · BAC 8 · JPM 7 · GE 6 · KO 6 · QQQ 6 · WMT 4
(28 de 28 tickers tienen billete alguna vez)

**>100% fuera:** TSLA 31 · AMD 29 · NVDA 28 · F 26 · META 24 · NKE 23 · INTC 18 · CRM 17 · WBA 17 · AAPL 15 · PYPL 13 · BA 12 · UNH 12 · PFE 11 · ORCL 10 · T 4 · MSFT 3 · DIS 1 · SPY 1
(19 de 28 tickers tienen billete alguna vez)

## 3. El cóndor — control de cordura antes de combinar nada

| | n | crédito mediano | acierto | P&L medio |
|---|---|---|---|---|
| dato ya medido (±25/ala 50) | 653 | $500 | 75% | $74 |
| este script | 653 | $500 | 75% | $74 |

Radiografía del cóndor: 1306 ficheros, 321.964 filas a las 11:00, 0 con ask≤0, 0 con spot 0, 0 días sin la hora.
P&L medio $74/día · desviación $1123 · **t = 1.70** · $/año (252 sesiones) = **$18.770**
Ese t=1.70 es el que ya conocíamos: el propio cóndor NO está demostrado. Todo lo que sigue
mide qué le hace el barbell a un motor que aún no se distingue de cero.

Meses cuyo primer día hábil de cadena coincide con una sesión del cóndor: 32 de 32.

**Cóndor solo** (1 contrato, sin billetes): final $56.951 desde $8313 · $18.770/año · caída máxima $15.176

## 4. Las 12 especificaciones declaradas — todas, ganen o pierdan

| umbral | % ingreso | salida | $/año medio | mediana | p05 | p95 | caída med. | billetes | gastado | recuperado | · resuelto | · sin vencer | cubre? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| >60% | 25% | vencimiento | $29.160 | $24.329 | $14.684 | $57.922 | $29.075 | 17.0 | $12.456 | $39.380 | $15.201 | $24.178 | 316% |
| >60% | 25% | 10x | $23.172 | $22.571 | $14.922 | $33.978 | $19.077 | 17.0 | $12.456 | $23.862 | $20.796 | $3066 | 192% |
| >60% | 50% | vencimiento | $36.415 | $29.424 | $10.353 | $90.545 | $47.559 | 17.6 | $24.849 | $70.570 | $29.066 | $41.504 | 284% |
| >60% | 50% | 10x | $26.501 | $24.103 | $10.839 | $48.398 | $29.503 | 17.6 | $24.849 | $44.883 | $39.386 | $5497 | 181% |
| >60% | 100% | vencimiento | $49.093 | $30.999 | $2676 | $150.521 | $89.813 | 19.1 | $49.239 | $127.814 | $49.666 | $78.148 | 260% |
| >60% | 100% | 10x | $31.666 | $25.532 | $3693 | $76.889 | $55.553 | 19.1 | $49.239 | $82.657 | $71.411 | $11.246 | 168% |
| >100% | 25% | vencimiento | $48.806 | $45.588 | $14.362 | $101.552 | $48.958 | 16.9 | $12.490 | $90.321 | $43.969 | $46.351 | 723% |
| >100% | 25% | 10x | $22.691 | $21.336 | $14.654 | $35.293 | $21.118 | 16.9 | $12.490 | $22.651 | $20.645 | $2006 | 181% |
| >100% | 50% | vencimiento | $71.238 | $61.991 | $10.405 | $182.173 | $84.691 | 18.6 | $24.984 | $160.942 | $83.426 | $77.516 | 644% |
| >100% | 50% | 10x | $27.017 | $23.607 | $11.052 | $55.120 | $34.881 | 18.6 | $24.984 | $46.355 | $42.014 | $4341 | 186% |
| >100% | 100% | vencimiento | $99.283 | $84.620 | $2151 | $256.583 | $136.810 | 20.5 | $49.688 | $258.320 | $145.477 | $112.842 | 520% |
| >100% | 100% | 10x | $31.014 | $27.917 | $3707 | $72.713 | $66.796 | 20.5 | $49.688 | $81.416 | $70.647 | $10.769 | 164% |

Referencia: **cóndor solo $18.770/año**, caída $15.176. Ingreso total del cóndor en el período: **$48.638** — ningún gasto puede superarlo.

**AVISO SOBRE LA COLUMNA "sin vencer".** 444 de 873 billetes construidos NO han vencido cuando
se acaba el dato (comprar a >365 días en 2025-2026 significa vencer en 2027). Esos se cierran al ÚLTIMO
BID REAL, que es una valoración de mercado, no un resultado. La columna "· resuelto" es la única
parte del dinero que de verdad pasó por caja.

**LO QUE NO ES ESTA TABLA: un test de significación.** La dispersión entre semillas mide sólo el ruido de
ELEGIR TICKER AL AZAR, no la incertidumbre del período. Con 500 semillas ese error estándar tiende a cero
y cualquier t saldría enorme sin que eso signifique nada. La incertidumbre real está en la sección 6:
son ~26 billetes en 2,6 años, y casi todo el dinero sale de dos nombres.

## 5. ¿El ingreso del cóndor cubre la sangría de las loterías?

De las 12 especificaciones, **12 recupera(n) de media al menos lo gastado**.
Mejor especificación en media: >100% / 100% / vencimiento → $99.283/año (cóndor solo $18.770).
Peor: >100% / 25% / 10x → $22.691/año.
Semillas que baten al cóndor solo, por especificación:

| espec. | % de semillas que baten al cóndor | mejor semilla | peor semilla |
|---|---|---|---|
| >60%/25%/vencimiento | 65% | $85.128 | $14.081 |
| >60%/25%/10x | 74% | $44.905 | $14.081 |
| >60%/50%/vencimiento | 69% | $155.481 | $9281 |
| >60%/50%/10x | 72% | $90.733 | $9281 |
| >60%/100%/vencimiento | 65% | $271.967 | $714 |
| >60%/100%/10x | 63% | $106.786 | $930 |
| >100%/25%/vencimiento | 80% | $150.584 | $14.052 |
| >100%/25%/10x | 65% | $49.071 | $14.052 |
| >100%/50%/vencimiento | 80% | $272.683 | $9368 |
| >100%/50%/10x | 64% | $66.531 | $9368 |
| >100%/100%/vencimiento | 85% | $346.303 | −$21 |
| >100%/100%/10x | 64% | $122.660 | −$21 |

## 6. ¿Qué pasa cuando toca una? — todos los billetes, sin filtrar

Sucesos de billete acumulados sobre las 500 semillas de la especificación >60%/100%/vencimiento: **9533**.
(La unidad es el BILLETE, no el contrato: comprar 20 contratos del mismo strike el mismo día es UN suceso.)

| múltiplo sobre lo pagado | % de billetes |
|---|---|
| 0 (a cero) | 48.7% |
| 0–0,5x | 25.3% |
| 0,5–1x | 8.5% |
| 1–3x | 8.2% |
| 3–10x | 3.9% |
| 10x o más | 5.4% |

Múltiplo medio 2.19x · mediana 0.01x · p95 11.40x · máximo 79.5x
Múltiplo MÁXIMO alcanzado en vida (lo que se habría cobrado con una salida perfecta): medio 5.51x · p95 25.31x

### Los billetes distintos que multiplicaron por 5 o más (36 de 437 billetes distintos)

| ticker | comprado | vence | strike | pagado | múltiplo | máximo en vida | ¿venció? |
|---|---|---|---|---|---|---|---|
| INTC | 20250602 | 20260618 | 33 | $1.25 | **79.5x** | 79.5x | sí, cobrado |
| INTC | 20250401 | 20260618 | 38 | $1.46 | **64.7x** | 64.7x | sí, cobrado |
| INTC | 20250501 | 20260618 | 33 | $1.58 | **62.9x** | 62.9x | sí, cobrado |
| AMD | 20250501 | 20260618 | 155 | $6.05 | **62.8x** | 64.4x | sí, cobrado |
| AMD | 20250602 | 20260618 | 185 | $5.65 | **61.8x** | 63.7x | sí, cobrado |
| CSCO | 20250501 | 20260618 | 95 | $0.38 | **60.9x** | 89.1x | sí, cobrado |
| AMD | 20250401 | 20260618 | 165 | $6.65 | **55.6x** | 57.2x | sí, cobrado |
| INTC | 20250801 | 20260918 | 32 | $1.42 | **47.4x** | 76.3x | **no, valorado** |
| INTC | 20250902 | 20261218 | 40 | $1.61 | **37.4x** | 62.9x | **no, valorado** |
| INTC | 20250701 | 20261218 | 38 | $1.75 | **35.5x** | 59.0x | **no, valorado** |
| AMD | 20250203 | 20260618 | 185 | $9.85 | **35.5x** | 36.5x | sí, cobrado |
| AMD | 20250902 | 20260918 | 260 | $8.65 | **26.3x** | 37.4x | **no, valorado** |
| AMD | 20250701 | 20261218 | 220 | $11.35 | **24.1x** | 32.4x | **no, valorado** |
| GE | 20250102 | 20260116 | 270 | $2.28 | **23.8x** | 25.2x | sí, cobrado |
| AMD | 20251001 | 20261218 | 270 | $11.15 | **20.4x** | 28.9x | **no, valorado** |
| GE | 20241101 | 20260116 | 280 | $2.23 | **19.4x** | 21.1x | sí, cobrado |
| AMD | 20250801 | 20260918 | 280 | $10.90 | **19.1x** | 28.0x | **no, valorado** |
| CSCO | 20260302 | 20270617 | 130 | $0.94 | **16.6x** | 24.2x | **no, valorado** |
| GE | 20241202 | 20260116 | 290 | $2.62 | **12.7x** | 14.0x | sí, cobrado |
| INTC | 20260102 | 20270115 | 65 | $3.40 | **11.9x** | 23.5x | **no, valorado** |
| INTC | 20251001 | 20261218 | 60 | $3.75 | **11.4x** | 22.2x | **no, valorado** |
| INTC | 20251201 | 20261218 | 65 | $3.65 | **10.8x** | 21.7x | **no, valorado** |
| AMD | 20260302 | 20270319 | 320 | $19.00 | **10.4x** | 15.3x | **no, valorado** |
| INTC | 20251103 | 20261218 | 65 | $4.40 | **8.9x** | 18.0x | **no, valorado** |
| INTC | 20250102 | 20260116 | 33 | $1.60 | **8.7x** | 9.8x | sí, cobrado |

De los 36 billetes gordos, **14 llegaron a vencer** y el resto sigue vivo al acabarse el dato:
su múltiplo es una VALORACIÓN al bid real, no dinero cobrado.

**VERIFICADO A MANO CONTRA EL FICHERO CRUDO** (el mayor de todos, AMD): comprado el 2025-06-02 con AMD a
$114,63, strike 185 (+61%), vencimiento 2026-06-18 (381 días). Cotización ese día [5,50 · 5,65] → se paga
el ask **5,65**. El 2026-06-18 AMD cierra en **$537,37** y el contrato cotiza [349,20 · 354,55]; el intrínseco
es 537,37−185 = **352,37**, que casa con el bid a menos de $3. **61,8x, y es dinero real.**

### Criba de concentración — ¿de dónde sale el dinero de los billetes?

| ticker | billetes | P&L acumulado | % de todo lo ganado |
|---|---|---|---|
| AMD | 401 | $36.150.736 | 68% |
| INTC | 505 | $13.203.105 | 25% |
| GE | 82 | $2.906.060 | 5% |
| CSCO | 88 | $671.608 | 1% |
| XOM | 390 | $175.486 | 0% |
| JPM | 116 | $81.229 | 0% |
| BAC | 152 | $12.281 | 0% |
| SPY | 278 | −$7958 | — |
| BA | 448 | −$1.561.221 | — |
| CRM | 430 | −$1.871.825 | — |
| NVDA | 499 | −$1.999.471 | — |
| META | 411 | −$2.464.840 | — |

### Dejar fuera del bombo a los nombres que lo ganan todo

La criba de concentración de la barrera exige que ningún activo pase del 20%. Aquí no se cumple ni de lejos.
La pregunta operativa es: si en 2024 no hubiera existido el nombre que resultó ser el ganador —cosa que
nadie sabía entonces—, ¿qué habría dado el barbell? Se repite la simulación quitando del bombo a los N
tickers que más dinero dieron, uno a uno.

| bombo | $/año medio | mediana | p05 | vs cóndor solo |
|---|---|---|---|---|
| los 28 tickers | $49.093 | $30.999 | $2676 | +$30.323 |
| sin AMD | $21.345 | $15.577 | $2377 | +$2575 |
| sin AMD, INTC | $9577 | $6658 | $1664 | −$9193 |
| sin AMD, INTC, GE | $6853 | $5618 | $1551 | −$11.917 |
| sin AMD, INTC, GE, CSCO | $6238 | $5024 | $1567 | −$12.532 |

(Especificación >60% / 100% del ingreso / aguantar a vencimiento.)

Y la misma criba sobre la especificación que MEJOR salió (>100% / 100% / vencimiento), que es la que apetece elegir:

| bombo | $/año medio | mediana | vs cóndor solo |
|---|---|---|---|
| los 28 tickers | $99.283 | $84.620 | +$80.513 |
| sin AMD | $25.873 | $22.143 | +$7103 |
| sin AMD, INTC | $2850 | $2356 | −$15.920 |

### La incertidumbre de verdad: 2.000 remuestreos de los billetes

Cada cartera compra 19 billetes en 2.59 años. Remuestreando 19 billetes con reemplazo del conjunto
de 9533 resultados observados, el aporte de los billetes al $/año sale:

| p05 | p25 | mediana | media | p75 | p95 | % de carteras con aporte ≤ 0 |
|---|---|---|---|---|---|---|
| −$17.528 | −$7156 | $12.373 | $30.769 | $49.953 | $140.337 | 37% |

La mediana muy por debajo de la media es la firma de la lotería: **la cartera típica NO cobra**, la media la
levantan unas pocas carteras que sí. Eso es exactamente el perfil que Lester pide — y también la razón por
la que 2,6 años de dato no bastan para saber cuánto vale.

### ¿Es el perfil que se buscaba: "perder poco casi siempre y de vez en cuando cobrar 30x"?

| | cóndor solo | barbell >60%/100%/venc (semilla mediana) |
|---|---|---|
| días a la baja | 25% | 38% |
| peor día | −$4900 | −$24.469 |
| mejor día | $3640 | $20.879 |
| percentil 1 de los días | −$3805 | −$10.986 |
| caída máxima | $15.176 | $47.549 |
| patrimonio MÍNIMO alcanzado | −$796 | −$1003 |
| día en que deja de cubrir el colateral | 20240404 | 20240404 |

## ⚠️ EL TOPE DURO QUE INVALIDA TODAS LAS CIFRAS DE ARRIBA

El efectivo libre son **$8313** y el colateral de un cóndor de alas 50 es **$5000**. La caída
observada del cóndor solo es **$15.176** — casi el doble del efectivo. El patrimonio mínimo del cóndor solo
es −$796, y el 20240404 ya no cubre el colateral.
En 500 de 500 semillas del barbell el patrimonio cae por debajo del colateral en algún momento.

**Todo lo que la simulación hace después de ese día es ficción**: el bróker habría cerrado la posición y no
habría con qué poner la del día siguiente. Los $/año de las tablas suponen que se puede seguir operando 1
cóndor los 653 días, y con $8313 de efectivo **eso no es cierto** en el propio período medido.
Para operar 1 cóndor de alas 50 sin quedarse sin dinero en la caída observada harían falta ~$20.176
de efectivo libre; para la caída p95 de $39.715 que ya midió `opt-cola.mjs`, ~$44.715.

### ¿Cabe algún tamaño de cóndor en $8313? — se prueban las seis anchuras

| alas | colateral (neteado) | patrimonio mínimo desde $8313 | día en que se queda sin colateral | $/año |
|---|---|---|---|---|
| 10 | $1000 | −$12 | 20250327 | −$2302 |
| 20 | $2000 | −$516 | 20240425 | $4902 |
| 30 | $3000 | −$717 | 20240415 | $11.577 |
| 50 | $5000 | −$796 | 20240404 | $18.770 |
| 75 | $7500 | −$1545 | 20240108 | $22.772 |
| 100 | $10.000 | −$965 | 20240102 | $22.434 |

**Ninguna de las seis anchuras aguanta el período con este efectivo.** No es un problema del barbell ni de la anchura: el cóndor 0DTE a 1 contrato no se puede financiar con $8313.

**LO QUE NO SÉ Y CAMBIA ESTO:** el cálculo usa sólo el efectivo libre. Si Robinhood le presta contra las
500 acciones de HOOD (~$47.106), el colchón es otro y el cóndor sí se puede sostener. Esa pregunta —si
la cuenta es de efectivo o de margen y cuánto poder de compra dan las acciones— **no está verificada en el
proyecto** y decide si esta sección es un tope duro o un aviso. No la relleno.

El billete de lotería **no cubre el día malo del cóndor**: no es una cobertura, es otra apuesta que corre en
paralelo. El peor día sigue siendo el peor día del cóndor (−$4900), porque los billetes son calls
compradas —lo peor que hacen es no moverse—. Lo que sí cambia es que las subidas dejan de ser de $74:
el mejor día de la cartera combinada es $20.879.

## 7. El peaje de la horquilla en los billetes (trampa nº4)

**>60% fuera** (578 billetes distintos): pagado real $780 vs punto medio $730 (peaje 6.8%) ·
cobrado real $1347 vs punto medio $1384 · **múltiplo real 1.73x vs a punto medio 1.90x**
**>100% fuera** (295 billetes distintos): pagado real $577 vs punto medio $541 (peaje 6.6%) ·
cobrado real $1523 vs punto medio $1557 · **múltiplo real 2.64x vs a punto medio 2.88x**

La horquilla de un billete de lotería es enorme en % (se paga $0,20 por algo que vale $0,15), y ese
es el peaje que hay que superar. La diferencia entre las dos columnas ES cuánto del resultado era liquidez.

## 8. Los tres tercios de tiempo (criba 3 de la barrera)

| espec. | 20240102→20241111 | 20241111→20250925 | 20250925→20260810 | mismo signo |
|---|---|---|---|---|
| >60%/25%/vencimiento | −$895 | $24.882 | $2937 | **NO** |
| >60%/25%/10x | −$1080 | $9412 | $3074 | **NO** |
| >60%/50%/vencimiento | −$948 | $41.110 | $5560 | **NO** |
| >60%/50%/10x | −$1462 | $16.241 | $5255 | **NO** |
| >60%/100%/vencimiento | −$2757 | $68.077 | $13.255 | **NO** |
| >60%/100%/10x | −$1843 | $24.400 | $10.860 | **NO** |
| >100%/25%/vencimiento | −$2646 | $75.150 | $5327 | **NO** |
| >100%/25%/10x | −$2646 | $11.337 | $1471 | **NO** |
| >100%/50%/vencimiento | −$4613 | $128.325 | $12.246 | **NO** |
| >100%/50%/10x | −$2878 | $19.604 | $4645 | **NO** |
| >100%/100%/vencimiento | −$6838 | $193.188 | $22.281 | **NO** |
| >100%/100%/10x | −$3227 | $24.974 | $9981 | **NO** |

(P&L de los BILLETES por tercio, medio sobre las semillas. El cóndor ya se sabe que mantiene el signo.)

**0 de 12 especificaciones mantienen el signo en los tres tercios.** El primer tercio —de enero
a noviembre de 2024, que incluye la corrección de agosto— es negativo casi siempre: los billetes comprados
en 2024 vencieron sin valor y los que pagaron se compraron en 2025. Un resultado que vive en un tercio no
pasa la barrera, y este vive en el segundo.

## 9. El listón — comprar SPY y no hacer nada

SPY 20240102 $472.65 → 20260806 $768.56 = **62.6%** en 2.59 años = **20.6%/año**.
Sobre los $55.419 de la cuenta entera: **$11.437/año** (sin dividendos, que sumarían ~1,2 puntos).
El barbell mueve sólo los $8313 de efectivo libre: el 85% restante ya está en HOOD y no se toca.

## 10. El conflicto que nadie había puesto sobre la mesa: el colateral y los billetes son el MISMO dinero

Efectivo libre: **$8313** (el 85% de la cuenta son 500 acciones de HOOD).
Colateral de 1 cóndor de alas 50: **$4500** si el bróker netea las dos verticales,
**$9500** si retiene cada una por su lado. En Robinhood **son dos órdenes** y eso sigue sin verificar.

| hipótesis | colateral | queda libre para billetes |
|---|---|---|
| neteado | $4500 | $3813 |
| dos verticales | $9500 | −$1187 |

Esta simulación reserva $5000 de colateral (hipótesis neteada, la favorable) y sólo gasta en billetes
lo que el cóndor ha ganado por encima de eso. **Con la hipótesis de dos verticales, un cóndor de alas 50
ni siquiera cabe en el efectivo libre**, y el barbell no arranca hasta que el cóndor haya ganado la diferencia.

## 11. Resumen en dólares al año sobre la cuenta real

| estrategia | $/año medio | $/año mediana | caída máxima | patrimonio mínimo | semillas que se quedan sin colateral |
|---|---|---|---|---|---|
| cóndor solo, 1 contrato | $18.770 | $18.770 | $15.176 | −$796 | sí (20240404) |
| barbell >60% / 25% / vencimiento | $29.160 | $24.329 | $29.075 | −$1011 | 100% |
| barbell >60% / 25% / 10x | $23.172 | $22.571 | $19.077 | −$1011 | 100% |
| barbell >60% / 50% / vencimiento | $36.415 | $29.424 | $47.559 | −$1136 | 100% |
| barbell >60% / 50% / 10x | $26.501 | $24.103 | $29.503 | −$1136 | 100% |
| barbell >60% / 100% / vencimiento | $49.093 | $30.999 | $89.813 | −$1411 | 100% |
| barbell >60% / 100% / 10x | $31.666 | $25.532 | $55.553 | −$1411 | 100% |
| barbell >100% / 25% / vencimiento | $48.806 | $45.588 | $48.958 | −$901 | 100% |
| barbell >100% / 25% / 10x | $22.691 | $21.336 | $21.118 | −$901 | 100% |
| barbell >100% / 50% / vencimiento | $71.238 | $61.991 | $84.691 | −$949 | 100% |
| barbell >100% / 50% / 10x | $27.017 | $23.607 | $34.881 | −$949 | 100% |
| barbell >100% / 100% / vencimiento | $99.283 | $84.620 | $136.810 | −$1045 | 100% |
| barbell >100% / 100% / 10x | $31.014 | $27.917 | $66.796 | −$1045 | 100% |
| comprar SPY y esperar (cuenta entera) | $11.437 | | (no medida aquí) | |

**Y el mismo cuadro sin los dos nombres que lo ganaron todo** — que es el escenario que hay que mirar para
decidir, porque en enero de 2024 nadie sabía que AMD iba a multiplicar por 4,7 ni INTC por 5,2:

| estrategia | $/año medio | $/año mediana | vs cóndor solo |
|---|---|---|---|
| barbell >60% / 25% / vencimiento | $17.896 | $16.067 | −$874 |
| barbell >60% / 25% / 10x | $19.192 | $18.276 | +$422 |
| barbell >60% / 50% / vencimiento | $15.465 | $12.903 | −$3305 |
| barbell >60% / 50% / 10x | $18.121 | $15.752 | −$649 |
| barbell >60% / 100% / vencimiento | $9577 | $6658 | −$9193 |
| barbell >60% / 100% / 10x | $14.374 | $11.566 | −$4396 |
| barbell >100% / 25% / vencimiento | $14.868 | $14.712 | −$3902 |
| barbell >100% / 25% / 10x | $15.060 | $14.873 | −$3710 |
| barbell >100% / 50% / vencimiento | $10.879 | $10.489 | −$7891 |
| barbell >100% / 50% / 10x | $12.026 | $11.276 | −$6744 |
| barbell >100% / 100% / vencimiento | $2850 | $2356 | −$15.920 |
| barbell >100% / 100% / 10x | $5023 | $3647 | −$13.747 |

(Fuera del bombo: AMD y INTC.)

## 12. Qué hacer — no me quedo en el "no"

**Lo que la medición SÍ deja en pie:** el lado de los billetes, con precios reales y pagando el ask, dio un
múltiplo medio de 2.19x sobre 437 billetes distintos comprados AL AZAR, sin ningún selector. La forma es la
que Lester quiere: 49% a cero y 5.4% por encima de 10x. **Y la respuesta a la pregunta literal es SÍ:** el ingreso del
cóndor paga los billetes. Gastando el 100% del ingreso se compran $49.239 de billetes que devuelven
$127.814 ($49.666 cobrados de verdad, $78.148 todavía en cartera). Nunca se
toca el capital: sólo se gasta lo que el cóndor ha ganado antes. (El gasto pasa ligeramente del ingreso NETO
final de $48.638 porque el acumulado del cóndor tuvo un pico más alto a mitad de camino y se gastó de él.)

**Lo que NO deja en pie:** el 93% del dinero de los billetes sale de AMD e INTC, el primer tercio de tiempo es
negativo en 5 de las 6 especificaciones de >60%, y quitando esos dos nombres el barbell PIERDE contra el
cóndor solo en 11 de las 12. Con 32 apuestas en 2,6 años no hay forma de separar "la lotería paga" de
"tocaron dos gordos".

**Las dos medidas concretas que sí resolverían esto, con dato que YA está en disco:**

1. **El lado de los billetes sobre 2016-2026, no sobre 2024-2026.** `scripts/cache-theta/cadenas` tiene los 28
   tickers desde 2016: son **~126 apuestas mensuales** en vez de 32, con 2018, 2020 y 2022 dentro. Es el mismo
   precálculo de este script cambiando dos fechas, y es lo único que puede decir si el múltiplo medio de
   2.19x sobrevive a un período sin un AMD. La contra ya conocida: el memo de los 10x dice que el mismo
   perfil dio 22,66x en 2019 y 0,11x en 2021 — con más muestra eso se ve o se descarta, pero se ve.
2. **Verificar si Robinhood da poder de compra contra las acciones de HOOD.** Es una consulta a la cuenta, no
   una medición, y decide si la sección 6 es un tope duro. Sin esa respuesta, el $/año de todas estas tablas
   está calculado sobre una cartera que en abril de 2024 ya se había quedado sin dinero.

**Lo que NO recomiendo tocar:** el forward-test del cóndor con filtro de GEX que ya está corriendo. Sus
parámetros están pre-registrados y es lo único que ninguno de los dos puede manosear.

---
115 s · detalle en `scripts/conv-barbell-resultado.json`