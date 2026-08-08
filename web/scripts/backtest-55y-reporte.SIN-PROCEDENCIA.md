# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 5094 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 84% · media -1.9% · mediana 11.7% (n=5090) | win 91% · media -2.7% · mediana 4% (n=5090) |
| 5d | win 86% · media -0.4% · mediana 11.5% (n=5090) | win 93% · media -1.3% · mediana 3.9% (n=5089) |
| 7d | win 85% · media -1% · mediana 11.4% (n=5087) | win 93% · media -1.2% · mediana 3.8% (n=5085) |
| 30d | win 83% · media -2.9% · mediana 10.6% (n=5039) | win 91% · media -2.9% · mediana 3.3% (n=5039) |
| 60d | win 83% · media -4.2% · mediana 9.9% (n=4997) | win 90% · media -4.1% · mediana 2.9% (n=4997) |
| 90d | win 82% · media -5.3% · mediana 9.3% (n=4942) | win 89% · media -4.5% · mediana 2.6% (n=4918) |
| 180d | win 80% · media -7.1% · mediana 8.1% (n=4569) | win 88% · media -5.6% · mediana 2.1% (n=4411) |
| 365d | win 76% · media -12% · mediana 6.4% (n=3962) | win 83% · media -9.5% · mediana 1.4% (n=3641) |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 38% · media 1.3% · mediana -98.8% (n=5094) | win 36% · media 3.8% · mediana -98.9% (n=5092) |
| 5d | win 38% · media 1.4% · mediana -91.5% (n=5093) | win 36% · media 1.7% · mediana -92.7% (n=5092) |
| 7d | win 38% · media 2.3% · mediana -94.7% (n=5090) | win 36% · media 3.4% · mediana -95.5% (n=5090) |
| 30d | win 40% · media 8.7% · mediana -92% (n=5039) | win 39% · media 11.5% · mediana -93.1% (n=5039) |
| 60d | win 39% · media 7.5% · mediana -94.8% (n=4997) | win 37% · media 11.6% · mediana -95.6% (n=4996) |
| 90d | win 39% · media 8.7% · mediana -100% (n=4941) | win 38% · media 12.8% · mediana -100% (n=4941) |
| 180d | win 42% · media 17.5% · mediana -99.4% (n=4604) | win 41% · media 23.9% · mediana -95.7% (n=4561) |
| 365d | win 43% · media 7092.4% · mediana -90.6% (n=4156) | win 43% · media 5796.6% · mediana -80.4% (n=3971) |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -0.9% · mediana 1.1% (n=5094) | win 91% · media -1% · mediana 0.5% (n=5090) |
| 5d | win 86% · media -0.7% · mediana 1.5% (n=5092) | win 93% · media -1.1% · mediana 0.7% (n=5090) |
| 7d | win 86% · media -0.6% · mediana 1.9% (n=5088) | win 93% · media -1.1% · mediana 0.8% (n=5087) |
| 30d | win 84% · media -4.9% · mediana 4.9% (n=5039) | win 91% · media -4.7% · mediana 2% (n=5039) |
| 60d | win 83% · media -9.8% · mediana 7.8% (n=4997) | win 90% · media -8.5% · mediana 2.2% (n=4997) |
| 90d | win 83% · media -12.9% · mediana 9.2% (n=4942) | win 90% · media -9.6% · mediana 2.1% (n=4942) |
| 180d | win 81% · media -22.2% · mediana 10.9% (n=4605) | win 89% · media -14.9% · mediana 1.8% (n=4567) |
| 365d | win 78% · media -45.8% · mediana 9.8% (n=4166) | win 85% · media -31.1% · mediana 1.4% (n=3960) |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 86% · media -0.4% · mediana 11.5% (n=5090)
- **Top⅓ EVA:** win 88% · media 1.9% · mediana 11.5% (n=1696) · Bottom⅓ EVA: win 83% · media -3.4% · mediana 11.5% (n=1696) · Top⅓ Victor: win 87% · media 1% · mediana 11.5% (n=1696)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 87% · media 1.4% · mediana 11.5% (n=848) · mitad NUEVA: win 88% · media 2.4% · mediana 11.5% (n=848)

### Naked 90d @ 1σ
- TODAS: win 83% · media -12.9% · mediana 9.2% (n=4942)
- **Top⅓ EVA:** win 84% · media -9% · mediana 11.1% (n=1647) · Bottom⅓ EVA: win 80% · media -18.3% · mediana 7.5% (n=1647) · Top⅓ Victor: win 85% · media -6.7% · mediana 10.7% (n=1647)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 87% · media 5.8% · mediana 10.5% (n=823) · mitad NUEVA: win 81% · media -23.7% · mediana 11.8% (n=824)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 0.7% → -0.3% / 1.7% ✗ (n=1696) | -0.5% → -1% / -0.1% ✗ (n=1696) |
| 5d | 1.9% → 1.4% / 2.4% ✅ (n=1696) | 0.4% → 0.5% / 0.3% ✅ (n=1696) |
| 7d | 1.3% → 0.7% / 2% ✅ (n=1695) | 0.8% → 1% / 0.7% ✅ (n=1695) |
| 30d | -0.2% → 0.2% / -0.7% ✗ (n=1679) | -0.6% → 0.3% / -1.4% ✗ (n=1679) |
| 60d | -1.8% → 1% / -4.5% ✗ (n=1665) | -1.8% → 0.2% / -3.8% ✗ (n=1665) |
| 90d | -3.8% → -0.9% / -6.7% ✗ (n=1647) | -2.5% → 0% / -5% ✗ (n=1639) |
| 180d | -3.9% → -1% / -6.8% ✗ (n=1523) | -2.3% → 0.7% / -5.2% ✗ (n=1470) |
| 365d | -4% → -2.8% / -5.1% ✗ (n=1320) | -2.4% → -0.9% / -3.9% ✗ (n=1213) |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 4/16.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 1.9% | 1.3% | 0.7% | 0.1% |
| 90d @1σ | -3.8% | -4.3% | -4.9% | -5.4% |
| 180d @1σ | -3.9% | -4.4% | -4.9% | -5.4% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 84% · media -2.1% · mediana 11.5% (n=1701) | win 85% · media -0.8% · mediana 11.5% (n=388) |
| Normal | win 87% · media 0.7% · mediana 11.5% (n=1694) | win 89% · media 3.6% · mediana 11.5% (n=581) |
| Volátil | win 86% · media 0.1% · mediana 11.5% (n=1695) | win 88% · media 1.9% · mediana 11.5% (n=727) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 80% · media -7.9% · mediana 9.3% (n=1651) | win 78% · media -9.5% · mediana 9.2% (n=370) |
| Normal | win 82% · media -5.6% · mediana 9.3% (n=1646) | win 82% · media -4.9% · mediana 9.3% (n=560) |
| Volátil | win 84% · media -2.3% · mediana 9.4% (n=1645) | win 87% · media 0% · mediana 9.5% (n=717) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
