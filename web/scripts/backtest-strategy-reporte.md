# Backtest de estrategia (ETAPAS 1+2) — 3 vehículos

**Señales:** 184 (dirección neta del flujo por día, a favor). Fuera del movimiento esperado (short a 1σ/1.5σ), 3/5/7/30/60/90d, hold a vencimiento. BS con IV≈vol realizada 20d.

## Venta de prima CON red (credit spread)
_retorno sobre riesgo = pérdida máx del spread._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 91% · media 3.3% · mediana 11.7% (n=174) | win 94% · media -0.5% · mediana 4.7% (n=174) |
| 5d | win 91% · media 3.3% · mediana 11.5% (n=169) | win 94% · media -0.3% · mediana 4.8% (n=169) |
| 7d | win 89% · media 1.6% · mediana 11.4% (n=169) | win 94% · media -0.2% · mediana 4.9% (n=169) |
| 30d | win 84% · media -2% · mediana 10.6% (n=143) | win 91% · media -1.6% · mediana 3.3% (n=143) |
| 60d | win 90% · media 2.1% · mediana 10% (n=119) | win 92% · media -1.2% · mediana 2.9% (n=119) |
| 90d | win 88% · media 0.5% · mediana 9.5% (n=95) | win 94% · media -1% · mediana 2.6% (n=95) |
| 180d | win 84% · media -3.5% · mediana 8.4% (n=44) | win 91% · media -4% · mediana 2% (n=44) |
| 365d | — | — |

## Debit spread direccional (a favor)
_retorno sobre riesgo = débito pagado._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 36% · media -4.4% · mediana -68.3% (n=174) | win 33% · media -3.9% · mediana -73.2% (n=174) |
| 5d | win 40% · media -5.6% · mediana -70.9% (n=169) | win 36% · media -4.9% · mediana -75.3% (n=169) |
| 7d | win 37% · media -3.7% · mediana -100% (n=169) | win 34% · media 0% · mediana -100% (n=169) |
| 30d | win 29% · media -15.3% · mediana -100% (n=143) | win 27% · media -9.2% · mediana -100% (n=143) |
| 60d | win 36% · media 0.6% · mediana -80.8% (n=119) | win 36% · media -0.9% · mediana -83.4% (n=119) |
| 90d | win 24% · media -22.8% · mediana -100% (n=95) | win 23% · media -21% · mediana -100% (n=95) |
| 180d | win 41% · media -12.3% · mediana -87.1% (n=44) | win 41% · media -24.8% · mediana -88.3% (n=44) |
| 365d | — | — |

## Naked / venta SIN red
_retorno sobre margen Reg-T aprox — OJO: cola catastrófica no capada._

| DTE | 1σ | 1.5σ |
|---|---|---|
| 3d | win 91% · media 0% · mediana 1.4% (n=174) | win 94% · media -0.2% · mediana 0.5% (n=174) |
| 5d | win 91% · media 0.1% · mediana 1.8% (n=169) | win 94% · media -0.1% · mediana 0.7% (n=169) |
| 7d | win 89% · media 0.4% · mediana 2.2% (n=169) | win 94% · media 0.2% · mediana 0.9% (n=169) |
| 30d | win 85% · media 0.4% · mediana 6.1% (n=143) | win 91% · media -0.6% · mediana 2% (n=143) |
| 60d | win 90% · media 0.9% · mediana 9% (n=119) | win 92% · media -1.3% · mediana 2.2% (n=119) |
| 90d | win 89% · media 2.3% · mediana 9.9% (n=95) | win 94% · media 0.7% · mediana 2.2% (n=95) |
| 180d | win 84% · media 3.7% · mediana 12.2% (n=44) | win 91% · media 0.3% · mediana 1.9% (n=44) |
| 365d | — | — |

## ETAPA 4 — filtro de convicción + OUT-OF-SAMPLE del hilo prometedor

### Credit spread 5d @ 1σ
- TODAS: win 91% · media 3.3% · mediana 11.5% (n=169)
- **Top⅓ EVA:** win 93% · media 5.9% · mediana 11.5% (n=56) · Bottom⅓ EVA: win 88% · media -1.5% · mediana 12.6% (n=56) · Top⅓ Victor: win 93% · media 7.2% · mediana 11.5% (n=56)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 96% · media 8% · mediana 11.5% (n=28) · mitad NUEVA: win 89% · media 3.8% · mediana 11.5% (n=28)

### Naked 90d @ 1σ
- TODAS: win 89% · media 2.3% · mediana 9.9% (n=95)
- **Top⅓ EVA:** win 97% · media 12.5% · mediana 11.1% (n=31) · Bottom⅓ EVA: win 84% · media -5.5% · mediana 7.8% (n=31) · Top⅓ Victor: win 97% · media 10.7% · mediana 11% (n=31)
- **OOS del Top⅓ EVA** → mitad VIEJA: win 100% · media 16.3% · mediana 11.8% (n=15) · mitad NUEVA: win 94% · media 8.8% · mediana 11.1% (n=16)

Robusto SOLO si el Top⅓ EVA gana a TODAS/Bottom **Y** aguanta en las DOS mitades OOS. Si se voltea entre mitades → cherry-picking/régimen (como pasó con la gestión).

**Cómo leerlo:** credit/naked (vender prima) ganan seguido pero pierden grande → mira la MEDIA, no solo el win%. El debit spread pierde seguido pero gana grande. Candidata = media positiva con win razonable.

## Caveats
- 0DTE (por delta) y filtro de fuerza Eva/Victor vienen en etapas 3-4.
- Ancho credit/debit = σ; naked con riesgo ilimitado (margen Reg-T aprox). Hold a vencimiento, sin gestión.
- IV = vol realizada 20d (aprox, sin smile). Vencimiento por calendario. Sin comisiones.
- Dirección = flujo neto del día (misma Eva/Victor; el filtro de fuerza es etapa 4).
