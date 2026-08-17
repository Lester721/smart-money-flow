LADO=call  OTM=1.3  DTE objetivo 90 [60,120]  listón |t| ≥ 3.23 (40 pruebas)
SUCESOS: 1570  ·  (ticker,vencimiento) únicos: 1570
rechazos: {"sinCadena":0,"sinVenc":46,"sinStrike":59,"sinCierreVenc":3,"huecoCierres":7,"dupVenc":99,"sinIV":0,"sinOI":0}
tickers: 28, mayor AAPL 64 (4.1%)
meses de entrada: 64  ·  con split entre entrada y vencimiento: 11
múltiplo: media 0.944x  mediana 0.000x  ceros 1480 (94.3%)  máx 80.3x
múltiplo a MID: media 1.072x
moneyness real: mediana 1.297  ·  ask mediano $0.34  ·  horquilla mediana 29%
por año de entrada: 2021 n=292 0.50x · 2022 n=285 0.35x · 2023 n=279 1.91x · 2024 n=307 0.21x · 2025 n=306 1.02x · 2026 n=101 3.23x
cobertura de cada selector: S01:215 S02:204 S03:215 S04:215 S05:1570 S06:1543 S07:1565 S08:1564 S09:1539 S10:1564 S11:1570 S12:1519 S13:1300 S14:1288 S15:1570 S16:1570 S17:1570 S18:1545 S19:1471 S20:1300

### RESULTADO — los 20 selectores, tercio alto por rango DENTRO del mes
| # | selector | n alto | media alto | media pool | ventaja | IC95 de la media | t | pct azar | 3 tercios | mayor (sucesos) | mayor (PAGO) | top10 | gana | σ alto/bajo | ventaja a MID | PASA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S11 | ivContrato | 503 | 2.137x | 0.944x | +1.193 | 1.58–2.72x | 4.41 | 100.0 | +0.85 +2.24 +2.25 | TSLA 13% | NVDA 27% | 43% | 76 | 1.68/3.14 | +1.187 | no (dinero concentrado) |
| S16 | precioContrato | 503 | 1.908x | 0.944x | +0.963 | 1.20–2.62x | 5.38 | 100.0 | +0.33 +3.03 +1.99 | TSLA 13% | NVDA 30% | 44% | 68 | 1.88/3.05 | +0.949 | no (dinero concentrado) |
| S13 | momento250 | 416 | 1.775x | 1.027x | +0.747 | 1.16–2.97x | 2.07 | 99.6 | −0.11 +1.66 +1.36 | NVDA 10% | NVDA 28% | 71% | 32 | 2.27/2.14 | +0.830 | no |
| S05 | oiLejosShare | 503 | 1.443x | 0.944x | +0.499 | 0.80–2.00x | 3.52 | 99.2 | +0.70 +1.69 +1.07 | TSLA 12% | NVDA 16% | 50% | 51 | 1.99/3.01 | +0.449 | no |
| S09 | ivMenosRV | 492 | 1.358x | 0.956x | +0.402 | 0.98–1.84x | 0.26 | 95.2 | +0.23 +1.30 −1.19 | DIS 8% | NVDA 28% | 65% | 35 | 2.90/1.80 | +0.360 | no |
| S14 | rvExpansion | 410 | 1.242x | 0.977x | +0.265 | 0.49–1.81x | 0.21 | 85.4 | +0.81 −1.61 +1.10 | INTC 6% | CSCO 25% | 80% | 27 | 1.78/2.96 | +0.446 | no |
| S06 | oiLejosDelta20 | 494 | 1.165x | 0.960x | +0.205 | 0.72–1.69x | 0.04 | 82.0 | −0.38 +0.63 −0.19 | NVDA 6% | NVDA 25% | 76% | 33 | 2.41/2.25 | +0.314 | no |
| S07 | oiEnStrike | 501 | 1.152x | 0.947x | +0.205 | 0.70–1.55x | 0.72 | 84.6 | +0.06 +0.21 +0.59 | CRM 8% | NVDA 22% | 70% | 32 | 2.28/2.73 | +0.227 | no |
| S12 | momento60 | 486 | 1.062x | 0.976x | +0.087 | 0.54–1.66x | 0.34 | 63.0 | +0.32 −0.41 +0.45 | NVDA 7% | NVDA 20% | 71% | 37 | 2.36/2.24 | +0.172 | no |
| S01 | flujoNetoC | 56 | 1.142x | 1.058x | +0.083 | 0.18–2.29x | -0.28 | 58.6 | +0.80 +1.06 −2.60 | MSFT 20% | TSLA 53% | 100% | 7 | 2.36/2.35 | +0.074 | no |
| S04 | flujoNetoP | 56 | 1.133x | 1.058x | +0.074 | 0.05–2.91x | 0.23 | 57.6 | −0.29 −0.76 +1.51 | AMD 21% | AMD 95% | 100% | 5 | 2.35/2.20 | +0.068 | no |
| S15 | gexNorm | 503 | 0.988x | 0.944x | +0.044 | 0.62–1.88x | 0.49 | 52.8 | +0.05 −0.25 +0.70 | XOM 8% | ORCL 27% | 81% | 27 | 2.54/2.47 | +0.144 | no |
| S10 | estructura | 500 | 0.830x | 0.948x | -0.118 | 0.57–1.35x | -1.81 | 29.4 | −0.42 −0.88 −0.94 | CRM 7% | NVDA 17% | 78% | 32 | 2.43/2.32 | -0.126 | no |
| S20 | oiTotalRel | 416 | 0.721x | 1.027x | -0.307 | 0.49–1.22x | -1.06 | 12.2 | −0.11 −0.70 −0.47 | INTC 8% | NVDA 31% | 86% | 24 | 2.11/2.57 | -0.385 | no |
| S19 | volumenRel | 471 | 0.667x | 0.998x | -0.331 | 0.30–0.96x | -2.26 | 5.6 | −0.14 −1.64 −0.96 | INTC 7% | CSCO 41% | 79% | 29 | 2.04/2.76 | -0.310 | no |
| S08 | skew | 500 | 0.490x | 0.948x | -0.458 | 0.21–0.81x | -2.91 | 0.8 | −0.42 −2.35 −0.54 | PFE 10% | INTC 49% | 97% | 15 | 2.83/2.26 | -0.473 | no |
| S03 | flujoRatioCP | 56 | 0.563x | 1.058x | -0.495 | 0.06–1.21x | -1.33 | 20.8 | −0.64 −0.89 −2.04 | NVDA 32% | NVDA 100% | 100% | 5 | 2.39/2.22 | -0.497 | no |
| S17 | horquillaRel | 503 | 0.435x | 0.944x | -0.509 | 0.13–0.92x | -3.81 | 0.2 | −1.08 −2.56 −0.75 | UNH 8% | CSCO 58% | 100% | 9 | 3.04/1.81 | -0.408 | no |
| S18 | distanciaSigma | 495 | 0.232x | 0.953x | -0.721 | 0.00–0.50x | -4.46 | 0.0 | −0.62 −0.81 −2.74 | SPY 10% | PFE 35% | 100% | 5 | 3.58/1.45 | -0.827 | no |
| S02 | flujoNetoCLejos | 54 | 0.153x | 1.138x | -0.985 | 0.00–0.32x | -1.67 | 1.8 | −0.80 −1.96 −2.90 | QQQ 20% | AMD 44% | 100% | 4 | 2.63/2.36 | -1.017 | no |

Listón del azar: percentil ≥ 99,75. Mediana del control ≈ media del pool por construcción.
Traducción a dólares (presupuesto de $3000/año de prima repartido entre los sucesos elegidos):
  ivContrato: 84 compras/año · 3411 $/año  (pool: -167 $/año)
  precioContrato: 84 compras/año · 2723 $/año  (pool: -167 $/año)
  momento250: 69 compras/año · 2324 $/año  (pool: 82 $/año)
  oiLejosShare: 84 compras/año · 1330 $/año  (pool: -167 $/año)
  ivMenosRV: 82 compras/año · 1075 $/año  (pool: -131 $/año)
  Comprar TODO el pool: media 0.944x → -167 $/año sobre $3000 de prima