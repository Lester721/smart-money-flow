LADO=call  OTM=1.3  DTE objetivo 90 [60,120]  listón |t| ≥ 3.23 (40 pruebas)
SUCESOS: 1582  ·  (ticker,vencimiento) únicos: 1582
rechazos: {"sinCadena":0,"sinVenc":46,"sinStrike":43,"sinCierreVenc":7,"huecoCierres":7,"dupVenc":99,"sinIV":0,"sinOI":0}
tickers: 28, mayor AAPL 63 (4.0%)
meses de entrada: 63  ·  con split entre entrada y vencimiento: 11
múltiplo: media 1.419x  mediana 0.000x  ceros 1417 (89.6%)  máx 159.0x
múltiplo a MID: media 1.545x
moneyness real: mediana 1.202  ·  ask mediano $0.78  ·  horquilla mediana 11%
por año de entrada: 2021 n=269 1.00x · 2022 n=288 0.47x · 2023 n=296 2.26x · 2024 n=314 0.64x · 2025 n=312 0.95x · 2026 n=103 6.57x
cobertura de cada selector: S01:222 S02:211 S03:222 S04:222 S05:1582 S06:1579 S07:1578 S08:1576 S09:1576 S10:1576 S11:1582 S12:1555 S13:1335 S14:1325 S15:1582 S16:1582 S17:1582 S18:1582 S19:1507 S20:1335

### RESULTADO — los 20 selectores, tercio alto por rango DENTRO del mes
| # | selector | n alto | media alto | media pool | ventaja | IC95 de la media | t | pct azar | 3 tercios | mayor (sucesos) | mayor (PAGO) | top10 | gana | σ alto/bajo | ventaja a MID | PASA |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| S04 | flujoNetoP | 56 | 3.528x | 2.510x | +1.018 | 0.18–9.35x | 0.17 | 74.6 | −0.03 +0.29 +1.41 | AMD 21% | AMD 92% | 100% | 6 | 1.70/1.71 | +1.090 | no |
| S13 | momento250 | 427 | 2.280x | 1.499x | +0.781 | 1.24–4.23x | 2.04 | 99.2 | −0.13 +0.97 +3.28 | NVDA 10% | AMD 35% | 77% | 38 | 1.68/1.69 | +0.810 | no |
| S11 | ivContrato | 506 | 2.054x | 1.419x | +0.636 | 1.22–3.72x | 1.12 | 98.6 | −0.06 +0.11 +1.91 | TSLA 12% | AMD 38% | 63% | 52 | 1.76/1.59 | +0.639 | no |
| S18 | distanciaSigma | 506 | 1.811x | 1.419x | +0.392 | 1.01–3.05x | 1.31 | 89.6 | +0.04 −0.11 +2.30 | TSLA 11% | AMD 37% | 71% | 41 | 1.82/1.50 | +0.420 | no |
| S14 | rvExpansion | 425 | 1.798x | 1.486x | +0.312 | 0.65–2.98x | 0.42 | 81.6 | +0.10 −1.65 +2.32 | UNH 5% | AMD 21% | 87% | 24 | 1.71/1.63 | +0.343 | no |
| S09 | ivMenosRV | 504 | 1.534x | 1.424x | +0.110 | 1.02–1.94x | -0.49 | 65.8 | +0.32 +1.18 −2.38 | DIS 8% | NVDA 16% | 39% | 80 | 1.63/1.71 | +0.069 | no |
| S16 | precioContrato | 506 | 1.516x | 1.419x | +0.097 | 0.89–2.55x | -0.21 | 63.2 | −0.11 +1.12 −1.36 | TSLA 11% | AMD 26% | 49% | 70 | 1.67/1.67 | +0.100 | no |
| S12 | momento60 | 497 | 1.347x | 1.437x | -0.090 | 0.82–2.04x | 0.38 | 36.8 | +0.21 +0.09 +0.26 | NVDA 7% | INTC 24% | 60% | 52 | 1.66/1.69 | -0.091 | no |
| S10 | estructura | 504 | 1.271x | 1.424x | -0.153 | 0.72–2.07x | -1.16 | 30.2 | −0.10 −0.33 −1.56 | CRM 7% | INTC 19% | 60% | 54 | 1.67/1.68 | -0.165 | no |
| S06 | oiLejosDelta20 | 506 | 1.259x | 1.421x | -0.162 | 0.69–2.08x | -0.12 | 29.0 | −0.23 +0.54 −0.48 | NVDA 7% | INTC 19% | 64% | 51 | 1.67/1.69 | -0.194 | no |
| S08 | skew | 504 | 1.234x | 1.424x | -0.190 | 0.71–2.99x | -0.70 | 25.6 | +0.09 −2.42 +1.26 | PFE 9% | AMD 29% | 80% | 32 | 1.72/1.63 | -0.196 | no |
| S17 | horquillaRel | 506 | 1.207x | 1.419x | -0.212 | 0.65–2.10x | -0.86 | 21.6 | +0.08 −1.07 −0.45 | KO 8% | INTC 26% | 70% | 39 | 1.68/1.66 | -0.092 | no |
| S15 | gexNorm | 506 | 1.194x | 1.419x | -0.225 | 0.62–2.13x | -1.08 | 20.8 | +0.01 −0.89 −0.84 | KO 8% | INTC 27% | 66% | 49 | 1.65/1.67 | -0.221 | no |
| S05 | oiLejosShare | 506 | 1.166x | 1.419x | -0.253 | 0.84–1.50x | -0.25 | 18.8 | +0.46 −0.46 −0.27 | TSLA 11% | NVDA 15% | 50% | 52 | 1.73/1.60 | -0.254 | no |
| S07 | oiEnStrike | 506 | 1.161x | 1.422x | -0.261 | 0.78–1.75x | -0.47 | 18.8 | −0.35 +0.24 −0.57 | KO 7% | INTC 20% | 57% | 57 | 1.63/1.69 | -0.313 | no |
| S20 | oiTotalRel | 427 | 1.137x | 1.499x | -0.362 | 0.62–1.61x | -0.72 | 13.8 | −0.21 −0.34 −0.62 | INTC 7% | QQQ 30% | 70% | 34 | 1.69/1.64 | -0.317 | no |
| S19 | volumenRel | 482 | 1.105x | 1.481x | -0.376 | 0.56–1.92x | -1.82 | 10.0 | −0.44 −0.72 −2.11 | INTC 6% | QQQ 30% | 65% | 44 | 1.70/1.64 | -0.423 | no |
| S01 | flujoNetoC | 56 | 0.776x | 2.510x | -1.734 | 0.10–1.80x | -0.79 | 20.8 | −0.11 +1.09 −6.15 | MSFT 20% | AMD 55% | 100% | 5 | 1.71/1.69 | -1.849 | no |
| S03 | flujoRatioCP | 56 | 0.738x | 2.510x | -1.773 | 0.11–1.70x | -1.13 | 20.2 | −1.40 −0.05 −7.90 | NVDA 32% | MSFT 55% | 100% | 5 | 1.71/1.70 | -1.862 | no |
| S02 | flujoNetoCLejos | 54 | 0.478x | 2.704x | -2.225 | 0.00–1.32x | -1.08 | 9.8 | −1.70 +1.17 −7.48 | MSFT 20% | MSFT 87% | 100% | 3 | 1.65/1.68 | -2.330 | no |

Listón del azar: percentil ≥ 99,75. Mediana del control ≈ media del pool por construcción.
Traducción a dólares (presupuesto de $3000/año de prima repartido entre los sucesos elegidos):
  flujoNetoP: 9 compras/año · 7584 $/año  (pool: 4531 $/año)
  momento250: 71 compras/año · 3840 $/año  (pool: 1497 $/año)
  ivContrato: 84 compras/año · 3163 $/año  (pool: 1256 $/año)
  distanciaSigma: 84 compras/año · 2432 $/año  (pool: 1256 $/año)
  rvExpansion: 71 compras/año · 2393 $/año  (pool: 1458 $/año)
  Comprar TODO el pool: media 1.419x → 1256 $/año sobre $3000 de prima