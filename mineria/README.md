# Minería de criptomonedas — Fase 0 (CERRADO el 2026-08-29)

Estudio de si a Lester le conviene minar. **Conclusión: NO comprar hardware ahora.**
La línea se cierra el 29 de agosto de 2026; se deja todo reproducible por si vuelve.

## Cómo volver a correrlo

```
cd mineria
python descargar-datos.py     # refresca dificultad de Zcash y precio ZEC
python fase0-zcash.py         # valida contra WhatToMine y corre el backtest
```

El script **se mata solo** si el modelo no reproduce WhatToMine dentro del 2%.

## El dato que decide todo: la luz de Lester

Factura de LUMA, 910 kWh. El coste **marginal** (el cargo fijo de $8,00 no cuenta):

| concepto | $/kWh |
|---|---|
| Cargo por Consumo | 0,08648 |
| + FCA (combustible) | 0,11407 |
| + PPCA (compra de energía) | 0,051748 |
| + CILTA-CELI, SUBA HH/NHH, EE | 0,023442 |
| **cada kWh adicional** | **0,27574** |

Promedio de 12 meses de la factura: $0,2715/kWh. No es un mes raro.

## Qué es rentable a $0,27574/kWh

Lo que decide no es la moneda, es **cuántos dólares produce cada kWh**:

| máquina | moneda | consumo | ingreso/día | $ por kWh | ¿vive? |
|---|---|---|---|---|---|
| Antminer X9 | Monero | 2.472 W | ~$30 | 0,506 | sí, **pero no se vende** |
| Antminer Z15 Pro | Zcash | 2.780 W | $38,29 | 0,390 | sí |
| Antminer S21 Pro | Bitcoin | 3.510 W | $8,96 | 0,106 | no |
| RTX 4060 (su portátil) | altcoins GPU | 115 W | $0,46 | 0,167 | no |
| Antminer KS5 Pro | Kaspa | 3.150 W | **$0,00** | 0,000 | muerta |

**Monero descartado por liquidez**: Binance lo delistó en feb-2024, Kraken también, Coinbase
nunca lo listó, 73 exchanges soltaron monedas de privacidad en 2025. **Zcash sí**: Robinhood lo
listó el 24-abr-2026 en todo EE.UU. ⚠️ Robinhood **no acepta depósitos** de ZEC — sólo compra y
venta. Para cobrar lo minado hace falta Coinbase o Kraken (direcciones transparentes `t`).

## El modelo (verificado, no estimado)

| variable | valor |
|---|---|
| `network_Sol_s` | `dificultad × 8192 / 75` |
| `mi_cuota` | `840.000 / network_Sol_s` |
| recompensa al minero | 2,50 ZEC hasta 2024-11-23; **1,25 ZEC** después |
| eras del subsidio | 6,25 → 3,125 (2020-11-18) → 1,5625 (2024-11-23); el minero cobra el 80% |
| calculado hoy | $38,29/día |
| WhatToMine dice | $38,32/día → **desvío 0,08%** |

## ⚠️ Campos que NO se pueden usar

- **Blockchair `generation` y `fee_total` agregados**: contaminados por el pool blindado de Zcash.
  La suma diaria de `generation` sale **negativa** (−6,69e12 el 29-ago) y el bloque 2.000.000 da
  **−107,70 ZEC**. Sólo sirven `date`, `avg(difficulty)` y `count()`.
- **La portada de ASIC Miner Value**: su ranking de "más rentables" da ingreso **$0,00** para
  Z15 Pro, X9 y KS5 Pro, y su "beneficio" es el coste de la luz cambiado de signo. Casi produce
  un hallazgo falso de +$9.527/año.
- **Los artículos de minería**: hablaban de ZEC a $350 cuando cotiza a **$840** (Yahoo, Kraken y
  Coinbase coinciden), y daban el KS5 Pro a "$38-52/día" con datos de **abril-agosto de 2025**.

## El backtest — 70 meses, 2.109 días (nov-2020 → hoy)

Comprar una Z15 Pro por $3.110 el día 1 de cada mes:

| | |
|---|---|
| Cohortes que recuperaron los $3.110 | **14 de 53 = 26%** |
| Días con neto positivo | 922 de 2.109 = **44%** |
| Meses quemando efectivo | 38 de 70 = **54%** |

| período | meses | recuperaron |
|---|---|---|
| nov-2020 → dic-2021 | 14 | **14 (100%)** |
| **ene-2022 → may-2025** | **41** | **0** |
| jun-2025 → hoy | 15 | 7 (las que tuvieron tiempo) |

Dónde estuvo el dinero: **2021 +$14.464 · ene-2022 a sep-2025 −$8.900 · desde oct-2025 +$4.578.**
Todo lo bueno son dos subidas de precio. Correlación precio-neto: 0,535.

**Condicional** (comprar sólo cuando el mes ya es rentable) sube el acierto de 24% a 53-72%,
**pero descansa en DOS episodios, no en 18 meses**: las cohortes consecutivas comparten casi
todos sus días futuros. n real ≈ 2.

## 🔴 Por qué NO se compra hoy: la dificultad

| | dificultad | vs hoy |
|---|---|---|
| hace 12 meses | 69.987.017 | **29%** |
| hace 6 meses | 123.033.770 | 51% |
| hace 1 mes | 210.548.823 | 87% |
| **hoy** | **243.059.997** | 100% |

Ha **triplicado en 12 meses**, marcó máximo histórico el 28-ago-2026 y sube **+16,4% al mes**.
Como el ingreso es inversamente proporcional a la dificultad:

| dificultad | precio ZEC | ¿recupera $3.110? | acumulado 24m |
|---|---|---|---|
| congelada | plano | SÍ, 6 meses | +$14.234 |
| +5%/mes | plano | SÍ, 8 meses | +$3.274 |
| +10%/mes | plano | **NO** | −$2.034 |
| **+16,4%/mes (real)** | plano | **NO** | **−$5.457** |
| +16,4%/mes | ZEC +16,4%/mes | SÍ, 6 meses | +$14.234 |

Para mantener los $19,51/día de hoy, ZEC tiene que subir al ritmo de la dificultad:
**$1.325 en 3 meses · $2.090 en 6 · $5.199 en 12.**

## La comparación que lo cierra

Para que minar recupere los $3.110, ZEC tiene que llegar a **$2.090 en 6 meses**. Si eso pasa,
**$3.910 en ZEC comprado hoy a $840 valdrían $9.725** (+$5.815), sin electricidad, sin calor,
sin electricista y vendible en un segundo. Minar, en ese mismo escenario, **te devuelve lo que
pusiste. Cero.**

> **Minar Zcash es una forma apalancada, ilíquida y que se deshincha sola de estar largo en ZEC.
> Si la tesis es "ZEC sube", el instrumento es ZEC.**

## Si algún día se retoma: las tres palancas

1. **El precio de la máquina.** A $3.110 necesita 6 meses con dificultad congelada; a **$1.500**
   se paga en 3 y sobrevive a +10%/mes. Es la palanca más fuerte y la única que se controla.
2. **La luz.** Los $18,40/día son el **48% del ingreso bruto**. Alojada a $0,10/kWh serían $6,67.
3. **La señal de entrada es la DIFICULTAD, no el precio.** Se compra cuando la dificultad se
   **aplana** con el precio sostenido — cuando el minero marginal ya se rindió. Hoy es lo
   contrario: están entrando en masa.

## Otras cosas medidas y cerradas

- **Minar en su portátil** (RTX 4060 Laptop + i9-13950HX): techo de **$168/año** con la luz gratis;
  a su tarifa pierde **$218/año** sólo con la GPU y **$356/año** con GPU y CPU.
- **La trampa del aire acondicionado**: 2.780 W de calor en un cuarto con aire cuestan ~$6,13/día
  extra de electricidad (COP ~3). Convierte 17,5 meses de recuperación en **8,8 años**. Ningún
  vendedor ni el documento original lo mencionan.
- **$100.000/año minando**: 20 × Antminer X9 = $114.000 de capital y **49 kW** — una nave.
  Con ASICs de bitcoin: 137 máquinas, $120.000 de hierro y **$348.228/año de alojamiento**, con
  el punto de equilibrio en un hashprice que estaba por debajo hace ocho semanas.

## Ficheros

| | |
|---|---|
| `fase0-zcash.py` | modelo + validación + backtest por cohortes + proyección |
| `descargar-datos.py` | refresca las tres fuentes |
| `datos/zec_agg*.json` | dificultad y bloques diarios de Zcash, 2016-10-28 → hoy (Blockchair) |
| `datos/zec_yah.json` | precio ZEC-USD diario, 2017-11-09 → hoy (Yahoo) |
| `documento-mining-original.txt` | el manual de Lester (1.869 líneas), texto extraído del .docx |

**Sobre el documento original**: buen manual de *operación* (Ansible, systemd, checklists,
plantillas) y acierta en lo esencial (Ethereum ya no se mina). Pero en 1.869 líneas **no hay un
solo número** — entrega los deberes y los llama plan. Fallos concretos: recomienda el Antminer
S19 (hierro de 2020, ~29,5 J/TH cuando hoy hace falta bajar de 15); lista LTC/BCH/DOGE como
candidatas de GPU cuando ninguna lo es; usa `--no-watchdog` en un script cuyo fin es reiniciarse
solo; guarda `backup_gpg_passphrase` en claro en un YAML; hace `curl | sh` como root; y tiene un
`when: "... or true"` que anula su propia condición.
