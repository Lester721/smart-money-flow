# Chequeo de confianza — reporte PILOTO

**Qué mide:** por cada flujo histórico, ¿el precio **validó** su dirección (se movió a favor antes que en contra) en las siguientes 20 sesiones? Reusa la lógica exacta de Eva (`classifyFlow` + `evaluateFlow`).

**Muestra:** tickers AAPL, NVDA, QQQ, TSLA, SPY, META · ventana 60 días · premium ≥ $1.0M · **25 flujos resueltos** (con tiempo suficiente para juzgar).

## Línea base
- Hit rate global: **56%** (25 flujos). Un 50% = moneda al aire.

## Por señal de sub-agente (hit rate por banda)

| Señal | Banda | Hit rate | n |
|---|---|---|---|
| **Agresividad** | Compra al ask | 75% | 16 |
| | Venta al bid | 22% | 9 |
| | Al medio (mid) | — | 0 |
| **Inusualidad** | Score ≥ 7 (institucional) | 86% | 7 |
| | Score < 7 | 44% | 18 |
| **Convicción (delta)** | \|delta\| ≥ 0.60 (direccional) | 100% | 4 |
| | \|delta\| < 0.60 | 48% | 21 |
| **Tamaño** | ≥ $5M | 0% | 1 |
| | < $5M | 58% | 24 |

**Cómo leerlo:** si una banda "buena" (ask, inusualidad alta, delta alta, grande) tiene hit rate MAYOR que su banda opuesta, esa señal **sí tiene poder predictivo** en esta muestra. Si son parecidas, la señal no separa (aún).

## Caveats honestos
- Es un **PILOTO** (muestra chica por el rate-limit de la key compartida). Los números pueden moverse con más datos.
- Solo cuentan flujos con ≥20 sesiones adelante para juzgarlos (los muy recientes no resuelven).
- **Estructura** y **Contexto IV** son señales de CONTEXTO (no por-flujo): necesitan un estudio aparte, no salen aquí.
- **Confirmación de Precio** ES esta medición (el outcome), no un predictor separado.
- Un backtest a gran escala (más tickers, ventana más larga, fuera de horario) refina esto.

_Generado por scripts/backtest.ts — no es consejo, es medición honesta contra lo que el precio hizo._
