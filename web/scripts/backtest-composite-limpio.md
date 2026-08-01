# Chequeo de confianza v3 — COMPUESTO del scorecard (P&L real)

**Modelo:** comprar el contrato del flujo (calls y puts, long), sostener 10 sesiones, salida Black-Scholes. Compuesto ponderado por los pesos del scorecard: Agresividad 20 + Convicción 20 + Inusualidad 20 + Contexto IV 10 (proxy).

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · prima ≥ $1.0M · **1140 flujos resueltos**.

## Pesos alternativos: ¿qué ponderación separa mejor? (alto ≥7 vs bajo <5)
- **Ratio Victor entre los 4 (20:20:20:10)** — alto≥7: win 50% · media 1.9% · mediana 0% (n=340) · bajo<5: win 37% · media 5.8% · mediana 0% (n=151) · separación: -3.9 pts
- **Igual 1/1/1/1** — alto≥7: win 51% · media 2.3% · mediana 0% (n=328) · bajo<5: win 33% · media 3.4% · mediana 0% (n=233) · separación: -1.1 pts
- **IV-heavy (baja Inus)** — alto≥7: win 52% · media 2.4% · mediana 0% (n=328) · bajo<5: win 35% · media 2.8% · mediana 0% (n=323) · separación: -0.4 pts
- **Costo/riesgo (Conv+IV)** — alto≥7: win 53% · media 2% · mediana 0% (n=502) · bajo<5: win 36% · media 6.3% · mediana 0% (n=249) · separación: -4.3 pts
- **Sin Inusualidad** — alto≥7: win 49% · media 4.9% · mediana 0% (n=354) · bajo<5: win 34% · media 4.2% · mediana 0% (n=273) · separación: 0.7 pts
- **Solo Contexto IV** — alto≥7: win 54% · media 3% · mediana 0% (n=618) · bajo<5: win 39% · media 2% · mediana 0% (n=522) · separación: 1.0 pts
- **Solo Convicción** — alto≥7: win 49% · media 3.5% · mediana 0% (n=1009) · bajo<5: win 33% · media -4.9% · mediana 0% (n=131) · separación: 8.4 pts

**Separación = media(alto) − media(bajo). Más alta = esa ponderación distingue mejor ganadores de perdedores. NOTA: solo son 4 de las 6 categorías de Victor (faltan Estructura e Confirmación); el 'ratio Victor' es su proporción entre estos 4, no su ponderación real de 6.**

## Cada componente por separado (¿cuál manda?)
- Agresividad — alta: win 44% · media 2.8% · mediana 0% (n=354) | baja: win 48% · media 2.4% · mediana 0% (n=786)
- Convicción (spread) — alta: win 49% · media 3.5% · mediana 0% (n=1009) | baja: win 33% · media -4.9% · mediana 0% (n=131)
- Inusualidad — alta: win 58% · media 1.2% · mediana 0% (n=370) | baja: win 42% · media 3.2% · mediana 0% (n=770)
- Contexto IV (proxy) — alta: win 54% · media 3% · mediana 0% (n=618) | baja: win 39% · media 2% · mediana 0% (n=522)

## Caveats
- **Proxies por-flujo** de categorías que en la app son agregados por-ticker: aproximación, no idéntico al scorecard en vivo.
- **Estructura (GEX) NO entra** — necesita cadena histórica que Massive no da. Requiere forward-test.
- **Long-only, IV constante, horizonte fijo, sin stops.** El P&L de opciones long es asimétrico → mira win% y mediana, no solo la media.
- Tiers con n chico son ruido: exige n grande antes de confiar.
