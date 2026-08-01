# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 218 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 90% · media 2.3% · mediana 11.7% (n=207) | win 93% · media -1.1% · mediana 4% (n=207) |
| 5d | win 90% · media 2.2% · mediana 11.5% (n=202) | win 94% · media -0.6% · mediana 3.9% (n=202) |
| 7d | win 87% · media -0.3% · mediana 11.4% (n=202) | win 93% · media -1.1% · mediana 3.8% (n=202) |
| 30d | win 81% · media -5.2% · mediana 10.6% (n=172) | win 88% · media -4.7% · mediana 3.3% (n=172) |
| 60d | win 88% · media 1.2% · mediana 10% (n=141) | win 92% · media -1.7% · mediana 2.9% (n=141) |
| 90d | win 86% · media -2.5% · mediana 9.5% (n=112) | win 90% · media -3.7% · mediana 2.6% (n=112) |
| 180d | win 77% · media -10.3% · mediana 8.3% (n=53) | win 85% · media -9.6% · mediana 2% (n=53) |
| 365d | — | — |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 36% · media -3.3% · mediana -68.3% (n=207) | win 33% · media -2.3% · mediana -73.2% (n=207) |
| 5d | win 38% · media -7.8% · mediana -80.9% (n=202) | win 35% · media -6.8% · mediana -83.6% (n=202) |
| 7d | win 36% · media -4.8% · mediana -100% (n=202) | win 34% · media -1.3% · mediana -100% (n=202) |
| 30d | win 30% · media -14.4% · mediana -100% (n=172) | win 28% · media -9.7% · mediana -100% (n=172) |
| 60d | win 36% · media -0.4% · mediana -80.8% (n=141) | win 36% · media -1.6% · mediana -83.4% (n=141) |
| 90d | win 28% · media -18.2% · mediana -95.7% (n=112) | win 25% · media -16% · mediana -96.4% (n=112) |
| 180d | win 42% · media 0.8% · mediana -100% (n=53) | win 42% · media -1.1% · mediana -100% (n=53) |
| 365d | — | — |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 90% · media -0.1% · mediana 1.3% (n=207) | win 93% · media -0.3% · mediana 0.5% (n=207) |
| 5d | win 90% · media -0.2% · mediana 1.8% (n=202) | win 94% · media -0.4% · mediana 0.7% (n=202) |
| 7d | win 87% · media -0.3% · mediana 2.1% (n=202) | win 93% · media -0.3% · mediana 0.9% (n=202) |
| 30d | win 81% · media -1% · mediana 6.1% (n=172) | win 88% · media -1.5% · mediana 1.9% (n=172) |
| 60d | win 89% · media 1% · mediana 8.6% (n=141) | win 92% · media -1.3% · mediana 2.2% (n=141) |
| 90d | win 87% · media 0.4% · mediana 9.9% (n=112) | win 90% · media -0.9% · mediana 2.4% (n=112) |
| 180d | win 77% · media -3.4% · mediana 12% (n=53) | win 85% · media -2.9% · mediana 1.9% (n=53) |
| 365d | — | — |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 90% · media 2.2% · mediana 11.5% (n=202)
- **Top⅓ EVA:** win 93% · media 5.3% · mediana 11.5% (n=67) · Bottom⅓ EVA: win 90% · media 1.1% · mediana 11.5% (n=67) · Top⅓ Victor: win 93% · media 6.5% · mediana 11.5% (n=67)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 94% · media 5.3% · mediana 11.5% (n=33) · mitad NUEVA: win 91% · media 5.3% · mediana 11.5% (n=34)

### Naked 90d @ 1σ
- TODAS: win 87% · media 0.4% · mediana 9.9% (n=112)
- **Top⅓ EVA:** win 97% · media 13.4% · mediana 11.8% (n=37) · Bottom⅓ EVA: win 78% · media -5.5% · mediana 7.8% (n=37) · Top⅓ Victor: win 92% · media 5.8% · mediana 11% (n=37)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 100% · media 16.5% · mediana 14.4% (n=18) · mitad NUEVA: win 95% · media 10.5% · mediana 11.7% (n=19)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

## ETAPA 5 — Credit spread: Top⅓ EVA + OOS en TODAS las celdas

| DTE | 1σ: todas → vieja / nueva | 1.5σ: todas → vieja / nueva |
|---|---|---|
| 3d | 3.1% → 3.4% / 2.8% ✅ (n=69) | 2.7% → 1.3% / 4% ✅ (n=69) |
| 5d | 5.3% → 5.3% / 5.3% ✅ (n=67) | 1.3% → 1% / 1.7% ✅ (n=67) |
| 7d | 4.4% → 4.5% / 4.3% ✅ (n=67) | 2.3% → 1.2% / 3.4% ✅ (n=67) |
| 30d | 4.5% → 7.8% / 1.4% ✅ (n=57) | 2.5% → 3.8% / 1.2% ✅ (n=57) |
| 60d | 4.5% → 6.8% / 2.2% ✅ (n=47) | 0.8% → 2.8% / -1.2% ✗ (n=47) |
| 90d | 8.7% → 11.7% / 5.8% ✅ (n=37) | 4.3% → 4.3% / 4.2% ✅ (n=37) |
| 180d | 11% → 11.1% / 11% ✅ (n=17) | 4% → 4.1% / 3.9% ✅ (n=17) |
| 365d | — | — |

**Celdas robustas (Top-EVA positivo en las DOS mitades OOS): 13/14.** Muchas ✅ → el edge es AMPLIO (no fue suerte de una celda). Pocas → cherry-picking.

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
