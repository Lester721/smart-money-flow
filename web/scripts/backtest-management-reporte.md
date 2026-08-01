# Backtest de gestión del trade (stops / targets / horizonte)

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · **1075 flujos**. Long-only, salida al bid, IV de entrada constante. Stops/targets se chequean al CIERRE de cada día (granularidad diaria → subestima toques intradía).

## Resultado por config (¿la gestión mejora la expectativa?)
| Config | Resultado |
|---|---|
| Baseline hold 10 (sin gestión) | win 47% · media 10.7% · mediana -1% (n=924) |
| Baseline hold 20 (sin gestión) | win 50% · media 15.1% · mediana -0.1% (n=924) |
| Stop -50% / Target +100% / H20 | win 46% · media 4.1% · mediana -2.2% (n=924) |
| Stop -50% / Target +50% / H10 | win 47% · media 4.3% · mediana -1.8% (n=924) |
| Stop -30% / Target +100% / H20 | win 44% · media 2.8% · mediana -5.4% (n=924) |
| Sin stop / Target +100% / H20 (deja correr) | win 50% · media 11.6% · mediana 0% (n=924) |
| Stop -50% / sin target / H20 (corta perdedores) | win 46% · media 7% · mediana -3% (n=924) |
| Stop -40% / Target +80% / H15 | win 47% · media 5.1% · mediana -2% (n=924) |

**Cómo leerlo:** compara las configs con stop/target contra los baseline (hold sin gestión). Si una config sube el win% Y la mediana sobre el baseline, la gestión agrega expectativa. Ojo: cortar perdedores suele SUBIR win% pero puede bajar la media (menos jackpots); dejar correr sube la media.

## Caveats
- Granularidad DIARIA: los stops/targets se evalúan al cierre → subestima toques intradía (en vivo saltarían antes).
- Long-only, IV de entrada constante (no modela cambios de IV). Sin comisiones.
- Aplica a TODOS los flujos notables, no solo al set operable — mide el efecto de la gestión en bruto.
