# Chequeo de confianza — reporte PILOTO

**Qué mide:** por cada flujo histórico, ¿el precio **validó** su dirección (se movió a favor antes que en contra) en las siguientes 20 sesiones? Reusa la lógica exacta de Eva (`classifyFlow` + `evaluateFlow`).

**Muestra:** tickers AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · ventana 180 días · premium ≥ $1.0M · **300 flujos resueltos** (con tiempo suficiente para juzgar).

## Línea base
- Hit rate global: **48%** (300 flujos). Un 50% = moneda al aire.

## Por señal de sub-agente (hit rate por banda)

| Señal | Banda | Hit rate | n |
|---|---|---|---|
| **Agresividad** | Compra al ask | 55% | 156 |
| | Venta al bid | 40% | 144 |
| | Al medio (mid) | — | 0 |
| **Inusualidad** | Score ≥ 7 (institucional) | 44% | 73 |
| | Score < 7 | 49% | 227 |
| **Convicción (delta)** | \|delta\| ≥ 0.60 (direccional) | 46% | 92 |
| | \|delta\| < 0.60 | 49% | 208 |
| **Tamaño** | ≥ $5M | 40% | 50 |
| | < $5M | 50% | 250 |

**Cómo leerlo:** si una banda "buena" (ask, inusualidad alta, delta alta, grande) tiene hit rate MAYOR que su banda opuesta, esa señal **sí tiene poder predictivo** en esta muestra. Si son parecidas, la señal no separa (aún).

## Caveats honestos
- Es un **PILOTO** (muestra chica por el rate-limit de la key compartida). Los números pueden moverse con más datos.
- Solo cuentan flujos con ≥20 sesiones adelante para juzgarlos (los muy recientes no resuelven).
- **Estructura** y **Contexto IV** son señales de CONTEXTO (no por-flujo): necesitan un estudio aparte, no salen aquí.
- **Confirmación de Precio** ES esta medición (el outcome), no un predictor separado.
- Un backtest a gran escala (más tickers, ventana más larga, fuera de horario) refina esto.

_Generado por scripts/backtest.ts — no es consejo, es medición honesta contra lo que el precio hizo._
