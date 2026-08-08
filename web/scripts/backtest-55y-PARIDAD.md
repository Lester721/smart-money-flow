# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

## Procedencia — QUÉ SE PROBÓ DE VERDAD

| | |
|---|---|
| Período **pedido** | 2021-01-01 → 2026-07-31 |
| Período **real de las señales** | **2021-01-04 → 2026-07-31** |
| Cobertura | **100%** del rango pedido ✅ |
| Proveedor | theta |
| Precio del subyacente | **DERIVADO de opciones (paridad put-call)** |
| Tickers | 9 con datos |
| Señales | 5157 |

| Ticker | Barras | Desde | Hasta | Días c/ flujo | Señales |
|---|---|---|---|---|---|
| SPY | 1431 | 2020-11-23 | 2026-08-06 | 1153 | 764 |
| AAPL | 1431 | 2020-11-23 | 2026-08-06 | 1043 | 673 |
| MSFT | 1431 | 2020-11-23 | 2026-08-06 | 739 | 361 |
| NVDA | 1431 | 2020-11-23 | 2026-08-06 | 909 | 604 |
| META | 1431 | 2020-11-23 | 2026-08-06 | 866 | 419 |
| TSLA | 1431 | 2020-11-23 | 2026-08-06 | 1185 | 898 |
| AMD | 1431 | 2020-11-23 | 2026-08-06 | 726 | 443 |
| QQQ | 1431 | 2020-11-23 | 2026-08-06 | 1220 | 883 |
| HOOD | 1257 | 2021-08-04 ⚠️ | 2026-08-06 | 274 | 112 |

**Señales:** 5157 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -1.3% · mediana 11.7% (n=5155) | win 92% · media -2.4% · mediana 4% (n=5155) |
| 5d | win 86% · media -0.1% · mediana 11.5% (n=5155) | win 93% · media -1% · mediana 3.9% (n=5154) |
| 7d | win 86% · media -0.1% · mediana 11.4% (n=5152) | win 93% · media -0.9% · mediana 3.8% (n=5150) |
| 30d | win 84% · media -1.9% · mediana 10.6% (n=5105) | win 92% · media -2.2% · mediana 3.3% (n=5105) |
| 60d | win 83% · media -3.1% · mediana 9.9% (n=5062) | win 91% · media -3.2% · mediana 2.9% (n=5062) |
| 90d | win 83% · media -4.5% · mediana 9.4% (n=5010) | win 90% · media -3.8% · mediana 2.6% (n=4982) |
| 180d | win 81% · media -7.1% · mediana 8.1% (n=4627) | win 88% · media -4.9% · mediana 2% (n=4469) |
| 365d | win 77% · media -10.8% · mediana 6.5% (n=4038) | win 85% · media -8.1% · mediana 1.4% (n=3694) |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 37% · media -0.1% · mediana -100% (n=5157) | win 35% · media 1.8% · mediana -100% (n=5156) |
| 5d | win 37% · media -1.4% · mediana -97.5% (n=5157) | win 35% · media -1.1% · mediana -97.9% (n=5156) |
| 7d | win 38% · media 0.2% · mediana -98.8% (n=5154) | win 36% · media 0.6% · mediana -98.9% (n=5154) |
| 30d | win 39% · media 6% · mediana -97.9% (n=5104) | win 38% · media 7.6% · mediana -98.1% (n=5104) |
| 60d | win 38% · media 5% · mediana -98.6% (n=5061) | win 36% · media 7.7% · mediana -98.8% (n=5061) |
| 90d | win 39% · media 6.9% · mediana -100% (n=5009) | win 37% · media 9.4% · mediana -100% (n=5009) |
| 180d | win 42% · media 16.6% · mediana -98.8% (n=4670) | win 41% · media 22.8% · mediana -93.9% (n=4626) |
| 365d | win 43% · media 57.1% · mediana -89.6% (n=4247) | win 43% · media 59.6% · mediana -79.2% (n=4061) |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -0.8% · mediana 1.3% (n=5157) | win 92% · media -1% · mediana 0.5% (n=5155) |
| 5d | win 87% · media -0.5% · mediana 1.7% (n=5157) | win 93% · media -1% · mediana 0.7% (n=5155) |
| 7d | win 87% · media -0.3% · mediana 2.1% (n=5153) | win 93% · media -1% · mediana 0.9% (n=5152) |
| 30d | win 85% · media -4.2% · mediana 5.7% (n=5105) | win 92% · media -4.2% · mediana 2.1% (n=5105) |
| 60d | win 84% · media -8.5% · mediana 8.5% (n=5062) | win 91% · media -7.6% · mediana 2.2% (n=5062) |
| 90d | win 83% · media -11.5% · mediana 9.9% (n=5010) | win 90% · media -8.6% · mediana 2.1% (n=5010) |
| 180d | win 82% · media -20.9% · mediana 11.3% (n=4671) | win 89% · media -13.3% · mediana 1.9% (n=4627) |
| 365d | win 79% · media -42% · mediana 10.2% (n=4258) | win 86% · media -28% · mediana 1.4% (n=4036) |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 86% · media -0.1% · mediana 11.5% (n=5155)
- **Top⅓ EVA:** win 88% · media 2.1% · mediana 11.5% (n=1718) · Bottom⅓ EVA: win 84% · media -2.4% · mediana 11.5% (n=1718) · Top⅓ Victor: win 87% · media 1.1% · mediana 11.5% (n=1718)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 88% · media 1.6% · mediana 11.5% (n=859) · mitad NUEVA: win 89% · media 2.6% · mediana 11.5% (n=859)

### Naked 90d @ 1σ
- TODAS: win 83% · media -11.5% · mediana 9.9% (n=5010)
- **Top⅓ EVA:** win 86% · media -7.5% · mediana 11.5% (n=1670) · Bottom⅓ EVA: win 81% · media -16.4% · mediana 8.7% (n=1670) · Top⅓ Victor: win 86% · media -6.9% · mediana 11% (n=1670)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 87% · media 3.7% · mediana 10.3% (n=835) · mitad NUEVA: win 84% · media -18.7% · mediana 12% (n=835)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 1.7% → 1.2% / 2.1% ✅ (n=1718) | -0.1% → -0.5% / 0.3% ✗ (n=1718) |
| 5d | 2.1% → 1.6% / 2.6% ✅ (n=1718) | 0.6% → 0.5% / 0.8% ✅ (n=1718) |
| 7d | 2% → 1.4% / 2.6% ✅ (n=1717) | 0.9% → 1.2% / 0.6% ✅ (n=1716) |
| 30d | 1.6% → 1.2% / 2% ✅ (n=1701) | 0.4% → 0.5% / 0.2% ✅ (n=1701) |
| 60d | 0.2% → 1.2% / -0.7% ✗ (n=1687) | -0.8% → -0.2% / -1.4% ✗ (n=1687) |
| 90d | -2.2% → -0.7% / -3.6% ✗ (n=1670) | -1.7% → -0.5% / -2.8% ✗ (n=1660) |
| 180d | -3.5% → -1.9% / -5% ✗ (n=1542) | -1.3% → 0.7% / -3.3% ✗ (n=1489) |
| 365d | -3.7% → -2.9% / -4.5% ✗ (n=1346) | -1.4% → -1.4% / -1.3% ✗ (n=1231) |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 7/16.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 2.1% | 1.5% | 0.9% | 0.3% |
| 90d @1σ | -2.2% | -2.7% | -3.2% | -3.8% |
| 180d @1σ | -3.5% | -4% | -4.5% | -5% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 85% · media -1.2% · mediana 11.5% (n=1723) | win 87% · media 0.5% · mediana 11.5% (n=467) |
| Normal | win 86% · media 0.2% · mediana 11.5% (n=1714) | win 89% · media 2.8% · mediana 11.5% (n=562) |
| Volátil | win 87% · media 0.8% · mediana 11.5% (n=1718) | win 89% · media 2.6% · mediana 11.5% (n=689) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 12% · **Normal** 12–17% · **Volátil** > 17%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 81% · media -6.3% · mediana 9.3% (n=1671) | win 84% · media -2.8% · mediana 9.4% (n=446) |
| Normal | win 83% · media -4.4% · mediana 9.3% (n=1670) | win 84% · media -3.7% · mediana 9.3% (n=554) |
| Volátil | win 83% · media -2.8% · mediana 9.4% (n=1669) | win 85% · media -0.4% · mediana 9.4% (n=670) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
