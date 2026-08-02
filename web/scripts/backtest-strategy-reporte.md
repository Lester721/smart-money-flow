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

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 90% · media 2.1% · mediana 11.5% (n=212)
- **Top⅓ EVA:** win 93% · media 5.6% · mediana 11.5% (n=70) · Bottom⅓ EVA: win 90% · media 1.5% · mediana 11.5% (n=70) · Top⅓ Victor: win 93% · media 6.7% · mediana 11.5% (n=70)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 94% · media 5.7% · mediana 11.5% (n=35) · mitad NUEVA: win 91% · media 5.4% · mediana 11.5% (n=35)

### Naked 90d @ 1σ
- TODAS: win 87% · media 0.6% · mediana 9.9% (n=113)
- **Top⅓ EVA:** win 97% · media 13.2% · mediana 11.8% (n=37) · Bottom⅓ EVA: win 78% · media -5% · mediana 7.8% (n=37) · Top⅓ Victor: win 97% · media 11.7% · mediana 11.1% (n=37)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 100% · media 15.6% · mediana 11.8% (n=18) · mitad NUEVA: win 95% · media 11% · mediana 17.2% (n=19)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 3.5% → 3.9% / 3% ✅ (n=72) | 2.7% → 1.5% / 4% ✅ (n=72) |
| 5d | 5.6% → 5.7% / 5.4% ✅ (n=70) | 1.5% → 1.2% / 1.7% ✅ (n=70) |
| 7d | 4.4% → 5% / 3.8% ✅ (n=70) | 2.4% → 1.4% / 3.4% ✅ (n=70) |
| 30d | 4.1% → 1.2% / 7% ✅ (n=59) | 2.6% → 0.3% / 4.7% ✅ (n=59) |
| 60d | 6.9% → 6.9% / 6.8% ✅ (n=47) | 1.4% → 2.4% / 0.6% ✅ (n=47) |
| 90d | 8.7% → 11.4% / 6.1% ✅ (n=37) | 4.2% → 4% / 4.4% ✅ (n=37) |
| 180d | 10.8% → 10.7% / 11% ✅ (n=18) | 3.9% → 3.8% / 4% ✅ (n=18) |
| 365d | — | — |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 14/14.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 5.5% | 4.9% | 4.3% | 3.7% |
| 90d @1σ | 8.7% | 8% | 7.4% | 6.8% |
| 180d @1σ | 10.8% | 10.2% | 9.6% | 9.1% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
