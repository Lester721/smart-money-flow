# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 123 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -0.9% · mediana 11.7% (n=117) | win 91% · media -1.4% · mediana 4% (n=117) |
| 5d | win 88% · media 0.8% · mediana 11.5% (n=112) | win 94% · media -1.8% · mediana 3.9% (n=112) |
| 7d | win 85% · media -1.7% · mediana 11.4% (n=104) | win 92% · media -2.9% · mediana 3.8% (n=104) |
| 30d | win 88% · media 1% · mediana 10.6% (n=76) | win 92% · media -2.6% · mediana 3.3% (n=76) |
| 60d | win 97% · media 9.2% · mediana 10% (n=59) | win 98% · media 3.7% · mediana 2.9% (n=59) |
| 90d | win 98% · media 9.1% · mediana 13.8% (n=42) | win 98% · media 2.7% · mediana 6.3% (n=42) |
| 180d | win 96% · media 7.7% · mediana 8.4% (n=26) | win 100% · media 4% · mediana 2.1% (n=26) |
| 365d | — | — |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 32% · media -14.5% · mediana -100% (n=117) | win 31% · media -11.6% · mediana -100% (n=117) |
| 5d | win 34% · media -13.8% · mediana -100% (n=112) | win 30% · media -15.5% · mediana -100% (n=112) |
| 7d | win 36% · media -8% · mediana -100% (n=104) | win 33% · media -10.8% · mediana -100% (n=104) |
| 30d | win 26% · media -28.1% · mediana -100% (n=76) | win 26% · media -26.9% · mediana -100% (n=76) |
| 60d | win 24% · media -41.7% · mediana -100% (n=59) | win 24% · media -45% · mediana -100% (n=59) |
| 90d | win 33% · media -20.9% · mediana -100% (n=42) | win 29% · media -26.6% · mediana -100% (n=42) |
| 180d | win 38% · media -16% · mediana -75.6% (n=26) | win 35% · media -17.5% · mediana -79.9% (n=26) |
| 365d | — | — |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -0.1% · mediana 1.6% (n=117) | win 91% · media -0.3% · mediana 0.6% (n=117) |
| 5d | win 88% · media 0.2% · mediana 2.1% (n=112) | win 94% · media -0.4% · mediana 0.9% (n=112) |
| 7d | win 86% · media -0.2% · mediana 2.5% (n=104) | win 92% · media -0.7% · mediana 1.1% (n=104) |
| 30d | win 88% · media 2.6% · mediana 7% (n=76) | win 92% · media 0.3% · mediana 2.1% (n=76) |
| 60d | win 97% · media 9.5% · mediana 10.3% (n=59) | win 98% · media 3.9% · mediana 2.3% (n=59) |
| 90d | win 98% · media 12.6% · mediana 12.6% (n=42) | win 98% · media 4.9% · mediana 4.7% (n=42) |
| 180d | win 96% · media 18.4% · mediana 12.9% (n=26) | win 100% · media 8.5% · mediana 1.9% (n=26) |
| 365d | — | — |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 88% · media 0.8% · mediana 11.5% (n=112)
- **Top⅓ EVA:** win 95% · media 7.5% · mediana 11.5% (n=37) · Bottom⅓ EVA: win 84% · media -4.4% · mediana 11.5% (n=37) · Top⅓ Victor: win 89% · media 1.4% · mediana 11.5% (n=37)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 94% · media 7.8% · mediana 11.5% (n=18) · mitad NUEVA: win 95% · media 7.2% · mediana 12.6% (n=19)

### Naked 90d @ 1σ
- TODAS: win 98% · media 12.6% · mediana 12.6% (n=42)
- **Top⅓ EVA:** win 100% · media 15.8% · mediana 12.6% (n=14) · Bottom⅓ EVA: win 93% · media 7.1% · mediana 13.6% (n=14) · Top⅓ Victor: win 100% · media 13.8% · mediana 11.7% (n=14)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 100% · media 18.7% · mediana 13.7% (n=7) · mitad NUEVA: win 100% · media 12.8% · mediana 12.1% (n=7)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 3% → 6.1% / 0% ✗ (n=39) | 1.9% → 0.1% / 3.7% ✅ (n=39) |
| 5d | 7.5% → 7.8% / 7.2% ✅ (n=37) | 4.3% → 4.2% / 4.4% ✅ (n=37) |
| 7d | 3.9% → -0.6% / 8.4% ✗ (n=34) | 1.2% → -2% / 4.4% ✗ (n=34) |
| 30d | 7.2% → 11.4% / 3.3% ✅ (n=25) | 2.9% → 3.8% / 2.1% ✅ (n=25) |
| 60d | 5.6% → 11% / 0.8% ✅ (n=19) | 2.4% → 3.5% / 1.4% ✅ (n=19) |
| 90d | 10.8% → 11% / 10.6% ✅ (n=14) | 3.5% → 3.7% / 3.3% ✅ (n=14) |
| 180d | 9.1% → 8.6% / 9.5% ✅ (n=8) | 2.6% → 2.3% / 2.9% ✅ (n=8) |
| 365d | — | — |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 11/14.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 7.4% | 6.8% | 6.2% | 5.5% |
| 90d @1σ | 10.8% | 10.2% | 9.6% | 9% |
| 180d @1σ | 9.1% | 8.6% | 8.1% | 7.6% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 11% · **Normal** 11–15% · **Volátil** > 15%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 79% · media -7.7% · mediana 11.5% (n=38) | win 92% · media 4.5% · mediana 11.5% (n=13) |
| Normal | win 95% · media 7.1% · mediana 11.5% (n=37) | win 100% · media 12.1% · mediana 12.6% (n=11) |
| Volátil | win 89% · media 3.2% · mediana 11.5% (n=37) | win 92% · media 6.5% · mediana 12.6% (n=13) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–14% · **Volátil** > 14%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 93% · media 4% · mediana 9.5% (n=15) | win 100% · media 9% · mediana 9.1% (n=5) |
| Normal | win 100% · media 11.3% · mediana 13.8% (n=14) | win 100% · media 11% · mediana 9.2% (n=5) |
| Volátil | win 100% · media 12.6% · mediana 14% (n=13) | win 100% · media 12.3% · mediana 13.8% (n=6) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
