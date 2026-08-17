LADO=put  OTM=0.7  DTE objetivo 90 [60,120]  listón |t| ≥ 3.23 (40 pruebas)
SUCESOS: 1590  ·  (ticker,vencimiento) únicos: 1590
rechazos: {"sinCadena":0,"sinVenc":46,"sinStrike":42,"sinCierreVenc":3,"huecoCierres":7,"dupVenc":96,"sinIV":0,"sinOI":0}
tickers: 28, mayor AAPL 64 (4.0%)
meses de entrada: 64  ·  con split entre entrada y vencimiento: 11
múltiplo: media 0.153x  mediana 0.000x  ceros 1557 (97.9%)  máx 30.1x
múltiplo a MID: media 0.185x
moneyness real: mediana 0.701  ·  ask mediano $0.48  ·  horquilla mediana 23%
por año de entrada: 2021 n=290 0.14x · 2022 n=289 0.29x · 2023 n=291 0.02x · 2024 n=308 0.11x · 2025 n=309 0.26x · 2026 n=103 0.02x
cobertura de cada selector: S01:224 S02:213 S03:224 S04:224 S05:1590 S06:1563 S07:1587 S08:1587 S09:1562 S10:1587 S11:1590 S12:1539 S13:1322 S14:1310 S15:1590 S16:1590 S17:1590 S18:1565 S19:1493 S20:1322

### RESULTADO — los 20 selectores, tercio alto por rango DENTRO del mes
| # | selector | n alto | media alto | media pool | ventaja | IC95 de la media | t | pct azar | 3 tercios | mayor (sucesos) | mayor (PAGO) | top10 | gana | σ alto/bajo | ventaja a MID | PASA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S20 | oiTotalRel | 424 | 0.358x | 0.164x | +0.194 | 0.21–0.55x | 2.45 | 100.0 | +0.29 +0.15 +0.42 | INTC 8% | UNH 37% | 87% | 18 | -2.21/-2.75 | +0.257 | no |
| S05 | oiLejosShare | 510 | 0.341x | 0.153x | +0.188 | 0.18–0.48x | 3.90 | 100.0 | +0.52 +0.20 +0.31 | TSLA 12% | PYPL 32% | 73% | 23 | -1.97/-3.35 | +0.207 | no (dinero concentrado) |
| S11 | ivContrato | 510 | 0.333x | 0.153x | +0.179 | 0.22–0.50x | 2.69 | 100.0 | +0.63 +0.20 −0.03 | TSLA 13% | PYPL 33% | 68% | 25 | -1.82/-3.39 | +0.178 | no |
| S18 | distanciaSigma | 501 | 0.325x | 0.156x | +0.169 | 0.13–0.46x | 2.69 | 100.0 | +0.58 +0.19 +0.02 | TSLA 12% | PYPL 34% | 67% | 24 | -1.48/-3.90 | +0.171 | no |
| S16 | precioContrato | 510 | 0.308x | 0.153x | +0.154 | 0.14–0.47x | 2.44 | 100.0 | +0.42 −0.13 +0.43 | TSLA 13% | UNH 36% | 79% | 21 | -2.22/-2.83 | +0.196 | no |
| S09 | ivMenosRV | 499 | 0.252x | 0.156x | +0.096 | 0.12–0.38x | 1.05 | 94.8 | +0.14 +0.20 −0.01 | DIS 8% | UNH 24% | 89% | 16 | -2.99/-1.86 | +0.124 | no |
| S19 | volumenRel | 479 | 0.258x | 0.163x | +0.094 | 0.11–0.43x | 0.57 | 95.2 | +0.32 −0.04 −0.08 | INTC 7% | PYPL 37% | 88% | 17 | -2.17/-2.89 | +0.100 | no |
| S12 | momento60 | 493 | 0.180x | 0.159x | +0.021 | 0.08–0.35x | -0.70 | 67.4 | −0.15 −0.21 +0.12 | NVDA 7% | TSLA 36% | 99% | 11 | -2.46/-2.32 | +0.037 | no |
| S06 | oiLejosDelta20 | 502 | 0.161x | 0.156x | +0.005 | 0.04–0.22x | -1.03 | 59.0 | −0.23 −0.17 +0.06 | NVDA 7% | UNH 37% | 100% | 9 | -2.51/-2.30 | +0.015 | no |
| S17 | horquillaRel | 510 | 0.128x | 0.153x | -0.025 | 0.01–0.34x | -0.68 | 35.2 | −0.30 −0.11 +0.22 | KO 9% | UNH 81% | 100% | 5 | -2.95/-2.44 | +0.007 | no |
| S13 | momento250 | 424 | 0.138x | 0.164x | -0.026 | 0.04–0.23x | -1.33 | 37.8 | −0.17 −0.15 −0.08 | NVDA 10% | TSLA 64% | 98% | 11 | -2.39/-2.22 | -0.051 | no |
| S10 | estructura | 508 | 0.118x | 0.154x | -0.036 | 0.05–0.20x | -0.87 | 28.6 | +0.02 −0.11 −0.09 | CRM 7% | TSLA 39% | 94% | 14 | -2.50/-2.41 | -0.056 | no |
| S07 | oiEnStrike | 509 | 0.097x | 0.154x | -0.057 | 0.05–0.15x | -1.27 | 10.0 | −0.09 −0.08 −0.13 | TSLA 7% | TSLA 40% | 100% | 10 | -2.46/-2.81 | -0.082 | no |
| S15 | gexNorm | 510 | 0.086x | 0.153x | -0.067 | 0.01–0.25x | -1.64 | 9.6 | −0.26 −0.20 −0.03 | XOM 7% | UNH 68% | 100% | 4 | -2.74/-2.65 | -0.062 | no |
| S01 | flujoNetoC | 56 | 0.000x | 0.078x | -0.078 | 0.00–0.00x | -1.00 | 0.0 | +0.00 −0.31 +0.00 | MSFT 20% | MSFT 0% | 0% | 0 | -2.49/-2.75 | -0.080 | no |
| S03 | flujoRatioCP | 56 | 0.000x | 0.078x | -0.078 | 0.00–0.00x | 0.00 | 0.0 | +0.00 +0.00 +0.00 | NVDA 32% | NVDA 0% | 0% | 0 | -2.56/-2.67 | -0.080 | no |
| S04 | flujoNetoP | 56 | 0.000x | 0.078x | -0.078 | 0.00–0.00x | -1.00 | 0.0 | +0.00 −0.66 +0.00 | AMD 21% | QQQ 0% | 0% | 0 | -2.62/-2.48 | -0.080 | no |
| S14 | rvExpansion | 420 | 0.084x | 0.165x | -0.082 | 0.00–0.18x | -1.76 | 8.0 | −0.39 −0.24 +0.03 | INTC 6% | UNH 74% | 100% | 5 | -1.84/-3.20 | -0.088 | no |
| S02 | flujoNetoCLejos | 54 | 0.000x | 0.085x | -0.085 | 0.00–0.00x | -1.00 | 0.0 | +0.00 −0.66 +0.00 | QQQ 22% | MSFT 0% | 0% | 0 | -3.23/-2.63 | -0.086 | no |
| S08 | skew | 508 | 0.002x | 0.154x | -0.152 | 0.00–0.01x | -4.23 | 0.0 | −0.70 −0.12 −0.14 | SPY 12% | CRM 100% | 100% | 1 | -3.41/-1.75 | -0.183 | no |

Listón del azar: percentil ≥ 99,75. Mediana del control ≈ media del pool por construcción.
Traducción a dólares (presupuesto de $3000/año de prima repartido entre los sucesos elegidos):
  oiTotalRel: 71 compras/año · -1925 $/año  (pool: -2508 $/año)
  oiLejosShare: 85 compras/año · -1976 $/año  (pool: -2540 $/año)
  ivContrato: 85 compras/año · -2001 $/año  (pool: -2540 $/año)
  distanciaSigma: 84 compras/año · -2025 $/año  (pool: -2532 $/año)
  precioContrato: 85 compras/año · -2077 $/año  (pool: -2540 $/año)
  Comprar TODO el pool: media 0.153x → -2540 $/año sobre $3000 de prima