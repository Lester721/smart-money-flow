# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

## Procedencia — QUÉ SE PROBÓ DE VERDAD

| | |
|---|---|
| Período **pedido** | 2021-01-01 → 2026-07-31 |
| Período **real de las señales** | **2021-03-01 → 2026-07-31** |
| Cobertura | **97%** del rango pedido ✅ |
| Proveedor | theta |
| Precio del subyacente | **DERIVADO de opciones (paridad put-call)** |
| Tickers | 7 con datos |
| Señales | 4511 |

| Ticker | Barras | Desde | Hasta | Días c/ flujo | Señales |
|---|---|---|---|---|---|
| SPY | 1431 | 2020-11-23 | 2026-08-06 | 1153 | 736 |
| AAPL | 1431 | 2020-11-23 | 2026-08-06 | 1043 | 654 |
| MSFT | 1431 | 2020-11-23 | 2026-08-06 | 739 | 352 |
| NVDA | 1431 | 2020-11-23 | 2026-08-06 | 909 | 599 |
| TSLA | 1431 | 2020-11-23 | 2026-08-06 | 1185 | 871 |
| AMD | 1431 | 2020-11-23 | 2026-08-06 | 726 | 436 |
| QQQ | 1431 | 2020-11-23 | 2026-08-06 | 1220 | 863 |

**Señales:** 4511 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 84% · media -1.4% · mediana 11.7% (n=4509) | win 92% · media -2.3% · mediana 4% (n=4509) |
| 5d | win 85% · media -0.5% · mediana 11.5% (n=4509) | win 93% · media -1.1% · mediana 3.9% (n=4508) |
| 7d | win 86% · media -0.4% · mediana 11.4% (n=4506) | win 93% · media -0.9% · mediana 3.8% (n=4504) |
| 30d | win 84% · media -2% · mediana 10.6% (n=4468) | win 92% · media -2.3% · mediana 3.3% (n=4468) |
| 60d | win 83% · media -3.2% · mediana 9.9% (n=4429) | win 91% · media -3.2% · mediana 2.9% (n=4429) |
| 90d | win 83% · media -4.4% · mediana 9.3% (n=4380) | win 90% · media -3.6% · mediana 2.6% (n=4360) |
| 180d | win 81% · media -6.4% · mediana 8.1% (n=4056) | win 89% · media -4.1% · mediana 2.1% (n=3919) |
| 365d | win 78% · media -9.6% · mediana 6.5% (n=3553) | win 86% · media -6.7% · mediana 1.4% (n=3252) |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 37% · media -0.1% · mediana -100% (n=4511) | win 35% · media 1.7% · mediana -100% (n=4510) |
| 5d | win 37% · media -1.7% · mediana -99% (n=4511) | win 35% · media -1.2% · mediana -99.2% (n=4510) |
| 7d | win 38% · media -0.5% · mediana -100% (n=4508) | win 36% · media -0.1% · mediana -100% (n=4508) |
| 30d | win 40% · media 6.5% · mediana -97% (n=4467) | win 38% · media 8.1% · mediana -97.4% (n=4467) |
| 60d | win 38% · media 5.3% · mediana -98.4% (n=4428) | win 37% · media 8.4% · mediana -98.6% (n=4428) |
| 90d | win 39% · media 6.8% · mediana -99.8% (n=4379) | win 37% · media 9.3% · mediana -99.9% (n=4379) |
| 180d | win 42% · media 15.3% · mediana -99.6% (n=4091) | win 40% · media 20.6% · mediana -97.4% (n=4062) |
| 365d | win 43% · media 58.7% · mediana -98.4% (n=3750) | win 42% · media 59.1% · mediana -87.2% (n=3587) |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -0.8% · mediana 1.2% (n=4511) | win 92% · media -1% · mediana 0.5% (n=4509) |
| 5d | win 86% · media -0.7% · mediana 1.6% (n=4511) | win 93% · media -1.1% · mediana 0.7% (n=4509) |
| 7d | win 86% · media -0.5% · mediana 2% (n=4507) | win 93% · media -1.1% · mediana 0.9% (n=4506) |
| 30d | win 85% · media -4.5% · mediana 5.4% (n=4468) | win 92% · media -4.6% · mediana 2% (n=4468) |
| 60d | win 84% · media -8.3% · mediana 8.3% (n=4429) | win 91% · media -7.6% · mediana 2.2% (n=4429) |
| 90d | win 83% · media -10.6% · mediana 9.6% (n=4380) | win 91% · media -8.1% · mediana 2.1% (n=4380) |
| 180d | win 82% · media -15.6% · mediana 11.3% (n=4092) | win 89% · media -9.6% · mediana 1.9% (n=4056) |
| 365d | win 80% · media -28.5% · mediana 10.2% (n=3754) | win 87% · media -16.7% · mediana 1.4% (n=3551) |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 85% · media -0.5% · mediana 11.5% (n=4509)
- **Top⅓ EVA:** win 88% · media 1.6% · mediana 11.5% (n=1503) · Bottom⅓ EVA: win 83% · media -3.2% · mediana 11.5% (n=1503) · Top⅓ Victor: win 87% · media 0.8% · mediana 11.5% (n=1503)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 87% · media 1.1% · mediana 11.5% (n=751) · mitad NUEVA: win 88% · media 2.2% · mediana 11.5% (n=752)

### Naked 90d @ 1σ
- TODAS: win 83% · media -10.6% · mediana 9.6% (n=4380)
- **Top⅓ EVA:** win 86% · media -5.7% · mediana 11.3% (n=1460) · Bottom⅓ EVA: win 81% · media -16% · mediana 8.2% (n=1460) · Top⅓ Victor: win 86% · media -5.1% · mediana 10.8% (n=1460)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 88% · media 6.3% · mediana 10.3% (n=730) · mitad NUEVA: win 83% · media -17.7% · mediana 11.9% (n=730)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 1.6% → 1.5% / 1.8% ✅ (n=1503) | -0.1% → -0.6% / 0.3% ✗ (n=1503) |
| 5d | 1.6% → 1.1% / 2.2% ✅ (n=1503) | 0.5% → 0.2% / 0.8% ✅ (n=1502) |
| 7d | 1.7% → 1% / 2.5% ✅ (n=1502) | 0.8% → 1% / 0.6% ✅ (n=1501) |
| 30d | 1.2% → 0.2% / 2.1% ✅ (n=1489) | 0.3% → 0.2% / 0.4% ✅ (n=1489) |
| 60d | 0.1% → 0.7% / -0.6% ✗ (n=1476) | -0.8% → -0.2% / -1.3% ✗ (n=1476) |
| 90d | -1.8% → -0.1% / -3.6% ✗ (n=1460) | -1.1% → 0.2% / -2.4% ✗ (n=1453) |
| 180d | -2.4% → -1% / -3.9% ✗ (n=1352) | -0.6% → 0.5% / -1.7% ✗ (n=1306) |
| 365d | -2.6% → -1.3% / -3.9% ✗ (n=1184) | 0.2% → 0.1% / 0.2% ✅ (n=1084) |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 8/16.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 1.6% | 1% | 0.4% | -0.2% |
| 90d @1σ | -1.9% | -2.4% | -2.9% | -3.5% |
| 180d @1σ | -2.4% | -3% | -3.5% | -4% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 85% · media -1.1% · mediana 11.5% (n=1505) | win 86% · media 0.2% · mediana 11.5% (n=406) |
| Normal | win 86% · media -0.3% · mediana 11.5% (n=1503) | win 88% · media 2.4% · mediana 11.5% (n=500) |
| Volátil | win 85% · media -0.3% · mediana 11.5% (n=1501) | win 88% · media 1.9% · mediana 11.5% (n=597) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 81% · media -6.8% · mediana 9.2% (n=1465) | win 84% · media -2.7% · mediana 9.4% (n=392) |
| Normal | win 82% · media -5% · mediana 9.3% (n=1457) | win 83% · media -4.1% · mediana 9.3% (n=487) |
| Volátil | win 85% · media -1.5% · mediana 9.4% (n=1458) | win 86% · media 0.6% · mediana 9.5% (n=581) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
