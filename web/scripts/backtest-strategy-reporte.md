# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 234 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 90% · media 1.9% · mediana 11.7% (n=222) | win 93% · media -1.3% · mediana 4% (n=222) |
| 5d | win 90% · media 2.3% · mediana 11.5% (n=217) | win 94% · media -0.7% · mediana 3.9% (n=217) |
| 7d | win 86% · media -0.6% · mediana 11.4% (n=217) | win 93% · media -1.7% · mediana 3.8% (n=217) |
| 30d | win 81% · media -5.4% · mediana 10.6% (n=184) | win 88% · media -5.1% · mediana 3.3% (n=184) |
| 60d | win 88% · media 1.6% · mediana 10% (n=147) | win 93% · media -1.5% · mediana 2.9% (n=147) |
| 90d | win 86% · media -1.9% · mediana 9.5% (n=118) | win 91% · media -3.3% · mediana 2.6% (n=118) |
| 180d | win 78% · media -9.7% · mediana 8.3% (n=59) | win 86% · media -8.3% · mediana 2% (n=59) |
| 365d | — | — |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 35% · media -5.7% · mediana -76% (n=222) | win 33% · media -4.9% · mediana -79.6% (n=222) |
| 5d | win 37% · media -11.2% · mediana -85.8% (n=217) | win 34% · media -10.7% · mediana -87.9% (n=217) |
| 7d | win 35% · media -7.3% · mediana -100% (n=217) | win 33% · media -4.6% · mediana -100% (n=217) |
| 30d | win 29% · media -17.1% · mediana -100% (n=184) | win 27% · media -13.2% · mediana -100% (n=184) |
| 60d | win 36% · media -2% · mediana -80.8% (n=147) | win 35% · media -3.4% · mediana -83.9% (n=147) |
| 90d | win 28% · media -19.2% · mediana -95.7% (n=118) | win 25% · media -17.6% · mediana -96.4% (n=118) |
| 180d | win 41% · media -4.5% · mediana -100% (n=59) | win 41% · media -6.8% · mediana -100% (n=59) |
| 365d | — | — |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 90% · media -0.1% · mediana 1.4% (n=222) | win 93% · media -0.3% · mediana 0.5% (n=222) |
| 5d | win 90% · media -0.1% · mediana 1.8% (n=217) | win 94% · media -0.4% · mediana 0.7% (n=217) |
| 7d | win 87% · media -0.4% · mediana 2.1% (n=217) | win 93% · media -0.4% · mediana 0.9% (n=217) |
| 30d | win 82% · media -0.9% · mediana 6.1% (n=184) | win 88% · media -1.5% · mediana 1.9% (n=184) |
| 60d | win 89% · media 1.4% · mediana 8.7% (n=147) | win 93% · media -1.1% · mediana 2.2% (n=147) |
| 90d | win 87% · media 1.1% · mediana 10.1% (n=118) | win 91% · media -0.6% · mediana 2.2% (n=118) |
| 180d | win 78% · media -1.8% · mediana 12.2% (n=59) | win 86% · media -1.7% · mediana 1.9% (n=59) |
| 365d | — | — |

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
