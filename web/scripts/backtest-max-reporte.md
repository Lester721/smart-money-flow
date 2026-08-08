# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 48 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 81% · media -7.9% · mediana 11.7% (n=47) | win 83% · media -6.2% · mediana 4% (n=47) |
| 5d | win 75% · media -8.5% · mediana 11.5% (n=44) | win 89% · media -4.7% · mediana 3.9% (n=44) |
| 7d | win 83% · media -2.4% · mediana 11.4% (n=41) | win 93% · media -3.3% · mediana 3.8% (n=41) |
| 30d | win 94% · media 5.6% · mediana 10.6% (n=35) | win 94% · media -1.6% · mediana 3.3% (n=35) |
| 60d | win 96% · media 7.8% · mediana 10% (n=27) | win 96% · media 0.5% · mediana 2.9% (n=27) |
| 90d | win 95% · media 7.3% · mediana 9.5% (n=19) | win 100% · media 4.2% · mediana 2.6% (n=19) |
| 180d | win 83% · media 4% · mediana 14.1% (n=12) | win 100% · media 4.8% · mediana 7.1% (n=12) |
| 365d | — | — |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 34% · media -23.6% · mediana -100% (n=47) | win 30% · media -26.1% · mediana -100% (n=47) |
| 5d | win 34% · media -14.6% · mediana -100% (n=44) | win 34% · media -12.1% · mediana -100% (n=44) |
| 7d | win 34% · media -10.3% · mediana -100% (n=41) | win 32% · media -5.9% · mediana -100% (n=41) |
| 30d | win 31% · media -6.4% · mediana -100% (n=35) | win 31% · media -2.9% · mediana -100% (n=35) |
| 60d | win 33% · media -12.5% · mediana -67.8% (n=27) | win 30% · media -10.9% · mediana -71.7% (n=27) |
| 90d | win 42% · media 7.7% · mediana -58.2% (n=19) | win 42% · media -8% · mediana -63.4% (n=19) |
| 180d | win 58% · media 9.9% · mediana 37.7% (n=12) | win 58% · media -5.1% · mediana 24.5% (n=12) |
| 365d | — | — |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 81% · media -2.3% · mediana 1.5% (n=47) | win 85% · media -1.5% · mediana 0.6% (n=47) |
| 5d | win 77% · media -1.6% · mediana 2% (n=44) | win 89% · media -0.7% · mediana 1% (n=44) |
| 7d | win 83% · media 0.1% · mediana 2.8% (n=41) | win 93% · media 0.1% · mediana 1.3% (n=41) |
| 30d | win 94% · media 1.6% · mediana 8.2% (n=35) | win 94% · media -2% · mediana 2.2% (n=35) |
| 60d | win 96% · media 7.3% · mediana 10.3% (n=27) | win 96% · media 2.2% · mediana 2.3% (n=27) |
| 90d | win 95% · media 12.4% · mediana 11.3% (n=19) | win 100% · media 6% · mediana 2.2% (n=19) |
| 180d | win 92% · media 19.7% · mediana 25.3% (n=12) | win 100% · media 11.7% · mediana 13.7% (n=12) |
| 365d | — | — |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 75% · media -8.5% · mediana 11.5% (n=44)
- **Top⅓ EVA:** win 93% · media 4.1% · mediana 12.6% (n=14) · Bottom⅓ EVA: win 71% · media -10.2% · mediana 11.5% (n=14) · Top⅓ Victor: win 93% · media 4.2% · mediana 12.6% (n=14)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 100% · media 12.3% · mediana 12.6% (n=7) · mitad NUEVA: win 86% · media -4.1% · mediana 11.5% (n=7)

### Naked 90d @ 1σ
- TODAS: win 95% · media 12.4% · mediana 11.3% (n=19)
- **Top⅓ EVA:** win 100% · media 17.4% · mediana 20.3% (n=6) · Bottom⅓ EVA: win 100% · media 16% · mediana 19.8% (n=6) · Top⅓ Victor: win 100% · media 17.4% · mediana 20.3% (n=6)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 100% · media 16.7% · mediana 11.8% (n=3) · mitad NUEVA: win 100% · media 18.1% · mediana 20.3% (n=3)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | -2.8% → -3.8% / -2% ✗ (n=15) | -9.6% → -10.4% / -8.8% ✗ (n=15) |
| 5d | 4.1% → 12.3% / -4.1% ✗ (n=14) | -0.7% → 4.6% / -6% ✗ (n=14) |
| 7d | 12% → 11.9% / 12% ✅ (n=13) | 4.4% → 4.5% / 4.2% ✅ (n=13) |
| 30d | 11.6% → 11.9% / 11.4% ✅ (n=11) | 4.1% → 4.5% / 3.8% ✅ (n=11) |
| 60d | 12.4% → 11.7% / 12.9% ✅ (n=9) | 4.9% → 4.2% / 5.4% ✅ (n=9) |
| 90d | 11.6% → 10.7% / 12.5% ✅ (n=6) | 4.2% → 3.4% / 5.1% ✅ (n=6) |
| 180d | 10.9% → 10.9% / 10.9% ✅ (n=4) | 4.1% → 4.1% / 4% ✅ (n=4) |
| 365d | — | — |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 10/14.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 4.1% | 3.5% | 2.9% | 2.2% |
| 90d @1σ | 11.6% | 10.9% | 10.3% | 9.7% |
| 180d @1σ | 10.9% | 10.3% | 9.7% | 9.1% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 11% · **Normal** 11–14% · **Volátil** > 14%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 60% · media -20% · mediana 11.5% (n=15) | win 75% · media -15.8% · mediana 12.6% (n=4) |
| Normal | win 80% · media -7.2% · mediana 11.5% (n=15) | win 100% · media 11.9% · mediana 11.5% (n=3) |
| Volátil | win 86% · media 2.5% · mediana 12.6% (n=14) | win 100% · media 12.2% · mediana 12.6% (n=7) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–13% · **Volátil** > 13%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 86% · media 0.3% · mediana 9.4% (n=7) | win 100% · media 9.2% · mediana 9.2% (n=1) |
| Normal | win 100% · media 10.9% · mediana 9.5% (n=6) | win 100% · media 13.8% · mediana 13.8% (n=1) |
| Volátil | win 100% · media 11.7% · mediana 13.9% (n=6) | win 100% · media 11.6% · mediana 13.9% (n=4) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
