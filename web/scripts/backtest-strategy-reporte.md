# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

## Procedencia — QUÉ SE PROBÓ DE VERDAD

| | |
|---|---|
| Período **pedido** | 2021-01-01 → 2026-07-31 |
| Período **real de las señales** | **2021-03-01 → 2026-07-31** |
| Cobertura | **97%** del rango pedido ✅ |
| Proveedor | theta |
| Precio del subyacente | **real (suscripción de acciones)** |
| Tickers | 7 con datos |
| Señales | 4582 |

| Ticker | Barras | Desde | Hasta | Días c/ flujo | Señales |
|---|---|---|---|---|---|
| SPY | 1394 | 2021-01-19 ⚠️ | 2026-08-06 | 1153 | 742 |
| AAPL | 1394 | 2021-01-19 ⚠️ | 2026-08-06 | 1043 | 683 |
| MSFT | 1394 | 2021-01-19 ⚠️ | 2026-08-06 | 739 | 358 |
| NVDA | 1393 | 2021-01-19 ⚠️ | 2026-08-05 | 909 | 626 |
| TSLA | 1394 | 2021-01-19 ⚠️ | 2026-08-06 | 1185 | 877 |
| AMD | 1394 | 2021-01-19 ⚠️ | 2026-08-06 | 726 | 433 |
| QQQ | 1394 | 2021-01-19 ⚠️ | 2026-08-06 | 1220 | 863 |

**Señales:** 4582 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 84% · media -2% · mediana 11.7% (n=4580) | win 91% · media -2.7% · mediana 4% (n=4580) |
| 5d | win 85% · media -0.9% · mediana 11.5% (n=4580) | win 92% · media -1.5% · mediana 3.9% (n=4579) |
| 7d | win 85% · media -1.2% · mediana 11.4% (n=4577) | win 92% · media -1.3% · mediana 3.8% (n=4575) |
| 30d | win 83% · media -3% · mediana 10.6% (n=4538) | win 91% · media -2.9% · mediana 3.3% (n=4538) |
| 60d | win 83% · media -4.1% · mediana 9.9% (n=4499) | win 90% · media -3.8% · mediana 2.9% (n=4499) |
| 90d | win 82% · media -5.3% · mediana 9.3% (n=4446) | win 89% · media -4.4% · mediana 2.6% (n=4430) |
| 180d | win 81% · media -6.6% · mediana 8.1% (n=4132) | win 88% · media -5% · mediana 2.1% (n=3992) |
| 365d | win 77% · media -11% · mediana 6.4% (n=3611) | win 84% · media -8.3% · mediana 1.4% (n=3319) |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 38% · media 1.5% · mediana -99.2% (n=4582) | win 36% · media 3.9% · mediana -99.3% (n=4581) |
| 5d | win 38% · media 1.3% · mediana -92.8% (n=4582) | win 36% · media 1.8% · mediana -93.9% (n=4581) |
| 7d | win 38% · media 1.8% · mediana -96.6% (n=4579) | win 37% · media 2.8% · mediana -97.1% (n=4579) |
| 30d | win 40% · media 8.4% · mediana -92.3% (n=4537) | win 39% · media 11.2% · mediana -93.4% (n=4537) |
| 60d | win 39% · media 7.5% · mediana -94.7% (n=4498) | win 38% · media 11.6% · mediana -95.4% (n=4498) |
| 90d | win 39% · media 8.6% · mediana -100% (n=4445) | win 38% · media 12.7% · mediana -100% (n=4445) |
| 180d | win 42% · media 15.8% · mediana -100% (n=4159) | win 41% · media 21.6% · mediana -98% (n=4131) |
| 365d | win 43% · media 67.6% · mediana -97% (n=3792) | win 42% · media 67.9% · mediana -88.3% (n=3629) |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -0.9% · mediana 1.1% (n=4582) | win 91% · media -1% · mediana 0.5% (n=4580) |
| 5d | win 86% · media -0.8% · mediana 1.5% (n=4582) | win 92% · media -1.2% · mediana 0.6% (n=4580) |
| 7d | win 85% · media -0.8% · mediana 1.8% (n=4578) | win 93% · media -1.2% · mediana 0.8% (n=4577) |
| 30d | win 84% · media -5.2% · mediana 4.7% (n=4538) | win 91% · media -5.1% · mediana 1.9% (n=4538) |
| 60d | win 83% · media -9.5% · mediana 7.5% (n=4499) | win 90% · media -8.5% · mediana 2.1% (n=4499) |
| 90d | win 83% · media -12.1% · mediana 8.9% (n=4446) | win 90% · media -9.2% · mediana 2.1% (n=4446) |
| 180d | win 82% · media -17.4% · mediana 10.8% (n=4160) | win 89% · media -11.5% · mediana 1.9% (n=4130) |
| 365d | win 79% · media -32% · mediana 9.8% (n=3795) | win 86% · media -19.4% · mediana 1.4% (n=3609) |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 85% · media -0.9% · mediana 11.5% (n=4580)
- **Top⅓ EVA:** win 87% · media 1.5% · mediana 11.5% (n=1526) · Bottom⅓ EVA: win 81% · media -4.6% · mediana 11.5% (n=1526) · Top⅓ Victor: win 86% · media 0.7% · mediana 11.5% (n=1526)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 87% · media 1.6% · mediana 11.5% (n=763) · mitad NUEVA: win 87% · media 1.4% · mediana 11.5% (n=763)

### Naked 90d @ 1σ
- TODAS: win 83% · media -12.1% · mediana 8.9% (n=4446)
- **Top⅓ EVA:** win 84% · media -7.6% · mediana 10.8% (n=1482) · Bottom⅓ EVA: win 80% · media -16.9% · mediana 7% (n=1482) · Top⅓ Victor: win 85% · media -5.4% · mediana 10.2% (n=1482)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 89% · media 9% · mediana 10.7% (n=741) · mitad NUEVA: win 79% · media -24.2% · mediana 10.9% (n=741)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 0.8% → 0.6% / 1% ✅ (n=1526) | -0.7% → -0.9% / -0.5% ✗ (n=1526) |
| 5d | 1.5% → 1.6% / 1.4% ✅ (n=1526) | 0.4% → 1% / -0.2% ✗ (n=1526) |
| 7d | 1.2% → 0.8% / 1.5% ✅ (n=1525) | 0.9% → 1.2% / 0.5% ✅ (n=1525) |
| 30d | -0.2% → 0.3% / -0.8% ✗ (n=1512) | -0.4% → 0.4% / -1.3% ✗ (n=1512) |
| 60d | -1.5% → 1.2% / -4.3% ✗ (n=1499) | -1.7% → 0.3% / -3.6% ✗ (n=1499) |
| 90d | -3.7% → 1.2% / -8.5% ✗ (n=1482) | -2.3% → 1.3% / -5.8% ✗ (n=1476) |
| 180d | -3% → 0.6% / -6.6% ✗ (n=1377) | -1.5% → 1% / -4.1% ✗ (n=1330) |
| 365d | -3% → 0.6% / -6.5% ✗ (n=1203) | -1% → 1.5% / -3.5% ✗ (n=1106) |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 4/16.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 1.5% | 0.9% | 0.3% | -0.3% |
| 90d @1σ | -3.7% | -4.2% | -4.8% | -5.3% |
| 180d @1σ | -3% | -3.5% | -4% | -4.6% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 83% · media -2.4% · mediana 11.5% (n=1527) | win 85% · media -0.9% · mediana 11.5% (n=342) |
| Normal | win 86% · media 0.2% · mediana 11.5% (n=1527) | win 89% · media 3.7% · mediana 11.5% (n=523) |
| Volátil | win 85% · media -0.6% · mediana 11.5% (n=1526) | win 87% · media 1.1% · mediana 11.5% (n=661) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 79% · media -8.8% · mediana 9.2% (n=1486) | win 76% · media -10.5% · mediana 9.2% (n=335) |
| Normal | win 81% · media -6% · mediana 9.3% (n=1482) | win 81% · media -5.1% · mediana 9.3% (n=507) |
| Volátil | win 85% · media -1.1% · mediana 9.4% (n=1478) | win 88% · media 1% · mediana 9.5% (n=640) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
