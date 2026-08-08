# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

## Procedencia — QUÉ SE PROBÓ DE VERDAD

| | |
|---|---|
| Período **pedido** | 2016-01-01 → 2026-07-31 |
| Período **real de las señales** | **2016-02-02 → 2026-07-31** |
| Cobertura | **99%** del rango pedido ✅ |
| Proveedor | theta |
| Precio del subyacente | **DERIVADO de opciones (paridad put-call)** |
| Tickers | 9 con datos |
| Señales | 7595 |

| Ticker | Barras | Desde | Hasta | Días c/ flujo | Señales |
|---|---|---|---|---|---|
| SPY | 2634 | 2016-01-04 ⚠️ | 2026-08-06 | 2084 | 1358 |
| AAPL | 2635 | 2016-01-04 ⚠️ | 2026-08-06 | 1748 | 1029 |
| MSFT | 2663 | 2016-01-04 ⚠️ | 2026-08-06 | 1116 | 557 |
| NVDA | 2663 | 2016-01-04 ⚠️ | 2026-08-06 | 1203 | 750 |
| META | 2663 | 2016-01-04 ⚠️ | 2026-08-06 | 1502 | 735 |
| TSLA | 2663 | 2016-01-04 ⚠️ | 2026-08-06 | 1861 | 1179 |
| AMD | 2663 | 2016-01-04 ⚠️ | 2026-08-06 | 938 | 547 |
| QQQ | 2663 | 2016-01-04 ⚠️ | 2026-08-06 | 1947 | 1328 |
| HOOD | 1257 | 2021-08-04 ⚠️ | 2026-08-06 | 274 | 112 |

**Señales:** 7595 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 84% · media -1.9% · mediana 11.7% (n=7593) | win 91% · media -2.7% · mediana 4% (n=7593) |
| 5d | win 85% · media -0.6% · mediana 11.5% (n=7593) | win 93% · media -1.7% · mediana 3.9% (n=7585) |
| 7d | win 85% · media -0.9% · mediana 11.4% (n=7586) | win 92% · media -1.7% · mediana 3.8% (n=7581) |
| 30d | win 83% · media -3% · mediana 10.6% (n=7536) | win 91% · media -3% · mediana 3.3% (n=7536) |
| 60d | win 82% · media -4.5% · mediana 9.9% (n=7493) | win 90% · media -4.3% · mediana 2.9% (n=7489) |
| 90d | win 82% · media -5.6% · mediana 9.3% (n=7440) | win 89% · media -5% · mediana 2.6% (n=7397) |
| 180d | win 80% · media -7.5% · mediana 8% (n=7039) | win 88% · media -5.2% · mediana 2% (n=6808) |
| 365d | win 75% · media -13.6% · mediana 6.3% (n=6350) | win 83% · media -10.4% · mediana 1.4% (n=5899) |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 37% · media -0.1% · mediana -100% (n=7595) | win 35% · media 2% · mediana -100% (n=7594) |
| 5d | win 37% · media -0.6% · mediana -97% (n=7595) | win 35% · media 0.4% · mediana -97.3% (n=7594) |
| 7d | win 38% · media -0.5% · mediana -98.1% (n=7592) | win 35% · media 0.3% · mediana -98.5% (n=7584) |
| 30d | win 40% · media 7.3% · mediana -97.3% (n=7533) | win 38% · media 9.3% · mediana -97.6% (n=7533) |
| 60d | win 39% · media 7.5% · mediana -98.4% (n=7490) | win 37% · media 10.7% · mediana -98.7% (n=7490) |
| 90d | win 39% · media 7.7% · mediana -98.8% (n=7438) | win 38% · media 10.7% · mediana -98.9% (n=7436) |
| 180d | win 42% · media 17.4% · mediana -96.4% (n=7097) | win 41% · media 23% · mediana -92.8% (n=7039) |
| 365d | win 44% · media 52.3% · mediana -84.1% (n=6662) | win 44% · media 57.1% · mediana -78% (n=6413) |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -1% · mediana 1.1% (n=7595) | win 91% · media -1.2% · mediana 0.5% (n=7593) |
| 5d | win 86% · media -0.9% · mediana 1.5% (n=7595) | win 93% · media -1.4% · mediana 0.6% (n=7593) |
| 7d | win 86% · media -0.8% · mediana 1.8% (n=7591) | win 92% · media -1.3% · mediana 0.8% (n=7586) |
| 30d | win 84% · media -4.5% · mediana 4.7% (n=7536) | win 91% · media -4.4% · mediana 1.9% (n=7536) |
| 60d | win 83% · media -8.5% · mediana 7.5% (n=7493) | win 90% · media -7.4% · mediana 2.1% (n=7493) |
| 90d | win 82% · media -11.5% · mediana 8.9% (n=7441) | win 89% · media -8.7% · mediana 2.1% (n=7440) |
| 180d | win 81% · media -17% · mediana 10.5% (n=7102) | win 89% · media -10.9% · mediana 1.8% (n=7039) |
| 365d | win 77% · media -44.2% · mediana 9% (n=6673) | win 84% · media -31.1% · mediana 1.4% (n=6348) |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 85% · media -0.6% · mediana 11.5% (n=7593)
- **Top⅓ EVA:** win 88% · media 2.3% · mediana 11.5% (n=2531) · Bottom⅓ EVA: win 82% · media -3.7% · mediana 11.5% (n=2531) · Top⅓ Victor: win 87% · media 1.5% · mediana 11.5% (n=2531)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 87% · media 1.7% · mediana 11.5% (n=1265) · mitad NUEVA: win 89% · media 2.9% · mediana 11.5% (n=1266)

### Naked 90d @ 1σ
- TODAS: win 82% · media -11.5% · mediana 8.9% (n=7441)
- **Top⅓ EVA:** win 85% · media -6.9% · mediana 10.7% (n=2480) · Bottom⅓ EVA: win 79% · media -16.8% · mediana 7.2% (n=2480) · Top⅓ Victor: win 85% · media -6.4% · mediana 10.1% (n=2480)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 88% · media 2.1% · mediana 9.9% (n=1240) · mitad NUEVA: win 83% · media -15.9% · mediana 11.5% (n=1240)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 1.6% → 0.7% / 2.5% ✅ (n=2531) | -0.2% → -0.8% / 0.5% ✗ (n=2531) |
| 5d | 2.3% → 1.7% / 2.9% ✅ (n=2531) | 0.8% → 0.7% / 0.9% ✅ (n=2528) |
| 7d | 2.1% → 1.5% / 2.8% ✅ (n=2528) | 0.7% → 0.8% / 0.6% ✅ (n=2527) |
| 30d | 1.8% → 1.2% / 2.4% ✅ (n=2512) | 0.1% → -0.1% / 0.2% ✗ (n=2512) |
| 60d | -0.2% → 0.9% / -1.3% ✗ (n=2497) | -1% → -0.2% / -1.7% ✗ (n=2496) |
| 90d | -2.5% → -0.4% / -4.6% ✗ (n=2480) | -2% → -0.6% / -3.4% ✗ (n=2465) |
| 180d | -3.9% → -3.2% / -4.6% ✗ (n=2346) | -1.9% → -1.6% / -2.2% ✗ (n=2269) |
| 365d | -7.7% → -9% / -6.3% ✗ (n=2116) | -4.3% → -5.3% / -3.4% ✗ (n=1966) |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 6/16.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 2.3% | 1.6% | 1% | 0.4% |
| 90d @1σ | -2.5% | -3% | -3.6% | -4.1% |
| 180d @1σ | -3.9% | -4.4% | -4.9% | -5.4% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 11% · **Normal** 11–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 83% · media -2.4% · mediana 11.5% (n=2534) | win 86% · media 1% · mediana 11.5% (n=623) |
| Normal | win 86% · media 0.4% · mediana 11.5% (n=2532) | win 89% · media 2.5% · mediana 11.5% (n=900) |
| Volátil | win 86% · media 0.2% · mediana 11.5% (n=2527) | win 89% · media 2.9% · mediana 11.5% (n=1008) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 11% · **Normal** 11–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 78% · media -9.6% · mediana 9.1% (n=2484) | win 82% · media -4.7% · mediana 9.3% (n=606) |
| Normal | win 83% · media -4.4% · mediana 9.3% (n=2480) | win 84% · media -3.5% · mediana 9.4% (n=891) |
| Volátil | win 84% · media -2.8% · mediana 9.4% (n=2476) | win 86% · media -0.2% · mediana 9.4% (n=983) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
