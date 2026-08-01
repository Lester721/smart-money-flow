# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 229 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 90% · media 1.6% · mediana 11.7% (n=217) | win 93% · media -1.4% · mediana 4% (n=217) |
| 5d | win 90% · media 2.1% · mediana 11.5% (n=212) | win 94% · media -0.8% · mediana 3.9% (n=212) |
| 7d | win 86% · media -0.9% · mediana 11.4% (n=212) | win 92% · media -1.8% · mediana 3.8% (n=212) |
| 30d | win 81% · media -5.2% · mediana 10.6% (n=179) | win 88% · media -4.9% · mediana 3.3% (n=179) |
| 60d | win 88% · media 1.3% · mediana 10% (n=142) | win 92% · media -1.7% · mediana 2.9% (n=142) |
| 90d | win 86% · media -2.4% · mediana 9.5% (n=113) | win 90% · media -3.6% · mediana 2.6% (n=113) |
| 180d | win 78% · media -9.9% · mediana 8.4% (n=54) | win 85% · media -9.3% · mediana 2.1% (n=54) |
| 365d | — | — |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 35% · media -5.8% · mediana -78.5% (n=217) | win 33% · media -5.1% · mediana -81.5% (n=217) |
| 5d | win 37% · media -10.6% · mediana -83.4% (n=212) | win 33% · media -9.9% · mediana -85.9% (n=212) |
| 7d | win 35% · media -7.3% · mediana -100% (n=212) | win 33% · media -4.2% · mediana -100% (n=212) |
| 30d | win 29% · media -17% · mediana -100% (n=179) | win 27% · media -12.7% · mediana -100% (n=179) |
| 60d | win 37% · media 0.5% · mediana -79% (n=142) | win 37% · media -0.8% · mediana -81.6% (n=142) |
| 90d | win 27% · media -18.9% · mediana -100% (n=113) | win 25% · media -16.8% · mediana -100% (n=113) |
| 180d | win 43% · media 1.2% · mediana -87.1% (n=54) | win 43% · media -1% · mediana -88.3% (n=54) |
| 365d | — | — |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 90% · media -0.2% · mediana 1.3% (n=217) | win 93% · media -0.3% · mediana 0.5% (n=217) |
| 5d | win 90% · media -0.2% · mediana 1.8% (n=212) | win 94% · media -0.4% · mediana 0.7% (n=212) |
| 7d | win 86% · media -0.5% · mediana 2.1% (n=212) | win 92% · media -0.5% · mediana 0.9% (n=212) |
| 30d | win 82% · media -1% · mediana 6.1% (n=179) | win 88% · media -1.5% · mediana 1.9% (n=179) |
| 60d | win 89% · media 1.1% · mediana 8.7% (n=142) | win 92% · media -1.3% · mediana 2.2% (n=142) |
| 90d | win 87% · media 0.6% · mediana 9.9% (n=113) | win 90% · media -0.8% · mediana 2.4% (n=113) |
| 180d | win 78% · media -2.6% · mediana 12.2% (n=54) | win 85% · media -2.4% · mediana 1.9% (n=54) |
| 365d | — | — |

## ETAPA 4 — filtro de fuerza (¿la alta convicción rinde mejor?)

### Credit spread 5d @ 1σ
- TODAS: win 90% · media 2.1% · mediana 11.5% (n=212)
- **Top⅓ por EVA:** win 93% · media 5.5% · mediana 11.5% (n=70) · Bottom⅓ EVA: win 90% · media 1.5% · mediana 11.5% (n=70)
- Top⅓ por Victor: win 93% · media 6.7% · mediana 11.5% (n=70)

### Naked 90d @ 1σ
- TODAS: win 87% · media 0.6% · mediana 9.9% (n=113)
- **Top⅓ por EVA:** win 97% · media 13.3% · mediana 11.8% (n=37) · Bottom⅓ EVA: win 81% · media -3.7% · mediana 8% (n=37)
- Top⅓ por Victor: win 92% · media 5.8% · mediana 11% (n=37)

Si el Top⅓ por EVA supera a TODAS y al Bottom⅓, el scorecard como FILTRO agrega valor. Si EVA-top > Victor-top, Eva filtra mejor.

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
