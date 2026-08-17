LADO=call  OTM=1.3  DTE objetivo 90 [60,120]  listón |t| ≥ 3.23 (40 pruebas)
SUCESOS: 1534  ·  (ticker,vencimiento) únicos: 1534
rechazos: {"sinCadena":0,"sinVenc":46,"sinStrike":92,"sinCierreVenc":7,"huecoCierres":7,"dupVenc":98,"sinIV":0,"sinOI":0}
tickers: 28, mayor TSLA 63 (4.1%)
meses de entrada: 63  ·  con split entre entrada y vencimiento: 10
múltiplo: media 1.214x  mediana 0.000x  ceros 1457 (95.0%)  máx 243.6x
múltiplo a MID: media 1.382x
moneyness real: mediana 1.270  ·  ask mediano $0.38  ·  horquilla mediana 20%
por año de entrada: 2021 n=266 0.61x · 2022 n=280 0.19x · 2023 n=289 2.31x · 2024 n=307 0.30x · 2025 n=292 0.69x · 2026 n=100 6.84x
cobertura de cada selector: S01:217 S02:206 S03:217 S04:217 S05:1534 S06:1532 S07:1531 S08:1528 S09:1528 S10:1528 S11:1534 S12:1507 S13:1290 S14:1280 S15:1534 S16:1534 S17:1534 S18:1534 S19:1460 S20:1290

### RESULTADO — los 20 selectores, tercio alto por rango DENTRO del mes
| # | selector | n alto | media alto | media pool | ventaja | IC95 de la media | t | pct azar | 3 tercios | mayor (sucesos) | mayor (PAGO) | top10 | gana | σ alto/bajo | ventaja a MID | PASA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S13 | momento250 | 413 | 2.654x | 1.342x | +1.312 | 0.93–4.11x | 2.45 | 100.0 | +0.71 +1.83 +3.86 | NVDA 10% | AMD 30% | 84% | 24 | 2.30/2.34 | +1.481 | no |
| S11 | ivContrato | 491 | 1.909x | 1.214x | +0.696 | 1.06–3.46x | 1.25 | 97.8 | −0.10 +0.60 +2.21 | TSLA 13% | AMD 39% | 83% | 22 | 2.47/2.14 | +0.709 | no |
| S09 | ivMenosRV | 489 | 1.623x | 1.218x | +0.405 | 0.79–2.21x | 0.08 | 85.8 | +0.56 +1.82 −2.20 | DIS 8% | NVDA 21% | 56% | 45 | 2.23/2.36 | +0.322 | no |
| S16 | precioContrato | 491 | 1.555x | 1.214x | +0.342 | 0.49–2.76x | 0.69 | 84.4 | +0.10 +1.64 −0.22 | TSLA 11% | AMD 38% | 74% | 34 | 2.29/2.27 | +0.291 | no |
| S18 | distanciaSigma | 491 | 1.468x | 1.214x | +0.254 | 0.26–3.63x | 0.50 | 79.4 | −0.04 −1.04 +2.14 | TSLA 12% | AMD 46% | 94% | 15 | 2.52/2.05 | +0.255 | no |
| S06 | oiLejosDelta20 | 491 | 1.431x | 1.215x | +0.216 | 0.61–2.93x | 1.31 | 76.2 | −0.16 +1.25 +1.03 | NVDA 7% | INTC 26% | 81% | 24 | 2.29/2.33 | +0.267 | no |
| S10 | estructura | 489 | 1.414x | 1.218x | +0.196 | 0.67–2.73x | -0.20 | 70.2 | +0.04 −0.11 −0.38 | CRM 7% | INTC 27% | 79% | 28 | 2.29/2.30 | +0.206 | no |
| S12 | momento60 | 482 | 1.375x | 1.234x | +0.141 | 0.53–2.80x | 1.55 | 65.2 | +0.40 +0.03 +1.94 | NVDA 7% | INTC 35% | 78% | 24 | 2.28/2.34 | +0.179 | no |
| S15 | gexNorm | 491 | 1.325x | 1.214x | +0.111 | 0.59–2.40x | 0.72 | 65.8 | +0.24 −0.09 +0.99 | KO 8% | INTC 36% | 83% | 21 | 2.24/2.30 | +0.149 | no |
| S08 | skew | 489 | 1.288x | 1.218x | +0.070 | 0.16–2.79x | 0.06 | 58.0 | +0.02 −2.15 +2.26 | TSLA 10% | INTC 43% | 100% | 12 | 2.41/2.20 | +0.124 | no |
| S14 | rvExpansion | 412 | 1.382x | 1.323x | +0.060 | 0.34–2.85x | -0.32 | 55.2 | +0.13 −2.36 +1.58 | CRM 5% | INTC 33% | 100% | 10 | 2.35/2.23 | +0.215 | no |
| S07 | oiEnStrike | 489 | 1.023x | 1.216x | -0.193 | 0.61–1.50x | -0.81 | 31.2 | −0.33 +0.02 −1.24 | SPY 8% | NVDA 18% | 76% | 30 | 2.24/2.31 | -0.217 | no |
| S05 | oiLejosShare | 491 | 0.923x | 1.214x | -0.291 | 0.54–1.25x | -0.22 | 20.4 | +0.40 −0.24 −0.41 | TSLA 12% | NVDA 26% | 77% | 23 | 2.40/2.17 | -0.374 | no |
| S17 | horquillaRel | 491 | 0.854x | 1.214x | -0.359 | 0.29–1.46x | -1.35 | 14.0 | −0.49 −1.47 +0.21 | KO 7% | ORCL 25% | 96% | 15 | 2.30/2.28 | -0.179 | no |
| S20 | oiTotalRel | 413 | 0.815x | 1.342x | -0.527 | 0.24–1.25x | -1.12 | 9.4 | −0.09 −0.20 −2.44 | INTC 7% | QQQ 33% | 91% | 16 | 2.32/2.26 | -0.572 | no |
| S19 | volumenRel | 466 | 0.699x | 1.274x | -0.575 | 0.21–1.28x | -2.02 | 4.4 | −0.42 −1.75 −2.46 | NVDA 6% | QQQ 40% | 92% | 18 | 2.34/2.25 | -0.613 | no |
| S04 | flujoNetoP | 54 | 0.626x | 2.005x | -1.379 | 0.00–1.76x | -0.97 | 33.4 | +0.00 +1.58 −6.12 | AMD 22% | AMD 81% | 100% | 2 | 2.34/2.35 | -1.604 | no |
| S01 | flujoNetoC | 54 | 0.508x | 2.005x | -1.497 | 0.00–1.52x | -0.88 | 23.4 | −0.02 +1.52 −13.53 | NVDA 20% | AMD 100% | 100% | 1 | 2.36/2.32 | -1.725 | no |
| S03 | flujoRatioCP | 54 | 0.105x | 2.005x | -1.900 | 0.00–0.31x | -1.48 | 13.2 | −1.60 −1.72 +0.00 | NVDA 33% | MSFT 94% | 100% | 2 | 2.32/2.34 | -2.127 | no |
| S02 | flujoNetoCLejos | 52 | 0.143x | 2.167x | -2.024 | 0.00–0.39x | -1.11 | 18.6 | −1.73 +0.06 −13.53 | QQQ 21% | MSFT 71% | 100% | 2 | 2.26/2.29 | -2.270 | no |

Listón del azar: percentil ≥ 99,75. Mediana del control ≈ media del pool por construcción.
Traducción a dólares (presupuesto de $3000/año de prima repartido entre los sucesos elegidos):
  momento250: 69 compras/año · 4963 $/año  (pool: 1026 $/año)
  ivContrato: 82 compras/año · 2728 $/año  (pool: 641 $/año)
  ivMenosRV: 82 compras/año · 1869 $/año  (pool: 655 $/año)
  precioContrato: 82 compras/año · 1665 $/año  (pool: 641 $/año)
  distanciaSigma: 82 compras/año · 1403 $/año  (pool: 641 $/año)
  Comprar TODO el pool: media 1.214x → 641 $/año sobre $3000 de prima

### AUTOPSIA de momento250 (el mejor de los 20) — EXPLORATORIO, no cuenta como hallazgo
Dejando UN ticker fuera cada vez (28 pruebas), la ventaja sobre el pool va de 0.871 (sin AMD) a 1.477 (sin COST).
  los 5 que más la sostienen: sin AMD → +0.87 · sin INTC → +0.97 · sin ORCL → +1.19 · sin CSCO → +1.22 · sin NVDA → +1.27
  sin AMD NI INTC: alto 1.412x vs pool 0.919x (n=379)

Año a año con $3000 de prima repartidos entre los sucesos del tercio alto:
| año | compras | media alto | $ resultado | media pool | $ pool |
|---|---|---|---|---|---|
| 2021 | 7 | 0.00x | -3000 | 1.47x | 1421 |
| 2022 | 90 | 0.00x | -3000 | 0.19x | -2434 |
| 2023 | 91 | 4.57x | 10722 | 2.31x | 3937 |
| 2024 | 99 | 0.17x | -2495 | 0.30x | -2088 |
| 2025 | 93 | 0.50x | -1510 | 0.69x | -935 |
| 2026 | 33 | 18.70x | 53112 | 6.84x | 17509 |

### ¿TENÍA FUERZA LA PRUEBA? (potencia ~80%, α del listón)
| selector | n alto | desv. típica del múltiplo | separación MÍNIMA detectable | ¿concluyente si sale que no? |
|---|---|---|---|---|
| momento250 | 413 | 17.43 | 4.94x por suceso | NO — sólo vería un efecto enorme |
| ivContrato | 491 | 15.10 | 3.92x por suceso | NO — sólo vería un efecto enorme |
| ivMenosRV | 489 | 7.16 | 1.86x por suceso | NO — sólo vería un efecto enorme |
| precioContrato | 491 | 12.28 | 3.19x por suceso | NO — sólo vería un efecto enorme |
| distanciaSigma | 491 | 14.50 | 3.77x por suceso | NO — sólo vería un efecto enorme |
| oiLejosDelta20 | 491 | 10.69 | 2.78x por suceso | NO — sólo vería un efecto enorme |
| estructura | 489 | 10.21 | 2.66x por suceso | NO — sólo vería un efecto enorme |
| momento60 | 482 | 10.22 | 2.68x por suceso | NO — sólo vería un efecto enorme |
| gexNorm | 491 | 10.29 | 2.67x por suceso | NO — sólo vería un efecto enorme |
| skew | 489 | 14.31 | 3.72x por suceso | NO — sólo vería un efecto enorme |
| rvExpansion | 412 | 11.70 | 3.32x por suceso | NO — sólo vería un efecto enorme |
| oiEnStrike | 489 | 6.19 | 1.61x por suceso | NO — sólo vería un efecto enorme |
| oiLejosShare | 491 | 5.50 | 1.43x por suceso | NO — sólo vería un efecto enorme |
| horquillaRel | 491 | 6.72 | 1.74x por suceso | NO — sólo vería un efecto enorme |
| oiTotalRel | 413 | 5.52 | 1.56x por suceso | NO — sólo vería un efecto enorme |
| volumenRel | 466 | 5.47 | 1.46x por suceso | NO — sólo vería un efecto enorme |
| flujoNetoP | 54 | 3.82 | 2.99x por suceso | NO — sólo vería un efecto enorme |
| flujoNetoC | 54 | 3.73 | 2.92x por suceso | NO — sólo vería un efecto enorme |
| flujoRatioCP | 54 | 0.73 | 0.57x por suceso | sí |
| flujoNetoCLejos | 52 | 0.79 | 0.63x por suceso | sí |