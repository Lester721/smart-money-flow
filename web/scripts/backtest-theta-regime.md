# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 1540 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 84% · media -2.1% · mediana 11.7% (n=1538) | win 91% · media -2.4% · mediana 4% (n=1538) |
| 5d | win 85% · media -0.4% · mediana 11.5% (n=1538) | win 93% · media -0.5% · mediana 3.9% (n=1537) |
| 7d | win 86% · media -0.4% · mediana 11.4% (n=1537) | win 93% · media -0.7% · mediana 3.8% (n=1535) |
| 30d | win 84% · media -1.7% · mediana 10.6% (n=1535) | win 92% · media -1.3% · mediana 3.3% (n=1535) |
| 60d | win 85% · media -1.4% · mediana 10% (n=1535) | win 92% · media -2% · mediana 2.9% (n=1535) |
| 90d | win 86% · media -0.5% · mediana 9.5% (n=1535) | win 93% · media -1.2% · mediana 2.6% (n=1531) |
| 180d | win 83% · media -4% · mediana 8.3% (n=1529) | win 91% · media -3.1% · mediana 2.1% (n=1482) |
| 365d | win 86% · media -0.2% · mediana 6.8% (n=1040) | win 93% · media 0% · mediana 7.9% (n=974) |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 39% · media 5.2% · mediana -100% (n=1540) | win 37% · media 9% · mediana -100% (n=1539) |
| 5d | win 39% · media 6.4% · mediana -87.2% (n=1539) | win 37% · media 7.1% · mediana -89% (n=1539) |
| 7d | win 39% · media 4.4% · mediana -86.8% (n=1539) | win 37% · media 4.5% · mediana -88.6% (n=1539) |
| 30d | win 41% · media 9% · mediana -94.4% (n=1534) | win 39% · media 11.2% · mediana -95.1% (n=1534) |
| 60d | win 38% · media 1.7% · mediana -93.2% (n=1534) | win 36% · media 4.4% · mediana -94.1% (n=1534) |
| 90d | win 38% · media 3.7% · mediana -92.7% (n=1534) | win 36% · media 2.9% · mediana -93.9% (n=1534) |
| 180d | win 39% · media 5.7% · mediana -100% (n=1534) | win 38% · media 10.9% · mediana -100% (n=1525) |
| 365d | win 37% · media 26529.9% · mediana -100% (n=1101) | win 34% · media 21881.7% · mediana -100% (n=1040) |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 85% · media -0.6% · mediana 1.2% (n=1540) | win 91% · media -0.7% · mediana 0.5% (n=1538) |
| 5d | win 86% · media -0.3% · mediana 1.7% (n=1538) | win 93% · media -0.7% · mediana 0.7% (n=1538) |
| 7d | win 86% · media -0.1% · mediana 2.1% (n=1538) | win 93% · media -0.6% · mediana 0.9% (n=1537) |
| 30d | win 85% · media -1.4% · mediana 6% (n=1535) | win 93% · media -1.7% · mediana 2.1% (n=1535) |
| 60d | win 85% · media -3.6% · mediana 8.9% (n=1535) | win 92% · media -4.1% · mediana 2.2% (n=1535) |
| 90d | win 87% · media -1.4% · mediana 10.7% (n=1535) | win 93% · media -1.8% · mediana 2.1% (n=1535) |
| 180d | win 84% · media -15% · mediana 11.8% (n=1535) | win 91% · media -9.3% · mediana 1.9% (n=1528) |
| 365d | win 85% · media 5.4% · mediana 11.5% (n=1099) | win 93% · media 8.5% · mediana 8.1% (n=1040) |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 85% · media -0.4% · mediana 11.5% (n=1538)
- **Top⅓ EVA:** win 87% · media 0.9% · mediana 11.5% (n=512) · Bottom⅓ EVA: win 83% · media -2% · mediana 11.5% (n=512) · Top⅓ Victor: win 86% · media 0.1% · mediana 11.5% (n=512)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 86% · media -0.5% · mediana 11.5% (n=256) · mitad NUEVA: win 89% · media 2.3% · mediana 11.5% (n=256)

### Naked 90d @ 1σ
- TODAS: win 87% · media -1.4% · mediana 10.7% (n=1535)
- **Top⅓ EVA:** win 93% · media 13.9% · mediana 11.5% (n=511) · Bottom⅓ EVA: win 82% · media -18% · mediana 9.6% (n=511) · Top⅓ Victor: win 91% · media 9.6% · mediana 10.7% (n=511)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 91% · media 7.6% · mediana 9.1% (n=255) · mitad NUEVA: win 95% · media 20.2% · mediana 13.8% (n=256)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 0.6% → 0.9% / 0.3% ✅ (n=512) | -0.8% → -0.9% / -0.6% ✗ (n=512) |
| 5d | 0.9% → -0.5% / 2.3% ✗ (n=512) | 0.7% → -0.3% / 1.7% ✗ (n=512) |
| 7d | 0.3% → -0.9% / 1.6% ✗ (n=512) | 0.9% → 0% / 1.9% ✗ (n=511) |
| 30d | -0.2% → -1.8% / 1.4% ✗ (n=511) | 0.7% → -0.8% / 2.2% ✗ (n=511) |
| 60d | 2.5% → 1.1% / 4% ✅ (n=511) | 0.7% → -0.2% / 1.6% ✗ (n=511) |
| 90d | 4.6% → 3.1% / 6.2% ✅ (n=511) | 2.6% → 2.1% / 3.2% ✅ (n=510) |
| 180d | 0.3% → -2.7% / 3.4% ✗ (n=509) | 0.7% → -0.5% / 1.8% ✗ (n=494) |
| 365d | 4.4% → 0.9% / 7.8% ✅ (n=346) | 4.4% → 3.7% / 5.1% ✅ (n=324) |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 6/16.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

## ETAPA 6 — ¿el edge sobrevive los COSTOS? (Top⅓ EVA · comisión Robinhood + slippage)

| Celda | slip 0% | 5% | 10% | 15% |
|---|---|---|---|---|
| 5d @1σ (mejor n) | 0.9% | 0.3% | -0.3% | -0.9% |
| 90d @1σ | 4.6% | 4% | 3.4% | 2.9% |
| 180d @1σ | 0.3% | -0.2% | -0.8% | -1.3% |

**Cómo leerlo:** media del Top⅓-Eva a cada nivel de slippage. Donde pasa a NEGATIVO, ahí el costo se comió el edge. Cuanto más slippage aguante positivo, más operable de verdad.

## ETAPA 7 — Diagnóstico de régimen (¿el edge depende del clima?)

### Credit spread 5d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 16% · **Normal** 16–23% · **Volátil** > 23%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 84% · media -1.8% · mediana 11.5% (n=516) | win 86% · media -0.1% · mediana 11.5% (n=153) |
| Normal | win 83% · media -2.4% · mediana 11.5% (n=510) | win 84% · media -2.7% · mediana 11.5% (n=154) |
| Volátil | win 89% · media 3.2% · mediana 11.5% (n=512) | win 91% · media 4.3% · mediana 11.5% (n=205) |

### Credit spread 90d @ 1σ
Clima por vol realizada de SPY (anualizada): **Tranquilo** ≤ 16% · **Normal** 16–23% · **Volátil** > 23%.

| Clima (vol de SPY) | TODAS | Top⅓ EVA (alta convicción) |
|---|---|---|
| Tranquilo | win 80% · media -8.1% · mediana 9.3% (n=515) | win 86% · media 0.2% · mediana 9.4% (n=152) |
| Normal | win 86% · media 0.8% · mediana 9.5% (n=509) | win 91% · media 4.4% · mediana 13.1% (n=154) |
| Volátil | win 93% · media 5.8% · mediana 9.5% (n=511) | win 96% · media 8.1% · mediana 9.5% (n=205) |

**Cómo leerlo:** si el **Top⅓ EVA** se mantiene positivo en los 3 climas → el edge es robusto al régimen (un filtro de clima aporta poco). Si es fuerte en Tranquilo/Normal y **negativo en Volátil** → los credit spreads se rompen en clima volátil, y ahí SÍ vale un filtro de régimen (apagar/achicar en volátil). Si solo funciona en un clima → el edge de ~1 año puede ser dependiente del régimen (frágil).

_Régimen = vol realizada 20d de SPY el día de entrada, en terciles sobre los días operados. Es DIAGNÓSTICO, no un filtro: no hay nada cableado a la estrategia todavía._

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
