LADO=call  OTM=1.3  DTE objetivo 90 [60,120]  listón |t| ≥ 3.23 (40 pruebas)
SUCESOS: 1463  ·  (ticker,vencimiento) únicos: 1463
rechazos: {"sinCadena":0,"sinVenc":46,"sinStrike":169,"sinCierreVenc":6,"huecoCierres":7,"dupVenc":93,"sinIV":0,"sinOI":0}
tickers: 28, mayor AAPL 62 (4.2%)
meses de entrada: 63  ·  con split entre entrada y vencimiento: 10
múltiplo: media 0.948x  mediana 0.000x  ceros 1425 (97.4%)  máx 398.0x
múltiplo a MID: media 1.126x
moneyness real: mediana 1.337  ·  ask mediano $0.23  ·  horquilla mediana 37%
por año de entrada: 2021 n=260 0.32x · 2022 n=258 0.00x · 2023 n=275 2.12x · 2024 n=300 0.06x · 2025 n=280 0.51x · 2026 n=90 6.20x
cobertura de cada selector: S01:213 S02:202 S03:213 S04:213 S05:1463 S06:1461 S07:1461 S08:1458 S09:1458 S10:1458 S11:1463 S12:1437 S13:1223 S14:1214 S15:1463 S16:1463 S17:1463 S18:1463 S19:1391 S20:1223

### RESULTADO — los 20 selectores, tercio alto por rango DENTRO del mes
| # | selector | n alto | media alto | media pool | ventaja | IC95 de la media | t | pct azar | 3 tercios | mayor (sucesos) | mayor (PAGO) | top10 | gana | σ alto/bajo | ventaja a MID | PASA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S13 | momento250 | 391 | 2.589x | 1.095x | +1.493 | 1.08–4.94x | 2.03 | 100.0 | +1.11 +2.65 +3.15 | NVDA 9% | AMD 48% | 91% | 17 | 2.92/3.02 | +1.686 | no |
| S11 | ivContrato | 468 | 1.936x | 0.951x | +0.985 | 0.58–4.57x | 1.53 | 98.6 | −0.31 +2.11 +2.54 | TSLA 13% | AMD 55% | 94% | 15 | 3.21/2.68 | +1.036 | no |
| S18 | distanciaSigma | 468 | 1.720x | 0.951x | +0.769 | 0.44–3.47x | 0.98 | 93.4 | −0.35 +0.87 +2.29 | TSLA 13% | AMD 62% | 99% | 11 | 3.27/2.57 | +0.817 | no |
| S09 | ivMenosRV | 465 | 1.538x | 0.955x | +0.584 | 0.99–2.51x | 0.38 | 87.6 | +0.50 +2.72 −2.12 | DIS 8% | NVDA 33% | 73% | 28 | 2.89/2.99 | +0.540 | no |
| S16 | precioContrato | 468 | 1.327x | 0.951x | +0.376 | 0.66–1.90x | 2.95 | 74.2 | +0.04 +3.11 +0.31 | TSLA 12% | NVDA 38% | 78% | 23 | 2.94/2.89 | +0.330 | no |
| S08 | skew | 465 | 1.230x | 0.955x | +0.275 | 0.21–3.17x | 0.27 | 68.4 | −0.09 −2.03 +2.86 | TSLA 11% | AMD 70% | 100% | 7 | 3.14/2.72 | +0.400 | no |
| S10 | estructura | 465 | 0.913x | 0.955x | -0.041 | 0.65–1.44x | -0.85 | 57.2 | +0.13 −0.33 −2.23 | CRM 7% | XOM 24% | 87% | 17 | 2.94/2.96 | +0.004 | no |
| S15 | gexNorm | 468 | 0.904x | 0.951x | -0.047 | 0.44–1.71x | 0.99 | 58.6 | +0.26 +0.33 +0.50 | KO 8% | ORCL 26% | 89% | 15 | 2.83/2.95 | +0.056 | no |
| S06 | oiLejosDelta20 | 467 | 0.799x | 0.953x | -0.153 | 0.37–1.42x | 0.17 | 49.0 | −0.20 +0.50 −0.09 | NVDA 6% | NVDA 37% | 94% | 14 | 2.91/3.00 | -0.157 | no |
| S12 | momento60 | 460 | 0.782x | 0.969x | -0.186 | 0.38–1.26x | 0.80 | 51.0 | +0.27 −0.12 +0.68 | NVDA 6% | INTC 18% | 87% | 16 | 2.90/3.02 | -0.151 | no |
| S05 | oiLejosShare | 468 | 0.762x | 0.951x | -0.189 | 0.37–1.26x | 0.70 | 45.8 | +0.33 +0.55 −0.14 | TSLA 12% | AMD 25% | 93% | 15 | 3.11/2.72 | -0.288 | no |
| S07 | oiEnStrike | 468 | 0.557x | 0.953x | -0.395 | 0.19–0.91x | -0.94 | 21.6 | −0.04 −1.00 −0.06 | SPY 9% | INTC 25% | 97% | 13 | 2.88/2.94 | -0.502 | no |
| S20 | oiTotalRel | 391 | 0.518x | 1.095x | -0.577 | 0.09–1.03x | -0.98 | 11.0 | −0.09 −0.35 −2.68 | INTC 7% | NVDA 46% | 100% | 9 | 2.99/2.88 | -0.702 | no |
| S17 | horquillaRel | 468 | 0.367x | 0.951x | -0.584 | 0.09–0.58x | -1.82 | 5.2 | −0.30 −2.20 +0.50 | UNH 7% | XOM 42% | 100% | 7 | 2.91/2.95 | -0.481 | no |
| S14 | rvExpansion | 387 | 0.457x | 1.063x | -0.606 | 0.06–1.18x | -2.13 | 9.2 | −0.03 −3.14 −0.23 | AAPL 6% | ORCL 45% | 100% | 5 | 2.99/2.87 | -0.538 | no |
| S19 | volumenRel | 444 | 0.241x | 1.001x | -0.760 | 0.07–0.55x | -2.01 | 0.6 | −0.51 −2.29 −3.08 | NVDA 6% | QQQ 43% | 100% | 8 | 2.99/2.90 | -0.854 | no |
| S04 | flujoNetoP | 54 | 0.435x | 2.228x | -1.792 | 0.00–1.18x | -0.42 | 50.8 | +0.00 +1.31 −2.40 | AMD 20% | AMD 71% | 100% | 2 | 3.05/3.05 | -2.046 | no |
| S01 | flujoNetoC | 54 | 0.309x | 2.228x | -1.919 | 0.00–0.93x | -0.96 | 40.8 | +0.00 +0.93 −22.11 | MSFT 20% | AMD 100% | 100% | 1 | 3.06/2.94 | -2.187 | no |
| S03 | flujoRatioCP | 54 | 0.000x | 2.228x | -2.228 | 0.00–0.00x | -1.31 | 0.0 | +0.00 −1.31 +0.00 | NVDA 33% | NVDA 0% | 0% | 0 | 3.04/3.03 | -2.502 | no |
| S02 | flujoNetoCLejos | 50 | 0.000x | 2.462x | -2.462 | 0.00–0.00x | -1.02 | 0.0 | +0.00 −0.43 −22.11 | MSFT 20% | MSFT 0% | 0% | 0 | 2.91/3.02 | -2.766 | no |

Listón del azar: percentil ≥ 99,75. Mediana del control ≈ media del pool por construcción.
Traducción a dólares (presupuesto de $3000/año de prima repartido entre los sucesos elegidos):
  momento250: 65 compras/año · 4766 $/año  (pool: 285 $/año)
  ivContrato: 78 compras/año · 2807 $/año  (pool: -146 $/año)
  distanciaSigma: 78 compras/año · 2161 $/año  (pool: -146 $/año)
  ivMenosRV: 78 compras/año · 1614 $/año  (pool: -136 $/año)
  precioContrato: 78 compras/año · 981 $/año  (pool: -146 $/año)
  Comprar TODO el pool: media 0.948x → -156 $/año sobre $3000 de prima