# Chequeo de confianza v3 — COMPUESTO del scorecard (P&L real)

**Modelo:** comprar el contrato del flujo (calls y puts, long), sostener 10 sesiones, salida Black-Scholes. Compuesto ponderado por los pesos del scorecard: Agresividad 20 + Convicción 20 + Inusualidad 20 + Contexto IV 10 (proxy).

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · prima ≥ $1.0M · **639 flujos resueltos**.

## Score compuesto por tier (la pregunta central)
- **Compuesto ALTO (≥7)**: win 53% · media 5.9% · mediana 0% (n=162)
- Compuesto medio (5-7): win 49% · media 7% · mediana 0% (n=330)
- Compuesto bajo (<5): win 34% · media -4.5% · mediana -0.5% (n=147)

**Si el P&L sube monótono con el tier, el scorecard COMBINADO tiene poder — más que cualquier señal sola.**

## Cada componente por separado (¿cuál manda?)
- Agresividad — alta: win 43% · media 9.2% · mediana 0% (n=208) | baja: win 48% · media 1.6% · mediana 0% (n=431)
- Convicción (spread) — alta: win 51% · media 6.2% · mediana 0% (n=521) | baja: win 28% · media -5.3% · mediana -4.6% (n=118)
- Inusualidad — alta: win 54% · media -4.4% · mediana 0% (n=159) | baja: win 44% · media 6.9% · mediana 0% (n=480)
- Contexto IV (proxy) — alta: win 58% · media 14.6% · mediana 2.6% (n=254) | baja: win 39% · media -2.8% · mediana -0.2% (n=385)

## Caveats
- **Proxies por-flujo** de categorías que en la app son agregados por-ticker: aproximación, no idéntico al scorecard en vivo.
- **Estructura (GEX) NO entra** — necesita cadena histórica que Massive no da. Requiere forward-test.
- **Long-only, IV constante, horizonte fijo, sin stops.** El P&L de opciones long es asimétrico → mira win% y mediana, no solo la media.
- Tiers con n chico son ruido: exige n grande antes de confiar.
