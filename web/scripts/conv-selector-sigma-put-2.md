LADO=put  OTM=0.7  DTE objetivo 90 [60,120]  listón |t| ≥ 3.23 (40 pruebas)
SUCESOS: 1570  ·  (ticker,vencimiento) únicos: 1570
rechazos: {"sinCadena":0,"sinVenc":46,"sinStrike":60,"sinCierreVenc":6,"huecoCierres":7,"dupVenc":95,"sinIV":0,"sinOI":0}
tickers: 28, mayor AAPL 63 (4.0%)
meses de entrada: 63  ·  con split entre entrada y vencimiento: 11
múltiplo: media 0.279x  mediana 0.000x  ceros 1502 (95.7%)  máx 25.1x
múltiplo a MID: media 0.309x
moneyness real: mediana 0.783  ·  ask mediano $0.80  ·  horquilla mediana 11%
por año de entrada: 2021 n=269 0.30x · 2022 n=285 0.24x · 2023 n=294 0.20x · 2024 n=312 0.22x · 2025 n=307 0.47x · 2026 n=103 0.17x
cobertura de cada selector: S01:222 S02:211 S03:222 S04:222 S05:1570 S06:1567 S07:1566 S08:1566 S09:1566 S10:1566 S11:1570 S12:1543 S13:1323 S14:1313 S15:1570 S16:1570 S17:1570 S18:1570 S19:1496 S20:1323

### RESULTADO — los 20 selectores, tercio alto por rango DENTRO del mes
| # | selector | n alto | media alto | media pool | ventaja | IC95 de la media | t | pct azar | 3 tercios | mayor (sucesos) | mayor (PAGO) | top10 | gana | σ alto/bajo | ventaja a MID | PASA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S09 | ivMenosRV | 500 | 0.516x | 0.275x | +0.241 | 0.33–0.76x | 3.20 | 100.0 | +0.46 +0.50 +0.24 | DIS 8% | PYPL 18% | 60% | 42 | -1.79/-1.67 | +0.243 | no |
| S20 | oiTotalRel | 422 | 0.503x | 0.282x | +0.221 | 0.30–0.68x | 2.28 | 100.0 | +0.13 +0.45 +0.37 | INTC 7% | UNH 22% | 72% | 25 | -1.71/-1.76 | +0.253 | no |
| S11 | ivContrato | 501 | 0.429x | 0.279x | +0.150 | 0.22–0.56x | 2.05 | 98.6 | +0.49 +0.28 −0.06 | TSLA 13% | PYPL 44% | 61% | 26 | -1.64/-1.83 | +0.168 | no |
| S05 | oiLejosShare | 501 | 0.408x | 0.279x | +0.129 | 0.23–0.57x | 2.30 | 97.6 | +0.42 +0.17 +0.18 | TSLA 12% | PYPL 30% | 67% | 27 | -1.68/-1.81 | +0.159 | no |
| S16 | precioContrato | 501 | 0.403x | 0.279x | +0.124 | 0.23–0.57x | 1.44 | 96.8 | +0.50 −0.21 +0.25 | SPY 12% | UNH 24% | 75% | 25 | -1.77/-1.74 | +0.132 | no |
| S03 | flujoRatioCP | 56 | 0.234x | 0.113x | +0.120 | 0.00–0.70x | 0.96 | 87.0 | +0.00 +0.70 −0.03 | NVDA 32% | META 96% | 100% | 2 | -1.71/-1.73 | +0.123 | no |
| S04 | flujoNetoP | 56 | 0.225x | 0.113x | +0.112 | 0.00–0.68x | 0.07 | 77.6 | +0.00 +0.57 −0.46 | AMD 21% | META 100% | 100% | 1 | -1.72/-1.71 | +0.114 | no |
| S12 | momento60 | 492 | 0.358x | 0.284x | +0.075 | 0.19–0.54x | -0.17 | 87.6 | −0.05 −0.21 +0.19 | NVDA 7% | BA 20% | 74% | 26 | -1.74/-1.72 | +0.071 | no |
| S01 | flujoNetoC | 56 | 0.163x | 0.113x | +0.050 | 0.00–0.48x | -0.29 | 69.2 | +0.00 −0.70 +0.41 | NVDA 21% | MSFT 95% | 100% | 2 | -1.70/-1.74 | +0.051 | no |
| S19 | volumenRel | 478 | 0.329x | 0.293x | +0.037 | 0.16–0.46x | -0.16 | 73.4 | −0.06 +0.04 −0.04 | INTC 6% | PYPL 29% | 80% | 22 | -1.70/-1.78 | +0.053 | no |
| S18 | distanciaSigma | 501 | 0.287x | 0.279x | +0.008 | 0.19–0.41x | 0.57 | 57.0 | +0.03 +0.05 +0.09 | TSLA 11% | PYPL 40% | 74% | 21 | -1.59/-1.90 | +0.017 | no |
| S15 | gexNorm | 501 | 0.275x | 0.279x | -0.003 | 0.13–0.41x | -0.62 | 52.4 | −0.23 −0.06 +0.06 | KO 8% | UNH 18% | 85% | 22 | -1.77/-1.74 | -0.017 | no |
| S06 | oiLejosDelta20 | 501 | 0.266x | 0.279x | -0.013 | 0.14–0.50x | -1.28 | 46.8 | −0.29 −0.18 −0.03 | NVDA 7% | UNH 20% | 84% | 21 | -1.75/-1.72 | -0.033 | no |
| S17 | horquillaRel | 501 | 0.249x | 0.279x | -0.030 | 0.15–0.49x | -1.17 | 34.8 | −0.14 −0.18 −0.12 | INTC 7% | PYPL 34% | 85% | 16 | -1.73/-1.76 | +0.005 | no |
| S07 | oiEnStrike | 500 | 0.215x | 0.280x | -0.064 | 0.12–0.36x | -1.15 | 15.4 | −0.13 −0.11 −0.13 | KO 6% | CRM 18% | 79% | 24 | -1.77/-1.71 | -0.076 | no |
| S10 | estructura | 500 | 0.197x | 0.275x | -0.078 | 0.10–0.36x | -1.49 | 11.6 | −0.12 −0.13 −0.18 | CRM 7% | PYPL 25% | 81% | 21 | -1.74/-1.73 | -0.087 | no |
| S02 | flujoNetoCLejos | 54 | 0.028x | 0.122x | -0.094 | 0.00–0.07x | -1.45 | 34.6 | +0.00 −0.83 −0.40 | QQQ 22% | MSFT 67% | 100% | 2 | -1.77/-1.74 | -0.097 | no |
| S08 | skew | 500 | 0.171x | 0.275x | -0.105 | 0.05–0.31x | -2.58 | 3.6 | −0.38 −0.35 −0.27 | TSLA 10% | PYPL 30% | 100% | 10 | -1.68/-1.78 | -0.096 | no |
| S14 | rvExpansion | 420 | 0.132x | 0.284x | -0.152 | 0.03–0.30x | -2.59 | 1.2 | −0.37 −0.33 −0.29 | INTC 5% | UNH 41% | 100% | 7 | -1.67/-1.79 | -0.143 | no |
| S13 | momento250 | 422 | 0.124x | 0.282x | -0.157 | 0.06–0.23x | -2.86 | 0.6 | −0.37 −0.34 −0.30 | NVDA 10% | TSLA 30% | 95% | 12 | -1.73/-1.71 | -0.177 | no |

Listón del azar: percentil ≥ 99,75. Mediana del control ≈ media del pool por construcción.
Traducción a dólares (presupuesto de $3000/año de prima repartido entre los sucesos elegidos):
  ivMenosRV: 83 compras/año · -1451 $/año  (pool: -2174 $/año)
  oiTotalRel: 70 compras/año · -1492 $/año  (pool: -2155 $/año)
  ivContrato: 84 compras/año · -1713 $/año  (pool: -2163 $/año)
  oiLejosShare: 84 compras/año · -1775 $/año  (pool: -2163 $/año)
  precioContrato: 84 compras/año · -1792 $/año  (pool: -2163 $/año)
  Comprar TODO el pool: media 0.279x → -2163 $/año sobre $3000 de prima